// Status bar: line/col, selection, language picker, encoding, EOL, word/char counts.

import { PICKER_ORDER, languageLabel } from "./languages";

export interface StatusInfo {
  line: number;
  col: number;
  selLen: number;
  language: string;
  encoding: string;
  eol: "LF" | "CRLF";
  words: number;
  chars: number;
  wordWrap: boolean;
}

export interface StatusHandlers {
  onLanguageChange: (id: string) => void;
  onEolToggle: () => void;
  onWrapToggle: () => void;
}

export class StatusBar {
  private cursor = document.querySelector<HTMLElement>("#cursor-pos")!;
  private counts = document.querySelector<HTMLElement>("#status-counts")!;
  private langSelect = document.querySelector<HTMLSelectElement>("#lang-select")!;
  private encodingBtn = document.querySelector<HTMLButtonElement>("#encoding-btn")!;
  private eolBtn = document.querySelector<HTMLButtonElement>("#eol-btn")!;
  private wrapBtn = document.querySelector<HTMLButtonElement>("#wrap-toggle")!;
  private msg = document.querySelector<HTMLElement>("#status-msg")!;

  constructor(handlers: StatusHandlers) {
    // Populate language picker once.
    this.langSelect.replaceChildren();
    for (const id of PICKER_ORDER) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = languageLabel(id);
      this.langSelect.append(opt);
    }
    this.langSelect.addEventListener("change", () =>
      handlers.onLanguageChange(this.langSelect.value),
    );
    this.eolBtn.addEventListener("click", () => handlers.onEolToggle());
    this.wrapBtn.addEventListener("click", () => handlers.onWrapToggle());
  }

  setMessage(text: string): void {
    this.msg.textContent = text;
  }

  update(info: StatusInfo): void {
    this.cursor.textContent =
      info.selLen > 0
        ? `Ln ${info.line}, Col ${info.col} (${info.selLen} sel)`
        : `Ln ${info.line}, Col ${info.col}`;
    this.counts.textContent = `${info.words} ${info.words === 1 ? "word" : "words"}, ${info.chars} chars`;
    if (this.langSelect.value !== info.language) this.langSelect.value = info.language;
    this.encodingBtn.textContent = info.encoding;
    this.eolBtn.textContent = info.eol;
    this.wrapBtn.textContent = info.wordWrap ? "Wrap: On" : "Wrap: Off";
    this.wrapBtn.classList.toggle("is-on", info.wordWrap);
  }

  setEnabled(enabled: boolean): void {
    for (const el of [this.langSelect, this.encodingBtn, this.eolBtn]) {
      el.toggleAttribute("disabled", !enabled);
    }
  }
}
