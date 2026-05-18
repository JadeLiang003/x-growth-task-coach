import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const playwrightModulePath = pathToFileURL(
  'F:/Node.js/node_global/node_modules/playwright/index.mjs',
).href;

const { chromium } = await import(playwrightModulePath);

const extensionPath = path.resolve('dist/extension');
const userDataDir = path.join(os.tmpdir(), 'x-growth-task-coach-phase6-smoke');

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

async function addAccount(optionsPage, account) {
  await optionsPage.fill('#account-pool-handle', account.handle);
  await optionsPage.fill('#account-pool-display-name', account.displayName);
  await optionsPage.selectOption('#account-pool-category', account.category);
  await optionsPage.selectOption('#account-pool-priority', account.priority);
  await optionsPage.fill('#account-pool-notes', account.notes);
  await optionsPage.getByRole('button', { name: '加入账号池' }).click();
  await optionsPage.waitForFunction(
    () => document.body.textContent?.includes('账号已加入账号池') ?? false,
    null,
    { timeout: 10000 },
  );
}

async function dispatchComposerEvent(page, actionType, targetHandle) {
  await page.evaluate(
    ({ currentActionType, currentTargetHandle }) => {
      window.dispatchEvent(
        new CustomEvent('x-growth:composer-mutation', {
          detail: {
            actionType: currentActionType,
            endpoint: 'https://x.com/i/api/graphql/test/CreateTweet',
            timestamp: new Date().toISOString(),
            requestKind: 'fetch',
            signature: `phase6-smoke-${currentActionType}-${currentTargetHandle}-${Date.now()}`,
            targetHandle: currentTargetHandle,
          },
        }),
      );
    },
    { currentActionType: actionType, currentTargetHandle: targetHandle },
  );
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

  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`, {
    waitUntil: 'domcontentloaded',
  });
  await optionsPage.fill('#account-handle', 'tester');
  await optionsPage.selectOption('#stage-select', 'cold_start_0_100');
  await optionsPage.getByRole('button', { name: '保存设置' }).click();
  await optionsPage.waitForFunction(
    () =>
      document.body.textContent?.includes('已保存，popup 会自动刷新') ??
      document.body.textContent?.includes('已保存；今天已有进度时') ??
      false,
    null,
    { timeout: 10000 },
  );

  await addAccount(optionsPage, {
    handle: 'bigboss',
    displayName: 'Big Boss',
    category: 'big_creator',
    priority: 'high',
    notes: '测试用大 V 账号',
  });

  await addAccount(optionsPage, {
    handle: 'peerpal',
    displayName: 'Peer Pal',
    category: 'peer',
    priority: 'high',
    notes: '测试用同生态账号',
  });

  const xPage = await context.newPage();
  await xPage.goto('https://x.com', { waitUntil: 'domcontentloaded' });
  await xPage.waitForFunction(
    () =>
      Boolean(document.getElementById('x-growth-task-coach-root')) &&
      document.documentElement.getAttribute('data-x-growth-task-coach') === 'ready',
    null,
    { timeout: 15000 },
  );

  await xPage.evaluate(() => {
    history.replaceState({}, '', '/tester');
    document.title = 'tester';
    document.body.innerHTML = `
      <main>
        <a href="/tester/followers">
          <span>1,234</span>
          <span>Followers</span>
        </a>
      </main>
    `;
  });

  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
  });

  await popupPage.waitForFunction(
    () =>
      document.body.textContent?.includes('已检测到页面心跳') &&
      document.body.textContent?.includes('@tester') &&
      document.body.textContent?.includes('1,234'),
    null,
    { timeout: 20000 },
  );

  await dispatchComposerEvent(xPage, 'reply', 'bigboss');
  await dispatchComposerEvent(xPage, 'quote', 'peerpal');

  await popupPage.waitForFunction(
    () => {
      const text = document.body.textContent ?? '';
      return (
        text.includes('高质量回复') &&
        text.includes('1 / 8') &&
        text.includes('引用转发') &&
        text.includes('1 / 1') &&
        text.includes('大 V 互动') &&
        text.includes('1 / 2') &&
        text.includes('同生态互动') &&
        text.includes('1 / 2')
      );
    },
    null,
    { timeout: 15000 },
  );

  await popupPage.waitForFunction(
    () => {
      const text = document.body.textContent ?? '';
      return text.includes('@bigboss') && text.includes('@peerpal');
    },
    null,
    { timeout: 10000 },
  );

  const result = await popupPage.evaluate(() => ({
    popupText: document.body.textContent ?? '',
  }));

  console.log(
    JSON.stringify(
      {
        extensionId,
        phase6Passed: true,
        followerSnapshotDetected: true,
        accountPoolRecommendationsShown: ['bigboss', 'peerpal'],
        autoMatchedInteractions: [
          'reply -> big_creator',
          'quote -> peer',
        ],
        popupText: result.popupText,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await rimraf(userDataDir);
}
