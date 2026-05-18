import { getSettings, saveSettings, subscribeToStorageChanges } from '../storage/storage';
import type { FloatingPanelPosition } from '../storage/schema';
import { getOrCreateTodaySummary, updateTodayTaskProgress } from '../task-system/daily-records';

const HOST_ID = 'x-growth-task-coach-floating-host';
const ROOT_ID = 'x-growth-task-coach-floating-root';
const DEFAULT_POSITION: FloatingPanelPosition = {
  top: 88,
  right: 16,
};
const PANEL_MARGIN = 12;
const FLOATING_PANEL_RENDER_DEBOUNCE_MS = 120;
const FLOATING_PANEL_STORAGE_KEYS = new Set([
  'xGrowthTaskCoach.settings',
  'xGrowthTaskCoach.dailyRecords',
]);

interface HostContext {
  host: HTMLDivElement;
  shadowRoot: ShadowRoot;
  mountPoint: HTMLDivElement;
}

function getChromeRuntime() {
  return (
    globalThis as typeof globalThis & {
      chrome?: typeof chrome & { runtime?: typeof chrome.runtime };
    }
  ).chrome?.runtime;
}

function openOptionsFromFloatingPanel() {
  const runtime = getChromeRuntime();
  if (!runtime) {
    return;
  }

  if (typeof runtime.sendMessage === 'function') {
    runtime.sendMessage({ type: 'x-growth:open-options-page' });
    return;
  }

  if (typeof runtime.openOptionsPage === 'function') {
    runtime.openOptionsPage();
  }
}

function subscribeToRuntimeMessages(onMessage: (message: unknown) => void) {
  const runtime = getChromeRuntime();
  if (!runtime?.onMessage) {
    return () => undefined;
  }

  const listener = (message: unknown) => {
    onMessage(message);
  };

  runtime.onMessage.addListener(listener);
  return () => {
    (
      runtime.onMessage as {
        removeListener?: (callback: (message: unknown) => void) => void;
      }
    ).removeListener?.(listener);
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizePosition(position: FloatingPanelPosition | null | undefined) {
  return {
    top: typeof position?.top === 'number' ? position.top : DEFAULT_POSITION.top,
    right: typeof position?.right === 'number' ? position.right : DEFAULT_POSITION.right,
  } satisfies FloatingPanelPosition;
}

function clampPosition(position: FloatingPanelPosition, rect: DOMRect) {
  const maxTop = Math.max(PANEL_MARGIN, window.innerHeight - rect.height - PANEL_MARGIN);
  const maxRight = Math.max(PANEL_MARGIN, window.innerWidth - rect.width - PANEL_MARGIN);

  return {
    top: clamp(position.top, PANEL_MARGIN, maxTop),
    right: clamp(position.right, PANEL_MARGIN, maxRight),
  } satisfies FloatingPanelPosition;
}

function applyHostPosition(host: HTMLDivElement, position: FloatingPanelPosition) {
  host.style.top = `${position.top}px`;
  host.style.right = `${position.right}px`;
}

function getHostContext(initialPosition: FloatingPanelPosition): HostContext | null {
  if (!document.body) {
    return null;
  }

  let host = document.getElementById(HOST_ID);
  if (!(host instanceof HTMLDivElement)) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.position = 'fixed';
    host.style.zIndex = '2147483646';
    host.style.pointerEvents = 'none';
    document.body.appendChild(host);
  } else if (!host.isConnected) {
    document.body.appendChild(host);
  }

  const typedHost = host as HTMLDivElement;
  applyHostPosition(typedHost, initialPosition);

  const shadowRoot = typedHost.shadowRoot ?? typedHost.attachShadow({ mode: 'open' });
  let mountPoint = shadowRoot.getElementById(ROOT_ID);

  if (!(mountPoint instanceof HTMLDivElement)) {
    shadowRoot.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
      }

      .coach-shell {
        pointer-events: auto;
        width: 296px;
        font-family: "Trebuchet MS", "Segoe UI", sans-serif;
        color: #15202b;
      }

      .coach-launcher {
        display: grid;
        gap: 6px;
        border: 1px solid rgba(21, 32, 43, 0.1);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.95);
        box-shadow: 0 12px 28px rgba(21, 32, 43, 0.14);
        padding: 8px 10px;
        cursor: grab;
        pointer-events: auto;
        min-width: 98px;
      }

      .coach-launcher.dragging {
        cursor: grabbing;
      }

      .coach-launcher-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .coach-launcher strong {
        font-size: 15px;
        line-height: 1;
      }

      .coach-launcher-hint {
        font-size: 11px;
        color: rgba(21, 32, 43, 0.62);
        line-height: 1;
      }

      .coach-launcher-rail {
        height: 4px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(21, 32, 43, 0.08);
      }

      .coach-launcher-fill {
        height: 100%;
        background: linear-gradient(90deg, #15202b 0%, #1d9bf0 100%);
      }

      .coach-panel {
        border: 1px solid rgba(21, 32, 43, 0.1);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 18px 44px rgba(21, 32, 43, 0.18);
        backdrop-filter: blur(14px);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 24px);
      }

      .coach-header {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: start;
        padding: 12px 12px 8px;
        border-bottom: 1px solid rgba(21, 32, 43, 0.06);
        cursor: grab;
        user-select: none;
      }

      .coach-header.dragging {
        cursor: grabbing;
      }

      .coach-eyebrow {
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgba(21, 32, 43, 0.48);
      }

      .coach-title-row {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin-top: 2px;
      }

      .coach-title {
        font-size: 22px;
        font-weight: 700;
        line-height: 1;
      }

      .coach-subtitle {
        font-size: 12px;
        color: rgba(21, 32, 43, 0.62);
        line-height: 1.4;
      }

      .coach-actions {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .coach-action,
      .coach-stepper {
        border: none;
        background: transparent;
        color: rgba(21, 32, 43, 0.62);
        cursor: pointer;
      }

      .coach-action {
        border-radius: 999px;
        padding: 4px 6px;
        font-size: 11px;
        line-height: 1;
      }

      .coach-action:hover,
      .coach-stepper:hover {
        background: rgba(21, 32, 43, 0.06);
        color: #15202b;
      }

      .coach-action[disabled],
      .coach-stepper[disabled] {
        cursor: not-allowed;
        opacity: 0.45;
      }

      .coach-body {
        padding: 10px 12px 12px;
        display: grid;
        gap: 10px;
        min-height: 0;
      }

      .coach-rail {
        height: 6px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(21, 32, 43, 0.08);
      }

      .coach-rail-fill {
        height: 100%;
        background: linear-gradient(90deg, #15202b 0%, #1d9bf0 100%);
      }

      .coach-tasks {
        display: grid;
        gap: 6px;
        min-height: 0;
        overflow: auto;
        padding-right: 2px;
      }

      .coach-tasks::-webkit-scrollbar {
        width: 6px;
      }

      .coach-tasks::-webkit-scrollbar-thumb {
        background: rgba(21, 32, 43, 0.14);
        border-radius: 999px;
      }

      .coach-task-row {
        display: grid;
        grid-template-columns: minmax(0, 76px) minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 6px;
        border-radius: 12px;
        background: rgba(248, 245, 239, 0.72);
        padding: 6px 7px;
      }

      .coach-task-label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        font-weight: 700;
      }

      .coach-task-inline-rail {
        min-width: 0;
        height: 4px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(21, 32, 43, 0.08);
      }

      .coach-task-inline-fill {
        height: 100%;
        background: linear-gradient(90deg, #15202b 0%, #1d9bf0 100%);
      }

      .coach-task-meta,
      .coach-footer,
      .coach-hint {
        font-size: 11px;
        color: rgba(21, 32, 43, 0.62);
      }

      .coach-task-meta {
        white-space: nowrap;
      }

      .coach-stepper-group {
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }

      .coach-stepper {
        width: 20px;
        height: 20px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
      }

      .coach-footer {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        padding-top: 2px;
      }

      .coach-placeholder {
        border: 1px solid rgba(21, 32, 43, 0.06);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.84);
        padding: 12px;
        font-size: 12px;
        line-height: 1.7;
        color: rgba(21, 32, 43, 0.72);
      }
    `;

    const nextMountPoint = document.createElement('div');
    nextMountPoint.id = ROOT_ID;
    shadowRoot.append(style, nextMountPoint);
    mountPoint = nextMountPoint;
  }

  return {
    host: typedHost,
    shadowRoot,
    mountPoint: mountPoint as HTMLDivElement,
  };
}

function removeHost() {
  document.getElementById(HOST_ID)?.remove();
}

function createLightButton(label: string, onClick: () => void, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'coach-action';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function createStepperButton(label: string, onClick: () => void, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'coach-stepper';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function renderLauncher(
  mountPoint: HTMLDivElement,
  percentLabel: string,
  subtitle: string,
  completionRate: number,
  host: HTMLDivElement,
  position: FloatingPanelPosition,
  persistPosition: (nextPosition: FloatingPanelPosition) => Promise<void>,
  onOpen: () => void,
) {
  mountPoint.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'coach-shell';

  const launcher = document.createElement('div');
  launcher.className = 'coach-launcher';
  attachDragBehavior(launcher, host, position, persistPosition, {
    onClick: onOpen,
    allowButtonTargets: true,
  });

  const head = document.createElement('div');
  head.className = 'coach-launcher-head';

  const strong = document.createElement('strong');
  strong.textContent = percentLabel;

  const hint = document.createElement('span');
  hint.className = 'coach-launcher-hint';
  hint.textContent = subtitle;

  const rail = document.createElement('div');
  rail.className = 'coach-launcher-rail';
  const railFill = document.createElement('div');
  railFill.className = 'coach-launcher-fill';
  railFill.style.width = `${Math.max(0, Math.min(completionRate * 100, 100))}%`;
  rail.appendChild(railFill);

  head.append(strong, hint);
  launcher.append(head, rail);
  wrapper.appendChild(launcher);
  mountPoint.appendChild(wrapper);
}

function attachDragBehavior(
  dragHandle: HTMLElement,
  host: HTMLDivElement,
  initialPosition: FloatingPanelPosition,
  persistPosition: (position: FloatingPanelPosition) => Promise<void>,
  options?: {
    onClick?: () => void;
    allowButtonTargets?: boolean;
  },
) {
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let startTop = initialPosition.top;
  let startRight = initialPosition.right;
  let rect = host.getBoundingClientRect();

  const finishDragging = async () => {
    if (!dragging) {
      return;
    }

    dragging = false;
    dragHandle.classList.remove('dragging');
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');

    if (!moved) {
      options?.onClick?.();
      return;
    }

    const nextPosition = clampPosition(
      {
        top: Number.parseFloat(host.style.top),
        right: Number.parseFloat(host.style.right),
      },
      rect,
    );

    applyHostPosition(host, nextPosition);
    await persistPosition(nextPosition);
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!dragging) {
      return;
    }

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (!moved && Math.abs(deltaX) + Math.abs(deltaY) > 3) {
      moved = true;
    }

    const nextPosition = clampPosition(
      {
        top: startTop + deltaY,
        right: startRight - deltaX,
      },
      rect,
    );

    applyHostPosition(host, nextPosition);
  };

  dragHandle.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      (!options?.allowButtonTargets && target.closest('button'))
    ) {
      return;
    }

    dragging = true;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    startTop = Number.parseFloat(host.style.top) || initialPosition.top;
    startRight = Number.parseFloat(host.style.right) || initialPosition.right;
    rect = host.getBoundingClientRect();

    dragHandle.classList.add('dragging');
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', () => {
    void finishDragging();
  });
  window.addEventListener('pointercancel', () => {
    void finishDragging();
  });
}

function renderPanelShell(
  mountPoint: HTMLDivElement,
  host: HTMLDivElement,
  position: FloatingPanelPosition,
  titleText: string,
  subtitleText: string,
  onCollapse: () => void,
  onOpenSettings: () => void,
  persistPosition: (nextPosition: FloatingPanelPosition) => Promise<void>,
) {
  mountPoint.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'coach-shell';

  const panel = document.createElement('aside');
  panel.className = 'coach-panel';

  const header = document.createElement('div');
  header.className = 'coach-header';

  const info = document.createElement('div');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'coach-eyebrow';
  eyebrow.textContent = 'X 增长插件';

  const titleRow = document.createElement('div');
  titleRow.className = 'coach-title-row';
  const title = document.createElement('div');
  title.className = 'coach-title';
  title.textContent = titleText;
  const subtitle = document.createElement('div');
  subtitle.className = 'coach-subtitle';
  subtitle.textContent = subtitleText;
  titleRow.append(title, subtitle);
  info.append(eyebrow, titleRow);

  const actions = document.createElement('div');
  actions.className = 'coach-actions';
  actions.append(createLightButton('设置', onOpenSettings), createLightButton('收起', onCollapse));

  header.append(info, actions);
  attachDragBehavior(header, host, position, persistPosition);
  panel.appendChild(header);
  shell.appendChild(panel);
  mountPoint.appendChild(shell);
  return panel;
}

export function startFloatingTaskPanel() {
  let busy = false;
  let renderToken = 0;
  let lastKnownPosition = DEFAULT_POSITION;
  let hasBootstrapped = false;
  let scheduledRenderTimer: number | null = null;

  const scheduleRender = (delayMs = FLOATING_PANEL_RENDER_DEBOUNCE_MS) => {
    if (scheduledRenderTimer !== null) {
      window.clearTimeout(scheduledRenderTimer);
    }

    scheduledRenderTimer = window.setTimeout(() => {
      scheduledRenderTimer = null;
      void render();
    }, delayMs);
  };

  const render = async () => {
    const hostContext = getHostContext(lastKnownPosition);
    if (!hostContext) {
      window.setTimeout(() => {
        void render();
      }, 300);
      return;
    }

    const currentToken = ++renderToken;

    const persistPosition = async (nextPosition: FloatingPanelPosition) => {
      lastKnownPosition = normalizePosition(nextPosition);
      const latestSettings = await getSettings();
      await saveSettings({
        ...latestSettings,
        floatingPanelPosition: lastKnownPosition,
      });
    };

    const handleExpandChange = async (expanded: boolean) => {
      const latestSettings = await getSettings();
      await saveSettings({
        ...latestSettings,
        contentObserverEnabled: true,
        floatingPanelExpanded: expanded,
      });
    };

    if (!hasBootstrapped) {
      renderPanelShell(
        hostContext.mountPoint,
        hostContext.host,
        lastKnownPosition,
        '加载中',
        '正在同步今天任务',
        () => {
          void handleExpandChange(false);
        },
        () => {
          openOptionsFromFloatingPanel();
        },
        persistPosition,
      );
    }

    try {
      const [settings, summary] = await Promise.all([getSettings(), getOrCreateTodaySummary()]);

      if (currentToken !== renderToken) {
        return;
      }

      if (!settings.contentObserverEnabled) {
        removeHost();
        hasBootstrapped = false;
        return;
      }

      lastKnownPosition = normalizePosition(settings.floatingPanelPosition);

      const refreshedContext = getHostContext(lastKnownPosition);
      if (!refreshedContext) {
        return;
      }

      const boundedPosition = clampPosition(
        lastKnownPosition,
        refreshedContext.host.getBoundingClientRect(),
      );
      applyHostPosition(refreshedContext.host, boundedPosition);
      lastKnownPosition = boundedPosition;

      const completionPercent = Math.round(summary.todayRecord.completionRate * 100);
      if (!settings.floatingPanelExpanded) {
        renderLauncher(
          refreshedContext.mountPoint,
          `${completionPercent}%`,
          '今日进度',
          summary.todayRecord.completionRate,
          refreshedContext.host,
          lastKnownPosition,
          persistPosition,
          () => {
            void handleExpandChange(true);
          },
        );
        hasBootstrapped = true;
        return;
      }

      const panel = renderPanelShell(
        refreshedContext.mountPoint,
        refreshedContext.host,
        lastKnownPosition,
        '今日打卡',
        `${completionPercent}%`,
        () => {
          void handleExpandChange(false);
        },
        () => {
          openOptionsFromFloatingPanel();
        },
        persistPosition,
      );

      const body = document.createElement('div');
      body.className = 'coach-body';

      const rail = document.createElement('div');
      rail.className = 'coach-rail';
      const railFill = document.createElement('div');
      railFill.className = 'coach-rail-fill';
      railFill.style.width = `${completionPercent}%`;
      rail.appendChild(railFill);

      const tasksWrap = document.createElement('div');
      tasksWrap.className = 'coach-tasks';

      summary.todayRecord.tasks.forEach((task) => {
        const row = document.createElement('div');
        row.className = 'coach-task-row';

        const taskLabel = document.createElement('div');
        taskLabel.className = 'coach-task-label';
        taskLabel.textContent = task.label;
        taskLabel.title = task.label;

        const taskRail = document.createElement('div');
        taskRail.className = 'coach-task-inline-rail';
        const taskRailFill = document.createElement('div');
        taskRailFill.className = 'coach-task-inline-fill';
        taskRailFill.style.width = `${task.target > 0 ? Math.min((task.current / task.target) * 100, 100) : 0}%`;
        taskRail.appendChild(taskRailFill);

        const taskMeta = document.createElement('div');
        taskMeta.className = 'coach-task-meta';
        taskMeta.textContent = `${task.current}/${task.target}`;

        const stepperGroup = document.createElement('div');
        stepperGroup.className = 'coach-stepper-group';
        stepperGroup.append(
          createStepperButton(
            '-',
            () => {
              if (busy) {
                return;
              }
              busy = true;
              void updateTodayTaskProgress(task.taskId, -1).finally(() => {
                busy = false;
                scheduleRender(0);
              });
            },
            busy || task.current <= 0,
          ),
          createStepperButton(
            '+',
            () => {
              if (busy) {
                return;
              }
              busy = true;
              void updateTodayTaskProgress(task.taskId, 1).finally(() => {
                busy = false;
                scheduleRender(0);
              });
            },
            busy,
          ),
        );

        row.append(taskLabel, taskRail, taskMeta, stepperGroup);
        tasksWrap.appendChild(row);
      });

      const footer = document.createElement('div');
      footer.className = 'coach-footer';
      footer.innerHTML = `<span>已完成 ${summary.completedTaskCount} / ${summary.totalTaskCount} 项</span><span>连续 ${summary.streakDays} 天达标</span>`;

      body.append(rail, tasksWrap, footer);
      panel.appendChild(body);

      const postRenderPosition = clampPosition(
        lastKnownPosition,
        refreshedContext.host.getBoundingClientRect(),
      );
      applyHostPosition(refreshedContext.host, postRenderPosition);
      lastKnownPosition = postRenderPosition;
      hasBootstrapped = true;
    } catch {
      const failedContext = getHostContext(lastKnownPosition);
      if (!failedContext) {
        return;
      }

      const latestSettings = await getSettings();
      lastKnownPosition = normalizePosition(latestSettings.floatingPanelPosition);
      applyHostPosition(failedContext.host, lastKnownPosition);
      if (!latestSettings.floatingPanelExpanded) {
        renderLauncher(
          failedContext.mountPoint,
          '任务',
          '点击重试',
          0,
          failedContext.host,
          lastKnownPosition,
          persistPosition,
          () => {
            void handleExpandChange(true);
          },
        );
        hasBootstrapped = true;
        return;
      }

      const panel = renderPanelShell(
        failedContext.mountPoint,
        failedContext.host,
        lastKnownPosition,
        '今日打卡',
        '暂时没读到数据',
        () => {
          void handleExpandChange(false);
        },
        () => {
          openOptionsFromFloatingPanel();
        },
        persistPosition,
      );

      const body = document.createElement('div');
      body.className = 'coach-body';

      const placeholder = document.createElement('div');
      placeholder.className = 'coach-placeholder';
      placeholder.textContent =
        '悬浮面板已经挂上了，但这次读取今天任务失败。你可以先点设置检查当前阶段，面板也会自动重试。';

      body.appendChild(placeholder);
      panel.appendChild(body);
      hasBootstrapped = true;
    }
  };

  const unsubscribe = subscribeToStorageChanges((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    const hasRelevantChange = Object.keys(changes).some((key) =>
      FLOATING_PANEL_STORAGE_KEYS.has(key),
    );
    if (hasRelevantChange) {
      scheduleRender();
    }
  });

  const repairTimer = window.setInterval(() => {
    if (!document.body) {
      return;
    }

    const host = document.getElementById(HOST_ID);
    if (!(host instanceof HTMLDivElement) || !host.isConnected) {
      scheduleRender(0);
    }
  }, 2500);

  const unsubscribeRuntime = subscribeToRuntimeMessages((message) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      (message as { type?: string }).type === 'x-growth:floating-panel-control'
    ) {
      scheduleRender(0);
    }
  });

  window.addEventListener('beforeunload', () => {
    unsubscribe();
    unsubscribeRuntime();
    window.clearInterval(repairTimer);
    if (scheduledRenderTimer !== null) {
      window.clearTimeout(scheduledRenderTimer);
    }
  });

  void render();
}
