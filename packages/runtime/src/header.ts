// Header/tabs scroll behavior (navigation.tabs). mkdocs-material's header.js hides the
// tabs bar when scrolling down (frees vertical space for reading) and reveals it when
// scrolling up. The SCSS keys off `[hidden]` on .md-tabs (and .md-header), so we just
// toggle that attribute on scroll direction.

let lastY = 0;
let ticking = false;

function onScroll(): void {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const y = window.scrollY;
    const tabs = document.querySelector(".md-tabs");
    if (tabs) {
      // Scrolling down past 4rem → hide tabs; scrolling up → show. At the very top,
      // always show. The threshold avoids flicker on tiny scrolls.
      const goingDown = y > lastY + 8;
      const goingUp = y < lastY - 8;
      if (y < 64) tabs.removeAttribute("hidden");
      else if (goingDown) tabs.setAttribute("hidden", "");
      else if (goingUp) tabs.removeAttribute("hidden");
    }
    lastY = y;
    ticking = false;
  });
}

/** Attach the scroll listener. No-op if there's no tabs bar (navigation.tabs off). */
export function mountHeaderScroll(): void {
  if (!document.querySelector(".md-tabs")) return;
  window.addEventListener("scroll", onScroll, { passive: true });
}
