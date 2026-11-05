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

## M1

- **Bodies are buffered before sending.** This lets 307/308 redirects replay the same bytes, including multipart bodies, which are encoded with undici's `FormData` and `Response`. Files are read with `fs.openAsBlob`.
- **Response headers use undici's `responseHeaders: 'raw'`** so header order, original casing, and duplicates like `Set-Cookie` are kept.
- **One overall timeout.** `timeoutMs` covers the whole send: connect, every redirect hop, and reading the body. undici's own `headersTimeout` and `bodyTimeout` are turned off so `0` really means no timeout.
- **303 changes every method except HEAD to GET**, following RFC 9110. 301 and 302 change only POST to GET, as the plan says. `Proxy-Authorization` is stripped on cross-origin redirects along with `Authorization` and `Cookie`.
- **Missing scheme becomes `http://`.** Typing `localhost:3000/users` works. Only `http:` and `https:` can be sent.
- **Multipart file paths must be approved by the main process.** A path is approved when it comes from the main-process file dialog. M3 will also approve paths read from the app's own data files, so saved requests keep working after a restart.
- **`ResponseResult` has two extra fields:** `contentType` (for the Pretty view and the save file name) and `undecodedEncoding` (set when the body is shown as raw bytes because its `Content-Encoding` isn't supported).
- **`SavedRequest.disabledParams` was added now** so the schema doesn't change again in M2.
- **Test certificate.** `tests/fixtures/certs` holds a self-signed certificate for the local HTTPS test server. It's test-only.
