// File operations: New, Open (multi-select), Save, Save As, Close — plus the
// unsaved-changes guard. Real file IO goes through the Rust backend commands.

import {
  confirmDialog,
  openFileDialog,
  readTextFile,
  saveFileDialog,
  writeTextFile,
  deleteBackup,
} from "./backend";
import { baseName } from "./buffers";
import { languageIdForFilename } from "./languages";
import { addRecent } from "./recent";
import type { SplecApp } from "./main";

export class FileOps {
  constructor(private app: SplecApp) {}

  async openDialog(): Promise<void> {
    const paths = await openFileDialog();
    for (const p of paths) await this.openPath(p);
  }

  async openPath(path: string): Promise<void> {
    // Focus an existing tab for this file instead of opening it twice.
    const existing = this.app.store.list().find((b) => b.path === path);
    if (existing) {
      await this.app.activate(existing.id);
      return;
    }
    try {
      const read = await readTextFile(path);
      const language = languageIdForFilename(baseName(path));
      const buf = this.app.makeBuffer({
        path,
        title: baseName(path),
        language,
        content: read.content,
        eol: read.eol === "CRLF" ? "CRLF" : "LF",
        dirty: false,
        diskMtimeMs: read.mtime_ms,
        diskSize: read.size,
      });
      this.app.store.add(buf);
      await this.app.activate(buf.id);
      this.app.recent = await addRecent(path);
      void this.app.refreshRecent();
      this.app.setMessage(`Opened ${baseName(path)}`);
      this.app.scheduleAutosave();
    } catch (err) {
      this.app.setMessage(`Could not open ${baseName(path)}: ${String(err)}`);
    }
  }

  async save(id?: string): Promise<boolean> {
    const buf = id ? this.app.store.get(id) : this.app.store.active();
    if (!buf) return false;
    if (!buf.path) return this.saveAs(buf.id);
    this.app.syncActiveState();
    try {
      const res = await writeTextFile(buf.path, this.app.docText(buf), buf.eol);
      buf.dirty = false;
      buf.diskMtimeMs = res.mtime_ms;
      buf.diskSize = res.size;
      this.app.refreshTabs();
      this.app.refreshStatus();
      this.app.setMessage(`Saved ${buf.title}`);
      this.app.scheduleAutosave();
      return true;
    } catch (err) {
      this.app.setMessage(`Save failed: ${String(err)}`);
      return false;
    }
  }

  async saveAs(id?: string): Promise<boolean> {
    const buf = id ? this.app.store.get(id) : this.app.store.active();
    if (!buf) return false;
    const target = await saveFileDialog(buf.title);
    if (!target) return false;
    this.app.syncActiveState();
    try {
      const res = await writeTextFile(target, this.app.docText(buf), buf.eol);
      buf.path = target;
      buf.title = baseName(target);
      buf.language = languageIdForFilename(buf.title);
      buf.dirty = false;
      buf.diskMtimeMs = res.mtime_ms;
      buf.diskSize = res.size;
      // Reapply language to the live editor if this is the active buffer.
      if (this.app.store.activeIdValue() === buf.id) {
        await this.app.setActiveLanguage(buf.language);
      }
      this.app.recent = await addRecent(target);
      void this.app.refreshRecent();
      this.app.refreshTabs();
      this.app.refreshStatus();
      this.app.setMessage(`Saved ${buf.title}`);
      this.app.scheduleAutosave();
      return true;
    } catch (err) {
      this.app.setMessage(`Save failed: ${String(err)}`);
      return false;
    }
  }

  async close(id: string): Promise<void> {
    const buf = this.app.store.get(id);
    if (!buf) return;
    if (buf.dirty) {
      const ok = await confirmDialog(
        `"${buf.title}" has unsaved changes. Close without saving?`,
      );
      if (!ok) return;
    }
    const backup = buf.backup;
    this.app.store.remove(id);
    if (backup) void deleteBackup(backup).catch(() => {});

    const nextActive = this.app.store.activeIdValue();
    if (nextActive) {
      await this.app.activate(nextActive);
    } else {
      this.app.refreshAll();
    }
    this.app.scheduleAutosave();
  }
}
