// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
// SPDX-License-Identifier: Apache-2.0
// Integration: verify the workspace declares the tools its scripts use.
import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
it("K34 declares the vendored typecheck toolchain", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(pkg.devDependencies.typescript).toBeTruthy();
  expect(pkg.devDependencies["@types/node"]).toBeTruthy();
  expect(pkg.devDependencies["@types/bun"]).toBeUndefined();
});
it("K34 runs every vendored test with the workspace Node and tsx toolchain", () => {
  for (const name of ["core", "composer", "prosemirror-adapter", "react"]) {
    const folder = new URL(`../reader/vendor/premirror/packages/${name}/`, import.meta.url);
    const pkg = JSON.parse(readFileSync(new URL("package.json", folder), "utf8"));
    expect(pkg.scripts.test).toMatch(/^node --import tsx --test /);
    expect(pkg.scripts.test).toContain("--experimental-test-coverage");
    expect(
      JSON.parse(readFileSync(new URL("tsconfig.json", folder), "utf8")).compilerOptions.types,
    ).toContain("node");
  }
});
it("pins the dev-only console pipe to an exact version", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(pkg.devDependencies["vite-plugin-console-pipe"]).toMatch(/^\d+\.\d+\.\d+$/);
});
