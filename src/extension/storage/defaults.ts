import type {
  AccountPoolItem,
  CandidateAccount,
  DailyRecord,
  DailyReviewDraft,
  ExtensionSettings,
  FollowerSnapshot,
  InteractionLog,
  ArticleRecognitionDebugEntry,
  ShortPostRecognitionDebugEntry,
  LastContentRecognition,
  OriginalContentRecord,
  RuntimeSnapshot,
  SearchTemplate,
} from './schema';

export const defaultSettings: ExtensionSettings = {
  accountHandle: '',
  currentStageId: 'cold_start_0_100',
  intensityPreset: 'standard',
  overlayIds: ['indie_hacker'],
  customOverlays: [],
  taskTargetOverrides: {},
  followerAutoReadEnabled: true,
  contentObserverEnabled: true,
  floatingPanelExpanded: true,
  floatingPanelPosition: {
    top: 88,
    right: 16,
  },
  debugModeEnabled: false,
};

export const defaultRuntimeSnapshot: RuntimeSnapshot = {
  connected: false,
  lastSeenAt: null,
  lastSeenPath: null,
  lastSeenTitle: null,
  source: null,
};

export const defaultLastContentRecognition: LastContentRecognition = {
  timestamp: null,
  format: null,
  formatGroup: null,
  status: null,
  summaryLabel: null,
  endpoint: null,
  fallbackApplied: false,
};

export const defaultArticleRecognitionDebugLogs: ArticleRecognitionDebugEntry[] = [];
export const defaultShortPostRecognitionDebugLogs: ShortPostRecognitionDebugEntry[] = [];

export const defaultDailyRecords: DailyRecord[] = [];
export const defaultFollowerSnapshots: FollowerSnapshot[] = [];
export const defaultAccountPool: AccountPoolItem[] = [];
export const defaultInteractionLogs: InteractionLog[] = [];
export const defaultDailyReviewDrafts: DailyReviewDraft[] = [];
export const defaultOriginalContentRecords: OriginalContentRecord[] = [];

const now = new Date().toISOString();

export const defaultSearchTemplates: SearchTemplate[] = [
  {
    id: 'template-questions-zh',
    name: '中文问题帖',
    description: '优先找中文提问帖、求推荐帖和求助帖，适合高质量回复切入。',
    query:
      '(AI OR 自动化 OR 独立开发 OR 产品) (怎么 OR 请教 OR 求推荐 OR 有人知道 OR ? OR ？) lang:zh -filter:replies',
    category: 'questions',
    pinned: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'template-viral-zh-builders',
    name: '中文爆款复盘素材',
    description: '找近期已有明显互动的中文 AI、独立开发和产品内容，用来拆结构和选题。',
    query: '(AI OR 自动化 OR 独立开发 OR 产品 OR 增长) min_faves:20 lang:zh -filter:replies',
    category: 'viral',
    pinned: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'template-creator-recent-zh',
    name: '中文创作者最近在聊什么',
    description: '看中文 AI 创作者、独立开发者和产品博主最近在聊什么，适合跟进评论和引用。',
    query: '(AI OR 自动化 OR 独立开发 OR 产品进展 OR 复盘) min_faves:3 lang:zh -filter:replies',
    category: 'creator',
    pinned: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'template-latest-24h-zh',
    name: '中文实时新帖入口',
    description: '优先看实时的新内容流，尽量更早参与中文讨论。',
    query: '(AI OR 自动化 OR 独立开发 OR 产品) lang:zh -filter:replies',
    category: 'recent',
    pinned: false,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'template-low-follower-discovery-zh',
    name: '中文低粉优质账号发现',
    description: '找低粉但内容不错的中文创作者，适合建立同层关系。',
    query: '(AI OR 自动化 OR 独立开发 OR 产品) min_faves:3 lang:zh -filter:replies',
    category: 'niche',
    pinned: false,
    createdAt: now,
    updatedAt: now,
  },
] satisfies SearchTemplate[];

export const defaultCandidateAccounts: CandidateAccount[] = [];
