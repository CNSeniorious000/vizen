import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadConfig, normalize } from "./config/index.ts";

const FIXTURE = join(import.meta.dirname, "__fixtures__");

describe("zensical.toml (native format)", () => {
  it("loads a zensical.toml config", async () => {
    const config = await loadConfig(join(FIXTURE, "zensical.toml"));
    expect(config.site_name).toBe("Zensical TOML Fixture");
    expect(config.site_description).toBe("A fixture using the native zensical.toml format");
    expect(config.theme.variant).toBe("modern");
    expect(config.theme.features).toContain("navigation.instant");
  });

  it("parses TOML [[nav]] table arrays into the same NavItem shape as YAML", async () => {
    const config = await loadConfig(join(FIXTURE, "zensical.toml"));
    expect(config.nav).toBeDefined();
    // Home: titled page { Home: "index.md" }
    expect(config.nav![0]).toEqual({ Home: "index.md" });
    // Getting Started: section { "Getting Started": [children] }
    const section = config.nav![1] as { "Getting Started": unknown[] };
    expect(section["Getting Started"]).toHaveLength(2);
    expect(section["Getting Started"][0]).toEqual({ Overview: "getting-started/index.md" });
    expect(section["Getting Started"][1]).toEqual({ Installation: "getting-started/installation.md" });
  });

  it("zensical.toml and mkdocs.yml produce equivalent configs", async () => {
    const toml = await loadConfig(join(FIXTURE, "zensical.toml"));
    const yml = await loadConfig(join(FIXTURE, "mkdocs.yml"));
    // Same structure, different site_name (fixtures differ intentionally) — compare nav.
    expect(JSON.stringify(toml.nav)).toBe(JSON.stringify(yml.nav));
    expect(toml.theme.features).toEqual(yml.theme.features);
    expect(toml.theme.variant).toBe(yml.theme.variant);
  });
});

describe("config normalization", () => {
  it("applies defaults for missing fields", () => {
    const c = normalize({ site_name: "Test" });
    expect(c.docs_dir).toBe("docs");
    expect(c.site_dir).toBe("site");
    expect(c.theme.name).toBe("material");
    expect(c.theme.variant).toBe("modern");
    expect(c.theme.features).toEqual([]);
    expect(c.extra).toEqual({});
    expect(c.extra_css).toEqual([]);
    expect(c.extra_javascript).toEqual([]);
    expect(c.markdown_extensions).toEqual([]);
  });

  it("preserves explicit values", () => {
    const c = normalize({
      site_name: "Test",
      docs_dir: "content",
      site_dir: "public",
      theme: { name: "material", variant: "classic", features: ["navigation.instant", "navigation.tabs"] },
      extra: { version: "1.0" },
      extra_css: ["custom.css"],
    });
    expect(c.docs_dir).toBe("content");
    expect(c.site_dir).toBe("public");
    expect(c.theme.variant).toBe("classic");
    expect(c.theme.features).toContain("navigation.instant");
    expect(c.extra?.version).toBe("1.0");
    expect(c.extra_css).toEqual(["custom.css"]);
  });

  it("handles theme.font = false (no fonts)", () => {
    const c = normalize({ site_name: "T", theme: { name: "material", font: false } });
    expect(c.theme.font).toBe(false);
  });

  it("handles palette as array (multiple schemes)", () => {
    const c = normalize({
      site_name: "T",
      theme: {
        name: "material",
        palette: [
          { scheme: "default", primary: "indigo", accent: "blue" },
          { scheme: "slate", primary: "deep-orange", accent: "orange" },
        ],
      },
    });
    expect(Array.isArray(c.theme.palette)).toBe(true);
    expect((c.theme.palette as unknown[]).length).toBe(2);
  });

  it("handles empty nav (falls back to auto-discovery)", () => {
    const c = normalize({ site_name: "T" });
    expect(c.nav).toBeUndefined();
  });
});
