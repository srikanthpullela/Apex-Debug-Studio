// Untrusted plugin isolation boundary.
//
// Third-party plugin code runs inside a sandboxed `<iframe sandbox="allow-scripts">`.
// Because the iframe has NO `allow-same-origin`, it loads in an opaque ("null")
// origin: the plugin cannot reach `parent.document`, parent globals, the Tauri
// IPC bridge (`__TAURI_INTERNALS__`), cookies, or localStorage of the host. The
// ONLY channel is `postMessage`, brokered here against a minimal, explicit host
// API. This is the hard boundary for untrusted plugins (first-party bundled
// plugins use the in-realm manager instead). See PLUGINS.md.

import type { SelectionInfo } from "./api";

/** App-side primitives a sandboxed plugin may reach (via postMessage only). */
export interface SandboxBridge {
  getActiveText(): string;
  setActiveText(text: string): void;
  getSelection(): SelectionInfo;
  replaceSelection(text: string): void;
  notify(msg: string): void;
}

export interface SandboxPluginSource {
  id: string;
  name: string;
  description: string;
  /** Plugin code, evaluated inside the sandbox with a global async `host`. */
  source: string;
}

interface SandboxCommand {
  id: string;
  title: string;
}

// Runs *inside* the sandboxed iframe. Sets up the async host shim, evaluates the
// untrusted plugin source, reports the commands it registered, and dispatches
// run requests. It also self-tests that it cannot see the parent realm.
const BOOTSTRAP = `
(function () {
  var TOKEN = null;
  var reqId = 0;
  var pending = {};
  var commands = {};

  function call(op, args) {
    return new Promise(function (resolve) {
      var id = ++reqId;
      pending[id] = resolve;
      parent.postMessage({ token: TOKEN, kind: "host-call", reqId: id, op: op, args: args || [] }, "*");
    });
  }

  var host = {
    getActiveText: function () { return call("getActiveText"); },
    setActiveText: function (t) { return call("setActiveText", [t]); },
    getSelection: function () { return call("getSelection"); },
    replaceSelection: function (t) { return call("replaceSelection", [t]); },
    notify: function (m) { return call("notify", [m]); },
    registerCommand: function (cmd) { commands[cmd.id] = cmd; },
    registerTransform: function (t) {
      commands[t.id] = {
        id: t.id, title: t.title,
        run: function () {
          var scope = t.scope || "selection";
          if (scope === "doc") {
            return host.getActiveText().then(function (text) { return host.setActiveText(t.transform(text)); });
          }
          return host.getSelection().then(function (sel) {
            if (sel && sel.text) return host.replaceSelection(t.transform(sel.text));
            return host.getActiveText().then(function (text) { return host.setActiveText(t.transform(text)); });
          });
        }
      };
    }
  };

  function canSeeParent() {
    try { return !!parent.document || !!parent.__TAURI_INTERNALS__; }
    catch (e) { return false; }
  }

  window.addEventListener("message", function (ev) {
    var d = ev.data || {};
    if (d.kind === "init") {
      TOKEN = d.token;
      try {
        // eslint-disable-next-line no-new-func
        new Function("host", d.source)(host);
      } catch (e) {
        parent.postMessage({ token: TOKEN, kind: "error", message: String(e) }, "*");
        return;
      }
      var list = Object.keys(commands).map(function (k) { return { id: commands[k].id, title: commands[k].title }; });
      parent.postMessage({ token: TOKEN, kind: "registered", commands: list, escaped: canSeeParent() }, "*");
    } else if (d.kind === "host-result") {
      var r = pending[d.reqId];
      if (r) { delete pending[d.reqId]; r(d.value); }
    } else if (d.kind === "run") {
      var c = commands[d.id];
      if (c) { try { Promise.resolve(c.run()); } catch (e) { /* ignore */ } }
    }
  });
})();
`;

let frameSeq = 0;

export class SandboxedPlugin {
  readonly meta: SandboxPluginSource;
  private bridge: SandboxBridge;
  private iframe: HTMLIFrameElement | null = null;
  private token = `splec-sbx-${++frameSeq}-${Math.random().toString(36).slice(2)}`;
  private commands: SandboxCommand[] = [];
  private onMessage: ((ev: MessageEvent) => void) | null = null;
  /** True if the sandbox self-test detected it could reach the parent realm. */
  escaped = false;

  constructor(meta: SandboxPluginSource, bridge: SandboxBridge) {
    this.meta = meta;
    this.bridge = bridge;
  }

  load(): Promise<void> {
    return new Promise((resolve) => {
      const iframe = document.createElement("iframe");
      // No `allow-same-origin` → opaque origin → no access to host realm.
      iframe.setAttribute("sandbox", "allow-scripts");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.display = "none";
      iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>${BOOTSTRAP}</script></body></html>`;
      this.iframe = iframe;

      const handler = (ev: MessageEvent) => {
        if (!this.iframe || ev.source !== this.iframe.contentWindow) return;
        const d = ev.data as Record<string, unknown>;
        if (!d || d.token !== this.token) return;
        if (d.kind === "registered") {
          this.commands = (d.commands as SandboxCommand[]) ?? [];
          this.escaped = Boolean(d.escaped);
          resolve();
        } else if (d.kind === "host-call") {
          this.serviceCall(d.reqId as number, d.op as string, (d.args as unknown[]) ?? []);
        } else if (d.kind === "error") {
          this.bridge.notify(`Plugin “${this.meta.name}” failed: ${String(d.message)}`);
          resolve();
        }
      };
      this.onMessage = handler;
      window.addEventListener("message", handler);

      iframe.addEventListener("load", () => {
        iframe.contentWindow?.postMessage(
          { kind: "init", token: this.token, source: this.meta.source },
          "*",
        );
      });
      document.body.append(iframe);
    });
  }

  private serviceCall(reqId: number, op: string, args: unknown[]): void {
    let value: unknown;
    switch (op) {
      case "getActiveText": value = this.bridge.getActiveText(); break;
      case "setActiveText": this.bridge.setActiveText(String(args[0] ?? "")); break;
      case "getSelection": value = this.bridge.getSelection(); break;
      case "replaceSelection": this.bridge.replaceSelection(String(args[0] ?? "")); break;
      case "notify": this.bridge.notify(String(args[0] ?? "")); break;
      default: break;
    }
    this.iframe?.contentWindow?.postMessage(
      { token: this.token, kind: "host-result", reqId, value },
      "*",
    );
  }

  commandEntries(): SandboxCommand[] {
    return this.commands.slice();
  }

  runCommand(id: string): void {
    this.iframe?.contentWindow?.postMessage({ token: this.token, kind: "run", id }, "*");
  }

  destroy(): void {
    if (this.onMessage) window.removeEventListener("message", this.onMessage);
    this.iframe?.remove();
    this.iframe = null;
    this.commands = [];
  }
}

export const SANDBOX_CMD_PREFIX = "sandboxcmd:";
const SANDBOX_STORE_FILE = "splec-settings.json";
const SANDBOX_STATES_KEY = "sandboxStates";

/** Manages the set of untrusted (sandboxed) plugins: load, enable/disable,
 *  command merge and manager-UI listing. Enable state persists via
 *  tauri-plugin-store (localStorage fallback), like the trusted manager. */
export class SandboxRegistry {
  private sources: SandboxPluginSource[];
  private bridge: SandboxBridge;
  private loaded = new Map<string, SandboxedPlugin>();
  private states: Record<string, boolean> = {};
  private onChange: () => void;
  private storePromise: Promise<unknown> | null = null;

  constructor(sources: SandboxPluginSource[], bridge: SandboxBridge, onChange: () => void) {
    this.sources = sources;
    this.bridge = bridge;
    this.onChange = onChange;
  }

  private static isTauri(): boolean {
    return (
      typeof window !== "undefined" &&
      ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
    );
  }

  private async getStore(): Promise<{ get: (k: string) => Promise<unknown>; set: (k: string, v: unknown) => Promise<void>; save: () => Promise<void> } | null> {
    if (!SandboxRegistry.isTauri()) return null;
    if (!this.storePromise) {
      this.storePromise = import("@tauri-apps/plugin-store").then(({ load }) =>
        load(SANDBOX_STORE_FILE, { defaults: {}, autoSave: true }),
      );
    }
    try {
      return (await this.storePromise) as never;
    } catch {
      return null;
    }
  }

  private async loadStates(): Promise<void> {
    try {
      const store = await this.getStore();
      if (store) {
        this.states = ((await store.get(SANDBOX_STATES_KEY)) as Record<string, boolean>) ?? {};
        return;
      }
    } catch {
      /* fall through */
    }
    if (typeof localStorage !== "undefined") {
      try {
        this.states = JSON.parse(localStorage.getItem(SANDBOX_STATES_KEY) ?? "{}");
      } catch {
        this.states = {};
      }
    }
  }

  private async saveStates(): Promise<void> {
    try {
      const store = await this.getStore();
      if (store) {
        await store.set(SANDBOX_STATES_KEY, this.states);
        await store.save();
        return;
      }
    } catch {
      /* fall through */
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SANDBOX_STATES_KEY, JSON.stringify(this.states));
    }
  }

  async init(): Promise<void> {
    await this.loadStates();
    for (const src of this.sources) {
      if (this.isEnabled(src.id)) await this.activate(src);
    }
  }

  isEnabled(id: string): boolean {
    return this.states[id] !== false; // default on
  }

  private async activate(src: SandboxPluginSource): Promise<void> {
    if (this.loaded.has(src.id)) return;
    const plugin = new SandboxedPlugin(src, this.bridge);
    this.loaded.set(src.id, plugin);
    await plugin.load();
    if (plugin.escaped) {
      this.bridge.notify(`Security: sandbox for “${src.name}” is not isolated; disabling.`);
      plugin.destroy();
      this.loaded.delete(src.id);
    }
  }

  async setEnabled(id: string, on: boolean): Promise<void> {
    this.states[id] = on;
    await this.saveStates();
    if (on) {
      const src = this.sources.find((s) => s.id === id);
      if (src) await this.activate(src);
    } else {
      this.loaded.get(id)?.destroy();
      this.loaded.delete(id);
    }
    this.onChange();
  }

  commandEntries(): Array<{ act: string; title: string }> {
    const out: Array<{ act: string; title: string }> = [];
    for (const [id, plugin] of this.loaded) {
      for (const c of plugin.commandEntries()) {
        out.push({ act: `${SANDBOX_CMD_PREFIX}${id}:${c.id}`, title: c.title });
      }
    }
    return out;
  }

  runCommand(fullAct: string): boolean {
    if (!fullAct.startsWith(SANDBOX_CMD_PREFIX)) return false;
    const rest = fullAct.slice(SANDBOX_CMD_PREFIX.length);
    const sep = rest.indexOf(":");
    if (sep < 0) return false;
    const pluginId = rest.slice(0, sep);
    const cmdId = rest.slice(sep + 1);
    const plugin = this.loaded.get(pluginId);
    if (!plugin) return false;
    plugin.runCommand(cmdId);
    return true;
  }

  list(): Array<{
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    commands: SandboxCommand[];
  }> {
    return this.sources.map((src) => ({
      id: src.id,
      name: src.name,
      description: src.description,
      enabled: this.isEnabled(src.id),
      commands: this.loaded.get(src.id)?.commandEntries() ?? [],
    }));
  }
}
