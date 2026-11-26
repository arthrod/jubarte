// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// What the pages say about comments and pictures (#44). The bodies are
// read_view's own output for codex's inputs.
import { beforeAll, describe, expect, it } from "vitest";
import { parseJubarte } from "../reader/jubarte.mjs";

let mountPagination;
beforeAll(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLCanvasElement.prototype.getContext = () => null;
  ({ mountPagination } = await import("../reader/pagination.js"));
});

const mount = (body) => {
  const container = document.createElement("div");
  document.body.append(container);
  const view = mountPagination(container, parseJubarte(`---\nview: tracked\n---\n\n${body}\n`));
  return { container, done: () => (view.destroy(), container.remove()) };
};
// An element's top in the stacked pages: the sum of the absolute tops above it.
const top = (el, container) => {
  let y = 0;
  for (let e = el; e && e !== container; e = e.parentElement) y += parseFloat(e.style?.top) || 0;
  return y;
};

describe("comments and pictures on the page (#44)", () => {
  it("a comment ending its paragraph is marked beside it, not on the next page", () => {
    const lines = Array.from({ length: 14 }, (_, i) => `<!-- p${i} -->\nParagraph ${i}`);
    const { container, done } = mount(
      [
        ...lines,
        "<!-- p14 -->\nBefore {==[link](https://example.com)==}{>>c0 @J: link comment<<}",
        "<!-- p15 -->\nNext",
      ].join("\n\n"),
    );
    const link = [...container.querySelectorAll(".premirror-run")].find(
      (r) => r.textContent === "link",
    );
    const marker = container.querySelector(".paged-comment");
    expect(link && marker).toBeTruthy();
    expect(Math.abs(top(marker, container) - top(link, container))).toBeLessThan(29);
    done();
  });
  it("a resolved thread says so in the marker's name", () => {
    const { container, done } = mount(
      "<!-- p0 -->\nBefore {==word==}{>>c5 @AC resolved: root<<}{>>c6 @AS re c5: reply<<} after.",
    );
    const marker = container.querySelector(".paged-comment");
    expect(marker.getAttribute("aria-label")).toMatch(/resolved/i);
    done();
  });
  it("an image chip keeps docx_preview's type and size as its tooltip", () => {
    const { container, done } = mount(
      "<!-- p0 -->\nBefore ![logo][image1] after\n\n[image1]: <image/png, 0 KB>",
    );
    const chip = container.querySelector(".paged-image");
    expect(chip?.getAttribute("title")).toContain("image/png, 0 KB");
    done();
  });
});
