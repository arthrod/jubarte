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

const compose = (markdown, options) => {
  const container = document.createElement("div");
  document.body.append(container);
  const view = mountPagination(container, parseJubarte(markdown), options);
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

describe("sections and their notes (#49)", () => {
  it("a footnote on a portrait page after a landscape section wraps to that page", () => {
    const note = "word ".repeat(100).trim();
    const { composed, done } = compose(
      "---\nview: tracked\npage: Letter landscape, margins 1in, header/footer 0.5in\nsections:\n  2: {p2-p2, page: Letter portrait, margins 1in, header/footer 0.5in}\n---\n\n" +
        `<!-- p0 -->\nFIRST\n\n<!-- p1 section-break -->\n\n<!-- p2 -->\nSECOND[^1]\n\n<!-- footnotes.p0 Normal -->\n[^1]: ${note}\n`,
    );
    const fragments = composed.footnoteFragments;
    expect(fragments.length).toBeGreaterThan(0);
    for (const fragment of fragments) {
      const page = composed.layout.pages[fragment.pageIndex];
      const content = page.spec.widthPx - page.margins.leftPx - page.margins.rightPx;
      const right = Math.max(
        ...fragment.lines.flatMap((l) => l.runs.map((r) => r.x + (r.width ?? 0))),
      );
      expect(right).toBeLessThanOrEqual(content + 1);
    }
    done();
  });
  it("an empty section keeps its own blank page and the next section its setup", () => {
    const { composed, done } = compose(
      `${header("sections:\n  2: {p2-p2, page: Letter landscape, margins 1in, header/footer 0.5in}\n  3: {p3-p3, page: A4 portrait, margins 1in, header/footer 0.5in}\n")}` +
        "<!-- p0 -->\nFIRST\n\n<!-- p1 section-break -->\n\n<!-- p2 section-break -->\n\n<!-- p3 -->\nTHIRD\n",
    );
    const pages = composed.layout.pages;
    expect(pages.map((p) => Math.round(p.spec.widthPx))).toEqual([816, 1056, 794]);
    expect(composed.warnings.join(" ")).not.toMatch(/does not show/);
    done();
  });
});

const bodyRuns = (composed, pageIndex) =>
  composed.layout.pages[pageIndex].frames[0].fragments.flatMap((f) =>
    (f.lines || []).flatMap((l) => l.runs.filter((r) => r.text?.trim())),
  );
const contentWidth = (page) => page.spec.widthPx - page.margins.leftPx - page.margins.rightPx;

describe("continued notes, continuous margins and alignment (#50)", () => {
  it("a note continued across a width change draws each word once", () => {
    const words = Array.from({ length: 1800 }, (_, i) => `N${String(i).padStart(4, "0")}`);
    const { composed, done } = compose(
      "---\nview: tracked\npage: Letter portrait, margins 1in, header/footer 0.5in\nsections:\n  2: {p2-p2, page: Letter landscape, margins 1in, header/footer 0.5in}\n---\n\n" +
        `<!-- p0 -->\nFIRST[^1]\n\n<!-- p1 section-break -->\n\n<!-- p2 -->\nSECOND\n\n<!-- footnotes.p0 Normal -->\n[^1]: ${words.join(" ")}\n`,
    );
    const drawn = composed.footnoteFragments
      .flatMap((f) => f.lines.flatMap((l) => l.runs.map((r) => r.text)))
      .join("")
      .split(/\s+/)
      .filter(Boolean);
    expect(drawn.length).toBe(1800);
    expect(new Set(drawn).size).toBe(1800);
    done();
  });
  it("a continuous section's left and right margins apply at the break", () => {
    const words = Array.from({ length: 1200 }, (_, i) => `P${String(i).padStart(4, "0")}`).join(
      " ",
    );
    const { composed, done } = compose(
      "---\nview: tracked\npage: Letter portrait, margins 1in, header/footer 0.5in\nsections:\n  2: {p2-p2, page: Letter portrait, margins top 1in, right 2in, bottom 1in, left 2in, header/footer 0.5in, starts continuous}\n---\n\n" +
        `<!-- p0 -->\nFIRST\n\n<!-- p1 section-break -->\n\n<!-- p2 -->\n${words}\n`,
    );
    const first = composed.layout.pages[0];
    // On page 1 the section's text column starts 96px further right and is 432px wide.
    const runs = bodyRuns(composed, 0).filter((r) => r.text.startsWith("P"));
    expect(runs.length).toBeGreaterThan(0);
    expect(Math.min(...runs.map((r) => r.x))).toBeGreaterThanOrEqual(96 - 0.5);
    expect(Math.max(...runs.map((r) => r.x + r.width))).toBeLessThanOrEqual(96 + 432 + 8);
    for (const [i, page] of composed.layout.pages.entries()) {
      const right = Math.max(...bodyRuns(composed, i).map((r) => r.x + r.width));
      expect(right, `page ${i + 1}`).toBeLessThanOrEqual(contentWidth(i ? page : first) + 8);
    }
    done();
  });
  it("right and centre alignment place the line against the edge or the middle", () => {
    const { composed, done } = compose(
      `${header()}<!-- p0 right -->\nRIGHTWORD\n\n<!-- p1 center -->\nCENTREWORD\n\n<!-- p2 -->\nLEFTWORD\n`,
    );
    const width = contentWidth(composed.layout.pages[0]);
    const run = (word) => bodyRuns(composed, 0).find((r) => r.text.includes(word));
    const right = run("RIGHTWORD"),
      centre = run("CENTREWORD"),
      left = run("LEFTWORD");
    expect(right.x + right.width).toBeCloseTo(width, 0);
    expect(centre.x + centre.width / 2).toBeCloseTo(width / 2, 0);
    expect(left.x).toBe(0);
    done();
  });
});

describe("list numbers in continuous sections and right-to-left lines (#51)", () => {
  it("a list number moves with its text to a continuous section's margin", () => {
    const { container, done } = compose(
      "---\nview: tracked\npage: Letter portrait, margins 1in, header/footer 0.5in\nsections:\n  2: {p2-p3, page: Letter portrait, margins top 1in, right 2in, bottom 1in, left 2in, header/footer 0.5in, starts continuous}\n---\n\n" +
        '<!-- p0 -->\nFIRST\n\n<!-- p1 section-break -->\nBREAK\n\n<!-- p2 ListParagraph num "1." -->\n1. SECOND\n\n<!-- p3 ListParagraph num "2." -->\n2. THIRD\n',
    );
    const markers = [...container.querySelectorAll(".paged-marker")];
    expect(markers.length).toBe(2);
    for (const marker of markers) {
      const block = marker.parentElement;
      const word = [...block.querySelectorAll(".premirror-run")].find((r) =>
        /SECOND|THIRD/.test(r.textContent),
      );
      const markerRight = parseFloat(marker.style.left) + parseFloat(marker.style.width);
      expect(markerRight).toBeLessThanOrEqual(parseFloat(word.style.left) + 0.5);
      expect(markerRight).toBeGreaterThan(96);
    }
    done();
  });
  it("a right-to-left line runs its words from the right, across formatting", () => {
    const { composed, container, done } = compose(
      `${header()}<!-- p0 right -->\nمرحبا **بكم** اليوم\n`,
    );
    // Each span reads right to left too, so a run's trailing space falls between the words.
    const spans = [...container.querySelectorAll(".premirror-run")].filter((r) =>
      r.textContent.trim(),
    );
    expect(spans.length).toBe(3);
    for (const span of spans) expect(span.getAttribute("dir")).toBe("rtl");
    const runs = bodyRuns(composed, 0);
    const at = (word) => runs.find((r) => r.text.includes(word));
    const first = at("مرحبا"),
      second = at("بكم"),
      third = at("اليوم");
    expect(first.x).toBeGreaterThan(second.x);
    expect(second.x).toBeGreaterThan(third.x);
    const width = contentWidth(composed.layout.pages[0]);
    expect(first.x + first.width).toBeGreaterThan(width - 12);
    done();
  });
});

describe("mixed directions keep each phrase's order across formatting (#53)", () => {
  const order = (composed, words) => {
    const runs = bodyRuns(composed, 0);
    return words.map((w) => runs.find((r) => r.text.includes(w)).x);
  };
  it("an English phrase inside a right-to-left line reads left to right", () => {
    const { composed, container, done } = compose(
      `${header()}<!-- p0 right -->\nمرحبا **hello** world\n`,
    );
    const [arabic, hello, world] = order(composed, ["مرحبا", "hello", "world"]);
    expect(hello).toBeLessThan(world);
    expect(arabic).toBeGreaterThan(world);
    const dirs = [...container.querySelectorAll(".premirror-run")].map((s) => [
      s.textContent.trim(),
      s.getAttribute("dir"),
    ]);
    expect(dirs).toContainEqual(["مرحبا", "rtl"]);
    expect(dirs).toContainEqual(["hello", "ltr"]);
    done();
  });
  it("an Arabic phrase inside an English line reads right to left", () => {
    const { composed, done } = compose(`${header()}<!-- p0 -->\nSay **مرحبا** بكم now\n`);
    const [say, first, second, now] = order(composed, ["Say", "مرحبا", "بكم", "now"]);
    expect(say).toBeLessThan(second);
    expect(second).toBeLessThan(first);
    expect(first).toBeLessThan(now);
    done();
  });
});

describe("numbers keep their order inside right-to-left text (#55)", () => {
  it("a number split by formatting reads left to right", () => {
    const { composed, done } = compose(`${header()}<!-- p0 -->\nשלום **12**_34_ עולם\n`);
    const runs = bodyRuns(composed, 0);
    const at = (w) => runs.find((r) => r.text.includes(w)).x;
    expect(at("12")).toBeLessThan(at("34"));
    expect(at("34")).toBeLessThan(at("שלום"));
    expect(at("עולם")).toBeLessThan(at("12"));
    done();
  });
  it("a number after English in a right-to-left line stays with it", () => {
    const { composed, done } = compose(`${header()}<!-- p0 -->\nשלום **Room** 12 עולם\n`);
    const runs = bodyRuns(composed, 0);
    const at = (w) => runs.find((r) => r.text.includes(w)).x;
    expect(at("Room")).toBeLessThan(at("12"));
    done();
  });
});

describe("separators and signs belong to their number in right-to-left text (#56)", () => {
  const visual = (composed, chars) =>
    bodyRuns(composed, 0)
      .filter((r) => [...chars].some((c) => r.text.includes(c)))
      .sort((a, b) => a.x - b.x)
      .map((r) => r.text.trim())
      .join("");
  it("a formatted decimal point or thousands comma keeps the number whole", () => {
    for (const [source, number] of [
      ["12<b>.</b>34", "12.34"],
      ["12<b>,</b>345", "12,345"],
      ["<b>$</b>12", "$12"],
      ["12<b>%</b>", "12%"],
      ["12%", "12%"],
      ["$12", "$12"],
      ["12.5", "12.5"],
      ["<b>12</b>% ", "12%"],
      [" $<b>12</b>", "$12"],
      ["<b>12</b>.5", "12.5"],
    ]) {
      const { composed, done } = compose(`${header()}<!-- p0 -->\nשלום ${source} סוף\n`);
      expect(visual(composed, "0123456789.,$%"), source).toBe(number);
      done();
    }
  });
});

describe("links are one control, never swallowed by a comment (#57)", () => {
  const focusable = (container) =>
    [...container.querySelectorAll("a")].filter(
      (a) => a.tabIndex >= 0 && a.getAttribute("aria-hidden") !== "true",
    );
  it("Enter and a click on a commented link reach the link, not the discussion", () => {
    const opened = [];
    const { container, done } = compose(
      `${header()}<!-- p0 -->\nBefore {==[link](https://example.com)==}{>>c0 @A: comment<<} after\n`,
      { onSelect: (id) => opened.push(id) },
    );
    const [link] = focusable(container);
    expect(link.getAttribute("href")).toBe("https://example.com");
    const key = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    link.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.addEventListener("click", (e) => e.preventDefault(), { once: true });
    link.dispatchEvent(click);
    expect(opened).toEqual([]);
    const button = link.closest("[role=button]");
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(opened.length).toBe(1);
    done();
  });
  it("a link with formatting inside is one focus stop named by its whole text", () => {
    const { container, done } = compose(
      `${header()}<!-- p0 -->\n[one **two** three](https://example.com)\n`,
    );
    const links = focusable(container);
    expect(links.length).toBe(1);
    expect(links[0].getAttribute("aria-label") ?? links[0].textContent).toBe("one two three");
    expect(container.querySelectorAll("a").length).toBe(3);
    links[0].dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    links[0].focus();
    expect(container.querySelectorAll("a.link-focus").length).toBe(3);
    links[0].blur();
    expect(container.querySelectorAll("a.link-focus").length).toBe(0);
    done();
  });
  it("a link that wraps across lines is one focus stop", () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const { container, done } = compose(
      `${header()}<!-- p0 -->\n[${words}](https://example.com)\n`,
    );
    expect(container.querySelectorAll("a").length).toBeGreaterThan(1);
    const links = focusable(container);
    expect(links.length).toBe(1);
    expect(links[0].getAttribute("aria-label")).toBe(words);
    done();
  });
});
