// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// The composer moves a word cut at the end of a line to the next line only
// when it sees letters on both sides of the cut. An ASCII-only test broke
// "São" into "Sã" / "o" (b102, a Portuguese bibliography).
import { describe, expect, it } from "vitest";
import { isWordChar } from "../reader/vendor/premirror/packages/composer/src/index.ts";

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
