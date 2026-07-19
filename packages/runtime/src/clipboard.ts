// Code block copy buttons (content.code.copy). mkdocs-material's clipboard.js injects a
// <button class="md-clipboard"> into every <pre>; the SCSS positions it top-right,
// reveals it on hover, and renders the icon via the ::after mask (svg-load resolved at
// build time). We inject the empty button at runtime so the SSR markdown stays clean.

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
