// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

import test from "node:test";
import assert from "node:assert/strict";
import { parseJubarte } from "./jubarte.mjs";
import { plain, projectDialect } from "./projection.mjs";

const parse = (body) => parseJubarte(`---\nview: tracked\n---\n\n${body}`);

test("K154: text before a tracked paragraph mark keeps its identity and properties", () => {
  const result = parse("<!-- p1 center, size 14pt -->\nx¶{r3 @A}");
  assert.equal(result.value.length, 1);
  const [paragraph] = result.value;
  assert.equal(plain(paragraph), "x");
  assert.equal(paragraph.agentId, "p1");
  assert.equal(paragraph.paragraphProperties.alignment, "center");
  assert.equal(paragraph.paragraphProperties.fontSizePt, 14);
  assert.ok(!paragraph.empty);
});

for (const spaces of ["", " ", "   "]) {
  test(`K155: mark-only paragraph with ${spaces.length} spaces keeps properties off following text`, () => {
    const result = parse(`<!-- p1 center, size 14pt -->\n${spaces}¶{r3 @A}\n\nAFTER`);
    assert.equal(result.metadata.changes.filter((c) => c.paragraphMark).length, 1);
    assert.equal(result.value.length, 2);
    const [empty, after] = result.value;
    assert.equal(empty.agentId, "p1");
    assert.equal(empty.empty, true);
    assert.equal(plain(empty), "");
    assert.equal(empty.paragraphProperties.alignment, "center");
    assert.equal(empty.paragraphProperties.fontSizePt, 14);
    assert.equal(plain(after), "AFTER");
    assert.equal(after.agentId, undefined);
    assert.equal(after.paragraphProperties, undefined);
  });
}

test("K154/K155: mark-only detection uses source positions for unordered directives", () => {
  const result = parse(
    "<!-- p0 -->\nBEFORE\n\n<!-- p1 center, size 14pt -->\n   ¶{r3 @A}\n\n<!-- p2 -->\nAFTER",
  );
  const [p0, p1, p2] = result.document.directives;
  const document = { ...result.document, directives: [p1, p0, p2] };
  const projected = projectDialect(result.ast, result.critic, document);
  assert.deepEqual(
    projected.value.map((p) => p.agentId),
    ["p0", "p1", "p2"],
  );
  const [before, empty, after] = projected.value;
  assert.equal(plain(before), "BEFORE");
  assert.equal(empty.empty, true);
  assert.equal(plain(empty), "");
  assert.equal(empty.paragraphProperties.alignment, "center");
  assert.equal(empty.paragraphProperties.fontSizePt, 14);
  assert.equal(plain(after), "AFTER");
  assert.equal(after.paragraphProperties.alignment, undefined);
  assert.equal(after.paragraphProperties.fontSizePt, undefined);
  assert.deepEqual(document.directives, [p1, p0, p2]);
});
