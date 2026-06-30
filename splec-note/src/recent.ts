// Recent files list, persisted via tauri-plugin-store (localStorage fallback).

import { load, type Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "splec-settings.json";
const RECENT_KEY = "recentFiles";
const MAX_RECENT = 12;

let storePromise: Promise<Store> | null = null;

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

async function getStore(): Promise<Store | null> {
  if (!isTauri()) return null;
  if (!storePromise) storePromise = load(STORE_FILE, { defaults: {}, autoSave: true });
  try {
    return await storePromise;
  } catch {
    return null;
  }
}

export async function loadRecent(): Promise<string[]> {
  try {
    const store = await getStore();
    if (store) {
      const list = await store.get<string[]>(RECENT_KEY);
      return Array.isArray(list) ? list.slice(0, MAX_RECENT) : [];
    }
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) return (JSON.parse(raw) as string[]).slice(0, MAX_RECENT);
    }
  } catch {
    /* fall through */
  }
  return [];
}

async function persist(list: string[]): Promise<void> {
  try {
    const store = await getStore();
    if (store) {
      await store.set(RECENT_KEY, list);
      await store.save();
      return;
    }
  } catch {
    /* fall back */
  }
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export async function addRecent(path: string): Promise<string[]> {
  const current = await loadRecent();
  const next = [path, ...current.filter((p) => p !== path)].slice(0, MAX_RECENT);
  await persist(next);
  return next;
}

export async function clearRecent(): Promise<void> {
  await persist([]);
}
