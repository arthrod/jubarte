// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// The footnote allocator refits its label room to the lines still to place
// (#126): a note the page being filled holds still counts, one a finished
// page drew does not, and a cut paragraph never gives back the words it drew.
import { describe, expect, it } from "vitest";
import { createFootnoteAllocator } from "../reader/footnote-layout.js";

// One measured word, or one capped picture, per line.
function composeLines(blocks, width, _reach, height) {
  return blocks.flatMap((block) =>
    (block.runs || []).flatMap((run) => {
      if (run.picture) {
        const advance = Math.min(
          height,
          run.picture.heightPx * Math.min(1, width / run.picture.widthPx),
        );
        return [{ blockId: block.id, advance, height: advance, pmRange: run.pmRange, runs: [run] }];
      }
      return [...run.text.matchAll(/\S+\s*/g)].map((m) => ({
        blockId: block.id,
        advance: 10,
        height: 10,
        pmRange: { from: run.pmRange.from + m.index, to: run.pmRange.from + m.index + m[0].length },
        runs: [{ ...run, text: m[0] }],
      }));
    }),
  );
}
const picture = (size = 150) => ({
  id: "pic",
  type: "paragraph",
  attrs: {},
  pmRange: { from: 0, to: 3 },
  runs: [
    {
      id: "picr",
      text: "PIC",
      pmRange: { from: 0, to: 3 },
      picture: { widthPx: size, heightPx: size },
    },
  ],
});
const allocator = (notes, height = 200, width = 200) =>
  createFootnoteAllocator({
    snapshot: { blocks: [], footnotes: notes.map((blocks, i) => ({ id: String(i + 1), blocks })) },
    composeLines,
    width,
    height,
    lineHeight: 10,
    warn: () => {},
  });
const reference = (a, ids, bottom = 10) =>
  a.accept([{ runs: ids.map((footnoteId) => ({ footnoteId })) }], bottom, 0);
const words = (pages) =>
  pages.flatMap((p) =>
    p.fragments.flatMap((f) => f.lines.flatMap((l) => l.runs.map((r) => r.text.trim()))),
  );
const inside = (page, height) => {
  for (const f of page.fragments) {
    expect(f.y).toBeGreaterThanOrEqual(-0.001);
    expect(f.y + f.height).toBeLessThanOrEqual(height + 0.001);
  }
};
const drain = (a, pages, height) => {
  for (let i = 0; a.hasPending && i < 30; i++) {
    a.beginPage();
    a.fillRemainder();
    const page = a.finishPage(pages.length);
    inside(page, height);
    expect(page.fragments.length, "a carried note moves on every page").toBeGreaterThan(0);
    pages.push(page);
  }
  expect(a.hasPending).toBe(false);
  return pages;
};

describe("the footnote label gives way to the lines still to place (#126)", () => {
  it("a picture the filling page requested but has not placed still counts when the frame shrinks", () => {
    const a = allocator([[picture()]]);
    a.beginPage();
    expect(reference(a, ["1"], 100)).toBe(true);
    a.setGeometry({ width: 200, height: 150 });
    a.fillRemainder(100);
    expect(words(drain(a, [a.finishPage(0)], 150))).toEqual(["PIC"]);
  });
  it("a picture the filling page holds still counts when the frame widens", () => {
    const a = allocator([[picture()]], 150, 100);
    a.beginPage();
    expect(reference(a, ["1"])).toBe(true);
    a.setGeometry({ width: 150, height: 150 });
    const page = a.finishPage(0);
    inside(page, 150);
    expect(words([page])).toEqual(["PIC"]);
  });
  it("an orphan note the page requested still counts before the page is finished", () => {
    const a = allocator([[picture()]]);
    a.beginPage();
    a.enqueueOrphans();
    a.setGeometry({ width: 200, height: 150 });
    a.fillRemainder();
    expect(words(drain(a, [a.finishPage(0)], 150))).toEqual(["PIC"]);
  });
  it("a picture a finished page drew no longer shrinks the next note's label", () => {
    const text = {
      id: "t",
      type: "paragraph",
      attrs: {},
      pmRange: { from: 0, to: 4 },
      runs: [{ id: "tr", text: "NEXT", pmRange: { from: 0, to: 4 } }],
    };
    const a = allocator([[picture()], [text]]);
    a.beginPage();
    reference(a, ["1"]);
    expect(words([a.finishPage(0)])).toEqual(["PIC"]);
    a.setGeometry({ width: 200, height: 80 });
    a.beginPage();
    reference(a, ["2"]);
    const page = a.finishPage(1);
    inside(page, 80);
    expect(page.fragments[0].lines[0].y).toBe(20);
  });
});

describe("a carried paragraph without its own range keeps only the words still to draw (#126)", () => {
  for (const split of [false, true])
    it(`across two refits${split ? ", cut between runs" : ""}`, () => {
      const runs = split
        ? [
            { id: "r1", text: "ONE TWO ", pmRange: { from: 0, to: 8 } },
            { id: "r2", text: "THREE FOUR FIVE SIX", pmRange: { from: 8, to: 27 } },
          ]
        : [{ id: "r", text: "ONE TWO THREE FOUR FIVE SIX", pmRange: { from: 0, to: 27 } }];
      const a = allocator([[{ id: "p", type: "paragraph", attrs: {}, runs }]], 62);
      a.beginPage();
      reference(a, ["1"]);
      const first = a.finishPage(0);
      expect(words([first])).toEqual(["ONE", "TWO"]);
      a.setGeometry({ width: 180, height: 72 });
      a.beginPage();
      a.fillRemainder();
      const second = a.finishPage(1);
      a.setGeometry({ width: 160, height: 82 });
      expect(words(drain(a, [first, second], 82))).toEqual([
        "ONE",
        "TWO",
        "THREE",
        "FOUR",
        "FIVE",
        "SIX",
      ]);
    });
});
