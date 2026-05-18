/* global document */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const playwrightModulePath = pathToFileURL(
  'F:/Node.js/node_global/node_modules/playwright/index.mjs',
).href;

const { chromium } = await import(playwrightModulePath);

const extensionPath = path.resolve('dist/extension');
const userDataDir = path.join(os.tmpdir(), 'x-growth-task-coach-ui-capture');
const outputDir = path.resolve('tmp/ui-captures');

async function rimraf(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function getExtensionId(context) {
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  }

  return new URL(serviceWorker.url()).host;
}

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

try {
  await ensureDir(outputDir);
  const extensionId = await getExtensionId(context);

  const optionsPage = await context.newPage();
  await optionsPage.setViewportSize({ width: 1440, height: 1180 });
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`, {
    waitUntil: 'domcontentloaded',
  });
  await optionsPage.waitForTimeout(2000);
  await optionsPage.screenshot({
    path: path.join(outputDir, 'options-phase8-latest.png'),
    fullPage: true,
  });

  const popupPage = await context.newPage();
  await popupPage.setViewportSize({ width: 420, height: 980 });
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
  });
  await popupPage.waitForTimeout(2000);
  await popupPage.screenshot({
    path: path.join(outputDir, 'popup-phase8-latest.png'),
    fullPage: true,
  });

  console.log(
    JSON.stringify(
      {
        extensionId,
        optionsScreenshot: path.join(outputDir, 'options-phase8-latest.png'),
        popupScreenshot: path.join(outputDir, 'popup-phase8-latest.png'),
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await rimraf(userDataDir);
}
