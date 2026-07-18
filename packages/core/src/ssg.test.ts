import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { loadConfig } from "./config/index.ts";
import { renderMarkdown } from "./markdown/index.ts";
import { buildNav, buildToc } from "./nav/index.ts";
import { renderPage } from "./render/index.ts";
import { collectPages } from "./server/collect.ts";

const FIXTURE = join(import.meta.dirname, "__fixtures__");
const readFixture = (rel: string) => readFile(join(FIXTURE, rel), "utf8");

describe("SSG end-to-end", () => {
  it("loads mkdocs.yml config", async () => {
    const config = await loadConfig(join(FIXTURE, "mkdocs.yml"));
    expect(config.site_name).toBe("Zensical Fixture");
    expect(config.theme.variant).toBe("modern");
    expect(config.theme.features).toContain("navigation.instant");
    expect(config.nav).toBeDefined();
  });

  it("renders markdown to html + toc + title", async () => {
    const src = await readFixture("docs/index.md");
    const result = await renderMarkdown(src);
    expect(result.title).toBe("Welcome");
    expect(result.html).toContain("<a href=\"getting-started/\">");
    expect(result.toc.length).toBeGreaterThan(0);
    expect(result.toc[0].text).toBe("Section");
  });

  it("collects all pages from docs_dir", async () => {
    const pages = await collectPages(join(FIXTURE, "docs"));
    const paths = pages.map((p) => p.path);
    expect(paths).toEqual(expect.arrayContaining([
      "getting-started/installation.md",
      "getting-started/index.md",
      "index.md",
    ]));
    expect(paths).toHaveLength(3);
  });

  it("builds nav from config.nav", async () => {
    const config = await loadConfig(join(FIXTURE, "mkdocs.yml"));
    const pages = await collectPages(join(FIXTURE, "docs"));
    const nav = buildNav(config, pages);
    expect(nav[0].title).toBe("Home");
    expect(nav[1].title).toBe("Getting Started");
    expect(nav[1].children?.[0].title).toBe("Overview");
  });

  it("renders a page with island anchors", async () => {
    const config = await loadConfig(join(FIXTURE, "mkdocs.yml"));
    const pages = await collectPages(join(FIXTURE, "docs"));
    const nav = buildNav(config, pages);
    const src = await readFixture("docs/index.md");
    const content = await renderMarkdown(src);
    const toc = buildToc(content.toc, config.theme.features ?? []);
    const html = await renderPage({
      config,
      page: { url: "", title: "Welcome", meta: {} },
      content,
      nav,
      toc,
      base_url: "/",
      generator: "zensical-vite",
    });
    // Every island anchor must be present — these are the HMR + client-nav targets.
    expect(html).toContain('data-md-component="header"');
    expect(html).toContain('data-md-component="content"');
    expect(html).toContain('data-md-component="footer"');
    expect(html).toContain('data-md-component="sidebar"');
    // The rendered markdown body is inside the content island.
    expect(html).toContain("Welcome");
    expect(html).toContain("getting-started/");
    // The runtime entry script is injected.
    expect(html).toContain("/@zensical/entry");
  });
});
