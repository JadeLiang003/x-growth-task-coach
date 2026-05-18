import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const playwrightModulePath = pathToFileURL(
  'F:/Node.js/node_global/node_modules/playwright/index.mjs',
).href;

const { chromium } = await import(playwrightModulePath);

const extensionPath = path.resolve('dist/extension');
const userDataDir = path.join(os.tmpdir(), 'x-growth-task-coach-phase5-smoke');

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

async function waitForTaskProgress(page, label, expectedFragment) {
  await page.waitForFunction(
    ([taskLabel, fragment]) => {
      const cards = Array.from(document.querySelectorAll('.coach-task-card'));
      return cards.some((card) => {
        const text = card.textContent ?? '';
        return text.includes(taskLabel) && text.includes(fragment);
      });
    },
    [label, expectedFragment],
    { timeout: 15000 },
  );
}

async function readTaskSnapshot(page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.coach-task-card'));
    return cards.map((card) => {
      const lines = (card.textContent ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      return {
        label: lines[0] ?? '',
        progress: lines[1] ?? '',
        mode: lines[2] ?? '',
      };
    });
  });
}

async function dispatchComposerEvent(page, actionType) {
  await page.evaluate((currentActionType) => {
    window.dispatchEvent(
      new CustomEvent('x-growth:composer-mutation', {
        detail: {
          actionType: currentActionType,
          endpoint: 'https://x.com/i/api/graphql/test/CreateTweet',
          timestamp: new Date().toISOString(),
          requestKind: 'fetch',
          signature: `phase5-smoke-${currentActionType}-${Date.now()}`,
        },
      }),
    );
  }, actionType);
}

await rimraf(userDataDir);

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: false,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});

try {
  const extensionId = await getExtensionId(context);

  const xPage = await context.newPage();
  await xPage.goto('https://x.com', { waitUntil: 'domcontentloaded' });
  await xPage.waitForFunction(
    () =>
      Boolean(document.getElementById('x-growth-task-coach-root')) &&
      document.documentElement.getAttribute('data-x-growth-task-coach') === 'ready',
    null,
    { timeout: 15000 },
  );

  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
  });
  await popupPage.waitForFunction(
    () => document.body.textContent?.includes('已检测到页面心跳') ?? false,
    null,
    { timeout: 15000 },
  );

  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`, {
    waitUntil: 'domcontentloaded',
  });
  await optionsPage.selectOption('#stage-select', 'growth_100_1000');
  await optionsPage.getByRole('button', { name: '保存设置' }).click();
  await optionsPage.waitForFunction(
    () =>
      document.body.textContent?.includes('已保存，popup 会自动刷新') ??
      document.body.textContent?.includes('已保存；今天已有进度时') ??
      false,
    null,
    { timeout: 10000 },
  );

  await popupPage.waitForFunction(
    () => document.body.textContent?.includes('验证期 100-1000') ?? false,
    null,
    { timeout: 15000 },
  );

  await dispatchComposerEvent(xPage, 'original');
  await dispatchComposerEvent(xPage, 'reply');
  await dispatchComposerEvent(xPage, 'quote');

  await waitForTaskProgress(popupPage, '原创帖', '1 / 2');
  await waitForTaskProgress(popupPage, '高质量回复', '1 / 6');
  await waitForTaskProgress(popupPage, '引用转发', '1 / 1');

  const taskSnapshot = await readTaskSnapshot(popupPage);

  console.log(
    JSON.stringify(
      {
        extensionId,
        injectionDetected: true,
        popupConnected: true,
        stageUpdatedAfterSave: true,
        autoCountedActions: ['original', 'reply', 'quote'],
        taskSnapshot,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await rimraf(userDataDir);
}
