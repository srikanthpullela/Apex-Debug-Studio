// Typed bridge to the Rust backend commands + native dialogs.
// Everything degrades gracefully when running outside Tauri (plain `vite`).

import { invoke } from "@tauri-apps/api/core";

export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

export interface FileRead {
  content: string;
  eol: string;
  mtime_ms: number | null;
  size: number;
}
export interface FileStat {
  exists: boolean;
  mtime_ms: number | null;
  size: number;
}
export interface WriteResult {
  mtime_ms: number | null;
  size: number;
}
export interface RestoredSession {
  manifest: SessionManifest;
  contents: Record<string, string>;
}

export interface ManifestTab {
  id: string;
  path: string | null;
  title: string;
  language: string;
  encoding: string;
  eol: string;
  dirty: boolean;
  backup: string | null;
  cursor: number;
  selAnchor: number;
  selHead: number;
  scrollTop: number;
  diskMtimeMs: number | null;
  diskSize: number | null;
}
export interface SessionManifest {
  version: number;
  activeId: string | null;
  tabs: ManifestTab[];
}

export async function readTextFile(path: string): Promise<FileRead> {
  return invoke<FileRead>("read_text_file", { path });
}
export async function writeTextFile(
  path: string,
  content: string,
  eol: string,
): Promise<WriteResult> {
  return invoke<WriteResult>("write_text_file", { path, content, eol });
}
export async function statFile(path: string): Promise<FileStat> {
  return invoke<FileStat>("stat_file", { path });
}
export async function autosaveBackup(id: string, content: string): Promise<string> {
  return invoke<string>("autosave_backup", { id, content });
}
export async function readBackup(rel: string): Promise<string> {
  return invoke<string>("read_backup", { rel });
}
export async function deleteBackup(rel: string): Promise<void> {
  await invoke("delete_backup", { rel });
}
export async function writeSession(manifest: SessionManifest): Promise<void> {
  await invoke("write_session", { manifest });
}
export async function loadSession(): Promise<RestoredSession | null> {
  return invoke<RestoredSession | null>("load_session");
}
export async function cleanupBackups(keep: string[], retentionDays: number): Promise<number> {
  return invoke<number>("cleanup_backups", { keep, retentionDays });
}

// ---- Native dialogs (via plugin-dialog) ----------------------------------

export async function openFileDialog(): Promise<string[]> {
  if (!isTauri()) return [];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({ multiple: true, directory: false });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

export async function saveFileDialog(defaultName?: string): Promise<string | null> {
  if (!isTauri()) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  const result = await save({ defaultPath: defaultName });
  return result ?? null;
}

export async function confirmDialog(message: string, title = "Splec Note"): Promise<boolean> {
  if (!isTauri()) {
    return typeof window !== "undefined" ? window.confirm(message) : true;
  }
  const { ask } = await import("@tauri-apps/plugin-dialog");
  return ask(message, { title, kind: "warning" });
}
