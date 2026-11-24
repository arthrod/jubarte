// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// How read_view's tables, endnotes and sections reach the pages (#45, #46,
// #47). The bodies follow read_view's own output for codex's documents.
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

const compose = (markdown) => {
  const container = document.createElement("div");
  document.body.append(container);
  const view = mountPagination(container, parseJubarte(markdown));
  const out = { composed: view.composed, text: container.textContent, container };
  return { ...out, done: () => (view.destroy(), container.remove()) };
};
const header = (extra = "") => `---\nview: tracked\npage: Letter portrait\n${extra}---\n\n`;
const count = (text, word) => text.split(word).length - 1;
const rows = (n) => Array.from({ length: n }, (_, i) => `|RECORD_${String(i).padStart(3, "0")}|`);

describe("a table repeats its first row only when Word does (#45)", () => {
  it("an engine table without header row repeats draws its first row once", () => {
    const [first, ...rest] = rows(65);
    const { text, composed, done } = compose(
      `${header()}<!-- t0 65x1, cells p0-p64 by row, widths 3.472in, width auto -->\n${first}\n|-|\n${rest.join("\n")}\n`,
    );
    expect(composed.layout.pages.length).toBeGreaterThan(1);
    expect(count(text, "RECORD_000")).toBe(1);
    done();
  });
  it("an engine table with header row repeats repeats it", () => {
    const [first, ...rest] = rows(65);
    const { text, composed, done } = compose(
      `${header()}<!-- t0 65x1, cells p0-p64 by row, widths 3.472in, width auto, header row repeats -->\n${first}\n|-|\n${rest.join("\n")}\n`,
    );
    expect(count(text, "RECORD_000")).toBe(composed.layout.pages.length);
    done();
  });
  it("a hand-written table repeats, as markdown_to_docx writes w:tblHeader", () => {
    const [first, ...rest] = rows(65);
    const { text, composed, done } = compose(`${first}\n|-|\n${rest.join("\n")}\n`);
    expect(count(text, "RECORD_000")).toBe(composed.layout.pages.length);
    done();
  });
});

describe("endnotes follow the body (#46)", () => {
  const after = Array.from(
    { length: 60 },
    (_, i) => `<!-- p${i + 1} -->\nAFTER_${String(i).padStart(2, "0")}`,
  );
  const body = (notes) =>
    `${header()}<!-- p0 -->\nBODY[^1] FOOT[^2]\n\n${after.join("\n\n")}\n\n${notes}\n`;
  it("an endnote is drawn after the last paragraph, not at the foot of its page", () => {
    const { composed, text, container, done } = compose(
      body(
        "<!-- endnotes.p0 Normal -->\n[^1]: ENDNOTE_NINE\n<!-- footnotes.p0 Normal -->\n[^2]: FOOTNOTE_TEN",
      ),
    );
    expect(composed.footnoteFragments.map((f) => String(f.footnoteId))).toEqual(["2"]);
    expect(text.indexOf("ENDNOTE_NINE")).toBeGreaterThan(text.indexOf("AFTER_59"));
    expect(text.indexOf("FOOTNOTE_TEN")).toBeLessThan(text.indexOf("AFTER_59"));
    // Its reference still reaches it, and it leads back.
    const link = container.querySelector('a[href="#paged-fn-1"]');
    expect(link).toBeTruthy();
    const target = container.querySelector("#paged-fn-1");
    expect(target).toBeTruthy();
    expect(container.querySelector(".paged-endnote-separator")).toBeTruthy();
    const last = composed.layout.pages.length - 1;
    const endBlock = composed.snapshot.blocks.find((b) =>
      b.runs?.some((r) => r.text.includes("ENDNOTE_NINE")),
    );
    const onPage = composed.layout.pages.findIndex((p) =>
      p.frames[0].fragments.some((f) => f.blockId === endBlock.id),
    );
    expect(onPage).toBe(last);
    done();
  });
});

describe("sections keep their own pages (#47)", () => {
  const sections = (entry) =>
    `${header(`sections:\n  2: {p2-p2${entry}}\n`)}<!-- p0 -->\nPORTRAIT\n\n<!-- p1 section-break -->\n\n<!-- p2 -->\nLANDSCAPE\n`;
  it("a next-page section starts a page of its own size", () => {
    const { composed, done } = compose(sections(", page: Letter landscape"));
    const pages = composed.layout.pages;
    expect(pages.length).toBe(2);
    expect([pages[0].spec.widthPx, pages[0].spec.heightPx]).toEqual([816, 1056]);
    expect([pages[1].spec.widthPx, pages[1].spec.heightPx]).toEqual([1056, 816]);
    expect(pages[1].frames[0].bounds.width).toBe(1056 - 192);
    expect(composed.warnings.join(" ")).not.toMatch(/section/i);
    done();
  });
  it("a section of the same page still starts a new one (Word's nextPage)", () => {
    const { composed, done } = compose(sections(""));
    expect(composed.layout.pages.length).toBe(2);
    done();
  });
  it("a continuous section of the same page flows on", () => {
    const { composed, done } = compose(sections(", page: Letter portrait, starts continuous"));
    expect(composed.layout.pages.length).toBe(1);
    expect(composed.warnings.join(" ")).not.toMatch(/starts/i);
    done();
  });
  it("reads the engine's unquoted setup and returns to the first page after it (the corpus's shape)", () => {
    const { composed, container, done } = compose(
      `${header("sections:\n  2: {p2-p2, page: Letter landscape, margins top 0.65in, right 0.5in, bottom 0.65in, left 0.5in, header/footer 0.5in}\n  3: {p3-p3}\n")}` +
        "<!-- p0 -->\nPORTRAIT\n\n<!-- p1 section-break -->\n\n<!-- p2 -->\nLANDSCAPE\n\n<!-- p3 -->\nBACK\n",
    );
    const pages = composed.layout.pages;
    expect(pages.map((p) => [p.spec.widthPx, p.spec.heightPx])).toEqual([
      [816, 1056],
      [1056, 816],
      [816, 1056],
    ]);
    const bounds = pages[1].frames[0].bounds;
    expect([bounds.x, bounds.y, bounds.width]).toEqual([48, expect.closeTo(62.4, 5), 960]);
    expect(composed.warnings.join(" ")).not.toMatch(/Unsupported page setting/);
    const labels = [...container.querySelectorAll(".paged-page-label span:first-child")].map(
      (e) => e.textContent,
    );
    expect(labels).toEqual(["Letter portrait", "Letter landscape", "Letter portrait"]);
    done();
  });
  it("an odd-page section after page 1 leaves page 2 blank", () => {
    const { composed, done } = compose(sections(", page: Letter portrait, starts oddPage"));
    expect(composed.layout.pages.length).toBe(3);
    expect(
      composed.layout.pages[1].frames[0].fragments.filter((f) =>
        f.lines?.some((l) => l.runs.length),
      ).length,
    ).toBe(0);
    done();
  });
});

describe("an empty paragraph's page break (#48)", () => {
  it("starts the next paragraph on a new page, as in b107", () => {
    const { composed, done } = compose(
      `${header()}<!-- p0 -->\nheader-no-rels\n\n<!-- p1 page-break -->\n\n<!-- p2 -->\nSecond page\n`,
    );
    const pages = composed.layout.pages;
    expect(pages.length).toBe(2);
    const second = composed.snapshot.blocks.find((b) =>
      b.runs?.some((r) => r.text.includes("Second page")),
    );
    expect(pages[1].frames[0].fragments.some((f) => f.blockId === second.id)).toBe(true);
    done();
  });
});
