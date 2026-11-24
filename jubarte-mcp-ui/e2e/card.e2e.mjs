// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// The card end to end: the real jubarte-mcp, a two-origin MCP Apps host and
// the installed Chrome. Run with `pnpm e2e` (Chrome required; set
// JUBARTE_MCP to a jubarte-mcp other than jubarte-python's .venv).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startHarness } from "./harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const adoption = join(repo, "examples/adoption/08-accept-reject");
const jubarte = process.env.JUBARTE || join(repo, "jubarte-python/.venv/bin/jubarte");
const shots = process.env.JUBARTE_E2E_SHOTS || join(repo, ".scratch/mcp-apps/e2e-shots");

/** The words of `jubarte read` without its YAML header and id comments. */
function words(text) {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}
function readWords(file, choice) {
  const md = execFileSync(jubarte, ["read", file, "--track-changes", choice], { encoding: "utf8" });
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^#+\s/gm, "");
  return words(body);
}
/** True when `needle` appears in order inside `hay` (headers and page numbers may sit between). */
function subsequence(needle, hay) {
  let i = 0;
  for (const w of hay) if (w === needle[i]) i++;
  return i === needle.length;
}

let root;
let h;
let browser;

before(async () => {
  root = mkdtempSync(join(tmpdir(), "jubarte-card-"));
  for (const f of ["original.docx", "revised.docx"]) copyFileSync(join(adoption, f), join(root, f));
  mkdirSync(join(root, "deep/er"), { recursive: true });
  copyFileSync(join(adoption, "original.docx"), join(root, "deep/er/copy.docx"));
  mkdirSync(shots, { recursive: true });
  h = await startHarness({ root });
  browser = await chromium.launch({ channel: "chrome", headless: process.env.HEADED ? false : true });
});

after(async () => {
  await browser?.close();
  await h?.close();
  if (root) rmSync(root, { recursive: true, force: true });
});

/** Opens one tool call's card; collects console errors and CSP refusals from every frame. */
async function open(tool, args, { theme = "light", height } = {}) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, colorScheme: theme });
  const errors = [];
  page.on("console", (m) => {
    // A failed load is reported below with its URL instead.
    if (m.text().startsWith("Failed to load resource")) return;
    if (m.type() === "error" || /Content Security Policy|Refused to/i.test(m.text())) errors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  const q = new URLSearchParams({ tool, args: JSON.stringify(args), theme });
  if (height) q.set("height", String(height));
  await page.goto(`${h.hostUrl}?${q}`);
  await page.waitForFunction(() => window.__host?.resultSent, null, { timeout: 60_000 });
  const view = () => page.frames().find((f) => f.url() === "about:srcdoc");
  await page.waitForFunction(() => true);
  for (let i = 0; i < 100 && !view(); i++) await page.waitForTimeout(100);
  return { page, view: view(), errors };
}

/**
 * The pages' text as laid out: the paginator places each run absolutely, so
 * innerText would break a word split across two runs ("m" + "onth"); a
 * line's runs are joined as they sit, and lines with a space.
 */
async function pagesText(view) {
  return view.evaluate(() => [...document.querySelectorAll("#pages-mount .paged-line")].map((line) => line.textContent).join(" "));
}

describe("the document card in a sandboxed host", () => {
  test("a redline from docx_compare shows its pages, chips and three views", async () => {
    const { page, view, errors } = await open("docx_compare", { original: "original.docx", modified: "revised.docx", out: "redline.docx", author: "Ann" });
    assert.ok(view, "the view loaded inside the sandbox proxy");
    await view.locator(".premirror-page-surface").first().waitFor({ timeout: 60_000 });
    assert.equal(await view.locator("#outname").innerText(), "redline.docx");

    // The chips match the engine's own change list.
    const changes = (await h.call("docx_changes", { path: "redline.docx" })).structuredContent.result;
    const ins = changes.filter((c) => c.kind === "insertion" || c.kind === "replacement").length;
    const del = changes.filter((c) => c.kind === "deletion" || c.kind === "replacement").length;
    assert.equal(await view.locator("#chip-ins").textContent(), `${ins} Inserted`);
    assert.equal(await view.locator("#chip-del").textContent(), `${del} Deleted`);
    assert.ok(await view.locator("#pages-mount .criticInsertion").count() > 0, "insertions are drawn");
    assert.ok(await view.locator("#pages-mount .criticDeletion").count() > 0, "deletions are drawn");
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(shots, "redline-light.png"), fullPage: true });

    assert.doesNotMatch(await pagesText(view), /\{r\d+(?:\+\d+)* @/, "no attribution tag reaches the page");

    // Original and Accepted read as jubarte read's reject and accept views.
    const out = join(root, "redline.docx");
    const rejected = readWords(out, "reject");
    const accepted = readWords(out, "accept");
    assert.notDeepEqual(rejected, accepted);
    await view.locator('.view[data-mode="original"]').click();
    await view.waitForFunction(() => document.querySelector('.view[data-mode="original"]').getAttribute("aria-pressed") === "true");
    await view.locator(".premirror-page-surface").first().waitFor();
    await page.waitForTimeout(300);
    const original = words(await pagesText(view));
    assert.ok(subsequence(rejected, original), `Original shows the rejected text\n${rejected.join(" ")}\n---\n${original.join(" ")}`);
    assert.ok(!subsequence(accepted, original), "Original does not show the accepted text");
    await view.locator('.view[data-mode="accepted"]').click();
    await page.waitForTimeout(300);
    const acc = words(await pagesText(view));
    assert.ok(subsequence(accepted, acc), `Accepted shows the accepted text\n${accepted.join(" ")}\n---\n${acc.join(" ")}`);
    assert.ok(!subsequence(rejected, acc), "Accepted does not show the rejected text");

    // The view read the document through docx_preview, never a write tool.
    const host = await page.evaluate(() => window.__host);
    assert.deepEqual(host.refused, []);
    assert.ok(host.events.some((e) => e.kind === "calltool" && e.detail === "docx_preview"));
    assert.deepEqual(errors, []);
    await page.close();
  });

  test("docx_view with no path lists the root's documents and opens one", async () => {
    const { page, view, errors } = await open("docx_view", {});
    await view.locator("#files-grid .file").first().waitFor();
    const names = await view.locator("#files-grid .filemeta").allInnerTexts();
    // Sorted by path; redline.docx is there when the compare test ran first.
    const want = ["deep/er/copy.docx", "original.docx", "redline.docx", "revised.docx"].filter((n) => n !== "redline.docx" || existsSync(join(root, n)));
    assert.deepEqual(names, want);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(shots, "files-light.png"), fullPage: true });
    await view.locator("#files-grid .file", { hasText: "revised.docx" }).first().click();
    await view.locator(".premirror-page-surface").first().waitFor({ timeout: 60_000 });
    assert.equal(await view.locator("#outname").innerText(), "revised.docx");
    assert.equal(await view.locator("#back").isVisible(), true);
    await view.locator("#back").click();
    await view.locator("#files-grid .file").first().waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  });

  test("dark hosts keep paper pages; a fixed height scrolls inside the card", async () => {
    const { page, view, errors } = await open("docx_text", { path: "revised.docx" }, { theme: "dark", height: 420 });
    await view.locator(".premirror-page-surface").first().waitFor({ timeout: 60_000 });
    assert.equal(await view.evaluate(() => document.documentElement.style.colorScheme), "dark");
    assert.equal(await view.evaluate(() => document.body.classList.contains("fixed")), true);
    // Paper stays paper: the page is white and its text dark under a dark host.
    const ink = await view.evaluate(() => {
      const probe = document.createElement("canvas").getContext("2d");
      const lum = (css) => {
        probe.fillStyle = "#000";
        probe.fillStyle = css;
        probe.fillRect(0, 0, 1, 1);
        const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      };
      const run = document.querySelector("#pages-mount .premirror-run");
      const surface = document.querySelector("#pages-mount .premirror-page-surface");
      return { text: lum(getComputedStyle(run).color), paper: lum(getComputedStyle(surface).backgroundColor) };
    });
    assert.ok(ink.paper > 0.9 && ink.text < 0.3, `paper ${ink.paper}, text ${ink.text}`);
    const frameHeight = await page.locator("#card").evaluate((f) => f.getBoundingClientRect().height);
    assert.ok(Math.abs(frameHeight - 420) <= 2, `the host kept its height (${frameHeight})`);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(shots, "text-dark.png"), fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  });

  test("an error result shows the failure, not a blank card", async () => {
    const { page, view } = await open("docx_text", { path: "../outside.docx" });
    await view.locator("#empty.failed").waitFor();
    assert.match(await view.locator("#empty-text").innerText(), /outside root/);
    await page.close();
  });

  test("the view runs under the spec's CSP: no network, no external fonts", async () => {
    assert.match(h.csp, /default-src 'none'/);
    assert.match(h.csp, /connect-src 'none'/);
    const { page, view, errors } = await open("docx_text", { path: "original.docx" });
    await view.locator(".premirror-page-surface").first().waitFor({ timeout: 60_000 });
    const meta = await view.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content);
    assert.equal(meta, h.csp);
    // The fonts came from bytes inside the file.
    const fonts = await view.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replaceAll('"', ""));
    });
    for (const family of ["Manrope", "Source Serif 4", "JetBrains Mono"]) assert.ok(fonts.includes(family), `${family} loaded: ${fonts}`);
    // A fetch from inside the view is refused.
    const fetched = await view.evaluate(() => fetch("https://example.com/").then(() => "fetched", () => "refused"));
    assert.equal(fetched, "refused");
    assert.deepEqual(errors.filter((e) => !/example\.com/.test(e)), []);
    await page.close();
  });
});
