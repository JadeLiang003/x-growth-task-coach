import type {
  ArticleDebugEventDetail,
  CandidateAccountImportEventDetail,
  ComposerActionType,
  ComposerMutationEventDetail,
  ShortPostDebugEventDetail,
} from './types';
import type {
  ContentFormat,
  ContentFormatGroup,
  ContentRecognitionStatus,
} from '../storage/schema';

const BRIDGE_EVENT_NAME = 'x-growth:composer-mutation';
const ARTICLE_DEBUG_EVENT_NAME = 'x-growth:article-debug';
const SHORT_POST_DEBUG_EVENT_NAME = 'x-growth:short-post-debug';
const CANDIDATE_IMPORT_EVENT_NAME = 'x-growth:candidate-accounts';
const GRAPHQL_PATTERN = /\/graphql\//i;
const CREATE_TWEET_PATTERN =
  /\/graphql\/[^/]+\/(CreateTweet|CreateNoteTweet|PostTweet|TweetCreate|CreatePost)/i;
const ARTICLE_GRAPHQL_PATTERN = /\/graphql\/[^/]+\/ArticleEntity/i;
const ARTICLE_DRAFT_ENDPOINT_PATTERN =
  /\/graphql\/[^/]+\/ArticleEntity(DraftCreate|UpdateTitle|UpdateContent)/i;
const ARTICLE_PUBLISH_ENDPOINT_PATTERN =
  /\/graphql\/[^/]+\/ArticleEntity[^/]*(Publish|Published|Submit|Finalize|Lifecycle|Status)/i;
const ARTICLE_NON_PUBLISH_ENDPOINT_PATTERN =
  /\/graphql\/[^/]+\/ArticleEntity[^/]*(Delete|DraftCreate|UpdateTitle|UpdateContent|Autosave|Preview)/i;
const SHORT_POST_NON_PUBLISH_ENDPOINT_PATTERN =
  /\/graphql\/[^/]+\/(FetchDraftTweets|DeleteTweet|UserTweets|UserTweetsAndReplies|UserMedia|UserHighlights|UserBy|UserResultBy|HomeTimeline|SearchTimeline|TweetDetail|TweetResultByRestId|FavoriteTweet|UnfavoriteTweet|CreateRetweet|DeleteRetweet|Retweeters|Bookmark|DeleteBookmark)/i;
const FOLLOWING_PATTERN = /\/graphql\/[^/]+\/Following/i;
const FOLLOWERS_PATTERN = /\/graphql\/[^/]+\/(BlueVerified)?Followers/i;
const RESERVED_HANDLES = new Set([
  'home',
  'explore',
  'notifications',
  'messages',
  'i',
  'search',
  'settings',
  'compose',
  'login',
  'signup',
  'intent',
]);
const ARTICLE_DEBUG_CACHE_KEY = '__xGrowthArticleDebugEvents';
const ARTICLE_DEBUG_CACHE_LIMIT = 25;
const SHORT_POST_DEBUG_CACHE_KEY = '__xGrowthShortPostDebugEvents';
const SHORT_POST_DEBUG_CACHE_LIMIT = 25;
const ARTICLE_PUBLISH_PENDING_WINDOW_MS = 45_000;
const ARTICLE_URL_PATTERN = /\/(compose\/articles|i\/articles|articles)(\/|$)/i;
const COMPOSE_POST_PATH_PATTERN = /^\/compose\/post(\/|$)/i;
const SHORT_POST_RESULT_PATH_PATTERN = /^\/[^/]+\/status\/\d+/i;
const PUBLISHED_ARTICLE_URL_PATTERN = /^\/[^/]+\/article\/[^/]+/i;
const INTERNAL_PUBLISHED_ARTICLE_URL_PATTERN = /^\/i\/articles\/[^/]+/i;
const ARTICLE_EDITOR_TITLE_SELECTORS = [
  'textarea[placeholder="Add a title"]',
  'textarea[placeholder="添加标题"]',
  'textarea[placeholder="タイトルを追加"]',
  'textarea[placeholder="제목 추가"]',
  'textarea[name="Article Title"]',
];
const ARTICLE_PREVIEW_SELECTORS = [
  'a[href*="/preview"]',
  '[data-testid="previewButton"]',
  'button[aria-label*="preview" i]',
  'button[aria-label*="预览" i]',
  'button[aria-label*="プレビュー" i]',
  'button[aria-label*="미리보기" i]',
];
const ARTICLE_PUBLISH_SELECTORS = [
  '[data-testid="publishButton"]',
  'button[aria-label*="publish" i]',
  'button[aria-label*="发布" i]',
  'button[aria-label*="公開" i]',
  'button[aria-label*="게시" i]',
];
const ARTICLE_PUBLISH_TEXT_PATTERNS = [/publish/i, /发布/i, /公開/i, /게시/i];
const ARTICLE_PREVIEW_TEXT_PATTERNS = [/preview/i, /预览/i, /プレビュー/i, /미리보기/i];
const ARTICLE_PUBLISH_SUCCESS_PATTERNS = [
  /success!\s*your article has been published/i,
  /your article has been published/i,
  /article published/i,
  /文章已发布/i,
];
const SHORT_POST_PUBLISH_BUTTON_SELECTORS = [
  '[data-testid="tweetButton"]',
  '[data-testid="tweetButtonInline"]',
];
const SHORT_POST_PUBLISH_TEXT_PATTERNS = [/post/i, /发布/i, /发帖/i, /发送/i];
const SHORT_POST_PENDING_WINDOW_MS = 10_000;
const ARTICLE_SIGNAL_KEYS = [
  'article_body',
  'articlebody',
  'article_title',
  'articletitle',
  'article_id',
  'articleid',
  'article_summary',
  'articlesummary',
  'article_slug',
  'articleslug',
  'article_cover_media_id',
  'articlecovermediaid',
];
const ARTICLE_PUBLISH_RESULT_KEYS = [
  'article_results',
  'articleresults',
  'article_result',
  'articleresult',
  'article_url',
  'articleurl',
  'permalink',
  'permalinkurl',
  'rest_id',
  'restid',
  'slug',
  'articleslug',
  'publication_status',
  'publicationstatus',
  'publish_status',
  'publishstatus',
  'is_published',
  'ispublished',
];
const SHORT_POST_RESULT_KEYS = [
  'createtweet',
  'tweetresults',
  'tweetresult',
  'tweet_results',
  'tweet_result',
  'tweetid',
  'tweet_id',
  'restid',
  'rest_id',
  'legacy',
  'fulltext',
  'full_text',
  'note_tweet_results',
  'notetweetresults',
];

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface OriginalContentFormatInfo {
  format: ContentFormat | null;
  formatGroup: ContentFormatGroup | null;
  status: ContentRecognitionStatus;
}

type ArticlePublishSessionState =
  | 'idle'
  | 'editing_article'
  | 'publish_dialog_open'
  | 'publish_submitted'
  | 'published';

interface ArticleDebugEvent {
  timestamp: string;
  type: string;
  state: ArticlePublishSessionState;
  detail: string;
  endpoint?: string;
  requestKind?: 'fetch' | 'xhr';
  responseKeys?: string[];
}

type ShortPostRecognitionDebugState = 'idle' | 'candidate' | 'recognized' | 'ignored' | 'deduped';

interface ShortPostDebugEvent {
  timestamp: string;
  type: string;
  state: ShortPostRecognitionDebugState;
  detail: string;
  endpoint?: string;
  requestKind?: 'fetch' | 'xhr';
  responseKeys?: string[];
}

let shortPostPublishSession: {
  state: ShortPostRecognitionDebugState;
  pendingAt: number;
  composerText: string;
} = {
  state: 'idle',
  pendingAt: 0,
  composerText: '',
};

let articlePublishSession: {
  state: ArticlePublishSessionState;
  workflowDetectedAt: number;
  publishTriggeredAt: number;
  publishedAt: number;
  lastArticleRequestAt: number;
} = {
  state: 'idle',
  workflowDetectedAt: 0,
  publishTriggeredAt: 0,
  publishedAt: 0,
  lastArticleRequestAt: 0,
};

function getDebugCacheHost() {
  return window as typeof window & {
    [ARTICLE_DEBUG_CACHE_KEY]?: ArticleDebugEvent[];
    [SHORT_POST_DEBUG_CACHE_KEY]?: ShortPostDebugEvent[];
  };
}

function pushArticleDebugEvent(
  type: string,
  detail: string,
  metadata?: Pick<ArticleDebugEvent, 'endpoint' | 'requestKind' | 'responseKeys'>,
) {
  const host = getDebugCacheHost();
  const nextEvent: ArticleDebugEvent = {
    timestamp: new Date().toISOString(),
    type,
    state: articlePublishSession.state,
    detail,
    ...metadata,
  };
  const previousEvents = host[ARTICLE_DEBUG_CACHE_KEY] ?? [];
  host[ARTICLE_DEBUG_CACHE_KEY] = [...previousEvents, nextEvent].slice(-ARTICLE_DEBUG_CACHE_LIMIT);
  window.dispatchEvent(
    new CustomEvent<ArticleDebugEventDetail>(ARTICLE_DEBUG_EVENT_NAME, {
      detail: {
        ...nextEvent,
        path: window.location.pathname,
      },
    }),
  );
}

function pushShortPostDebugEvent(
  type: string,
  state: ShortPostRecognitionDebugState,
  detail: string,
  metadata?: Pick<ShortPostDebugEvent, 'endpoint' | 'requestKind' | 'responseKeys'>,
) {
  const host = getDebugCacheHost();
  const nextEvent: ShortPostDebugEvent = {
    timestamp: new Date().toISOString(),
    type,
    state,
    detail,
    ...metadata,
  };
  const previousEvents = host[SHORT_POST_DEBUG_CACHE_KEY] ?? [];
  host[SHORT_POST_DEBUG_CACHE_KEY] = [...previousEvents, nextEvent].slice(
    -SHORT_POST_DEBUG_CACHE_LIMIT,
  );
  window.dispatchEvent(
    new CustomEvent<ShortPostDebugEventDetail>(SHORT_POST_DEBUG_EVENT_NAME, {
      detail: {
        ...nextEvent,
        path: window.location.pathname,
      },
    }),
  );
}

function transitionShortPostState(
  nextState: ShortPostRecognitionDebugState,
  type: string,
  detail: string,
  metadata?: Pick<ShortPostDebugEvent, 'endpoint' | 'requestKind' | 'responseKeys'>,
) {
  shortPostPublishSession = {
    state: nextState,
    pendingAt:
      nextState === 'candidate'
        ? Date.now()
        : nextState === 'idle'
          ? 0
          : shortPostPublishSession.pendingAt,
    composerText: nextState === 'idle' ? '' : shortPostPublishSession.composerText,
  };
  pushShortPostDebugEvent(type, nextState, detail, metadata);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeJsonParse(body: unknown): unknown {
  if (typeof body !== 'string' || body.length === 0) {
    return body;
  }

  try {
    return JSON.parse(body) as JsonValue;
  } catch {
    return body;
  }
}

function findTruthyByKeys(value: unknown, matcher: (key: string) => boolean): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => findTruthyByKeys(item, matcher));
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).some(([key, nestedValue]) => {
    if (matcher(key)) {
      if (typeof nestedValue === 'boolean') {
        return nestedValue;
      }

      if (typeof nestedValue === 'number') {
        return nestedValue > 0;
      }

      if (typeof nestedValue === 'string') {
        return nestedValue.trim().length > 0;
      }

      return nestedValue !== null;
    }

    return findTruthyByKeys(nestedValue, matcher);
  });
}

function collectNormalizedKeys(value: unknown, maxCount = 24) {
  const result = new Set<string>();

  const visit = (node: unknown) => {
    if (result.size >= maxCount) {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    for (const [key, nestedValue] of Object.entries(node)) {
      if (result.size >= maxCount) {
        break;
      }

      result.add(key.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase());
      visit(nestedValue);
    }
  };

  visit(value);
  return [...result];
}

function inferActionType(payload: unknown): ComposerActionType {
  const isReply = findTruthyByKeys(payload, (key) =>
    ['reply', 'reply_to_tweet_id', 'in_reply_to_tweet_id', 'inReplyToTweetId'].includes(key),
  );

  if (isReply) {
    return 'reply';
  }

  const isQuote = findTruthyByKeys(payload, (key) => {
    if (['quoted_tweet_id', 'quotedTweetId', 'quote_tweet_id', 'quoteTweetId'].includes(key)) {
      return true;
    }

    if (!['attachment_url', 'attachmentUrl'].includes(key)) {
      return false;
    }

    return findTruthyByKeys(payload, (nestedKey) =>
      ['quoted_tweet_id', 'quotedTweetId', 'quote_tweet_id', 'quoteTweetId'].includes(nestedKey),
    );
  });

  if (isQuote) {
    return 'quote';
  }

  return 'original';
}

function findLongestTextCandidate(value: unknown): string {
  if (Array.isArray(value)) {
    return (
      value
        .map((item) => findLongestTextCandidate(item))
        .sort((left, right) => right.length - left.length)[0] ?? ''
    );
  }

  if (!isRecord(value)) {
    return '';
  }

  let bestCandidate = '';

  for (const [key, nestedValue] of Object.entries(value)) {
    if (
      typeof nestedValue === 'string' &&
      ['text', 'tweet_text', 'status', 'content', 'note_text', 'article_body'].some((token) =>
        key.toLowerCase().includes(token),
      ) &&
      nestedValue.length > bestCandidate.length
    ) {
      bestCandidate = nestedValue;
    }

    const nestedCandidate = findLongestTextCandidate(nestedValue);
    if (nestedCandidate.length > bestCandidate.length) {
      bestCandidate = nestedCandidate;
    }
  }

  return bestCandidate;
}

function getComposerTextareaCount() {
  return document.querySelectorAll('[data-testid^="tweetTextarea_"]').length;
}

function getPrimaryComposerText() {
  const editor = document.querySelector<HTMLElement>('[data-testid="tweetTextarea_0"]');
  return (editor?.innerText ?? editor?.textContent ?? '').trim();
}

function hasShortPostComposerSignals() {
  return getComposerTextareaCount() >= 1 || hasDomMatch(SHORT_POST_PUBLISH_BUTTON_SELECTORS);
}

function hasDomMatch(selectors: string[]) {
  return selectors.some((selector) => document.querySelector(selector));
}

function isArticleWorkflowPath() {
  return ARTICLE_URL_PATTERN.test(window.location.pathname);
}

function hasArticleEditorSignals() {
  return hasDomMatch(ARTICLE_EDITOR_TITLE_SELECTORS);
}

function isArticleEditorContext() {
  return isArticleWorkflowPath() || hasArticleEditorSignals();
}

function isElementMatchingSelectors(target: EventTarget | null, selectors: string[]) {
  if (!(target instanceof Element)) {
    return false;
  }

  return selectors.some((selector) => {
    try {
      return Boolean(target.closest(selector));
    } catch {
      return false;
    }
  });
}

function getClosestInteractiveElement(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest('button,[role="button"],a,div,span');
}

function isShortPostComposerContext() {
  return !isArticleEditorContext() && hasShortPostComposerSignals();
}

function hasPendingShortPostPublishSession() {
  if (shortPostPublishSession.state !== 'candidate') {
    return false;
  }

  if (Date.now() - shortPostPublishSession.pendingAt > SHORT_POST_PENDING_WINDOW_MS) {
    transitionShortPostState(
      'idle',
      'short-post-pending-expired',
      '等待短推发布成功超时，清理本次短推识别状态。',
    );
    return false;
  }

  return true;
}

function openShortPostPublishSession(reason: string) {
  if (!isShortPostComposerContext()) {
    return;
  }

  const text = getPrimaryComposerText();
  if (!text) {
    transitionShortPostState(
      'ignored',
      'short-post-publish-clicked-empty',
      '点击了短推发布按钮，但输入框没有正文文本。',
    );
    return;
  }

  shortPostPublishSession = {
    state: shortPostPublishSession.state,
    pendingAt: shortPostPublishSession.pendingAt,
    composerText: text,
  };
  transitionShortPostState('candidate', reason, '检测到普通短推发布动作，等待真正的发布请求返回。');
}

function isElementMatchingTextPatterns(target: EventTarget | null, patterns: RegExp[]) {
  const interactive = getClosestInteractiveElement(target);
  if (!(interactive instanceof Element)) {
    return false;
  }

  const combinedText = [
    interactive.textContent ?? '',
    interactive.getAttribute('aria-label') ?? '',
    interactive.getAttribute('data-testid') ?? '',
  ]
    .join(' ')
    .trim();

  if (!combinedText) {
    return false;
  }

  return patterns.some((pattern) => pattern.test(combinedText));
}

function transitionArticlePublishState(
  nextState: ArticlePublishSessionState,
  reason: string,
  detail: string,
) {
  const now = Date.now();
  articlePublishSession = {
    state: nextState,
    workflowDetectedAt: nextState === 'idle' ? 0 : articlePublishSession.workflowDetectedAt || now,
    publishTriggeredAt:
      nextState === 'publish_dialog_open' || nextState === 'publish_submitted'
        ? now
        : nextState === 'published'
          ? articlePublishSession.publishTriggeredAt
          : nextState === 'idle'
            ? 0
            : articlePublishSession.publishTriggeredAt,
    publishedAt:
      nextState === 'published'
        ? now
        : nextState === 'idle'
          ? 0
          : articlePublishSession.publishedAt,
    lastArticleRequestAt: nextState === 'idle' ? 0 : articlePublishSession.lastArticleRequestAt,
  };
  pushArticleDebugEvent(reason, detail);
}

function ensureArticleEditingState(reason: string) {
  if (!isArticleEditorContext()) {
    return;
  }

  if (articlePublishSession.state === 'idle') {
    transitionArticlePublishState('editing_article', reason, '检测到长文编辑器或长文工作流页面');
  }
}

function hasPendingArticlePublishSession() {
  if (
    articlePublishSession.state !== 'publish_dialog_open' &&
    articlePublishSession.state !== 'publish_submitted'
  ) {
    return false;
  }

  if (Date.now() - articlePublishSession.publishTriggeredAt > ARTICLE_PUBLISH_PENDING_WINDOW_MS) {
    transitionArticlePublishState(
      'editing_article',
      'publish-pending-expired',
      '等待发布成功超时，回退到编辑态',
    );
    return false;
  }

  return true;
}

function rememberArticleRequestSeen(reason: string, endpoint: string, responsePayload: unknown) {
  if (!hasPendingArticlePublishSession()) {
    return;
  }

  articlePublishSession = {
    ...articlePublishSession,
    lastArticleRequestAt: Date.now(),
  };
  pushArticleDebugEvent(reason, '发布确认阶段命中长文相关请求', {
    endpoint,
    responseKeys: collectNormalizedKeys(responsePayload),
  });
}

function openArticlePublishDialog(reason: string) {
  if (
    articlePublishSession.state === 'publish_dialog_open' ||
    articlePublishSession.state === 'publish_submitted'
  ) {
    return;
  }

  ensureArticleEditingState('article-workflow-detected');
  transitionArticlePublishState(
    'publish_dialog_open',
    reason,
    '检测到长文发布入口，等待确认弹窗中的二次发布动作',
  );
}

function submitArticlePublish(reason: string) {
  if (
    articlePublishSession.state === 'publish_submitted' ||
    articlePublishSession.state === 'published'
  ) {
    return;
  }

  ensureArticleEditingState('article-workflow-detected');
  transitionArticlePublishState(
    'publish_submitted',
    reason,
    '检测到确认弹窗中的发布动作，等待平台成功信号',
  );
}

function markArticlePublishSuccess(
  reason: string,
  endpoint: string,
  requestKind: 'fetch' | 'xhr',
  responseKeys: string[],
) {
  transitionArticlePublishState('published', reason, '已确认本次长文发布成功');
  pushArticleDebugEvent('publish-success-detail', '长文发布结果已确认并准备记账', {
    endpoint,
    requestKind,
    responseKeys,
  });
}

function hasArticlePayloadSignals(payload: unknown) {
  return findTruthyByKeys(payload, (key) => {
    const normalizedKey = key.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    return (
      ARTICLE_SIGNAL_KEYS.includes(normalizedKey) ||
      (normalizedKey.includes('article') && !normalizedKey.includes('articlepreview'))
    );
  });
}

function hasArticlePublishResultSignals(payload: unknown) {
  return findTruthyByKeys(payload, (key) => {
    const normalizedKey = key.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    return ARTICLE_PUBLISH_RESULT_KEYS.some((token) => normalizedKey.includes(token));
  });
}

function hasShortPostPublishResultSignals(payload: unknown) {
  return findTruthyByKeys(payload, (key) => {
    const normalizedKey = key.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    return SHORT_POST_RESULT_KEYS.some((token) => normalizedKey.includes(token));
  });
}

function extractGraphqlOperationName(endpoint: string) {
  const matched = endpoint.match(/\/graphql\/[^/]+\/([^/?#]+)/i);
  return matched?.[1] ?? '';
}

function endpointLooksLikeShortPostMutation(endpoint: string) {
  if (SHORT_POST_NON_PUBLISH_ENDPOINT_PATTERN.test(endpoint)) {
    return false;
  }

  if (CREATE_TWEET_PATTERN.test(endpoint)) {
    return true;
  }

  const operationName = extractGraphqlOperationName(endpoint);
  if (!operationName) {
    return false;
  }

  return /CreateTweet|CreateNoteTweet|PostTweet|TweetCreate|CreatePost|PostCreate/i.test(
    operationName,
  );
}

function hasGraphqlErrors(payload: unknown) {
  return isRecord(payload) && Array.isArray(payload.errors) && payload.errors.length > 0;
}

function hasArticleResponseEnvelope(payload: unknown) {
  if (!isRecord(payload)) {
    return false;
  }

  if (hasArticlePublishResultSignals(payload)) {
    return true;
  }

  const dataNode = isRecord(payload.data) ? payload.data : null;
  if (!dataNode) {
    return false;
  }

  if (Object.keys(dataNode).some((key) => key.toLowerCase().includes('article'))) {
    return true;
  }

  return findTruthyByKeys(dataNode, (key) => key.toLowerCase().includes('article'));
}

function payloadLooksPublished(payload: unknown) {
  return findTruthyByKeys(payload, (key) => {
    const normalizedKey = key.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    return (
      normalizedKey.includes('published') ||
      normalizedKey.includes('publish') ||
      normalizedKey.includes('publicationstatus') ||
      normalizedKey.includes('lifecycle')
    );
  });
}

function requestLooksLikeArticlePublish(payload: unknown) {
  return findTruthyByKeys(payload, (key) => {
    const normalizedKey = key.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    return normalizedKey === 'publish' || normalizedKey.includes('publish');
  });
}

function looksLikeArticlePublishSuccess(
  endpoint: string,
  payload: unknown,
  responsePayload: unknown,
) {
  const articleEndpoint = ARTICLE_GRAPHQL_PATTERN.test(endpoint) || /CreateArticle/i.test(endpoint);
  if (!articleEndpoint) {
    return false;
  }

  const hasPublishIntent = hasPendingArticlePublishSession();
  if (!hasPublishIntent) {
    pushArticleDebugEvent(
      'article-request-ignored',
      '检测到 CreateArticle 请求，但当前不在发布确认阶段',
      {
        endpoint,
        responseKeys: collectNormalizedKeys(responsePayload),
      },
    );
    return false;
  }

  const hasErrors = hasGraphqlErrors(responsePayload);
  if (hasErrors) {
    pushArticleDebugEvent('article-request-error', '发布阶段命中 CreateArticle，但响应包含错误', {
      endpoint,
      responseKeys: collectNormalizedKeys(responsePayload),
    });
    return false;
  }

  rememberArticleRequestSeen('article-request-seen-during-publish', endpoint, responsePayload);

  if (
    ARTICLE_DRAFT_ENDPOINT_PATTERN.test(endpoint) ||
    ARTICLE_NON_PUBLISH_ENDPOINT_PATTERN.test(endpoint)
  ) {
    pushArticleDebugEvent(
      'article-draft-request-ignored',
      '发布确认阶段命中草稿或非发布请求，不直接算作发布成功',
      {
        endpoint,
        responseKeys: collectNormalizedKeys(responsePayload),
      },
    );
    return false;
  }

  const hasRequestArticleSignals = hasArticlePayloadSignals(payload);
  const hasResponseEnvelope = hasArticleResponseEnvelope(responsePayload);
  const hasResponseArticleSignals = hasArticlePayloadSignals(responsePayload);
  const hasPublishedStatusSignal = payloadLooksPublished(responsePayload);
  const hasPublishRequestSignal = requestLooksLikeArticlePublish(payload);
  const endpointSuggestsPublish = ARTICLE_PUBLISH_ENDPOINT_PATTERN.test(endpoint);
  const hasStrongPublishSignal =
    endpointSuggestsPublish || hasPublishRequestSignal || hasPublishedStatusSignal;

  if (
    hasResponseEnvelope &&
    hasStrongPublishSignal &&
    (hasRequestArticleSignals || hasResponseArticleSignals)
  ) {
    return true;
  }

  pushArticleDebugEvent(
    'article-request-unconfirmed',
    '命中发布阶段请求，但返回里没有足够强的成功信号',
    {
      endpoint,
      responseKeys: collectNormalizedKeys(responsePayload),
    },
  );
  return false;
}

function inferOriginalContentFormat(
  payload: unknown,
  endpoint: string,
  responsePayload: unknown,
): OriginalContentFormatInfo {
  const hasTextContent = findLongestTextCandidate(payload).trim().length > 0;
  const looksLikeArticleSubmission = looksLikeArticlePublishSuccess(
    endpoint,
    payload,
    responsePayload,
  );

  if (looksLikeArticleSubmission) {
    return {
      format: 'article',
      formatGroup: 'long_form',
      status: 'recognized',
    };
  }

  if (getComposerTextareaCount() > 1) {
    return {
      format: 'thread',
      formatGroup: 'thread',
      status: 'recognized',
    };
  }

  if (hasTextContent) {
    return {
      format: 'short_post',
      formatGroup: 'short',
      status: 'recognized',
    };
  }

  return {
    format: null,
    formatGroup: null,
    status: 'unrecognized',
  };
}

function looksLikeShortPostPublishSuccess(
  endpoint: string,
  payload: unknown,
  responsePayload: unknown,
) {
  if (!GRAPHQL_PATTERN.test(endpoint) || ARTICLE_GRAPHQL_PATTERN.test(endpoint)) {
    return false;
  }

  if (inferActionType(payload) !== 'original') {
    return false;
  }

  const textContent = findLongestTextCandidate(payload).trim();
  const composerText = shortPostPublishSession.composerText.trim();
  const hasAnyTextSignal = textContent.length > 0 || composerText.length > 0;
  const endpointLooksLikeMutation = endpointLooksLikeShortPostMutation(endpoint);
  const responseLooksLikeSuccess = hasShortPostPublishResultSignals(responsePayload);
  const shouldTrace = endpointLooksLikeMutation || responseLooksLikeSuccess;

  if (!shouldTrace) {
    return false;
  }

  if (!hasPendingShortPostPublishSession()) {
    pushShortPostDebugEvent(
      'short-post-request-ignored',
      'ignored',
      '检测到疑似短推请求，但当前不在短推发布确认阶段。',
      {
        endpoint,
        responseKeys: collectNormalizedKeys(responsePayload),
      },
    );
    return false;
  }

  pushShortPostDebugEvent(
    'short-post-candidate',
    'candidate',
    '检测到疑似普通短推发布请求，开始检查正文和成功信号。',
    {
      endpoint,
      responseKeys: collectNormalizedKeys(responsePayload),
    },
  );

  if (!hasAnyTextSignal && !endpointLooksLikeMutation && !responseLooksLikeSuccess) {
    pushShortPostDebugEvent(
      'short-post-ignored',
      'ignored',
      '请求里没有正文文本，也没有命中真正的短推发布信号，不按短推发布处理。',
      {
        endpoint,
        responseKeys: collectNormalizedKeys(responsePayload),
      },
    );
    return false;
  }

  if (hasGraphqlErrors(responsePayload)) {
    pushShortPostDebugEvent(
      'short-post-error',
      'ignored',
      '命中疑似短推发布请求，但响应里包含错误',
      {
        endpoint,
        responseKeys: collectNormalizedKeys(responsePayload),
      },
    );
    return false;
  }

  const endpointLooksLikeOriginalMutation = endpointLooksLikeMutation;

  const matched =
    endpointLooksLikeOriginalMutation ||
    responseLooksLikeSuccess ||
    hasShortPostPublishResultSignals(payload);

  if (!matched) {
    pushShortPostDebugEvent(
      'short-post-unconfirmed',
      'ignored',
      '检测到原创发帖请求，但返回里没有足够强的短推成功信号',
      {
        endpoint,
        responseKeys: collectNormalizedKeys(responsePayload),
      },
    );
  }

  return matched;
}

function getArticlePublishResultPath() {
  return window.location.pathname;
}

function isPublishedArticleResultPath(pathname: string) {
  return (
    PUBLISHED_ARTICLE_URL_PATTERN.test(pathname) ||
    INTERNAL_PUBLISHED_ARTICLE_URL_PATTERN.test(pathname)
  );
}

function isWithinDialog(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest('[role="dialog"],[aria-modal="true"],[data-testid="confirmationSheetDialog"]'),
  );
}

function pageIncludesArticlePublishSuccessSignal() {
  const bodyText = document.body?.innerText ?? '';
  return ARTICLE_PUBLISH_SUCCESS_PATTERNS.some((pattern) => pattern.test(bodyText));
}

function emitDirectArticlePublishMutation(
  reason: string,
  endpoint: string,
  requestKind: 'fetch' | 'xhr',
) {
  const detail: ComposerMutationEventDetail = {
    actionType: 'original',
    endpoint,
    timestamp: new Date().toISOString(),
    requestKind,
    signature: `article:${reason}:${Date.now()}`,
    targetHandle: null,
    contentFormat: 'article',
    contentFormatGroup: 'long_form',
    contentRecognitionStatus: 'recognized',
  };

  window.dispatchEvent(new CustomEvent(BRIDGE_EVENT_NAME, { detail }));
  markArticlePublishSuccess(reason, endpoint, requestKind, []);
}

function emitDirectShortPostMutation(
  reason: string,
  endpoint: string,
  requestKind: 'fetch' | 'xhr',
) {
  transitionShortPostState('recognized', reason, '已通过页面结果确认普通短推发布成功。', {
    endpoint,
    requestKind,
    responseKeys: [],
  });

  const detail: ComposerMutationEventDetail = {
    actionType: 'original',
    endpoint,
    timestamp: new Date().toISOString(),
    requestKind,
    signature: `short-post:${reason}:${Date.now()}`,
    targetHandle: null,
    contentFormat: 'short_post',
    contentFormatGroup: 'short',
    contentRecognitionStatus: 'recognized',
  };

  window.dispatchEvent(new CustomEvent(BRIDGE_EVENT_NAME, { detail }));
  shortPostPublishSession = {
    state: 'idle',
    pendingAt: 0,
    composerText: '',
  };
}

function tryConfirmArticlePublishBySuccessToast(reason: string) {
  if (articlePublishSession.state !== 'publish_submitted') {
    return;
  }

  if (!pageIncludesArticlePublishSuccessSignal()) {
    return;
  }

  emitDirectArticlePublishMutation(reason, 'page-toast:article-published', 'fetch');
}

function tryConfirmArticlePublishByPageResult(reason: string) {
  if (!hasPendingArticlePublishSession()) {
    return;
  }

  const pathname = getArticlePublishResultPath();
  if (!isPublishedArticleResultPath(pathname)) {
    return;
  }

  const articleRequestIsRecent =
    articlePublishSession.lastArticleRequestAt > 0 &&
    Date.now() - articlePublishSession.lastArticleRequestAt < ARTICLE_PUBLISH_PENDING_WINDOW_MS;

  if (!articleRequestIsRecent) {
    pushArticleDebugEvent(
      'article-page-result-ignored',
      '页面已跳转到文章结果，但最近没有命中长文相关请求，不做兜底记账',
    );
    return;
  }

  emitDirectArticlePublishMutation(reason, `page-result:${pathname}`, 'fetch');
}

function tryConfirmShortPostPublishByPageResult(reason: string) {
  if (!hasPendingShortPostPublishSession()) {
    return;
  }

  const pathname = window.location.pathname;
  if (!SHORT_POST_RESULT_PATH_PATTERN.test(pathname)) {
    return;
  }

  emitDirectShortPostMutation(reason, `page-result:${pathname}`, 'fetch');
}

function resetArticlePublishSession(reason: string, detail: string) {
  if (articlePublishSession.state === 'idle') {
    return;
  }

  transitionArticlePublishState('idle', reason, detail);
}

function syncArticleWorkflowState(reason: string) {
  if (isArticleEditorContext()) {
    ensureArticleEditingState(reason);
    return;
  }

  const pathname = getArticlePublishResultPath();
  if (COMPOSE_POST_PATH_PATTERN.test(pathname)) {
    resetArticlePublishSession('article-context-left', '已切回普通发帖流程，清理长文识别状态');
    return;
  }

  if (articlePublishSession.state === 'published' && !isPublishedArticleResultPath(pathname)) {
    resetArticlePublishSession(
      'article-session-finished',
      '已离开长文发布结果页，结束本次长文会话',
    );
  }
}

function normalizeHandle(handle: string | null | undefined) {
  return (handle ?? '').trim().replace(/^@+/, '').toLowerCase();
}

function extractHandleFromStatusUrl(url: string | null | undefined) {
  const matched = (url ?? '').match(/x\.com\/([^/?#]+)\/status\//i);
  const handle = normalizeHandle(matched?.[1]);
  if (!handle || RESERVED_HANDLES.has(handle)) {
    return null;
  }

  return handle;
}

function resolveTargetHandleFromLocation() {
  const locationHandle = window.location.pathname.match(/^\/([^/]+)\/status\//)?.[1];
  const normalized = normalizeHandle(locationHandle);
  if (!normalized || RESERVED_HANDLES.has(normalized)) {
    return null;
  }

  return normalized;
}

function resolveTargetHandleFromDom() {
  const selectors = [
    '[role="dialog"] article a[href*="/status/"]',
    '[data-testid="tweet"] a[href*="/status/"]',
    'article a[href*="/status/"]',
  ];

  for (const selector of selectors) {
    const anchor = document.querySelector<HTMLAnchorElement>(selector);
    const resolvedHandle =
      extractHandleFromStatusUrl(anchor?.href) ??
      extractHandleFromStatusUrl(anchor?.getAttribute('href') ?? '');

    if (resolvedHandle) {
      return resolvedHandle;
    }
  }

  return null;
}

function resolveTargetHandle(actionType: ComposerActionType) {
  if (actionType === 'original') {
    return null;
  }

  return resolveTargetHandleFromLocation() ?? resolveTargetHandleFromDom();
}

function buildSignature(url: string, actionType: ComposerActionType, payload: unknown) {
  const payloadHint =
    typeof payload === 'string'
      ? payload.slice(0, 120)
      : (JSON.stringify(payload)?.slice(0, 180) ?? 'no-payload');

  return `${actionType}:${url}:${payloadHint}`;
}

function isCandidateImportRequest(url: string) {
  return FOLLOWING_PATTERN.test(url) || FOLLOWERS_PATTERN.test(url);
}

function getCandidateImportSource(url: string) {
  return FOLLOWING_PATTERN.test(url) ? 'from_following' : 'from_followers';
}

function extractCandidateUsers(value: unknown) {
  const candidates = new Map<string, CandidateAccountImportEventDetail['items'][number]>();

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    const maybeUser = node as Record<string, unknown>;
    const typename = maybeUser.__typename;
    const screenName =
      isRecord(maybeUser.core) && typeof maybeUser.core.screen_name === 'string'
        ? maybeUser.core.screen_name
        : null;
    const displayName =
      isRecord(maybeUser.core) && typeof maybeUser.core.name === 'string'
        ? maybeUser.core.name
        : '';
    const legacy = isRecord(maybeUser.legacy) ? maybeUser.legacy : null;

    if (typename === 'User' && screenName && legacy) {
      const handle = normalizeHandle(screenName);
      if (handle && !RESERVED_HANDLES.has(handle)) {
        candidates.set(handle, {
          handle,
          displayName,
          followersCount:
            typeof legacy.followers_count === 'number' ? legacy.followers_count : null,
          followingCount: typeof legacy.friends_count === 'number' ? legacy.friends_count : null,
          verified:
            (isRecord(maybeUser.verification) && maybeUser.verification.verified === true) ||
            maybeUser.is_blue_verified === true,
          bio: typeof legacy.description === 'string' ? legacy.description : '',
          capturedAt: new Date().toISOString(),
        });
      }
    }

    Object.values(node).forEach(visit);
  };

  visit(value);
  return [...candidates.values()];
}

function emitCandidateImportEvent(url: string, responsePayload: unknown) {
  const items = extractCandidateUsers(responsePayload);
  if (items.length === 0) {
    return;
  }

  const detail: CandidateAccountImportEventDetail = {
    source: getCandidateImportSource(url),
    items,
  };

  window.dispatchEvent(new CustomEvent(CANDIDATE_IMPORT_EVENT_NAME, { detail }));
}

function emitMutationEvent(
  actionType: ComposerActionType,
  endpoint: string,
  payload: unknown,
  responsePayload: unknown,
  requestKind: 'fetch' | 'xhr',
) {
  const contentFormat =
    actionType === 'original'
      ? inferOriginalContentFormat(payload, endpoint, responsePayload)
      : {
          format: null,
          formatGroup: null,
          status: 'recognized' as ContentRecognitionStatus,
        };
  const detail: ComposerMutationEventDetail = {
    actionType,
    endpoint,
    timestamp: new Date().toISOString(),
    requestKind,
    signature: buildSignature(endpoint, actionType, payload),
    targetHandle: resolveTargetHandle(actionType),
    contentFormat: contentFormat.format,
    contentFormatGroup: contentFormat.formatGroup,
    contentRecognitionStatus: contentFormat.status,
  };

  window.dispatchEvent(new CustomEvent(BRIDGE_EVENT_NAME, { detail }));

  if (actionType === 'original' && contentFormat.formatGroup === 'long_form') {
    markArticlePublishSuccess(
      'publish-confirmed',
      endpoint,
      requestKind,
      collectNormalizedKeys(responsePayload),
    );
  }

  if (actionType === 'original' && contentFormat.formatGroup === 'short') {
    transitionShortPostState(
      'recognized',
      'short-post-recognized',
      '已识别为普通短推并准备记账。',
      {
        endpoint,
        requestKind,
        responseKeys: collectNormalizedKeys(responsePayload),
      },
    );
    shortPostPublishSession = {
      state: 'idle',
      pendingAt: 0,
      composerText: '',
    };
  }
}

function shouldHandleRequest(url: string) {
  return CREATE_TWEET_PATTERN.test(url);
}

function shouldHandleGraphqlMutation(url: string, payload: unknown, responsePayload: unknown) {
  const actionType = inferActionType(payload);

  if (actionType !== 'original') {
    return shouldHandleRequest(url);
  }

  if (!GRAPHQL_PATTERN.test(url)) {
    return false;
  }

  if (
    ARTICLE_GRAPHQL_PATTERN.test(url) ||
    hasArticlePayloadSignals(payload) ||
    hasArticlePayloadSignals(responsePayload)
  ) {
    ensureArticleEditingState('article-request-seen');
    return looksLikeArticlePublishSuccess(url, payload, responsePayload);
  }

  return (
    shouldHandleRequest(url) || looksLikeShortPostPublishSuccess(url, payload, responsePayload)
  );
}

function handleArticlePublishIntent(target: EventTarget | null) {
  if (
    isElementMatchingSelectors(target, ARTICLE_PREVIEW_SELECTORS) ||
    isElementMatchingTextPatterns(target, ARTICLE_PREVIEW_TEXT_PATTERNS)
  ) {
    ensureArticleEditingState('preview-clicked');
    pushArticleDebugEvent('preview-clicked', '检测到预览动作，保持长文编辑态');
    return;
  }

  if (
    isElementMatchingSelectors(target, ARTICLE_PUBLISH_SELECTORS) ||
    isElementMatchingTextPatterns(target, ARTICLE_PUBLISH_TEXT_PATTERNS)
  ) {
    if (isWithinDialog(target)) {
      submitArticlePublish('publish-dialog-confirmed');
      return;
    }

    openArticlePublishDialog('publish-entry-clicked');
    return;
  }
}

function handleShortPostPublishIntent(target: EventTarget | null) {
  if (!isShortPostComposerContext()) {
    return;
  }

  if (
    isElementMatchingSelectors(target, SHORT_POST_PUBLISH_BUTTON_SELECTORS) ||
    isElementMatchingTextPatterns(target, SHORT_POST_PUBLISH_TEXT_PATTERNS)
  ) {
    openShortPostPublishSession('short-post-publish-clicked');
  }
}

document.addEventListener(
  'click',
  (event) => {
    handleArticlePublishIntent(event.target);
    handleShortPostPublishIntent(event.target);
  },
  true,
);

document.addEventListener(
  'keydown',
  (event) => {
    if (!isArticleEditorContext()) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      openArticlePublishDialog('publish-shortcut');
    }
  },
  true,
);

document.addEventListener(
  'submit',
  () => {
    if (isArticleEditorContext()) {
      submitArticlePublish('article-submit');
    }
  },
  true,
);

const articleContextObserver = new MutationObserver(() => {
  syncArticleWorkflowState('dom-observer');
  tryConfirmArticlePublishBySuccessToast('page-toast-confirmed');
  tryConfirmArticlePublishByPageResult('page-result-confirmed');
  tryConfirmShortPostPublishByPageResult('short-post-page-result-confirmed');
});

articleContextObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
});

syncArticleWorkflowState('bridge-init');
window.addEventListener('popstate', () => {
  syncArticleWorkflowState('popstate');
  tryConfirmArticlePublishBySuccessToast('popstate-toast-confirmed');
  tryConfirmArticlePublishByPageResult('popstate-result-confirmed');
  tryConfirmShortPostPublishByPageResult('short-post-popstate-result-confirmed');
});

window.addEventListener('hashchange', () => {
  syncArticleWorkflowState('hashchange');
  tryConfirmArticlePublishBySuccessToast('hashchange-toast-confirmed');
  tryConfirmArticlePublishByPageResult('hashchange-result-confirmed');
  tryConfirmShortPostPublishByPageResult('short-post-hashchange-result-confirmed');
});

async function readResponsePayload(response: Response) {
  try {
    return await response.clone().json();
  } catch {
    try {
      return safeJsonParse(await response.clone().text());
    } catch {
      return null;
    }
  }
}

function hookFetch() {
  if (typeof window.fetch !== 'function') {
    return;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const [input, init] = args;
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : '';
    const requestBody = init?.body ?? (input instanceof Request ? await input.clone().text() : '');
    const response = await originalFetch(...args);

    const payload = safeJsonParse(requestBody);
    const responsePayload = response.ok ? await readResponsePayload(response) : null;

    if (response.ok && shouldHandleGraphqlMutation(url, payload, responsePayload)) {
      emitMutationEvent(inferActionType(payload), url, payload, responsePayload, 'fetch');
    }

    if (response.ok && isCandidateImportRequest(url)) {
      try {
        emitCandidateImportEvent(url, responsePayload);
      } catch {
        // Ignore non-JSON candidate import responses.
      }
    }

    return response;
  };
}

function hookXhr() {
  const OriginalXhr = window.XMLHttpRequest;
  const xhrOpen = OriginalXhr.prototype.open;
  const xhrSend = OriginalXhr.prototype.send;

  OriginalXhr.prototype.open = function (
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    (this as XMLHttpRequest & { __xGrowthUrl?: string }).__xGrowthUrl = String(url ?? '');
    return xhrOpen.call(this, method, url, async ?? true, username, password);
  };

  OriginalXhr.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const requestBody = body;

    this.addEventListener('load', () => {
      const currentXhr = this as XMLHttpRequest & { __xGrowthUrl?: string };
      const requestUrl = currentXhr.__xGrowthUrl ?? '';

      const payload = safeJsonParse(requestBody);
      const responsePayload = safeJsonParse(this.responseText);

      if (
        this.status >= 200 &&
        this.status < 300 &&
        shouldHandleGraphqlMutation(requestUrl, payload, responsePayload)
      ) {
        emitMutationEvent(inferActionType(payload), requestUrl, payload, responsePayload, 'xhr');
      }

      if (this.status >= 200 && this.status < 300 && isCandidateImportRequest(requestUrl)) {
        try {
          emitCandidateImportEvent(requestUrl, responsePayload);
        } catch {
          // Ignore malformed candidate import payloads.
        }
      }
    });

    return xhrSend.call(this, body);
  };
}

hookFetch();
hookXhr();
