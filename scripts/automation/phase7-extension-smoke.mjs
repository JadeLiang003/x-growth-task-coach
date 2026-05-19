/* global URL, console, document, chrome */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const playwrightModulePath = pathToFileURL(
  'F:/Node.js/node_global/node_modules/playwright/index.mjs',
).href;

const { chromium } = await import(playwrightModulePath);

const extensionPath = path.resolve('dist/extension');
const userDataDir = path.join(os.tmpdir(), 'x-growth-task-coach-phase75-smoke');
const importFixturePath = path.join(os.tmpdir(), 'x-growth-task-coach-import-fixture.json');

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

async function dispatchCandidateAccounts(page) {
  await page.evaluate(() => {
    chrome.runtime.sendMessage({
      type: 'x-growth:candidate-accounts',
      payload: {
        source: 'from_following',
        items: [
          {
            handle: 'benchboss',
            displayName: 'Bench Boss',
            followersCount: 25000,
            followingCount: 800,
            verified: true,
            bio: '连续创业者，分享产品决策和增长复盘',
            capturedAt: new Date().toISOString(),
          },
          {
            handle: 'peerpal',
            displayName: 'Peer Pal',
            followersCount: 1200,
            followingCount: 640,
            verified: false,
            bio: '独立开发者，公开构建 AI 自动化工作流',
            capturedAt: new Date().toISOString(),
          },
          {
            handle: 'sourcebox',
            displayName: 'Source Box',
            followersCount: 480,
            followingCount: 210,
            verified: false,
            bio: '研究者，长期跟踪创业趋势、案例拆解和中文创作者观察',
            capturedAt: new Date().toISOString(),
          },
        ],
      },
    });
  });
}

async function dispatchComposerEvent(page, detail) {
  await page.evaluate(
    ({ currentDetail }) => {
      chrome.runtime.sendMessage({
        type: 'x-growth:task-progress',
        payload: {
          taskId:
            currentDetail.actionType === 'original'
              ? null
              : currentDetail.actionType === 'reply'
                ? 'highQualityReplies'
                : 'quotePosts',
          delta: 1,
          source: 'phase75-smoke',
          endpoint: currentDetail.endpoint,
          actionType: currentDetail.actionType,
          signature: `phase75-smoke-${currentDetail.actionType}-${currentDetail.targetHandle ?? 'self'}-${currentDetail.contentFormatGroup ?? 'none'}-${Date.now()}`,
          targetHandle: currentDetail.targetHandle ?? null,
          contentFormat: currentDetail.contentFormat ?? null,
          contentFormatGroup: currentDetail.contentFormatGroup ?? null,
          contentRecognitionStatus: currentDetail.contentRecognitionStatus ?? 'recognized',
        },
      });
    },
    { currentDetail: detail },
  );
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
  await fs.writeFile(
    importFixturePath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        schemaVersion: 'phase-8b',
        storage: {
          settings: {
            accountHandle: 'importedtester',
            currentStageId: 'cold_start_0_100',
            intensityPreset: 'standard',
          },
          runtime: {},
          lastContentRecognition: {},
          articleRecognitionDebugLogs: [],
          dailyRecords: [],
          followerSnapshots: [],
          accountPool: [],
          interactionLogs: [],
          searchTemplates: [],
          candidateAccounts: [],
          dailyReviewDrafts: [],
          originalContentRecords: [],
        },
      },
      null,
      2,
    ),
  );
  await optionsPage.locator('input[type="file"]').setInputFiles(importFixturePath);
  const importedHandleInput = optionsPage.locator('#account-handle');
  const importDeadline = Date.now() + 10000;
  let importedHandleValue = await importedHandleInput.inputValue();
  while (importedHandleValue !== 'importedtester' && Date.now() < importDeadline) {
    await optionsPage.waitForTimeout(200);
    importedHandleValue = await importedHandleInput.inputValue();
  }
  if (importedHandleValue !== 'importedtester') {
    throw new Error(`完整备份 JSON 导入未生效: ${importedHandleValue}`);
  }
  await optionsPage.fill('#account-handle', 'tester');
  await optionsPage.getByRole('button', { name: '保存并重建今天任务' }).click();
  await optionsPage.waitForFunction(
    () => document.body.textContent?.includes('X 增长任务台') ?? false,
    null,
    { timeout: 15000 },
  );
  await optionsPage.waitForFunction(
    (expectedRangeLabel) => {
      const text = document.body.textContent ?? '';
      const heatmapCells = document.querySelectorAll('[title*="完成率"]').length;
      return (
        text.includes('近一年热力图') &&
        text.includes(expectedRangeLabel) &&
        heatmapCells >= 300
      );
    },
    '近 1 年',
    { timeout: 15000 },
  );
  await optionsPage.waitForFunction(
    () => {
      const text = document.body.textContent ?? '';
      return (
        text.includes('数据备份与恢复') &&
        text.includes('导出完整备份 JSON') &&
        text.includes('导入完整备份 JSON') &&
        text.includes('每日记录 CSV') &&
        text.includes('粉丝快照 CSV') &&
        text.includes('账号工作台 CSV') &&
        text.includes('每日复盘 CSV')
      );
    },
    null,
    { timeout: 10000 },
  );

  const highReplyRow = optionsPage.locator('label', { hasText: '高质量回复' }).first();
  const highReplyInput = highReplyRow.locator('input').first();

  await optionsPage.getByRole('button', { name: '强执行' }).click();
  await optionsPage.waitForFunction(
    () => {
      const row = Array.from(document.querySelectorAll('label')).find((item) =>
        item.textContent?.includes('高质量回复'),
      );
      const input = row?.querySelector('input');
      return input?.value === '12';
    },
    null,
    { timeout: 10000 },
  );

  await optionsPage.getByRole('button', { name: '保守' }).click();
  await optionsPage.waitForFunction(
    () => {
      const row = Array.from(document.querySelectorAll('label')).find((item) =>
        item.textContent?.includes('高质量回复'),
      );
      const input = row?.querySelector('input');
      return input?.value === '5';
    },
    null,
    { timeout: 10000 },
  );

  await highReplyInput.fill('7');
  await optionsPage.waitForTimeout(1600);
  await optionsPage.reload({ waitUntil: 'domcontentloaded' });
  await optionsPage.waitForFunction(
    () => {
      const row = Array.from(document.querySelectorAll('label')).find((item) =>
        item.textContent?.includes('高质量回复'),
      );
      const input = row?.querySelector('input');
      return input?.value === '7';
    },
    null,
    { timeout: 10000 },
  );

  await optionsPage.evaluate(() => {
    chrome.runtime.sendMessage({
      type: 'x-growth:follower-snapshot',
      payload: {
        handle: 'tester',
        followersCount: 1234,
        timestamp: new Date().toISOString(),
        path: '/tester',
        source: 'auto',
      },
    });
  });

  await dispatchCandidateAccounts(optionsPage);

  await optionsPage.getByRole('button', { name: '账号工作台', exact: true }).click();
  await optionsPage.waitForFunction(
    () => {
      const text = document.body.textContent ?? '';
      return (
        text.includes('@benchboss') && text.includes('@peerpal') && text.includes('@sourcebox')
      );
    },
    null,
    { timeout: 15000 },
  );

  const benchCard = optionsPage.locator('article', { hasText: '@benchboss' }).first();
  await benchCard.locator('select').first().selectOption('benchmark');
  await benchCard.getByRole('button', { name: '加入账号池' }).click();
  await optionsPage.waitForTimeout(1200);

  const peerCard = optionsPage.locator('article', { hasText: '@peerpal' }).first();
  await peerCard.locator('select').first().selectOption('peer');
  await peerCard.getByRole('button', { name: '加入账号池' }).click();
  await optionsPage.waitForTimeout(1200);

  const sourceCard = optionsPage.locator('article', { hasText: '@sourcebox' }).first();
  await sourceCard.locator('select').first().selectOption('benchmark');
  await sourceCard.getByRole('button', { name: '忽略' }).click();
  await optionsPage.waitForTimeout(1200);

  await optionsPage.getByRole('button', { name: '已入池' }).click();
  await optionsPage.waitForTimeout(1500);

  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
  });
  await popupPage.waitForTimeout(2500);
  const initialPopupText = (await popupPage.textContent('body')) ?? '';
  if (
    !initialPopupText.includes('1,234') ||
    !initialPopupText.includes('今日总览') ||
    !initialPopupText.includes('近 90 天') ||
    !initialPopupText.includes('搜索入口') ||
    !initialPopupText.includes('每日复盘')
  ) {
    throw new Error(`Phase 7.5 popup 初始化失败: ${initialPopupText}`);
  }
  await popupPage.waitForFunction(
    () => document.querySelectorAll('[title*="完成率"]').length >= 90,
    null,
    { timeout: 15000 },
  );

  await dispatchComposerEvent(optionsPage, {
    actionType: 'original',
    endpoint: 'https://x.com/i/api/graphql/test/CreateTweet',
    contentFormat: 'short_post',
    contentFormatGroup: 'short',
    contentRecognitionStatus: 'recognized',
  });
  await dispatchComposerEvent(optionsPage, {
    actionType: 'original',
    endpoint: 'https://x.com/i/api/graphql/test/CreateNoteTweet',
    contentFormat: 'short_post',
    contentFormatGroup: 'short',
    contentRecognitionStatus: 'recognized',
  });
  await dispatchComposerEvent(optionsPage, {
    actionType: 'original',
    endpoint: 'https://x.com/i/api/graphql/test/CreateArticle',
    contentFormat: 'article',
    contentFormatGroup: 'long_form',
    contentRecognitionStatus: 'recognized',
  });
  await dispatchComposerEvent(optionsPage, {
    actionType: 'reply',
    endpoint: 'https://x.com/i/api/graphql/test/CreateTweet',
    targetHandle: 'benchboss',
  });
  await dispatchComposerEvent(optionsPage, {
    actionType: 'quote',
    endpoint: 'https://x.com/i/api/graphql/test/CreateTweet',
    targetHandle: 'peerpal',
  });

  await popupPage.waitForFunction(
    () => {
      const text = document.body.textContent ?? '';
      return (
        text.includes('短推 2') &&
        text.includes('长文 1') &&
        text.includes('建议互动') &&
        text.includes('搜索入口') &&
        text.includes('附录')
      );
    },
    null,
    { timeout: 15000 },
  );

  console.log(
    JSON.stringify(
      {
        extensionId,
        phase75Passed: true,
        setupSaveWorked: true,
        candidateImportWorked: true,
        accountWorkbenchWorked: true,
        popupSummaryVisible: true,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await rimraf(userDataDir);
}
