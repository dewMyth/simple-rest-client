import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Editors like VS Code set this in their terminals. Electron inherits it from this process
// when electron-vite spawns the app, and would then run as plain Node.
delete process.env['ELECTRON_RUN_AS_NODE'];

const PROD_CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:";

/** Injects the strict CSP meta tag into production builds only (Vite's dev server needs inline scripts). */
function productionCsp(): Plugin {
  return {
    name: 'simplerest-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!-- CSP -->',
        `<meta http-equiv="Content-Security-Policy" content="${PROD_CSP}" />`,
      );
    },
  };
}

const shared = { '@shared': resolve(__dirname, 'src/shared') };

export default defineConfig({
  main: {
    resolve: { alias: shared },
    build: {
      sourcemap: false,
      rolldownOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    resolve: { alias: shared },
    build: {
      sourcemap: false,
      rolldownOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        output: { format: 'cjs' },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: { ...shared, '@renderer': resolve(__dirname, 'src/renderer/src') },
    },
    plugins: [react(), tailwindcss(), productionCsp()],
    build: {
      sourcemap: false,
      rolldownOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
    },
  },
});
