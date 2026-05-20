import { getTodayKey } from '../shared/date';
import { normalizeHandle } from '../shared/handles';
import {
  getAccountPool,
  getCandidateAccounts,
  getDailyReviewDrafts,
  getInteractionLogs,
  getSearchTemplates,
  getSettings,
  saveAccountPool,
  saveCandidateAccounts,
  saveDailyReviewDrafts,
  saveSearchTemplates,
} from '../storage/storage';
import {
  getInfluenceBandScore,
  inferInfluenceBand,
  normalizeLegacyAccountCategory,
} from './account-taxonomy';
import { getContentFormatGroupLabel, getTodayContentFormatSummary } from './content-performance';
import {
  buildOverlayKeywordQuery,
  getReviewSuggestionSuffix,
  getSelectedOverlayDefinitions,
} from './overlay-guidance';
import { getFollowerSummary, listAccountPool, upsertAccountPoolItem } from './phase-six-data';
import type {
  CandidateAccount,
  CandidateAccountSource,
  ContentFormatGroup,
  DailyReviewDraft,
  SearchTemplate,
  SearchTemplateCategory,
} from '../storage/schema';
import { getOrCreateTodaySummary } from '../task-system/daily-records';

const MAX_CANDIDATE_ACCOUNTS = 500;
const MAX_DAILY_REVIEW_DRAFTS = 90;

export interface CandidateImportPayload {
  handle: string;
  displayName: string;
  followersCount: number | null;
  followingCount: number | null;
  verified: boolean;
  bio: string;
  source: CandidateAccountSource;
  capturedAt: string;
}

function buildId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}`;
}

function getPinnedPriorityScore(category: SearchTemplateCategory) {
  if (category === 'questions') {
    return 5;
  }

  if (category === 'creator' || category === 'viral') {
    return 4;
  }

  if (category === 'niche' || category === 'recent') {
    return 3;
  }

  return 2;
}

function sortSearchTemplates(searchTemplates: SearchTemplate[]) {
  return [...searchTemplates].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }

    const categoryScoreDiff =
      getPinnedPriorityScore(right.category) - getPinnedPriorityScore(left.category);
    if (categoryScoreDiff !== 0) {
      return categoryScoreDiff;
    }

    return left.name.localeCompare(right.name);
  });
}

function inferSuggestedCategory(
  candidate: CandidateImportPayload,
  currentFollowersCount: number | null,
  overlayKeywords: string[],
) {
  const bio = candidate.bio.toLowerCase();
  const followersCount = candidate.followersCount ?? 0;
  const peerKeywordMatched = [
    ...overlayKeywords,
    'ai',
    '自动化',
    '智能体',
    '工作流',
    '独立开发',
    '产品',
    '增长',
    '创业',
    '开发者',
    '创作者',
    '工具',
    '效率',
    '用户反馈',
    '出海',
    'saas',
  ].find((keyword) => bio.includes(keyword.toLowerCase()));
  const sourceKeywordMatched = [
    '研究',
    '资讯',
    '新闻',
    '观察',
    '趋势',
    '拆解',
    '复盘',
    '评论',
    '投研',
    '媒体',
    'newsletter',
    'writer',
    'analyst',
    'research',
  ].find((keyword) => bio.includes(keyword.toLowerCase()));
  const benchmarkKeywordMatched = [
    '创始人',
    'founder',
    '投资人',
    'ceo',
    '创业者',
    '增长负责人',
    'product lead',
  ].find((keyword) => bio.includes(keyword.toLowerCase()));

  if (sourceKeywordMatched) {
    return {
      suggestedCategory: 'benchmark' as const,
      suggestionReason: `bio 命中了 ${sourceKeywordMatched} 等信息源信号，更适合作为持续观察和对标学习对象。`,
      confidence: 0.74,
    };
  }

  if (peerKeywordMatched) {
    return {
      suggestedCategory: 'peer' as const,
      suggestionReason: `bio 命中了 ${peerKeywordMatched} 等赛道关键词，更像同生态创作者。`,
      confidence: overlayKeywords.includes(peerKeywordMatched) ? 0.84 : 0.76,
    };
  }

  if (
    benchmarkKeywordMatched ||
    candidate.verified ||
    followersCount >= 20_000 ||
    (typeof currentFollowersCount === 'number' &&
      currentFollowersCount >= 500 &&
      followersCount >= 5_000 &&
      followersCount >= currentFollowersCount * 5)
  ) {
    return {
      suggestedCategory: 'benchmark' as const,
      suggestionReason: benchmarkKeywordMatched
        ? `bio 更像 ${benchmarkKeywordMatched} 这类学习对象，适合作为对标学习。`
        : '量级明显更高或已认证，更适合作为对标学习对象。',
      confidence: benchmarkKeywordMatched || candidate.verified ? 0.72 : 0.62,
    };
  }

  return {
    suggestedCategory: null,
    suggestionReason: '暂时没有足够信号，建议先保留在待处理里人工判断。',
    confidence: 0.42,
  };
}

function sortCandidateAccounts(candidateAccounts: CandidateAccount[]) {
  return [...candidateAccounts].sort((left, right) => {
    if (left.importedToAccountPool !== right.importedToAccountPool) {
      return left.importedToAccountPool ? 1 : -1;
    }

    if (left.ignored !== right.ignored) {
      return left.ignored ? 1 : -1;
    }

    if (left.confidence !== right.confidence) {
      return right.confidence - left.confidence;
    }

    if (getInfluenceBandScore(left.influenceBand) !== getInfluenceBandScore(right.influenceBand)) {
      return getInfluenceBandScore(right.influenceBand) - getInfluenceBandScore(left.influenceBand);
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function normalizeCandidateAccount(candidate: CandidateAccount) {
  return {
    ...candidate,
    suggestedCategory: normalizeLegacyAccountCategory(candidate.suggestedCategory) ?? null,
    influenceBand: candidate.influenceBand ?? inferInfluenceBand(candidate.followersCount ?? null),
  } satisfies CandidateAccount;
}

export async function listSearchTemplates() {
  const searchTemplates = await getSearchTemplates();
  return sortSearchTemplates(searchTemplates);
}

function buildSystemSearchTemplatesForSettings(settings: Awaited<ReturnType<typeof getSettings>>) {
  const keywordQuery = buildOverlayKeywordQuery(settings);
  const overlayNames = getSelectedOverlayDefinitions(settings).map((overlay) => overlay.name);
  const overlaySummary = overlayNames.length > 0 ? overlayNames.join(' / ') : '当前人设';

  const now = new Date().toISOString();

  return [
    {
      id: 'template-questions-zh',
      name: '中文问题帖',
      description: `围绕 ${overlaySummary} 找中文提问帖、求助帖和求推荐帖，优先切高质量回复。`,
      query: `${keywordQuery} (怎么做 OR 请教 OR 求推荐 OR 有没有 OR 为什么 OR ? OR ？) lang:zh -filter:replies`,
      category: 'questions' as const,
      pinned: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'template-viral-zh-builders',
      name: '中文爆款复盘素材',
      description: `围绕 ${overlaySummary} 找已有互动的中文内容，用来拆结构、拆表达和拆角度。`,
      query: `${keywordQuery} (复盘 OR 经验 OR 教训 OR 增长 OR 踩坑) min_faves:20 lang:zh -filter:replies`,
      category: 'viral' as const,
      pinned: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'template-creator-recent-zh',
      name: '中文创作者最近在聊什么',
      description: `看 ${overlaySummary} 相关创作者最近在发什么，适合跟进评论、引用和拆解。`,
      query: `${keywordQuery} (进展 OR 发布 OR 复盘 OR 更新 OR 想法) min_faves:3 lang:zh -filter:replies`,
      category: 'creator' as const,
      pinned: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'template-latest-24h-zh',
      name: '中文实时新帖入口',
      description: '直接看实时的新内容流，优先参与刚发出来不久的帖子。',
      query: `${keywordQuery} lang:zh -filter:replies`,
      category: 'recent' as const,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'template-low-follower-discovery-zh',
      name: '中文低粉优质账号发现',
      description: '找量级接近但内容不错的中文创作者，方便建立长期关系。',
      query: `${keywordQuery} (构建 OR 进展 OR 复盘 OR 用户反馈) min_faves:3 lang:zh -filter:replies`,
      category: 'niche' as const,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'template-topic-source-zh',
      name: '中文选题来源',
      description: `围绕 ${overlaySummary} 找问题、案例、趋势和争议点，方便收集后续内容选题。`,
      query: `${keywordQuery} (趋势 OR 观察 OR 拆解 OR 争议 OR 教训 OR 案例) lang:zh -filter:replies`,
      category: 'custom' as const,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    },
  ] satisfies SearchTemplate[];
}

export async function syncSystemSearchTemplatesForSettings(
  settings: Awaited<ReturnType<typeof getSettings>>,
) {
  const templates = await getSearchTemplates();
  const generatedTemplates = buildSystemSearchTemplatesForSettings(settings);
  const generatedTemplateMap = new Map(
    generatedTemplates.map((template) => [template.id, template]),
  );

  const nextTemplates = sortSearchTemplates(
    templates.map((template) => {
      const generated = generatedTemplateMap.get(template.id);
      if (!generated) {
        return template;
      }

      return {
        ...template,
        name: generated.name,
        description: generated.description,
        query: generated.query,
        category: generated.category,
        pinned: template.pinned,
        updatedAt: new Date().toISOString(),
      };
    }),
  );

  const knownIds = new Set(nextTemplates.map((template) => template.id));
  const missingSystemTemplates = generatedTemplates.filter(
    (template) => !knownIds.has(template.id),
  );
  const mergedTemplates = sortSearchTemplates([...nextTemplates, ...missingSystemTemplates]);
  await saveSearchTemplates(mergedTemplates);
  return mergedTemplates;
}

export async function upsertSearchTemplate(input: {
  id?: string;
  name: string;
  description: string;
  query: string;
  category: SearchTemplateCategory;
  pinned: boolean;
}) {
  const templates = await getSearchTemplates();
  const now = new Date().toISOString();
  const existingTemplate = input.id ? templates.find((item) => item.id === input.id) : undefined;

  const nextTemplate: SearchTemplate = {
    id: existingTemplate?.id ?? buildId('search-template'),
    name: input.name.trim(),
    description: input.description.trim(),
    query: input.query.trim(),
    category: input.category,
    pinned: input.pinned,
    createdAt: existingTemplate?.createdAt ?? now,
    updatedAt: now,
  };

  const nextTemplates = sortSearchTemplates([
    ...templates.filter((item) => item.id !== nextTemplate.id),
    nextTemplate,
  ]);
  await saveSearchTemplates(nextTemplates);

  return nextTemplate;
}

export async function deleteSearchTemplate(templateId: string) {
  const templates = await getSearchTemplates();
  const nextTemplates = templates.filter((item) => item.id !== templateId);
  await saveSearchTemplates(nextTemplates);
}

export async function getPinnedSearchTemplates(limit = 3) {
  const templates = await listSearchTemplates();
  return templates.filter((template) => template.pinned).slice(0, limit);
}

export function buildXSearchUrl(query: string) {
  const encodedQuery = encodeURIComponent(query);
  return `https://x.com/search?q=${encodedQuery}&src=typed_query&f=live`;
}

export async function importCandidateAccounts(items: CandidateImportPayload[]) {
  if (items.length === 0) {
    return [];
  }

  const [candidateAccounts, accountPool, followerSummary, settings] = await Promise.all([
    getCandidateAccounts(),
    getAccountPool(),
    getFollowerSummary(),
    getSettings(),
  ]);
  const overlayKeywords = getSelectedOverlayDefinitions(settings)
    .flatMap((overlay) => overlay.keywords)
    .map((keyword) => keyword.toLowerCase());
  const now = new Date().toISOString();
  const importedHandles = new Set(accountPool.map((item) => item.handle));
  const nextMap = new Map(candidateAccounts.map((item) => [item.handle, item]));

  for (const item of items) {
    const normalizedHandle = normalizeHandle(item.handle);
    if (!normalizedHandle || normalizedHandle === normalizeHandle(settings.accountHandle)) {
      continue;
    }

    const suggested = inferSuggestedCategory(item, followerSummary.todayCount, overlayKeywords);
    const existing = nextMap.get(normalizedHandle);

    nextMap.set(normalizedHandle, {
      id: existing?.id ?? buildId('candidate'),
      handle: normalizedHandle,
      displayName: item.displayName.trim(),
      followersCount: item.followersCount,
      followingCount: item.followingCount,
      verified: item.verified,
      bio: item.bio.trim(),
      source: item.source,
      suggestedCategory: suggested.suggestedCategory,
      influenceBand: inferInfluenceBand(item.followersCount),
      suggestionReason: suggested.suggestionReason,
      confidence: suggested.confidence,
      ignored: existing?.ignored ?? false,
      importedToAccountPool: importedHandles.has(normalizedHandle),
      capturedAt: existing?.capturedAt ?? item.capturedAt,
      updatedAt: now,
    } satisfies CandidateAccount);
  }

  const nextCandidates = sortCandidateAccounts([...nextMap.values()]).slice(
    0,
    MAX_CANDIDATE_ACCOUNTS,
  );
  await saveCandidateAccounts(nextCandidates);
  return nextCandidates;
}

export async function listCandidateAccounts() {
  const candidateAccounts = await getCandidateAccounts();
  return sortCandidateAccounts(candidateAccounts.map((item) => normalizeCandidateAccount(item)));
}

export async function ignoreCandidateAccount(candidateId: string) {
  const candidateAccounts = await getCandidateAccounts();
  const nextCandidates = candidateAccounts.map((item) =>
    item.id === candidateId
      ? {
          ...item,
          ignored: true,
          updatedAt: new Date().toISOString(),
        }
      : item,
  );
  await saveCandidateAccounts(nextCandidates);
}

export async function restoreCandidateAccount(candidateId: string) {
  const candidateAccounts = await getCandidateAccounts();
  const nextCandidates = candidateAccounts.map((item) =>
    item.id === candidateId
      ? {
          ...item,
          ignored: false,
          importedToAccountPool: false,
          updatedAt: new Date().toISOString(),
        }
      : item,
  );
  await saveCandidateAccounts(nextCandidates);
}

export async function updateCandidateAccountCategory(
  candidateId: string,
  nextCategory: CandidateAccount['suggestedCategory'],
) {
  const [candidateAccounts, accountPool] = await Promise.all([
    getCandidateAccounts(),
    listAccountPool(),
  ]);
  const matchedCandidate = candidateAccounts.find((item) => item.id === candidateId);
  if (!matchedCandidate) {
    return null;
  }

  const now = new Date().toISOString();
  const nextCandidates = candidateAccounts.map((item) =>
    item.id === candidateId
      ? {
          ...item,
          suggestedCategory: nextCategory,
          updatedAt: now,
        }
      : item,
  );
  await saveCandidateAccounts(nextCandidates);

  if (matchedCandidate.importedToAccountPool) {
    const matchedAccount = accountPool.find((item) => item.handle === matchedCandidate.handle);
    if (matchedAccount) {
      await upsertAccountPoolItem({
        id: matchedAccount.id,
        handle: matchedAccount.handle,
        displayName: matchedAccount.displayName,
        category: nextCategory ?? matchedAccount.category,
        influenceBand: matchedAccount.influenceBand,
        priority: matchedAccount.priority,
        notes: matchedAccount.notes,
      });
    }
  }

  return nextCategory;
}

async function syncCandidateStateForHandle(
  handle: string,
  updates: Partial<
    Pick<CandidateAccount, 'ignored' | 'importedToAccountPool' | 'suggestedCategory'>
  >,
  fallback?: Partial<CandidateAccount>,
) {
  const candidateAccounts = await getCandidateAccounts();
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) {
    return;
  }

  const now = new Date().toISOString();
  const existing = candidateAccounts.find((item) => item.handle === normalizedHandle);
  let nextCandidates = candidateAccounts;

  if (existing) {
    nextCandidates = candidateAccounts.map((item) =>
      item.handle === normalizedHandle
        ? {
            ...item,
            ...updates,
            updatedAt: now,
          }
        : item,
    );
  } else if (fallback) {
    nextCandidates = [
      ...candidateAccounts,
      {
        id: buildId('candidate'),
        handle: normalizedHandle,
        displayName: fallback.displayName ?? `@${normalizedHandle}`,
        followersCount: fallback.followersCount ?? null,
        followingCount: fallback.followingCount ?? null,
        verified: fallback.verified ?? false,
        bio: fallback.bio ?? '',
        source: fallback.source ?? 'from_following',
        suggestedCategory: fallback.suggestedCategory ?? null,
        influenceBand: fallback.influenceBand ?? null,
        suggestionReason: fallback.suggestionReason ?? '从账号池回退到待处理状态。',
        confidence: fallback.confidence ?? 0.4,
        ignored: updates.ignored ?? false,
        importedToAccountPool: updates.importedToAccountPool ?? false,
        capturedAt: fallback.capturedAt ?? now,
        updatedAt: now,
      } satisfies CandidateAccount,
    ];
  }

  await saveCandidateAccounts(
    sortCandidateAccounts(nextCandidates.map((item) => normalizeCandidateAccount(item))),
  );
}

export async function importCandidateToAccountPool(
  candidateIds: string[],
  overrideCategory?: CandidateAccount['suggestedCategory'],
) {
  const candidateAccounts = await getCandidateAccounts();
  const selectedCandidates = candidateAccounts.filter(
    (item) => candidateIds.includes(item.id) && !item.ignored,
  );

  for (const candidate of selectedCandidates) {
    const resolvedCategory = overrideCategory ?? candidate.suggestedCategory ?? 'peer';
    await upsertAccountPoolItem({
      handle: candidate.handle,
      displayName: candidate.displayName,
      category: resolvedCategory,
      influenceBand: candidate.influenceBand,
      bio: candidate.bio,
      priority: resolvedCategory === 'benchmark' ? 'high' : 'medium',
      notes: candidate.suggestionReason,
    });
  }

  const nextCandidates = candidateAccounts.map((item) =>
    candidateIds.includes(item.id)
      ? {
          ...item,
          importedToAccountPool: true,
          updatedAt: new Date().toISOString(),
        }
      : item,
  );
  await saveCandidateAccounts(nextCandidates);
  return nextCandidates;
}

export async function moveAccountPoolItemToCandidateState(
  accountId: string,
  nextStatus: 'pending' | 'ignored',
) {
  const accountPool = await listAccountPool();
  const matchedAccount = accountPool.find((item) => item.id === accountId);
  if (!matchedAccount) {
    return;
  }

  const nextAccountPool = accountPool.filter((item) => item.id !== accountId);
  await saveAccountPool(nextAccountPool);
  await syncCandidateStateForHandle(
    matchedAccount.handle,
    {
      ignored: nextStatus === 'ignored',
      importedToAccountPool: false,
      suggestedCategory: matchedAccount.category,
    },
    {
      displayName: matchedAccount.displayName,
      followersCount: null,
      followingCount: null,
      verified: false,
      bio: matchedAccount.bio ?? '',
      source: 'from_following',
      influenceBand: matchedAccount.influenceBand,
      suggestedCategory: matchedAccount.category,
      suggestionReason:
        nextStatus === 'ignored'
          ? '从账号池移出后已标记为忽略。'
          : '从账号池移回待处理，方便重新判断角色。',
      confidence: 0.5,
    },
  );
}

function pickBestAction(taskTexts: string[]) {
  if (taskTexts.length === 0) {
    return '今天还没有明显的最佳动作';
  }

  return taskTexts[0] ?? '今天还没有明显的最佳动作';
}

function getShortOutputCount(shortContentCount: number, threadCount: number) {
  return shortContentCount + threadCount;
}

interface ReviewTaskCountLike {
  taskId: string;
  current: number;
}

interface ReviewInteractionLogLike {
  date: string;
  actionType: 'original' | 'reply' | 'quote';
}

function getTaskCurrentValue(tasks: ReviewTaskCountLike[], taskId: string) {
  const matchedTask = tasks.find((task) => task.taskId === taskId);
  return matchedTask ? matchedTask.current : null;
}

function resolveReviewDisplayContentCounts(
  tasks: ReviewTaskCountLike[],
  fallback: {
    shortCount: number;
    threadCount: number;
    longFormCount: number;
  },
) {
  const shortContentTaskCount = getTaskCurrentValue(tasks, 'shortContentPosts');
  const shortPostTaskCount = getTaskCurrentValue(tasks, 'shortPosts');
  const threadTaskCount = getTaskCurrentValue(tasks, 'threadPosts');
  const longFormTaskCount = getTaskCurrentValue(tasks, 'longFormPosts');

  const shortOutputCount =
    typeof shortContentTaskCount === 'number'
      ? shortContentTaskCount
      : typeof shortPostTaskCount === 'number' || typeof threadTaskCount === 'number'
        ? (shortPostTaskCount ?? 0) + (threadTaskCount ?? 0)
        : getShortOutputCount(fallback.shortCount, fallback.threadCount);

  const longFormCount =
    typeof longFormTaskCount === 'number' ? longFormTaskCount : fallback.longFormCount;

  return {
    shortOutputCount,
    longFormCount,
  };
}

function resolveReviewDisplayInteractionCount(
  tasks: ReviewTaskCountLike[],
  interactionLogs: ReviewInteractionLogLike[],
  date: string,
) {
  const replyTaskCount = getTaskCurrentValue(tasks, 'highQualityReplies');
  const quoteTaskCount = getTaskCurrentValue(tasks, 'quotePosts');

  if (typeof replyTaskCount === 'number' || typeof quoteTaskCount === 'number') {
    return (replyTaskCount ?? 0) + (quoteTaskCount ?? 0);
  }

  return interactionLogs.filter(
    (log) => log.date === date && (log.actionType === 'reply' || log.actionType === 'quote'),
  ).length;
}

function buildReviewSummary(input: {
  completionPercent: number;
  followersDelta: number | null;
  bestAction: string;
  interactionCount: number;
  remainingTaskCount: number;
  shortOutputCount: number;
  longFormCount: number;
}) {
  const followerLine =
    typeof input.followersDelta === 'number'
      ? input.followersDelta > 0
        ? `净涨粉 ${input.followersDelta}`
        : input.followersDelta < 0
          ? `净掉粉 ${Math.abs(input.followersDelta)}`
          : '粉丝数持平'
      : '今天还没有粉丝对比';

  const interactionLine =
    input.interactionCount > 0 ? `今天已记录 ${input.interactionCount} 次真实互动。` : '';

  return `今天完成率 ${input.completionPercent}%，${followerLine}。内容产出：短内容 ${input.shortOutputCount}、长文 ${input.longFormCount}。最有效的是 ${input.bestAction}。${interactionLine}还剩 ${input.remainingTaskCount} 项没完成。`.trim();
}

function buildNextActionSuggestion(remainingTaskCount: number, biggestGapLabel: string | null) {
  if (!biggestGapLabel) {
    return '明天继续保持当前节奏，重点复盘哪些动作最有效。';
  }

  if (remainingTaskCount <= 1) {
    return `明天优先继续稳定完成「${biggestGapLabel}」，把执行节奏固化下来。`;
  }

  return `明天先补齐「${biggestGapLabel}」，不要把任务平均摊薄。`;
}

function buildReviewTweetDraft(input: {
  completionPercent: number;
  followersDelta: number | null;
  shortOutputCount: number;
  longFormCount: number;
  bestAction: string;
  interactionCount: number;
  suggestedNextAction: string;
}) {
  const followerLine =
    typeof input.followersDelta === 'number'
      ? input.followersDelta > 0
        ? `粉丝净增 ${input.followersDelta}`
        : input.followersDelta < 0
          ? `粉丝净掉 ${Math.abs(input.followersDelta)}`
          : '粉丝持平'
      : '粉丝还没有形成对比';

  return [
    `今天打卡 ${input.completionPercent}%，${followerLine}。`,
    `内容：短内容 ${input.shortOutputCount}，长文 ${input.longFormCount}。`,
    input.interactionCount > 0
      ? `今天最有效的是 ${input.bestAction}，一共完成了 ${input.interactionCount} 次真实互动。`
      : `今天最有效的是 ${input.bestAction}。`,
    input.suggestedNextAction,
  ].join('\n');
}

function isSameDailyReviewDraft(
  left: DailyReviewDraft | undefined,
  right: Omit<DailyReviewDraft, 'updatedAt'>,
) {
  if (!left) {
    return false;
  }

  return (
    left.date === right.date &&
    left.completionRate === right.completionRate &&
    left.followersDelta === right.followersDelta &&
    left.bestAction === right.bestAction &&
    left.bestPostUrl === right.bestPostUrl &&
    left.bestReplyUrl === right.bestReplyUrl &&
    left.bestPostFormatGroup === right.bestPostFormatGroup &&
    left.shortContentCount === right.shortContentCount &&
    left.threadCount === right.threadCount &&
    left.longFormCount === right.longFormCount &&
    left.summary === right.summary &&
    left.suggestedNextAction === right.suggestedNextAction &&
    left.xDraft === right.xDraft &&
    left.createdAt === right.createdAt
  );
}

export async function getOrCreateDailyReviewDraft(date = getTodayKey()) {
  const [dailyReviewDrafts, summary, followerSummary, interactionLogs, contentSummary, settings] =
    await Promise.all([
      getDailyReviewDrafts(),
      getOrCreateTodaySummary(),
      getFollowerSummary(),
      getInteractionLogs(),
      getTodayContentFormatSummary(date),
      getSettings(),
    ]);
  const existingDraft = dailyReviewDrafts.find((item) => item.date === date);
  const todayRecord = summary.todayRecord;
  const incompleteTasks = todayRecord.tasks
    .filter((task) => task.current < task.target)
    .sort((left, right) => right.target - right.current - (left.target - left.current));
  const completedInteractions = resolveReviewDisplayInteractionCount(
    todayRecord.tasks,
    interactionLogs,
    date,
  );
  const reviewDisplayContentCounts = resolveReviewDisplayContentCounts(
    todayRecord.tasks,
    contentSummary,
  );
  const bestAction = pickBestAction(
    todayRecord.tasks
      .filter((task) => task.current > 0)
      .sort(
        (left, right) =>
          right.current / Math.max(right.target, 1) - left.current / Math.max(left.target, 1),
      )
      .map((task) => task.label),
  );

  const completionPercent = Math.round(todayRecord.completionRate * 100);
  const summaryText = buildReviewSummary({
    completionPercent,
    followersDelta: followerSummary.deltaFromPrevious,
    bestAction,
    interactionCount: completedInteractions,
    remainingTaskCount: incompleteTasks.length,
    shortOutputCount: reviewDisplayContentCounts.shortOutputCount,
    longFormCount: reviewDisplayContentCounts.longFormCount,
  });
  const suggestedNextActionBase = buildNextActionSuggestion(
    incompleteTasks.length,
    incompleteTasks[0]?.label ?? null,
  );
  const reviewSuffix = getReviewSuggestionSuffix(settings);
  const suggestedNextAction = reviewSuffix
    ? `${suggestedNextActionBase} ${reviewSuffix}`
    : suggestedNextActionBase;
  const now = new Date().toISOString();
  const xDraft = buildReviewTweetDraft({
    completionPercent,
    followersDelta: followerSummary.deltaFromPrevious,
    shortOutputCount: reviewDisplayContentCounts.shortOutputCount,
    longFormCount: reviewDisplayContentCounts.longFormCount,
    bestAction,
    interactionCount: completedInteractions,
    suggestedNextAction,
  });

  const draftWithoutUpdatedAt: Omit<DailyReviewDraft, 'updatedAt'> = {
    date,
    completionRate: todayRecord.completionRate,
    followersDelta: followerSummary.deltaFromPrevious,
    bestAction,
    bestPostUrl: existingDraft?.bestPostUrl ?? '',
    bestReplyUrl: existingDraft?.bestReplyUrl ?? '',
    bestPostFormatGroup: existingDraft?.bestPostFormatGroup ?? null,
    shortContentCount: reviewDisplayContentCounts.shortOutputCount,
    threadCount: 0,
    longFormCount: reviewDisplayContentCounts.longFormCount,
    summary: summaryText,
    suggestedNextAction,
    xDraft,
    createdAt: existingDraft?.createdAt ?? now,
  };
  const shouldPersist = !isSameDailyReviewDraft(existingDraft, draftWithoutUpdatedAt);
  const nextDraft: DailyReviewDraft = {
    ...draftWithoutUpdatedAt,
    updatedAt: shouldPersist ? now : (existingDraft?.updatedAt ?? now),
  };

  if (shouldPersist) {
    const nextDrafts = [...dailyReviewDrafts.filter((item) => item.date !== date), nextDraft]
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(-MAX_DAILY_REVIEW_DRAFTS);
    await saveDailyReviewDrafts(nextDrafts);
  }

  return nextDraft;
}

export async function updateDailyReviewDraftUrls(input: {
  date?: string;
  bestPostUrl: string;
  bestReplyUrl: string;
  bestPostFormatGroup?: ContentFormatGroup | null;
}) {
  const draft = await getOrCreateDailyReviewDraft(input.date ?? getTodayKey());
  const nextDraft: DailyReviewDraft = {
    ...draft,
    bestPostUrl: input.bestPostUrl.trim(),
    bestReplyUrl: input.bestReplyUrl.trim(),
    bestPostFormatGroup: input.bestPostFormatGroup ?? draft.bestPostFormatGroup,
    updatedAt: new Date().toISOString(),
  };
  const drafts = await getDailyReviewDrafts();
  const hasExistingDraft = drafts.some((item) => item.date === nextDraft.date);
  const nextDrafts = hasExistingDraft
    ? drafts.map((item) => (item.date === nextDraft.date ? nextDraft : item))
    : [...drafts, nextDraft]
        .sort((left, right) => left.date.localeCompare(right.date))
        .slice(-MAX_DAILY_REVIEW_DRAFTS);
  await saveDailyReviewDrafts(nextDrafts);
  return nextDraft;
}

export function getContentFormatGroupOptions() {
  return [
    { value: 'short' as const, label: getContentFormatGroupLabel('short') },
    { value: 'thread' as const, label: getContentFormatGroupLabel('thread') },
    { value: 'long_form' as const, label: getContentFormatGroupLabel('long_form') },
  ];
}
