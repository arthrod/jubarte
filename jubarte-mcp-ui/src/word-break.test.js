// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// The composer moves a word cut at the end of a line to the next line only
// when it sees letters on both sides of the cut. An ASCII-only test broke
// "São" into "Sã" / "o" (b102, a Portuguese bibliography).
import { createLayoutInputFromOptions, defaultPremirrorOptions } from "@premirror/core";
import { describe, expect, it } from "vitest";
import {
  composeLayout,
  isWordChar,
} from "../reader/vendor/premirror/packages/composer/src/index.ts";

describe("isWordChar", () => {
  it("counts letters, digits and combining marks of every spaced script", () => {
    for (const ch of [
      "a",
      "Z",
      "7",
      "ã",
      "é",
      "ü",
      "ß",
      "ø",
      "ł",
      "õ",
      "ж",
      "λ",
      "ש",
      "ع",
      "́",
      "한",
    ])
      expect(isWordChar(ch), ch).toBe(true);
  });
  it("leaves spaces, punctuation and scripts that break between characters", () => {
    for (const ch of [" ", " ", ".", ",", "-", "—", "(", "“", "中", "か", "カ", "ไ", undefined])
      expect(isWordChar(ch), String(ch)).toBe(false);
  });
});

it("K74 preserves a joined emoji before Latin and permits a supplementary Han boundary", () => {
  const lines = layoutLines("👩‍👩‍👧‍👦B", 110);
  expect(lines).toEqual(["👩‍👩‍👧‍👦", "B"]);
  expect(isWordChar("𠀀")).toBe(false);
  expect(layoutLines("𠀀B", 20)).toEqual(["𠀀", "B"]);
});

// Use the upstream composer's snapshot fixture and default layout input.
function layoutLines(text, widthPx) {
  const texts = Array.isArray(text) ? text : [text];
  let at = 1;
  const runs = texts.map((text, i) => {
    const run = {
      id: `r${i}`,
      text,
      font: "16px Inter",
      marks: {},
      pmRange: { from: at, to: at + text.length },
    };
    at += text.length;
    return run;
  });
  const snapshot = {
    blocks: [{ id: "b", type: "paragraph", attrs: {}, pmRange: { from: 1, to: at }, runs }],
    measuredRuns: Object.fromEntries(
      runs.map((r) => [
        r.id,
        { runId: r.id, prepared: {}, widthPx: r.text.length * 10, textLength: r.text.length },
      ]),
    ),
  };
  const input = createLayoutInputFromOptions(
    defaultPremirrorOptions({
      page: { widthPx, heightPx: 1000 },
      margins: { leftPx: 0, rightPx: 0, topPx: 0, bottomPx: 0 },
    }),
  );
  return composeLayout(snapshot, null, input).pages.flatMap((p) =>
    p.frames.flatMap((f) =>
      f.fragments.flatMap((f) => f.lines.map((l) => l.runs.map((r) => r.text).join(""))),
    ),
  );
}

it("K74 repairs words without detaching a variation selector across formatted runs", () => {
  expect(layoutLines(["✈", "\uFE0FAB"], 30)).toEqual(["✈️", "AB"]);
});
it("K74 preserves the supported environment without Intl.Segmenter", () => {
  const saved = Intl.Segmenter;
  try {
    Intl.Segmenter = undefined;
    expect(() => layoutLines("abcdef", 30)).not.toThrow();
  } finally {
    Intl.Segmenter = saved;
  }
});
