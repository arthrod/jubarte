// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// The card draws a paragraph in its source font: the local font first, then
// the bundled face with the same advances (#99), mapped as the renderer maps
// families (crates/jubarte-render/src/convert/font.rs `mapped_face`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { faceFor } from "./faces.mjs";

test("a family with a metric twin draws locally first, then the twin, exactly", () => {
  for (const [family, twin] of [
    ["Calibri", "Jubarte Page C"],
    ["Arial", "Jubarte Page Sans"],
    ["Arial MT", "Jubarte Page Sans"],
    ["Times New Roman", "Jubarte Page Serif"],
    ["Times New Roman PS MT", "Jubarte Page Serif"],
    ["Courier New", "Jubarte Page Mono"],
    ["Carlito", "Jubarte Page C"],
  ]) {
    const face = faceFor(family);
    assert.equal(face.bundled, twin, family);
    assert.equal(face.exact, true, family);
    assert.equal(face.stack.split(",")[0], JSON.stringify(family), family);
    assert.ok(face.stack.includes(JSON.stringify(twin)), family);
  }
});

test("a family the card does not bundle falls back by class and says it is approximate", () => {
  for (const [family, twin] of [
    ["Helvetica", "Jubarte Page Sans"],
    ["Tahoma", "Jubarte Page Sans"],
    ["Verdana", "Jubarte Page Sans"],
    ["Aptos", "Jubarte Page Sans"],
    ["Calibri Light", "Jubarte Page C"],
    ["Cambria", "Jubarte Page Serif"],
    ["Georgia", "Jubarte Page Serif"],
    ["Book Antiqua", "Jubarte Page Serif"],
    ["Consolas", "Jubarte Page Mono"],
    ["Menlo", "Jubarte Page Mono"],
    ["JetBrains Mono", "Jubarte Page Mono"],
    ["Some Rare Face", "Jubarte Page Serif"],
  ]) {
    const face = faceFor(family);
    assert.equal(face.bundled, twin, family);
    assert.equal(face.exact, false, family);
    assert.equal(face.stack.split(",")[0], JSON.stringify(family), family);
  }
});

test("no family is Word's default, Calibri", () => {
  for (const family of [undefined, "", "  "]) {
    const face = faceFor(family);
    assert.equal(face.bundled, "Jubarte Page C");
    assert.equal(face.exact, true);
    assert.equal(face.stack.split(",")[0], '"Calibri"');
  }
});

test("a quoted or listed family uses its first name", () => {
  assert.equal(faceFor('"Arial", sans-serif').bundled, "Jubarte Page Sans");
  assert.equal(faceFor("'Times New Roman'").bundled, "Jubarte Page Serif");
});

test("the stack ends in a generic family", () => {
  assert.match(faceFor("Calibri").stack, /, sans-serif$/);
  assert.match(faceFor("Times New Roman").stack, /, serif$/);
  assert.match(faceFor("Courier New").stack, /, monospace$/);
});
