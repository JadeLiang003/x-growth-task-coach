const ROOT_MARKER_ID = 'x-growth-task-coach-root';
const SETTINGS_STORAGE_KEY = 'xGrowthTaskCoach.settings';
let lastFollowerSnapshotSignature = '';

function getChromeRuntime() {
  return (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome?.runtime;
}

function getChromeStorage() {
  return (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome?.storage?.local;
}

function normalizeHandle(handle: string | null | undefined) {
  return (handle ?? '').trim().replace(/^@+/, '').toLowerCase();
}

function parseSocialCount(rawText: string | null | undefined) {
  const compactText = (rawText ?? '')
    .replace(/followers?/gi, '')
    .replace(/following/gi, '')
    .replace(/\s+/g, '')
    .replace(/,/g, '')
    .trim();

  if (!compactText) {
    return null;
  }

  const matched = compactText.toLowerCase().match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!matched) {
    return null;
  }

  const numericValue = Number(matched[1]);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const suffix = matched[2];
  const multiplier = suffix === 'm' ? 1_000_000 : suffix === 'k' ? 1_000 : 1;
  return Math.round(numericValue * multiplier);
}

function readSettings() {
  const storage = getChromeStorage();
  if (!storage) {
    return Promise.resolve(null);
  }

  return new Promise<{
    accountHandle: string;
    followerAutoReadEnabled: boolean;
  } | null>((resolve) => {
    storage.get(SETTINGS_STORAGE_KEY, (items) => {
      const settings = items[SETTINGS_STORAGE_KEY];
      if (!settings || typeof settings !== 'object') {
        resolve(null);
        return;
      }

      const typedSettings = settings as {
        accountHandle?: string;
        followerAutoReadEnabled?: boolean;
      };

      resolve({
        accountHandle: typedSettings.accountHandle ?? '',
        followerAutoReadEnabled: typedSettings.followerAutoReadEnabled ?? true,
      });
    });
  });
}

function ensureMarker() {
  let marker = document.getElementById(ROOT_MARKER_ID);

  if (!marker) {
    marker = document.createElement('div');
    marker.id = ROOT_MARKER_ID;
    marker.hidden = true;
    marker.setAttribute('data-phase', 'phase-3');
    document.documentElement.appendChild(marker);
  }

  document.documentElement.setAttribute('data-x-growth-task-coach', 'ready');
}

function getSource() {
  return location.hostname.includes('twitter.com') ? 'twitter.com' : 'x.com';
}

function readFollowerCountFromDom() {
  const selectors = [
    'a[href$="/verified_followers"] span',
    'a[href$="/followers"] span',
    'a[href*="/followers"] span',
  ];

  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
    for (const node of nodes) {
      const parsed = parseSocialCount(node.textContent);
      if (typeof parsed === 'number') {
        return parsed;
      }
    }
  }

  return null;
}

async function maybeSendFollowerSnapshot() {
  const settings = await readSettings();
  const runtime = getChromeRuntime();
  if (!runtime?.sendMessage || !settings?.followerAutoReadEnabled) {
    return;
  }

  const trackedHandle = normalizeHandle(settings.accountHandle);
  if (!trackedHandle) {
    return;
  }

  const currentHandle = normalizeHandle(location.pathname.split('/')[1]);
  if (!currentHandle || currentHandle !== trackedHandle) {
    return;
  }

  const followersCount = readFollowerCountFromDom();
  if (typeof followersCount !== 'number') {
    return;
  }

  const signature = `${trackedHandle}:${followersCount}:${location.pathname}`;
  if (signature === lastFollowerSnapshotSignature) {
    return;
  }

  lastFollowerSnapshotSignature = signature;
  runtime.sendMessage({
    type: 'x-growth:follower-snapshot',
    payload: {
      handle: trackedHandle,
      followersCount,
      timestamp: new Date().toISOString(),
      path: `${location.pathname}${location.search}`,
      source: 'auto',
    },
  });
}

function sendHeartbeat() {
  ensureMarker();

  const runtime = getChromeRuntime();
  if (!runtime?.sendMessage) {
    return;
  }

  runtime.sendMessage({
    type: 'x-growth:content-heartbeat',
    payload: {
      path: `${location.pathname}${location.search}`,
      title: document.title,
      timestamp: new Date().toISOString(),
      source: getSource(),
    },
  });
}

export function startXPageObserver() {
  ensureMarker();
  sendHeartbeat();
  void maybeSendFollowerSnapshot();

  let previousPath = `${location.pathname}${location.search}`;

  window.setInterval(() => {
    const nextPath = `${location.pathname}${location.search}`;
    if (nextPath !== previousPath) {
      previousPath = nextPath;
      sendHeartbeat();
      void maybeSendFollowerSnapshot();
    }
  }, 1000);

  window.setInterval(() => {
    void maybeSendFollowerSnapshot();
  }, 3000);

  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
        void maybeSendFollowerSnapshot();
      }
    },
    { passive: true },
  );
}
