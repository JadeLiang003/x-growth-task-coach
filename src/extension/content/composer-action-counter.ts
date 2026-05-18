import type {
  ArticleDebugEventDetail,
  ComposerMutationEventDetail,
  ShortPostDebugEventDetail,
} from './types';

const BRIDGE_ASSET_PATH = 'assets/page-bridge.js';
const BRIDGE_EVENT_NAME = 'x-growth:composer-mutation';
const ARTICLE_DEBUG_EVENT_NAME = 'x-growth:article-debug';
const SHORT_POST_DEBUG_EVENT_NAME = 'x-growth:short-post-debug';
const RECENT_EVENT_WINDOW_MS = 8_000;
let recentThreadSubmissionAt = 0;

const actionTaskMap = {
  reply: 'highQualityReplies',
  quote: 'quotePosts',
} as const;

const recentEvents = new Map<string, number>();

function getRuntime() {
  return (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome?.runtime;
}

function cleanupRecentEvents(now: number) {
  for (const [signature, timestamp] of recentEvents.entries()) {
    if (now - timestamp > RECENT_EVENT_WINDOW_MS) {
      recentEvents.delete(signature);
    }
  }
}

function rememberEvent(signature: string, now: number) {
  cleanupRecentEvents(now);
  recentEvents.set(signature, now);
}

function hasRecentEvent(signature: string, now: number) {
  cleanupRecentEvents(now);
  const timestamp = recentEvents.get(signature);
  return typeof timestamp === 'number' && now - timestamp <= RECENT_EVENT_WINDOW_MS;
}

function injectBridgeScript() {
  if (document.getElementById('x-growth-page-bridge')) {
    return;
  }

  const runtime = getRuntime();
  const bridgeUrl = runtime?.getURL?.(BRIDGE_ASSET_PATH);
  if (!bridgeUrl) {
    return;
  }

  const script = document.createElement('script');
  script.id = 'x-growth-page-bridge';
  script.src = bridgeUrl;
  script.async = false;
  document.documentElement.appendChild(script);
}

async function handleComposerMutation(detail: ComposerMutationEventDetail) {
  const now = Date.now();
  if (hasRecentEvent(detail.signature, now)) {
    if (detail.actionType === 'original' && detail.contentFormatGroup === 'short') {
      handleShortPostDebugEvent({
        timestamp: new Date().toISOString(),
        type: 'short-post-deduped',
        state: 'deduped',
        detail: '同一条短推请求在短时间内重复出现，已按去重规则忽略后续事件。',
        endpoint: detail.endpoint,
        requestKind: detail.requestKind,
        path: window.location.pathname,
      });
    }
    return;
  }

  if (detail.actionType === 'original' && detail.contentFormatGroup === 'thread') {
    if (now - recentThreadSubmissionAt <= RECENT_EVENT_WINDOW_MS) {
      return;
    }

    recentThreadSubmissionAt = now;
  }

  rememberEvent(detail.signature, now);
  getRuntime()?.sendMessage?.({
    type: 'x-growth:task-progress',
    payload: {
      taskId: detail.actionType === 'original' ? null : actionTaskMap[detail.actionType],
      delta: 1,
      source: 'composer-action-counter',
      endpoint: detail.endpoint,
      actionType: detail.actionType,
      signature: detail.signature,
      targetHandle: detail.targetHandle ?? null,
      contentFormat: detail.contentFormat ?? null,
      contentFormatGroup: detail.contentFormatGroup ?? null,
      contentRecognitionStatus: detail.contentRecognitionStatus ?? 'unrecognized',
    },
  });
}

function handleArticleDebugEvent(detail: ArticleDebugEventDetail) {
  getRuntime()?.sendMessage?.({
    type: 'x-growth:article-debug',
    payload: detail,
  });
}

function handleShortPostDebugEvent(detail: ShortPostDebugEventDetail) {
  getRuntime()?.sendMessage?.({
    type: 'x-growth:short-post-debug',
    payload: detail,
  });
}

export function startComposerActionCounter() {
  injectBridgeScript();

  window.addEventListener(BRIDGE_EVENT_NAME, (event) => {
    const detail = (event as CustomEvent<ComposerMutationEventDetail>).detail;
    if (!detail) {
      return;
    }

    void handleComposerMutation(detail);
  });

  window.addEventListener(ARTICLE_DEBUG_EVENT_NAME, (event) => {
    const detail = (event as CustomEvent<ArticleDebugEventDetail>).detail;
    if (!detail) {
      return;
    }

    handleArticleDebugEvent(detail);
  });

  window.addEventListener(SHORT_POST_DEBUG_EVENT_NAME, (event) => {
    const detail = (event as CustomEvent<ShortPostDebugEventDetail>).detail;
    if (!detail) {
      return;
    }

    handleShortPostDebugEvent(detail);
  });
}
