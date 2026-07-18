// Config loading — mkdocs.yml-compatible (we accept mkdocs.yml OR zensical.yml).
// TS port of zensical/python/zensical/config.py + mkdocs config schema.

import { parse as parseYaml } from "yaml";

export interface Config {
  site_name: string;
  site_url?: string;
  site_description?: string;
  site_author?: string;
  docs_dir: string;
  site_dir?: string;
  theme: ThemeConfig;
  nav?: NavItem[];
  extra?: Record<string, unknown>;
  extra_css?: string[];
  extra_javascript?: string[];
  markdown_extensions?: string[];
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

export type NavItem = NavSection | NavPage;

export interface NavSection {
  [section: string]: (string | NavItem)[];
}

export interface NavPage {
  page: string;
  title?: string;
}

export interface PageMeta {
  title?: string;
  description?: string;
  author?: string;
  hide?: string[];
  icon?: string;
  template?: string;
}

export async function loadConfig(path: string): Promise<Config> {
  const file = await Bun.file(path).text();
  const raw = parseYaml(file) as Partial<Config>;
  return normalize(raw);
}

function normalize(raw: Partial<Config>): Config {
  const docs_dir = raw.docs_dir ?? "docs";
  return {
    site_name: raw.site_name ?? "My Docs",
    site_url: raw.site_url,
    site_description: raw.site_description,
    site_author: raw.site_author,
    docs_dir,
    site_dir: raw.site_dir ?? "site",
    theme: { name: "material", variant: "modern", features: [], ...raw.theme },
    nav: raw.nav,
    extra: raw.extra ?? {},
    extra_css: raw.extra_css ?? [],
    extra_javascript: raw.extra_javascript ?? [],
    markdown_extensions: raw.markdown_extensions ?? [],
    plugins: raw.plugins ?? {},
  };
}
