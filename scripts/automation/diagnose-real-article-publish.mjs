import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const skillBaseDir = 'C:/Users/86180/.agents/skills/baoyu-post-to-x/scripts';
const utilsModuleUrl = pathToFileURL(path.join(skillBaseDir, 'x-utils.ts')).href;

const {
  CHROME_CANDIDATES_BASIC,
  CdpConnection,
  findExistingChromeDebugPort,
  getDefaultProfileDir,
  launchChrome,
  openPageSession,
  sleep,
  waitForChromeDebugPort,
} = await import(utilsModuleUrl);

const X_ARTICLES_URL = 'https://x.com/compose/articles';
const OUTPUT_PATH = path.resolve(
  'tmp/twitter-web-exporter/tmp/real-article-publish-diagnostics.json',
);
const KEEP_BROWSER_OPEN = process.env.X_GROWTH_KEEP_BROWSER_OPEN !== '0';
const CLONE_SHARED_PROFILE = process.env.X_GROWTH_CLONE_SHARED_PROFILE === '1';
const REAL_CHROME_USER_DATA_DIR = path.join(
  process.env.LOCALAPPDATA ?? '',
  'Google',
  'Chrome',
  'User Data',
);
const REAL_CHROME_PROFILE_NAME = 'Default';
const REAL_PROFILE_SUBSET = [
  'Preferences',
  'Secure Preferences',
  'Network',
  'Local Storage',
  'Session Storage',
  'IndexedDB',
  'Service Worker',
  'WebStorage',
  'Accounts',
  'History',
  'History-journal',
  'Web Data',
  'Web Data-journal',
  'Login Data',
  'Login Data-journal',
  'Extension Cookies',
];

const I18N_SELECTORS = {
  titleInput: [
    'textarea[placeholder="Add a title"]',
    'textarea[placeholder="添加标题"]',
    'textarea[placeholder="タイトルを追加"]',
    'textarea[placeholder="제목 추가"]',
    'textarea[name="Article Title"]',
  ],
  previewButton: [
    'a[href*="/preview"]',
    '[data-testid="previewButton"]',
    'button[aria-label*="preview" i]',
    'button[aria-label*="预览" i]',
    'button[aria-label*="プレビュー" i]',
    'button[aria-label*="미리보기" i]',
  ],
  publishButton: [
    '[data-testid="publishButton"]',
    'button[aria-label*="publish" i]',
    'button[aria-label*="发布" i]',
    'button[aria-label*="公開" i]',
    'button[aria-label*="게시" i]',
  ],
};

/**
 * NOTE: 这条脚本的目标不是“优雅发布文章”，而是抓真实发布信号。
 * 所以会尽量少做格式化动作，只填标题和正文，降低排查噪音。
 */

function nowTag() {
  const stamp = new Date();
  const parts = [
    stamp.getFullYear(),
    String(stamp.getMonth() + 1).padStart(2, '0'),
    String(stamp.getDate()).padStart(2, '0'),
    String(stamp.getHours()).padStart(2, '0'),
    String(stamp.getMinutes()).padStart(2, '0'),
    String(stamp.getSeconds()).padStart(2, '0'),
  ];
  return parts.join('');
}

function normalizeMaybeJson(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 4000);
  }
}

function pickInterestingFields(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => pickInterestingFields(item));
  }

  if (typeof value !== 'object') {
    return value;
  }

  const source = value;
  const picked = {};
  for (const [key, nested] of Object.entries(source)) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.includes('article') ||
      normalizedKey.includes('publish') ||
      normalizedKey.includes('permalink') ||
      normalizedKey.includes('rest_id') ||
      normalizedKey.includes('slug') ||
      normalizedKey.includes('status') ||
      normalizedKey.includes('url') ||
      normalizedKey.includes('error')
    ) {
      picked[key] = pickInterestingFields(nested);
    }
  }

  if (Object.keys(picked).length > 0) {
    return picked;
  }

  const compact = {};
  for (const [key, nested] of Object.entries(source).slice(0, 12)) {
    compact[key] = typeof nested === 'object' ? '[object]' : nested;
  }
  return compact;
}

async function waitForElement(cdp, sessionId, selector, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await cdp.send(
      'Runtime.evaluate',
      {
        expression: `!!document.querySelector(${JSON.stringify(selector)})`,
        returnByValue: true,
      },
      { sessionId },
    );

    if (result.result.value) {
      return true;
    }

    await sleep(400);
  }

  return false;
}

async function copyIfExists(sourcePath, targetPath) {
  try {
    await fs.cp(sourcePath, targetPath, {
      recursive: true,
      force: true,
      errorOnExist: false,
    });
  } catch {
    // NOTE: 诊断脚本尽量继续跑，单个缓存文件缺失不应该中断整个排查。
  }
}

async function createRealProfileClone() {
  const sourceProfileDir = path.join(REAL_CHROME_USER_DATA_DIR, REAL_CHROME_PROFILE_NAME);
  const localStatePath = path.join(REAL_CHROME_USER_DATA_DIR, 'Local State');
  const cloneRoot = path.join(os.tmpdir(), `x-growth-real-profile-${Date.now()}`);
  const cloneProfileDir = path.join(cloneRoot, REAL_CHROME_PROFILE_NAME);

  await fs.mkdir(cloneProfileDir, { recursive: true });
  await copyIfExists(localStatePath, path.join(cloneRoot, 'Local State'));

  for (const entryName of REAL_PROFILE_SUBSET) {
    await copyIfExists(
      path.join(sourceProfileDir, entryName),
      path.join(cloneProfileDir, entryName),
    );
  }

  for (const lockName of ['LOCK', 'SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try {
      await fs.rm(path.join(cloneRoot, lockName), { force: true });
    } catch {
      // Ignore stale lock removal failures in diagnostics mode.
    }
    try {
      await fs.rm(path.join(cloneProfileDir, lockName), { force: true });
    } catch {
      // Ignore stale lock removal failures in diagnostics mode.
    }
  }

  return cloneRoot;
}

async function createSharedProfileClone(sharedProfileDir) {
  const cloneRoot = path.join(os.tmpdir(), `x-growth-shared-profile-${Date.now()}`);
  await fs.mkdir(cloneRoot, { recursive: true });
  const entries = await fs.readdir(sharedProfileDir);

  for (const entryName of entries) {
    await copyIfExists(path.join(sharedProfileDir, entryName), path.join(cloneRoot, entryName));
  }

  for (const lockName of ['LOCK', 'SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try {
      await fs.rm(path.join(cloneRoot, lockName), { force: true });
    } catch {
      // Ignore stale lock removal failures in diagnostics mode.
    }
  }

  return cloneRoot;
}

async function readPageDiagnostics(cdp, sessionId) {
  const [urlResult, bodyTextResult, buttonsResult, textareasResult] = await Promise.all([
    cdp.send(
      'Runtime.evaluate',
      {
        expression: 'window.location.href',
        returnByValue: true,
      },
      { sessionId },
    ),
    cdp.send(
      'Runtime.evaluate',
      {
        expression: '(document.body?.innerText || "").slice(0, 3000)',
        returnByValue: true,
      },
      { sessionId },
    ),
    cdp.send(
      'Runtime.evaluate',
      {
        expression: `JSON.stringify(
          Array.from(document.querySelectorAll('button,[role="button"],a')).slice(0, 80).map((node) => ({
            text: (node.textContent || '').trim().slice(0, 120),
            aria: node.getAttribute?.('aria-label') || '',
            role: node.getAttribute?.('role') || '',
            href: node.getAttribute?.('href') || '',
            testid: node.getAttribute?.('data-testid') || '',
          }))
        )`,
        returnByValue: true,
      },
      { sessionId },
    ),
    cdp.send(
      'Runtime.evaluate',
      {
        expression: `JSON.stringify(
          Array.from(document.querySelectorAll('textarea,[contenteditable="true"]')).slice(0, 30).map((node) => ({
            tag: node.tagName,
            placeholder: node.getAttribute?.('placeholder') || '',
            name: node.getAttribute?.('name') || '',
            testid: node.getAttribute?.('data-testid') || '',
            className: node.getAttribute?.('class') || '',
            text: (node.textContent || '').trim().slice(0, 120),
          }))
        )`,
        returnByValue: true,
      },
      { sessionId },
    ),
  ]);

  return {
    url: urlResult.result.value ?? '',
    bodyText: bodyTextResult.result.value ?? '',
    buttons: normalizeMaybeJson(buttonsResult.result.value ?? '[]'),
    editableNodes: normalizeMaybeJson(textareasResult.result.value ?? '[]'),
  };
}

async function clickAnySelector(cdp, sessionId, selectors) {
  const result = await cdp.send(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const selectors = ${JSON.stringify(selectors)};
        for (const selector of selectors) {
          const node = document.querySelector(selector);
          if (node instanceof HTMLElement && !node.hasAttribute('disabled')) {
            node.click();
            return selector;
          }
        }
        return null;
      })()`,
      returnByValue: true,
    },
    { sessionId },
  );

  return result.result.value;
}

async function clickPublishButtonFallback(cdp, sessionId) {
  const result = await cdp.send(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const publishTexts = [/publish/i, /发布/i, /公開/i, /게시/i];
        const candidates = Array.from(document.querySelectorAll('button,[role="button"],a,div,span'));
        for (const node of candidates) {
          if (!(node instanceof HTMLElement)) continue;
          const text = (node.innerText || node.textContent || '').trim();
          const aria = node.getAttribute('aria-label') || '';
          const testid = node.getAttribute('data-testid') || '';
          const combined = [text, aria, testid].join(' ');
          if (!publishTexts.some((matcher) => matcher.test(combined))) {
            continue;
          }
          const clickable = node.closest('button,[role="button"],a') || node;
          if (clickable instanceof HTMLElement && !clickable.hasAttribute('disabled')) {
            clickable.click();
            return {
              matchedBy: 'text-fallback',
              text,
              aria,
              testid,
              tag: clickable.tagName,
            };
          }
        }
        return null;
      })()`,
      returnByValue: true,
    },
    { sessionId },
  );

  return result.result.value;
}

async function waitForPublishDialog(cdp, sessionId, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await cdp.send(
      'Runtime.evaluate',
      {
        expression: `(() => {
          const dialogs = Array.from(document.querySelectorAll('[role="dialog"],[aria-modal="true"]'));
          return dialogs.some((node) => /publish article/i.test((node.textContent || '').trim()));
        })()`,
        returnByValue: true,
      },
      { sessionId },
    );

    if (result.result.value) {
      return true;
    }

    await sleep(300);
  }

  return false;
}

async function waitForArticlePublishSuccess(cdp, sessionId, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await cdp.send(
      'Runtime.evaluate',
      {
        expression: `(() => {
          const text = document.body?.innerText || '';
          return /success!\\s*your article has been published/i.test(text)
            || /your article has been published/i.test(text)
            || /article published/i.test(text)
            || /文章已发布/i.test(text);
        })()`,
        returnByValue: true,
      },
      { sessionId },
    );

    if (result.result.value) {
      return true;
    }

    await sleep(400);
  }

  return false;
}

async function main() {
  const sharedProfileDir = getDefaultProfileDir();
  const forceSharedProfile = process.env.X_GROWTH_FORCE_SHARED_PROFILE === '1';
  const actualProfileExists = process.env.LOCALAPPDATA
    ? await fs
        .access(path.join(REAL_CHROME_USER_DATA_DIR, REAL_CHROME_PROFILE_NAME))
        .then(() => true)
        .catch(() => false)
    : false;
  const profileDir = CLONE_SHARED_PROFILE
    ? await createSharedProfileClone(sharedProfileDir)
    : !forceSharedProfile && actualProfileExists
      ? await createRealProfileClone()
      : sharedProfileDir;
  const timestampTag = nowTag();
  const articleTitle = `[诊断] X 长文识别 ${timestampTag}`;
  const articleBody =
    `这是一次真实发布诊断。\n` +
    `时间：${new Date().toISOString()}\n` +
    `目标：抓取真正的 Article 发布请求和返回，用来修复插件识别。`;

  const requestMap = new Map();
  const diagnostics = {
    startedAt: new Date().toISOString(),
    profileDir,
    usedRealChromeClone: !forceSharedProfile && actualProfileExists,
    forceSharedProfile,
    articleTitle,
    articleBody,
    usedExistingChrome: false,
    requests: [],
    finalUrl: '',
  };

  const existingPort = CLONE_SHARED_PROFILE ? null : await findExistingChromeDebugPort(profileDir);
  diagnostics.usedExistingChrome = existingPort !== null;
  let port = existingPort ?? 0;
  let chromeProcess = null;

  if (!existingPort) {
    const launched = await launchChrome(X_ARTICLES_URL, profileDir, CHROME_CANDIDATES_BASIC);
    chromeProcess = launched.chrome;
    port = launched.port;
  }

  let cdp = null;

  try {
    const wsUrl = await waitForChromeDebugPort(port, 30000, { includeLastError: true });
    cdp = await CdpConnection.connect(wsUrl, 30000, { defaultTimeoutMs: 60000 });
    const page = await openPageSession({
      cdp,
      reusing: diagnostics.usedExistingChrome,
      url: X_ARTICLES_URL,
      matchTarget: (target) => target.type === 'page' && target.url.startsWith(X_ARTICLES_URL),
      enablePage: true,
      enableRuntime: true,
      enableDom: true,
      enableNetwork: true,
    });
    const { sessionId } = page;
    const currentUrl = await cdp.send(
      'Runtime.evaluate',
      {
        expression: 'window.location.href',
        returnByValue: true,
      },
      { sessionId },
    );
    if (!String(currentUrl.result.value ?? '').startsWith(X_ARTICLES_URL)) {
      await cdp.send('Page.navigate', { url: X_ARTICLES_URL }, { sessionId });
      await sleep(2500);
    }

    cdp.on('Network.requestWillBeSent', (params) => {
      if (!params || !params.requestId || typeof params.request?.url !== 'string') {
        return;
      }

      if (!/\/graphql\//i.test(params.request.url)) {
        return;
      }

      requestMap.set(params.requestId, {
        requestId: params.requestId,
        url: params.request.url,
        method: params.request.method,
        requestBody: normalizeMaybeJson(params.request.postData ?? ''),
        responseStatus: null,
        responseBody: null,
      });
    });

    cdp.on('Network.responseReceived', (params) => {
      const current = requestMap.get(params?.requestId);
      if (!current) {
        return;
      }

      current.responseStatus = params.response?.status ?? null;
    });

    cdp.on('Network.loadingFinished', async (params) => {
      const current = requestMap.get(params?.requestId);
      if (!current) {
        return;
      }

      try {
        const body = await cdp.send(
          'Network.getResponseBody',
          { requestId: params.requestId },
          { sessionId, timeoutMs: 10000 },
        );
        current.responseBody = normalizeMaybeJson(body.body);
      } catch (error) {
        current.responseBody = {
          failedToRead: true,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });

    await sleep(1500);

    const writeButtonFound = await waitForElement(
      cdp,
      sessionId,
      '[data-testid="empty_state_button_text"]',
      8000,
    );
    if (writeButtonFound) {
      await cdp.send(
        'Runtime.evaluate',
        {
          expression: `document.querySelector('[data-testid="empty_state_button_text"]')?.click()`,
        },
        { sessionId },
      );
      await sleep(2000);
    }

    const titleReady = await waitForElement(cdp, sessionId, I18N_SELECTORS.titleInput[0], 15000);
    if (!titleReady) {
      const pageDiagnostics = await readPageDiagnostics(cdp, sessionId);
      await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
      await fs.writeFile(
        OUTPUT_PATH,
        JSON.stringify(
          {
            ...diagnostics,
            failedStage: 'wait-title-input',
            pageDiagnostics,
          },
          null,
          2,
        ),
        'utf-8',
      );
      throw new Error(
        `没有找到 Article 标题输入框，无法继续真实诊断。当前页面：${pageDiagnostics.url}`,
      );
    }

    await cdp.send(
      'Runtime.evaluate',
      {
        expression: `(() => {
          const selectors = ${JSON.stringify(I18N_SELECTORS.titleInput)};
          for (const selector of selectors) {
            const node = document.querySelector(selector);
            if (node instanceof HTMLElement) {
              node.focus();
              return true;
            }
          }
          return false;
        })()`,
      },
      { sessionId },
    );
    await sleep(200);
    await cdp.send('Input.insertText', { text: articleTitle }, { sessionId });
    await sleep(400);
    await cdp.send(
      'Input.dispatchKeyEvent',
      { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
      { sessionId },
    );
    await cdp.send(
      'Input.dispatchKeyEvent',
      { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
      { sessionId },
    );
    await sleep(800);

    await cdp.send(
      'Runtime.evaluate',
      {
        expression: `(() => {
          const editor = document.querySelector('.DraftEditor-editorContainer [contenteditable="true"]');
          if (editor instanceof HTMLElement) {
            editor.focus();
            return true;
          }
          return false;
        })()`,
      },
      { sessionId },
    );
    await sleep(300);
    await cdp.send('Input.insertText', { text: articleBody }, { sessionId });
    await sleep(800);

    await cdp.send(
      'Runtime.evaluate',
      {
        expression: `(() => {
          const editor = document.querySelector('.DraftEditor-editorContainer [contenteditable="true"]');
          if (editor instanceof HTMLElement) {
            editor.blur();
          }
          document.body.click();
        })()`,
      },
      { sessionId },
    );
    await sleep(2000);

    await clickAnySelector(cdp, sessionId, I18N_SELECTORS.previewButton);
    await sleep(2500);

    const clickedSelector = await clickAnySelector(cdp, sessionId, I18N_SELECTORS.publishButton);
    const clickedFallback = clickedSelector
      ? null
      : await clickPublishButtonFallback(cdp, sessionId);
    if (!clickedSelector && !clickedFallback) {
      const pageDiagnostics = await readPageDiagnostics(cdp, sessionId);
      diagnostics.finalUrl = pageDiagnostics.url;
      diagnostics.requests = [...requestMap.values()].map((item) => ({
        requestId: item.requestId,
        url: item.url,
        method: item.method,
        requestBody: pickInterestingFields(item.requestBody),
        responseStatus: item.responseStatus,
        responseBody: pickInterestingFields(item.responseBody),
      }));
      await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
      await fs.writeFile(
        OUTPUT_PATH,
        JSON.stringify(
          {
            ...diagnostics,
            failedStage: 'wait-publish-button',
            pageDiagnostics,
          },
          null,
          2,
        ),
        'utf-8',
      );
      throw new Error('没有找到可点击的 Publish 按钮。');
    }

    const dialogVisible = await waitForPublishDialog(cdp, sessionId, 12000);
    diagnostics.publishDialogVisible = dialogVisible;

    if (!dialogVisible) {
      const pageDiagnostics = await readPageDiagnostics(cdp, sessionId);
      diagnostics.finalUrl = pageDiagnostics.url;
      diagnostics.requests = [...requestMap.values()].map((item) => ({
        requestId: item.requestId,
        url: item.url,
        method: item.method,
        requestBody: pickInterestingFields(item.requestBody),
        responseStatus: item.responseStatus,
        responseBody: pickInterestingFields(item.responseBody),
      }));
      await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
      await fs.writeFile(
        OUTPUT_PATH,
        JSON.stringify(
          {
            ...diagnostics,
            failedStage: 'wait-publish-dialog',
            pageDiagnostics,
          },
          null,
          2,
        ),
        'utf-8',
      );
      throw new Error('点击编辑页 Publish 后，没有出现 Publish Article 确认弹窗。');
    }

    const confirmSelector = await clickAnySelector(cdp, sessionId, I18N_SELECTORS.publishButton);
    const confirmFallback = confirmSelector
      ? null
      : await clickPublishButtonFallback(cdp, sessionId);
    diagnostics.confirmPublishMatch = confirmSelector ?? confirmFallback;

    if (!confirmSelector && !confirmFallback) {
      const pageDiagnostics = await readPageDiagnostics(cdp, sessionId);
      diagnostics.finalUrl = pageDiagnostics.url;
      diagnostics.requests = [...requestMap.values()].map((item) => ({
        requestId: item.requestId,
        url: item.url,
        method: item.method,
        requestBody: pickInterestingFields(item.requestBody),
        responseStatus: item.responseStatus,
        responseBody: pickInterestingFields(item.responseBody),
      }));
      await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
      await fs.writeFile(
        OUTPUT_PATH,
        JSON.stringify(
          {
            ...diagnostics,
            failedStage: 'click-confirm-publish',
            pageDiagnostics,
          },
          null,
          2,
        ),
        'utf-8',
      );
      throw new Error('确认弹窗出现了，但没有找到第二个 Publish 按钮。');
    }

    diagnostics.publishSuccessVisible = await waitForArticlePublishSuccess(cdp, sessionId, 20000);
    await sleep(2500);

    const currentUrlResult = await cdp.send(
      'Runtime.evaluate',
      {
        expression: 'window.location.href',
        returnByValue: true,
      },
      { sessionId },
    );
    diagnostics.finalUrl = currentUrlResult.result.value ?? '';

    diagnostics.requests = [...requestMap.values()].map((item) => ({
      requestId: item.requestId,
      url: item.url,
      method: item.method,
      requestBody: pickInterestingFields(item.requestBody),
      responseStatus: item.responseStatus,
      responseBody: pickInterestingFields(item.responseBody),
    }));

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(diagnostics, null, 2), 'utf-8');

    console.log(
      JSON.stringify(
        {
          outputPath: OUTPUT_PATH,
          finalUrl: diagnostics.finalUrl,
          graphqlCount: diagnostics.requests.length,
          keepBrowserOpen: KEEP_BROWSER_OPEN,
          publishMatch: clickedSelector ?? clickedFallback,
        },
        null,
        2,
      ),
    );
  } finally {
    if (cdp) {
      cdp.close();
    }

    if (chromeProcess && !KEEP_BROWSER_OPEN) {
      try {
        chromeProcess.kill();
      } catch {
        // Ignore browser close failures; the next run can reuse the instance.
      }
    }
  }
}

await main();
/* global console */
