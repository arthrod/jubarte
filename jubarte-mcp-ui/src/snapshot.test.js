// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// What the paginator is handed, per view mode, before any layout.
import { describe, expect, it } from "vitest";
import { DOMSerializer } from "prosemirror-model";
import readerCss from "../reader/style.css?raw";
import { parseJubarte } from "../reader/jubarte.mjs";
import { buildSnapshot, typeSize } from "../reader/pagination.js";

const view = (body) => parseJubarte(`---\nview: tracked\n---\n\n${body}\n`);
const runs = (snapshot) =>
  snapshot.blocks
    .flatMap((b) => b.runs ?? [])
    .map((r) => ({ text: r.text, ...snapshot.runMap.get(r.id) }));

describe("buildSnapshot", () => {
  it("K157: omits an inserted empty paragraph only in the original fallback", () => {
    const result = view("<!-- p0 -->\nBEFORE\n\n<!-- p1 -->\n¶{r3 @A}\n\n<!-- p2 -->\nAFTER");
    for (const mode of ["tracked", "accepted", "original"]) {
      const blocks = buildSnapshot(result, mode).blocks.filter((b) => !b.attrs.spacer);
      expect(blocks.map((b) => b.attrs.sourceData.agentId)).toEqual(
        mode === "original" ? ["p0", "p2"] : ["p0", "p1", "p2"],
      );
      expect(blocks.flatMap((b) => b.runs.map((r) => r.text))).toEqual(["BEFORE", "AFTER"]);
    }
  });

  it("K157: draws the inserted empty line's rule only in tracked mode", () => {
    const result = view("<!-- p0 -->\nBEFORE\n\n<!-- p1 -->\n¶{r3 @A}\n\n<!-- p2 -->\nAFTER");
    const style = document.createElement("style");
    style.textContent = readerCss;
    const container = document.createElement("article");
    container.append(DOMSerializer.fromSchema(result.schema).serializeFragment(result.doc.content));
    document.head.append(style);
    document.body.append(container);
    try {
      const empty = container.querySelector('[data-agent-id="p1"]');
      expect(empty.textContent).toBe("");
      expect(empty.classList.contains("structural-insertion")).toBe(true);
      // jsdom cannot resolve var(--ins) in the border shorthand; pin the real rule.
      const insertionRule = [...style.sheet.cssRules].find(
        (rule) => rule.selectorText === ".structural-insertion",
      );
      expect(insertionRule.style.getPropertyValue("border-left")).toBe("2px solid var(--ins)");
      for (const mode of ["tracked", "original", "accepted"]) {
        container.dataset.mode = mode;
        const css = getComputedStyle(empty);
        expect(css.display).toBe(mode === "original" ? "none" : "block");
        expect(css.paddingLeft).toBe(mode === "accepted" ? "0px" : "9px");
        if (mode === "accepted") expect(css.borderLeftWidth).toBe("0px");
      }
    } finally {
      container.remove();
      style.remove();
    }
  });

  it("marks an image's alt text as an image, not body text (b100)", () => {
    const snapshot = buildSnapshot(
      view("![dot_green.png](data:image/png;base64,AA==)Centered images"),
      "tracked",
    );
    const all = runs(snapshot);
    expect(all.find((r) => r.text === "dot_green.png")?.image).toBe(true);
    expect(all.find((r) => r.text.startsWith("Centered"))?.image).toBeFalsy();
  });

  it("draws body text at Word's size: own, else its style's, else Normal's, else 11pt (#102)", () => {
    expect(typeSize({}, false)).toBeCloseTo((11 * 4) / 3, 6);
    expect(typeSize({}, false, 12)).toBe(16);
    expect(typeSize({ documentStyle: { fontSizePt: 9 } }, false, 12)).toBe(12);
    expect(typeSize({ fontSizePt: 30, documentStyle: { fontSizePt: 9 } }, false)).toBe(40);
    expect(typeSize({ fontSizePt: 6 }, false)).toBe(8);
    expect(typeSize({ paragraphProperties: { fontSizePt: 9 } }, false)).toBe(12);
  });

  it("draws table cells at Word's size too, now that rows take Word's heights (#102)", () => {
    expect(typeSize({}, true, 11)).toBeCloseTo(44 / 3, 6);
    expect(typeSize({ fontSizePt: 10 }, true, 12)).toBeCloseTo(40 / 3, 6);
    expect(typeSize({ fontSizePt: 6 }, true)).toBe(8);
    expect(typeSize({ fontSizePt: 24 }, true)).toBe(32);
  });
});
