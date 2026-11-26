// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
// SPDX-License-Identifier: Apache-2.0

// Deterministic interfaces used by pretext's measurement.ts and the composer.
// pretext needs only font and measureText().width for these ASCII fixtures.
Object.defineProperty(globalThis, "OffscreenCanvas", {
  configurable: true,
  value: class {
    getContext() {
      return { font: "", measureText: (text: string) => ({ width: text.length * 7 }) };
    }
  },
});
Object.defineProperty(globalThis, "performance", {
  configurable: true,
  value: { now: () => 0 },
});
