# Plan: Simple REST Client (Electron)

Working name: **SimpleRest**. Rename it in `package.json` and `electron-builder.yml`.

## 1. Product goal

Build a fast, local-first desktop REST client for macOS and Windows. A user should be able to open the app, paste a URL, press send, and read the response within seconds.

### Principles

- **No account.** No login, cloud sync, team workspace, or telemetry.
- **Local files only.** All user data lives in readable JSON on the user's machine.
- **One main screen.** Sidebar, request, and response. No dashboards or onboarding.
- **Fast start.** The window should be usable in under 2 seconds on a modern laptop.
- **Few features, done well.** If a feature isn't in section 2, don't build it.

## 2. Scope

### In scope for v1

- **Requests:** GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- **Query params:** Editable table, kept in sync with the URL
- **Headers:** Editable table with per-row enable/disable
- **Body types:** None, JSON, plain text, `x-www-form-urlencoded`, `multipart/form-data` (text and file fields)
- **Auth:** None, Bearer token, Basic
- **Responses:** Status, time, size, headers, and body with Pretty and Raw views
- **Response actions:** Search, copy, save to file
- **Tabs:** Multiple open requests with an unsaved-changes indicator
- **Collections:** Named groups of saved requests, one level deep with no nested folders
- **Environments:** Named sets of variables used as `{{name}}`, with one active environment
- **History:** Last 200 sent requests
- **cURL:** Import by pasting into the URL bar, and copy any request as cURL
- **Request options:** Timeout, follow redirects, verify TLS certificates
- **Theme:** Light and dark, following the OS setting
- **Keyboard shortcuts:** See section 9

### Out of scope for v1

Do not build or scaffold these:

- Accounts, sync, team sharing, or telemetry
- GraphQL, WebSocket, gRPC, SSE, or MQTT
- Pre-request scripts, test scripts, or a collection runner
- Mock servers, API docs, or AI features
- OAuth flows, a plugin system, or a cookie jar
- Nested folders, HTML response preview, or auto-update
- Postman and Insomnia import (first candidate after v1)

## 3. Technical decisions

| Area | Decision | Reason |
| --- | --- | --- |
| Shell | Latest stable Electron | Keeps the app on a supported, patched release |
| Language | TypeScript in `strict` mode | Shared types across all three processes |
| Build and dev | `electron-vite` | Fast dev server and HMR with separate main, preload, and renderer builds |
| Packaging | `electron-builder` | DMG and NSIS output from one config |
| UI | React with Zustand | Small, simple state management |
| Styling | Tailwind CSS with CSS variables for themes | Fast to build, easy light and dark support |
| Editor | CodeMirror 6 | Much lighter than Monaco |
| HTTP | `undici` in the main process | No CORS limits, full header control, cancellation |
| Validation | `zod` | Validates IPC input and files loaded from disk |
| Storage | JSON files, not SQLite | No native modules to rebuild per OS, architecture, and Electron version |
| Tests | Vitest and Playwright for Electron | Unit, integration, and end-to-end coverage |

Install the latest stable version of each dependency at scaffold time. Do not pin versions from memory. Check the installed version's API before using it, especially for `undici`, `electron-vite`, and `electron-builder`.

**Keep the dependency list short.** Do not add a component library. Ask before adding any runtime dependency that isn't listed here.

## 4. Architecture

```text
Renderer (React, sandboxed, no Node access)
    │  window.api.* only
Preload (contextBridge, typed and minimal)
    │  ipcRenderer.invoke
Main process
    ├── http/      sends requests, handles redirects, decoding, cancellation
    ├── storage/   reads and writes JSON files atomically
    ├── ipc/       validated handlers, one file per domain
    └── app shell  windows, menus, dialogs
```

### Rules

- All network and file access happens in the main process.
- The renderer never imports `electron` or Node modules.
- Types shared across processes live in `src/shared`.
- Every IPC handler validates its input with `zod`.

### Project structure

```text
src/
  shared/          types.ts, schemas.ts, variables.ts, curl.ts
  main/
    index.ts
    menu.ts
    http/          client.ts, redirects.ts, decode.ts, body.ts, auth.ts
    storage/       paths.ts, atomicWrite.ts, collections.ts,
                   environments.ts, history.ts, settings.ts, session.ts
    ipc/           http.ts, storage.ts, dialogs.ts
  preload/
    index.ts
  renderer/
    src/
      App.tsx
      components/  layout/, request/, response/, sidebar/, common/
      stores/      tabs.ts, collections.ts, environments.ts, history.ts, settings.ts
      lib/         url.ts, format.ts, shortcuts.ts
tests/
  fixtures/testServer.ts
  integration/
  e2e/
```

## 5. Data model

Put these types in `src/shared/types.ts`, with matching `zod` schemas in `schemas.ts`.

```ts
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

type RequestBody =
  | { type: 'none' }
  | { type: 'json'; content: string }
  | { type: 'text'; content: string }
  | { type: 'form'; fields: KeyValue[] }
  | { type: 'multipart'; fields: MultipartField[] };

type MultipartField =
  | { id: string; kind: 'text'; key: string; value: string; enabled: boolean }
  | { id: string; kind: 'file'; key: string; filePath: string; enabled: boolean };

type Auth =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string };

interface RequestOptions {
  timeoutMs: number;       // default 30000, 0 means no timeout
  followRedirects: boolean; // default true
  verifyTls: boolean;      // default true
}

interface SavedRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  body: RequestBody;
  auth: Auth;
  options: RequestOptions;
}

interface Collection {
  schemaVersion: 1;
  id: string;
  name: string;
  requests: SavedRequest[];
}

interface Environment {
  schemaVersion: 1;
  id: string;
  name: string;
  variables: KeyValue[];
}

interface ResponseResult {
  sendId: string;
  status: number;
  statusText: string;
  headers: [string, string][];   // ordered, keeps duplicates like Set-Cookie
  bodyText: string;              // decoded preview, may be truncated
  isBinary: boolean;
  isTruncated: boolean;
  durationMs: number;
  wireSizeBytes: number;
  decodedSizeBytes: number;
  finalUrl: string;
  redirectCount: number;
}
```

Query params stay in `url`. The URL is the source of truth, and the params table is a view of it. Disabled params are stored in tab state and in a `disabledParams` field on the request, which you should add to `SavedRequest` when implementing the params table.

## 6. Storage

Store everything under `app.getPath('userData')`:

```text
data/
  collections/<id>.json
  environments/<id>.json
  history.json
  settings.json     theme, active environment, window bounds, default options
  session.json      open tabs, including unsaved drafts
```

- Name files by ID, never by user input. This avoids invalid Windows filenames and path traversal.
- Write atomically: write a temp file in the same folder, then rename it over the target. On Windows, retry the rename briefly on `EPERM` or `EBUSY`.
- Queue writes per file so they can't overlap, and debounce session saves by about 500 ms.
- Every file carries `schemaVersion`. Run migrations on load.
- If a file is corrupt, rename it to `<name>.corrupt-<timestamp>.json`, show a non-blocking warning, and continue. Never overwrite or delete a user's data.

### Secrets

v1 stores tokens and environment values as plain text in the local data folder, like a `.env` file. Say this in the README. History must strip auth values and the values of `Authorization`, `Cookie`, `Proxy-Authorization`, and `X-Api-Key` headers. Reopening a history item therefore requires auth to be entered again. History never stores response bodies.

## 7. HTTP engine

This logic lives in `src/main/http`.

### Send flow

1. Resolve `{{variables}}` in the URL, headers, body, and auth using the active environment.
2. If any variable is unresolved, block the send and list the missing names in the UI.
3. Build the headers. Add `Content-Type` from the body type unless the user set one.
4. Apply auth. An explicit `Authorization` header set by the user takes precedence.
5. Send with `undici.request`, and store an `AbortController` by `sendId`.
6. Read the response, decode it, and return `ResponseResult`.

### Required behavior

- **Redirects:** Implement them manually, with a limit of 10.
  - 301, 302, and 303 change POST to GET and drop the body. HEAD stays HEAD.
  - 307 and 308 keep the method and body.
  - Strip `Authorization` and `Cookie` when the redirect crosses origins.
- **Compression:** Send `Accept-Encoding: gzip, deflate, br` by default, and decompress with `node:zlib`. Don't assume the client decompresses automatically. If the user sets their own `Accept-Encoding`, keep it, and show the raw bytes when the encoding is unsupported.
- **Text decoding:** Use the charset from `Content-Type` with `TextDecoder`. Default to UTF-8.
- **Binary detection:** Use the content type and a null-byte check on the first 8 KB. Show "Binary response, N bytes" with a Save button.
- **Large responses:** Send at most 5 MB of text to the renderer and set `isTruncated`. Keep up to 200 MB per tab in the main process so Save to file can write the full body. Release it when the tab closes or sends again. Above 200 MB, abort and show a clear error.
- **Errors:** Map failures to clear messages for DNS failure, connection refused, TLS failure, timeout, cancellation, and too many redirects. Show the failure in the response panel, not in a toast.
- **TLS:** When `verifyTls` is false, use a dispatcher with `rejectUnauthorized: false` for that request only. Show a small warning next to the send button.
- **Default headers:** Set `User-Agent: SimpleRest/<version>` unless overridden.

### Known traps

- **Big numbers:** Do not pretty-print with `JSON.parse` and `JSON.stringify`, because integers above 2^53 lose precision. Use a formatter that works on the text and leaves number tokens unchanged.
- **Variables in URLs:** Don't pass the URL through `new URL()` in the editor, because it encodes `{{` and `}}`. Parse query strings with a small custom parser in `lib/url.ts`. Use `new URL()` only after variables are resolved.
- **Encoding round trips:** Editing one param must not re-encode the rest of the URL.
- **Duplicate headers:** Keep `Set-Cookie` and other repeated headers as separate entries.
- **HEAD and 204 responses:** Handle empty bodies without decode errors.

## 8. UI

```text
┌──────────────┬──────────────────────────────────────────┐
│ Collections  │ [Tab 1] [Tab 2 •] [+]        [Env: Dev ▾]│
│ History      ├──────────────────────────────────────────┤
│              │ [GET ▾] [ URL ................ ] [ Send ]│
│ ▸ Users API  ├──────────────────────────────────────────┤
│   GET  List  │ Params | Headers | Body | Auth | Options │
│   POST New   │  ...                                     │
│ ▸ Billing    ├──────────────────────────────────────────┤
│              │ 200 OK   142 ms   3.1 KB                 │
│              │ Body | Headers          Pretty | Raw     │
│              │  ...                                     │
└──────────────┴──────────────────────────────────────────┘
```

- The sidebar and the request/response split are resizable, and their sizes persist.
- While a request is running, Send becomes Cancel.
- Color status by class: 2xx green, 3xx blue, 4xx amber, 5xx red.
- Tab counts show on Params and Headers, such as `Headers (3)`.
- Empty key-value rows appear automatically at the bottom of each table.
- Highlight `{{variables}}` in URL and body fields, and mark unresolved ones.
- Closing a tab with unsaved changes asks to save, discard, or cancel.
- Use the platform's system font for UI text and a monospace font for code.
- Render response bodies only as text in CodeMirror. Never inject them as HTML.
- Virtualize long sidebar lists if needed, and keep typing responsive with large responses.

## 9. Keyboard shortcuts

Use `CommandOrControl` in menu accelerators so one definition works on both platforms.

| Action | macOS | Windows |
| --- | --- | --- |
| Send request | `Cmd+Enter` | `Ctrl+Enter` |
| Save request | `Cmd+S` | `Ctrl+S` |
| New tab | `Cmd+T` | `Ctrl+T` |
| Close tab | `Cmd+W` | `Ctrl+W` |
| Focus URL | `Cmd+L` | `Ctrl+L` |
| Search response | `Cmd+F` | `Ctrl+F` |
| Next tab | `Ctrl+Tab` | `Ctrl+Tab` |

## 10. Security baseline

Set these from the first commit:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`
- Build the preload as CommonJS, since sandboxed preloads can't use ESM.
- Expose only named functions through `contextBridge`. Never expose `ipcRenderer` itself.
- Set a strict CSP in production: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`. CodeMirror injects styles, which is why inline styles are allowed.
- Deny `window.open`, and block all in-app navigation away from the app.
- Allow `shell.openExternal` only for `http:` and `https:` URLs.
- Check that IPC messages come from the app's own frame.
- File paths for multipart fields come only from the main-process file dialog. The renderer can't supply new paths.
- Disable DevTools in production builds.

## 11. macOS and Windows requirements

Build every feature for both platforms. Don't add platform-specific code unless it's listed here.

| Area | macOS | Windows |
| --- | --- | --- |
| Window frame | Native title bar | Native title bar |
| Closing last window | App stays running, Dock click reopens | App quits |
| Menu | Standard App, Edit, View, Window menus | Minimal File, Edit, View, Help menus |
| Installer | Universal or separate x64 and arm64 `.dmg` | NSIS per-user `.exe`, x64 and arm64, no admin rights |
| App icon | `.icns` | `.ico` |

Also:

- Use `path.join` and `app.getPath`. Never hardcode separators or home paths.
- Add `.gitattributes` with `* text=auto` so line endings stay consistent.
- Keep npm scripts cross-platform. Don't use bash-only syntax.
- The Edit menu must include Cut, Copy, Paste, and Select All, or those shortcuts fail on macOS.

## 12. Build milestones

Work through these in order. Finish each one before starting the next. At the end of each milestone, run `npm run typecheck`, `npm run lint`, and `npm test`, fix any failures, and commit.

### M0: Scaffold

- Create the project with `electron-vite`, React, and TypeScript.
- Add Tailwind, ESLint, Prettier, Vitest, and `.gitattributes`.
- Apply the full security baseline from section 10.
- Add the app menu and the macOS and Windows window behavior.
- **Done when:** `npm run dev` opens an empty themed window, and a test confirms `window.require` and `window.process` are undefined in the renderer.

### M1: HTTP engine

- Build `tests/fixtures/testServer.ts`, a local Node server with these routes: echo, status codes, redirects of each type, gzip, deflate, brotli, slow, large, binary, non-UTF-8, empty, duplicate headers, and big-integer JSON.
- Implement everything in section 7 with no UI.
- **Done when:** Integration tests cover each route and each error type, including cancelling a slow request and timing out.

### M2: Request and response UI

- Build the layout, URL bar, method picker, params, headers, body editor, and response panel.
- Add the Pretty and Raw views, plus search, copy, and save to file.
- Build tabs, keeping them in memory for now.
- **Done when:** A user can send every body type to the test server and read the result, the Pretty view keeps `12345678901234567890` exact, and a 50 MB response leaves the UI responsive.

### M3: Collections and persistence

- Implement the storage layer from section 6.
- Add the collections sidebar: create, rename, delete, duplicate, and reorder.
- Add saving requests, unsaved indicators, and session restore.
- **Done when:** Tabs, drafts, and collections survive a restart, and a corrupt file is preserved with a warning instead of crashing the app.

### M4: Environments, auth, and history

- Add the environment switcher and editor.
- Add variable resolution and highlighting.
- Add Bearer and Basic auth.
- Add the history list with secret stripping, plus a clear history action.
- **Done when:** Switching environments changes the outgoing request, unresolved variables block the send, and a test confirms that no auth values reach `history.json`.

### M5: cURL and polish

- Add cURL import on paste into the URL bar, and Copy as cURL. Support `-X`, `-H`, `-d`, `--data-raw`, `--data-urlencode`, `-F`, `-u`, `-L`, and `-k`, plus single-quoted and double-quoted arguments.
- Write a shell-safe exporter and test it with quotes in the values.
- Finish keyboard shortcuts, empty states, and error messages.
- Check dark and light themes on every screen.
- **Done when:** A round-trip test shows export then import gives an equivalent request, and all section 9 shortcuts work.

### M6: Packaging and release

- Configure `electron-builder` for the targets in section 11.
- Exclude source maps and test files from the package, and check the installer size.
- Add a GitHub Actions workflow that runs tests and builds on `macos-latest` and `windows-latest`, then uploads the installers as artifacts on version tags.
- Add Playwright end-to-end tests for the main flow: open, send, save, restart, reopen.
- Write a README covering install, data location, plain-text secret storage, and how to build.
- **Done when:** CI builds installers on both platforms, and each one installs and runs on a clean machine.

## 13. Code signing

The app can be built and used without signing, with these limits:

- **macOS:** An unsigned download is blocked by Gatekeeper, and the user must approve it manually. Public distribution needs an Apple Developer ID certificate and notarization.
- **Windows:** SmartScreen shows a warning on unsigned installers. Removing it needs a code signing certificate.

Leave signing off in v1, but read signing credentials from environment variables in CI so it can be enabled later without changing the config. Don't add auto-update until signing is in place.

## 14. Definition of done for v1

- [ ] Cold start to a usable window takes under 2 seconds.
- [ ] The installer is under about 150 MB per architecture.
- [ ] All section 2 features work on macOS and Windows.
- [ ] The app makes no network calls except requests the user sends.
- [ ] Deleting the data folder resets the app without errors.
- [ ] Typecheck, lint, unit, integration, and end-to-end tests all pass on both platforms.

## 15. Instructions for Claude Code

1. Read this whole file before writing code.
2. Create a task list from section 12, and start at M0.
3. Finish one milestone at a time, and make small commits with clear messages.
4. Follow sections 2 and 10 strictly. Don't add out-of-scope features or weaken security settings to make something work.
5. If this plan conflicts with the current API of a library, follow the library's documentation and note the change in `DECISIONS.md`.
6. If a decision would change the scope, the storage format, or the dependency list, stop and ask.
7. At the end of each milestone, summarize what was built, what was tested, and anything that needs a manual check on the other operating system.
