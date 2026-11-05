# Decisions

Deviations from `plan.md`, and choices the plan left open.

## M0

- **TypeScript 6.0, not 7.** The latest TypeScript is 7.x, but `typescript-eslint` (8.72) only supports `>=4.8.4 <6.1.0`. We use the newest 6.0 release so linting works. Revisit when `typescript-eslint` supports 7.
- **No `"type": "module"` in `package.json`.** Main and preload build to CommonJS `.js`. The plan requires a CommonJS preload, and electron-vite would otherwise emit ESM `.mjs`.
- **Renderer packages are devDependencies.** React, Zustand and CodeMirror are bundled by Vite into the renderer, so they don't need to be shipped in `node_modules` inside the package. Only main-process runtime packages (`undici`, `zod`) are in `dependencies`.
- **`ELECTRON_RUN_AS_NODE` is cleared** in `electron.vite.config.ts` and in the e2e launcher. VS Code sets it in its integrated terminal, which makes Electron start as plain Node and crash.
- **macOS has a File menu** in addition to the App, Edit, View, and Window menus from section 11. It holds New Tab, Save, Close Tab, Send and Focus URL so their accelerators have a home. This matches standard macOS apps.
- **CSP is injected only into production builds** through a small Vite plugin, because Vite's dev server needs inline scripts for HMR. DevTools are enabled only when running from the dev server.
- **Extra hardening:** all permission requests (camera, notifications, etc.) are denied, and `<webview>` attachment is blocked.
