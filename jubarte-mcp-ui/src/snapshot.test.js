// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// What the paginator is handed, per view mode, before any layout.
import { describe, expect, it } from "vitest";
import { parseJubarte } from "../reader/jubarte.mjs";
import { buildSnapshot, typeSize } from "../reader/pagination.js";

const view = (body) => parseJubarte(`---\nview: tracked\n---\n\n${body}\n`);
const runs = (snapshot) =>
  snapshot.blocks
    .flatMap((b) => b.runs ?? [])
    .map((r) => ({ text: r.text, ...snapshot.runMap.get(r.id) }));

describe("buildSnapshot", () => {
  it("preserves an explicit code-block family and the default code faces (K87)", () => {
    const result = view("```\nsource code\n```\n\nAn `inline` expression.");
    const fonts = (snapshot) => snapshot.blocks.flatMap((b) => b.runs ?? []);
    expect(
      fonts(buildSnapshot(result)).find((r) => r.text === "source code").font,
    ).toBe('normal 400 13px "JetBrains Mono", monospace');
    const block = result.doc.firstChild;
    const styled = result.schema.nodes.code_block.create(
      {
        ...block.attrs,
        data: {
          ...block.attrs.data,
          documentStyle: { fontFamily: "Courier New" },
        },
      },
      block.content,
    );
    const doc = result.schema.nodes.doc.create(null, [
      styled,
      result.doc.child(1),
    ]);
    const all = fonts(buildSnapshot({ ...result, doc }));
    expect(all.find((r) => r.text === "source code").font).toBe(
      'normal 400 13px "Courier New", "Jubarte Page Mono", monospace',
    );
    expect(all.find((r) => r.text === "inline").font).toBe(
      'normal 400 13px "JetBrains Mono", monospace',
    );
  });

  it("describes approximate fallback as conditional on local availability (K91)", () => {
    const result = view("A Georgia paragraph.");
    result.metadata.styles.Normal.fontFamily = "Georgia";
    const snapshot = buildSnapshot(result);
    expect(snapshot.notices).toContain(
      "Georgia is not bundled; if it is unavailable locally, the card uses Jubarte Page Serif, whose letters are not the same width, so lines may break where Word's do not.",
    );
    expect(snapshot.blocks[0].runs[0].font).toContain(
      '"Georgia", "Jubarte Page Serif", serif',
    );
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

  it("scales Word sizes into the card's line grid", () => {
    expect(typeSize({}, false)).toBe(16);
    expect(typeSize({ fontSizePt: 12 }, false)).toBe(16);
    expect(typeSize({ fontSizePt: 30 }, false)).toBe(22);
    expect(typeSize({ fontSizePt: 6 }, false)).toBe(11);
    expect(typeSize({ paragraphProperties: { fontSizePt: 9 } }, false)).toBe(
      12,
    );
    expect(typeSize({}, true)).toBe(14);
    expect(typeSize({ fontSizePt: 10 }, true)).toBe(40 / 3);
    expect(typeSize({ fontSizePt: 6 }, true)).toBe(9);
  });
});
