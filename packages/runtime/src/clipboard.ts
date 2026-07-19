// Code block copy buttons (content.code.copy). mkdocs-material's clipboard.js injects a
// <button class="md-clipboard"> into every <pre>; the SCSS positions it top-right and
// reveals it on hover. We do the same at runtime so the SSR markdown stays clean.

const CLIPBOARD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 21H8V7h11m0-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m-3-4H4a2 2 0 0 0-2 2v14h2V3h12V1Z"/></svg>`;

function features(): string[] {
  try {
    const cfg = JSON.parse(document.getElementById("__config")?.textContent ?? "{}");
    return Array.isArray(cfg.features) ? cfg.features : [];
  } catch {
    return [];
  }
}

/** Inject a copy button into every <pre> that doesn't already have one. Idempotent — safe
 *  to call again after client-side navigation swaps the content island. */
export function mountClipboard(): void {
  if (!features().includes("content.code.copy")) return;
  for (const pre of document.querySelectorAll("pre")) {
    if (pre.querySelector(":scope > .md-clipboard")) continue;
    const btn = document.createElement("button");
    btn.className = "md-clipboard";
    btn.type = "button";
    btn.title = "Copy to clipboard";
    btn.setAttribute("aria-label", "Copy to clipboard");
    btn.innerHTML = CLIPBOARD_ICON;
    btn.addEventListener("click", async () => {
      const code = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
      try {
        await navigator.clipboard.writeText(code);
        btn.classList.add("md-clipboard--copied");
        setTimeout(() => btn.classList.remove("md-clipboard--copied"), 2000);
      } catch {
        // Clipboard API can fail in non-secure contexts; silently no-op.
      }
    });
    pre.append(btn);
  }
}
