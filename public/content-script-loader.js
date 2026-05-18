(() => {
  const runtime = globalThis.chrome?.runtime;
  const moduleUrl = runtime?.getURL?.('assets/content-script-module.js');

  if (!moduleUrl) {
    return;
  }

  import(moduleUrl).catch((error) => {
    console.error('[x-growth] 内容脚本模块加载失败', error);
  });
})();
