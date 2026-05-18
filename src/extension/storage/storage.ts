import {
  defaultAccountPool,
  defaultArticleRecognitionDebugLogs,
  defaultCandidateAccounts,
  defaultDailyRecords,
  defaultDailyReviewDrafts,
  defaultFollowerSnapshots,
  defaultInteractionLogs,
  defaultLastContentRecognition,
  defaultOriginalContentRecords,
  defaultRuntimeSnapshot,
  defaultSearchTemplates,
  defaultSettings,
  defaultShortPostRecognitionDebugLogs,
} from './defaults';
import {
  AccountPoolItem,
  ArticleRecognitionDebugEntry,
  CandidateAccount,
  DailyRecord,
  DailyReviewDraft,
  ExtensionSettings,
  FollowerSnapshot,
  InteractionLog,
  LastContentRecognition,
  OriginalContentRecord,
  RuntimeSnapshot,
  SearchTemplate,
  ShortPostRecognitionDebugEntry,
  STORAGE_KEYS,
} from './schema';

type BrowserWithChrome = typeof globalThis & {
  chrome?: {
    runtime?: {
      openOptionsPage?: () => void;
    };
    storage?: {
      onChanged?: {
        addListener: (
          callback: (
            changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
            areaName: string,
          ) => void,
        ) => void;
        removeListener: (
          callback: (
            changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
            areaName: string,
          ) => void,
        ) => void;
      };
      local?: {
        get: (
          keys: string | string[] | Record<string, unknown> | null,
          callback: (items: Record<string, unknown>) => void,
        ) => void;
        set: (items: Record<string, unknown>, callback?: () => void) => void;
      };
    };
  };
};

function getChromeApi() {
  return (globalThis as BrowserWithChrome).chrome;
}

function getStorageArea() {
  const storageArea = getChromeApi()?.storage?.local;
  if (!storageArea) {
    throw new Error('Chrome storage.local 不可用');
  }
  return storageArea;
}

function storageGet<T>(key: string, fallback: T): Promise<T> {
  const storageArea = getStorageArea();
  return new Promise((resolve) => {
    storageArea.get(key, (items) => {
      const value = items[key];
      resolve((value as T | undefined) ?? fallback);
    });
  });
}

function storageSet(value: Record<string, unknown>): Promise<void> {
  const storageArea = getStorageArea();
  return new Promise((resolve) => {
    storageArea.set(value, () => resolve());
  });
}

export async function getSettings() {
  const storedSettings = await storageGet<Partial<ExtensionSettings>>(
    STORAGE_KEYS.settings,
    defaultSettings,
  );

  return {
    ...defaultSettings,
    ...storedSettings,
    overlayIds: storedSettings.overlayIds ?? defaultSettings.overlayIds,
    customOverlays: storedSettings.customOverlays ?? defaultSettings.customOverlays,
    taskTargetOverrides: storedSettings.taskTargetOverrides ?? defaultSettings.taskTargetOverrides,
  } satisfies ExtensionSettings;
}

export async function saveSettings(settings: ExtensionSettings) {
  await storageSet({ [STORAGE_KEYS.settings]: settings });
}

export async function getRuntimeSnapshot() {
  return storageGet<RuntimeSnapshot>(STORAGE_KEYS.runtime, defaultRuntimeSnapshot);
}

export async function saveRuntimeSnapshot(runtime: RuntimeSnapshot) {
  await storageSet({ [STORAGE_KEYS.runtime]: runtime });
}

export async function getLastContentRecognition() {
  return storageGet<LastContentRecognition>(
    STORAGE_KEYS.lastContentRecognition,
    defaultLastContentRecognition,
  );
}

export async function saveLastContentRecognition(lastContentRecognition: LastContentRecognition) {
  await storageSet({ [STORAGE_KEYS.lastContentRecognition]: lastContentRecognition });
}

export async function getArticleRecognitionDebugLogs() {
  return storageGet<ArticleRecognitionDebugEntry[]>(
    STORAGE_KEYS.articleRecognitionDebugLogs,
    defaultArticleRecognitionDebugLogs,
  );
}

export async function saveArticleRecognitionDebugLogs(
  articleRecognitionDebugLogs: ArticleRecognitionDebugEntry[],
) {
  await storageSet({ [STORAGE_KEYS.articleRecognitionDebugLogs]: articleRecognitionDebugLogs });
}

export async function getShortPostRecognitionDebugLogs() {
  return storageGet<ShortPostRecognitionDebugEntry[]>(
    STORAGE_KEYS.shortPostRecognitionDebugLogs,
    defaultShortPostRecognitionDebugLogs,
  );
}

export async function saveShortPostRecognitionDebugLogs(
  shortPostRecognitionDebugLogs: ShortPostRecognitionDebugEntry[],
) {
  await storageSet({
    [STORAGE_KEYS.shortPostRecognitionDebugLogs]: shortPostRecognitionDebugLogs,
  });
}

export async function getDailyRecords() {
  return storageGet<DailyRecord[]>(STORAGE_KEYS.dailyRecords, defaultDailyRecords);
}

export async function saveDailyRecords(records: DailyRecord[]) {
  await storageSet({ [STORAGE_KEYS.dailyRecords]: records });
}

export async function getFollowerSnapshots() {
  return storageGet<FollowerSnapshot[]>(STORAGE_KEYS.followerSnapshots, defaultFollowerSnapshots);
}

export async function saveFollowerSnapshots(snapshots: FollowerSnapshot[]) {
  await storageSet({ [STORAGE_KEYS.followerSnapshots]: snapshots });
}

export async function getAccountPool() {
  return storageGet<AccountPoolItem[]>(STORAGE_KEYS.accountPool, defaultAccountPool);
}

export async function saveAccountPool(accountPool: AccountPoolItem[]) {
  await storageSet({ [STORAGE_KEYS.accountPool]: accountPool });
}

export async function getInteractionLogs() {
  return storageGet<InteractionLog[]>(STORAGE_KEYS.interactionLogs, defaultInteractionLogs);
}

export async function saveInteractionLogs(interactionLogs: InteractionLog[]) {
  await storageSet({ [STORAGE_KEYS.interactionLogs]: interactionLogs });
}

export async function getSearchTemplates() {
  return storageGet<SearchTemplate[]>(STORAGE_KEYS.searchTemplates, defaultSearchTemplates);
}

export async function saveSearchTemplates(searchTemplates: SearchTemplate[]) {
  await storageSet({ [STORAGE_KEYS.searchTemplates]: searchTemplates });
}

export async function getCandidateAccounts() {
  return storageGet<CandidateAccount[]>(STORAGE_KEYS.candidateAccounts, defaultCandidateAccounts);
}

export async function saveCandidateAccounts(candidateAccounts: CandidateAccount[]) {
  await storageSet({ [STORAGE_KEYS.candidateAccounts]: candidateAccounts });
}

export async function getDailyReviewDrafts() {
  return storageGet<DailyReviewDraft[]>(STORAGE_KEYS.dailyReviewDrafts, defaultDailyReviewDrafts);
}

export async function saveDailyReviewDrafts(dailyReviewDrafts: DailyReviewDraft[]) {
  await storageSet({ [STORAGE_KEYS.dailyReviewDrafts]: dailyReviewDrafts });
}

export async function getOriginalContentRecords() {
  return storageGet<OriginalContentRecord[]>(
    STORAGE_KEYS.originalContentRecords,
    defaultOriginalContentRecords,
  );
}

export async function saveOriginalContentRecords(originalContentRecords: OriginalContentRecord[]) {
  await storageSet({ [STORAGE_KEYS.originalContentRecords]: originalContentRecords });
}

export async function resetSettings() {
  await saveSettings(defaultSettings);
}

export function openOptionsPage() {
  getChromeApi()?.runtime?.openOptionsPage?.();
}

export function subscribeToStorageChanges(
  callback: (
    changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
    areaName: string,
  ) => void,
) {
  getChromeApi()?.storage?.onChanged?.addListener(callback);

  return () => {
    getChromeApi()?.storage?.onChanged?.removeListener(callback);
  };
}
