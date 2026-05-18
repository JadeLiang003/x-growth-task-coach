import { getTodayKey } from '../shared/date';
import { normalizeHandle } from '../shared/handles';
import {
  getAccountCategoryLabel,
  getInfluenceBandLabel,
  getInfluenceBandScore,
  isInfluenceBandAtLeast,
  normalizeLegacyAccountCategory,
} from './account-taxonomy';
import {
  getAccountPool,
  getFollowerSnapshots,
  getInteractionLogs,
  getSettings,
  saveAccountPool,
  saveFollowerSnapshots,
  saveInteractionLogs,
} from '../storage/storage';
import type {
  AccountInfluenceBand,
  AccountPoolCategory,
  AccountPoolItem,
  AccountPoolPriority,
  FollowerSnapshot,
  FollowerSnapshotSource,
  InteractionLog,
} from '../storage/schema';
import { updateTodayTaskProgress } from '../task-system/daily-records';

const MAX_FOLLOWER_SNAPSHOTS = 180;
const MAX_INTERACTION_LOGS = 1_000;

const priorityScoreMap: Record<AccountPoolPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const stageCategoryWeights: Record<string, Record<AccountPoolCategory, number>> = {
  setup_foundation: {
    benchmark: 3,
    peer: 2,
  },
  cold_start_0_100: {
    benchmark: 4,
    peer: 4,
  },
  growth_100_1000: {
    peer: 4,
    benchmark: 3,
  },
  scale_1000_5000: {
    peer: 4,
    benchmark: 3,
  },
};

export interface FollowerSummary {
  todayCount: number | null;
  deltaFromPrevious: number | null;
  latestCapturedAt: string | null;
  latestSource: FollowerSnapshotSource | null;
  trackedHandle: string | null;
}

export interface FollowerTrendPoint {
  date: string;
  followersCount: number;
}

export interface RecommendedAccount extends AccountPoolItem {
  recommendationScore: number;
  recommendedReason: string;
}

export interface UpsertAccountPoolInput {
  id?: string;
  handle: string;
  displayName: string;
  category: AccountPoolCategory;
  influenceBand?: AccountInfluenceBand | null;
  bio?: string;
  priority: AccountPoolPriority;
  notes: string;
}

function normalizeAccountPoolItem(item: AccountPoolItem) {
  return {
    ...item,
    category: normalizeLegacyAccountCategory(item.category) ?? 'peer',
    influenceBand: item.influenceBand ?? null,
    bio: item.bio ?? '',
  } satisfies AccountPoolItem;
}

function sortFollowerSnapshots(snapshots: FollowerSnapshot[]) {
  return [...snapshots].sort((left, right) => {
    if (left.date === right.date) {
      return left.capturedAt.localeCompare(right.capturedAt);
    }
    return left.date.localeCompare(right.date);
  });
}

function calculateFollowerDelta(
  snapshots: FollowerSnapshot[],
  currentDate: string,
  currentCount: number,
  handle: string,
) {
  const previousSnapshot = [...snapshots]
    .filter((snapshot) => snapshot.handle === handle && snapshot.date < currentDate)
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) || right.capturedAt.localeCompare(left.capturedAt),
    )[0];

  if (!previousSnapshot) {
    return null;
  }

  return currentCount - previousSnapshot.followersCount;
}

function clampFollowerSnapshots(snapshots: FollowerSnapshot[]) {
  return sortFollowerSnapshots(snapshots).slice(-MAX_FOLLOWER_SNAPSHOTS);
}

function buildAccountPoolId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `account-${Date.now()}`;
}

function buildInteractionLogId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `interaction-${Date.now()}`;
}

function summarizeRecommendationReason(
  category: AccountPoolCategory,
  influenceBand: AccountInfluenceBand | null,
  priority: AccountPoolPriority,
  lastInteractedAt: string | null,
) {
  const priorityLabel =
    priority === 'high' ? '高优先级' : priority === 'medium' ? '标准优先级' : '低优先级';
  const categoryLabel = getAccountCategoryLabel(category);
  const influenceLabel = getInfluenceBandLabel(influenceBand);

  if (!lastInteractedAt) {
    return `${categoryLabel} · ${influenceLabel} · ${priorityLabel}，最近还没有互动记录`;
  }

  const lastDate = new Date(lastInteractedAt);
  const daysAgo = Math.max(
    0,
    Math.floor((Date.now() - lastDate.getTime()) / (24 * 60 * 60 * 1000)),
  );

  if (daysAgo >= 7) {
    return `${categoryLabel} · ${influenceLabel} · ${priorityLabel}，${daysAgo} 天没有互动，适合重新触达`;
  }

  return `${categoryLabel} · ${influenceLabel} · ${priorityLabel}，最近 ${daysAgo} 天内已互动过，保持跟进`;
}

function getCategoryWeight(stageId: string, category: AccountPoolCategory) {
  return stageCategoryWeights[stageId]?.[category] ?? 1;
}

function calculateRecommendationScore(stageId: string, item: AccountPoolItem) {
  const lastInteractedBonus = item.lastInteractedAt
    ? Math.min(
        4,
        Math.floor(
          (Date.now() - new Date(item.lastInteractedAt).getTime()) / (24 * 60 * 60 * 1000),
        ),
      )
    : 5;

  return (
    getCategoryWeight(stageId, item.category) * 2 +
    priorityScoreMap[item.priority] * 2 +
    getInfluenceBandScore(item.influenceBand) +
    lastInteractedBonus
  );
}

function sortAccountPool(items: AccountPoolItem[]) {
  return [...items]
    .map((item) => normalizeAccountPoolItem(item))
    .sort((left, right) => left.handle.localeCompare(right.handle));
}

export async function upsertFollowerSnapshot(input: {
  handle: string;
  followersCount: number;
  source: FollowerSnapshotSource;
  capturedAt?: string;
  path?: string | null;
}) {
  const normalizedHandle = normalizeHandle(input.handle);
  if (!normalizedHandle || input.followersCount < 0) {
    throw new Error('粉丝快照参数无效');
  }

  const snapshots = await getFollowerSnapshots();
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const date = capturedAt.slice(0, 10);
  const followersDelta = calculateFollowerDelta(
    snapshots,
    date,
    input.followersCount,
    normalizedHandle,
  );

  const nextSnapshot: FollowerSnapshot = {
    date,
    handle: normalizedHandle,
    followersCount: input.followersCount,
    followersDelta,
    source: input.source,
    capturedAt,
    path: input.path ?? null,
  };

  const remainingSnapshots = snapshots.filter(
    (snapshot) => !(snapshot.handle === normalizedHandle && snapshot.date === date),
  );
  const nextSnapshots = clampFollowerSnapshots([...remainingSnapshots, nextSnapshot]);
  await saveFollowerSnapshots(nextSnapshots);

  return nextSnapshot;
}

export async function getFollowerSummary() {
  const [snapshots, settings] = await Promise.all([getFollowerSnapshots(), getSettings()]);
  const trackedHandle = normalizeHandle(settings.accountHandle);
  if (!trackedHandle) {
    return {
      todayCount: null,
      deltaFromPrevious: null,
      latestCapturedAt: null,
      latestSource: null,
      trackedHandle: null,
    } satisfies FollowerSummary;
  }

  const handleSnapshots = sortFollowerSnapshots(
    snapshots.filter((snapshot) => snapshot.handle === trackedHandle),
  );
  const latestSnapshot = handleSnapshots[handleSnapshots.length - 1];

  return {
    todayCount: latestSnapshot?.followersCount ?? null,
    deltaFromPrevious: latestSnapshot?.followersDelta ?? null,
    latestCapturedAt: latestSnapshot?.capturedAt ?? null,
    latestSource: latestSnapshot?.source ?? null,
    trackedHandle,
  } satisfies FollowerSummary;
}

export async function getFollowerTrendSeries(limit = 30) {
  const [snapshots, settings] = await Promise.all([getFollowerSnapshots(), getSettings()]);
  const trackedHandle = normalizeHandle(settings.accountHandle);
  if (!trackedHandle) {
    return [] as FollowerTrendPoint[];
  }

  const latestSnapshotByDate = new Map<string, FollowerSnapshot>();
  snapshots
    .filter((snapshot) => snapshot.handle === trackedHandle)
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.capturedAt.localeCompare(right.capturedAt),
    )
    .forEach((snapshot) => {
      const existing = latestSnapshotByDate.get(snapshot.date);
      if (!existing || existing.capturedAt <= snapshot.capturedAt) {
        latestSnapshotByDate.set(snapshot.date, snapshot);
      }
    });

  return Array.from(latestSnapshotByDate.values())
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.capturedAt.localeCompare(right.capturedAt),
    )
    .slice(-limit)
    .map((snapshot) => ({
      date: snapshot.date,
      followersCount: snapshot.followersCount,
    }));
}

export async function listAccountPool() {
  const accountPool = await getAccountPool();
  return sortAccountPool(accountPool);
}

export async function upsertAccountPoolItem(input: UpsertAccountPoolInput) {
  const normalizedHandle = normalizeHandle(input.handle);
  if (!normalizedHandle) {
    throw new Error('账号 handle 不能为空');
  }

  const accountPool = await getAccountPool();
  const now = new Date().toISOString();
  const existingItem = input.id
    ? accountPool.find((item) => item.id === input.id)
    : accountPool.find((item) => item.handle === normalizedHandle);

  const nextItem: AccountPoolItem = {
    id: existingItem?.id ?? buildAccountPoolId(),
    handle: normalizedHandle,
    displayName: input.displayName.trim(),
    category: input.category,
    influenceBand: input.influenceBand ?? existingItem?.influenceBand ?? null,
    bio: input.bio?.trim() ?? existingItem?.bio ?? '',
    priority: input.priority,
    notes: input.notes.trim(),
    lastInteractedAt: existingItem?.lastInteractedAt ?? null,
    createdAt: existingItem?.createdAt ?? now,
    updatedAt: now,
  };

  const nextAccountPool = sortAccountPool([
    ...accountPool.filter((item) => item.id !== nextItem.id && item.handle !== normalizedHandle),
    nextItem,
  ]);
  await saveAccountPool(nextAccountPool);

  return nextItem;
}

export async function deleteAccountPoolItem(accountId: string) {
  const accountPool = await getAccountPool();
  const nextAccountPool = accountPool.filter((item) => item.id !== accountId);
  await saveAccountPool(nextAccountPool);
}

export async function getRecommendedAccounts(limit = 4) {
  const [accountPool, settings] = await Promise.all([getAccountPool(), getSettings()]);
  const stageId = settings.currentStageId;

  return sortAccountPool(accountPool)
    .map((item) => ({
      ...item,
      recommendationScore: calculateRecommendationScore(stageId, item),
      recommendedReason: summarizeRecommendationReason(
        item.category,
        item.influenceBand,
        item.priority,
        item.lastInteractedAt,
      ),
    }))
    .sort(
      (left, right) =>
        right.recommendationScore - left.recommendationScore ||
        left.handle.localeCompare(right.handle),
    )
    .slice(0, limit) satisfies RecommendedAccount[];
}

export async function recordInteractionAndEnhanceTasks(input: {
  actionType: 'original' | 'reply' | 'quote';
  targetHandle?: string | null;
  signature: string;
}) {
  const interactionLogs = await getInteractionLogs();
  const existingLog = interactionLogs.find((item) => item.signature === input.signature);
  if (existingLog) {
    return existingLog;
  }

  const normalizedTargetHandle = normalizeHandle(input.targetHandle);
  const accountPool = sortAccountPool(await getAccountPool());
  const matchedAccount = normalizedTargetHandle
    ? accountPool.find((item) => item.handle === normalizedTargetHandle)
    : undefined;
  const now = new Date().toISOString();

  const nextLog: InteractionLog = {
    id: buildInteractionLogId(),
    date: getTodayKey(),
    actionType: input.actionType,
    targetHandle: normalizedTargetHandle || null,
    matchedAccountPoolId: matchedAccount?.id ?? null,
    matchedCategory: matchedAccount?.category ?? null,
    source: 'auto',
    signature: input.signature,
    createdAt: now,
  };

  const nextLogs = [...interactionLogs, nextLog].slice(-MAX_INTERACTION_LOGS);
  await saveInteractionLogs(nextLogs);

  if (matchedAccount) {
    const nextAccountPool = accountPool.map((item) =>
      item.id === matchedAccount.id
        ? {
            ...item,
            lastInteractedAt: now,
            updatedAt: now,
          }
        : item,
    );
    await saveAccountPool(nextAccountPool);

    // NOTE: 这里只在已命中账号池分类时补充阶段任务，避免插件在未分类账号上误记。
    if (
      matchedAccount.category === 'benchmark' &&
      isInfluenceBandAtLeast(matchedAccount.influenceBand, '5k_10k')
    ) {
      await updateTodayTaskProgress('bigCreatorInteractions', 1);
    }

    if (matchedAccount.category === 'peer') {
      await updateTodayTaskProgress('peerInteractions', 1);
    }
  }

  return nextLog;
}
