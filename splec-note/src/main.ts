// Splec Note — frontend entry point (Phase 1 + 2).
// Owns the editor host, the buffer store, preferences and the session engine,
// and wires the tab strip, status bar, menu, keyboard shortcuts and empty state.

import "./styles.css";
import {
  AppWindow,
  FilePlus,
  FileX,
  FolderOpen,
  Menu,
  Monitor,
  Moon,
  Redo2,
  Save,
  SaveAll,
  Settings,
  Sun,
  Undo2,
  createElement,
  type IconNode,
} from "lucide";
import { redo, undo } from "@codemirror/commands";
import { EditorHost, countText } from "./editorHost";
import {
  BufferStore,
  baseName,
  newId,
  nextUntitledTitle,
  type Buffer,
} from "./buffers";
import {
  PICKER_ORDER,
  languageLabel,
  loadLanguageExtension,
} from "./languages";
import { StatusBar } from "./statusbar";
import { renderTabs } from "./tabs";
import { renderEmptyState } from "./emptystate";
import { loadPrefs, savePrefs, type Prefs } from "./prefs";
import { loadRecent } from "./recent";
import { isAutostartEnabled, setAutostart } from "./backend";
import { FileOps } from "./fileops";
import { SessionManager } from "./session";
import {
  applyTheme,
  loadThemeMode,
  nextMode,
  saveThemeMode,
  watchSystemTheme,
  type ResolvedTheme,
  type ThemeMode,
} from "./theme";

const THEME_META: Record<ThemeMode, { label: string; icon: typeof Sun }> = {
  light: { label: "Light", icon: Sun },
  dark: { label: "Dark", icon: Moon },
  system: { label: "System", icon: Monitor },
};

export interface NewBufferOptions {
  id?: string;
  path?: string | null;
  title?: string;
  language?: string;
  content?: string;
  eol?: "LF" | "CRLF";
  dirty?: boolean;
  cursor?: { anchor: number; head: number };
  scrollTop?: number;
  diskMtimeMs?: number | null;
  diskSize?: number | null;
  backup?: string | null;
}

export class SplecApp {
  readonly store = new BufferStore();
  host!: EditorHost;
  prefs!: Prefs;
  statusBar!: StatusBar;
  fileOps!: FileOps;
  session!: SessionManager;
  recent: string[] = [];

  private mode: ThemeMode = "light";
  private editorEl = document.querySelector<HTMLElement>("#editor")!;
  private emptyEl = document.querySelector<HTMLElement>("#empty-state")!;
  private tabstripEl = document.querySelector<HTMLElement>("#tabstrip")!;

  async init(): Promise<void> {
    this.mode = await loadThemeMode();
    const resolved = applyTheme(this.mode);
    this.prefs = await loadPrefs();
    this.recent = await loadRecent();

    this.host = new EditorHost(this.editorEl, {
      theme: resolved,
      wrap: this.prefs.wordWrap,
      tabSize: this.prefs.tabSize,
      fontSize: this.prefs.fontSize,
      callbacks: {
        onDocChanged: () => this.handleDocChanged(),
        onSelectionChanged: () => this.refreshStatus(),
        onScroll: (top) => this.handleScroll(top),
      },
    });

    this.statusBar = new StatusBar({
      onLanguageChange: (id) => void this.setActiveLanguage(id),
      onEolToggle: () => this.toggleEol(),
      onWrapToggle: () => this.toggleWrap(),
    });

    this.fileOps = new FileOps(this);
    this.session = new SessionManager(this);

    this.renderThemeButton(this.mode);
    this.renderToolbarIcons();
    this.wireChrome();
    this.wireKeyboard();
    this.wirePrefsModal();

    // Restore previous session unless launched as a clean window or disabled.
    const cleanWindow = new URLSearchParams(location.search).get("new") === "1";
    let restored = false;
    if (!cleanWindow && this.prefs.restoreSession) {
      restored = await this.session.restore();
    }
    if (!restored && this.store.count() === 0) {
      this.newBuffer();
    }

    this.session.startAutosaveLifecycle();
    void this.session.cleanup();

    watchSystemTheme(
      () => this.mode,
      (sys) => this.setMode("system", sys),
    );
  }

  // ---- Buffer lifecycle ----------------------------------------------------

  makeBuffer(opts: NewBufferOptions): Buffer {
    const content = opts.content ?? "";
    const buf: Buffer = {
      id: opts.id ?? newId(),
      path: opts.path ?? null,
      title: opts.title ?? nextUntitledTitle(),
      language: opts.language ?? "plaintext",
      encoding: "UTF-8",
      eol: opts.eol ?? "LF",
      dirty: opts.dirty ?? false,
      state: this.host.createState(content, [], opts.cursor),
      scrollTop: opts.scrollTop ?? 0,
      diskMtimeMs: opts.diskMtimeMs ?? null,
      diskSize: opts.diskSize ?? null,
      backup: opts.backup ?? null,
    };
    return buf;
  }

  newBuffer(language?: string): Buffer {
    const buf = this.makeBuffer({ language: language ?? this.prefs.defaultLanguage });
    this.store.add(buf);
    void this.activate(buf.id);
    this.scheduleAutosave();
    return buf;
  }

  /** Persist the live editor state back into the active buffer. */
  syncActiveState(): void {
    const a = this.store.active();
    if (!a) return;
    a.state = this.host.view.state;
    a.scrollTop = this.host.view.scrollDOM.scrollTop;
  }

  async activate(id: string): Promise<void> {
    if (this.store.activeIdValue() === id && this.store.active()?.state) {
      this.host.focus();
      return;
    }
    this.syncActiveState();
    const buf = this.store.get(id);
    if (!buf) return;
    this.store.setActive(id);
    if (!buf.state) buf.state = this.host.createState("", []);
    const langExt = await loadLanguageExtension(buf.language);
    this.host.show(buf.state, langExt, buf.scrollTop);
    this.host.focus();
    this.refreshAll();
  }

  /**
   * Show whichever buffer is currently active in the store, with no
   * short-circuit. Used after closing the active tab: the store has already
   * moved `activeId` to a neighbour, so we must force the editor + tab strip
   * to re-render onto that buffer (plain `activate` would early-return).
   */
  async showActive(): Promise<void> {
    const buf = this.store.active();
    if (!buf) {
      this.refreshAll();
      return;
    }
    if (!buf.state) buf.state = this.host.createState("", []);
    const langExt = await loadLanguageExtension(buf.language);
    this.host.show(buf.state, langExt, buf.scrollTop);
    this.host.focus();
    this.refreshAll();
  }

  /** Live EditorState for a buffer (the active one lives in the view). */
  private liveState(buf: Buffer) {
    return this.store.activeIdValue() === buf.id ? this.host.view.state : buf.state!;
  }

  docText(buf: Buffer): string {
    return this.liveState(buf).doc.toString();
  }

  selectionOf(buf: Buffer): { anchor: number; head: number } {
    const sel = this.liveState(buf).selection.main;
    return { anchor: sel.anchor, head: sel.head };
  }

  scrollOf(buf: Buffer): number {
    return this.store.activeIdValue() === buf.id
      ? this.host.view.scrollDOM.scrollTop
      : buf.scrollTop;
  }

  async setActiveLanguage(id: string): Promise<void> {
    const buf = this.store.active();
    if (!buf) return;
    buf.language = id;
    const ext = await loadLanguageExtension(id);
    this.host.setLanguageExtension(ext);
    this.statusBar.setMessage(`Language: ${languageLabel(id)}`);
    this.scheduleAutosave();
  }

  /** Replace a buffer's content from disk (reload / external-change resolution). */
  async replaceBufferContent(
    buf: Buffer,
    content: string,
    eol: "LF" | "CRLF",
    mtime: number | null,
    size: number | null,
  ): Promise<void> {
    buf.state = this.host.createState(content, []);
    buf.eol = eol;
    buf.dirty = false;
    buf.diskMtimeMs = mtime;
    buf.diskSize = size;
    buf.scrollTop = 0;
    if (this.store.activeIdValue() === buf.id) {
      const ext = await loadLanguageExtension(buf.language);
      this.host.show(buf.state, ext, 0);
    }
    this.refreshTabs();
    this.refreshStatus();
  }

  // ---- Editor event handlers ----------------------------------------------

  private handleDocChanged(): void {
    const a = this.store.active();
    if (a && !a.dirty) {
      a.dirty = true;
      this.refreshTabs();
    }
    this.refreshStatus();
    this.scheduleAutosave();
  }

  private handleScroll(top: number): void {
    const a = this.store.active();
    if (a) a.scrollTop = top;
    this.scheduleAutosave();
  }

  // ---- Rendering -----------------------------------------------------------

  refreshAll(): void {
    this.refreshTabs();
    this.refreshStatus();
    this.refreshEmptyState();
  }

  refreshTabs(): void {
    renderTabs(this.tabstripEl, this.store, {
      onSelect: (id) => void this.activate(id),
      onClose: (id) => void this.fileOps.close(id),
      onReorder: (from, to) => {
        this.store.move(from, to);
        this.refreshTabs();
        this.scheduleAutosave();
      },
    });
  }

  refreshStatus(): void {
    const buf = this.store.active();
    if (!buf) {
      this.statusBar.setEnabled(false);
      return;
    }
    this.statusBar.setEnabled(true);
    const info = this.host.cursorInfo();
    const { words, chars } = countText(this.docText(buf));
    this.statusBar.update({
      line: info.line,
      col: info.col,
      selLen: info.selLen,
      language: buf.language,
      encoding: buf.encoding,
      eol: buf.eol,
      words,
      chars,
      wordWrap: this.prefs.wordWrap,
    });
  }

  refreshEmptyState(): void {
    const empty = this.store.count() === 0;
    this.emptyEl.hidden = !empty;
    this.editorEl.style.visibility = empty ? "hidden" : "visible";
    if (empty) {
      renderEmptyState(this.emptyEl, this.recent, {
        onNew: () => this.newBuffer(),
        onOpen: () => void this.fileOps.openDialog(),
        onOpenRecent: (p) => void this.fileOps.openPath(p),
      });
    }
  }

  async refreshRecent(): Promise<void> {
    this.recent = await loadRecent();
    this.renderMenuRecent();
    if (this.store.count() === 0) this.refreshEmptyState();
  }

  setMessage(text: string): void {
    this.statusBar.setMessage(text);
  }

  scheduleAutosave(): void {
    this.session?.scheduleAutosave();
  }

  // ---- Preferences ---------------------------------------------------------

  toggleWrap(): void {
    this.prefs.wordWrap = !this.prefs.wordWrap;
    this.host.setWrap(this.prefs.wordWrap);
    this.refreshStatus();
    void savePrefs(this.prefs);
  }

  toggleEol(): void {
    const buf = this.store.active();
    if (!buf) return;
    buf.eol = buf.eol === "LF" ? "CRLF" : "LF";
    buf.dirty = true;
    this.refreshTabs();
    this.refreshStatus();
    this.scheduleAutosave();
  }

  applyPrefs(next: Prefs): void {
    this.prefs = next;
    this.host.setFontSize(next.fontSize);
    this.host.setTabSize(next.tabSize);
    this.host.setWrap(next.wordWrap);
    this.refreshStatus();
    void savePrefs(next);
  }

  // ---- Theme ---------------------------------------------------------------

  private setMode(mode: ThemeMode, resolvedHint?: ResolvedTheme): void {
    this.mode = mode;
    const resolved = resolvedHint ?? applyTheme(mode);
    if (resolvedHint) applyTheme(mode);
    this.host.setTheme(resolved);
    this.renderThemeButton(mode);
  }

  private renderThemeButton(mode: ThemeMode): void {
    const slot = document.querySelector<HTMLElement>("#theme-toggle .icon-slot");
    const button = document.querySelector<HTMLButtonElement>("#theme-toggle");
    const meta = THEME_META[mode];
    if (slot) slot.replaceChildren(createElement(meta.icon));
    if (button) {
      const tip = `Theme: ${meta.label} — click for ${THEME_META[nextMode(mode)].label}`;
      button.setAttribute("aria-label", tip);
      button.setAttribute("title", tip);
    }
    // Keep the Preferences segmented control in sync if it's mounted.
    document.querySelectorAll<HTMLButtonElement>("#pref-theme .seg").forEach((seg) => {
      const on = seg.dataset.mode === mode;
      seg.classList.toggle("is-active", on);
      seg.setAttribute("aria-checked", String(on));
    });
  }

  private renderToolbarIcons(): void {
    const ico = (sel: string, icon: IconNode) => {
      const el = document.querySelector<HTMLButtonElement>(sel);
      if (el) el.replaceChildren(createElement(icon));
    };
    ico("#act-new", FilePlus);
    ico("#act-open", FolderOpen);
    ico("#act-save", Save);
    ico("#act-saveas", SaveAll);
    ico("#act-close", FileX);
    ico("#act-undo", Undo2);
    ico("#act-redo", Redo2);
    ico("#act-newwin", AppWindow);

    const menuSlot = document.querySelector<HTMLElement>("#menu-toggle .icon-slot");
    if (menuSlot) menuSlot.replaceChildren(createElement(Menu));
    const settingsSlot = document.querySelector<HTMLElement>("#settings-toggle .icon-slot");
    if (settingsSlot) settingsSlot.replaceChildren(createElement(Settings));
  }

  // ---- Chrome wiring -------------------------------------------------------

  private wireChrome(): void {
    document.querySelector("#theme-toggle")?.addEventListener("click", () => {
      this.chooseMode(nextMode(this.mode));
    });

    document.querySelector("#act-new")?.addEventListener("click", () => this.newBuffer());
    document.querySelector("#act-open")?.addEventListener("click", () => void this.fileOps.openDialog());
    document.querySelector("#act-save")?.addEventListener("click", () => void this.fileOps.save());
    document.querySelector("#act-saveas")?.addEventListener("click", () => void this.fileOps.saveAs());
    document.querySelector("#act-close")?.addEventListener("click", () => {
      const a = this.store.active();
      if (a) void this.fileOps.close(a.id);
    });
    document.querySelector("#act-undo")?.addEventListener("click", () => {
      undo(this.host.view);
      this.host.focus();
    });
    document.querySelector("#act-redo")?.addEventListener("click", () => {
      redo(this.host.view);
      this.host.focus();
    });
    document.querySelector("#act-newwin")?.addEventListener("click", () => void this.session.openCleanWindow());
    document.querySelector("#tab-new")?.addEventListener("click", () => this.newBuffer());
    document.querySelector("#settings-toggle")?.addEventListener("click", () => this.openPrefs());

    this.wireMenu();
  }

  private chooseMode(mode: ThemeMode): void {
    this.setMode(mode);
    void saveThemeMode(mode);
  }

  private wireMenu(): void {
    const toggle = document.querySelector<HTMLButtonElement>("#menu-toggle");
    const menu = document.querySelector<HTMLElement>("#app-menu");
    if (!toggle || !menu) return;

    const closeMenu = () => {
      menu.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    };
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      if (open) this.renderMenuRecent();
    });
    document.addEventListener("click", () => closeMenu());
    menu.addEventListener("click", (e) => e.stopPropagation());

    menu.querySelectorAll<HTMLButtonElement>(".menu-item[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        closeMenu();
        this.runMenuAction(btn.dataset.act!);
      });
    });
  }

  private runMenuAction(act: string): void {
    switch (act) {
      case "new": this.newBuffer(); break;
      case "open": void this.fileOps.openDialog(); break;
      case "save": void this.fileOps.save(); break;
      case "saveAs": void this.fileOps.saveAs(); break;
      case "close": {
        const a = this.store.active();
        if (a) void this.fileOps.close(a.id);
        break;
      }
      case "newWindow": void this.session.openCleanWindow(); break;
      case "prefs": this.openPrefs(); break;
    }
  }

  private renderMenuRecent(): void {
    const wrap = document.querySelector<HTMLElement>("#menu-recent");
    if (!wrap) return;
    wrap.replaceChildren();
    if (this.recent.length === 0) {
      const empty = document.createElement("div");
      empty.className = "menu-empty";
      empty.textContent = "No recent files";
      wrap.append(empty);
      return;
    }
    for (const path of this.recent) {
      const item = document.createElement("button");
      item.className = "menu-item menu-recent-item";
      item.type = "button";
      item.title = path;
      item.textContent = baseName(path);
      item.addEventListener("click", () => {
        document.querySelector<HTMLElement>("#app-menu")!.hidden = true;
        void this.fileOps.openPath(path);
      });
      wrap.append(item);
    }
  }

  // ---- Preferences modal ---------------------------------------------------

  private wirePrefsModal(): void {
    const langSel = document.querySelector<HTMLSelectElement>("#pref-lang");
    if (langSel && langSel.options.length === 0) {
      for (const id of PICKER_ORDER) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = languageLabel(id);
        langSel.append(opt);
      }
    }
    document.querySelector("#prefs-close")?.addEventListener("click", () => this.closePrefs());
    document.querySelector("#prefs-overlay")?.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) this.closePrefs();
    });

    // Appearance — theme segmented control.
    document.querySelectorAll<HTMLButtonElement>("#pref-theme .seg").forEach((seg) => {
      seg.addEventListener("click", () => {
        const mode = seg.dataset.mode as ThemeMode;
        if (mode) this.chooseMode(mode);
      });
    });

    const font = document.querySelector<HTMLInputElement>("#pref-font");
    const tab = document.querySelector<HTMLSelectElement>("#pref-tab");
    const wrap = document.querySelector<HTMLInputElement>("#pref-wrap");
    const restore = document.querySelector<HTMLInputElement>("#pref-restore");
    const autosave = document.querySelector<HTMLInputElement>("#pref-autosave");
    const apply = () => {
      this.applyPrefs({
        ...this.prefs,
        fontSize: Number(font?.value ?? this.prefs.fontSize),
        tabSize: Number(tab?.value ?? this.prefs.tabSize),
        wordWrap: Boolean(wrap?.checked),
        defaultLanguage: langSel?.value ?? this.prefs.defaultLanguage,
        restoreSession: restore ? restore.checked : this.prefs.restoreSession,
        autosave: autosave ? autosave.checked : this.prefs.autosave,
      });
    };
    font?.addEventListener("change", apply);
    tab?.addEventListener("change", apply);
    wrap?.addEventListener("change", apply);
    langSel?.addEventListener("change", apply);
    restore?.addEventListener("change", apply);
    autosave?.addEventListener("change", apply);

    // Open at login is handled by the OS via the autostart plugin; reflect the
    // real resulting state back into the checkbox.
    const login = document.querySelector<HTMLInputElement>("#pref-login");
    login?.addEventListener("change", () => {
      void (async () => {
        const result = await setAutostart(login.checked);
        login.checked = result;
        this.applyPrefs({ ...this.prefs, openAtLogin: result });
      })();
    });
  }

  private openPrefs(): void {
    const overlay = document.querySelector<HTMLElement>("#prefs-overlay");
    if (!overlay) return;
    document.querySelector<HTMLInputElement>("#pref-font")!.value = String(this.prefs.fontSize);
    document.querySelector<HTMLSelectElement>("#pref-tab")!.value = String(this.prefs.tabSize);
    document.querySelector<HTMLInputElement>("#pref-wrap")!.checked = this.prefs.wordWrap;
    document.querySelector<HTMLSelectElement>("#pref-lang")!.value = this.prefs.defaultLanguage;
    document.querySelector<HTMLInputElement>("#pref-restore")!.checked = this.prefs.restoreSession;
    document.querySelector<HTMLInputElement>("#pref-autosave")!.checked = this.prefs.autosave;
    this.renderThemeButton(this.mode); // syncs the segmented control
    overlay.hidden = false;
    // Reflect the OS-level autostart state (may differ from saved pref).
    void (async () => {
      const login = document.querySelector<HTMLInputElement>("#pref-login");
      if (login) login.checked = await isAutostartEnabled();
    })();
  }

  private closePrefs(): void {
    const overlay = document.querySelector<HTMLElement>("#prefs-overlay");
    if (overlay) overlay.hidden = true;
    this.host.focus();
  }

  // ---- Keyboard ------------------------------------------------------------

  private wireKeyboard(): void {
    window.addEventListener("keydown", (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      if (e.key === "Tab") {
        e.preventDefault();
        const id = this.store.cycle(e.shiftKey ? -1 : 1);
        if (id) void this.activate(id);
      } else if (key === "t" && !e.shiftKey) {
        e.preventDefault();
        this.newBuffer();
      } else if (key === "n" && e.shiftKey) {
        e.preventDefault();
        void this.session.openCleanWindow();
      } else if (key === "n") {
        e.preventDefault();
        this.newBuffer();
      } else if (key === "o") {
        e.preventDefault();
        void this.fileOps.openDialog();
      } else if (key === "s" && e.shiftKey) {
        e.preventDefault();
        void this.fileOps.saveAs();
      } else if (key === "s") {
        e.preventDefault();
        void this.fileOps.save();
      } else if (key === "w") {
        e.preventDefault();
        const a = this.store.active();
        if (a) void this.fileOps.close(a.id);
      } else if (key === ",") {
        e.preventDefault();
        this.openPrefs();
      }
    });
  }
}

const app = new SplecApp();
window.addEventListener("DOMContentLoaded", () => {
  void app.init();
});
