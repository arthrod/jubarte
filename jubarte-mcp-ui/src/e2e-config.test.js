// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("K66 the external-install example supplies both executable overrides", () => {
  const readme = readFileSync("README.md", "utf8");
  const example =
    [...readme.matchAll(/```sh\n([\s\S]*?)```/g)]
      .map((m) => m[1])
      .find((s) => s.includes("JUBARTE_MCP=")) ?? "";
  const supplied = Object.fromEntries(
    [...example.matchAll(/\b(JUBARTE(?:_MCP)?)=([^\s]+)/g)].map((m) => [m[1], m[2]]),
  );
  expect(supplied.JUBARTE_MCP).toBeTruthy();
  expect(supplied.JUBARTE).toBeTruthy();
  expect(readFileSync("e2e/card.e2e.mjs", "utf8").split("import assert")[0]).toMatch(/JUBARTE\b/);
});
