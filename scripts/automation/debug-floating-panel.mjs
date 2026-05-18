import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const playwrightModulePath = pathToFileURL(
  'F:/Node.js/node_global/node_modules/playwright/index.mjs',
).href;

const { chromium } = await import(playwrightModulePath);

const extensionPath = path.resolve('dist/extension');
const userDataDir = path.join(os.tmpdir(), 'x-growth-task-coach-debug-floating-panel');

async function rimraf(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function getExtensionId(context) {
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 30000 });
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
  const page = await context.newPage();
  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(8000);

  const before = await page.evaluate(() => ({
    host: Boolean(document.getElementById('x-growth-task-coach-floating-host')),
    marker: Boolean(document.getElementById('x-growth-task-coach-root')),
    bodyReady: Boolean(document.body),
    attr: document.documentElement.getAttribute('data-x-growth-task-coach'),
    title: document.title,
    url: location.href,
  }));

  const extensionId = await getExtensionId(context);

  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
  });
  await popupPage.waitForTimeout(3000);
  const popupText = (await popupPage.textContent('body')) ?? '';

  await page.waitForTimeout(4000);

  const after = await page.evaluate(() => {
    const host = document.getElementById('x-growth-task-coach-floating-host');
    const root = host?.shadowRoot?.getElementById('x-growth-task-coach-floating-root');
    return {
      host: Boolean(host),
      marker: Boolean(document.getElementById('x-growth-task-coach-root')),
      shadowRoot: Boolean(host?.shadowRoot),
      root: Boolean(root),
      text: root?.textContent?.slice(0, 300) ?? '',
      html: root?.innerHTML?.slice(0, 1000) ?? '',
    };
  });

  const dragHandleRect = await page.evaluate(() => {
    const host = document.getElementById('x-growth-task-coach-floating-host');
    const header = host?.shadowRoot?.querySelector('.coach-header');
    if (!(header instanceof HTMLElement)) {
      return null;
    }

    const rect = header.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  });

  let dragResult = null;
  if (dragHandleRect) {
    const fromX = dragHandleRect.x + dragHandleRect.width / 2;
    const fromY = dragHandleRect.y + dragHandleRect.height / 2;
    await page.mouse.move(fromX, fromY);
    await page.mouse.down();
    await page.mouse.move(fromX - 70, fromY + 40, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(1200);

    dragResult = await page.evaluate(() => {
      const host = document.getElementById('x-growth-task-coach-floating-host');
      if (!(host instanceof HTMLDivElement)) {
        return null;
      }

      return {
        top: host.style.top,
        right: host.style.right,
      };
    });
  }

  await page.evaluate(() => {
    const host = document.getElementById('x-growth-task-coach-floating-host');
    const settingsButton = host?.shadowRoot?.querySelector('.coach-action');
    if (settingsButton instanceof HTMLButtonElement) {
      settingsButton.click();
    }
  });
  await page.waitForTimeout(1500);

  const optionsTabOpened = context
    .pages()
    .some((tab) => tab.url().includes('/options.html') || tab.url().includes('options.html'));

  console.log(
    JSON.stringify(
      {
        extensionId,
        before,
        after,
        dragResult,
        optionsTabOpened,
        popupPreview: popupText.slice(0, 500),
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await rimraf(userDataDir);
}
