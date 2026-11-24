// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Which document a tool call shows, from the call alone. The protocol does not
 * promise the tool's name (hostContext.toolInfo is optional), so the result's
 * shape decides first and the input's `path` last:
 *
 * - docx_compare returns `{out, changes}`: the redline it wrote;
 * - docx_edit returns `{clean, redline, ...}`: the redline;
 * - docx_view returns `{path}` (or `{files}` when launched with no path);
 * - docx_text returns text only: the input's `path`.
 *
 * A failed call (`isError`) shows nothing. Null means "no document": the
 * view then lists the root's files when the result carries them.
 */
export function pickDocument(input, result) {
  if (result?.isError) return null;
  const s = result?.structuredContent;
  if (s && typeof s === "object") {
    for (const key of ["redline", "out", "path"]) {
      if (typeof s[key] === "string" && s[key]) return s[key];
    }
    if (Array.isArray(s.files)) return null;
  }
  const path = input?.path;
  return typeof path === "string" && path ? path : null;
}

/** The file list `docx_view` returns when it was launched with no path. */
export function pickFiles(result) {
  const files = result?.structuredContent?.files;
  return Array.isArray(files) ? files.filter((f) => typeof f?.path === "string") : null;
}

/** The last path segment, for captions. */
export function baseName(path) {
  return String(path ?? "").split(/[\\/]/).filter(Boolean).at(-1) ?? "";
}

/** A link inside the document: an in-page anchor scrolls, anything else goes to the host. */
export function linkAction(href) {
  if (typeof href !== "string" || !href) return { kind: "none" };
  if (href.startsWith("#")) return { kind: "anchor", id: href.slice(1) };
  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") return { kind: "external", url: url.href };
  } catch {
    // A relative or malformed link has no target outside the document.
  }
  return { kind: "none" };
}
