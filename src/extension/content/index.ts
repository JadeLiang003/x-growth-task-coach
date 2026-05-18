import { startCandidateImportObserver } from './candidate-import-observer';
import { startComposerActionCounter } from './composer-action-counter';
import { startFloatingTaskPanel } from './floating-task-panel';
import { startXPageObserver } from './x-page-observer';

function safeStart(label: string, start: () => void) {
  try {
    start();
  } catch (error) {
    console.error(`[x-growth] ${label} 启动失败`, error);
  }
}

safeStart('floating-task-panel', startFloatingTaskPanel);
safeStart('x-page-observer', startXPageObserver);
safeStart('composer-action-counter', startComposerActionCounter);
safeStart('candidate-import-observer', startCandidateImportObserver);
