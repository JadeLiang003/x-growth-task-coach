import type { CandidateAccountImportEventDetail } from './types';

const BRIDGE_EVENT_NAME = 'x-growth:candidate-accounts';

function getRuntime() {
  return (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome?.runtime;
}

export function startCandidateImportObserver() {
  window.addEventListener(BRIDGE_EVENT_NAME, (event) => {
    const detail = (event as CustomEvent<CandidateAccountImportEventDetail>).detail;
    if (!detail || detail.items.length === 0) {
      return;
    }

    getRuntime()?.sendMessage?.({
      type: 'x-growth:candidate-accounts',
      payload: detail,
    });
  });
}
