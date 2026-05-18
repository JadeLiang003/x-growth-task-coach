import {
  upsertFollowerSnapshot,
  recordInteractionAndEnhanceTasks,
} from '../growth-system/phase-six-data';
import { recordOriginalContentRecognition } from '../growth-system/content-performance';
import { importCandidateAccounts } from '../growth-system/phase-seven-data';
import { getOrCreateTodaySummary, updateTodayTaskProgress } from '../task-system/daily-records';
import {
  defaultCandidateAccounts,
  defaultArticleRecognitionDebugLogs,
  defaultShortPostRecognitionDebugLogs,
  defaultDailyReviewDrafts,
  defaultLastContentRecognition,
  defaultOriginalContentRecords,
  defaultSearchTemplates,
} from '../storage/defaults';

const SETTINGS_KEY = 'xGrowthTaskCoach.settings';
const RUNTIME_KEY = 'xGrowthTaskCoach.runtime';

const defaultSettings = {
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

const defaultRuntime = {
  connected: false,
  lastSeenAt: null,
  lastSeenPath: null,
  lastSeenTitle: null,
  source: null,
};

const defaultDailyRecords: unknown[] = [];
const defaultFollowerSnapshots: unknown[] = [];
const defaultAccountPool: unknown[] = [];
const defaultInteractionLogs: unknown[] = [];
const defaultSearchTemplateRecords: unknown[] = defaultSearchTemplates;
const defaultCandidateAccountRecords: unknown[] = defaultCandidateAccounts;
const defaultDailyReviewDraftRecords: unknown[] = defaultDailyReviewDrafts;
const defaultLastContentRecognitionRecord: unknown = defaultLastContentRecognition;
const defaultOriginalContentRecordItems: unknown[] = defaultOriginalContentRecords;
const defaultArticleRecognitionDebugLogItems: unknown[] = defaultArticleRecognitionDebugLogs;
const defaultShortPostRecognitionDebugLogItems: unknown[] = defaultShortPostRecognitionDebugLogs;
const ARTICLE_DEBUG_LOGS_KEY = 'xGrowthTaskCoach.articleRecognitionDebugLogs';
const SHORT_POST_DEBUG_LOGS_KEY = 'xGrowthTaskCoach.shortPostRecognitionDebugLogs';
const ARTICLE_DEBUG_LOG_LIMIT = 100;
const SHORT_POST_DEBUG_LOG_LIMIT = 100;
let taskProgressQueue = Promise.resolve();

interface ContentHeartbeatMessage {
  type: 'x-growth:content-heartbeat';
  payload: {
    path: string;
    title: string;
    timestamp: string;
    source: 'x.com' | 'twitter.com';
  };
}

interface RuntimeReadMessage {
  type: 'x-growth:runtime-read';
}

interface TaskProgressMessage {
  type: 'x-growth:task-progress';
  payload: {
    taskId: string | null;
    delta: number;
    source: string;
    endpoint?: string;
    actionType?: 'original' | 'reply' | 'quote';
    signature?: string;
    targetHandle?: string | null;
    contentFormat?: import('../storage/schema').ContentFormat | null;
    contentFormatGroup?: import('../storage/schema').ContentFormatGroup | null;
    contentRecognitionStatus?: import('../storage/schema').ContentRecognitionStatus;
  };
}

interface FollowerSnapshotMessage {
  type: 'x-growth:follower-snapshot';
  payload: {
    handle: string;
    followersCount: number;
    timestamp: string;
    path: string;
    source: 'auto';
  };
}

interface CandidateAccountsMessage {
  type: 'x-growth:candidate-accounts';
  payload: {
    source: 'from_following' | 'from_followers';
    items: Array<{
      handle: string;
      displayName: string;
      followersCount: number | null;
      followingCount: number | null;
      verified: boolean;
      bio: string;
      capturedAt: string;
    }>;
  };
}

interface OpenOptionsPageMessage {
  type: 'x-growth:open-options-page';
}

interface ArticleDebugMessage {
  type: 'x-growth:article-debug';
  payload: import('../storage/schema').ArticleRecognitionDebugEntry;
}

interface ArticleDebugReadMessage {
  type: 'x-growth:article-debug-read';
}

interface ArticleDebugClearMessage {
  type: 'x-growth:article-debug-clear';
}

interface ShortPostDebugMessage {
  type: 'x-growth:short-post-debug';
  payload: import('../storage/schema').ShortPostRecognitionDebugEntry;
}

interface ShortPostDebugReadMessage {
  type: 'x-growth:short-post-debug-read';
}

interface ShortPostDebugClearMessage {
  type: 'x-growth:short-post-debug-clear';
}

type ExtensionMessage =
  | ContentHeartbeatMessage
  | RuntimeReadMessage
  | TaskProgressMessage
  | FollowerSnapshotMessage
  | CandidateAccountsMessage
  | OpenOptionsPageMessage
  | ArticleDebugMessage
  | ArticleDebugReadMessage
  | ArticleDebugClearMessage
  | ShortPostDebugMessage
  | ShortPostDebugReadMessage
  | ShortPostDebugClearMessage;

async function appendShortPostDebugLog(
  entry: import('../storage/schema').ShortPostRecognitionDebugEntry,
) {
  const items = await new Promise<Record<string, unknown>>((resolve) => {
    getStorage().get([SETTINGS_KEY, SHORT_POST_DEBUG_LOGS_KEY], (loadedItems) => {
      resolve(loadedItems);
    });
  });
  const storedSettings = items[SETTINGS_KEY] as Partial<typeof defaultSettings> | undefined;
  const settings = {
    ...defaultSettings,
    ...storedSettings,
  };
  if (!settings.debugModeEnabled) {
    return;
  }

  const currentLogs = Array.isArray(items[SHORT_POST_DEBUG_LOGS_KEY])
    ? (items[
        SHORT_POST_DEBUG_LOGS_KEY
      ] as import('../storage/schema').ShortPostRecognitionDebugEntry[])
    : defaultShortPostRecognitionDebugLogs;
  const nextLogs = [...currentLogs, entry].slice(-SHORT_POST_DEBUG_LOG_LIMIT);
  await new Promise<void>((resolve) => {
    getStorage().set({ [SHORT_POST_DEBUG_LOGS_KEY]: nextLogs }, () => resolve());
  });
}

function getStorage() {
  return chrome.storage.local;
}

function ensureInitialState() {
  getStorage().get(
    [
      SETTINGS_KEY,
      RUNTIME_KEY,
      'xGrowthTaskCoach.dailyRecords',
      'xGrowthTaskCoach.followerSnapshots',
      'xGrowthTaskCoach.accountPool',
      'xGrowthTaskCoach.interactionLogs',
      'xGrowthTaskCoach.searchTemplates',
      'xGrowthTaskCoach.candidateAccounts',
      'xGrowthTaskCoach.dailyReviewDrafts',
      'xGrowthTaskCoach.lastContentRecognition',
      'xGrowthTaskCoach.originalContentRecords',
      ARTICLE_DEBUG_LOGS_KEY,
      SHORT_POST_DEBUG_LOGS_KEY,
    ],
    (items) => {
      const nextValues: Record<string, unknown> = {};

      if (!items[SETTINGS_KEY]) {
        nextValues[SETTINGS_KEY] = defaultSettings;
      }

      if (!items[RUNTIME_KEY]) {
        nextValues[RUNTIME_KEY] = defaultRuntime;
      }

      if (!items['xGrowthTaskCoach.dailyRecords']) {
        nextValues['xGrowthTaskCoach.dailyRecords'] = defaultDailyRecords;
      }

      if (!items['xGrowthTaskCoach.followerSnapshots']) {
        nextValues['xGrowthTaskCoach.followerSnapshots'] = defaultFollowerSnapshots;
      }

      if (!items['xGrowthTaskCoach.accountPool']) {
        nextValues['xGrowthTaskCoach.accountPool'] = defaultAccountPool;
      }

      if (!items['xGrowthTaskCoach.interactionLogs']) {
        nextValues['xGrowthTaskCoach.interactionLogs'] = defaultInteractionLogs;
      }

      if (!items['xGrowthTaskCoach.searchTemplates']) {
        nextValues['xGrowthTaskCoach.searchTemplates'] = defaultSearchTemplateRecords;
      }

      if (!items['xGrowthTaskCoach.candidateAccounts']) {
        nextValues['xGrowthTaskCoach.candidateAccounts'] = defaultCandidateAccountRecords;
      }

      if (!items['xGrowthTaskCoach.dailyReviewDrafts']) {
        nextValues['xGrowthTaskCoach.dailyReviewDrafts'] = defaultDailyReviewDraftRecords;
      }

      if (!items['xGrowthTaskCoach.lastContentRecognition']) {
        nextValues['xGrowthTaskCoach.lastContentRecognition'] = defaultLastContentRecognitionRecord;
      }

      if (!items['xGrowthTaskCoach.originalContentRecords']) {
        nextValues['xGrowthTaskCoach.originalContentRecords'] = defaultOriginalContentRecordItems;
      }

      if (!items[ARTICLE_DEBUG_LOGS_KEY]) {
        nextValues[ARTICLE_DEBUG_LOGS_KEY] = defaultArticleRecognitionDebugLogItems;
      }

      if (!items[SHORT_POST_DEBUG_LOGS_KEY]) {
        nextValues[SHORT_POST_DEBUG_LOGS_KEY] = defaultShortPostRecognitionDebugLogItems;
      }

      if (Object.keys(nextValues).length > 0) {
        getStorage().set(nextValues);
      }
    },
  );
}

chrome.runtime.onInstalled.addListener(() => {
  ensureInitialState();
});

chrome.runtime.onStartup.addListener(() => {
  ensureInitialState();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const typedMessage = message as ExtensionMessage | undefined;

  if (typedMessage?.type === 'x-growth:content-heartbeat') {
    getStorage().set(
      {
        [RUNTIME_KEY]: {
          connected: true,
          lastSeenAt: typedMessage.payload.timestamp,
          lastSeenPath: typedMessage.payload.path,
          lastSeenTitle: typedMessage.payload.title,
          source: typedMessage.payload.source,
        },
      },
      () => sendResponse({ ok: true }),
    );

    return true;
  }

  if (typedMessage?.type === 'x-growth:runtime-read') {
    getStorage().get(RUNTIME_KEY, (items) => {
      sendResponse({ ok: true, runtime: items[RUNTIME_KEY] ?? defaultRuntime });
    });
    return true;
  }

  if (typedMessage?.type === 'x-growth:task-progress') {
    taskProgressQueue = taskProgressQueue.then(async () => {
      if (typedMessage.payload.actionType === 'original' && typedMessage.payload.signature) {
        const recognition = await recordOriginalContentRecognition({
          format: typedMessage.payload.contentFormat ?? null,
          formatGroup: typedMessage.payload.contentFormatGroup ?? null,
          status: typedMessage.payload.contentRecognitionStatus ?? 'unrecognized',
          endpoint: typedMessage.payload.endpoint ?? typedMessage.payload.source,
          signature: typedMessage.payload.signature,
        });

        if (
          recognition.alreadyRecorded &&
          typedMessage.payload.contentFormatGroup === 'short' &&
          typedMessage.payload.endpoint
        ) {
          await appendShortPostDebugLog({
            timestamp: new Date().toISOString(),
            type: 'short-post-deduped',
            state: 'deduped',
            detail: '这次短推请求命中了已有签名或重复记录，所以没有再次加一。',
            endpoint: typedMessage.payload.endpoint,
            path: null,
          });
        }

        if (!recognition.alreadyRecorded) {
          for (const taskId of recognition.taskIds) {
            await updateTodayTaskProgress(taskId, typedMessage.payload.delta);
          }
        }
      }

      if (typedMessage.payload.taskId) {
        await updateTodayTaskProgress(typedMessage.payload.taskId, typedMessage.payload.delta);
      }

      if (typedMessage.payload.actionType && typedMessage.payload.signature) {
        await recordInteractionAndEnhanceTasks({
          actionType: typedMessage.payload.actionType,
          signature: typedMessage.payload.signature,
          targetHandle: typedMessage.payload.targetHandle,
        });
      }

      const summary = await getOrCreateTodaySummary();
      sendResponse({ ok: true, summary });
    });
    return true;
  }

  if (typedMessage?.type === 'x-growth:follower-snapshot') {
    void upsertFollowerSnapshot({
      handle: typedMessage.payload.handle,
      followersCount: typedMessage.payload.followersCount,
      source: typedMessage.payload.source,
      capturedAt: typedMessage.payload.timestamp,
      path: typedMessage.payload.path,
    }).then((snapshot) => {
      sendResponse({ ok: true, snapshot });
    });
    return true;
  }

  if (typedMessage?.type === 'x-growth:candidate-accounts') {
    void importCandidateAccounts(
      typedMessage.payload.items.map((item) => ({
        ...item,
        source: typedMessage.payload.source,
      })),
    ).then((candidateAccounts) => {
      sendResponse({ ok: true, candidateAccountsCount: candidateAccounts.length });
    });
    return true;
  }

  if (typedMessage?.type === 'x-growth:open-options-page') {
    const openOptionsPage = chrome.runtime.openOptionsPage;
    if (typeof openOptionsPage === 'function') {
      openOptionsPage();
      sendResponse({ ok: true });
      return true;
    }

    sendResponse({ ok: false });
    return true;
  }

  if (typedMessage?.type === 'x-growth:article-debug') {
    getStorage().get([SETTINGS_KEY, ARTICLE_DEBUG_LOGS_KEY], (items) => {
      const storedSettings = items[SETTINGS_KEY] as Partial<typeof defaultSettings> | undefined;
      const settings = {
        ...defaultSettings,
        ...storedSettings,
      };

      if (!settings.debugModeEnabled) {
        sendResponse({ ok: true, persisted: false });
        return;
      }

      const currentLogs = Array.isArray(items[ARTICLE_DEBUG_LOGS_KEY])
        ? (items[
            ARTICLE_DEBUG_LOGS_KEY
          ] as import('../storage/schema').ArticleRecognitionDebugEntry[])
        : defaultArticleRecognitionDebugLogs;

      const nextLogs = [...currentLogs, typedMessage.payload].slice(-ARTICLE_DEBUG_LOG_LIMIT);
      getStorage().set({ [ARTICLE_DEBUG_LOGS_KEY]: nextLogs }, () => {
        sendResponse({ ok: true, persisted: true, size: nextLogs.length });
      });
    });
    return true;
  }

  if (typedMessage?.type === 'x-growth:article-debug-read') {
    getStorage().get(ARTICLE_DEBUG_LOGS_KEY, (items) => {
      sendResponse({
        ok: true,
        logs: Array.isArray(items[ARTICLE_DEBUG_LOGS_KEY]) ? items[ARTICLE_DEBUG_LOGS_KEY] : [],
      });
    });
    return true;
  }

  if (typedMessage?.type === 'x-growth:article-debug-clear') {
    getStorage().set({ [ARTICLE_DEBUG_LOGS_KEY]: [] }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (typedMessage?.type === 'x-growth:short-post-debug') {
    getStorage().get([SETTINGS_KEY, SHORT_POST_DEBUG_LOGS_KEY], (items) => {
      const storedSettings = items[SETTINGS_KEY] as Partial<typeof defaultSettings> | undefined;
      const settings = {
        ...defaultSettings,
        ...storedSettings,
      };

      if (!settings.debugModeEnabled) {
        sendResponse({ ok: true, persisted: false });
        return;
      }

      const currentLogs = Array.isArray(items[SHORT_POST_DEBUG_LOGS_KEY])
        ? (items[
            SHORT_POST_DEBUG_LOGS_KEY
          ] as import('../storage/schema').ShortPostRecognitionDebugEntry[])
        : defaultShortPostRecognitionDebugLogs;

      const nextLogs = [...currentLogs, typedMessage.payload].slice(-SHORT_POST_DEBUG_LOG_LIMIT);
      getStorage().set({ [SHORT_POST_DEBUG_LOGS_KEY]: nextLogs }, () => {
        sendResponse({ ok: true, persisted: true, size: nextLogs.length });
      });
    });
    return true;
  }

  if (typedMessage?.type === 'x-growth:short-post-debug-read') {
    getStorage().get(SHORT_POST_DEBUG_LOGS_KEY, (items) => {
      sendResponse({
        ok: true,
        logs: Array.isArray(items[SHORT_POST_DEBUG_LOGS_KEY])
          ? items[SHORT_POST_DEBUG_LOGS_KEY]
          : [],
      });
    });
    return true;
  }

  if (typedMessage?.type === 'x-growth:short-post-debug-clear') {
    getStorage().set({ [SHORT_POST_DEBUG_LOGS_KEY]: [] }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});
