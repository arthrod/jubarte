// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vitest/config";

// The view's own tests. The copied reader's tests stay on node:test
// (`node --test reader/*.test.mjs`), as they run in jubarte-app.
export default defineConfig({
  test: {
    include: ["src/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.js", "reader/*.{js,mjs}"],
      exclude: ["**/*.test.*"],
      reporter: ["text", "json-summary"],
      reportOnFailure: true,
    },
  },
});
