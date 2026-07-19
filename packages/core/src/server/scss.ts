// SCSS → CSS compilation with svg-load() resolution.
//
// zensical/ui's SCSS uses `svg-load("lucide/<icon>.svg")` to inline icons as CSS
// mask-image data URLs. `svg-load` is a postcss-inline-svg function, not a Sass one, so
// pure sass compilation leaves it verbatim in the output — every icon then renders as a
// solid rectangle (mask-image is an invalid value, background-color fills the box).
//
// We compile SCSS with sass, then resolve `svg-load("X.svg")` ourselves: read the SVG
// file, URL-encode it, and inline as `url("data:image/svg+xml,...")`. postcss-inline-svg
// was tried first but choked on multi-line SVGs (unclosed string from un-escaped inner
// quotes); a hand-rolled resolver is simpler and avoids that.

import { compileString as sassCompile, type StringOptions } from "sass";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface CompileScssOptions {
  /** Sass load paths (material-design-color, material-shadows, the styles dir itself). */
  loadPaths: string[];
}

/** Resolve `svg-load("lucide/X.svg")` and `svg-load("X.svg")` calls in compiled CSS to
 *  inline data URLs. Reads each referenced SVG from lucide-static/icons, URL-encodes it,
 *  and substitutes `url("data:image/svg+xml,<encoded>")`. */
async function resolveSvgLoad(css: string, iconsDir: string): Promise<string> {
  const re = /svg-load\(\s*["'](?:lucide\/)?([^"']+)["']\s*(?:,[^)]*)?\)/g;
  const matches = Array.from(css.matchAll(re));
  const cache = new Map<string, string>();
  for (const m of matches) {
    const name = m[1];
    if (cache.has(name)) continue;
    const file = join(iconsDir, name);
    try {
      const svg = await readFile(file, "utf8");
      // encodeURIComponent handles #, <, >, ", etc. — safe inside a url("...") data URL.
      cache.set(name, `url("data:image/svg+xml,${encodeURIComponent(svg.trim())}")`);
    } catch {
      cache.set(name, "none");
    }
  }
  return css.replace(re, (_full, name: string) => cache.get(name) ?? "none");
}

/** Locate lucide-static's icons directory (node_modules/lucide-static/icons). */
function resolveLucideIconsDir(): string | null {
  for (const base of [join(process.cwd(), "node_modules/lucide-static/icons"), join(__dirname, "..", "..", "..", "..", "node_modules/lucide-static/icons")]) {
    if (existsSync(base)) return base;
  }
  return null;
}

/** Compile a SCSS source string to CSS, resolving svg-load() icons to inline data URLs. */
export async function compileScss(scssSrc: string, opts: CompileScssOptions): Promise<string> {
  const sassOpts: StringOptions<"sync"> = {
    loadPaths: opts.loadPaths,
    silenceDeprecations: ["legacy-js-api", "import", "global-builtin", "color-functions"],
    quietDeps: true,
  };
  const compiled = sassCompile(scssSrc, sassOpts).css;
  const iconsDir = resolveLucideIconsDir();
  if (!iconsDir) return compiled;
  return resolveSvgLoad(compiled, iconsDir);
}

/** Read an SVG file from lucide-static/icons by name (no extension). Used to inline nav
 *  item icons (front-matter `icon: lucide/smile`) at SSR time. Returns "" if missing. */
export async function readSvg(name: string): Promise<string> {
  const dir = resolveLucideIconsDir();
  if (!dir) return "";
  const file = join(dir, `${name}.svg`);
  try {
    return await readFile(file, "utf8");
  } catch {
    return "";
  }
}
