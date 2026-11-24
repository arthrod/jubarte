// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// The card's state machine against a host whose docx_preview answers late.
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ app: null, pending: [], mounts: [] }));
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
  mountPagination: (container, result, options) => (
    host.mounts.push({
      result,
      mode: options?.mode,
      dataMode: container.dataset.mode,
      dataView: container.dataset.view,
    }),
    {
      destroy() {},
      composed: { layout: { pages: [{}] }, geometry: { label: "Letter portrait" }, warnings: [] },
    }
  ),
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

it("a failed preview opened from the list keeps a way back to it (#36)", async () => {
  host.app.ontoolinput({ arguments: {} });
  host.app.ontoolresult({
    structuredContent: {
      files: [{ path: "broken.docx" }, { path: "fine.docx" }],
      truncated: false,
    },
  });
  $("files-grid").querySelector("button").click();
  host.pending[0].resolve({ isError: true, content: [{ type: "text", text: "invalid zip" }] });
  await settle();
  expect($("empty-title").textContent).toBe("The document could not be read");
  const back = $("empty-back");
  expect(back?.hidden).toBe(false);
  back.click();
  expect($("files").hidden).toBe(false);
  expect($("files-grid").textContent).toContain("fine.docx");
});

it("a failure outside the list offers no way back", async () => {
  host.app.ontoolinput({ arguments: { path: "x.docx" } });
  host.app.ontoolresult({ structuredContent: { path: "x.docx" } });
  host.pending[0].resolve({ isError: true, content: [{ type: "text", text: "nope" }] });
  await settle();
  expect($("empty-back")?.hidden ?? true).toBe(true);
});

const text = (mount) => mount.result.doc.textContent;
const pick = (view) => document.querySelector(`.view[data-mode="${view}"]`);
const tracked = {
  structuredContent: {
    path: "doc.docx",
    name: "doc.docx",
    view: "tracked",
    markdown: "---\nview: tracked\n---\n\nKeep {--gone--}{++new++} end\n",
  },
};

describe("Accepted and Original are the engine's views (#40)", () => {
  it("asks the server for the engine's accepted view and draws it as is", async () => {
    host.app.ontoolinput({ arguments: { path: "doc.docx" } });
    host.app.ontoolresult({ structuredContent: { path: "doc.docx" } });
    host.pending[0].resolve(tracked);
    await settle();
    pick("accepted").click();
    expect(host.pending.at(-1).request.arguments).toEqual({ path: "doc.docx", view: "accepted" });
    host.pending.at(-1).resolve({
      structuredContent: {
        ...tracked.structuredContent,
        view: "accepted",
        markdown: "---\nview: tracked\n---\n\nKeep new end ENGINE\n",
      },
    });
    await settle();
    const last = host.mounts.at(-1);
    expect(text(last)).toContain("ENGINE");
    expect(last.mode).toBe("tracked");
    expect(last.dataView).toBe("accepted");
  });
  it("comes back to a view it has without asking again", async () => {
    const asked = host.pending.length;
    pick("tracked").click();
    await settle();
    pick("accepted").click();
    await settle();
    expect(host.pending.length).toBe(asked);
    expect(text(host.mounts.at(-1))).toContain("ENGINE");
  });
  it("falls back to the card's own projection, styled for its mode, when the view cannot be read", async () => {
    pick("original").click();
    expect(host.pending.at(-1).request.arguments).toEqual({ path: "doc.docx", view: "original" });
    host.pending.at(-1).resolve({ isError: true, content: [{ type: "text", text: "old server" }] });
    await settle();
    const last = host.mounts.at(-1);
    expect(last.mode).toBe("original");
    expect(last.dataMode).toBe("original");
    expect(last.dataView).toBe("original");
    expect(text(last)).toContain("gone");
    expect($("notices").textContent).toMatch(/rebuilt/i);
    pick("tracked").click();
    await settle();
  });
});
