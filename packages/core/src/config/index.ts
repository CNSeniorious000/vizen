// Config loading — supports BOTH mkdocs.yml (YAML) and vizen.toml (TOML).
// vizen.toml is the preferred native format; mkdocs.yml is supported for
// drop-in compatibility with existing Material for MkDocs projects.

import { parse as parseYaml } from "yaml";
import { parse as parseToml } from "smol-toml";
import { readFile } from "node:fs/promises";

export interface Config {
  site_name: string;
  site_url?: string;
  site_description?: string;
  site_author?: string;
  docs_dir: string;
  site_dir?: string;
  theme: ThemeConfig;
  nav?: NavItem[];
  repo_url?: string;
  repo_name?: string;
  copyright?: string;
  extra?: Record<string, unknown>;
  extra_css?: string[];
  extra_javascript?: string[];
  markdown_extensions?: Record<string, unknown>;
  plugins?: Record<string, unknown>;
}

export interface ThemeConfig {
  name: string;
  variant?: "modern" | "classic";
  palette?: PaletteConfig | PaletteConfig[];
  features?: string[];
  font?: { text?: string; code?: string } | false;
  favicon?: string;
  icon?: Record<string, string>;
  direction?: "ltr" | "rtl";
}

export interface PaletteConfig {
  scheme?: string;
  primary?: string;
  accent?: string;
  toggle?: { icon?: string; name?: string };
}

/** A nav entry as written in mkdocs.yml. Three forms:
 *  - "path.md"                         (bare path)
 *  - { Title: "path.md" }             (titled single page)
 *  - { Section: [NavItem, ...] }       (nested section) */
export type NavItem = string | { [title: string]: string | NavItem[] };

export interface PageMeta {
  title?: string;
  description?: string;
  author?: string;
  hide?: string[];
  icon?: string;
  template?: string;
}

export async function loadConfig(path: string): Promise<Config> {
  const file = await readFile(path, "utf8");
  const isToml = path.endsWith(".toml");
  const raw = isToml ? parseToml(file) as unknown as Partial<Config> : parseYaml(file) as Partial<Config>;
  // TOML nav uses [[nav]] table arrays with {title, url?, children?} — convert to the
  // NavItem shape that buildNav expects (same as YAML's titled-page form).
  const normalized = isToml ? { ...raw, nav: tomlNavToNav(raw.nav) } : raw;
  return normalize(normalized);
}

/** Convert a TOML [[nav]] table array into NavItem[]. TOML has no inline nested arrays
 *  of mixed types, so nav is expressed as:
 *    [[nav]] title = "Home" url = "index.md"
 *    [[nav]] title = "Section"
 *      [[nav.children]] title = "Child" url = "child.md"
 *  Each entry: { title, url?, children?: same[] }. We map titled entries to
 *  { [title]: url | children[] } so buildNav's toNode handles them uniformly. */
function tomlNavToNav(nav: unknown): NavItem[] | undefined {
  if (!Array.isArray(nav)) return nav as NavItem[] | undefined;
  return nav.map((entry) => {
    const e = entry as { title: string; url?: string; children?: unknown[] };
    if (Array.isArray(e.children) && e.children.length > 0) {
      return { [e.title]: tomlNavToNav(e.children) } as NavItem;
    }
    // Titled page: { Title: "path" }. url may be omitted for a pure section header.
    return { [e.title]: e.url ?? "" } as NavItem;
  });
}

export function normalize(raw: Partial<Config>): Config {
  const docs_dir = raw.docs_dir ?? "docs";
  const theme: ThemeConfig = { name: "material", variant: "modern", features: [], ...raw.theme };
  // mkdocs-material defaults to an indigo palette when none is configured — the body's
  // data-md-color-* attributes + palette.css variables depend on it. Without a default,
  // the header/links render unstyled (no primary color).
  if (!theme.palette) theme.palette = { scheme: "default", primary: "indigo", accent: "indigo" };
  return {
    site_name: raw.site_name ?? "My Docs",
    site_url: raw.site_url,
    site_description: raw.site_description,
    site_author: raw.site_author,
    docs_dir,
    site_dir: raw.site_dir ?? "site",
    theme,
    nav: raw.nav,
    repo_url: raw.repo_url,
    repo_name: raw.repo_name,
    copyright: raw.copyright,
    extra: raw.extra ?? {},
    extra_css: raw.extra_css ?? [],
    extra_javascript: raw.extra_javascript ?? [],
    markdown_extensions: raw.markdown_extensions ?? {},
    plugins: raw.plugins ?? {},
  };
}
