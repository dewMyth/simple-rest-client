# SimpleRest

A fast, local-first REST client for macOS and Windows. There's no account, no sync and no telemetry. Open the app, paste a URL, press Send.

## Features

- GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS
- Query params kept in sync with the URL, and headers with per-row on/off switches
- Bodies: JSON, plain text, URL-encoded forms, and multipart with text and file fields
- Bearer and Basic auth
- Responses with status, time, size and headers, plus Pretty and Raw views. Pretty view keeps big integers exact.
- Search, copy, and save a response to a file
- Tabs with an unsaved-changes dot
- Collections, one level deep
- Environments with `{{variables}}`, highlighted in the editor
- History of the last 200 requests
- Paste a cURL command into the URL bar to import it, or copy any request as cURL
- Per-request timeout, redirect and TLS options
- Light and dark themes that follow your OS

## Install

Download the installer for your system from the latest release build. Installers are attached as workflow artifacts on version tags.

- **macOS:** open `SimpleRest-<version>-mac-arm64.dmg` (Apple silicon) or `-mac-x64.dmg` (Intel) and drag SimpleRest to Applications. The app isn't signed yet, so on first launch macOS blocks it. Open **System Settings → Privacy & Security** and choose **Open Anyway**.
- **Windows:** run `SimpleRest-<version>-win-x64-setup.exe` (or `-arm64-`). It installs for your user only and doesn't need admin rights. SmartScreen warns about unsigned installers; choose **More info → Run anyway**.

## Keyboard shortcuts

| Action                              | macOS                         | Windows                       |
| ----------------------------------- | ----------------------------- | ----------------------------- |
| Send request (Cancel while sending) | `Cmd+Enter`                   | `Ctrl+Enter`                  |
| Save request                        | `Cmd+S`                       | `Ctrl+S`                      |
| New tab                             | `Cmd+T`                       | `Ctrl+T`                      |
| Close tab                           | `Cmd+W`                       | `Ctrl+W`                      |
| Focus URL                           | `Cmd+L`                       | `Ctrl+L`                      |
| Search response                     | `Cmd+F`                       | `Ctrl+F`                      |
| Next / previous tab                 | `Ctrl+Tab` / `Ctrl+Shift+Tab` | `Ctrl+Tab` / `Ctrl+Shift+Tab` |

## Where your data lives

Everything is stored as readable JSON in a `data` folder inside the app's user-data folder:

- **macOS:** `~/Library/Application Support/SimpleRest/data`
- **Windows:** `%APPDATA%\SimpleRest\data`

```text
data/
  collections/<id>.json   one file per collection
  environments/<id>.json  one file per environment
  history.json            last 200 sent requests
  settings.json           active environment, window size, pane sizes, default options
  session.json            open tabs, including unsaved drafts
```

Files are written atomically, so a crash can't leave one half-written. If a file can't be read, SimpleRest renames it to `<name>.corrupt-<timestamp>.json`, shows a warning, and carries on. It never deletes it. To reset the app, quit it and delete the `data` folder.

### Secrets are stored in plain text

Like a `.env` file, **tokens, passwords and environment values are saved as plain text** in the data folder. That includes saved requests, environments, and unsaved drafts in `session.json`. Anyone who can read your user folder can read them. Don't use SimpleRest for secrets you can't keep on your own disk this way.

History is the exception. It never stores auth values, or the values of the `Authorization`, `Cookie`, `Proxy-Authorization` and `X-Api-Key` headers. Reopening a request from history means entering its auth again. History never stores response bodies.

### Network use

SimpleRest makes no network calls of its own: no update checks, analytics or crash reports. The only requests it sends are the ones you send.

## Building from source

You need Node.js 24 or newer.

```sh
npm install
npm run dev          # run with hot reload
npm run typecheck
npm run lint
npm test             # unit and integration tests (Vitest)
npm run test:e2e     # builds, then runs end-to-end tests (Playwright + Electron)
```

Build installers:

```sh
npm run dist:mac     # .dmg for x64 and arm64 (run on macOS)
npm run dist:win     # NSIS .exe for x64 and arm64 (run on Windows)
```

Output goes to `release/`. To regenerate the app icons from `build/icon.svg`, run `npm run icons` on macOS (`.icns` needs `iconutil`).

### Project layout

```text
src/shared/     types, zod schemas, variable resolution, cURL import/export
src/main/       Electron main process: HTTP engine, JSON storage, validated IPC, menus
src/preload/    the small typed API exposed to the renderer as window.api
src/renderer/   React UI (sandboxed, with no Node or Electron access)
tests/          unit, integration (with a local HTTP/HTTPS test server) and e2e tests
```

All network and file access happens in the main process. The renderer runs sandboxed with context isolation, a strict Content Security Policy, and no Node access. Every IPC message is validated with zod and must come from the app's own frame.

## Code signing

v1 ships unsigned. Signing can be turned on later without changing the config, by adding these repository secrets for the CI workflow:

- **macOS:** `CSC_LINK` (base64 `.p12` Developer ID certificate) and `CSC_KEY_PASSWORD`. For notarization, also add `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`.
- **Windows:** `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`.

Auto-update is intentionally not included until signing is in place.

## Design notes

`plan.md` is the original plan. `DECISIONS.md` records where the implementation differs from it and why.
