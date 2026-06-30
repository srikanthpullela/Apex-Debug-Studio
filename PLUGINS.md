# Splec Note — Plugin API

Splec Note ships a small, conservative plugin system. A plugin is a JavaScript/
TypeScript module that contributes **commands**, **side panels**, **status‑bar
items**, and **text transforms** through a single, explicit host object. Plugins
get **no filesystem or network access** — the host API simply does not expose it.

This document describes the API, the loading/security model, and how to add a
plugin.

---

## 1. Loading model

Plugins are **first‑party ES modules** bundled with the app. They live in
[`src/plugins/`](./src/plugins):

```
src/plugins/
  api.ts            # the PluginHost / PluginModule contracts (this API)
  manager.ts        # the PluginManager: load, enable/disable, wire contributions
  builtins.ts       # the registry — the list of plugins the app loads
  samples/
    wordcount.ts    # sample: Word Count / reading‑time panel + status item
    jsontools.ts    # sample: JSON pretty‑print / sort‑keys / minify commands
```

### Two plugin tiers

Splec Note supports **two** kinds of plugins:

1. **Trusted, bundled plugins** (`builtins.ts`) run in the app's webview realm
   via `PluginManager`. They use the synchronous `host` API and can render DOM
   panels directly. These are first-party, vetted code.
2. **Untrusted, sandboxed plugins** (`samples/sandboxed.ts`, managed by
   `SandboxRegistry`) run inside a `<iframe sandbox="allow-scripts">` with **no**
   `allow-same-origin`, so they load in an opaque ("null") origin and **cannot
   reach the parent DOM, host globals, `localStorage`, or the Tauri IPC bridge**.
   Their only channel is `postMessage`, brokered by the host against a minimal,
   **async** API. A runtime self-test disables any sandbox that can see the parent
   realm. This is the isolation boundary for third-party code.

On launch, `PluginManager` reads `builtins.ts`, and for every plugin that is
**enabled** (the default), calls its `activate(host)` once. `SandboxRegistry`
likewise loads each enabled sandboxed plugin into its own iframe. Enable/disable
state persists via `tauri-plugin-store` (keys `pluginStates` / `sandboxStates`)
and is editable from **Preferences → Macros & Plugins → Manage plugins…** (where
sandboxed plugins are marked with a `sandboxed` badge).

### Trusted (in-realm) vs. sandboxed loading

Loading arbitrary `.js` from a user folder into the app realm and `eval`-ing it
is an unrestricted-escape risk. Trusted bundled plugins accept that they are
first-party code; **untrusted plugins must go through the iframe sandbox**, whose
async host bridge guarantees they never touch the host realm. Sandboxed plugins
render panels inside their own iframe document, not the host DOM.

---

## 2. Security model

There are two layers:

1. **Tauri capabilities (the hard boundary).** The webview can only invoke the
   Tauri commands the app's capability set allows (`src-tauri/capabilities/`).
   Plugins inherit **no additional capabilities** — they cannot read/write files
   or open sockets beyond what the app itself already permits, and the host API
   surfaces none of those primitives.
2. **The host API (the explicit surface).** A plugin receives only the `host`
   object. It exposes document text, selection, simple UI slots, namespaced
   storage, and notifications — and nothing else. No `fs`, no `fetch`, no
   `invoke`, no `window` handed in.
3. **The iframe sandbox (for untrusted plugins).** Sandboxed plugins additionally
   run in a null-origin `<iframe sandbox="allow-scripts">`, so even
   *deliberately* malicious code cannot reach the parent realm, host DOM or Tauri
   bridge — it can only call the async `host` methods over `postMessage`.

> Bundled samples are trusted code. Layers 1–2 keep a *misbehaving* trusted
> plugin from escalating; layer 3 (the iframe sandbox) is what contains
> deliberately malicious third-party code.

---

## 3. The host API

A plugin module implements `PluginModule`:

```ts
export interface PluginModule {
  id: string;            // unique, stable slug
  name: string;          // shown in the Plugins manager
  description: string;
  activate(host: PluginHost): void;
  deactivate?(): void;   // called when the plugin is disabled
}
```

`activate` receives a `PluginHost`:

```ts
interface PluginHost {
  // Contributions
  registerCommand(cmd: { id: string; title: string; run: () => void }): void;
  registerTransform(t: {
    id: string;
    title: string;
    scope?: "doc" | "selection";          // default "selection"
    transform: (text: string) => string;  // pure text → text
  }): void;
  addPanel(panel: {
    id: string;
    title: string;
    render: (container: HTMLElement) => void; // build your panel UI here
  }): PluginPanelHandle;
  addStatusBarItem(item: {
    id: string;
    text?: string;
    title?: string;
    onClick?: () => void;
  }): PluginStatusHandle;

  // Document access (no fs/network)
  getActiveText(): string;
  setActiveText(text: string): void;
  getSelection(): { from: number; to: number; text: string };
  replaceSelection(text: string): void;
  onDocChanged(cb: () => void): () => void;   // returns an unsubscribe fn

  // Misc
  notify(message: string): void;              // status‑bar message
  storage: {                                  // namespaced & persisted
    get<T = unknown>(key: string): T | undefined;
    set(key: string, value: unknown): void;
  };
}
```

### Contribution behaviour

- **Commands** appear in the **Command Palette** (`⇧⌘P`) and the **Plugins**
  section of the menu. Their act id is `plugincmd:<pluginId>:<commandId>`.
- **Transforms** are registered as commands that apply your pure function to the
  current selection (or the whole document when `scope: "doc"` or nothing is
  selected). Edits go through the normal editor pipeline, so undo/redo, autosave
  and session persistence all work.
- **Panels** are toggleable side panels (right dock). `addPanel` also registers a
  `Toggle <title>` command automatically. `render(container)` is called when the
  panel becomes visible; combine it with `onDocChanged` to keep it live.
- **Status‑bar items** render in the footer; disabling the plugin removes them.

Handles let you update or remove a contribution later:

```ts
interface PluginPanelHandle  { setTitle(t): void; refresh(): void; show(): void; remove(): void; }
interface PluginStatusHandle { setText(t): void; setTitle(t): void; remove(): void; }
```

---

## 4. Sample plugins

### Word Count (`samples/wordcount.ts`)
Adds a **side panel** (words, characters, lines, reading time) and a **status‑bar
item** showing the live word count. Demonstrates `addPanel`, `addStatusBarItem`
and `onDocChanged`.

### JSON Tools (`samples/jsontools.ts`)
Adds three **commands** — *JSON: Pretty‑Print*, *JSON: Sort Keys*, *JSON: Minify*
— that rewrite the whole buffer. Demonstrates `registerCommand`, `getActiveText`,
`setActiveText` and `notify` (it reports invalid JSON instead of corrupting the
document).

### Text Kit — sandboxed (`samples/sandboxed.ts`)
An **untrusted** sample loaded through the iframe sandbox. Registers
*Markdown → HTML*, *ROT13 selection* and *Reverse selection*. Demonstrates the
async `host` API over `postMessage` (`registerCommand`, `registerTransform`,
`getActiveText`/`setActiveText`, `getSelection`/`replaceSelection`, `notify`) and
proves the isolation boundary: the iframe cannot reach the parent realm.

---

## 5. Adding a plugin

### Trusted, bundled plugin

1. Create `src/plugins/samples/myplugin.ts`:

   ```ts
   import type { PluginModule, PluginHost } from "../api";

   export const myPlugin: PluginModule = {
     id: "myplugin",
     name: "My Plugin",
     description: "Does a useful thing.",
     activate(host: PluginHost) {
       host.registerCommand({
         id: "shout",
         title: "Shout selection",
         run: () => {
           const sel = host.getSelection();
           if (sel.text) host.replaceSelection(sel.text.toUpperCase() + "!");
         },
       });
     },
   };
   ```

2. Register it in `src/plugins/builtins.ts`:

   ```ts
   import { myPlugin } from "./samples/myplugin";
   export const builtinPlugins: PluginModule[] = [wordCountPlugin, jsonToolsPlugin, myPlugin];
   ```

3. Run the app — your command appears in the palette and the **Plugins** menu,
   and the plugin shows up in **Manage plugins…** with an enable/disable toggle.

### Untrusted, sandboxed plugin

Sandboxed plugins are provided as a **source string** evaluated inside the
iframe, where a global `host` exposes the **async** API (every method returns a
Promise). Define it in `src/plugins/samples/<name>.ts` as a `SandboxPluginSource`
and add it to `sandboxedPlugins`:

```ts
import type { SandboxPluginSource } from "../sandbox";

export const myUntrusted: SandboxPluginSource = {
  id: "myuntrusted",
  name: "My Untrusted Plugin",
  description: "Runs fully isolated in an iframe.",
  source: `
    host.registerTransform({
      id: "shout", title: "Shout selection", scope: "selection",
      transform: function (t) { return t.toUpperCase() + "!"; }
    });
  `,
};
```

The host bridge services its calls; it never receives `window`, `document`, the
Tauri bridge, or any host global.

---

## 6. Possible future work

- Loading sandboxed plugins from a user folder (the iframe boundary already makes
  this safe; only a discovery/install UI is missing).
- A richer panel lifecycle (visibility events, persisted active panel).
- Optional contribution points: editor decorations, language providers.
