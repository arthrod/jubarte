// SPDX-FileCopyrightText: 2026 Sam Willis
//
// SPDX-License-Identifier: MIT

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "../../../../../test-support/environment";

import { defaultPremirrorOptions } from "@premirror/core";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";

import { createPremirror, premirrorInvalidationKey } from "./index";

const paragraphSpec = basicSchema.spec.nodes.get("paragraph");

if (!paragraphSpec) {
  throw new Error("Missing paragraph spec");
}

const schema = new Schema({
  nodes: addListNodes(
    basicSchema.spec.nodes.update("paragraph", {
      ...paragraphSpec,
      attrs: {
        ...paragraphSpec.attrs,
        manualPageBreakBefore: { default: false },
      },
    }),
    "paragraph block*",
    "block",
  ),
  marks: basicSchema.spec.marks,
});

describe("@premirror/prosemirror-adapter", () => {
  it("extracts snapshot blocks and marks", () => {
    const runtime = createPremirror(defaultPremirrorOptions());
    const strong = schema.marks.strong;
    if (!strong) throw new Error("Missing strong mark");
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, [
          schema.text("Hello ", []),
          schema.text("bold", [strong.create()]),
        ]),
      ]),
      plugins: runtime.plugins,
    });

    const snapshot = runtime.toSnapshot(state);
    assert.equal(snapshot.blocks.length, 1);
    const firstBlock = snapshot.blocks[0];
    assert.ok(firstBlock);
    assert.ok(firstBlock.runs.length >= 2);
  });

  it("measures snapshot runs", () => {
    const runtime = createPremirror(defaultPremirrorOptions());
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [schema.node("paragraph", null, [schema.text("Measure me")])]),
      plugins: runtime.plugins,
    });
    const measured = runtime.measureSnapshot(runtime.toSnapshot(state));
    const firstKey = Object.keys(measured.measuredRuns)[0];
    assert.ok(firstKey);
    const firstRun = measured.measuredRuns[firstKey];
    assert.ok(firstRun);
    assert.equal(firstRun.widthPx, "Measure me".length * 7);
  });

  it("insertPageBreak command dispatches a transaction", () => {
    const runtime = createPremirror(defaultPremirrorOptions());
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [schema.node("paragraph", null, [schema.text("One")])]),
      plugins: runtime.plugins,
    });

    let nextState: EditorState | undefined;
    const didRun = runtime.commands.insertPageBreak(state, (tr) => {
      nextState = state.apply(tr);
    });

    assert.equal(didRun, true);
    assert.notEqual(nextState, undefined);
    if (!nextState) return;
    assert.ok(nextState.doc.childCount >= 2);
  });

  it("tracks invalidation range on doc change", () => {
    const runtime = createPremirror(defaultPremirrorOptions());
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [schema.node("paragraph", null, [schema.text("abc")])]),
      plugins: runtime.plugins,
    });
    const tr = state.tr.insertText("x", 2);
    const next = state.apply(tr);
    const inval = premirrorInvalidationKey.getState(next) ?? null;
    assert.notEqual(inval, null);
    assert.deepEqual(runtime.getInvalidationRange(next), inval);
  });
});
