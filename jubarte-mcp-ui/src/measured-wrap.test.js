// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// Line breaking with measured glyphs, as a browser measures them: jsdom has no
// canvas, so the other layout tests use the reader's fallback metrics.
import { beforeAll, expect, it } from "vitest";
import { parseJubarte } from "../reader/jubarte.mjs";

let mountPagination;
beforeAll(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // Proportional widths at 16px: narrow, wide and space glyphs differ, as in Source Serif;
  // a soft hyphen measures nothing, as a browser measures it.
  const width = (ch) =>
    ch === "\u00ad"
      ? 0
      : ch === " "
        ? 4
        : ch === "w" || ch === "W"
          ? 12
          : /[A-Z]/.test(ch)
            ? 11
            : 8;
  globalThis.OffscreenCanvas = class {
    getContext() {
      const context = {
        font: "",
        // Browsers kern canvas text unless told otherwise.
        fontKerning: "auto",
        measureText: (text) => ({ width: [...text].reduce((n, ch) => n + width(ch), 0) }),
      };
      contexts.push(context);
      return context;
    }
  };
  ({ mountPagination } = await import("../reader/pagination.js"));
});

const contexts = [];

const compose = (markdown) => {
  const container = document.createElement("div");
  document.body.append(container);
  const view = mountPagination(container, parseJubarte(markdown));
  return { composed: view.composed, done: () => (view.destroy(), container.remove()) };
};

// Word fills each line greedily at that line's own width: every line fits it, and no line but
// the last could have taken the next word (#83).
const WORD = 4 + 12 + 3 * 8; // " word"
const fills = (composed, tag, start) => {
  const lines = composed.layout.pages[0].frames[0].fragments
    .filter((f) => (f.lines || []).some((l) => l.runs.some((r) => r.text?.includes(tag))))
    .flatMap((f) => f.lines)
    .map((l) => {
      const text = l.runs.filter((r) => r.text?.trim());
      return {
        left: Math.min(...text.map((r) => r.x)),
        right: Math.max(...text.map((r) => r.x + r.width - (r.text.endsWith(" ") ? 4 : 0))),
      };
    });
  return lines.map((line, i) => ({
    i,
    left: Math.round(line.left),
    fits: line.right <= 624 + 0.5,
    full: i === lines.length - 1 || line.right + WORD > 624 - 0.5,
    start: start(i),
  }));
};
it("first-line, hanging and negative indents wrap each line at its own width (#83)", () => {
  const words = " word".repeat(40);
  const { composed, done } = compose(
    `---\nview: tracked\npage: Letter portrait\n---\n\n<!-- p0 hanging 0.5in, left 1in -->\nHANG${words}\n\n<!-- p1 first-line 1in -->\nFIRST${words}\n\n<!-- p2 hanging 0.5in, left 0in -->\nZERO${words}\n`,
  );
  for (const [tag, start] of [
    ["HANG", (i) => (i ? 96 : 48)],
    ["FIRST", (i) => (i ? 0 : 96)],
    ["ZERO", (i) => (i ? 0 : -48)],
  ])
    for (const line of fills(composed, tag, start))
      expect({ tag, ...line }).toEqual({ tag, ...line, left: line.start, fits: true, full: true });
  done();
});

it("right and centred lines align their letters, the trailing space hangs (#85)", () => {
  const words = Array.from({ length: 40 }, () => "WWWW").join(" ");
  const { composed, done } = compose(
    `---\nview: tracked\npage: Letter portrait\n---\n\n<!-- p0 right -->\nRIGHT ${words}\n\n<!-- p1 center -->\nMIDDLE ${words}\n`,
  );
  const edges = (tag) =>
    composed.layout.pages[0].frames[0].fragments
      .filter((f) => (f.lines || []).some((l) => l.runs.some((r) => r.text?.includes(tag))))
      .flatMap((f) => f.lines)
      .map((l) => {
        const text = l.runs.filter((r) => r.text?.trim());
        const last = text.at(-1);
        const trail = last.text.length - last.text.trimEnd().length;
        return [Math.min(...text.map((r) => r.x)), last.x + last.width - trail * 4];
      });
  for (const [, right] of edges("RIGHT")) expect(right).toBeCloseTo(624, 1);
  for (const [left, right] of edges("MIDDLE")) expect((left + right) / 2).toBeCloseTo(312, 1);
  done();
});

it("the page draws text unkerned, as it is measured and as Word draws it (#86)", () => {
  const css = globalThis.process
    .getBuiltinModule("node:fs")
    .readFileSync("reader/style.css", "utf8");
  // Each run sets the font shorthand inline, which resets font-kerning: the rule must win over it.
  expect(css).toMatch(/\.premirror-page-viewport \*\{[^}]*font-kerning:none!important/);
});

it("a line broken at a soft hyphen draws a hyphen; one mid-line stays invisible (#89)", () => {
  const SHY = "­";
  const long = `${"a".repeat(70)}${SHY}${"b".repeat(20)}`;
  const { composed, done } = compose(
    `---\nview: tracked\npage: Letter portrait\n---\n\n<!-- p0 -->\n${long}\n\n<!-- p1 -->\nab${SHY}cd\n`,
  );
  const lines = composed.layout.pages[0].frames[0].fragments
    .flatMap((f) => f.lines || [])
    .map((l) => l.runs.map((r) => r.text || "").join(""))
    .filter((t) => t.trim());
  done();
  expect(lines[0]).toBe(`${"a".repeat(70)}-`);
  expect(lines[1]).toBe("b".repeat(20));
  expect(lines[2]).toBe(`ab${SHY}cd`);
});

it("a word too wide for the line breaks at its soft hyphen, not between letters (#89)", () => {
  const SHY = "­";
  const { composed, done } = compose(
    `---\nview: tracked\npage: Letter portrait\n---\n\n<!-- p0 -->\n${"a".repeat(70)}${SHY}${"b".repeat(40)}${SHY}${"c".repeat(60)}\n`,
  );
  const lines = composed.layout.pages[0].frames[0].fragments
    .flatMap((f) => f.lines || [])
    .map((l) => l.runs.map((r) => r.text || "").join(""))
    .filter((t) => t.trim());
  done();
  expect(lines).toEqual([`${"a".repeat(70)}-`, `${"b".repeat(40)}-`, "c".repeat(60)]);
});

it("a soft hyphen whose hyphen would overflow yields to an earlier one, not a cut between letters (#89)", () => {
  const SHY = "­";
  // b40 + c38 fill the 624px line exactly; the hyphen after c38 would not fit.
  const { composed, done } = compose(
    `---\nview: tracked\npage: Letter portrait\n---\n\n<!-- p0 -->\n${"a".repeat(70)}${SHY}${"b".repeat(40)}${SHY}${"c".repeat(38)}${SHY}${"d".repeat(10)}\n`,
  );
  const lines = composed.layout.pages[0].frames[0].fragments
    .flatMap((f) => f.lines || [])
    .map((l) => l.runs.map((r) => r.text || "").join(""))
    .filter((t) => t.trim());
  done();
  expect(lines).toEqual([
    `${"a".repeat(70)}-`,
    `${"b".repeat(40)}-`,
    `${"c".repeat(38)}${SHY}${"d".repeat(10)}`,
  ]);
});

it("a no-break space holds its words together across a formatting boundary (#90)", () => {
  const text = (md) => {
    const { composed, done } = compose(
      `---\nview: tracked\npage: Letter portrait\n---\n\n<!-- p0 -->\n${md}\n`,
    );
    const lines = composed.layout.pages[0].frames[0].fragments
      .flatMap((f) => f.lines || [])
      .map((l) => l.runs.map((r) => r.text || "").join(""))
      .filter((t) => t.trim());
    done();
    return lines;
  };
  const a = "a".repeat(73);
  for (const [md, glued] of [
    [`${a} **abc** def`, "abc def"],
    [`${a} abc **def**`, "abc def"],
    [`${a} **abc d**ef`, "abc def"],
    [`${a} **abc**‑def`, "abc‑def"],
  ])
    expect(text(md), JSON.stringify(md.slice(74))).toEqual([`${a} `, glued]);
});

it("a justified paragraph meets both margins on every line but its last (#93)", () => {
  const words = Array.from({ length: 60 }, (_, i) => (i % 3 ? "word" : "wide")).join(" ");
  const { composed, done } = compose(
    `---\nview: tracked\npage: Letter portrait\n---\n\n<!-- p0 justify -->\n${words}\n`,
  );
  const lines = composed.layout.pages[0].frames[0].fragments
    .flatMap((f) => f.lines || [])
    .filter((l) => l.runs.some((r) => r.text?.trim()));
  done();
  const edges = lines.map((l) => {
    const text = l.runs.filter((r) => r.text?.trim());
    const last = text.at(-1);
    const trail = last.text.match(/ +$/)?.[0].length || 0;
    return {
      left: Math.min(...text.map((r) => r.x)),
      // Trailing spaces hang past the margin: the run's width holds them unstretched.
      right: last.x + last.width - trail * 4,
    };
  });
  expect(lines.length).toBeGreaterThan(2);
  for (const edge of edges.slice(0, -1)) {
    expect(edge.left).toBeCloseTo(0, 0);
    expect(edge.right).toBeCloseTo(624, 0);
  }
  expect(edges.at(-1).right).toBeLessThan(600);
});

it("a justified line that ends at a manual break is not stretched (#93)", () => {
  const { composed, done } = compose(
    `---\nview: tracked\npage: Letter portrait\n---\n\n<!-- p0 justify -->\nshort line here\\\nnext line\n`,
  );
  const lines = composed.layout.pages[0].frames[0].fragments
    .flatMap((f) => f.lines || [])
    .filter((l) => l.runs.some((r) => r.text?.trim()));
  done();
  expect(lines.length).toBe(2);
  expect(lines[0].runs.every((r) => !r.wordSpacing)).toBe(true);
});

it("text is measured unkerned, as the page draws it (#94)", () => {
  const { done } = compose(`---\nview: tracked\npage: Letter portrait\n---\n\nAVAWAY To Wa\n`);
  done();
  expect(contexts.length).toBeGreaterThan(0);
  for (const context of contexts) expect(context.fontKerning).toBe("none");
});

it("a line breaks after a hyphen between letters, as Word breaks Санкт-|Петербурга (#137)", () => {
  // a40 + space + b30 + "-" = 572px fits the 624px line; with c30 it would not.
  const text = `${"a".repeat(40)} ${"b".repeat(30)}-${"c".repeat(30)}`;
  const { composed, done } = compose(
    `---\nview: tracked\npage: Letter portrait\n---\n\n<!-- p0 -->\n${text}\n\n<!-- p1 -->\n${"a".repeat(40)} ${"b".repeat(30)}-${"5".repeat(30)}\n`,
  );
  const lines = composed.layout.pages[0].frames[0].fragments
    .flatMap((f) => f.lines || [])
    .map((l) => l.runs.map((r) => r.text || "").join(""))
    .filter((t) => t.trim());
  done();
  expect(lines[0]).toBe(`${"a".repeat(40)} ${"b".repeat(30)}-`);
  expect(lines[1]).toBe("c".repeat(30));
  // No break between a hyphen and a number (UAX #14 HY × NU).
  expect(lines[2]).toBe(`${"a".repeat(40)} `);
  expect(lines[3]).toBe(`${"b".repeat(30)}-${"5".repeat(30)}`);
});
