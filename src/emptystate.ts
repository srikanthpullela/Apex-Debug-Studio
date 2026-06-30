// Empty-state "start" screen shown when no tabs are open: Splec branding,
// a New Note action, an Open action, and the recent files list.

import { baseName } from "./buffers";

export interface EmptyStateHandlers {
  onNew: () => void;
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
}

export function renderEmptyState(
  container: HTMLElement,
  recent: string[],
  handlers: EmptyStateHandlers,
): void {
  container.replaceChildren();

  const card = document.createElement("div");
  card.className = "empty-card";

  card.innerHTML = `
    <div class="empty-logo" aria-hidden="true">
      <span class="brand-mark empty-mark">
        <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="emptyStroke" x1="150" y1="120" x2="360" y2="400" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#9db4ff" />
              <stop offset="1" stop-color="#7c5cff" />
            </linearGradient>
          </defs>
          <path d="M338 168 C300 132 232 130 204 160 C176 190 196 232 246 252 C306 276 332 308 318 344 C302 384 226 392 182 356"
            fill="none" stroke="url(#emptyStroke)" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </div>
    <h1 class="empty-title">
      <span class="wordmark-splec">Splec</span><span class="empty-title-note">Note</span>
    </h1>
    <p class="empty-tagline">Notes and code that never get lost.</p>
  `;

  const actions = document.createElement("div");
  actions.className = "empty-actions";

  const newBtn = document.createElement("button");
  newBtn.className = "empty-btn empty-btn-primary";
  newBtn.type = "button";
  newBtn.textContent = "New Note";
  newBtn.addEventListener("click", () => handlers.onNew());

  const openBtn = document.createElement("button");
  openBtn.className = "empty-btn";
  openBtn.type = "button";
  openBtn.textContent = "Open File…";
  openBtn.addEventListener("click", () => handlers.onOpen());

  actions.append(newBtn, openBtn);
  card.append(actions);

  if (recent.length > 0) {
    const recentWrap = document.createElement("div");
    recentWrap.className = "empty-recent";
    const label = document.createElement("div");
    label.className = "empty-recent-label";
    label.textContent = "Recent";
    recentWrap.append(label);

    for (const path of recent.slice(0, 8)) {
      const item = document.createElement("button");
      item.className = "empty-recent-item";
      item.type = "button";
      item.title = path;
      const name = document.createElement("span");
      name.className = "empty-recent-name";
      name.textContent = baseName(path);
      const dir = document.createElement("span");
      dir.className = "empty-recent-path";
      dir.textContent = path;
      item.append(name, dir);
      item.addEventListener("click", () => handlers.onOpenRecent(path));
      recentWrap.append(item);
    }
    card.append(recentWrap);
  }

  container.append(card);
}
