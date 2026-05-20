import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import {
  ActivityHeatmap,
  formatHeatmapDateRange,
  formatHeatmapRangeLabel,
  getHeatmapRangeView,
} from '../components/activity-heatmap';
import { FollowerSparkline } from '../components/follower-sparkline';
import {
  accountCategoryOptions,
  accountInfluenceBandOptions,
  getAccountCategoryLabel,
  getInfluenceBandLabel,
  getInfluenceBandScore,
} from '../growth-system/account-taxonomy';
import {
  getAllOverlayDefinitions,
  getSelectedOverlayDefinitions,
} from '../growth-system/overlay-guidance';
import {
  getFollowerSummary,
  getFollowerTrendSeries,
  deleteAccountPoolItem,
  type FollowerSummary,
  type FollowerTrendPoint,
  listAccountPool,
  upsertAccountPoolItem,
} from '../growth-system/phase-six-data';
import {
  buildXSearchUrl,
  deleteSearchTemplate,
  ignoreCandidateAccount,
  importCandidateToAccountPool,
  listCandidateAccounts,
  listSearchTemplates,
  moveAccountPoolItemToCandidateState,
  restoreCandidateAccount,
  syncSystemSearchTemplatesForSettings,
  updateCandidateAccountCategory,
  upsertSearchTemplate,
} from '../growth-system/phase-seven-data';
import {
  defaultLastContentRecognition,
  defaultRuntimeSnapshot,
  defaultSettings,
} from '../storage/defaults';
import {
  getAccountPool,
  getDailyRecords,
  getArticleRecognitionDebugLogs,
  getCandidateAccounts,
  getDailyReviewDrafts,
  getFollowerSnapshots,
  getInteractionLogs,
  getLastContentRecognition,
  getOriginalContentRecords,
  getRuntimeSnapshot,
  getSettings,
  getShortPostRecognitionDebugLogs,
  saveAccountPool,
  saveArticleRecognitionDebugLogs,
  saveCandidateAccounts,
  saveDailyRecords,
  saveDailyReviewDrafts,
  saveFollowerSnapshots,
  saveInteractionLogs,
  saveLastContentRecognition,
  saveOriginalContentRecords,
  saveRuntimeSnapshot,
  saveSearchTemplates,
  saveSettings,
  saveShortPostRecognitionDebugLogs,
  subscribeToStorageChanges,
} from '../storage/storage';
import type {
  AccountInfluenceBand,
  AccountPoolCategory,
  AccountPoolItem,
  AccountPoolPriority,
  ArticleRecognitionDebugEntry,
  CandidateAccount,
  CandidateAccountSource,
  CustomOverlayDefinition,
  DailyReviewDraft,
  DailyRecord,
  ExtensionSettings,
  FollowerSnapshot,
  IntensityPreset,
  LastContentRecognition,
  RuntimeSnapshot,
  SearchTemplate,
  SearchTemplateCategory,
  ShortPostRecognitionDebugEntry,
} from '../storage/schema';
import { stagePlaybooks } from '../shared/playbook-data';
import { rebuildTodayRecordFromSettings } from '../task-system/daily-records';
import { exportData, EXPORT_FORMAT, saveFile } from '../../utils/exporter';
import growthPlaybooks from '@/playbooks/growth_playbooks.json';

const PAGE_SIZE = 10;
const INTENSITY_AUTOSAVE_DELAY_MS = 700;

const intensityOptions: Array<{ label: string; value: IntensityPreset; description: string }> = [
  { label: '保守', value: 'conservative', description: '适合恢复节奏，目标更轻' },
  { label: '标准', value: 'standard', description: '默认节奏，适合持续执行' },
  { label: '强执行', value: 'aggressive', description: '适合短期冲刺，目标更高' },
];

const intensityModeOptions: Array<{
  label: string;
  value: IntensityMode;
  description: string;
}> = [
  ...intensityOptions,
  {
    label: '自定义',
    value: 'custom',
    description: '直接改每天数量并重建今天目标',
  },
];

const taskSubtitleMap: Record<string, string> = {
  shortContentPosts: '普通短推计一次，不含 Article',
  shortPosts: '普通短推计一次，不含 Article',
  threadPosts: '连续串帖算一条线程',
  longFormPosts: '发布 X Article 才计入长文',
  highQualityReplies: '有效回复才计入',
  bigCreatorInteractions: '只统计高量级对标互动',
  peerInteractions: '只统计同生态互动',
  quotePosts: '引用转发计一次',
  contentIdeasCaptured: '记下一条可展开写的题材',
  dailyReview: '补齐链接或总结，并完成回看',
  benchmarkDistillation: '拆一条对标内容并记下要点',
  contentSuggestionConsumed: '按建议落地一条内容',
};

const accountPriorityOptions: Array<{ value: AccountPoolPriority; label: string }> = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];

const searchTemplateCategoryOptions: Array<{
  value: SearchTemplateCategory;
  label: string;
  description: string;
}> = [
  { value: 'questions', label: '找问题', description: '找提问帖和求助帖，优先切回复' },
  { value: 'viral', label: '拆爆款', description: '找已有互动的内容，拆结构和角度' },
  { value: 'creator', label: '追创作者', description: '跟踪目标创作者最近在聊什么' },
  { value: 'niche', label: '找新账号', description: '发现量级接近但内容不错的账号' },
  { value: 'recent', label: '看实时', description: '优先参与刚发出来不久的内容' },
  { value: 'custom', label: '自定义', description: '完全按你自己的搜索语法保存' },
];

type SettingsTab = 'setup' | 'workspace' | 'templates';
type CandidateStatusFilter = 'pending' | 'active' | 'ignored' | 'all';
type IntensityMode = IntensityPreset | 'custom';
type WorkspaceSourceFilter = 'all' | CandidateAccountSource | 'manual' | 'unknown';

interface AccountPoolFormState {
  id: string | null;
  handle: string;
  displayName: string;
  category: AccountPoolCategory;
  influenceBand: AccountInfluenceBand | '';
  bio: string;
  priority: AccountPoolPriority;
  notes: string;
}

interface SearchTemplateFormState {
  id: string | null;
  name: string;
  description: string;
  query: string;
  category: SearchTemplateCategory;
  pinned: boolean;
}

interface CustomOverlayFormState {
  id: string | null;
  name: string;
  description: string;
  keywordsText: string;
  topicSuggestionsText: string;
  toneRulesText: string;
}

const defaultAccountPoolForm: AccountPoolFormState = {
  id: null,
  handle: '',
  displayName: '',
  category: 'peer',
  influenceBand: '',
  bio: '',
  priority: 'medium',
  notes: '',
};

const defaultSearchTemplateForm: SearchTemplateFormState = {
  id: null,
  name: '',
  description: '',
  query: '',
  category: 'questions',
  pinned: true,
};

const defaultCustomOverlayForm: CustomOverlayFormState = {
  id: null,
  name: '',
  description: '',
  keywordsText: '',
  topicSuggestionsText: '',
  toneRulesText: '',
};

function splitMultilineText(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function formatLastInteractedAt(timestamp: string | null) {
  if (!timestamp) {
    return '暂无互动记录';
  }

  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSourceLabel(source: WorkspaceSourceFilter) {
  if (source === 'from_followers') {
    return 'Followers';
  }

  if (source === 'from_following') {
    return 'Following';
  }

  if (source === 'manual') {
    return '手动添加';
  }

  if (source === 'unknown') {
    return '来源未知';
  }

  return '全部来源';
}

function formatCompactFollowerCount(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '粉丝数未知';
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M 粉`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k 粉`;
  }

  return `${value} 粉`;
}

function formatFollowerDelta(delta: number | null) {
  if (typeof delta !== 'number') {
    return '暂无昨日对比';
  }

  if (delta > 0) {
    return `较昨日 +${delta}`;
  }

  if (delta < 0) {
    return `较昨日 ${delta}`;
  }

  return '较昨日持平';
}

function formatDebugResponseKeys(keys: string[] | null | undefined) {
  if (!keys?.length) {
    return '';
  }

  const visibleKeys = keys.slice(0, 8).join(', ');
  if (keys.length <= 8) {
    return visibleKeys;
  }

  return `${visibleKeys} 等 ${keys.length} 个字段`;
}

function getExportDateStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWorkspaceStatusLabel(candidate: CandidateAccount) {
  if (candidate.ignored) {
    return '已忽略';
  }

  if (candidate.importedToAccountPool) {
    return '已入池';
  }

  return '待处理';
}

function getCandidateSourceExportLabel(source: CandidateAccountSource) {
  if (source === 'from_followers') {
    return 'Followers';
  }

  return 'Following';
}

function buildDailyRecordExportRows(records: DailyRecord[]) {
  return records.map((record) => {
    const completedTaskCount = record.tasks.filter((task) => task.completed).length;
    return {
      date: record.date,
      playbookId: record.playbookId,
      intensityPreset: record.intensityPreset,
      completionRate: Math.round(record.completionRate * 100),
      completedTaskCount,
      totalTaskCount: record.tasks.length,
      overlayIds: record.overlayIds.join(', '),
      tasksSummary: record.tasks
        .map((task) => `${task.label} ${task.current}/${task.target}`)
        .join(' | '),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  });
}

function buildFollowerSnapshotExportRows(snapshots: FollowerSnapshot[]) {
  return snapshots.map((snapshot) => ({
    date: snapshot.date,
    handle: snapshot.handle,
    followersCount: snapshot.followersCount,
    followersDelta: snapshot.followersDelta ?? '',
    source: snapshot.source,
    capturedAt: snapshot.capturedAt,
    path: snapshot.path ?? '',
  }));
}

function buildWorkspaceExportRows(
  accountPool: AccountPoolItem[],
  candidateAccounts: CandidateAccount[],
) {
  const candidateByHandle = new Map(
    candidateAccounts.map((candidate) => [candidate.handle.toLowerCase(), candidate]),
  );

  const candidateRows = candidateAccounts.map((candidate) => ({
    status: getWorkspaceStatusLabel(candidate),
    handle: candidate.handle,
    displayName: candidate.displayName,
    category: candidate.suggestedCategory
      ? getAccountCategoryLabel(candidate.suggestedCategory)
      : '',
    influenceBand: getInfluenceBandLabel(candidate.influenceBand),
    followersCount: candidate.followersCount ?? '',
    source: getCandidateSourceExportLabel(candidate.source),
    bio: candidate.bio,
    notes: '',
    priority: '',
    confidence: candidate.confidence,
    lastInteractedAt: '',
    capturedAt: candidate.capturedAt,
    updatedAt: candidate.updatedAt,
  }));

  const accountRows = accountPool.map((account) => {
    const matchedCandidate = candidateByHandle.get(account.handle.toLowerCase());
    return {
      status: '已入池',
      handle: account.handle,
      displayName: account.displayName,
      category: getAccountCategoryLabel(account.category),
      influenceBand: getInfluenceBandLabel(
        account.influenceBand ?? matchedCandidate?.influenceBand ?? null,
      ),
      followersCount: matchedCandidate?.followersCount ?? '',
      source: matchedCandidate
        ? getCandidateSourceExportLabel(matchedCandidate.source)
        : '手动添加',
      bio: account.bio || matchedCandidate?.bio || '',
      notes: account.notes,
      priority: account.priority,
      confidence: matchedCandidate?.confidence ?? '',
      lastInteractedAt: account.lastInteractedAt ?? '',
      capturedAt: matchedCandidate?.capturedAt ?? '',
      updatedAt: account.updatedAt,
    };
  });

  return [...accountRows, ...candidateRows];
}

function buildDailyReviewExportRows(reviewDrafts: DailyReviewDraft[]) {
  return reviewDrafts.map((draft) => ({
    date: draft.date,
    completionRate: draft.completionRate,
    followersDelta: draft.followersDelta ?? '',
    bestAction: draft.bestAction,
    bestPostUrl: draft.bestPostUrl,
    bestReplyUrl: draft.bestReplyUrl,
    shortContentCount: draft.shortContentCount,
    threadCount: draft.threadCount,
    longFormCount: draft.longFormCount,
    summary: draft.summary,
    suggestedNextAction: draft.suggestedNextAction,
    xDraft: draft.xDraft,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  }));
}

interface BackupPayload {
  exportedAt?: string;
  schemaVersion?: string;
  storage?: Partial<{
    settings: Partial<ExtensionSettings>;
    runtime: Partial<RuntimeSnapshot>;
    lastContentRecognition: Partial<LastContentRecognition>;
    articleRecognitionDebugLogs: ArticleRecognitionDebugEntry[];
    shortPostRecognitionDebugLogs: ShortPostRecognitionDebugEntry[];
    dailyRecords: DailyRecord[];
    followerSnapshots: FollowerSnapshot[];
    accountPool: AccountPoolItem[];
    interactionLogs: unknown[];
    searchTemplates: SearchTemplate[];
    candidateAccounts: CandidateAccount[];
    dailyReviewDrafts: DailyReviewDraft[];
    originalContentRecords: unknown[];
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRoleChipClass(category: AccountPoolCategory | null) {
  if (category === 'peer') {
    return 'border border-sky-200 bg-sky-50 text-sky-800';
  }

  if (category === 'benchmark') {
    return 'border border-violet-200 bg-violet-50 text-violet-800';
  }

  return 'border border-slate-200 bg-slate-50 text-slate-600';
}

function getInfluenceChipClass(influenceBand: AccountInfluenceBand | null) {
  if (!influenceBand) {
    return 'border border-slate-200 bg-slate-50 text-slate-600';
  }

  if (getInfluenceBandScore(influenceBand) >= getInfluenceBandScore('10k_20k')) {
    return 'border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800';
  }

  if (getInfluenceBandScore(influenceBand) >= getInfluenceBandScore('5k_10k')) {
    return 'border border-indigo-200 bg-indigo-50 text-indigo-800';
  }

  return 'border border-cyan-200 bg-cyan-50 text-cyan-800';
}

function paginate<T>(items: T[], page: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const normalizedPage = Math.min(page, pageCount);
  const start = (normalizedPage - 1) * PAGE_SIZE;
  return {
    pageCount,
    page: normalizedPage,
    items: items.slice(start, start + PAGE_SIZE),
  };
}

function buildCustomOverlay(
  formState: CustomOverlayFormState,
  existingCustomOverlays: CustomOverlayDefinition[],
) {
  const now = new Date().toISOString();
  const existing = formState.id
    ? existingCustomOverlays.find((overlay) => overlay.id === formState.id)
    : undefined;

  return {
    id: existing?.id ?? `custom-overlay-${Date.now()}`,
    name: formState.name.trim(),
    description: formState.description.trim(),
    keywords: splitMultilineText(formState.keywordsText),
    topicSuggestions: splitMultilineText(formState.topicSuggestionsText),
    toneRules: splitMultilineText(formState.toneRulesText),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  } satisfies CustomOverlayDefinition;
}

export function OptionsApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(defaultSettings);
  const [saveStatus, setSaveStatus] = useState('尚未保存');
  const [exportBusyKey, setExportBusyKey] = useState<string | null>(null);
  const [recentExportKey, setRecentExportKey] = useState<string | null>(null);
  const [importBusyKey, setImportBusyKey] = useState<string | null>(null);
  const [recentImportKey, setRecentImportKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('setup');
  const [accountPool, setAccountPool] = useState<AccountPoolItem[]>([]);
  const [candidateAccounts, setCandidateAccounts] = useState<CandidateAccount[]>([]);
  const [searchTemplates, setSearchTemplates] = useState<SearchTemplate[]>([]);
  const [articleDebugLogs, setArticleDebugLogs] = useState<ArticleRecognitionDebugEntry[]>([]);
  const [shortPostDebugLogs, setShortPostDebugLogs] = useState<ShortPostRecognitionDebugEntry[]>(
    [],
  );
  const [dailyRecords, setDailyRecords] = useState<DailyRecord[]>([]);
  const [followerSummary, setFollowerSummary] = useState<FollowerSummary | null>(null);
  const [followerTrend, setFollowerTrend] = useState<FollowerTrendPoint[]>([]);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [accountForm, setAccountForm] = useState<AccountPoolFormState>(defaultAccountPoolForm);
  const [searchTemplateForm, setSearchTemplateForm] =
    useState<SearchTemplateFormState>(defaultSearchTemplateForm);
  const [customOverlayForm, setCustomOverlayForm] =
    useState<CustomOverlayFormState>(defaultCustomOverlayForm);
  const [, setCandidateStatus] = useState(
    '打开 Following / Followers 后自动更新',
  );
  const [, setAccountStatus] = useState('正式账号池已准备好');
  const [, setTemplateStatus] = useState('搜索模板已准备好');
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [candidateStatusFilter, setCandidateStatusFilter] =
    useState<CandidateStatusFilter>('pending');
  const [workspaceSourceFilter, setWorkspaceSourceFilter] = useState<WorkspaceSourceFilter>('all');
  const [candidateCategoryFilter, setCandidateCategoryFilter] = useState<
    'all' | AccountPoolCategory | 'none'
  >('all');
  const [candidateInfluenceFilter, setCandidateInfluenceFilter] = useState<
    'all' | AccountInfluenceBand
  >('all');
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [candidatePage, setCandidatePage] = useState(1);
  const [accountCategoryFilter, setAccountCategoryFilter] = useState<'all' | AccountPoolCategory>(
    'all',
  );
  const [accountInfluenceFilter, setAccountInfluenceFilter] = useState<
    'all' | AccountInfluenceBand
  >('all');
  const [accountPage, setAccountPage] = useState(1);
  const [workspaceBatchMode, setWorkspaceBatchMode] = useState(false);
  const [accountEditorOpen, setAccountEditorOpen] = useState(false);
  const intensityAutosaveTimerRef = useRef<number | null>(null);
  const lastSavedIntensitySignatureRef = useRef<string | null>(null);
  const exportFeedbackTimerRef = useRef<number | null>(null);
  const importFeedbackTimerRef = useRef<number | null>(null);
  const importBackupInputRef = useRef<HTMLInputElement | null>(null);

  const loadPageData = async () => {
    const [
      loadedSettings,
      loadedAccountPool,
      loadedCandidates,
      loadedTemplates,
      loadedDebugLogs,
      loadedShortPostDebugLogs,
      loadedDailyRecords,
      loadedFollowerSummary,
      loadedFollowerTrend,
    ] = await Promise.all([
      getSettings(),
      listAccountPool(),
      listCandidateAccounts(),
      listSearchTemplates(),
      getArticleRecognitionDebugLogs(),
      getShortPostRecognitionDebugLogs(),
      getDailyRecords(),
      getFollowerSummary(),
      getFollowerTrendSeries(30),
    ]);

    setSettings(loadedSettings);
    setAccountPool(loadedAccountPool);
    setCandidateAccounts(loadedCandidates);
    setSearchTemplates(loadedTemplates);
    setArticleDebugLogs(loadedDebugLogs);
    setShortPostDebugLogs(loadedShortPostDebugLogs);
    setDailyRecords(loadedDailyRecords);
    setFollowerSummary(loadedFollowerSummary);
    setFollowerTrend(loadedFollowerTrend);
    setSettingsHydrated(true);
  };

  const markExportFinished = (key: string) => {
    setRecentExportKey(key);
    if (exportFeedbackTimerRef.current !== null) {
      window.clearTimeout(exportFeedbackTimerRef.current);
    }
    exportFeedbackTimerRef.current = window.setTimeout(() => {
      setRecentExportKey((current) => (current === key ? null : current));
      exportFeedbackTimerRef.current = null;
    }, 2200);
  };

  const markImportFinished = (key: string) => {
    setRecentImportKey(key);
    if (importFeedbackTimerRef.current !== null) {
      window.clearTimeout(importFeedbackTimerRef.current);
    }
    importFeedbackTimerRef.current = window.setTimeout(() => {
      setRecentImportKey((current) => (current === key ? null : current));
      importFeedbackTimerRef.current = null;
    }, 2200);
  };

  const runExportAction = async (key: string, action: () => Promise<void>) => {
    setExportBusyKey(key);
    setRecentExportKey(null);
    try {
      await action();
      markExportFinished(key);
    } finally {
      setExportBusyKey(null);
    }
  };

  const runImportAction = async (key: string, action: () => Promise<void>) => {
    setImportBusyKey(key);
    setRecentImportKey(null);
    try {
      await action();
      markImportFinished(key);
    } finally {
      setImportBusyKey(null);
    }
  };

  useEffect(() => {
    void (async () => {
      await loadPageData();
      const loadedSettings = await getSettings();
      await syncSystemSearchTemplatesForSettings(loadedSettings);
      setSearchTemplates(await listSearchTemplates());
      setSaveStatus('已读取本地设置');
      setTemplateStatus('搜索模板已同步');
    })();

    const unsubscribe = subscribeToStorageChanges((_changes, areaName) => {
      if (areaName === 'local') {
        void loadPageData();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (exportFeedbackTimerRef.current !== null) {
        window.clearTimeout(exportFeedbackTimerRef.current);
      }
      if (importFeedbackTimerRef.current !== null) {
        window.clearTimeout(importFeedbackTimerRef.current);
      }
    };
  }, []);

  const currentStage =
    stagePlaybooks.find((stage) => stage.id === settings.currentStageId) ?? stagePlaybooks[0]!;
  const activeOverlayDefinitions = useMemo(
    () => getSelectedOverlayDefinitions(settings),
    [settings],
  );
  const allOverlayDefinitions = useMemo(() => getAllOverlayDefinitions(settings), [settings]);
  const yearlyHeatmapView = useMemo(
    () => getHeatmapRangeView(dailyRecords, 'year', new Date()),
    [dailyRecords],
  );
  const followerTrendPoints = useMemo(
    () => followerTrend.map((item) => item.followersCount),
    [followerTrend],
  );
  const activeIntensityMode: IntensityMode =
    Object.keys(settings.taskTargetOverrides).length > 0 ? 'custom' : settings.intensityPreset;
  const adjustableTasks = useMemo(() => {
    const presetKey =
      activeIntensityMode === 'custom' ? settings.intensityPreset : activeIntensityMode;
    const baseTargets = currentStage.dailyTargets as Partial<Record<string, number>>;
    const presetTargets = currentStage.intensityPresets[presetKey]?.dailyTargets as
      | Partial<Record<string, number>>
      | undefined;
    const resolvedTargets: Record<string, number> = {};

    for (const [taskId, target] of Object.entries(baseTargets)) {
      if (typeof target === 'number') {
        resolvedTargets[taskId] = target;
      }
    }

    for (const [taskId, target] of Object.entries(presetTargets ?? {})) {
      if (typeof target === 'number') {
        resolvedTargets[taskId] = target;
      }
    }

    for (const [taskId, target] of Object.entries(settings.taskTargetOverrides)) {
      if (typeof target === 'number') {
        resolvedTargets[taskId] = target;
      }
    }

    return (currentStage.adjustableTaskKeys ?? [])
      .map((taskId) => {
        const taskEntry =
          growthPlaybooks.taskCatalog[taskId as keyof typeof growthPlaybooks.taskCatalog];
        if (!taskEntry) {
          return null;
        }

        return {
          taskId,
          label: taskEntry.label,
          target: typeof resolvedTargets[taskId] === 'number' ? resolvedTargets[taskId] : 0,
          unit: taskEntry.unit,
        };
      })
      .filter(
        (
          task,
        ): task is {
          taskId: string;
          label: string;
          target: number;
          unit: string;
        } => Boolean(task),
      );
  }, [
    activeIntensityMode,
    currentStage.adjustableTaskKeys,
    currentStage.dailyTargets,
    currentStage.intensityPresets,
    settings.intensityPreset,
    settings.taskTargetOverrides,
  ]);
  const intensitySettingsSignature = useMemo(
    () =>
      JSON.stringify({
        stageId: settings.currentStageId,
        preset: settings.intensityPreset,
        overrides: settings.taskTargetOverrides,
      }),
    [settings.currentStageId, settings.intensityPreset, settings.taskTargetOverrides],
  );

  const filteredCandidates = useMemo(() => {
    const normalizedSearch = workspaceSearch.trim().toLowerCase();

    return candidateAccounts.filter((candidate) => {
      const derivedStatus: CandidateStatusFilter = candidate.ignored
        ? 'ignored'
        : candidate.importedToAccountPool
          ? 'active'
          : 'pending';

      if (candidateStatusFilter !== 'all' && derivedStatus !== candidateStatusFilter) {
        return false;
      }

      if (workspaceSourceFilter !== 'all' && candidate.source !== workspaceSourceFilter) {
        return false;
      }

      if (candidateCategoryFilter === 'none' && candidate.suggestedCategory !== null) {
        return false;
      }

      if (
        candidateCategoryFilter !== 'all' &&
        candidateCategoryFilter !== 'none' &&
        candidate.suggestedCategory !== candidateCategoryFilter
      ) {
        return false;
      }

      if (
        candidateInfluenceFilter !== 'all' &&
        candidate.influenceBand !== candidateInfluenceFilter
      ) {
        return false;
      }

      if (
        normalizedSearch &&
        ![
          candidate.handle,
          candidate.displayName,
          candidate.bio,
          candidate.suggestionReason,
          getAccountCategoryLabel(candidate.suggestedCategory),
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch)
      ) {
        return false;
      }

      return true;
    });
  }, [
    candidateAccounts,
    candidateCategoryFilter,
    candidateInfluenceFilter,
    workspaceSourceFilter,
    candidateStatusFilter,
    workspaceSearch,
  ]);

  const pagedCandidates = useMemo(
    () => paginate(filteredCandidates, candidatePage),
    [candidatePage, filteredCandidates],
  );
  const candidateBioMap = useMemo(
    () =>
      Object.fromEntries(
        candidateAccounts
          .filter((candidate) => candidate.bio.trim())
          .map((candidate) => [candidate.handle, candidate.bio.trim()]),
      ),
    [candidateAccounts],
  );
  const candidateMetaMap = useMemo(
    () =>
      Object.fromEntries(
        candidateAccounts.map((candidate) => [
          candidate.handle,
          {
            followersCount: candidate.followersCount,
            influenceBand: candidate.influenceBand,
            source: candidate.source,
            bio: candidate.bio,
          },
        ]),
      ),
    [candidateAccounts],
  );
  const filteredCandidateIds = useMemo(
    () => filteredCandidates.map((candidate) => candidate.id),
    [filteredCandidates],
  );

  useEffect(() => {
    if (candidatePage !== pagedCandidates.page) {
      setCandidatePage(pagedCandidates.page);
    }
  }, [candidatePage, pagedCandidates.page]);

  const filteredAccounts = useMemo(() => {
    const normalizedSearch = workspaceSearch.trim().toLowerCase();

    return accountPool.filter((account) => {
      const accountMeta = candidateMetaMap[account.handle];
      const derivedSource: WorkspaceSourceFilter = accountMeta?.source ?? 'manual';

      if (workspaceSourceFilter !== 'all' && derivedSource !== workspaceSourceFilter) {
        return false;
      }

      if (accountCategoryFilter !== 'all' && account.category !== accountCategoryFilter) {
        return false;
      }

      if (accountInfluenceFilter !== 'all' && account.influenceBand !== accountInfluenceFilter) {
        return false;
      }

      if (
        normalizedSearch &&
        ![
          account.handle,
          account.displayName,
          account.bio,
          accountMeta?.bio ?? '',
          account.notes,
          getAccountCategoryLabel(account.category),
          getInfluenceBandLabel(account.influenceBand),
          getSourceLabel(derivedSource),
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch)
      ) {
        return false;
      }

      return true;
    });
  }, [
    accountCategoryFilter,
    accountInfluenceFilter,
    accountPool,
    candidateMetaMap,
    workspaceSearch,
    workspaceSourceFilter,
  ]);

  const pagedAccounts = useMemo(
    () => paginate(filteredAccounts, accountPage),
    [accountPage, filteredAccounts],
  );
  const filteredAccountIds = useMemo(
    () => filteredAccounts.map((account) => account.id),
    [filteredAccounts],
  );

  useEffect(() => {
    if (accountPage !== pagedAccounts.page) {
      setAccountPage(pagedAccounts.page);
    }
  }, [accountPage, pagedAccounts.page]);

  const updateField = <K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const updateAccountForm = <K extends keyof AccountPoolFormState>(
    key: K,
    value: AccountPoolFormState[K],
  ) => {
    setAccountForm((current) => ({ ...current, [key]: value }));
  };

  const updateSearchTemplateForm = <K extends keyof SearchTemplateFormState>(
    key: K,
    value: SearchTemplateFormState[K],
  ) => {
    setSearchTemplateForm((current) => ({ ...current, [key]: value }));
  };

  const updateCustomOverlayForm = <K extends keyof CustomOverlayFormState>(
    key: K,
    value: CustomOverlayFormState[K],
  ) => {
    setCustomOverlayForm((current) => ({ ...current, [key]: value }));
  };

  const toggleOverlay = (overlayId: string, checked: boolean) => {
    setSettings((current) => {
      const nextIds = checked
        ? Array.from(new Set([...current.overlayIds, overlayId]))
        : current.overlayIds.filter((id) => id !== overlayId);

      return {
        ...current,
        overlayIds: nextIds,
      };
    });
  };

  const updateTaskTargetOverride = (
    taskId: string,
    nextValue: number | null,
    presetTarget: number,
  ) => {
    setSettings((current) => {
      const nextOverrides = { ...current.taskTargetOverrides };
      if (!nextValue || nextValue <= 0 || nextValue === presetTarget) {
        delete nextOverrides[taskId];
      } else {
        nextOverrides[taskId] = nextValue;
      }

      return {
        ...current,
        taskTargetOverrides: nextOverrides,
      };
    });
  };

  const handleSelectIntensityMode = (mode: IntensityMode) => {
    if (mode === 'custom') {
      setSaveStatus('已切到自定义，可直接改每日数量');
      return;
    }

    setSettings((current) => ({
      ...current,
      intensityPreset: mode,
      taskTargetOverrides: {},
    }));
    setSaveStatus(
      `已套用「${intensityOptions.find((option) => option.value === mode)?.label}」预设`,
    );
  };

  useEffect(() => {
    if (!settingsHydrated) {
      return;
    }

    if (lastSavedIntensitySignatureRef.current === null) {
      lastSavedIntensitySignatureRef.current = intensitySettingsSignature;
      return;
    }

    if (lastSavedIntensitySignatureRef.current === intensitySettingsSignature) {
      return;
    }

    setSaveStatus('正在自动保存今日目标');

    if (intensityAutosaveTimerRef.current !== null) {
      window.clearTimeout(intensityAutosaveTimerRef.current);
    }

    intensityAutosaveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        await saveSettings(settings);
        await rebuildTodayRecordFromSettings({
          preserveProgress: true,
          settings,
        });
        lastSavedIntensitySignatureRef.current = intensitySettingsSignature;
        setSaveStatus('今日目标已自动保存，已完成进度会保留');
      })();
    }, INTENSITY_AUTOSAVE_DELAY_MS);

    return () => {
      if (intensityAutosaveTimerRef.current !== null) {
        window.clearTimeout(intensityAutosaveTimerRef.current);
      }
    };
  }, [intensitySettingsSignature, settings, settingsHydrated]);

  const handleRefreshSystemTemplates = async () => {
    await syncSystemSearchTemplatesForSettings(settings);
    setSearchTemplateForm(defaultSearchTemplateForm);
    setTemplateStatus('已按当前人设更新模板');
  };

  const handleResetSystemTemplates = async () => {
    await syncSystemSearchTemplatesForSettings(settings);
    setSearchTemplateForm(defaultSearchTemplateForm);
    setTemplateStatus('已恢复默认模板');
  };

  const handleSaveSettings = async () => {
    setSaveStatus('正在保存并重建今天任务');
    await saveSettings(settings);
    await syncSystemSearchTemplatesForSettings(settings);
    await rebuildTodayRecordFromSettings({
      preserveProgress: true,
      settings,
    });
    setSaveStatus('已保存，今天的任务目标已更新，已完成进度会保留');
    setTemplateStatus('已按当前人设刷新系统搜索模板');
  };

  const handleResetSettings = async () => {
    await saveSettings(defaultSettings);
    await syncSystemSearchTemplatesForSettings(defaultSettings);
    await rebuildTodayRecordFromSettings({
      preserveProgress: true,
      settings: defaultSettings,
    });
    setSettings(defaultSettings);
    setCustomOverlayForm(defaultCustomOverlayForm);
    setSaveStatus('已恢复默认设置，并重建今天任务目标');
  };

  const handleClearArticleDebugLogs = async () => {
    await saveArticleRecognitionDebugLogs([]);
    setSaveStatus('已清空长文事件');
  };

  const handleClearShortPostDebugLogs = async () => {
    await saveShortPostRecognitionDebugLogs([]);
    setSaveStatus('已清空短推事件');
  };

  const exportDebugLogs = (
    filenamePrefix: string,
    payload: {
      generatedAt: string;
      articleRecognitionDebugLogs?: ArticleRecognitionDebugEntry[];
      shortPostRecognitionDebugLogs?: ShortPostRecognitionDebugEntry[];
    },
  ) => {
    saveFile(
      `${filenamePrefix}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`,
      JSON.stringify(payload, null, 2),
    );
  };

  const handleExportArticleDebugLogs = () => {
    exportDebugLogs('article-recognition-debug', {
      generatedAt: new Date().toISOString(),
      articleRecognitionDebugLogs: articleDebugLogs,
    });
    setSaveStatus('已导出长文日志');
  };

  const handleExportShortPostDebugLogs = () => {
    exportDebugLogs('short-post-recognition-debug', {
      generatedAt: new Date().toISOString(),
      shortPostRecognitionDebugLogs: shortPostDebugLogs,
    });
    setSaveStatus('已导出短推日志');
  };

  const handleExportFullBackup = async () => {
    await runExportAction('backup-json', async () => {
      const [
        latestSettings,
        runtime,
        lastContentRecognition,
        articleRecognitionDebugLogs,
        shortPostRecognitionDebugLogs,
        latestDailyRecords,
        followerSnapshots,
        latestAccountPool,
        interactionLogs,
        latestSearchTemplates,
        latestCandidateAccounts,
        dailyReviewDrafts,
        originalContentRecords,
      ] = await Promise.all([
        getSettings(),
        getRuntimeSnapshot(),
        getLastContentRecognition(),
        getArticleRecognitionDebugLogs(),
        getShortPostRecognitionDebugLogs(),
        getDailyRecords(),
        getFollowerSnapshots(),
        getAccountPool(),
        getInteractionLogs(),
        listSearchTemplates(),
        getCandidateAccounts(),
        getDailyReviewDrafts(),
        getOriginalContentRecords(),
      ]);

      const payload = {
        exportedAt: new Date().toISOString(),
        schemaVersion: 'phase-8b',
        storage: {
          settings: latestSettings,
          runtime,
          lastContentRecognition,
          articleRecognitionDebugLogs,
          shortPostRecognitionDebugLogs,
          dailyRecords: latestDailyRecords,
          followerSnapshots,
          accountPool: latestAccountPool,
          interactionLogs,
          searchTemplates: latestSearchTemplates,
          candidateAccounts: latestCandidateAccounts,
          dailyReviewDrafts,
          originalContentRecords,
        },
      };

      saveFile(
        `x-growth-backup-${getExportDateStamp()}.json`,
        JSON.stringify(payload, null, 2),
        true,
      );
    });
  };

  const handleExportDailyRecordsCsv = async () => {
    await runExportAction('daily-records-csv', async () => {
      const latestDailyRecords = await getDailyRecords();
      await exportData(
        buildDailyRecordExportRows(latestDailyRecords),
        EXPORT_FORMAT.CSV,
        `x-growth-daily-records-${getExportDateStamp()}.csv`,
        {},
      );
    });
  };

  const handleExportFollowerSnapshotsCsv = async () => {
    await runExportAction('follower-snapshots-csv', async () => {
      const followerSnapshots = await getFollowerSnapshots();
      await exportData(
        buildFollowerSnapshotExportRows(followerSnapshots),
        EXPORT_FORMAT.CSV,
        `x-growth-follower-snapshots-${getExportDateStamp()}.csv`,
        {},
      );
    });
  };

  const handleExportWorkspaceCsv = async () => {
    await runExportAction('workspace-csv', async () => {
      const [latestAccountPool, latestCandidateAccounts] = await Promise.all([
        getAccountPool(),
        getCandidateAccounts(),
      ]);
      await exportData(
        buildWorkspaceExportRows(latestAccountPool, latestCandidateAccounts),
        EXPORT_FORMAT.CSV,
        `x-growth-workspace-${getExportDateStamp()}.csv`,
        {},
      );
    });
  };

  const handleExportDailyReviewsCsv = async () => {
    await runExportAction('daily-reviews-csv', async () => {
      const dailyReviewDrafts = await getDailyReviewDrafts();
      await exportData(
        buildDailyReviewExportRows(dailyReviewDrafts),
        EXPORT_FORMAT.CSV,
        `x-growth-daily-reviews-${getExportDateStamp()}.csv`,
        {},
      );
    });
  };

  const handleTriggerBackupImport = () => {
    importBackupInputRef.current?.click();
  };

  const handleImportFullBackup = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const [file] = Array.from(input.files ?? []);
    input.value = '';

    if (!file) {
      return;
    }

    await runImportAction('backup-json', async () => {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as BackupPayload;

      if (!isRecord(parsed) || !isRecord(parsed.storage)) {
        throw new Error('备份文件结构不正确');
      }

      const storage = parsed.storage;
      const nextSettings = {
        ...defaultSettings,
        ...(isRecord(storage.settings) ? storage.settings : {}),
      } satisfies ExtensionSettings;
      const nextRuntime = {
        ...defaultRuntimeSnapshot,
        ...(isRecord(storage.runtime) ? storage.runtime : {}),
      } satisfies RuntimeSnapshot;
      const nextLastContentRecognition = {
        ...defaultLastContentRecognition,
        ...(isRecord(storage.lastContentRecognition) ? storage.lastContentRecognition : {}),
      } satisfies LastContentRecognition;

      await Promise.all([
        saveSettings(nextSettings),
        saveRuntimeSnapshot(nextRuntime),
        saveLastContentRecognition(nextLastContentRecognition),
        saveArticleRecognitionDebugLogs(
          Array.isArray(storage.articleRecognitionDebugLogs)
            ? storage.articleRecognitionDebugLogs
            : [],
        ),
        saveShortPostRecognitionDebugLogs(
          Array.isArray(storage.shortPostRecognitionDebugLogs)
            ? storage.shortPostRecognitionDebugLogs
            : [],
        ),
        saveDailyRecords(Array.isArray(storage.dailyRecords) ? storage.dailyRecords : []),
        saveFollowerSnapshots(
          Array.isArray(storage.followerSnapshots) ? storage.followerSnapshots : [],
        ),
        saveAccountPool(Array.isArray(storage.accountPool) ? storage.accountPool : []),
        saveInteractionLogs(Array.isArray(storage.interactionLogs) ? storage.interactionLogs : []),
        saveSearchTemplates(Array.isArray(storage.searchTemplates) ? storage.searchTemplates : []),
        saveCandidateAccounts(
          Array.isArray(storage.candidateAccounts) ? storage.candidateAccounts : [],
        ),
        saveDailyReviewDrafts(
          Array.isArray(storage.dailyReviewDrafts) ? storage.dailyReviewDrafts : [],
        ),
        saveOriginalContentRecords(
          Array.isArray(storage.originalContentRecords) ? storage.originalContentRecords : [],
        ),
      ]);

      await loadPageData();
      setSaveStatus('完整备份已导入，本地数据已刷新');
    });
  };

  const handleSubmitSearchTemplate = async () => {
    if (!searchTemplateForm.name.trim() || !searchTemplateForm.query.trim()) {
      setTemplateStatus('请先填写模板名称和查询语句');
      return;
    }

    await upsertSearchTemplate({
      id: searchTemplateForm.id ?? undefined,
      name: searchTemplateForm.name,
      description: searchTemplateForm.description,
      query: searchTemplateForm.query,
      category: searchTemplateForm.category,
      pinned: searchTemplateForm.pinned,
    });
    setSearchTemplateForm(defaultSearchTemplateForm);
    setTemplateStatus(searchTemplateForm.id ? '搜索模板已更新' : '搜索模板已保存');
  };

  const handleDeleteSearchTemplate = async (templateId: string) => {
    await deleteSearchTemplate(templateId);
    if (searchTemplateForm.id === templateId) {
      setSearchTemplateForm(defaultSearchTemplateForm);
    }
    setTemplateStatus('搜索模板已删除');
  };

  const handleEditSearchTemplate = (template: SearchTemplate) => {
    setSearchTemplateForm({
      id: template.id,
      name: template.name,
      description: template.description,
      query: template.query,
      category: template.category,
      pinned: template.pinned,
    });
    setTemplateStatus(`正在编辑模板「${template.name}」`);
  };

  const handleSubmitCustomOverlay = async () => {
    if (!customOverlayForm.name.trim()) {
      setSaveStatus('请先给自定义人设命名');
      return;
    }

    const nextOverlay = buildCustomOverlay(customOverlayForm, settings.customOverlays);
    const nextCustomOverlays = [
      ...settings.customOverlays.filter((overlay) => overlay.id !== nextOverlay.id),
      nextOverlay,
    ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    const nextOverlayIds = settings.overlayIds.includes(nextOverlay.id)
      ? settings.overlayIds
      : [...settings.overlayIds, nextOverlay.id];

    setSettings((current) => ({
      ...current,
      customOverlays: nextCustomOverlays,
      overlayIds: nextOverlayIds,
    }));
    setCustomOverlayForm(defaultCustomOverlayForm);
    setSaveStatus(
      customOverlayForm.id
        ? '自定义人设已更新，记得保存设置'
        : '自定义人设已加入，记得保存设置',
    );
  };

  const handleEditCustomOverlay = (overlay: CustomOverlayDefinition) => {
    setCustomOverlayForm({
      id: overlay.id,
      name: overlay.name,
      description: overlay.description,
      keywordsText: overlay.keywords.join('\n'),
      topicSuggestionsText: overlay.topicSuggestions.join('\n'),
      toneRulesText: overlay.toneRules.join('\n'),
    });
    setSaveStatus(`正在编辑自定义人设「${overlay.name}」`);
  };

  const handleDeleteCustomOverlay = (overlayId: string) => {
    setSettings((current) => ({
      ...current,
      customOverlays: current.customOverlays.filter((overlay) => overlay.id !== overlayId),
      overlayIds: current.overlayIds.filter((id) => id !== overlayId),
    }));
    if (customOverlayForm.id === overlayId) {
      setCustomOverlayForm(defaultCustomOverlayForm);
    }
    setSaveStatus('自定义人设已移除，记得保存设置');
  };

  const handleSubmitAccount = async () => {
    if (!accountForm.handle.trim()) {
      setAccountStatus('请先填写账号 handle');
      return;
    }

    await upsertAccountPoolItem({
      id: accountForm.id ?? undefined,
      handle: accountForm.handle,
      displayName: accountForm.displayName,
      category: accountForm.category,
      influenceBand: accountForm.influenceBand || null,
      bio: accountForm.bio,
      priority: accountForm.priority,
      notes: accountForm.notes,
    });
    setAccountForm(defaultAccountPoolForm);
    setAccountEditorOpen(false);
    setAccountStatus(accountForm.id ? '账号已更新' : '账号已加入正式账号池');
  };

  const handleEditAccount = (account: AccountPoolItem) => {
    setAccountForm({
      id: account.id,
      handle: account.handle,
      displayName: account.displayName,
      category: account.category,
      influenceBand: account.influenceBand ?? '',
      bio: account.bio || candidateBioMap[account.handle] || '',
      priority: account.priority,
      notes: account.notes,
    });
    setAccountEditorOpen(true);
    setAccountStatus(`正在编辑 @${account.handle}`);
  };

  const handleOpenAccountEditor = () => {
    if (accountEditorOpen && accountForm.id === null) {
      setAccountEditorOpen(false);
      setAccountForm(defaultAccountPoolForm);
      return;
    }

    setAccountForm(defaultAccountPoolForm);
    setAccountEditorOpen(true);
    setAccountStatus('可以手动补充正式账号了');
  };

  const handleToggleWorkspaceBatchMode = (enabled: boolean) => {
    setWorkspaceBatchMode(enabled);
    if (!enabled) {
      setSelectedCandidateIds([]);
      setSelectedAccountIds([]);
    }
  };

  const handleToggleCandidateSelection = (candidateId: string) => {
    setSelectedCandidateIds((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : Array.from(new Set([...current, candidateId])),
    );
  };

  const handleToggleAccountSelection = (accountId: string) => {
    setSelectedAccountIds((current) =>
      current.includes(accountId)
        ? current.filter((id) => id !== accountId)
        : Array.from(new Set([...current, accountId])),
    );
  };

  const handleSelectCandidateIds = (ids: string[], scopeLabel: string) => {
    setSelectedCandidateIds(ids);
    setCandidateStatus(
      ids.length > 0 ? `已选择${scopeLabel}的 ${ids.length} 个候选账号` : '当前没有可选候选账号',
    );
  };

  const handleSelectAccountIds = (ids: string[], scopeLabel: string) => {
    setSelectedAccountIds(ids);
    setAccountStatus(
      ids.length > 0 ? `已选择${scopeLabel}的 ${ids.length} 个正式账号` : '当前没有可选正式账号',
    );
  };

  const handleBatchSelectCurrentCandidatePage = () => {
    const ids = pagedCandidates.items.map((candidate) => candidate.id);
    handleSelectCandidateIds(ids, '当前页');
  };

  const handleBatchSelectAllFilteredCandidates = () => {
    handleSelectCandidateIds(filteredCandidateIds, '筛选结果');
  };

  const handleBatchSelectCurrentAccountPage = () => {
    const ids = pagedAccounts.items.map((account) => account.id);
    handleSelectAccountIds(ids, '当前页');
  };

  const handleBatchSelectAllFilteredAccounts = () => {
    handleSelectAccountIds(filteredAccountIds, '筛选结果');
  };

  const handleBatchImportCandidates = async (overrideCategory: AccountPoolCategory | null) => {
    if (selectedCandidateIds.length === 0) {
      setCandidateStatus('请先选择至少一个候选账号');
      return;
    }

    await importCandidateToAccountPool(selectedCandidateIds, overrideCategory);
    setSelectedCandidateIds([]);
    setCandidateStatus(
      overrideCategory
        ? `已批量加入正式账号池，并统一标记为「${getAccountCategoryLabel(overrideCategory)}」`
        : '已按建议批量加入正式账号池',
    );
  };

  const handleBatchIgnoreCandidates = async () => {
    if (selectedCandidateIds.length === 0) {
      setCandidateStatus('请先选择至少一个候选账号');
      return;
    }

    for (const candidateId of selectedCandidateIds) {
      await ignoreCandidateAccount(candidateId);
    }

    setSelectedCandidateIds([]);
    setCandidateStatus('已把选中候选账号标记为忽略');
  };

  const handleBatchRestoreCandidates = async () => {
    if (selectedCandidateIds.length === 0) {
      setCandidateStatus('请先选择至少一个候选账号');
      return;
    }

    for (const candidateId of selectedCandidateIds) {
      await restoreCandidateAccount(candidateId);
    }

    setSelectedCandidateIds([]);
    setCandidateStatus('已把选中候选账号恢复到待处理');
  };

  const handleDirectUpdateCandidateCategory = async (
    candidateId: string,
    nextCategory: AccountPoolCategory | null,
  ) => {
    await updateCandidateAccountCategory(candidateId, nextCategory);
    setCandidateStatus(
      nextCategory
        ? `已把候选账号改成「${getAccountCategoryLabel(nextCategory)}」`
        : '已把候选账号改成待判断',
    );
  };

  const handleDirectUpdateAccountCategory = async (
    account: AccountPoolItem,
    nextCategory: AccountPoolCategory,
  ) => {
    await upsertAccountPoolItem({
      id: account.id,
      handle: account.handle,
      displayName: account.displayName,
      category: nextCategory,
      influenceBand: account.influenceBand,
      priority: account.priority,
      notes: account.notes,
    });
    setAccountStatus(`已把 @${account.handle} 改成「${getAccountCategoryLabel(nextCategory)}」`);
  };

  const handleDirectUpdateAccountInfluence = async (
    account: AccountPoolItem,
    nextInfluenceBand: AccountInfluenceBand | null,
  ) => {
    await upsertAccountPoolItem({
      id: account.id,
      handle: account.handle,
      displayName: account.displayName,
      category: account.category,
      influenceBand: nextInfluenceBand,
      priority: account.priority,
      notes: account.notes,
    });
    setAccountStatus(
      `已把 @${account.handle} 的粉丝量级改成「${getInfluenceBandLabel(nextInfluenceBand)}」`,
    );
  };

  const handleBatchMoveAccounts = async (targetStatus: 'pending' | 'ignored') => {
    if (selectedAccountIds.length === 0) {
      setAccountStatus('请先选择至少一个正式账号');
      return;
    }

    for (const accountId of selectedAccountIds) {
      await moveAccountPoolItemToCandidateState(accountId, targetStatus);
    }

    setSelectedAccountIds([]);
    setAccountStatus(targetStatus === 'ignored' ? '已批量移到已忽略' : '已批量打回待处理');
  };

  const handleBatchDeleteAccounts = async () => {
    if (selectedAccountIds.length === 0) {
      setAccountStatus('请先选择至少一个正式账号');
      return;
    }

    for (const accountId of selectedAccountIds) {
      await deleteAccountPoolItem(accountId);
    }

    setSelectedAccountIds([]);
    setAccountStatus('已批量删除选中账号');
  };

  const saveButtonLabel = saveStatus.startsWith('正在')
    ? '保存中...'
    : saveStatus.startsWith('已保存') || saveStatus.startsWith('今日目标已自动保存')
      ? '已保存'
      : saveStatus.startsWith('已恢复')
        ? '已恢复默认'
        : '保存并重建今天任务';
  const getExportButtonLabel = (key: string, label: string) => {
    if (exportBusyKey === key) {
      return '导出中...';
    }

    if (recentExportKey === key) {
      return '已导出';
    }

    return label;
  };
  const getImportButtonLabel = (key: string, label: string) => {
    if (importBusyKey === key) {
      return '导入中...';
    }

    if (recentImportKey === key) {
      return '已导入';
    }

    return label;
  };
  const workspaceView =
    candidateStatusFilter === 'active'
      ? 'active'
      : candidateStatusFilter === 'ignored'
        ? 'ignored'
        : 'pending';

  return (
    <main class="coach-shell min-h-screen px-5 py-8">
      <div class="mx-auto max-w-6xl">
        <header class="mb-6">
                  <p class="mb-2 text-[11px] font-bold uppercase tracking-[0.26em] text-slate-500">
                    X Growth Task Coach
                  </p>
                  <h1
                    class="m-0 text-4xl leading-none text-slate-900"
                    style={{ fontFamily: '"Palatino Linotype", Palatino, Georgia, serif' }}
                  >
                    X 增长助手
                  </h1>
          <p class="mt-3 text-sm font-medium text-slate-500">
            JadeAI乐章 @JadeAINotes
          </p>
        </header>

        <nav class="mb-6 flex flex-wrap gap-3">
          {[
            { id: 'setup', label: '执行设置' },
            { id: 'workspace', label: '账号工作台' },
            { id: 'templates', label: '搜索模板' },
          ].map((tab) => (
            <button
              key={tab.id}
              class={`coach-button ${activeTab === tab.id ? 'primary' : 'secondary'}`}
              type="button"
              onClick={() => setActiveTab(tab.id as SettingsTab)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'setup' ? (
          <section class="coach-grid gap-6">
            <section class="coach-panel rounded-[28px] p-6">
              <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 class="m-0 text-2xl text-slate-900">基础设置</h2>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    class="coach-button primary px-3.5 py-2 text-sm"
                    type="button"
                    onClick={() => void handleSaveSettings()}
                  >
                    {saveButtonLabel}
                  </button>
                  <button
                    class="coach-button secondary px-3.5 py-2 text-sm"
                    type="button"
                    onClick={() => void handleResetSettings()}
                  >
                    恢复默认
                  </button>
                </div>
              </div>

              <div class="coach-grid two mb-4">
                <div>
                  <label class="coach-label" for="account-handle">
                    你的 X handle
                  </label>
                  <input
                    id="account-handle"
                    class="coach-select"
                    placeholder="@yourname"
                    value={settings.accountHandle}
                    onInput={(event) => updateField('accountHandle', event.currentTarget.value)}
                  />
                </div>
                <div>
                  <label class="coach-label" for="stage-selector">
                    当前阶段
                  </label>
                  <select
                    id="stage-selector"
                    class="coach-select"
                    value={settings.currentStageId}
                    onChange={(event) => updateField('currentStageId', event.currentTarget.value)}
                  >
                    {stagePlaybooks.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div class="coach-grid two">
                <label class="coach-toggle">
                  <div>
                    <div class="text-sm font-semibold text-slate-900">自动读取粉丝数</div>
                    <div class="text-xs text-slate-500">打开主页时自动更新</div>
                  </div>
                  <input
                    checked={settings.followerAutoReadEnabled}
                    type="checkbox"
                    onChange={(event) =>
                      updateField('followerAutoReadEnabled', event.currentTarget.checked)
                    }
                  />
                </label>
                <label class="coach-toggle">
                  <div>
                    <div class="text-sm font-semibold text-slate-900">页面悬浮轻面板</div>
                    <div class="text-xs text-slate-500">在页面显示进度和快捷打卡</div>
                  </div>
                  <input
                    checked={settings.contentObserverEnabled}
                    type="checkbox"
                    onChange={(event) =>
                      updateField('contentObserverEnabled', event.currentTarget.checked)
                    }
                  />
                </label>
                <label class="coach-toggle">
                  <div>
                    <div class="text-sm font-semibold text-slate-900">长文识别调试</div>
                    <div class="text-xs text-slate-500">
                      只在排查 Article 时开启
                    </div>
                  </div>
                  <input
                    checked={settings.debugModeEnabled}
                    type="checkbox"
                    onChange={(event) =>
                      updateField('debugModeEnabled', event.currentTarget.checked)
                    }
                  />
                </label>
              </div>

              <details class="coach-task-card mt-4 rounded-[20px] border-[rgba(36,36,36,0.07)] bg-white/70 px-4 py-3">
                <summary class="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900">
                  <span>数据备份与恢复</span>
                  <span class="rounded-full border border-[rgba(36,36,36,0.06)] bg-white/60 px-2.5 py-1 text-[10px] font-medium text-slate-400">
                    备份与导出
                  </span>
                </summary>

                <input
                  ref={importBackupInputRef}
                  accept="application/json,.json"
                  class="hidden"
                  type="file"
                  onChange={(event) => void handleImportFullBackup(event)}
                />

                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    class="coach-button primary px-4 py-2.5 text-sm"
                    disabled={exportBusyKey !== null || importBusyKey !== null}
                    type="button"
                    onClick={() => void handleExportFullBackup()}
                  >
                    {getExportButtonLabel('backup-json', '导出完整备份 JSON')}
                  </button>
                  <button
                    class="coach-button secondary px-4 py-2.5 text-sm"
                    disabled={exportBusyKey !== null || importBusyKey !== null}
                    type="button"
                    onClick={handleTriggerBackupImport}
                  >
                    {getImportButtonLabel('backup-json', '导入完整备份 JSON')}
                  </button>
                </div>

                <div class="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <button
                    class="coach-button secondary justify-center px-4 py-2.5 text-sm"
                    disabled={exportBusyKey !== null || importBusyKey !== null}
                    type="button"
                    onClick={() => void handleExportDailyRecordsCsv()}
                  >
                    {getExportButtonLabel('daily-records-csv', '每日记录 CSV')}
                  </button>
                  <button
                    class="coach-button secondary justify-center px-4 py-2.5 text-sm"
                    disabled={exportBusyKey !== null || importBusyKey !== null}
                    type="button"
                    onClick={() => void handleExportFollowerSnapshotsCsv()}
                  >
                    {getExportButtonLabel('follower-snapshots-csv', '粉丝快照 CSV')}
                  </button>
                  <button
                    class="coach-button secondary justify-center px-4 py-2.5 text-sm"
                    disabled={exportBusyKey !== null || importBusyKey !== null}
                    type="button"
                    onClick={() => void handleExportWorkspaceCsv()}
                  >
                    {getExportButtonLabel('workspace-csv', '账号工作台 CSV')}
                  </button>
                  <button
                    class="coach-button secondary justify-center px-4 py-2.5 text-sm"
                    disabled={exportBusyKey !== null || importBusyKey !== null}
                    type="button"
                    onClick={() => void handleExportDailyReviewsCsv()}
                  >
                    {getExportButtonLabel('daily-reviews-csv', '每日复盘 CSV')}
                  </button>
                </div>
              </details>

              {settings.debugModeEnabled ? (
                <details class="coach-task-card mt-4 rounded-[24px] p-4">
                  <summary class="cursor-pointer text-sm font-semibold text-slate-900">
                    最近长文事件（{articleDebugLogs.length}）
                  </summary>
                  <div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p class="m-0 min-w-0 text-xs leading-5 text-slate-500">
                      只保留最近事件，便于核对发布过程
                    </p>
                    <div class="flex items-center gap-2">
                      <button
                        class="coach-button secondary px-3 py-1.5 text-xs"
                        type="button"
                        onClick={handleExportArticleDebugLogs}
                      >
                        导出日志
                      </button>
                      <button
                        class="coach-button secondary px-3 py-1.5 text-xs"
                        type="button"
                        onClick={() => void handleClearArticleDebugLogs()}
                      >
                        清空
                      </button>
                    </div>
                  </div>
                  <div class="mt-3 grid gap-2">
                    {articleDebugLogs.length === 0 ? (
                      <div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                        暂无记录，开启调试后发一篇 Article 再查看
                      </div>
                    ) : (
                      articleDebugLogs
                        .slice()
                        .reverse()
                        .map((log, index) => (
                          <article
                            class="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3"
                            key={`${log.timestamp}-${log.type}-${index}`}
                          >
                            <div class="flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-slate-500">
                              <span>{new Date(log.timestamp).toLocaleString('zh-CN')}</span>
                              <span class="rounded-full border border-slate-200 px-2 py-0.5 font-semibold text-slate-600">
                                {log.state}
                              </span>
                              <span class="rounded-full border border-slate-200 px-2 py-0.5 font-semibold text-slate-600">
                                {log.type}
                              </span>
                            </div>
                            <p class="m-0 mt-2 text-sm leading-6 text-slate-800">{log.detail}</p>
                            <div class="mt-2 grid min-w-0 gap-1 text-[11px] text-slate-500">
                              {log.path ? (
                                <div class="min-w-0">
                                  <span class="font-medium text-slate-600">页面：</span>
                                  <span class="break-all">{log.path}</span>
                                </div>
                              ) : null}
                              {log.endpoint ? (
                                <div class="min-w-0">
                                  <span class="font-medium text-slate-600">接口：</span>
                                  <span class="break-all">{log.endpoint}</span>
                                </div>
                              ) : null}
                              {log.requestKind ? (
                                <div class="min-w-0">
                                  <span class="font-medium text-slate-600">请求：</span>
                                  <span>{log.requestKind}</span>
                                </div>
                              ) : null}
                              {log.responseKeys?.length ? (
                                <div class="min-w-0">
                                  <span class="font-medium text-slate-600">字段：</span>
                                  <span class="break-words">
                                    {formatDebugResponseKeys(log.responseKeys)}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </article>
                        ))
                    )}
                  </div>
                </details>
              ) : null}

              {settings.debugModeEnabled ? (
                <details class="coach-task-card mt-4 rounded-[24px] p-4">
                  <summary class="cursor-pointer text-sm font-semibold text-slate-900">
                    最近短推事件（{shortPostDebugLogs.length}）
                  </summary>
                  <div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p class="m-0 min-w-0 text-xs leading-5 text-slate-500">
                      只保留最近事件，便于核对短推识别
                    </p>
                    <div class="flex items-center gap-2">
                      <button
                        class="coach-button secondary px-3 py-1.5 text-xs"
                        type="button"
                        onClick={handleExportShortPostDebugLogs}
                      >
                        导出日志
                      </button>
                      <button
                        class="coach-button secondary px-3 py-1.5 text-xs"
                        type="button"
                        onClick={() => void handleClearShortPostDebugLogs()}
                      >
                        清空
                      </button>
                    </div>
                  </div>
                  <div class="mt-3 grid gap-2">
                    {shortPostDebugLogs.length === 0 ? (
                      <div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                        暂无记录，开启调试后发一条短推再查看
                      </div>
                    ) : (
                      shortPostDebugLogs
                        .slice()
                        .reverse()
                        .map((log, index) => (
                          <article
                            class="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3"
                            key={`${log.timestamp}-${log.type}-${index}`}
                          >
                            <div class="flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-slate-500">
                              <span>{new Date(log.timestamp).toLocaleString('zh-CN')}</span>
                              <span class="rounded-full border border-slate-200 px-2 py-0.5 font-semibold text-slate-600">
                                {log.state}
                              </span>
                              <span class="rounded-full border border-slate-200 px-2 py-0.5 font-semibold text-slate-600">
                                {log.type}
                              </span>
                            </div>
                            <p class="m-0 mt-2 text-sm leading-6 text-slate-800">{log.detail}</p>
                            <div class="mt-2 grid min-w-0 gap-1 text-[11px] text-slate-500">
                              {log.path ? (
                                <div class="min-w-0">
                                  <span class="font-medium text-slate-600">页面：</span>
                                  <span class="break-all">{log.path}</span>
                                </div>
                              ) : null}
                              {log.endpoint ? (
                                <div class="min-w-0">
                                  <span class="font-medium text-slate-600">接口：</span>
                                  <span class="break-all">{log.endpoint}</span>
                                </div>
                              ) : null}
                              {log.requestKind ? (
                                <div class="min-w-0">
                                  <span class="font-medium text-slate-600">请求：</span>
                                  <span>{log.requestKind}</span>
                                </div>
                              ) : null}
                              {log.responseKeys?.length ? (
                                <div class="min-w-0">
                                  <span class="font-medium text-slate-600">字段：</span>
                                  <span class="break-words">
                                    {formatDebugResponseKeys(log.responseKeys)}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </article>
                        ))
                    )}
                  </div>
                </details>
              ) : null}
            </section>

            <section class="coach-grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
              <section class="coach-panel rounded-[28px] p-6">
                <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 class="m-0 text-2xl text-slate-900">近一年热力图</h2>
                  </div>
                  <span class="rounded-full border border-[rgba(36,36,36,0.12)] bg-white/75 px-3 py-1 text-[11px] font-medium text-[#4e4d4d]">
                    {formatHeatmapRangeLabel('year')} ·{' '}
                    {formatHeatmapDateRange(yearlyHeatmapView.startDate, yearlyHeatmapView.endDate)}
                  </span>
                </div>

                <div class="rounded-[24px] border border-[rgba(36,36,36,0.08)] bg-white/82 p-5">
                  <ActivityHeatmap records={dailyRecords} range="year" />
                  <div class="mt-4 grid gap-2.5 border-t border-[rgba(36,36,36,0.08)] pt-4 sm:grid-cols-3">
                    <div class="rounded-[18px] border border-[rgba(36,36,36,0.06)] bg-[rgba(207,218,245,0.1)] px-3.5 py-3">
                      <p class="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#797776]">
                        完成天数
                      </p>
                      <p class="mt-2 text-[24px] font-semibold leading-none text-slate-900">
                        {yearlyHeatmapView.stats.completedDays}
                      </p>
                    </div>
                    <div class="rounded-[18px] border border-[rgba(36,36,36,0.06)] bg-[rgba(207,218,245,0.1)] px-3.5 py-3">
                      <p class="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#797776]">
                        平均完成率
                      </p>
                      <p class="mt-2 text-[24px] font-semibold leading-none text-slate-900">
                        {yearlyHeatmapView.stats.averageCompletionRate}%
                      </p>
                    </div>
                    <div class="rounded-[18px] border border-[rgba(36,36,36,0.06)] bg-[rgba(207,218,245,0.1)] px-3.5 py-3">
                      <p class="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#797776]">
                        最长连续打卡
                      </p>
                      <p class="mt-2 text-[24px] font-semibold leading-none text-slate-900">
                        {yearlyHeatmapView.stats.longestStreak} 天
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section class="coach-panel rounded-[28px] p-6">
                <div class="mb-4">
                  <h2 class="m-0 text-2xl text-slate-900">粉丝变化</h2>
                </div>

                <div class="rounded-[24px] border border-[rgba(36,36,36,0.08)] bg-white/82 p-5">
                  <div class="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p class="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#797776]">
                        当前粉丝
                      </p>
                      <div class="mt-3 flex items-end gap-2">
                        <p class="m-0 text-[40px] font-semibold leading-none text-slate-900">
                          {typeof followerSummary?.todayCount === 'number'
                            ? followerSummary.todayCount.toLocaleString('en-US')
                            : '--'}
                        </p>
                        <span class="mb-1 rounded-full border border-[rgba(36,36,36,0.12)] bg-[rgba(207,218,245,0.32)] px-2.5 py-1 text-[11px] font-medium text-[#4e4d4d]">
                          {formatFollowerDelta(followerSummary?.deltaFromPrevious ?? null)}
                        </span>
                      </div>
                    </div>
                    <span class="rounded-full border border-[rgba(36,36,36,0.1)] bg-white/64 px-3 py-1 text-[11px] font-medium text-[#797776]">
                      最近 30 天
                    </span>
                  </div>

                  <div class="rounded-[20px] border border-[rgba(36,36,36,0.08)] bg-[rgba(207,218,245,0.14)] px-4 py-4">
                    <div class="mb-3 flex items-center justify-between text-[11px] text-[#797776]">
                      <span>{followerTrend.length > 1 ? '最近趋势' : '样本不足'}</span>
                      <span>
                        {typeof followerSummary?.todayCount === 'number'
                          ? `${followerSummary.todayCount.toLocaleString('en-US')} 粉`
                          : '暂无粉丝数据'}
                      </span>
                    </div>
                    <div class={followerTrendPoints.length > 1 ? 'h-[96px]' : 'h-[28px]'}>
                      <FollowerSparkline
                        height={followerTrendPoints.length > 1 ? 108 : 32}
                        points={followerTrendPoints}
                      />
                    </div>
                    <div class="mt-3 flex items-center justify-between text-[11px] text-[#797776]">
                      <span>{followerTrend.length > 0 ? followerTrend[0]?.date : '暂无起点'}</span>
                      <span>
                        {followerTrend.length > 0
                          ? followerTrend[followerTrend.length - 1]?.date
                          : '暂无终点'}
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </section>

            <div class="coach-grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <section class="coach-panel rounded-[28px] p-6">
                <div class="mb-4">
                  <h2 class="m-0 text-2xl text-slate-900">执行强度与每日数量</h2>
                </div>

                <div class="rounded-[22px] border border-slate-200 bg-white/80 p-2">
                  <div class="grid grid-cols-4 gap-2">
                    {intensityModeOptions.map((option) => {
                      const active = activeIntensityMode === option.value;
                      return (
                        <button
                          key={option.value}
                          class={`rounded-full px-3 py-2 text-sm font-medium transition ${
                            active
                              ? 'bg-slate-900 text-white shadow-sm'
                              : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                          }`}
                          type="button"
                          onClick={() => handleSelectIntensityMode(option.value)}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div class="mt-4 overflow-hidden rounded-[22px] border border-slate-200 bg-white">
                  {adjustableTasks.map((task) => {
                    const effectiveTarget =
                      settings.taskTargetOverrides[task.taskId] ?? task.target;
                    return (
                      <label
                        class="grid grid-cols-[minmax(0,1fr)_92px_64px] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
                        key={task.taskId}
                      >
                        <div class="min-w-0">
                          <div class="text-sm font-medium text-slate-900">{task.label}</div>
                          <div class="mt-1 text-xs leading-5 text-slate-500">
                            {taskSubtitleMap[task.taskId] ?? '完成一次真实动作后计入今日目标'}
                          </div>
                        </div>
                        <input
                          class="coach-select h-10 w-full rounded-xl border-slate-200 px-3 text-right"
                          min={0}
                          type="number"
                          value={effectiveTarget}
                          onInput={(event) => {
                            const nextValue = Number(event.currentTarget.value);
                            updateTaskTargetOverride(
                              task.taskId,
                              Number.isFinite(nextValue) ? nextValue : null,
                              task.target,
                            );
                          }}
                        />
                        <span class="text-right text-xs text-slate-500">{task.unit}</span>
                      </label>
                    );
                  })}
                </div>
              </section>

              <section class="coach-panel rounded-[28px] p-6">
                <div class="mb-4">
                  <h2 class="m-0 text-2xl text-slate-900">人设叠加</h2>
                  <p class="mt-2 text-sm leading-6 text-slate-600">
                    会影响模板、建议和候选关键词判断
                  </p>
                  <div class="mt-3 flex flex-wrap gap-2">
                    {activeOverlayDefinitions.map((overlay) => (
                      <span
                        class="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700"
                        key={`active-${overlay.id}`}
                      >
                        {overlay.name}
                      </span>
                    ))}
                    {activeOverlayDefinitions.length === 0 ? (
                        <span class="text-xs text-slate-500">还未选择人设</span>
                    ) : null}
                  </div>
                </div>

                <div class="grid gap-3 lg:grid-cols-2">
                  {allOverlayDefinitions.map((overlay) => (
                    <label
                      class={`coach-task-card rounded-[22px] p-4 ${settings.overlayIds.includes(overlay.id) ? 'ring-2 ring-slate-900/10' : ''}`}
                      key={overlay.id}
                    >
                      <div class="flex items-start gap-3">
                        <input
                          checked={settings.overlayIds.includes(overlay.id)}
                          type="checkbox"
                          onChange={(event) =>
                            toggleOverlay(overlay.id, event.currentTarget.checked)
                          }
                        />
                        <div class="min-w-0">
                          <div class="flex items-center gap-2">
                            <p class="m-0 text-sm font-semibold text-slate-900">{overlay.name}</p>
                            <span class="coach-badge rounded-full px-3 py-1 text-xs text-slate-600">
                              {overlay.source === 'builtin' ? '内置' : '自定义'}
                            </span>
                          </div>
                          <p class="m-0 mt-2 text-xs leading-5 text-slate-600">
                            {overlay.description}
                          </p>
                          {overlay.source === 'custom' ? (
                            <div class="mt-3 flex gap-2">
                              <button
                                class="coach-button secondary"
                                type="button"
                                onClick={() => {
                                  const matchedOverlay = settings.customOverlays.find(
                                    (item) => item.id === overlay.id,
                                  );
                                  if (matchedOverlay) {
                                    handleEditCustomOverlay(matchedOverlay);
                                  }
                                }}
                              >
                                编辑
                              </button>
                              <button
                                class="coach-button secondary"
                                type="button"
                                onClick={() => handleDeleteCustomOverlay(overlay.id)}
                              >
                                删除
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                <details class="coach-task-card mt-5 rounded-[24px] p-4">
                  <summary class="cursor-pointer text-sm font-semibold text-slate-900">
                    新建或编辑自定义人设
                  </summary>
                  <div class="mt-4 coach-grid">
                    <div class="coach-grid two">
                      <div>
                        <label class="coach-label">名称</label>
                        <input
                          class="coach-select"
                          placeholder="例如：简中 AI 产品观察者"
                          value={customOverlayForm.name}
                          onInput={(event) =>
                            updateCustomOverlayForm('name', event.currentTarget.value)
                          }
                        />
                      </div>
                      <div>
                        <label class="coach-label">说明</label>
                        <input
                          class="coach-select"
                          placeholder="一句话描述这个人设"
                          value={customOverlayForm.description}
                          onInput={(event) =>
                            updateCustomOverlayForm('description', event.currentTarget.value)
                          }
                        />
                      </div>
                    </div>

                    <div class="coach-grid two">
                      <div>
                        <label class="coach-label">关键词</label>
                        <textarea
                          class="coach-select min-h-[110px]"
                          placeholder="每行一个，也可以用逗号分隔"
                          value={customOverlayForm.keywordsText}
                          onInput={(event) =>
                            updateCustomOverlayForm('keywordsText', event.currentTarget.value)
                          }
                        />
                      </div>
                      <div>
                        <label class="coach-label">选题提示</label>
                        <textarea
                          class="coach-select min-h-[110px]"
                          placeholder="例如：今天解决了哪个真实问题"
                          value={customOverlayForm.topicSuggestionsText}
                          onInput={(event) =>
                            updateCustomOverlayForm(
                              'topicSuggestionsText',
                              event.currentTarget.value,
                            )
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label class="coach-label">表达规则</label>
                      <textarea
                        class="coach-select min-h-[96px]"
                        placeholder="例如：优先讲真实结果，不要空泛"
                        value={customOverlayForm.toneRulesText}
                        onInput={(event) =>
                          updateCustomOverlayForm('toneRulesText', event.currentTarget.value)
                        }
                      />
                    </div>

                    <div class="flex flex-wrap gap-2">
                      <button
                        class="coach-button primary"
                        type="button"
                        onClick={() => void handleSubmitCustomOverlay()}
                      >
                        {customOverlayForm.id ? '更新自定义人设' : '加入自定义人设'}
                      </button>
                      <button
                        class="coach-button secondary"
                        type="button"
                        onClick={() => setCustomOverlayForm(defaultCustomOverlayForm)}
                      >
                        清空
                      </button>
                    </div>
                  </div>
                </details>
              </section>
            </div>
          </section>
        ) : null}

        {activeTab === 'workspace' ? (
          <section class="coach-grid gap-6">
            <section class="coach-panel rounded-[28px] p-6">
              <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 class="m-0 text-2xl text-slate-900">账号工作台</h2>
                  <p class="mt-2 text-sm leading-6 text-slate-600">
                    统一处理待处理、已入池和已忽略账号
                  </p>
                </div>
              </div>
              <div class="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div class="flex flex-wrap gap-2">
                  {[
                    { id: 'pending', label: '待处理' },
                    { id: 'active', label: '已入池' },
                    { id: 'ignored', label: '已忽略' },
                  ].map((view) => (
                    <button
                      key={view.id}
                      class={`coach-button ${workspaceView === view.id ? 'primary' : 'secondary'}`}
                      type="button"
                      onClick={() => {
                        setCandidateStatusFilter(view.id as CandidateStatusFilter);
                        setCandidatePage(1);
                        setAccountPage(1);
                        setSelectedCandidateIds([]);
                        setSelectedAccountIds([]);
                        setWorkspaceBatchMode(false);
                      }}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>

                <div class="flex min-w-0 flex-1 gap-2">
                  <input
                    class="coach-select min-w-0 flex-1"
                    placeholder="搜索 handle、bio 或备注"
                    value={workspaceSearch}
                    onInput={(event) => {
                      setWorkspaceSearch(event.currentTarget.value);
                      setCandidatePage(1);
                      setAccountPage(1);
                    }}
                  />
                  <button
                    class={`coach-button ${workspaceBatchMode ? 'primary' : 'secondary'} shrink-0`}
                    type="button"
                    onClick={() => handleToggleWorkspaceBatchMode(!workspaceBatchMode)}
                  >
                    {workspaceBatchMode ? '退出批量' : '批量处理'}
                  </button>
                  <button
                    class={`coach-button ${accountEditorOpen && accountForm.id === null ? 'primary' : 'secondary'} shrink-0`}
                    type="button"
                    onClick={() => handleOpenAccountEditor()}
                  >
                    手动添加账号
                  </button>
                </div>
              </div>

              <div class="mb-4 flex flex-wrap gap-2">
                <select
                  class="coach-select min-w-[150px] flex-1"
                  value={workspaceSourceFilter}
                  onChange={(event) => {
                    setWorkspaceSourceFilter(event.currentTarget.value as WorkspaceSourceFilter);
                    setCandidatePage(1);
                    setAccountPage(1);
                  }}
                >
                  <option value="all">全部来源</option>
                  <option value="from_following">Following</option>
                  <option value="from_followers">Followers</option>
                  <option value="manual">手动添加</option>
                  <option value="unknown">来源未知</option>
                </select>
                {workspaceView !== 'active' ? (
                  <select
                    class="coach-select min-w-[150px] flex-1"
                    value={candidateCategoryFilter}
                    onChange={(event) => {
                      setCandidateCategoryFilter(
                        event.currentTarget.value as 'all' | AccountPoolCategory | 'none',
                      );
                      setCandidatePage(1);
                    }}
                  >
                    <option value="all">全部标签</option>
                    <option value="peer">同生态</option>
                    <option value="benchmark">对标学习</option>
                    <option value="none">待判断</option>
                  </select>
                ) : (
                  <select
                    class="coach-select min-w-[150px] flex-1"
                    value={accountCategoryFilter}
                    onChange={(event) => {
                      setAccountCategoryFilter(
                        event.currentTarget.value as 'all' | AccountPoolCategory,
                      );
                      setAccountPage(1);
                    }}
                  >
                    <option value="all">全部标签</option>
                    <option value="peer">同生态</option>
                    <option value="benchmark">对标学习</option>
                  </select>
                )}
                <select
                  class="coach-select min-w-[170px] flex-1"
                  value={
                    workspaceView !== 'active' ? candidateInfluenceFilter : accountInfluenceFilter
                  }
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value as 'all' | AccountInfluenceBand;
                    if (workspaceView !== 'active') {
                      setCandidateInfluenceFilter(nextValue);
                      setCandidatePage(1);
                    } else {
                      setAccountInfluenceFilter(nextValue);
                      setAccountPage(1);
                    }
                  }}
                >
                  <option value="all">全部粉丝量级</option>
                  {accountInfluenceBandOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <button
                  class="coach-button secondary"
                  type="button"
                  onClick={() => {
                    setWorkspaceSearch('');
                    setWorkspaceSourceFilter('all');
                    setCandidateCategoryFilter('all');
                    setCandidateInfluenceFilter('all');
                    setAccountCategoryFilter('all');
                    setAccountInfluenceFilter('all');
                    setCandidatePage(1);
                    setAccountPage(1);
                  }}
                >
                  清空筛选
                </button>
              </div>

              {accountEditorOpen ? (
                <section class="coach-task-card mb-5 rounded-[24px] p-4">
                  <div class="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p class="m-0 text-sm font-semibold text-slate-900">
                        {accountForm.id ? '编辑正式账号' : '手动添加正式账号'}
                      </p>
                      <p class="m-0 mt-1 text-xs leading-5 text-slate-500">
                        补充一个长期跟进的账号，后续互动会直接命中
                      </p>
                    </div>
                  </div>

                  <div class="coach-grid gap-3">
                    <div class="coach-grid two">
                      <div>
                        <label class="coach-label">handle</label>
                        <input
                          class="coach-select"
                          placeholder="@handle"
                          value={accountForm.handle}
                          onInput={(event) =>
                            updateAccountForm('handle', event.currentTarget.value)
                          }
                        />
                      </div>
                      <div>
                        <label class="coach-label">显示名</label>
                        <input
                          class="coach-select"
                          placeholder="显示名称"
                          value={accountForm.displayName}
                          onInput={(event) =>
                            updateAccountForm('displayName', event.currentTarget.value)
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label class="coach-label">bio</label>
                      <textarea
                        class="coach-select min-h-[88px]"
                        placeholder="贴一段简介，方便后面统一展示"
                        value={accountForm.bio}
                        onInput={(event) => updateAccountForm('bio', event.currentTarget.value)}
                      />
                    </div>

                    <div class="coach-grid two">
                      <div>
                        <label class="coach-label">标签</label>
                        <select
                          class="coach-select"
                          value={accountForm.category}
                          onChange={(event) =>
                            updateAccountForm(
                              'category',
                              event.currentTarget.value as AccountPoolCategory,
                            )
                          }
                        >
                          {accountCategoryOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label class="coach-label">粉丝量级</label>
                        <select
                          class="coach-select"
                          value={accountForm.influenceBand}
                          onChange={(event) =>
                            updateAccountForm(
                              'influenceBand',
                              event.currentTarget.value as AccountInfluenceBand | '',
                            )
                          }
                        >
                          <option value="">待测量级</option>
                          {accountInfluenceBandOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div class="coach-grid two">
                      <div>
                        <label class="coach-label">优先级</label>
                        <select
                          class="coach-select"
                          value={accountForm.priority}
                          onChange={(event) =>
                            updateAccountForm(
                              'priority',
                              event.currentTarget.value as AccountPoolPriority,
                            )
                          }
                        >
                          {accountPriorityOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label class="coach-label">备注</label>
                        <input
                          class="coach-select"
                          placeholder="例如：适合拆结构、适合评论"
                          value={accountForm.notes}
                          onInput={(event) => updateAccountForm('notes', event.currentTarget.value)}
                        />
                      </div>
                    </div>

                    <div class="flex flex-wrap gap-2">
                      <button
                        class="coach-button primary"
                        type="button"
                        onClick={() => void handleSubmitAccount()}
                      >
                        {accountForm.id ? '更新账号' : '加入账号池'}
                      </button>
                      <button
                        class="coach-button secondary"
                        type="button"
                        onClick={() => setAccountForm(defaultAccountPoolForm)}
                      >
                        清空表单
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}

              {workspaceBatchMode ? (
                <div class="mb-4 flex flex-wrap items-center gap-2 rounded-[20px] border border-slate-200 bg-slate-50/80 px-3 py-3">
                  <span class="text-sm font-semibold text-slate-700">
                    已选{' '}
                    {workspaceView === 'active'
                      ? selectedAccountIds.length
                      : selectedCandidateIds.length}{' '}
                    个
                  </span>
                  {workspaceView === 'active' ? (
                    <>
                      <button
                        class="coach-button secondary"
                        type="button"
                        onClick={handleBatchSelectCurrentAccountPage}
                      >
                        全选当前页
                      </button>
                      <button
                        class="coach-button secondary"
                        type="button"
                        onClick={handleBatchSelectAllFilteredAccounts}
                      >
                        全选筛选结果
                      </button>
                      <button
                        class="coach-button secondary"
                        type="button"
                        onClick={() => setSelectedAccountIds([])}
                      >
                        清空
                      </button>
                      <button
                        class="coach-button secondary"
                        disabled={selectedAccountIds.length === 0}
                        type="button"
                        onClick={() => void handleBatchMoveAccounts('pending')}
                      >
                        打回待处理
                      </button>
                      <button
                        class="coach-button secondary"
                        disabled={selectedAccountIds.length === 0}
                        type="button"
                        onClick={() => void handleBatchMoveAccounts('ignored')}
                      >
                        移到已忽略
                      </button>
                      <button
                        class="coach-button secondary"
                        disabled={selectedAccountIds.length === 0}
                        type="button"
                        onClick={() => void handleBatchDeleteAccounts()}
                      >
                        删除
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        class="coach-button secondary"
                        type="button"
                        onClick={handleBatchSelectCurrentCandidatePage}
                      >
                        全选当前页
                      </button>
                      <button
                        class="coach-button secondary"
                        type="button"
                        onClick={handleBatchSelectAllFilteredCandidates}
                      >
                        全选筛选结果
                      </button>
                      <button
                        class="coach-button secondary"
                        type="button"
                        onClick={() => setSelectedCandidateIds([])}
                      >
                        清空
                      </button>
                      <button
                        class="coach-button primary"
                        disabled={selectedCandidateIds.length === 0}
                        type="button"
                        onClick={() => void handleBatchImportCandidates(null)}
                      >
                        加入账号池
                      </button>
                      {accountCategoryOptions.map((option) => (
                        <button
                          class="coach-button secondary"
                          disabled={selectedCandidateIds.length === 0}
                          key={`import-${option.value}`}
                          type="button"
                          onClick={() => void handleBatchImportCandidates(option.value)}
                        >
                          设为{option.label}
                        </button>
                      ))}
                      {workspaceView === 'ignored' ? (
                        <button
                          class="coach-button secondary"
                          disabled={selectedCandidateIds.length === 0}
                          type="button"
                          onClick={() => void handleBatchRestoreCandidates()}
                        >
                          恢复
                        </button>
                      ) : (
                        <button
                          class="coach-button secondary"
                          disabled={selectedCandidateIds.length === 0}
                          type="button"
                          onClick={() => void handleBatchIgnoreCandidates()}
                        >
                          忽略
                        </button>
                      )}
                    </>
                  )}
                </div>
              ) : null}

              {workspaceView !== 'active' ? (
                <>
                  <div class="grid gap-4 lg:grid-cols-2">
                    {pagedCandidates.items.map((candidate) => {
                      const checked = selectedCandidateIds.includes(candidate.id);
                      return (
                        <article
                          class={`coach-task-card rounded-[24px] p-4 ${workspaceBatchMode ? 'cursor-pointer transition ring-1 ring-transparent hover:ring-slate-300' : ''} ${checked ? '!border-slate-900 bg-slate-50/90 ring-slate-900' : ''}`}
                          key={candidate.id}
                          role={workspaceBatchMode ? 'button' : undefined}
                          tabIndex={workspaceBatchMode ? 0 : undefined}
                          onClick={() => {
                            if (workspaceBatchMode) {
                              handleToggleCandidateSelection(candidate.id);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (
                              workspaceBatchMode &&
                              (event.key === 'Enter' || event.key === ' ')
                            ) {
                              event.preventDefault();
                              handleToggleCandidateSelection(candidate.id);
                            }
                          }}
                        >
                          <div class="flex items-start gap-3">
                            <div class="min-w-0 flex-1">
                              <div class="flex flex-wrap items-center gap-2">
                                <span class="text-base font-semibold text-slate-900">
                                  {candidate.displayName || `@${candidate.handle}`}
                                </span>
                                {workspaceBatchMode ? (
                                  <span
                                    class={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${getRoleChipClass(candidate.suggestedCategory)}`}
                                  >
                                    {candidate.suggestedCategory
                                      ? getAccountCategoryLabel(candidate.suggestedCategory)
                                      : '待判断'}
                                  </span>
                                ) : (
                                  <label
                                    class={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${getRoleChipClass(candidate.suggestedCategory)}`}
                                  >
                                    <select
                                      class="bg-transparent text-[11px] font-semibold text-inherit outline-none"
                                      value={candidate.suggestedCategory ?? ''}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(event) =>
                                        void handleDirectUpdateCandidateCategory(
                                          candidate.id,
                                          (event.currentTarget.value ||
                                            null) as AccountPoolCategory | null,
                                        )
                                      }
                                    >
                                      <option value="">待判断</option>
                                      {accountCategoryOptions.map((option) => (
                                        <option
                                          key={`${candidate.id}-${option.value}`}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                )}
                                <span
                                  class={`rounded-full px-3 py-1 text-[11px] font-semibold ${getInfluenceChipClass(candidate.influenceBand)}`}
                                >
                                  {getInfluenceBandLabel(candidate.influenceBand)}
                                </span>
                                {workspaceBatchMode && checked ? (
                                  <span class="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                    已选中
                                  </span>
                                ) : null}
                              </div>
                              <p class="m-0 mt-1 text-sm text-slate-600">@{candidate.handle}</p>
                              <p class="m-0 mt-2 line-clamp-2 text-sm leading-6 text-slate-700">
                                {candidate.bio || '暂无 bio'}
                              </p>
                            </div>
                          </div>

                          <div class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span>{formatCompactFollowerCount(candidate.followersCount)}</span>
                            <span>{getSourceLabel(candidate.source)}</span>
                            <span>置信度 {Math.round(candidate.confidence * 100)}%</span>
                          </div>

                          {!workspaceBatchMode ? (
                            <div class="mt-4 flex flex-wrap gap-2 text-xs">
                              {!candidate.importedToAccountPool ? (
                                <button
                                  class="coach-button secondary"
                                  type="button"
                                  onClick={() =>
                                    void importCandidateToAccountPool([candidate.id], null)
                                  }
                                >
                                  加入账号池
                                </button>
                              ) : null}
                              <button
                                class="coach-button secondary"
                                type="button"
                                onClick={() =>
                                  candidate.ignored
                                    ? void restoreCandidateAccount(candidate.id)
                                    : void ignoreCandidateAccount(candidate.id)
                                }
                              >
                                {candidate.ignored ? '恢复' : '忽略'}
                              </button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>

                  <div class="mt-5 flex items-center justify-between gap-3">
                    <span class="text-sm text-slate-500">
                      第 {pagedCandidates.page} / {pagedCandidates.pageCount} 页 · 共{' '}
                      {filteredCandidates.length} 条
                    </span>
                    <div class="flex gap-2">
                      <button
                        class="coach-button secondary"
                        disabled={pagedCandidates.page <= 1}
                        type="button"
                        onClick={() => setCandidatePage((current) => Math.max(1, current - 1))}
                      >
                        上一页
                      </button>
                      <button
                        class="coach-button secondary"
                        disabled={pagedCandidates.page >= pagedCandidates.pageCount}
                        type="button"
                        onClick={() =>
                          setCandidatePage((current) =>
                            Math.min(pagedCandidates.pageCount, current + 1),
                          )
                        }
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div class="grid gap-4 lg:grid-cols-2">
                    {pagedAccounts.items.map((account) => {
                      const checked = selectedAccountIds.includes(account.id);
                      const accountMeta = candidateMetaMap[account.handle];
                      return (
                        <article
                          class={`coach-task-card rounded-[24px] p-4 ${workspaceBatchMode ? 'cursor-pointer transition ring-1 ring-transparent hover:ring-slate-300' : ''} ${checked ? '!border-slate-900 bg-slate-50/90 ring-slate-900' : ''}`}
                          key={account.id}
                          role={workspaceBatchMode ? 'button' : undefined}
                          tabIndex={workspaceBatchMode ? 0 : undefined}
                          onClick={() => {
                            if (workspaceBatchMode) {
                              handleToggleAccountSelection(account.id);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (
                              workspaceBatchMode &&
                              (event.key === 'Enter' || event.key === ' ')
                            ) {
                              event.preventDefault();
                              handleToggleAccountSelection(account.id);
                            }
                          }}
                        >
                          <div class="flex items-start gap-3">
                            <div class="min-w-0 flex-1">
                              <div class="flex flex-wrap items-center gap-2">
                                <span class="text-base font-semibold text-slate-900">
                                  {account.displayName || `@${account.handle}`}
                                </span>
                                {workspaceBatchMode ? (
                                  <>
                                    <span
                                      class={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${getRoleChipClass(account.category)}`}
                                    >
                                      {getAccountCategoryLabel(account.category)}
                                    </span>
                                    <span
                                      class={`rounded-full px-3 py-1 text-[11px] font-semibold ${getInfluenceChipClass(account.influenceBand ?? accountMeta?.influenceBand ?? null)}`}
                                    >
                                      {getInfluenceBandLabel(
                                        account.influenceBand ?? accountMeta?.influenceBand ?? null,
                                      )}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <label
                                      class={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${getRoleChipClass(account.category)}`}
                                    >
                                      <select
                                        class="bg-transparent text-[11px] font-semibold text-inherit outline-none"
                                        value={account.category}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={(event) =>
                                          void handleDirectUpdateAccountCategory(
                                            account,
                                            event.currentTarget.value as AccountPoolCategory,
                                          )
                                        }
                                      >
                                        {accountCategoryOptions.map((option) => (
                                          <option
                                            key={`${account.id}-${option.value}`}
                                            value={option.value}
                                          >
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label
                                      class={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${getInfluenceChipClass(account.influenceBand ?? accountMeta?.influenceBand ?? null)}`}
                                    >
                                      <select
                                        class="bg-transparent text-[11px] font-semibold text-inherit outline-none"
                                        value={account.influenceBand ?? ''}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={(event) =>
                                          void handleDirectUpdateAccountInfluence(
                                            account,
                                            (event.currentTarget.value ||
                                              null) as AccountInfluenceBand | null,
                                          )
                                        }
                                      >
                                        <option value="">待测量级</option>
                                        {accountInfluenceBandOptions.map((option) => (
                                          <option
                                            key={`${account.id}-${option.value}`}
                                            value={option.value}
                                          >
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  </>
                                )}
                                {workspaceBatchMode && checked ? (
                                  <span class="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                    已选中
                                  </span>
                                ) : null}
                              </div>
                              <p class="m-0 mt-1 text-sm text-slate-600">@{account.handle}</p>
                              <p class="m-0 mt-2 line-clamp-2 text-sm leading-6 text-slate-700">
                                {account.bio ||
                                  accountMeta?.bio ||
                                  candidateBioMap[account.handle] ||
                                  account.notes ||
                                  '暂无 bio'}
                              </p>
                            </div>
                          </div>

                          <div class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span>
                              {formatCompactFollowerCount(accountMeta?.followersCount ?? null)}
                            </span>
                            {accountMeta?.source ? (
                              <span>{getSourceLabel(accountMeta.source)}</span>
                            ) : (
                              <span>{getSourceLabel('manual')}</span>
                            )}
                            <span>最近互动 {formatLastInteractedAt(account.lastInteractedAt)}</span>
                          </div>

                          {!workspaceBatchMode ? (
                            <div class="mt-4 flex flex-wrap gap-2 text-xs">
                              <button
                                class="coach-button secondary"
                                type="button"
                                onClick={() => handleEditAccount(account)}
                              >
                                编辑
                              </button>
                              <button
                                class="coach-button secondary"
                                type="button"
                                onClick={() =>
                                  void moveAccountPoolItemToCandidateState(account.id, 'pending')
                                }
                              >
                                打回待处理
                              </button>
                              <button
                                class="coach-button secondary"
                                type="button"
                                onClick={() =>
                                  void moveAccountPoolItemToCandidateState(account.id, 'ignored')
                                }
                              >
                                移到已忽略
                              </button>
                              <button
                                class="coach-button secondary"
                                type="button"
                                onClick={() => void deleteAccountPoolItem(account.id)}
                              >
                                删除
                              </button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>

                  <div class="mt-5 flex items-center justify-between gap-3">
                    <span class="text-sm text-slate-500">
                      第 {pagedAccounts.page} / {pagedAccounts.pageCount} 页 · 共{' '}
                      {filteredAccounts.length} 条
                    </span>
                    <div class="flex gap-2">
                      <button
                        class="coach-button secondary"
                        disabled={pagedAccounts.page <= 1}
                        type="button"
                        onClick={() => setAccountPage((current) => Math.max(1, current - 1))}
                      >
                        上一页
                      </button>
                      <button
                        class="coach-button secondary"
                        disabled={pagedAccounts.page >= pagedAccounts.pageCount}
                        type="button"
                        onClick={() =>
                          setAccountPage((current) =>
                            Math.min(pagedAccounts.pageCount, current + 1),
                          )
                        }
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </section>
        ) : null}

        {activeTab === 'templates' ? (
          <section class="coach-grid gap-6">
            <section class="coach-panel rounded-[28px] p-6">
              <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 class="m-0 text-2xl text-slate-900">搜索模板</h2>
                  <p class="mt-2 text-sm leading-6 text-slate-600">
                    每天用来找问题、找对标、找互动
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    class="coach-button secondary"
                    type="button"
                    onClick={() => void handleRefreshSystemTemplates()}
                  >
                    按当前人设更新
                  </button>
                  <button
                    class="coach-button secondary"
                    type="button"
                    onClick={() => void handleResetSystemTemplates()}
                  >
                    恢复默认模板
                  </button>
                </div>
              </div>

              <div class="coach-grid two mb-4">
                <div>
                  <label class="coach-label">模板名称</label>
                  <input
                    class="coach-select"
                    placeholder="例如：中文问题帖"
                    value={searchTemplateForm.name}
                    onInput={(event) => updateSearchTemplateForm('name', event.currentTarget.value)}
                  />
                </div>
                <div>
                  <label class="coach-label">模板类型</label>
                  <select
                    class="coach-select"
                    value={searchTemplateForm.category}
                    onChange={(event) =>
                      updateSearchTemplateForm(
                        'category',
                        event.currentTarget.value as SearchTemplateCategory,
                      )
                    }
                  >
                    {searchTemplateCategoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div class="mb-4">
                <label class="coach-label">描述</label>
                <input
                  class="coach-select"
                  placeholder="一句话说明用途"
                  value={searchTemplateForm.description}
                  onInput={(event) =>
                    updateSearchTemplateForm('description', event.currentTarget.value)
                  }
                />
              </div>

              <div class="mb-4">
                <label class="coach-label">查询语句</label>
                <textarea
                  class="coach-select min-h-[120px]"
                  placeholder="输入搜索语句"
                  value={searchTemplateForm.query}
                  onInput={(event) => updateSearchTemplateForm('query', event.currentTarget.value)}
                />
              </div>

              <label class="mb-4 flex items-center gap-3 text-sm text-slate-700">
                <input
                  checked={searchTemplateForm.pinned}
                  type="checkbox"
                  onChange={(event) =>
                    updateSearchTemplateForm('pinned', event.currentTarget.checked)
                  }
                />
                固定到 popup
              </label>

              <div class="mb-6 flex flex-wrap gap-2">
                <button
                  class="coach-button primary"
                  type="button"
                  onClick={() => void handleSubmitSearchTemplate()}
                >
                  {searchTemplateForm.id ? '更新模板' : '保存模板'}
                </button>
                <button
                  class="coach-button secondary"
                  type="button"
                  onClick={() => setSearchTemplateForm(defaultSearchTemplateForm)}
                >
                  清空
                </button>
              </div>

              <div class="grid gap-3">
                {searchTemplates.map((template) => (
                  <article class="coach-task-card rounded-[20px] p-3.5" key={template.id}>
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="m-0 text-sm font-semibold text-slate-900">{template.name}</p>
                        <p class="m-0 mt-1 text-xs leading-5 text-slate-500">
                          {template.description}
                        </p>
                      </div>
                      <a
                        class="coach-button secondary no-underline px-3 py-2 text-xs"
                        href={buildXSearchUrl(template.query)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        前往
                      </a>
                    </div>
                    <p class="mt-2 line-clamp-2 text-[11px] leading-5 text-slate-400">
                      {template.query}
                    </p>
                    <div class="mt-2.5 flex flex-wrap gap-2">
                      <button
                        class="coach-button secondary px-3 py-2 text-xs"
                        type="button"
                        onClick={() => handleEditSearchTemplate(template)}
                      >
                        编辑
                      </button>
                      <button
                        class="coach-button secondary px-3 py-2 text-xs"
                        type="button"
                        onClick={() => void handleDeleteSearchTemplate(template.id)}
                      >
                        删除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </section>
        ) : null}
      </div>
    </main>
  );
}
