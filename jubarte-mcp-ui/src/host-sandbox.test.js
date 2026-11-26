// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("K70 the proxy ancestor retains navigation restrictions after inner unsandboxing", () => {
  document.body.innerHTML = readFileSync("e2e/host.html", "utf8");
  const outer = document.getElementById("card");
  expect(outer.hasAttribute("sandbox")).toBe(true);
  const permissions = outer.getAttribute("sandbox").split(/\s+/);
  expect(permissions).toContain("allow-scripts");
  expect(permissions).toContain("allow-same-origin");
  expect(permissions).not.toContain("allow-top-navigation");
  expect(permissions).not.toContain("allow-top-navigation-by-user-activation");
  expect(permissions).not.toContain("allow-popups");
});
