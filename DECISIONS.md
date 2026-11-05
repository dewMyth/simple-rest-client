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

## M2

- **Params table rows live in tab state.** Enabled rows mirror the URL query; disabled rows are kept in `disabledParams`. When the URL is edited, disabled rows keep their position and enabled slots are refilled from the URL. When the table is edited, segments the user didn't touch are copied from the URL text verbatim, so nothing is re-encoded.
- **Pretty view uses a text-walking formatter.** `JSON.parse` is used only to check validity; the output is built from the original text so number tokens never change. Pretty view is skipped for truncated bodies (they aren't valid JSON).
- **Shortcuts go through menu accelerators** and are forwarded to the renderer as named actions. `Ctrl+Shift+Tab` (previous tab) was added alongside `Ctrl+Tab`. Pressing `Cmd/Ctrl+Enter` while a request is running cancels it.
- **`SIMPLEREST_USER_DATA`** overrides the data folder. It exists so end-to-end tests can use a throwaway folder.
- **`@lezer/highlight`** is imported directly for syntax tags. It's part of CodeMirror 6 and was already installed as a dependency of `@codemirror/language`.

## M3

- **IDs must match `[A-Za-z0-9_-]{1,100}`.** File names come from IDs, so the zod schema and the storage layer both reject anything else.
- **Unknown schema versions count as corrupt.** A file from a newer version of the app is set aside as `<name>.corrupt-<timestamp>.json` with a warning, so it's never overwritten. Same for invalid JSON or unexpected content.
- **Startup load is reused once.** The main process loads data before creating the window (for window bounds and theme). The renderer's first `loadAll` gets that same result, so warnings about files that were just set aside aren't lost.
- **Collection order lives in `settings.json`** (`collectionOrder`), since each collection is its own file. Request order is the array order inside the collection.
- **Deleting a collection deletes its file**, after a confirmation dialog. Open tabs from it become unsaved drafts.
- **Saved multipart file paths.** Paths read from the app's own collections and session are approved for upload. When the renderer saves a collection or session, any file path the main process never approved is cleared, so the renderer can't introduce new paths through storage.
- **Dirty checks use a stable (sorted-key) serialization** so key order never causes a false "unsaved" dot. The snapshot is stored in `session.json` so the indicator survives a restart.
- **`settings.json` has a `theme` field** (`system` by default, which follows the OS). There's no UI for it; v1 always follows the OS unless the file is edited.
- **Window bounds are saved** (debounced) and restored only if they still fit on a connected display.

## M4

- **Secrets are stripped in the main process**, not the renderer, so nothing the renderer sends can put auth values into `history.json`. Header names are kept and only their values are cleared.
- **What goes into history:** every request that reached the network, including ones that failed with DNS, TLS, timeout, and similar errors. Sends blocked before going out (unresolved variables, invalid URL, unapproved file) and cancelled sends are not recorded. History stores the request as written, with `{{variables}}` unresolved.
- **Environment edits are debounced** (300 ms) because variables change on every keystroke. Pending saves are flushed before the window unloads.
- **The environment editor is a dialog** opened from "Manage environments…" in the switcher, so the main screen stays a single view.
- **Variable names** may contain letters, digits, `_`, `-` and `.`. Resolution isn't recursive: a value containing `{{x}}` is sent as written.
