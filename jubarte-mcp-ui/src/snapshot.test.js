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
    expect(typeSize({ paragraphProperties: { fontSizePt: 9 } }, false)).toBe(12);
    expect(typeSize({}, true)).toBe(14);
    expect(typeSize({ fontSizePt: 10 }, true)).toBe(40 / 3);
    expect(typeSize({ fontSizePt: 6 }, true)).toBe(9);
  });
});
