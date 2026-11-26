// SPDX-FileCopyrightText: 2026 Sam Willis
//
// SPDX-License-Identifier: MIT

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LAYOUT_POLICIES,
  LETTER_PAGE_PX,
  createLayoutInputFromOptions,
  defaultPremirrorOptions,
  pageSpecForPreset,
} from "./index";

describe("@premirror/core", () => {
  it("resolves page presets", () => {
    const letter = pageSpecForPreset("letter");
    const a4 = pageSpecForPreset("a4");
    assert.equal(letter.widthPx, LETTER_PAGE_PX.widthPx);
    assert.notEqual(a4.widthPx, letter.widthPx);
  });

  it("creates default options", () => {
    const options = defaultPremirrorOptions();
    assert.ok(options.page.widthPx > 0);
    assert.ok(options.typography.defaultLineHeightPx > 0);
    assert.equal(options.policies?.slotSelectionPolicy, "single_slot_flow");
  });

  it("merges layout input policies with defaults", () => {
    const options = defaultPremirrorOptions({
      policies: { keepWithNextEnabled: false },
    });
    const input = createLayoutInputFromOptions(options);
    assert.equal(input.policies.keepWithNextEnabled, false);
    assert.equal(input.policies.widowLinesMin, DEFAULT_LAYOUT_POLICIES.widowLinesMin);
  });
});
