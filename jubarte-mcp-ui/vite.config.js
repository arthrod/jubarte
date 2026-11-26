// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// Builds the MCP Apps view into one self-contained HTML file, which the Python
// package ships as jubarte/ui/document.html and jubarte-mcp serves as
// ui://jubarte/document.html. Nothing in it is fetched: hosts render it under
// a default-deny CSP.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const outDir = join(repo, "jubarte-python/python/jubarte/ui");
const version = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).version;

/**
 * jubarte-app's reader/style.css names its fonts by absolute URL (/fonts/…),
 * which the app's web server answers. Here they would be fetches the host's
 * CSP refuses; the faces come from src/fonts.js instead. The copied file stays
 * byte-identical; its @font-face rules are dropped as it is bundled.
 */
function dropReaderFontFaces() {
  let stripped = false;
  return {
    name: "jubarte-drop-reader-font-faces",
    enforce: "pre",
    transform(code, id) {
      const path = id.replaceAll("\\", "/").split("?")[0];
      // embed.css pulls style.css in by @import, which PostCSS would inline
      // without this transform seeing it; view.js imports style.css itself.
      if (path.endsWith("/reader/embed.css")) {
        const out = code.replace("@import './style.css';", "");
        if (out === code) this.error("reader/embed.css no longer imports ./style.css; check the copy");
        return { code: out, map: null };
      }
      if (!path.endsWith("/reader/style.css")) return null;
      const out = code.replace(/@font-face\{[^}]*url\('\/fonts\/[^}]*\}/g, "");
      if (out === code) this.error("reader/style.css no longer has the /fonts/ faces this build drops; check the copy");
      stripped = true;
      return { code: out, map: null };
    },
    buildEnd() {
      if (!stripped) this.error("reader/style.css was not bundled through the font-face strip");
    },
  };
}

const LICENCE_NAMES = ["LICENSE", "LICENSE.md", "LICENSE.txt", "license", "license.md", "LICENCE", "COPYING"];

function licenceOf(dir) {
  for (const name of LICENCE_NAMES) {
    const file = join(dir, name);
    if (existsSync(file)) return readFileSync(file, "utf8").trim();
  }
  return null;
}

/** The package directory that owns a bundled module, or null for our own files. */
export function packageDirOf(id, root = here) {
  const path = id.replace(/^\0/, "").replaceAll("\\", "/").split("?")[0];
  const nm = path.lastIndexOf("/node_modules/");
  if (nm >= 0) {
    const rest = path.slice(nm + 14).split("/");
    const n = rest[0].startsWith("@") ? 2 : 1;
    return path.slice(0, nm + 14) + rest.slice(0, n).join("/");
  }
  const premirror = root.replaceAll("\\", "/") + "/reader/vendor/premirror";
  if (path.startsWith(premirror + "/")) return premirror;
  const critic = root.replaceAll("\\", "/") + "/reader/vendor/remark-critic-markup-jubarte";
  if (path.startsWith(critic + "/")) return critic;
  return null;
}

/**
 * Leads the HTML with a comment carrying the full copyright and licence text
 * of every third-party package the bundle contains, found from the modules
 * Rollup actually bundled, and of the three fonts. A bundled package without a
 * licence file fails the build.
 */
function licenceBanner() {
  const dirs = new Set();
  return {
    name: "jubarte-licence-banner",
    // Before vite:build-html's generateBundle, which runs transformIndexHtml.
    renderChunk(_code, chunk) {
      for (const id of Object.keys(chunk.modules)) {
        const dir = packageDirOf(id);
        if (dir) dirs.add(dir);
      }
      return null;
    },
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const sections = [readFileSync(join(repo, "NOTICE"), "utf8").trim()];
        const missing = [];
        for (const dir of [...dirs].sort()) {
          const pkgFile = join(dir, "package.json");
          const pkg = existsSync(pkgFile) ? JSON.parse(readFileSync(pkgFile, "utf8")) : {};
          const name = pkg.name ? `${pkg.name}@${pkg.version}` : relative(here, dir);
          const text = licenceOf(dir);
          if (!text) missing.push(name);
          else sections.push(`=== ${name} (${pkg.license ?? "see text"}) ---\n${text}`);
        }
        for (const file of readdirSync(join(here, "licenses")).sort()) {
          sections.push(`=== ${file.replace(/\.txt$/, "")} ---\n${readFileSync(join(here, "licenses", file), "utf8").trim()}`);
        }
        if (missing.length) throw new Error(`bundled packages without a licence file: ${missing.join(", ")}`);
        const body = sections.join("\n\n").replaceAll("--", "‐‐");
        const banner = [
          "<!--",
          `jubarte MCP App view ${version}: ui://jubarte/document.html`,
          "Copyright 2026 Jandira Technologies, LLC. Licensed under the Apache License, Version 2.0.",
          "SPDX-License-Identifier: Apache-2.0",
          "Generated by jubarte-mcp-ui (pnpm build); do not edit.",
          "",
          "This file bundles the third-party software and fonts below, each under its own licence:",
          "",
          body,
          "-->",
        ].join("\n");
        return html.replace(/^<!doctype html>\s*(<!--[\s\S]*?-->\s*)?/i, `<!doctype html>\n${banner}\n`);
      },
    },
  };
}

export default defineConfig({
  root: join(here, "src"),
  base: "./",
  publicDir: false,
  define: { "import.meta.env.JUBARTE_VERSION": JSON.stringify(version) },
  plugins: [dropReaderFontFaces(), viteSingleFile({ removeViteModuleLoader: true }), licenceBanner()],
  build: {
    outDir,
    emptyOutDir: false,
    target: "es2022",
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    reportCompressedSize: false,
    rollupOptions: { input: join(here, "src/document.html"), output: { entryFileNames: "document.js" } },
  },
});
