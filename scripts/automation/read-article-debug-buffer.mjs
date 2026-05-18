/* global URL, console, chrome */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const playwrightModulePath = pathToFileURL(
  'F:/Node.js/node_global/node_modules/playwright/index.mjs',
).href;

const { chromium } = await import(playwrightModulePath);

const extensionPath = path.resolve('dist/extension');
const userDataDir = path.join(os.tmpdir(), 'x-growth-task-coach-article-debug-read');

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
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`, {
    waitUntil: 'domcontentloaded',
  });

  const result = await page.evaluate(async () => {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'x-growth:article-debug-read' }, (response) => {
        resolve(response ?? { ok: false, logs: [] });
      });
    });
  });

  console.log(JSON.stringify({ extensionId, ...result }, null, 2));
} finally {
  await context.close();
  await rimraf(userDataDir);
}
