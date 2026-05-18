declare const chrome: {
  runtime: {
    onInstalled: {
      addListener: (callback: () => void) => void;
    };
    onStartup: {
      addListener: (callback: () => void) => void;
    };
    onMessage: {
      addListener: (
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (response: unknown) => void,
        ) => boolean | void,
      ) => void;
    };
    openOptionsPage?: () => void;
    getURL?: (path: string) => string;
    sendMessage?: (message: unknown) => void;
  };
  storage: {
    onChanged?: {
      addListener: (
        callback: (
          changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
          areaName: string,
        ) => void,
      ) => void;
      removeListener: (
        callback: (
          changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
          areaName: string,
        ) => void,
      ) => void;
    };
    local: {
      get: (
        keys: string | string[] | Record<string, unknown> | null,
        callback: (items: Record<string, unknown>) => void,
      ) => void;
      set: (items: Record<string, unknown>, callback?: () => void) => void;
    };
  };
};
