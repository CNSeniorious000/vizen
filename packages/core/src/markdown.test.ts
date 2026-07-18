import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown/index.ts";

// Markdown extension tests — mkdocs-material's signature features ported to TS.
// Admonitions (!!! note), code blocks with highlighting, footnotes — these are what make
// a docs site feel like Material for MkDocs. TDD: write the expectation, then implement.

describe("markdown extensions", () => {
  it("renders admonitions", async () => {
    const src = `# Title

!!! note "Important"
    This is a note admonition.
`;
    const result = await renderMarkdown(src);
    expect(result.html).toContain('class="admonition note"');
    expect(result.html).toContain("Important");
    expect(result.html).toContain("This is a note admonition.");
  });

  it("renders admonitions without explicit title (uses default)", async () => {
    const src = `!!! warning
    Watch out.
`;
    const result = await renderMarkdown(src);
    expect(result.html).toContain('class="admonition warning"');
  });

  it("renders fenced code blocks with language class", async () => {
    const src = "```ts\nconst x = 1;\n```\n";
    const result = await renderMarkdown(src);
    expect(result.html).toContain('class="language-ts"');
    expect(result.html).toContain("const x = 1;");
  });

  it("extracts front matter and excludes it from html", async () => {
    const src = `---
description: A test page
---

# Body
`;
    const result = await renderMarkdown(src);
    expect(result.meta.description).toBe("A test page");
    expect(result.html).not.toContain("description");
    expect(result.html).toContain("Body");
  });

  it("builds a nested toc from headings", async () => {
    const src = `# Page Title

## First

### Nested

## Second
`;
    const result = await renderMarkdown(src);
    // H1 is the page title, not in toc.
    expect(result.toc).toHaveLength(2);
    expect(result.toc[0].text).toBe("First");
    expect(result.toc[0].children?.[0].text).toBe("Nested");
    expect(result.toc[1].text).toBe("Second");
  });

  it("slugifies headings for anchor links", async () => {
    const src = "## Hello World!\n";
    const result = await renderMarkdown(src);
    expect(result.toc[0].slug).toBe("hello-world");
  });
});
