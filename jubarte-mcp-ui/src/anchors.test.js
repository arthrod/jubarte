// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// Every link read_view writes reaches its target in the card: headings are
// named as the engine names their bookmarks (github_slug, Slugger,
// bookmark_name in crates/jubarte-markdown), and an <a id> bookmark is a
// target that draws nothing (#37). The bodies are read_view's own output.
import { beforeAll, describe, expect, it } from "vitest";
import { parseJubarte } from "../reader/jubarte.mjs";

let mountPagination;
beforeAll(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLCanvasElement.prototype.getContext = () => null;
  ({ mountPagination } = await import("../reader/pagination.js"));
});

const target = (body) => {
  const container = document.createElement("div");
  document.body.append(container);
  const view = mountPagination(container, parseJubarte(`---\nview: tracked\n---\n\n${body}\n`));
  // The document's own link, not a footnote mark or its way back.
  const href = [...container.querySelectorAll("a[href^='#']")]
    .map((a) => a.getAttribute("href"))
    .find((h) => !h.startsWith("#paged-fn"));
  const el = href
    ? [...container.querySelectorAll("[id]")].find((e) => e.id === href.slice(1))
    : null;
  const text = container.textContent;
  view.destroy();
  container.remove();
  return { href, el, text };
};

describe("links reach the engine's bookmarks (#37)", () => {
  it("a repeat retries a taken suffix: intro, intro-1, intro-1-1", () => {
    const { el } = target("# Intro\n\n# Intro\n\n# Intro 1\n\n[third](#intro-1-1)");
    expect(el?.textContent).toContain("Intro 1");
  });
  it("keeps combining marks", () => {
    expect(target("# Café\n\n[go](#café)").el).toBeTruthy();
  });
  it("makes each space a hyphen without collapsing them", () => {
    expect(target("# A  B\n\n[go](#a--b)").el).toBeTruthy();
  });
  it("keeps letter numbers and connector punctuation, drops other numbers", () => {
    expect(target("# Ⅻ ½ x_y\n\n[go](#ⅻ--x_y)").el).toBeTruthy();
  });
  it("prefixes a name of no first letter with _", () => {
    expect(target("# 123 heading\n\n[go](#_123-heading)").el?.textContent).toContain("123 heading");
  });
  it("cuts a long name to Word's 40 characters", () => {
    const { el } = target(
      "# Long heading Long heading Long heading Long heading Long heading\n\n[go](#long-heading-long-heading-long-heading-l)",
    );
    expect(el?.textContent).toContain("Long heading");
  });
  it("an <a id> on its own line is a target and draws nothing", () => {
    const { el, text } = target('<a id="_Toc123"></a>\n\n# Target\n\n[go](#_Toc123)');
    expect(el?.closest(".paged-block")?.textContent).toContain("Target");
    expect(text).not.toContain("<a");
    expect(text).not.toContain("</a>");
  });
  it("an <a id> inside a paragraph is a target and draws nothing", () => {
    const { el, text } = target('Some <a id="mid"></a>text\n\n[go](#mid)');
    expect(el).toBeTruthy();
    expect(text).toContain("Some text");
    expect(text).not.toContain("<a");
  });
  it("a plain heading keeps its slug", () => {
    expect(target("# Plain Heading\n\n[go](#plain-heading)").el?.textContent).toContain(
      "Plain Heading",
    );
  });
});

describe("bookmarks wherever read_view writes them (#38)", () => {
  it("keeps the space before a heading's note mark", () => {
    expect(
      target("# Topic [^1]\n\n[go](#topic-)\n\n<!-- footnotes.p0 -->\n[^1]: Note").el?.textContent,
    ).toContain("Topic");
  });
  it("keeps the space before a heading's deletion", () => {
    expect(target("# Topic {--old--}{r1 @J}\n\n[go](#topic-)").el?.textContent).toContain("Topic");
  });
  it("an explicit bookmark wins over a heading of the same name", () => {
    const { el } = target('# Intro\n\n<a id="intro"></a>\n\nActual target\n\n[go](#intro)');
    expect(el?.closest(".paged-block")?.textContent).toContain("Actual target");
  });
  it("a bookmark in a table cell is a target", () => {
    const { el, text } = target(
      '<!-- t0 2x1, cells p0-p1 by row, header row repeats -->\n|Header|\n|-|\n|<a id="cell"></a>Cell target|\n\n[go](#cell)',
    );
    expect(el?.closest("td")?.textContent).toContain("Cell target");
    expect(text).not.toContain("<a");
  });
  it("a bookmark in a footnote is a target", () => {
    const { el, text } = target(
      'Body[^1] [go](#note)\n\n<!-- footnotes.p0 -->\n[^1]: <a id="note"></a>Note target',
    );
    expect(el?.closest(".paged-footnote")?.textContent).toContain("Note target");
    expect(text).not.toContain("<a");
  });
});
