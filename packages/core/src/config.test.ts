import { describe, it, expect } from "vitest";
import { normalize } from "./config/index.ts";

// Config normalization edge cases: defaults, missing fields, theme variants, feature flags.

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
