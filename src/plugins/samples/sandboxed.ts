// Sample UNTRUSTED plugin, loaded through the sandbox isolation boundary
// (src/plugins/sandbox.ts). Its code runs inside a null-origin
// `<iframe sandbox="allow-scripts">` and reaches the editor only through the
// async `host` API delivered over postMessage — it cannot touch the parent
// DOM, host globals or the Tauri bridge. See PLUGINS.md.
//
// It contributes a few text commands/transforms so the boundary is easy to
// exercise end-to-end (palette → run → document changes).

import type { SandboxPluginSource } from "../sandbox";

const SOURCE = `
host.registerCommand({
  id: "markdownPreview",
  title: "Markdown → HTML (replace document)",
  run: async function () {
    var md = await host.getActiveText();
    var html = md
      .replace(/^###### (.*)$/gm, "<h6>$1</h6>")
      .replace(/^##### (.*)$/gm, "<h5>$1</h5>")
      .replace(/^#### (.*)$/gm, "<h4>$1</h4>")
      .replace(/^### (.*)$/gm, "<h3>$1</h3>")
      .replace(/^## (.*)$/gm, "<h2>$1</h2>")
      .replace(/^# (.*)$/gm, "<h1>$1</h1>")
      .replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>")
      .replace(/\\*([^*]+)\\*/g, "<em>$1</em>")
      .replace(/\`([^\`]+)\`/g, "<code>$1</code>");
    await host.setActiveText(html + "\\n");
    await host.notify("Markdown converted to HTML");
  }
});

host.registerTransform({
  id: "rot13",
  title: "ROT13 selection",
  scope: "selection",
  transform: function (text) {
    return text.replace(/[a-zA-Z]/g, function (c) {
      var base = c <= "Z" ? 65 : 97;
      return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
    });
  }
});

host.registerTransform({
  id: "reverse",
  title: "Reverse selection",
  scope: "selection",
  transform: function (text) { return text.split("").reverse().join(""); }
});
`;

export const sandboxedSample: SandboxPluginSource = {
  id: "textkit",
  name: "Text Kit (sandboxed)",
  description:
    "Untrusted sample running in an isolated iframe: Markdown→HTML, ROT13 and reverse-text commands.",
  source: SOURCE,
};

export const sandboxedPlugins: SandboxPluginSource[] = [sandboxedSample];
