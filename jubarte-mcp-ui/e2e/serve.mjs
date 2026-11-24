// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// Serves the test host by hand, for looking at the card in a real browser:
//   node e2e/serve.mjs ROOT   then open the printed URL, adding
//   ?tool=docx_compare&args={...}&theme=dark as wanted.
import { resolve } from "node:path";
import { startHarness } from "./harness.mjs";

const root = resolve(process.argv[2] ?? ".");
const h = await startHarness({ root });
console.log(`host    ${h.hostUrl}`);
console.log(`sandbox ${h.sandboxUrl}`);
console.log(`csp     ${h.csp}`);
process.on("SIGINT", async () => {
  await h.close();
  process.exit(0);
});
