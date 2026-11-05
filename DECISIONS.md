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

## M5

- **cURL export uses POSIX shell quoting** (single quotes, with `'` written as `'\''`). It works in macOS and Linux shells, Git Bash, and WSL. Windows `cmd.exe` doesn't understand single quotes. A unit test runs the quoting through a real `/bin/sh` to prove it's safe.
- **cURL import details:**
  - No `-L` means redirects are off, matching curl.
  - `Authorization: Bearer …` becomes bearer auth.
  - A `Content-Type` the body type would add anyway is dropped.
  - `-d` data that's valid URL-encoding becomes a form body.
  - `-F name=@file` becomes a file field with no path. File paths can only come from the file picker, so the user is asked to choose the file again.
  - Some extra flags are understood because browsers emit them in "Copy as cURL": `-G`, `-I`, `-A`, `-b`, `-e`, `--url`, `--max-time` and `--form-string`. Unknown boolean flags are ignored.
- **Copy as cURL fills in variables** from the active environment, so the command runs as-is. Any unresolved names are listed in the confirmation.
- **Multipart text fields export as `--form-string`** so values starting with `@` or `<` aren't read as files by curl.
- **Vitest config is `vitest.config.mts`** so it loads as ESM without `"type": "module"`.

## M6

- **Installers are built in CI on version tags** (and on manual runs), not on every push. Every push and pull request still runs typecheck, lint, unit, integration and end-to-end tests, plus the app build, on `macos-latest` and `windows-latest`.
- **Separate x64 and arm64 builds** on both platforms: two `.dmg` files and two NSIS `.exe` files. The NSIS installer is assisted (not one-click), per-user, and never asks for elevation.
- **Signing comes from environment variables only.** `electron-builder.yml` has no signing settings. CI passes the signing secrets through and turns off certificate auto-discovery when `CSC_LINK` is empty.
- **Icons** are generated from `build/icon.svg` by `npm run icons`, which renders the SVG with Electron. `.icns` uses macOS `iconutil`, and `.ico` is written as a PNG-based ICO. The generated files are committed so Windows CI doesn't need to run the script.
- **Measured locally (macOS arm64, unsigned):**
  - The `.dmg` is 116 MiB.
  - `app.asar` is 5.5 MB and holds only `out/`, `undici` and `zod`, with no source maps or tests.
  - Startup to a usable window is about 0.3 s warm, and 1.9 s on the first launch of a freshly built app (which includes macOS's first-run scan).
- **E2E tests launch the project root**, not `out/main/index.js`, so Electron reads `package.json` the same way a packaged app does. This gives the correct app version in `User-Agent`.

## Collection import and export (after v0.1.0)

Added at the user's request. This extends the plan's scope: section 2 had no import/export, and section 2's out-of-scope list named Postman and Insomnia import. The choices were confirmed with the user:

- **SimpleRest JSON format only.** The file wraps collections with a marker: `{ "format": "simplerest-collection", "formatVersion": 1, "includesSecrets": …, "collections": [...] }`. Import also accepts a bare collection object, such as a file copied from the data folder. Postman files get a clear "not supported" message.
- **One collection per export file.** Import accepts one or more files, and each file may hold several collections.
- **Secrets are off by default** and included only when "Include secrets" is ticked in the export dialog. Stripping uses the same rules as history, moved to `src/shared/secrets.ts`.
- **Import always adds new collections with fresh IDs.** Name clashes become `Name (2)`. Nothing existing is overwritten.
- **Multipart file paths are never exported**, and they're cleared on import. They're machine-specific, and file paths may only come from the file picker.
- **Parsing and file access happen in the main process.** Files over 50 MB are refused. A bad file produces a warning naming it, while the other selected files still import.
