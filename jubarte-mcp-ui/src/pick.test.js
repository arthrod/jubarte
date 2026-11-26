// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { baseName, linkAction, pickDocument, pickFiles } from "./pick.js";

const ok = (structuredContent) => ({ content: [{ type: "text", text: "x" }], structuredContent });

describe("pickDocument", () => {
  it("shows the redline docx_compare wrote", () => {
    expect(pickDocument({ original: "a.docx", modified: "b.docx", out: "r.docx" }, ok({ out: "/root/r.docx", changes: [] }))).toBe("/root/r.docx");
  });
  it("shows docx_edit's redline, not its clean copy", () => {
    expect(pickDocument({ path: "a.docx" }, ok({ clean: "/o/clean.docx", redline: "/o/redline.docx", report: {} }))).toBe("/o/redline.docx");
  });
  it("shows docx_view's path", () => {
    expect(pickDocument({ path: "a.docx" }, ok({ path: "/root/a.docx" }))).toBe("/root/a.docx");
  });
  it("falls back to the input path for docx_text, whose result is text only", () => {
    expect(pickDocument({ path: "contract.docx" }, { content: [{ type: "text", text: "# x" }] })).toBe("contract.docx");
  });
  it("needs no tool name", () => {
    expect(pickDocument(undefined, ok({ out: "r.docx" }))).toBe("r.docx");
  });
  it("shows nothing for a failed call, even when an old output exists", () => {
    expect(pickDocument({ out: "r.docx", path: "a.docx" }, { isError: true, content: [{ type: "text", text: "exists" }] })).toBeNull();
  });
  it("shows nothing for a manual launch with {}", () => {
    expect(pickDocument({}, ok({ files: [], truncated: false }))).toBeNull();
    expect(pickDocument({}, undefined)).toBeNull();
  });
});

describe("pickFiles", () => {
  it("returns the listed files and drops malformed rows", () => {
    expect(pickFiles(ok({ files: [{ path: "a.docx" }, { nope: 1 }] }))).toEqual([{ path: "a.docx" }]);
  });
  it("is null when the result is not a listing", () => {
    expect(pickFiles(ok({ path: "a.docx" }))).toBeNull();
  });
});

describe("baseName", () => {
  it("takes the last segment on either separator", () => {
    expect(baseName("/a/b/c.docx")).toBe("c.docx");
    expect(baseName("C:\\x\\y.docx")).toBe("y.docx");
    expect(baseName(undefined)).toBe("");
  });
});

describe("linkAction", () => {
  it("keeps anchors inside the document", () => {
    expect(linkAction("#fn-1")).toEqual({ kind: "anchor", id: "fn-1" });
  });
  it("sends web and mail links to the host", () => {
    expect(linkAction("https://example.com/x")).toEqual({ kind: "external", url: "https://example.com/x" });
    expect(linkAction("mailto:a@b.c").kind).toBe("external");
  });
  it("ignores javascript:, file: and relative links", () => {
    for (const href of ["javascript:alert(1)", "file:///etc/passwd", "../x", "", null]) expect(linkAction(href).kind).toBe("none");
  });
});
