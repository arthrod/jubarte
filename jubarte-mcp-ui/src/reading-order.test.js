// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// Screen readers, find and copy follow the DOM, not the drawn position: a
// table is mounted where the page draws it (#33).
import { beforeAll, expect, it } from "vitest";
import { parseJubarte } from "../reader/jubarte.mjs";

let mountPagination;
beforeAll(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // No canvas here: the composer measures with its approximate widths.
  HTMLCanvasElement.prototype.getContext = () => null;
  ({ mountPagination } = await import("../reader/pagination.js"));
});

it("a table sits between the paragraphs around it in the DOM (#33)", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const view = mountPagination(
    container,
    parseJubarte("---\nview: tracked\n---\n\nBefore\n\n| H |\n| --- |\n| Cell |\n\nAfter\n"),
  );
  const order = [...container.querySelectorAll(".premirror-run")].map((r) => r.textContent.trim());
  expect(order.filter((t) => ["Before", "H", "Cell", "After"].includes(t))).toEqual([
    "Before",
    "H",
    "Cell",
    "After",
  ]);
  view.destroy();
});

const mount = (body) => {
  const container = document.createElement("div");
  document.body.append(container);
  return {
    container,
    view: mountPagination(container, parseJubarte(`---\nview: tracked\n---\n\n${body}\n`)),
  };
};

it("a page's footnote is read before the next page (#35)", () => {
  const body = [
    "First[^1]",
    ...Array.from({ length: 50 }, (_, i) => `Paragraph ${i}`),
    "[^1]: NOTE_ONE",
  ].join("\n\n");
  const { container, view } = mount(body);
  expect(view.composed.layout.pages.length).toBeGreaterThan(1);
  const text = container.textContent;
  expect(text.indexOf("NOTE_ONE")).toBeGreaterThan(-1);
  expect(text.indexOf("NOTE_ONE")).toBeLessThan(text.indexOf("Paragraph 49"));
  view.destroy();
});

it("a heading with an underscore keeps it in its anchor (#34)", () => {
  const { container, view } = mount("[Jump](#a_b)\n\n# A_B");
  expect(container.querySelector(`a[href="#paged-a_b"]`)).not.toBeNull();
  expect(container.querySelector("#paged-a_b")).not.toBeNull();
  view.destroy();
});
