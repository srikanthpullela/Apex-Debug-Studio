# Splec Note

A lightweight, distinctive cross-platform text & code editor — great for **both
note-taking and coding**. Built with **Tauri 2** (Rust + web), **TypeScript +
Vite**, and the **CodeMirror 6** editor engine.

> **Phases 0–2.** Scaffold + design system + branding (Phase 0), a tabbed
> multi-document editor with full file operations (Phase 1), and a
> "never lose work" session-persistence engine (Phase 2). Find/replace and
> later features arrive in subsequent phases.

<p>
  <img src="../branding/source-assets/apple-touch-icon.png" width="72" alt="Splec mark" />
</p>

## Highlights

- **Native-feeling, small footprint** via Tauri (no Chromium bundle).
- **Tabbed multi-document editing.** Multiple buffers, each a tab with a dirty
  dot (●), close button, drag-to-reorder, and a Splec-purple active indicator.
  `+` / `Cmd-T` for a new note, `Cmd-W` to close (guarded), `Cmd-Tab` to cycle.
- **Full file operations** through Tauri `fs`/`dialog`: New, Open (native
  multi-select), Save, Save As, Close — each tab tracks its real path, language,
  encoding (UTF-8), and EOL, with an unsaved-changes guard on close/quit.
- **Never lose work (session persistence).** Every open buffer — *including
  unsaved, untitled scratch notes* — is continuously mirrored to a backup file
  in the app data dir, and an ordered manifest records tab order, cursor,
  selection and scroll. On relaunch (or after a crash) every tab is rebuilt
  exactly, with the previously active tab reselected. Implemented in the Rust
  backend with **atomic writes** (temp file + rename) and a forced flush on quit.
- **CodeMirror 6** editor: line numbers, active-line highlight, bracket
  matching, undo/history, word-wrap toggle, and lazy-loaded syntax highlighting
  for **20+ languages** (JS/TS/JSON/Markdown/HTML/CSS/Python/Rust/C-C++/Go/Java/
  PHP/SQL/YAML/XML/shell/Ruby/TOML/Lua/Swift/…), auto-detected by file extension
  and switchable from the status-bar picker.
- **Recent files** (persisted) surfaced in the menu and on the empty-state start
  screen.
- **Preferences** (persisted): theme, font size, tab size, word wrap, and the
  default new-file language. Light mode stays the default.
- **Deliberate Splec design system** — not a generic VS Code clone:
  - Brand purple `#7c5cff`, periwinkle `#9db4ff`, dark canvas `#06070d`.
  - Bundled fonts (no hot-linking): **Dancing Script** (the *Splec* logotype),
    **Space Grotesk** (display/UI headings), **Inter** (UI body), **JetBrains
    Mono** (editor).
  - Rounded panels/tabs, soft depth, the Splec "S" mark + wordmark.
- **Light / Dark / System theming.** Light is the default; dark uses the
  `#06070d` Splec canvas. Your choice is persisted via `tauri-plugin-store` and
  survives restarts.
- **Plugins wired:** `store`, `window-state`, `fs`, `dialog` (with capability
  permissions in `src-tauri/capabilities/default.json`).

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| New note | `Cmd/Ctrl-T` or `Cmd/Ctrl-N` |
| Open file(s) | `Cmd/Ctrl-O` |
| Save / Save As | `Cmd/Ctrl-S` / `Cmd/Ctrl-Shift-S` |
| Close tab (guarded) | `Cmd/Ctrl-W` |
| Cycle tabs | `Cmd/Ctrl-Tab` / `Cmd/Ctrl-Shift-Tab` |
| New (clean) window | `Cmd/Ctrl-Shift-N` |
| Preferences | `Cmd/Ctrl-,` |

## Prerequisites

- **Node.js 20+** (or 22). A `.nvmrc` is provided at the repo root.
- **Rust** (stable) with Cargo — https://rustup.rs
- **macOS:** an Xcode / Command Line Tools toolchain whose license has been
  accepted. If `npm run tauri dev` fails with *"You have not agreed to the Xcode
  license agreements"*, run one of:
  ```bash
  sudo xcodebuild -license accept          # if full Xcode is installed
  xcode-select --install                    # to (re)install Command Line Tools
  ```
- **Windows (future target):** the MSVC build tools / WebView2 (configuration is
  already present in `tauri.conf.json`, including the `.ico` and NSIS settings).

## Develop

```bash
cd splec-note
npm install
npm run tauri dev      # launches the desktop app with hot-reload
```

The frontend dev server runs on `http://localhost:1420`. You can also run just
the web UI in a browser with `npm run dev` (Tauri-only features degrade
gracefully — e.g. theme persistence falls back to `localStorage`).

## Build

```bash
npm run build          # type-check + bundle the frontend (dist/)
npm run tauri build    # produce platform installers (.app/.dmg on macOS)
```

## Branding & icons

Brand sources live in [`../branding/`](../branding):

- `splec-mark.svg` — the recreated Splec "S" (script S + purple→periwinkle
  gradient on a `#10131f → #06070d` rounded tile).
- `splec-mark-bare.svg` — the gradient "S" without the tile (used in-app).
- `source-assets/` — the original assets downloaded from splecdevelopers.com.

Regenerate the full app icon set (`.icns`, `.ico`, PNGs) after editing the mark:

```bash
# Render the SVG to a 1024px PNG, then let Tauri build every size.
npx tauri icon ../branding/splec-icon-1024.png
```

## Project layout

```
splec-note/
├─ index.html              # app shell (titlebar, tabstrip, editor, statusbar, modals)
├─ src/
│  ├─ main.ts              # SplecApp orchestrator: buffers, tabs, chrome, shortcuts
│  ├─ editorHost.ts        # one CodeMirror view + per-buffer state; brand syntax themes
│  ├─ buffers.ts           # Buffer model + BufferStore (ordering, active tab)
│  ├─ tabs.ts              # tab strip rendering (dirty dot, close, drag-reorder)
│  ├─ fileops.ts           # New/Open/Save/Save As/Close + unsaved-changes guard
│  ├─ session.ts           # autosave debounce/flush, restore-on-launch, reconcile
│  ├─ backend.ts           # typed wrappers around the Rust commands + dialogs
│  ├─ languages.ts         # lazy-loaded language packs + extension detection
│  ├─ statusbar.ts         # line/col, language, encoding, EOL, word/char counts
│  ├─ emptystate.ts        # branded start screen (New Note / Open / recent)
│  ├─ prefs.ts             # preferences (font size, tab size, wrap, default lang)
│  ├─ recent.ts            # recent-files list (persisted)
│  ├─ theme.ts             # Light/Dark/System modes, persisted via plugin-store
│  ├─ styles.css           # design tokens + app chrome (both themes)
│  ├─ fonts.css            # @font-face for the bundled fonts
│  └─ assets/fonts/        # locally bundled woff2 files
├─ src-tauri/
│  ├─ src/lib.rs           # Tauri builder + plugin & command registration
│  ├─ src/session.rs       # session/backup engine (atomic IO + unit tests)
│  ├─ tauri.conf.json      # app config, bundle targets (mac + win), icons
│  ├─ capabilities/        # permission grants for the main window
│  └─ icons/               # generated icon set
└─ NOTICE                  # font + icon attributions
```

## Session persistence (on-disk layout)

Everything lives under the OS app-data dir for `com.splec.note`
(macOS: `~/Library/Application Support/com.splec.note/`):

```
com.splec.note/
├─ session.json                       # ordered manifest of open tabs (+ active id)
└─ AutoSave/
   └─ YYYY-MM-DD/                      # dated subfolders, like Notepad++/CongaCode
      ├─ <buffer-id>.txt              # live mirror of one buffer (named OR untitled)
      └─ …
```

- The frontend owns the manifest *shape*; the Rust backend treats it as opaque
  JSON, so the two stay decoupled. Each manifest tab records: real path (or
  `null` for untitled), backup path, language, encoding, EOL, dirty flag, cursor
  & selection offsets, and scroll position.
- **Autosave** debounces ~500 ms after edits and also flushes on tab switch,
  window blur, visibility change, and app quit (the close request is intercepted
  to force a final flush). **All backend writes are atomic** (temp file +
  rename), so a crash mid-write can't corrupt a backup.
- **Restore-on-launch** rebuilds every tab from the manifest + backups —
  including untitled buffers that were never saved — restoring cursor/scroll and
  reselecting the previously active tab. `File ▸ New Window` (`Cmd-Shift-N`)
  opens a clean window that skips restore (`?new=1`).
- **External-change detection:** on launch, real files whose on-disk mtime
  changed since last edit prompt *reload vs. keep your editor copy* — never a
  silent discard. A retention policy (default 14 days) prunes old untitled
  backups so storage doesn't grow unbounded.

## License

MIT for the application code. Bundled fonts are under the SIL Open Font License
1.1 and Lucide icons under ISC — see [`NOTICE`](./NOTICE). The Splec mark and
wordmarks are brand assets of Splec Developers.
