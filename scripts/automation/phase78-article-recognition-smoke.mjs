/* global URL, console, chrome, document, fetch, HTMLButtonElement, process, window, history */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const playwrightModulePath = pathToFileURL(
  'F:/Node.js/node_global/node_modules/playwright/index.mjs',
).href;

const { chromium } = await import(playwrightModulePath);

const extensionPath = path.resolve('dist/extension');
const userDataDir = path.join(os.tmpdir(), 'x-growth-task-coach-phase78-article');
const KEEP_BROWSER_OPEN = process.env.X_GROWTH_KEEP_BROWSER_OPEN === '1';

async function rimraf(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function getExtensionId(context) {
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  }

  return new URL(serviceWorker.url()).host;
}

await rimraf(userDataDir);

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: false,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

try {
  const extensionId = await getExtensionId(context);

  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`, {
    waitUntil: 'domcontentloaded',
  });
  await optionsPage.evaluate(async () => {
    await new Promise((resolve) => {
      chrome.storage.local.get('xGrowthTaskCoach.settings', (items) => {
        const settings = items['xGrowthTaskCoach.settings'] ?? {};
        chrome.storage.local.set(
          {
            'xGrowthTaskCoach.settings': {
              ...settings,
              accountHandle: 'tester',
              debugModeEnabled: true,
            },
          },
          () => resolve(true),
        );
      });
    });
  });
  await optionsPage.evaluate(async () => {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'x-growth:article-debug-clear' }, () => resolve(true));
    });
  });
  await optionsPage.waitForTimeout(1500);

  const articlePage = await context.newPage();
  await articlePage.route('**/i/api/graphql/**', async (route) => {
    const requestUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        /CreateArticle/i.test(requestUrl)
          ? {
              data: {
                create_article: {
                  article_results: {
                    result: {
                      rest_id: 'article-1',
                      slug: 'phase78-article',
                      permalink: '/i/articles/phase78-article',
                    },
                  },
                },
              },
            }
          : { data: { create_tweet: { tweet_results: { result: {} } } } },
      ),
    });
  });

  await articlePage
    .goto('https://x.com/i/articles/compose', {
      waitUntil: 'commit',
      timeout: 15000,
    })
    .catch(() => null);
  await articlePage.waitForFunction(() => !!document.body, null, { timeout: 15000 });
  await articlePage.evaluate(() => {
    if (window.location.pathname !== '/i/articles/compose') {
      history.replaceState({}, '', 'https://x.com/i/articles/compose');
    }
  });
  await articlePage.waitForTimeout(2500);

  await articlePage.evaluate(async () => {
    const titleInput = document.createElement('textarea');
    titleInput.placeholder = 'Add a title';
    document.body.appendChild(titleInput);

    const editor = document.createElement('div');
    editor.className = 'DraftEditor-editorContainer';
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    editor.appendChild(editable);
    document.body.appendChild(editor);

    const previewLink = document.createElement('a');
    previewLink.href = '/i/articles/preview';
    previewLink.textContent = 'Preview';
    document.body.appendChild(previewLink);

    const publishButton = document.createElement('button');
    publishButton.textContent = 'Publish';
    publishButton.type = 'button';
    publishButton.setAttribute('data-testid', 'publishButton');
    document.body.appendChild(publishButton);

    publishButton.addEventListener(
      'click',
      () => {
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('data-testid', 'article-publish-dialog');

        const confirmButton = document.createElement('button');
        confirmButton.textContent = 'Publish';
        confirmButton.type = 'button';
        confirmButton.setAttribute('data-testid', 'confirmPublishButton');
        dialog.appendChild(confirmButton);

        document.body.appendChild(dialog);
      },
      { once: true },
    );
  });

  await articlePage.evaluate(async () => {
    await fetch('/i/api/graphql/test/CreateArticle', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        article_title: 'Draft article title',
        article_body: '这只是自动保存，不应该被算成长文发布',
      }),
    });
  });

  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
  });
  await popupPage.waitForFunction(
    () => !(document.body.textContent ?? '').includes('长文 1'),
    null,
    { timeout: 15000 },
  );

  await articlePage.evaluate(() => {
    const publishButton = Array.from(document.querySelectorAll('button')).find(
      (button) =>
        /publish/i.test(button.textContent ?? '') &&
        button.getAttribute('data-testid') === 'publishButton',
    );
    if (!(publishButton instanceof HTMLButtonElement)) {
      throw new Error('未找到发布按钮');
    }

    publishButton.click();
  });
  await articlePage.evaluate(() => {
    const confirmButton = document.querySelector(
      '[role="dialog"] [data-testid="confirmPublishButton"]',
    );
    if (!(confirmButton instanceof HTMLButtonElement)) {
      throw new Error('未找到确认弹窗中的发布按钮');
    }

    confirmButton.click();
    const successToast = document.createElement('div');
    successToast.textContent = 'Success! Your Article has been published';
    document.body.appendChild(successToast);
  });
  await articlePage.evaluate(async () => {
    await fetch('/i/api/graphql/test/CreateArticle', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        article_title: 'Article title',
        article_body: '这是一次真实的长文发布验证',
        publish: true,
      }),
    });
  });
  await popupPage.waitForFunction(
    async () => {
      const items = await new Promise((resolve) => {
        chrome.storage.local.get(
          ['xGrowthTaskCoach.originalContentRecords', 'xGrowthTaskCoach.lastContentRecognition'],
          (result) => resolve(result),
        );
      });
      const originalContentRecords = items['xGrowthTaskCoach.originalContentRecords'] ?? [];
      return originalContentRecords.some((record) => record?.formatGroup === 'long_form');
    },
    null,
    { timeout: 15000 },
  );

  const extensionState = await popupPage.evaluate(async () => {
    return await new Promise((resolve) => {
      chrome.storage.local.get(
        [
          'xGrowthTaskCoach.originalContentRecords',
          'xGrowthTaskCoach.lastContentRecognition',
          'xGrowthTaskCoach.articleRecognitionDebugLogs',
        ],
        (items) => {
          resolve({
            originalContentRecords: items['xGrowthTaskCoach.originalContentRecords'] ?? [],
            lastContentRecognition: items['xGrowthTaskCoach.lastContentRecognition'] ?? null,
            articleRecognitionDebugLogs:
              items['xGrowthTaskCoach.articleRecognitionDebugLogs'] ?? [],
          });
        },
      );
    });
  });
  const debugEvents = await articlePage.evaluate(() => {
    return globalThis.__xGrowthArticleDebugEvents ?? [];
  });
  const longFormRecordCount = extensionState.originalContentRecords.filter(
    (record) => record?.formatGroup === 'long_form',
  ).length;
  const persistedDebugLogs = extensionState.articleRecognitionDebugLogs ?? [];

  if (longFormRecordCount !== 1 || persistedDebugLogs.length === 0) {
    throw new Error(
      JSON.stringify(
        {
          message:
            longFormRecordCount !== 1
              ? `期望记录 1 条长文，实际得到 ${longFormRecordCount} 条`
              : '长文调试日志没有落到扩展本地存储',
          lastContentRecognition: extensionState.lastContentRecognition,
          articleDebugEventCount: debugEvents.length,
          articleDebugEvents: debugEvents,
          articleRecognitionDebugLogs: persistedDebugLogs,
          originalContentRecords: extensionState.originalContentRecords,
        },
        null,
        2,
      ),
    );
  }

  console.log(
    JSON.stringify(
      {
        extensionId,
        articleRecognitionPassed: true,
        longFormRecordCount,
        lastContentRecognition: extensionState.lastContentRecognition,
        articleDebugEventCount: debugEvents.length,
        lastArticleDebugEvent: debugEvents.at(-1) ?? null,
        persistedDebugLogCount: persistedDebugLogs.length,
        lastPersistedDebugLog: persistedDebugLogs.at(-1) ?? null,
      },
      null,
      2,
    ),
  );
} finally {
  if (!KEEP_BROWSER_OPEN) {
    await context.close();
    await rimraf(userDataDir);
  }
}
