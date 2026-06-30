# Splec Note

A lightweight, distinctive cross-platform text & code editor — great for **both
note-taking and coding**. Built with **Tauri 2** (Rust + web), **TypeScript +
Vite**, and the **CodeMirror 6** editor engine.

> **Splec Note — v0.1.0.** A fast, friendly-premium editor with a tabbed
> multi-document UI, a "never lose work" session-persistence engine,
> find/replace + find-in-files, Notepad++-style editing power tools, broad
> language support with custom (UDL) highlighting, themes, split view, a
> command palette, macros, a sandboxed plugin system, large-file mode, and
> macOS packaging with auto-update wiring.

<p>
  <img src="branding/source-assets/apple-touch-icon.png" width="72" alt="Splec mark" />
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
- **Compact icon toolbar** (Notepad++-style): New, Open, Save, Save As, Close,
  Undo, Redo and New Window as tightly-grouped icon buttons with tooltips.
- **Native-style Preferences panel** (persisted), grouped into sections:
  - *Appearance* — Light / Dark / System theme (segmented control).
  - *Editor* — font size, tab size, word wrap, default new-file language.
  - *Session* — reopen unsaved items on launch, autosave on/off.
  - *General* — open at login (via `tauri-plugin-autostart`).
  Light mode stays the default.
- **Deliberate Splec design system** — not a generic VS Code clone:
  - Brand purple `#7c5cff`, periwinkle `#9db4ff`, dark canvas `#06070d`.
  - Bundled fonts (no hot-linking): **Dancing Script** (the *Splec* logotype),
    **Space Grotesk** (display/UI headings), **Inter** (UI body), **JetBrains
    Mono** (editor).
  - Rounded panels/tabs, soft depth, and the *Splec Note* wordmark in the
    header (the script-"S" mark lives in the app icon and start screen).
- **Light / Dark / System theming.** Light is the default; dark uses the
  `#06070d` Splec canvas. Your choice is persisted via `tauri-plugin-store` and
  survives restarts.
- **Plugins wired:** `store`, `window-state`, `fs`, `dialog`, `autostart`,
  `updater`, `process` (with capability permissions in
  `src-tauri/capabilities/default.json`).

## More features

- **Find / Replace / Navigate.** Styled find & replace (regex, case, whole-word,
  in-selection, wrap) with live match counts; **Find in Files** across a folder
  (ignores `node_modules`/`.git`, glob filter, click-to-open); Go to Line,
  bookmarks, brace match/jump, and multi-cursor (`Cmd-D` / select-all-occurrences).
- **Editing power tools (Notepad++ parity).** Column/rectangular selection with
  multi-caret typing; encoding detect/convert (UTF-8, UTF-8-BOM, UTF-16 LE/BE,
  done in the Rust backend); EOL detect/convert (LF/CRLF/CR); show whitespace,
  indent guides, code folding, language-aware comment toggle; and text transforms
  (case, sort lines, trim, join, duplicate/move lines, indent/outdent).
- **Languages & themes.** 20+ lazy-loaded CodeMirror language packs with a
  keyword/comment/string fallback so nothing renders plain; **User-Defined
  Languages** (custom keywords + comment/string delimiters, persisted); multiple
  editor themes (Splec Light/Dark, high-contrast, sepia) chosen independently of
  the app chrome, plus simple JSON theme import.
- **Panels & layout.** A function/symbol outline (headings for Markdown,
  functions/classes for code) with click-to-jump; a minimap; **split view**
  (side-by-side / stacked, clone-to-other-view) that survives quit+relaunch;
  and a distraction-free full-screen mode.
- **Command palette** (`Cmd-Shift-P`) listing every command, including plugin and
  macro commands.
- **Macros.** Record → stop → play (play N times / run to end of file), name and
  save macros with shortcuts, all persisted; recording ignores autosave noise.
- **Plugin system.** A conservative host API (no fs/network) for first-party
  bundled plugins, **plus an isolated `<iframe sandbox>` boundary for untrusted
  plugins** (postMessage bridge only — no DOM/host/Tauri access). Sample plugins:
  Word Count panel, JSON Tools, and a sandboxed Text Kit. See
  [`PLUGINS.md`](./PLUGINS.md).
- **Large-file mode.** Documents over ~2 MB disable the minimap, syntax
  highlighting and heavy decorations so they open and scroll smoothly; autosave
  skips backing up buffers over 25 MB (named files are already safe on disk).
- **Native macOS menu bar** (App/File/Edit/Find/View/Macros/Plugins/Window/Help)
  wired to the same commands, an About window, file associations, and
  **auto-update** wiring via `tauri-plugin-updater` (see
  [`RELEASING.md`](./RELEASING.md)).

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| New note | `Cmd/Ctrl-T` or `Cmd/Ctrl-N` |
| Open file(s) | `Cmd/Ctrl-O` |
| Save / Save As | `Cmd/Ctrl-S` / `Cmd/Ctrl-Shift-S` |
| Close tab (guarded) | `Cmd/Ctrl-W` |
| Cycle tabs | `Cmd/Ctrl-Tab` / `Cmd/Ctrl-Shift-Tab` |
| New (clean) window | `Cmd/Ctrl-Shift-N` |
| Select all | `Cmd/Ctrl-A` |
| Undo / Redo | `Cmd/Ctrl-Z` / `Cmd/Ctrl-Shift-Z` |
| Find / Replace | `Cmd/Ctrl-F` / `Cmd/Ctrl-H` |
| Find next / previous | `Enter` / `Shift-Enter` (in find) |
| Go to line | `Cmd/Ctrl-G` |
| Toggle bookmark / next / prev | `Cmd/Ctrl-B` / `F2` / `Shift-F2` |
| Select next occurrence | `Cmd/Ctrl-D` |
| Select all occurrences | `Cmd/Ctrl-Shift-L` |
| Toggle line comment | `Cmd/Ctrl-/` |
| Jump to matching bracket | `Cmd/Ctrl-Shift-\` |
| Command palette | `Cmd/Ctrl-Shift-P` |
| Record / stop macro | `Cmd/Ctrl-Shift-R` |
| Play saved macro 1–9 | `Cmd/Ctrl-Shift-<n>` |
| Distraction-free (zen) | `Cmd/Ctrl-Ctrl-F` |
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
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests
```

> The `.app` bundle and Rust binary build with a plain Command-Line-Tools
> toolchain. Producing the **`.dmg`** additionally needs an interactive GUI
> (WindowServer) session for its Finder-window layout step, and shipping needs
> Apple signing/notarization credentials — see [`RELEASING.md`](./RELEASING.md).

## Branding & icons

Brand sources live in [`branding/`](./branding):

- `splec-mark.svg` — the recreated Splec "S" (script S + purple→periwinkle
  gradient on a `#10131f → #06070d` rounded tile).
- `splec-mark-bare.svg` — the gradient "S" without the tile (used in-app).
- `source-assets/` — the original assets downloaded from splecdevelopers.com.

Regenerate the full app icon set (`.icns`, `.ico`, PNGs) after editing the mark:

```bash
# Render the SVG to a 1024px PNG, then let Tauri build every size.
npx tauri icon branding/splec-icon-1024.png
```

## Project layout

```
index.html              # app shell (titlebar, tabstrip, editor, statusbar, modals)
src/
├─ main.ts              # SplecApp orchestrator: buffers, tabs, chrome, shortcuts
├─ editorHost.ts        # one CodeMirror view + per-buffer state; large-file mode
├─ buffers.ts           # Buffer model + BufferStore (ordering, active tab)
├─ tabs.ts              # tab strip rendering (dirty dot, close, drag-reorder)
├─ fileops.ts           # New/Open/Save/Save As/Close + unsaved-changes guard
├─ session.ts           # autosave debounce/flush, restore-on-launch, reconcile
├─ findController.ts     # styled find/replace panel
├─ findInFiles.ts        # find-in-files results panel
├─ transforms.ts        # comment toggle, brace jump, text transforms
├─ bookmarks.ts         # bookmark gutter + jump
├─ macros.ts            # record/play/save macros
├─ plugins/             # host API, manager, iframe sandbox, sample plugins
├─ languages.ts         # lazy-loaded language packs + extension detection
├─ udl.ts               # user-defined language highlighting
├─ themes.ts            # editor themes (independent of app chrome)
├─ split.ts             # split-view layout
├─ outline.ts           # function/symbol list + minimap
├─ commandPalette.ts    # command palette
└─ assets/fonts/        # locally bundled woff2 files
src-tauri/
├─ src/lib.rs           # Tauri builder + plugin & command registration
├─ src/session.rs       # session/backup engine (atomic IO + unit tests)
├─ src/search.rs        # find-in-files backend
├─ src/menu.rs          # native macOS menu bar
├─ tauri.conf.json      # app config, bundle targets, icons, file assoc, updater
├─ capabilities/        # permission grants for the main window
└─ icons/               # generated icon set
.github/workflows/ci.yml  # macOS + Windows build/test CI
NOTICE                  # font + icon attributions
PLUGINS.md              # plugin API + security model
RELEASING.md            # signing, notarization & auto-update release flow
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
