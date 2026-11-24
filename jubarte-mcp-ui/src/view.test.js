// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// The card's state machine against a host whose docx_preview answers late.
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ app: null, pending: [] }));
vi.mock("@modelcontextprotocol/ext-apps", () => ({
  App: class {
    constructor() {
      host.app = this;
    }
    async connect() {}
    getHostContext() {
      return null;
    }
    getHostCapabilities() {
      return { serverTools: {} };
    }
    callServerTool(request) {
      return new Promise((resolve) => host.pending.push({ request, resolve }));
    }
    openLink() {
      return Promise.resolve();
    }
  },
}));
vi.mock("./fonts.js", () => ({ loadFonts: async () => [] }));
vi.mock("../reader/pagination.js", () => ({
  mountPagination: () => ({
    destroy() {},
    composed: { layout: { pages: [{}] }, geometry: { label: "Letter portrait" }, warnings: [] },
  }),
}));

const $ = (id) => document.getElementById(id);
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const old = {
  structuredContent: {
    path: "old.docx",
    name: "old.docx",
    markdown: "---\nview: tracked\n---\n\nOLD\n",
  },
};

beforeAll(async () => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  const html = readFileSync("src/document.html", "utf8");
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");
  await import("./view.js");
});
beforeEach(() => {
  host.pending.length = 0;
});

it("a newer file list retires a preview still on its way (#32)", async () => {
  host.app.ontoolinput({ arguments: { path: "old.docx" } });
  host.app.ontoolresult({ structuredContent: { path: "old.docx" } });
  expect(host.pending.map((p) => p.request.arguments.path)).toEqual(["old.docx"]);
  host.app.ontoolinput({ arguments: {} });
  host.app.ontoolresult({ structuredContent: { files: [{ path: "new.docx" }], truncated: false } });
  host.pending[0].resolve(old);
  await settle();
  expect($("files").hidden).toBe(false);
  expect($("result").hidden).toBe(true);
});

it("a new tool call retires a preview still on its way (#32)", async () => {
  host.app.ontoolinput({ arguments: { path: "old.docx" } });
  host.app.ontoolresult({ structuredContent: { path: "old.docx" } });
  host.app.ontoolinput({ arguments: { path: "next.docx" } });
  host.pending[0].resolve(old);
  await settle();
  expect($("result").hidden).toBe(true);
  expect($("empty-title").textContent).toBe("Working on the document…");
});

it("the preview that is still current is shown", async () => {
  host.app.ontoolinput({ arguments: { path: "old.docx" } });
  host.app.ontoolresult({ structuredContent: { path: "old.docx" } });
  host.pending[0].resolve(old);
  await settle();
  expect($("result").hidden).toBe(false);
  expect($("outname").textContent).toBe("old.docx");
});
