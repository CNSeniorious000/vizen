// Page collection — walk docs_dir and return every .md as a PageRef.
// Factored out of server/index.ts so the SSG pipeline (and tests) can use it without
// pulling in the Vite dev server.

import { join, relative, sep } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { PageRef } from "../nav/index.ts";

export async function collectPages(docsDir: string): Promise<PageRef[]> {
  const out: PageRef[] = [];
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name.endsWith(".md")) {
        const rel = relative(docsDir, full).split(sep).join("/");
        const url = rel.replace(/(index)?\.md$/, "") || "";
        const src = await readFile(full, "utf8");
        const { title, icon } = extractMeta(src, rel);
        out.push({ path: rel, url: url || "", title, icon });
      }
    }
  }
  await walk(docsDir);
  // Stable order: depth-first readdir order is OS-dependent; sort by path so nav + tests
  // are deterministic.
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/** Pull title + icon from front matter (gray-matter style). Title falls back to the
 *  first H1, then the path. Icon is the front-matter `icon` field (e.g. "lucide/smile"). */
function extractMeta(src: string, fallbackTitle: string): { title: string; icon?: string } {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = m ? (parseYaml(m[1]) ?? {}) as Record<string, unknown> : {};
  const title = (meta.title as string | undefined) ?? src.match(/^#\s+(.+)$/m)?.[1] ?? fallbackTitle;
  const icon = meta.icon as string | undefined;
  return { title, icon };
}
