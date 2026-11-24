// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// The document card jubarte-mcp serves as ui://jubarte/document.html.
// jubarte-app's reader (reader/, copied unchanged) composes the pages, and the
// desk's stylesheet (desk/styles.css, unchanged) dresses the card. The
// compose/fit/discussions code follows the app's reader/embed.js; only the
// transport differs: the MCP Apps bridge instead of the desk's postMessage.
import { App } from "@modelcontextprotocol/ext-apps";
import { parseJubarte } from "../reader/jubarte.mjs";
import { mountPagination } from "../reader/pagination.js";
import { discussions } from "../reader/comments.mjs";
import { loadFonts } from "./fonts.js";
import { baseName, linkAction, pickDocument, pickFiles } from "./pick.js";
import "../reader/style.css";
import "../reader/embed.css";
import "./desk/styles.css";
import "./view.css";

const $ = (id) => document.getElementById(id);
const VERSION = import.meta.env.JUBARTE_VERSION ?? "";

let generation = 0;
let view = null;
let result = null;
let preview = null;
let mode = "tracked";
let input = undefined;
let listing = null;
const fontsReady = loadFonts().catch(() => []);

const app = new App({ name: "jubarte", version: VERSION || "0" }, {}, { autoResize: true });

// ---------- states ----------

function showEmpty(title, text = "", { busy = false, failed = false } = {}) {
  $("empty").hidden = false;
  $("empty").classList.toggle("busy", busy);
  $("empty").classList.toggle("failed", failed);
  $("empty-title").textContent = title;
  $("empty-text").textContent = text;
  $("result").hidden = true;
  $("files").hidden = true;
}

function clearPages() {
  view?.destroy();
  view = null;
  result = null;
  $("pages-mount").replaceChildren();
  $("notices").replaceChildren();
  $("embed-discussions").hidden = true;
}

function fail(title, error) {
  generation++;
  clearPages();
  showEmpty(title, error ? String(error?.message ?? error) : "", { failed: true });
}

// ---------- the file list (docx_view launched with {}) ----------

const DOC_GLYPH =
  '<svg class="docglyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M15 2v5h5"/></svg>';

function showFiles(files, truncated) {
  listing = { files, truncated };
  clearPages();
  $("empty").hidden = true;
  $("result").hidden = true;
  $("files").hidden = false;
  $("files-meta").textContent = `${files.length} ${files.length === 1 ? "document" : "documents"}${truncated ? " · first results only" : ""}`;
  const grid = $("files-grid");
  grid.replaceChildren();
  if (!files.length) {
    const li = document.createElement("li");
    li.className = "file";
    li.textContent = "No .docx files under this folder.";
    grid.append(li);
    return;
  }
  for (const f of files) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "file";
    button.innerHTML = DOC_GLYPH;
    const label = document.createElement("span");
    const name = document.createElement("span");
    name.className = "filename";
    name.textContent = baseName(f.path);
    const meta = document.createElement("span");
    meta.className = "filemeta submeta";
    meta.textContent = f.path;
    label.append(name, meta);
    button.append(label);
    button.onclick = () => open(f.path, { fromList: true });
    li.append(button);
    grid.append(li);
  }
}

// ---------- the document ----------

function chip(id, n, label) {
  const el = $(id);
  el.hidden = !n;
  el.textContent = `${n} ${label}`;
}

function fit() {
  const viewport = $("pages-mount").querySelector(".premirror-page-viewport");
  if (!viewport) return;
  const width = parseFloat(viewport.style.width);
  const available = $("pages-fit").clientWidth;
  if (!available || !width) return;
  const scale = Math.min(1, available / width);
  $("pages-mount").style.transform = `scale(${scale})`;
  $("pages-mount").style.transformOrigin = "0 0";
  $("pages-fit").style.height = `${parseFloat(viewport.style.minHeight) * scale}px`;
}

function showThreads(id) {
  if (!result) return;
  $("embed-discussions").hidden = false;
  $("show-discussions").setAttribute("aria-expanded", "true");
  const threads = discussions(result);
  $("threads").replaceChildren();
  for (const thread of threads) {
    const article = document.createElement("article");
    article.tabIndex = -1;
    for (const comment of thread.comments) {
      const by = document.createElement("strong");
      by.textContent = comment.author || "Reviewer";
      const text = document.createElement("p");
      text.textContent = comment.text;
      article.append(by, text);
    }
    $("threads").append(article);
    if (thread.id === id) queueMicrotask(() => article.focus());
  }
  if (!threads.length) $("threads").textContent = "No discussions in this document.";
}

async function compose(current) {
  await fontsReady;
  if (document.fonts?.load) {
    await Promise.all([
      document.fonts.load('16px "Source Serif 4"'),
      document.fonts.load('600 26px "Source Serif 4"'),
      document.fonts.load('13px "JetBrains Mono"'),
    ]).catch(() => {});
  }
  if (current !== generation) return;
  view?.destroy();
  view = mountPagination($("pages-mount"), result, { mode, onSelect: showThreads });
  fit();
  const composed = view.composed;
  const pages = composed.layout.pages.length;
  $("outmeta").textContent = [
    `${pages} ${pages === 1 ? "page" : "pages"}`,
    composed.geometry.label,
    preview.sha256 ? `sha256 ${preview.sha256.slice(0, 12)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const warnings = [...(preview.warnings ?? []), ...result.warnings.map((w) => (typeof w === "string" ? w : w.message)), ...composed.warnings].filter(Boolean);
  $("notices").replaceChildren(...[...new Set(warnings)].map((w) => Object.assign(document.createElement("span"), { textContent: `${w} ` })));
}

function render() {
  const current = ++generation;
  try {
    result = parseJubarte(preview.markdown);
    result.revisionKinds = preview.revision_kinds ?? {};
  } catch (error) {
    fail("This document could not be shown", error);
    return;
  }
  $("empty").hidden = true;
  $("files").hidden = true;
  $("result").hidden = false;
  $("outname").textContent = preview.name || baseName(preview.path);
  const c = preview.counts ?? {};
  chip("chip-ins", c.inserted ?? 0, "Inserted");
  chip("chip-del", c.deleted ?? 0, "Deleted");
  chip("chip-mov", c.moved ?? 0, "Moved");
  chip("chip-fmt", c.formatted ?? 0, "Formatted");
  const threads = discussions(result).length;
  $("show-discussions").hidden = !threads;
  $("discussions-label").textContent = `${threads} ${threads === 1 ? "discussion" : "discussions"}`;
  $("back").hidden = !listing;
  compose(current).catch((error) => {
    if (current === generation) fail("The pages could not be composed", error);
  });
}

/** Asks the server for the document behind `path`; a newer request wins. */
async function open(path, { fromList = false } = {}) {
  const current = ++generation;
  if (!fromList) listing = null;
  clearPages();
  showEmpty("Opening the document…", baseName(path), { busy: true });
  if (!app.getHostCapabilities()?.serverTools) {
    fail("This host does not let the card read documents", "The tool's text result above has the document.");
    return;
  }
  let res;
  try {
    res = await app.callServerTool({ name: "docx_preview", arguments: { path } });
  } catch (error) {
    if (current === generation) fail("The document could not be read", error);
    return;
  }
  if (current !== generation) return;
  if (res?.isError || !res?.structuredContent?.markdown) {
    const text = res?.content?.find?.((c) => c.type === "text")?.text;
    fail("The document could not be read", text || "The server returned no preview.");
    return;
  }
  preview = res.structuredContent;
  render();
}

// ---------- the bridge ----------

app.ontoolinput = (params) => {
  input = params?.arguments;
  showEmpty("Working on the document…", "", { busy: true });
};

app.ontoolresult = (callResult) => {
  if (callResult?.isError) {
    const text = callResult.content?.find?.((c) => c.type === "text")?.text;
    fail("The tool call failed", text);
    return;
  }
  const files = pickFiles(callResult);
  if (files) {
    showFiles(files, !!callResult.structuredContent?.truncated);
    return;
  }
  const path = pickDocument(input, callResult);
  if (path) open(path);
  else showEmpty("Nothing to show", "This call named no document.");
};

app.ontoolcancelled = () => fail("The tool call was cancelled");

app.onhostcontextchanged = (ctx) => applyHostContext(ctx);

function applyHostContext(ctx) {
  if (!ctx) return;
  if (ctx.theme === "dark" || ctx.theme === "light") document.documentElement.style.colorScheme = ctx.theme;
  const height = ctx.containerDimensions?.height;
  document.body.classList.toggle("fixed", typeof height === "number");
  fit();
}

// ---------- controls ----------

for (const button of document.querySelectorAll(".view")) {
  button.onclick = () => {
    mode = button.dataset.mode;
    for (const b of document.querySelectorAll(".view")) b.setAttribute("aria-pressed", String(b === button));
    if (result) compose(++generation);
  };
}
$("show-discussions").onclick = () => showThreads();
$("close-discussions").onclick = () => {
  $("embed-discussions").hidden = true;
  $("show-discussions").setAttribute("aria-expanded", "false");
  $("show-discussions").focus();
};
$("back").onclick = () => {
  if (listing) showFiles(listing.files, listing.truncated);
};

// A link in the document never navigates the card away from the bridge.
document.addEventListener("click", (event) => {
  const a = event.target?.closest?.("a[href]");
  if (!a) return;
  event.preventDefault();
  const action = linkAction(a.getAttribute("href"));
  if (action.kind === "anchor") document.getElementById(action.id)?.scrollIntoView({ block: "center" });
  else if (action.kind === "external") app.openLink({ url: action.url }).catch(() => {});
});

window.addEventListener("resize", fit);
new ResizeObserver(fit).observe($("pages-fit"));
$("appbar-ver").textContent = VERSION ? `v${VERSION}` : "";

await app.connect();
applyHostContext(app.getHostContext());
