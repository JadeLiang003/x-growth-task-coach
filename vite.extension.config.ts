import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';

import preact from '@preact/preset-vite';

import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist/extension',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        popup: path.resolve(rootDir, 'popup.html'),
        options: path.resolve(rootDir, 'options.html'),
        background: path.resolve(rootDir, 'src/extension/background/service-worker.ts'),
        'content-script-module': path.resolve(rootDir, 'src/extension/content/index.ts'),
        'page-bridge': path.resolve(rootDir, 'src/extension/content/page-bridge.ts'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  plugins: [preact()],
});
