// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const luminance = (css) => {
  const rgb = css
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number)
    .map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
for (const name of ["darkyellow", "darkgray"])
  it(`K76 ${name} meets ordinary-text contrast while preserving explicit foreground`, () => {
    const style = document.createElement("style");
    style.textContent = readFileSync("src/view.css", "utf8");
    document.head.append(style);
    const run = document.createElement("span");
    run.className = `premirror-run hl-${name}`;
    document.body.append(run);
    try {
      const css = getComputedStyle(run);
      const values = [luminance(css.color), luminance(css.backgroundColor)].sort((a, b) => a - b);
      expect((values[1] + 0.05) / (values[0] + 0.05)).toBeGreaterThanOrEqual(4.5);
      run.style.color = "#123456";
      expect(getComputedStyle(run).color).toBe("rgb(18, 52, 86)");
    } finally {
      run.remove();
      style.remove();
    }
  });
