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

describe("accessibility state follows what is shown (#43)", () => {
  it("a cached mode drawn while another is on its way clears aria-busy", async () => {
    host.app.ontoolinput({ arguments: { path: "b.docx" } });
    host.app.ontoolresult({ structuredContent: { path: "b.docx" } });
    host.pending
      .at(-1)
      .resolve({ structuredContent: { ...tracked.structuredContent, path: "b.docx" } });
    await settle();
    pick("accepted").click();
    const accepted = host.pending.at(-1);
    expect($("pages-fit").getAttribute("aria-busy")).toBe("true");
    pick("tracked").click();
    await settle();
    accepted.resolve({ structuredContent: { ...tracked.structuredContent, view: "accepted" } });
    await settle();
    expect($("pages-fit").hasAttribute("aria-busy")).toBe(false);
    expect($("pages-mount").dataset.view).toBe("tracked");
  });
  it("a new document closes the discussions and says so", async () => {
    $("show-discussions").click();
    expect($("show-discussions").getAttribute("aria-expanded")).toBe("true");
    host.app.ontoolinput({ arguments: { path: "c.docx" } });
    host.app.ontoolresult({ structuredContent: { path: "c.docx" } });
    host.pending
      .at(-1)
      .resolve({ structuredContent: { ...tracked.structuredContent, path: "c.docx" } });
    await settle();
    expect($("embed-discussions").hidden).toBe(true);
    expect($("show-discussions").getAttribute("aria-expanded")).toBe("false");
  });
  it("a new call, or one with nothing to show, retires the open discussions (#88)", async () => {
    host.app.ontoolinput({ arguments: { path: "d.docx" } });
    host.app.ontoolresult({ structuredContent: { path: "d.docx" } });
    host.pending
      .at(-1)
      .resolve({ structuredContent: { ...tracked.structuredContent, path: "d.docx" } });
    await settle();
    $("show-discussions").click();
    expect($("embed-discussions").hidden).toBe(false);
    host.app.ontoolinput({ arguments: { path: "e.docx" } });
    expect($("embed-discussions").hidden).toBe(true);
    expect($("threads").textContent).toBe("");
    expect($("show-discussions").getAttribute("aria-expanded")).toBe("false");
    host.app.ontoolinput({ arguments: {} });
    host.app.ontoolresult({ structuredContent: {} });
    expect($("embed-discussions").hidden).toBe(true);
    expect($("threads").textContent).toBe("");
  });
});

describe("the discussion panel (#44)", () => {
  it("says a resolved thread is resolved", async () => {
    host.app.ontoolinput({ arguments: { path: "r.docx" } });
    host.app.ontoolresult({ structuredContent: { path: "r.docx" } });
    host.pending.at(-1).resolve({
      structuredContent: {
        path: "r.docx",
        view: "tracked",
        markdown:
          "---\nview: tracked\n---\n\n<!-- p0 -->\nBefore {==word==}{>>c5 @AC resolved: root<<}{>>c6 @AS re c5: reply<<} and {==open==}{>>c7 @AC: still open<<}.\n",
      },
    });
    await settle();
    $("show-discussions").click();
    const [resolved, open] = $("threads").querySelectorAll("article");
    expect(resolved.textContent).toMatch(/resolved/i);
    expect(open.textContent).not.toMatch(/resolved/i);
  });
});

it("an empty listing cut short says the search stopped, not that none exist (#64)", async () => {
  host.app.ontoolinput({ arguments: {} });
  host.app.ontoolresult({ structuredContent: { files: [], truncated: true } });
  await settle();
  expect($("files-grid").textContent).not.toContain("No .docx files");
  expect($("files-grid").textContent).toContain("stopped");
});

it("an empty complete listing says there are none (#64)", async () => {
  host.app.ontoolinput({ arguments: {} });
  host.app.ontoolresult({ structuredContent: { files: [], truncated: false } });
  await settle();
  expect($("files-grid").textContent).toContain("No .docx files under this folder.");
});

it("a theme-only host update keeps the card's fixed height (#73)", () => {
  host.app.onhostcontextchanged({
    theme: "light",
    containerDimensions: { width: 320, height: 400 },
  });
  expect(document.body.classList.contains("fixed")).toBe(true);
  host.app.onhostcontextchanged({ theme: "dark" });
  expect(document.body.classList.contains("fixed")).toBe(true);
  expect(document.documentElement.style.colorScheme).toBe("dark");
  host.app.onhostcontextchanged({ containerDimensions: { width: 320 } });
  expect(document.body.classList.contains("fixed")).toBe(false);
});
