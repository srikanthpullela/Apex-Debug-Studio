// In-app confirm dialog. Native window.confirm() is suppressed inside some
// embedded webviews (and the dev preview), which previously made the unsaved
// "close tab?" guard silently fail. This renders a small modal that works
// identically in plain Vite and inside Tauri.

export interface ConfirmOptions {
  title?: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

let activeResolve: ((value: boolean) => void) | null = null;

function ensureNode(): {
  overlay: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  ok: HTMLButtonElement;
  cancel: HTMLButtonElement;
} {
  let overlay = document.querySelector<HTMLElement>("#confirm-overlay");
  if (overlay) {
    return {
      overlay,
      title: overlay.querySelector("#confirm-title")!,
      body: overlay.querySelector("#confirm-body")!,
      ok: overlay.querySelector("#confirm-ok")!,
      cancel: overlay.querySelector("#confirm-cancel")!,
    };
  }

  overlay = document.createElement("div");
  overlay.id = "confirm-overlay";
  overlay.className = "modal-overlay confirm-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
      <div class="confirm-mark" aria-hidden="true">
        <span class="wordmark-splec">Splec</span>
      </div>
      <h2 id="confirm-title" class="confirm-title"></h2>
      <p id="confirm-body" class="confirm-body"></p>
      <div class="confirm-actions">
        <button id="confirm-cancel" class="btn btn-ghost" type="button"></button>
        <button id="confirm-ok" class="btn btn-primary" type="button"></button>
      </div>
    </div>`;
  document.body.append(overlay);

  const node = {
    overlay,
    title: overlay.querySelector<HTMLElement>("#confirm-title")!,
    body: overlay.querySelector<HTMLElement>("#confirm-body")!,
    ok: overlay.querySelector<HTMLButtonElement>("#confirm-ok")!,
    cancel: overlay.querySelector<HTMLButtonElement>("#confirm-cancel")!,
  };

  const finish = (value: boolean) => {
    node.overlay.hidden = true;
    const resolve = activeResolve;
    activeResolve = null;
    resolve?.(value);
  };
  node.ok.addEventListener("click", () => finish(true));
  node.cancel.addEventListener("click", () => finish(false));
  node.overlay.addEventListener("click", (e) => {
    if (e.target === node.overlay) finish(false);
  });
  document.addEventListener("keydown", (e) => {
    if (node.overlay.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    }
  });
  return node;
}

export function confirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  const node = ensureNode();
  node.title.textContent = opts.title ?? "Splec Note";
  node.body.textContent = message;
  node.ok.textContent = opts.okLabel ?? "OK";
  node.cancel.textContent = opts.cancelLabel ?? "Cancel";
  node.ok.classList.toggle("btn-danger", Boolean(opts.danger));
  node.ok.classList.toggle("btn-primary", !opts.danger);

  // Resolve any dialog that is somehow still open (defensive).
  activeResolve?.(false);
  node.overlay.hidden = false;
  node.ok.focus();
  return new Promise<boolean>((resolve) => {
    activeResolve = resolve;
  });
}
