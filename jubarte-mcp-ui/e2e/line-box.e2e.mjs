// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// Real layout regression test, using the card harness's Playwright/Chrome stack.
// Runs independently of the MCP binary: pnpm e2e:line-box.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

let server;
let browser;
let page;
before(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "line-box-test-page",
        configureServer(vite) {
          vite.middlewares.use("/line-box-test", (_req, res) => {
            res.setHeader("Content-Type", "text/html");
            res.end("<!doctype html><title>Line box test</title><body></body>");
          });
        },
      },
    ],
  });
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  page = await browser.newPage();
  const response = await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/line-box-test`,
  );
  assert.equal(response.status(), 200);
});
after(async () => {
  await browser?.close();
  await server?.close();
});

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 0.02, `${label}: ${actual} vs ${expected}`);
}

test("lineBox measures a real inline font box and its baseline", async () => {
  // Byte-backed FontFace is the same loading mechanism src/fonts.js uses.
  // Carlito's hhea is 0.75/0.25/0.220703 em, independent of installed fonts.
  const bytes = await readFile(
    new URL("../src/fonts/page/jubarte-page-c-regular.woff2", import.meta.url),
  );
  const result = await page.evaluate(
    async (bytes) => {
      const { lineBox } = await import("/reader/line-box.mjs");
      const font = new FontFace("Line Box Fixture", new Uint8Array(bytes));
      document.fonts.add(await font.load());
      await document.fonts.ready;
      const before = document.body.childElementCount;
      const box = lineBox("Line Box Fixture", 12);
      return {
        box,
        auto: lineBox("Line Box Fixture", 12, { line: 360 }).height,
        exact: lineBox("Line Box Fixture", 12, { line: 0, rule: "exact" }).height,
        remaining: document.body.childElementCount - before,
      };
    },
    [...bytes],
  );
  near(result.box.ascent, 9, "baseline (font inheritance and baseline alignment)");
  near(result.box.descent, 3, "descent");
  near(result.box.height, 14.648436, "single line");
  near(result.auto, 21.972654, "1.5 lines");
  assert.equal(result.exact, 0);
  assert.equal(result.remaining, 0, "measurement nodes are removed");
});

for (const [family, height, baseline] of [
  ["Helvetica", 14.4, 11.7],
  ["Songti SC", 21.84, 15.24],
  ["Heiti SC", 15.6, 12.12],
  ["STSong", 15.6, 12.12],
  ["Hiragino Sans", 15.6, 12.36],
  ["Georgia", 13.64, 11],
]) {
  test(`installed ${family} follows the review's Word oracle`, async (t) => {
    const box = await page.evaluate(async (family) => {
      // local() rejects when the named font is unavailable; fonts.check alone
      // can silently succeed on a fallback. Portable fixture test above never skips.
      const font = new FontFace(
        "Available Local Face",
        [family, `${family} Regular`, `${family} Light`, `${family} W3`]
          .map((name) => `local("${name}")`)
          .join(", "),
      );
      try {
        await font.load();
      } catch {
        return null;
      }
      const { lineBox } = await import("/reader/line-box.mjs");
      return lineBox(family, 12);
    }, family);
    if (!box) return t.skip(`${family} is not installed`);
    near(box.height, height, `${family} single line`);
    near(box.ascent, baseline, `${family} baseline`);
  });
}

test("an unavailable source falls back to the recorded bundled metrics", async () => {
  const result = await page.evaluate(async () => {
    const { lineBox } = await import("/reader/line-box.mjs");
    const family = "Missing Line Box Face 59c1f2";
    return [lineBox(family, 12), lineBox(family, 12, {}, () => undefined)];
  });
  assert.deepEqual(...result);
});
