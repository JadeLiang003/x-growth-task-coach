export type IntensityPreset = 'conservative' | 'standard' | 'aggressive';
export type TaskTrackingMode = 'auto' | 'manual' | 'mixed';
export type FollowerSnapshotSource = 'auto' | 'manual';
export type AccountPoolCategory = 'peer' | 'benchmark';
export type AccountInfluenceBand = '0_500' | '500_1k' | '1k_5k' | '5k_10k' | '10k_20k' | '20k_plus';
export type AccountPoolPriority = 'low' | 'medium' | 'high';
export type SearchTemplateCategory =
  | 'viral'
  | 'questions'
  | 'niche'
  | 'creator'
  | 'recent'
  | 'custom';
export type CandidateAccountSource = 'from_following' | 'from_followers';
export type ContentFormat = 'short_post' | 'thread' | 'long_post' | 'note' | 'article';
export type ContentFormatGroup = 'short' | 'thread' | 'long_form';
export type ContentRecognitionStatus = 'recognized' | 'unrecognized';

export interface FloatingPanelPosition {
  top: number;
  right: number;
}

export interface CustomOverlayDefinition {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  topicSuggestions: string[];
  toneRules: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ExtensionSettings {
  accountHandle: string;
  currentStageId: string;
  intensityPreset: IntensityPreset;
  overlayIds: string[];
  customOverlays: CustomOverlayDefinition[];
  taskTargetOverrides: Record<string, number>;
  followerAutoReadEnabled: boolean;
  contentObserverEnabled: boolean;
  floatingPanelExpanded: boolean;
  floatingPanelPosition: FloatingPanelPosition;
  debugModeEnabled: boolean;
}

export interface RuntimeSnapshot {
  connected: boolean;
  lastSeenAt: string | null;
  lastSeenPath: string | null;
  lastSeenTitle: string | null;
  source: 'x.com' | 'twitter.com' | null;
}

export interface LastContentRecognition {
  timestamp: string | null;
  format: ContentFormat | null;
  formatGroup: ContentFormatGroup | null;
  status: ContentRecognitionStatus | null;
  summaryLabel: string | null;
  endpoint: string | null;
  fallbackApplied: boolean;
}

export type ArticleRecognitionDebugState =
  | 'idle'
  | 'editing_article'
  | 'publish_dialog_open'
  | 'publish_submitted'
  | 'published';

export interface ArticleRecognitionDebugEntry {
  timestamp: string;
  type: string;
  state: ArticleRecognitionDebugState;
  detail: string;
  endpoint?: string;
  requestKind?: 'fetch' | 'xhr';
  responseKeys?: string[];
  path?: string | null;
}

export type ShortPostRecognitionDebugState =
  | 'idle'
  | 'candidate'
  | 'recognized'
  | 'ignored'
  | 'deduped';

export interface ShortPostRecognitionDebugEntry {
  timestamp: string;
  type: string;
  state: ShortPostRecognitionDebugState;
  detail: string;
  endpoint?: string;
  requestKind?: 'fetch' | 'xhr';
  responseKeys?: string[];
  path?: string | null;
}

export interface DailyTaskProgress {
  taskId: string;
  label: string;
  target: number;
  current: number;
  unit: string;
  mode: TaskTrackingMode;
  category: string;
  completed: boolean;
}

export interface DailyRecord {
  date: string;
  playbookId: string;
  intensityPreset: IntensityPreset;
  overlayIds: string[];
  tasks: DailyTaskProgress[];
  completionRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDashboardSummary {
  todayRecord: DailyRecord;
  streakDays: number;
  consistencyScore: number;
  completedTaskCount: number;
  totalTaskCount: number;
}

export interface FollowerSnapshot {
  date: string;
  handle: string;
  followersCount: number;
  followersDelta: number | null;
  source: FollowerSnapshotSource;
  capturedAt: string;
  path: string | null;
}

export interface AccountPoolItem {
  id: string;
  handle: string;
  displayName: string;
  category: AccountPoolCategory;
  influenceBand: AccountInfluenceBand | null;
  bio: string;
  priority: AccountPoolPriority;
  notes: string;
  lastInteractedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InteractionLog {
  id: string;
  date: string;
  actionType: 'original' | 'reply' | 'quote';
  targetHandle: string | null;
  matchedAccountPoolId: string | null;
  matchedCategory: AccountPoolCategory | null;
  source: 'auto' | 'manual';
  signature: string;
  createdAt: string;
}

export interface SearchTemplate {
  id: string;
  name: string;
  description: string;
  query: string;
  category: SearchTemplateCategory;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateAccount {
  id: string;
  handle: string;
  displayName: string;
  followersCount: number | null;
  followingCount: number | null;
  verified: boolean;
  bio: string;
  source: CandidateAccountSource;
  suggestedCategory: AccountPoolCategory | null;
  influenceBand: AccountInfluenceBand | null;
  suggestionReason: string;
  confidence: number;
  ignored: boolean;
  importedToAccountPool: boolean;
  capturedAt: string;
  updatedAt: string;
}

export interface DailyReviewDraft {
  date: string;
  completionRate: number;
  followersDelta: number | null;
  bestAction: string;
  bestPostUrl: string;
  bestReplyUrl: string;
  bestPostFormatGroup: ContentFormatGroup | null;
  shortContentCount: number;
  threadCount: number;
  longFormCount: number;
  summary: string;
  suggestedNextAction: string;
  xDraft: string;
  createdAt: string;
  updatedAt: string;
}

export interface OriginalContentRecord {
  id: string;
  date: string;
  format: ContentFormat | null;
  formatGroup: ContentFormatGroup | null;
  status: ContentRecognitionStatus;
  source: 'auto' | 'manual';
  endpoint: string;
  signature: string;
  createdAt: string;
}

export interface ExtensionStorageShape {
  settings: ExtensionSettings;
  runtime: RuntimeSnapshot;
  lastContentRecognition: LastContentRecognition;
  articleRecognitionDebugLogs: ArticleRecognitionDebugEntry[];
  shortPostRecognitionDebugLogs: ShortPostRecognitionDebugEntry[];
  dailyRecords: DailyRecord[];
  followerSnapshots: FollowerSnapshot[];
  accountPool: AccountPoolItem[];
  interactionLogs: InteractionLog[];
  searchTemplates: SearchTemplate[];
  candidateAccounts: CandidateAccount[];
  dailyReviewDrafts: DailyReviewDraft[];
  originalContentRecords: OriginalContentRecord[];
}

export const STORAGE_KEYS = {
  settings: 'xGrowthTaskCoach.settings',
  runtime: 'xGrowthTaskCoach.runtime',
  lastContentRecognition: 'xGrowthTaskCoach.lastContentRecognition',
  articleRecognitionDebugLogs: 'xGrowthTaskCoach.articleRecognitionDebugLogs',
  shortPostRecognitionDebugLogs: 'xGrowthTaskCoach.shortPostRecognitionDebugLogs',
  dailyRecords: 'xGrowthTaskCoach.dailyRecords',
  followerSnapshots: 'xGrowthTaskCoach.followerSnapshots',
  accountPool: 'xGrowthTaskCoach.accountPool',
  interactionLogs: 'xGrowthTaskCoach.interactionLogs',
  searchTemplates: 'xGrowthTaskCoach.searchTemplates',
  candidateAccounts: 'xGrowthTaskCoach.candidateAccounts',
  dailyReviewDrafts: 'xGrowthTaskCoach.dailyReviewDrafts',
  originalContentRecords: 'xGrowthTaskCoach.originalContentRecords',
} as const;
