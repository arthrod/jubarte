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
  expect(order.filter((t) => ["Before", "H", "Cell", "After"].includes(t))).toEqual(["Before", "H", "Cell", "After"]);
  view.destroy();
});
