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

describe("a complete footnote never continues onto another page (#58)", () => {
  it("the spacer after a one-word note on a short page makes no continued page", () => {
    const { composed, container, done } = compose(
      `---\nview: tracked\npage: Letter portrait, margins 1in, header/footer 1in\nsections:\n  2: {p2-p2, page: 6x2in landscape, margins 0.5in, header/footer 0.5in}\n---\n\n<!-- p0 -->\nFIRST\n\n<!-- p1 section-break -->\nBREAK\n\n<!-- p2 -->\nSECOND[^1]\n\n<!-- footnotes.p0 -->\n[^1]: NOTE\n`,
    );
    expect(composed.layout.pages.length).toBe(2);
    expect(container.textContent).not.toContain("(continued)");
    expect(container.textContent).toContain("NOTE");
    done();
  });
  it("a page the text fills exactly starts the next page with text, not a spacer", () => {
    // 6x2in with 0.5in margins: a 96px frame holds three 29px lines.
    const paras = ["A1", "A2", "A3", "B1"].map((t, i) => `<!-- p${i} -->\n${t}`).join("\n\n");
    const { composed, done } = compose(
      `---\nview: tracked\npage: 6x2in landscape, margins 0.5in, header/footer 0.5in\n---\n\n${paras}\n`,
    );
    for (const page of composed.layout.pages.slice(1)) {
      const first = page.frames[0].fragments[0];
      expect(first.blockId.startsWith("space-"), first.blockId).toBe(false);
    }
    done();
  });
});

describe("list markers are Word's, from the engine (#59)", () => {
  const md = [
    "---\nview: tracked\npage: Letter portrait, margins 1in, header/footer 0.5in\n---\n",
    '<!-- p0 ListParagraph, num "1." -->\n1. Binary Fission',
    '<!-- p1 ListParagraph, num "2." -->\n2. Mitosis\n\n   <!-- p2 ListParagraph, num "a." -->\n   1. Define:',
    "<!-- p3 ListParagraph left 1in -->\nGap",
    '<!-- p4 ListParagraph, num "b.", level 1 -->\n2. Label and Explain:',
    '<!-- p5 ListParagraph, num "3." -->\n3. Meiosis',
  ].join("\n\n");
  it("draws the num label, not the markdown position", () => {
    const { container, done } = compose(md);
    const markers = [...container.querySelectorAll(".paged-marker")].map((m) => m.textContent);
    expect(markers).toEqual(["1.", "2.", "a.", "b.", "3."]);
    done();
  });
  it("indents a paragraph by its level clause, the drafter's nesting", () => {
    const { container, done } = compose(md);
    const left = (text) => {
      const block = [...container.querySelectorAll(".paged-block")].find((b) =>
        b.textContent.includes(text),
      );
      return block.querySelector(".paged-marker").style.left;
    };
    expect(left("Label and Explain")).toBe(left("Define:"));
    expect(left("Label and Explain")).not.toBe(left("Mitosis"));
    done();
  });
});

describe("Arabic-Indic digits are Arabic numbers, class AN (#60)", () => {
  const at = (composed, w) => bodyRuns(composed, 0).find((r) => r.text.includes(w)).x;
  it("two formatted Arabic-Indic numbers after English read right to left as a group", () => {
    const { composed, done } = compose(
      `${header()}<!-- p0 -->\nA **\u0661\u0662\u0663** _\u0664\u0665\u0666_\n`,
    );
    expect(at(composed, "A")).toBeLessThan(at(composed, "\u0664\u0665\u0666"));
    expect(at(composed, "\u0664\u0665\u0666")).toBeLessThan(at(composed, "\u0661\u0662\u0663"));
    done();
  });
  it("European digits after English keep reading left to right (W7)", () => {
    const { composed, done } = compose(`${header()}<!-- p0 -->\nA **123** _456_\n`);
    expect(at(composed, "A")).toBeLessThan(at(composed, "123"));
    expect(at(composed, "123")).toBeLessThan(at(composed, "456"));
    done();
  });
});

describe("keep with next reaches past the spacer (#62)", () => {
  it("a keep-next heading moves to the page of the paragraph after it", () => {
    const { composed, done } = compose(
      `---\nview: tracked\npage: 6x3in landscape, margins 0.5in, header/footer 0.5in\nstyles:\n  Normal: Calibri 11pt, after 8pt, line 1.08, left\n  "#": Heading1, Calibri bold 16pt, before 12pt, after 4pt, keep-next, keep-lines\n---\n\n<!-- p0 -->\nBEFORE_ONE\n\n<!-- p1 -->\nBEFORE_TWO\n\n<!-- p2 -->\n# KEEP_HEADING\n\n<!-- p3 -->\nFOLLOWING_BODY\n`,
    );
    const pageOf = (text) =>
      composed.layout.pages.findIndex((page) =>
        page.frames[0].fragments.some((f) =>
          (f.lines || []).some((l) => (l.runs || []).some((r) => r.text?.includes(text))),
        ),
      );
    expect(pageOf("FOLLOWING_BODY")).toBeGreaterThan(0);
    expect(pageOf("KEEP_HEADING")).toBe(pageOf("FOLLOWING_BODY"));
    done();
  });
});

describe("paragraph indents are Word's w:ind (#63)", () => {
  const words = (tag) => Array.from({ length: 40 }, (_, i) => `${tag}${i}`).join(" ");
  const lines = (composed, tag) =>
    composed.layout.pages[0].frames[0].fragments.flatMap((f) =>
      (f.lines || [])
        .filter((l) => l.runs.some((r) => r.text?.includes(tag)))
        .map((l) => Math.min(...l.runs.filter((r) => r.text?.trim()).map((r) => r.x))),
    );
  it("left, first-line and hanging indents place the first and following lines", () => {
    const { composed, done } = compose(
      `${header()}<!-- p0 -->\n${words("plain")}\n\n<!-- p1 first-line 0.5in, left 1in -->\n${words("ind")}\n\n<!-- p2 hanging 0.5in, left 1in -->\n${words("hang")}\n`,
    );
    const [plain, indented, hanging] = [
      lines(composed, "plain"),
      lines(composed, "ind"),
      lines(composed, "hang"),
    ];
    expect(plain[0]).toBe(0);
    expect(indented[0]).toBeCloseTo(144, 0);
    expect(indented[1]).toBeCloseTo(96, 0);
    expect(hanging[0]).toBeCloseTo(48, 0);
    expect(hanging[1]).toBeCloseTo(96, 0);
    done();
  });
  it("a style's indents reach its paragraphs; a paragraph's own clause wins per side (#96)", () => {
    const styles =
      "styles:\n  Normal: Calibri 11pt, after 8pt, line 1.08, left\n  Hang: Calibri 11pt, indent 1in, hanging 0.5in\n  First: Calibri 11pt, first-line 0.5in\n";
    const { composed, done } = compose(
      `${header(styles)}<!-- p0 Hang -->\n${words("sty")}\n\n<!-- p1 Hang, left 2in -->\n${words("own")}\n\n<!-- p2 First -->\n${words("fst")}\n\n<!-- p3 Hang, first-line 0.25in -->\n${words("pair")}\n`,
    );
    const [styled, own, first] = [lines(composed, "sty"), lines(composed, "own"), lines(composed, "fst")];
    // Word's PDF: the paragraph's own first-line replaces the style's hanging, the style's left stays.
    const pair = lines(composed, "pair");
    expect(pair[0]).toBeCloseTo(120, 0);
    expect(pair[1]).toBeCloseTo(96, 0);
    expect(styled[0]).toBeCloseTo(48, 0);
    expect(styled[1]).toBeCloseTo(96, 0);
    expect(own[0]).toBeCloseTo(144, 0);
    expect(own[1]).toBeCloseTo(192, 0);
    expect(first[0]).toBeCloseTo(48, 0);
    expect(first[1]).toBe(0);
    done();
  });
  it("a manual line break continues the paragraph: the first-line indent applies once (#66)", () => {
    const { composed, done } = compose(
      `${header()}<!-- p0 first-line 1in -->\nFIRST\\\nSECOND\n\n<!-- p1 hanging 0.5in, left 1in -->\nHFIRST\\\nHSECOND\n`,
    );
    expect(lines(composed, "FIRST")[0]).toBeCloseTo(96, 0);
    expect(lines(composed, "SECOND")[0]).toBe(0);
    expect(lines(composed, "HFIRST")[0]).toBeCloseTo(48, 0);
    expect(lines(composed, "HSECOND")[0]).toBeCloseTo(96, 0);
    done();
  });
  it("a word wider than the line keeps the paragraph's indents (#72)", () => {
    const long = "X".repeat(150);
    const { composed, done } = compose(
      `${header()}<!-- p0 first-line 0.5in -->\nF${long}\n\n<!-- p1 hanging 0.5in, left 0.5in -->\nH${long}\n`,
    );
    const starts = (tag) =>
      composed.layout.pages[0].frames[0].fragments
        .filter((f) => (f.lines || []).some((l) => l.runs.some((r) => r.text?.startsWith(tag))))
        .flatMap((f) => f.lines.map((l) => Math.round(Math.min(...l.runs.map((r) => r.x)))));
    const first = starts("F"),
      hanging = starts("H");
    expect(first[0]).toBe(48);
    expect(first[1]).toBe(0);
    expect(hanging[0]).toBe(0);
    expect(hanging[1]).toBe(48);
    done();
  });
  it("a right indent narrows the lines", () => {
    const { composed, done } = compose(`${header()}<!-- p0 right 2in -->\n${words("narrow")}\n`);
    const right = Math.max(...bodyRuns(composed, 0).map((r) => r.x + r.width));
    expect(right).toBeLessThanOrEqual(contentWidth(composed.layout.pages[0]) - 192 + 1);
    done();
  });
  it("negative indents run into the margin, as Word draws them (#83)", () => {
    const { composed, done } = compose(
      `${header()}<!-- p0 hanging 0in, left -0.5in -->\n${words("neg")}\n\n<!-- p1 hanging 0.5in, left 0in -->\n${words("hz")}\n\n<!-- p2 right -1in -->\n${words("wide")}\n`,
    );
    const negative = lines(composed, "neg"),
      hanging = lines(composed, "hz");
    expect(negative[0]).toBeCloseTo(-48, 0);
    expect(negative[1]).toBeCloseTo(-48, 0);
    expect(hanging[0]).toBeCloseTo(-48, 0);
    expect(hanging[1]).toBe(0);
    const right = Math.max(
      ...composed.layout.pages[0].frames[0].fragments
        .flatMap((f) => (f.lines || []).filter((l) => l.runs.some((r) => r.text?.includes("wide"))))
        .flatMap((l) => l.runs.filter((r) => r.text?.trim()).map((r) => r.x + r.width)),
    );
    expect(right).toBeGreaterThan(contentWidth(composed.layout.pages[0]) + 24);
    done();
  });
});

describe("a table narrower than the text area keeps Word's width (#65)", () => {
  it("a fixed 3in table in a landscape section draws 3in wide", () => {
    const { composed, done } = compose(
      `---\nview: tracked\npage: Letter portrait, margins 1in, header/footer 0.5in\nsections:\n  2: {p1-p5, page: Letter landscape, margins 1in, header/footer 0.5in}\n---\n\n<!-- p0 section-break -->\nFIRST\n\n<!-- t0 2x2, cells p1-p4 by row, widths 1.5in 1.5in, width 3in, layout fixed, header row repeats -->\n|COL1|COL2|\n|-|-|\n|LEFT|RIGHT|\n\n<!-- p5 empty -->\n`,
    );
    const t = composed.tableFragments.find((f) => f.pageIndex === 1);
    expect(t).toBeTruthy();
    expect(Math.round(t.width)).toBe(288);
    expect(
      t.columnWidths?.map(Math.round) ??
        t.cells.filter((c) => c.rowIndex === 0).map((c) => Math.round(c.width)),
    ).toEqual([144, 144]);
    done();
  });
});

describe("a table's layout and place are Word's (#67, #68, #69)", () => {
  const doc = (head, cell = "LEFT") =>
    `---\nview: tracked\npage: Letter landscape, margins 1in, header/footer 0.5in\n---\n\n<!-- ${head} -->\n|COL1|COL2|\n|-|-|\n|${cell}|RIGHT|\n`;
  const table = (markdown) => {
    const { composed, done } = compose(markdown);
    const t = composed.tableFragments[0];
    const runs = composed.layout.pages[0].frames[0].fragments
      .filter((f) => f.tableCell)
      .flatMap((f) => f.lines.flatMap((l) => l.runs));
    done();
    return { t, runs };
  };
  it("a fixed-layout table keeps its grid width; a long word breaks inside its column (#67)", () => {
    const { t } = table(
      doc(
        "t0 2x2, cells p0-p3 by row, widths 1.5in 1.5in, width 3in, layout fixed",
        "W".repeat(60),
      ),
    );
    expect(Math.round(t.width)).toBe(288);
    expect(t.columnWidths.map(Math.round)).toEqual([144, 144]);
    // The broken word starts on the cell's first line: no empty lines before it.
    const cell = t.cells.find((c) => c.rowIndex === 1 && c.columnIndex === 0);
    expect(cell.lines[0].runs.map((r) => r.text).join("")).toMatch(/^W+$/);
  });
  it("a fixed-layout table lends a wide column's room to a word that fits the table (b097)", () => {
    const { t } = table(
      doc(
        "t0 2x2, cells p0-p3 by row, widths 0.4in 2.6in, width 3in, layout fixed",
        "Interdependencies",
      ),
    );
    expect(Math.round(t.width)).toBe(288);
    expect(t.columnWidths[0]).toBeGreaterThan(0.4 * 96);
  });
  it("an autofit table still grows for a long word", () => {
    const { t } = table(
      doc("t0 2x2, cells p0-p3 by row, widths 1.5in 1.5in, width 3in", "W".repeat(60)),
    );
    expect(t.width).toBeGreaterThan(288);
  });
  it("a centred or right-aligned table sits where Word puts it (#68)", () => {
    const centre = table(
      doc("t0 center 2x2, cells p0-p3 by row, widths 1.5in 1.5in, width 3in, layout fixed"),
    );
    const right = table(
      doc("t0 right 2x2, cells p0-p3 by row, widths 1.5in 1.5in, width 3in, layout fixed"),
    );
    const left = table(
      doc("t0 2x2, cells p0-p3 by row, widths 1.5in 1.5in, width 3in, layout fixed"),
    );
    expect(Math.round(centre.t.x - left.t.x)).toBe(288);
    expect(Math.round(right.t.x - left.t.x)).toBe(576);
    const first = (r) =>
      Math.min(...r.runs.filter((x) => x.text?.includes("COL1")).map((x) => x.x));
    expect(Math.round(first(centre) - first(left))).toBe(288);
  });
  it("a table's indent moves it in from the margin (#69)", () => {
    const left = table(
      doc("t0 2x2, cells p0-p3 by row, widths 1.5in 1.5in, width 3in, layout fixed"),
    );
    const indented = table(
      doc("t0 2x2, cells p0-p3 by row, widths 1.5in 1.5in, width 3in, indent 0.5in, layout fixed"),
    );
    expect(Math.round(indented.t.x - left.t.x)).toBe(48);
  });
});

describe("a table row splits across pages, as Word's rows do by default (#70)", () => {
  it("a tall row starts under the rows before it and continues on the next page", () => {
    const cell = Array.from({ length: 6 }, (_, i) => `ROW2_LINE_${i}`).join("<br/>");
    const { composed, done } = compose(
      `---\nview: tracked\npage: A4 portrait, margins 1in, header/footer 0.5in\nsections:\n  2: {p1-p3, page: 6x4in landscape, margins 1in, header/footer 0.5in}\n---\n\n<!-- p0 section-break -->\nFIRST\n\n<!-- t0 2x1, cells p1-p2 by row, width auto -->\n|ROW1|\n|-|\n|${cell}|\n\n<!-- p3 empty -->\n`,
    );
    const onPage = (i) =>
      composed.layout.pages[i].frames[0].fragments
        .flatMap((f) => (f.lines || []).flatMap((l) => l.runs.map((r) => r.text)))
        .join(" ");
    expect(onPage(1)).toContain("ROW1");
    expect(onPage(1)).toContain("ROW2_LINE_0");
    // Nothing repeats and nothing is lost: the row continues where page 2 ended.
    const all = composed.layout.pages.map((_, i) => onPage(i)).join(" ");
    for (let i = 0; i < 6; i++) expect(all.split(`ROW2_LINE_${i}`).length - 1).toBe(1);
    expect(onPage(2)).toContain("ROW2_LINE_5");
    done();
  });
});

describe("a row Word keeps on one page moves whole (#71)", () => {
  const doc71 = (lines, clause) => {
    const cell = Array.from({ length: lines }, (_, i) => `ROW2_LINE_${i}`).join("<br/>");
    return `---\nview: tracked\npage: A4 portrait, margins 1in, header/footer 0.5in\nsections:\n  2: {p1-p3, page: 6x4in landscape, margins 1in, header/footer 0.5in}\n---\n\n<!-- p0 section-break -->\nFIRST\n\n<!-- t0 2x1, cells p1-p2 by row, width auto${clause} -->\n|ROW1|\n|-|\n|${cell}|\n\n<!-- p3 empty -->\n`;
  };
  const pagesOf = (composed, tag) =>
    composed.layout.pages.flatMap((p, i) =>
      p.frames[0].fragments.some((f) =>
        (f.lines || []).some((l) => l.runs.some((r) => r.text?.startsWith(tag))),
      )
        ? [i]
        : [],
    );
  it("a cant-split row that fits a page starts on the next one", () => {
    const { composed, done } = compose(doc71(6, ", cant-split t0.row1"));
    expect(pagesOf(composed, "ROW1")).toEqual([1]);
    expect(pagesOf(composed, "ROW2_LINE_")).toEqual([2]);
    done();
  });
  it("a table's first row, kept on one page, leaves the text above it and moves whole", () => {
    const cell = Array.from({ length: 5 }, (_, i) => `ROW2_LINE_${i}`).join("<br/>");
    const source = (clause) =>
      `---\nview: tracked\npage: 6x4in landscape, margins 1in, header/footer 0.5in\n---\n\n<!-- p0 -->\nFIRST\n\n<!-- t0 1x1, cells p1-p1 by row, width auto${clause} -->\n|${cell}|\n|-|\n\n<!-- p2 empty -->\n`;
    const split = compose(source(""));
    expect(pagesOf(split.composed, "ROW2_LINE_")).toEqual([0, 1]);
    split.done();
    const { composed, done } = compose(source(", cant-split t0.row0"));
    expect(pagesOf(composed, "FIRST")).toEqual([0]);
    expect(pagesOf(composed, "ROW2_LINE_")).toEqual([1]);
    done();
  });
  it("a cant-split row taller than a page still flows across pages", () => {
    const { composed, done } = compose(doc71(30, ", cant-split t0.row1"));
    const all = composed.layout.pages
      .flatMap((p) =>
        p.frames[0].fragments.flatMap((f) =>
          (f.lines || []).flatMap((l) => l.runs.map((r) => r.text)),
        ),
      )
      .join(" ");
    for (let i = 0; i < 30; i++)
      expect(all.match(new RegExp(`ROW2_LINE_${i}\\b`, "g"))).toHaveLength(1);
    expect(pagesOf(composed, "ROW2_LINE_").length).toBeGreaterThan(1);
    done();
  });
});

describe("a keep-lines paragraph is not split across pages (#75)", () => {
  const lines75 = (tag, n) => Array.from({ length: n }, (_, i) => `${tag}_${i}`).join("  \n");
  const pages75 = (composed, tag) =>
    composed.layout.pages.flatMap((p, i) =>
      p.frames[0].fragments.some((f) =>
        (f.lines || []).some((l) => l.runs.some((r) => r.text?.startsWith(tag))),
      )
        ? [i]
        : [],
    );
  it("without keep-lines the paragraph still splits", () => {
    const { composed, done } = compose(
      `---\nview: tracked\npage: Letter portrait, margins 1in, header/footer 0.5in\n---\n\n<!-- p0 -->\n${lines75("BEFORE", 22)}\n\n<!-- p1 -->\n${lines75("KEPT", 10)}\n`,
    );
    expect(pages75(composed, "KEPT_")).toHaveLength(2);
    done();
  });
  it("a kept paragraph taller than a page still flows across pages", () => {
    const { composed, done } = compose(
      `---\nview: tracked\npage: Letter portrait, margins 1in, header/footer 0.5in\nstyles:\n  KeepAll: Calibri 11pt, keep-lines\n---\n\n<!-- p0 -->\nBEFORE\n\n<!-- p1 KeepAll -->\n${lines75("KEPT", 40)}\n`,
    );
    const pages = pages75(composed, "KEPT_");
    expect(pages[0]).toBe(0);
    expect(pages.length).toBeGreaterThan(1);
    done();
  });
  it("moves whole to the next page when it fits there", () => {
    const lines = (tag, n) => Array.from({ length: n }, (_, i) => `${tag}_${i}`).join("  \n");
    const { composed, done } = compose(
      `---\nview: tracked\npage: Letter portrait, margins 1in, header/footer 0.5in\nstyles:\n  KeepAll: Calibri 11pt, keep-lines\n---\n\n<!-- p0 -->\n${lines("BEFORE", 22)}\n\n<!-- p1 KeepAll -->\n${lines("KEPT", 10)}\n`,
    );
    const pagesOf = (tag) =>
      new Set(
        composed.layout.pages.flatMap((p, i) =>
          p.frames[0].fragments.some((f) =>
            (f.lines || []).some((l) => l.runs.some((r) => r.text?.startsWith(tag))),
          )
            ? [i]
            : [],
        ),
      );
    expect([...pagesOf("KEPT_")]).toHaveLength(1);
    expect([...pagesOf("KEPT_0")][0]).toBeGreaterThan(0);
    done();
  });
});

describe("keep constraints hold wherever the page ends (#76, #77)", () => {
  const fill = (n) => Array.from({ length: n }, (_, i) => `BEFORE_${i}`).join("\\\n");
  const pagesWith = (composed, tag) =>
    new Set(
      composed.layout.pages.flatMap((p, i) =>
        p.frames[0].fragments.some((f) =>
          (f.lines || []).some((l) => l.runs.some((r) => r.text?.startsWith(tag))),
        )
          ? [i]
          : [],
      ),
    );
  const head = `---\nview: tracked\npage: Letter portrait, margins 1in, header/footer 0.5in\nstyles:\n  KeepAll: Calibri 11pt, keep-lines\n---\n\n`;

  it("a chain of headings stays with the paragraph after it (#76)", () => {
    for (let n = 14; n <= 30; n++) {
      const { composed, done } = compose(
        `${head}<!-- p0 -->\n${fill(n)}\n\n# HEADING_A\n\n# HEADING_B\n\n# HEADING_C\n\nFINAL_BODY\n`,
      );
      const pages = new Set(["HEADING_", "FINAL_BODY"].flatMap((t) => [...pagesWith(composed, t)]));
      expect({ n, pages: [...pages] }).toEqual({ n, pages: [[...pages][0]] });
      done();
    }
  });

  it("a kept paragraph makes room for the footnote it references (#77)", () => {
    const note = Array.from({ length: 30 }, (_, i) => `N${String(i).padStart(3, "0")}`).join(" ");
    for (let n = 14; n <= 30; n++) {
      const { composed, done } = compose(
        `${head}<!-- p0 -->\n${fill(n)}\n\n<!-- p1 KeepAll -->\nLINE_ONE\\\nLINE_TWO\\\nLINE_THREE[^1]\\\nLINE_FOUR\n\n<!-- footnotes.p0 -->\n[^1]: ${note}\n`,
      );
      expect({ n, pages: [...pagesWith(composed, "LINE_")] }).toEqual({
        n,
        pages: [[...pagesWith(composed, "LINE_")][0]],
      });
      done();
    }
  });
});

describe("a table's first row is a header only when Word says so (#78)", () => {
  const table = (clause) =>
    `---\nview: tracked\n---\n\n<!-- t0 2x1, cells p0-p1 by row${clause} -->\n|FIRST|\n|-|\n|SECOND|\n`;
  const runOf = (composed, text) =>
    composed.layout.pages[0].frames[0].fragments
      .flatMap((f) => (f.lines || []).flatMap((l) => l.runs))
      .find((r) => r.text === text);
  it("a plain first row keeps normal weight and is no header", () => {
    const { composed, done } = compose(table(""));
    expect(runOf(composed, "FIRST").font).toContain(" 400 ");
    expect(composed.tableFragments[0].rows[0].header).toBe(false);
    done();
  });
  it("a repeating header row is still a header, drawn with its own formatting (#80)", () => {
    const { composed, done } = compose(table(", header row repeats"));
    expect(composed.tableFragments[0].rows[0].header).toBe(true);
    expect(runOf(composed, "FIRST").font).toContain(" 400 ");
    // Word adds no bold and no shading to a header row; neither does the page's stylesheet.
    const css = globalThis.process
      .getBuiltinModule("node:fs")
      .readFileSync("reader/style.css", "utf8");
    expect(css).not.toMatch(/\.paged-grid-table thead\{[^}]*background/);
    expect(css).not.toMatch(/\.paged-grid-table th\{[^}]*font-weight:\s*[6-9]00/);
    done();
  });
});

describe("a heading stays with a table whose first row has a footnote (#79)", () => {
  it("holds at every page offset", () => {
    const fill = (n) => Array.from({ length: n }, (_, i) => `BEFORE_${i}`).join("\\\n");
    const note = Array.from({ length: 30 }, (_, i) => `N${String(i).padStart(3, "0")}`).join(" ");
    for (let n = 14; n <= 30; n++) {
      const { composed, done } = compose(
        `---\nview: tracked\npage: Letter portrait, margins 1in, header/footer 0.5in\n---\n\n<!-- p0 -->\n${fill(n)}\n\n# HEADING\n\n<!-- t0 2x1, cells p2-p3 by row -->\n|ROW_ONE[^1]|\n|-|\n|ROW_TWO|\n\n<!-- footnotes.p0 -->\n[^1]: ${note}\n`,
      );
      const pageOf = (tag) =>
        composed.layout.pages.findIndex((p) =>
          p.frames[0].fragments.some((f) =>
            (f.lines || []).some((l) => l.runs.some((r) => r.text?.startsWith(tag))),
          ),
        );
      expect({ n, heading: pageOf("HEADING") }).toEqual({ n, heading: pageOf("ROW_ONE") });
      done();
    }
  });
});

describe("a cell is aligned once (#81)", () => {
  const doc = (normal, column) =>
    `---\nview: tracked\nstyles:\n  Normal: Calibri 11pt, ${normal}\n---\n\n<!-- t0 1x1, cells p0-p0 by row, widths 6in, width auto -->\n|CENTER|\n|${column}|\n`;
  const xOf = (composed) =>
    composed.layout.pages[0].frames[0].fragments
      .flatMap((f) => (f.lines || []).flatMap((l) => l.runs))
      .find((r) => r.text === "CENTER").x;
  it("a centred Normal and a centred column centre the text once", () => {
    const control = compose(doc("left", ":-:"));
    const centred = compose(doc("center", ":-:"));
    expect(xOf(centred.composed)).toBeCloseTo(xOf(control.composed), 1);
    control.done();
    centred.done();
  });
  it("a column left-aligned in a centred Normal stays left", () => {
    const left = compose(doc("left", "-"));
    const forced = compose(doc("center", ":-"));
    expect(xOf(forced.composed)).toBeCloseTo(xOf(left.composed), 1);
    left.done();
    forced.done();
  });
});

describe("CJK lines keep their punctuation where Word does (#82)", () => {
  const linesOf = (composed) =>
    composed.layout.pages
      .flatMap((p) =>
        p.frames[0].fragments.flatMap((f) =>
          (f.lines || []).map((l) => l.runs.map((r) => r.text).join("")),
        ),
      )
      .filter(Boolean);
  it("no line starts with closing punctuation or ends with an opening bracket, wherever the break falls", () => {
    for (let n = 80; n <= 100; n++) {
      const text = `${"漢".repeat(n)}。${"漢".repeat(10)}「${"漢".repeat(n)}」${"漢".repeat(20)}`;
      const { composed, done } = compose(
        `---\nview: tracked\npage: Letter portrait\n---\n\n${text}\n`,
      );
      const lines = linesOf(composed);
      expect(lines.join("")).toBe(text);
      for (const line of lines) {
        expect({ n, line: line.slice(0, 1) }).not.toEqual({
          n,
          line: expect.stringMatching(/[。」]/),
        });
        expect({ n, end: line.slice(-1) }).not.toEqual({ n, end: "「" });
      }
      done();
    }
  });
});

describe("a paragraph's style draws its bold, italic, underline and strike (#87)", () => {
  const styled = (font) =>
    `---\nview: tracked\npage: Letter portrait\nstyles:\n  Normal: ${font}, after 8pt, line 1.08, left\n---\n\n<!-- p0 -->\nSTYLED\n`;
  const drawn = (container) =>
    [...container.querySelectorAll(".premirror-run")].find((r) => r.textContent.includes("STYLED"));
  it("bold italic underline strike in Normal reach every run", () => {
    const { container, done } = compose(styled("Calibri bold italic underline strike 11pt"));
    const run = drawn(container);
    expect(run.style.font).toContain("italic");
    expect(run.style.font).toContain("600");
    expect([...run.classList]).toEqual(expect.arrayContaining(["underline", "strikethrough"]));
    done();
  });
  it("a named style's bold and italic are already inline: an unmarked run stays plain (#92)", () => {
    for (const mark of ["bold", "italic"]) {
      const md = `---\nview: tracked\npage: Letter portrait\nstyles:\n  Normal: Calibri 11pt, after 8pt, line 1.08, left\n  TestStyle: Calibri ${mark} 11pt\n---\n\n<!-- p0 TestStyle -->\n${mark === "bold" ? "**INHERITED**" : "_INHERITED_"} STYLED\n`;
      const { container, done } = compose(md);
      const run = [...container.querySelectorAll(".premirror-run")].find((r) =>
        r.textContent.includes("STYLED"),
      );
      const inherited = [...container.querySelectorAll(".premirror-run")].find((r) =>
        r.textContent.includes("INHERITED"),
      );
      expect(run.style.font, mark).not.toContain("italic");
      expect(run.style.font, mark).toContain("400");
      expect(inherited.style.font, mark).toContain(mark === "bold" ? "600" : "italic");
      done();
    }
  });
  it("a named style's underline and strike reach its runs, the engine prints neither inline (#96)", () => {
    const md = `---\nview: tracked\npage: Letter portrait\nstyles:\n  Normal: Calibri 11pt, after 8pt, line 1.08, left\n  Emph: Calibri underline strike 11pt\n---\n\n<!-- p0 Emph -->\nSTYLED\n`;
    const { container, done } = compose(md);
    expect([...drawn(container).classList]).toEqual(expect.arrayContaining(["underline", "strikethrough"]));
    done();
  });
  it("a double underline and a double strike keep their kind, not the font's name (#96)", () => {
    const md = `---\nview: tracked\npage: Letter portrait\nstyles:\n  Normal: Calibri 11pt, after 8pt, line 1.08, left\n  Emph: Calibri underline-double dstrike 11pt\n---\n\n<!-- p0 Emph -->\nSTYLED\n`;
    const { container, done } = compose(md);
    const run = drawn(container);
    expect(run.style.font).not.toMatch(/underline|dstrike/);
    expect([...run.classList]).toEqual(
      expect.arrayContaining(["underline", "underline-double", "strikethrough", "strike-double"]),
    );
    done();
  });
  it("a plain Normal stays plain", () => {
    const { container, done } = compose(styled("Calibri 11pt"));
    const run = drawn(container);
    expect(run.style.font).not.toContain("italic");
    expect(run.style.font).toContain("400");
    expect([...run.classList]).not.toContain("underline");
    done();
  });
});
