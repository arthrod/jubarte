// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// The card when the host refuses ui/initialize (#74).
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

vi.mock("@modelcontextprotocol/ext-apps", () => ({
  App: class {
    async connect() {
      throw new Error("Host initialization failed");
    }
    getHostContext() {
      return null;
    }
  },
}));
vi.mock("./fonts.js", () => ({ loadFonts: async () => [] }));

it("a failed host initialisation stops loading and says so (#74)", async () => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  const html = readFileSync("src/document.html", "utf8");
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");
  await import("./view.js").catch(() => {});
  const $ = (id) => document.getElementById(id);
  expect($("empty").classList.contains("busy")).toBe(false);
  expect($("empty").classList.contains("failed")).toBe(true);
  expect($("empty-text").textContent).toContain("Host initialization failed");
});
