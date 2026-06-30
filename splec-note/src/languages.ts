// Language registry for Splec Note.
// - Lazy-loads CodeMirror language packs on demand (keeps the initial bundle small).
// - Maps file extensions to a language id (reused from the old CongaCode fileAssociations).

import type { Extension } from "@codemirror/state";

// Legacy (stream-parser) modes, imported explicitly so Vite can bundle each one.
// Each entry resolves to the parser object exported by the legacy-modes package.
const LEGACY_LOADERS: Record<string, () => Promise<any>> = {
  shell: () => import("@codemirror/legacy-modes/mode/shell").then((m) => m.shell),
  ruby: () => import("@codemirror/legacy-modes/mode/ruby").then((m) => m.ruby),
  toml: () => import("@codemirror/legacy-modes/mode/toml").then((m) => m.toml),
  lua: () => import("@codemirror/legacy-modes/mode/lua").then((m) => m.lua),
  swift: () => import("@codemirror/legacy-modes/mode/swift").then((m) => m.swift),
  clike: () => import("@codemirror/legacy-modes/mode/clike").then((m) => m.clike),
  r: () => import("@codemirror/legacy-modes/mode/r").then((m) => m.r),
};

export interface LanguageDef {
  id: string;
  label: string;
  load: () => Promise<Extension>;
}

async function stream(modeName: string): Promise<Extension> {
  const [{ StreamLanguage }, parser] = await Promise.all([
    import("@codemirror/language"),
    LEGACY_LOADERS[modeName](),
  ]);
  return StreamLanguage.define(parser);
}

// id -> definition. `plaintext` is the no-highlight fallback.
export const LANGUAGES: Record<string, LanguageDef> = {
  plaintext: { id: "plaintext", label: "Plain Text", load: async () => [] },
  markdown: {
    id: "markdown",
    label: "Markdown",
    load: async () => (await import("@codemirror/lang-markdown")).markdown({ codeLanguages: [] }),
  },
  javascript: {
    id: "javascript",
    label: "JavaScript",
    load: async () => (await import("@codemirror/lang-javascript")).javascript({ jsx: true }),
  },
  typescript: {
    id: "typescript",
    label: "TypeScript",
    load: async () =>
      (await import("@codemirror/lang-javascript")).javascript({ jsx: true, typescript: true }),
  },
  json: {
    id: "json",
    label: "JSON",
    load: async () => (await import("@codemirror/lang-json")).json(),
  },
  html: {
    id: "html",
    label: "HTML",
    load: async () => (await import("@codemirror/lang-html")).html(),
  },
  css: {
    id: "css",
    label: "CSS",
    load: async () => (await import("@codemirror/lang-css")).css(),
  },
  python: {
    id: "python",
    label: "Python",
    load: async () => (await import("@codemirror/lang-python")).python(),
  },
  rust: {
    id: "rust",
    label: "Rust",
    load: async () => (await import("@codemirror/lang-rust")).rust(),
  },
  cpp: {
    id: "cpp",
    label: "C / C++",
    load: async () => (await import("@codemirror/lang-cpp")).cpp(),
  },
  java: {
    id: "java",
    label: "Java",
    load: async () => (await import("@codemirror/lang-java")).java(),
  },
  go: {
    id: "go",
    label: "Go",
    load: async () => (await import("@codemirror/lang-go")).go(),
  },
  php: {
    id: "php",
    label: "PHP",
    load: async () => (await import("@codemirror/lang-php")).php(),
  },
  sql: {
    id: "sql",
    label: "SQL",
    load: async () => (await import("@codemirror/lang-sql")).sql(),
  },
  yaml: {
    id: "yaml",
    label: "YAML",
    load: async () => (await import("@codemirror/lang-yaml")).yaml(),
  },
  xml: {
    id: "xml",
    label: "XML",
    load: async () => (await import("@codemirror/lang-xml")).xml(),
  },
  shell: { id: "shell", label: "Shell", load: () => stream("shell") },
  ruby: { id: "ruby", label: "Ruby", load: () => stream("ruby") },
  toml: { id: "toml", label: "TOML", load: () => stream("toml") },
  lua: { id: "lua", label: "Lua", load: () => stream("lua") },
  swift: { id: "swift", label: "Swift", load: () => stream("swift") },
  clike: { id: "clike", label: "C-like", load: () => stream("clike") },
  r: { id: "r", label: "R", load: () => stream("r") },
};

// Order shown in the status-bar language picker.
export const PICKER_ORDER = [
  "plaintext",
  "markdown",
  "javascript",
  "typescript",
  "json",
  "html",
  "css",
  "python",
  "rust",
  "cpp",
  "java",
  "go",
  "php",
  "sql",
  "yaml",
  "xml",
  "shell",
  "ruby",
  "toml",
  "lua",
  "swift",
  "r",
];

// File extension (lowercase, no dot) -> language id.
const EXT_TO_ID: Record<string, string> = {
  txt: "plaintext",
  text: "plaintext",
  log: "plaintext",
  md: "markdown",
  markdown: "markdown",
  mdx: "markdown",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  json: "json",
  jsonc: "json",
  html: "html",
  htm: "html",
  vue: "html",
  svelte: "html",
  css: "css",
  scss: "css",
  less: "css",
  py: "python",
  pyw: "python",
  rs: "rust",
  c: "cpp",
  h: "cpp",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  java: "java",
  go: "go",
  php: "php",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  svg: "xml",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  rb: "ruby",
  toml: "toml",
  lua: "lua",
  swift: "swift",
  kt: "clike",
  kts: "clike",
  scala: "clike",
  dart: "clike",
  r: "r",
};

export function languageIdForFilename(name: string): string {
  const lower = name.toLowerCase();
  if (lower === "dockerfile") return "shell";
  if (lower === "makefile") return "plaintext";
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return "plaintext";
  const ext = lower.slice(dot + 1);
  return EXT_TO_ID[ext] ?? "plaintext";
}

export function languageLabel(id: string): string {
  return LANGUAGES[id]?.label ?? "Plain Text";
}

const loadCache = new Map<string, Extension>();

export async function loadLanguageExtension(id: string): Promise<Extension> {
  const def = LANGUAGES[id] ?? LANGUAGES.plaintext;
  const cached = loadCache.get(def.id);
  if (cached) return cached;
  const ext = await def.load();
  loadCache.set(def.id, ext);
  return ext;
}
