// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import { projectDialect } from "./projection.mjs";
import { spawnSync } from "node:child_process";
import { sourcePositions, createPositionLookup, discussions } from "./comments.mjs";
import { parseDocumentMetadata, duplicateDirectiveFlags } from "./metadata.mjs";
import { parseJubarte } from "./jubarte.mjs";
import { parseAgentTag, prepareCritic } from "./vendor/remark-critic-markup-jubarte/index.js";
const agent = (body) => "---\nview: agent\n---\n" + body;
test("K6 maps a 200000 character leaf without argument spread", () => {
  const text = "x".repeat(200000);
  let map;
  assert.doesNotThrow(() => {
    map = sourcePositions({
      value: [{ text }],
      doc: { descendants: (fn) => fn({ isText: true, text }, 1) },
    });
  });
  assert.equal(map.length, 200000);
  assert.deepEqual(map.at(-1), { source: 199999, pos: 200000 });
});
test("K7 indexes repeated comment lookups with subquadratic source reads", () => {
  let reads = 0;
  const n = 1000;
  const positions = Array.from({ length: n }, (_, i) => ({
    get source() {
      reads++;
      return i;
    },
    pos: i + 1,
  }));
  const lookup = createPositionLookup(positions, [{ source: 1001, pos: 1003 }]);
  for (let i = 0; i < n; i++) assert.equal(lookup(n + i + 2), 1003);
  assert.ok(reads < 50000, `${reads} source reads`);
  assert.equal(lookup(5), 6);
  assert.equal(lookup(-1), 1);
  // Source offsets can repeat and need not be monotonic in PM order.
  const reordered = createPositionLookup([
    { source: 8, pos: 1 },
    { source: 2, pos: 2 },
    { source: 8, pos: 3 },
  ]);
  assert.equal(reordered(8), 1);
  assert.equal(reordered(9), 4);
});
test("K12 keeps top-level fenced directives literal and ends list-contained fences", () => {
  const body = "~~~\n- ~~~\n<!-- p0 -->\n~~~";
  const r = parseDocumentMetadata(agent(body));
  assert.equal(r.directives.length, 0);
  assert.ok(r.body.endsWith(body));
  const list = parseDocumentMetadata(agent("- ~~~\n  code\n\n<!-- p1 -->\nText"));
  assert.deepEqual(
    list.directives.map((d) => d.id),
    ["p1"],
  );
});
test("K13 never consumes past the first HTML closer", () => {
  const r = parseDocumentMetadata(agent("<!-- p0 --> trailing text\n<!-- p1 -->\nText"));
  assert.deepEqual(
    r.directives.map((d) => d.id),
    ["p1"],
  );
  assert.match(r.body, /<!-- p0 --> trailing text/);
  assert.equal(parseDocumentMetadata(agent("<!-- p2\n-->\nText")).directives[0].id, "p2");
});
test("K14 detects interval overlaps without quadratic comparisons", () => {
  let reads = 0;
  const n = 2000;
  const ds = Array.from({ length: n }, (_, i) => ({
    type: "paragraph",
    story: "body",
    get index() {
      reads++;
      return i * 2;
    },
    endIndex: i * 2,
  }));
  assert.ok(duplicateDirectiveFlags(ds).every((x) => !x));
  assert.ok(reads < 100000, `${reads} index reads`);
  assert.deepEqual(
    duplicateDirectiveFlags([
      { type: "paragraph", story: "body", index: 4, endIndex: 7 },
      { type: "paragraph", story: "body", index: 5, endIndex: 5 },
      { type: "paragraph", story: "header1", index: 5, endIndex: 5 },
    ]),
    [false, true, false],
  );
});
test("K13 requires a directive on its own line, leaving adjacent comments literal", () => {
  const body = "<!-- p0 --><!-- p1 -->\nText";
  const result = parseDocumentMetadata(agent(body));
  assert.deepEqual(result.directives, []);
  assert.ok(result.body.endsWith(body));
  assert.deepEqual(
    result.warnings.filter((w) => w.code === "duplicate-directive-id"),
    [],
  );
  const separate = parseDocumentMetadata(agent("<!-- p0 -->\n<!-- p1 -->\nText"));
  assert.deepEqual(
    separate.directives.map((d) => d.id),
    ["p0", "p1"],
  );
});
test("K14 warns only for earlier duplicates, never for a directive itself", () => {
  const paragraph = (story, index, endIndex = index) => ({
    type: "paragraph",
    story,
    index,
    endIndex,
  });
  assert.deepEqual(duplicateDirectiveFlags([paragraph("body", 4, 7)]), [false]);
  assert.deepEqual(
    duplicateDirectiveFlags([
      paragraph("body", 4, 7),
      paragraph("body", 5),
      paragraph("header1", 5),
      paragraph("body", 8),
      paragraph("body", 7, 9),
      { type: "table", id: "t0" },
      { type: "table", id: "t1" },
      { type: "table", id: "t0" },
    ]),
    [false, true, false, false, true, false, false, true],
  );
  const result = parseDocumentMetadata(agent("<!-- p4-p7 -->\nA\n<!-- p8 -->\nB\n<!-- p5 -->\nC"));
  const warnings = result.warnings.filter((w) => w.code === "duplicate-directive-id");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /ID p5 /);
});
test("K15 rejects browser-normalized dangerous URL schemes", () => {
  for (const prefix of ["\u0001", "\u001f"])
    assert.equal(parseJubarte(`[a](<${prefix}javascript:alert(1)>)`).value[0].children[0].url, "");
  const direct = projectDialect(
    {
      children: [
        {
          type: "paragraph",
          children: [{ type: "link", url: "\u0000javascript:alert(1)", children: [] }],
        },
      ],
    },
    { markdown: "" },
    { metadata: {} },
  );
  assert.equal(direct.value[0].children[0].url, "");
  for (const url of ["https://example.org", "#safe", "relative/path"])
    assert.equal(parseJubarte(`[a](${url})`).value[0].children[0].url, url);
});
// Integration resource bound: isolate adversarial regex work in a child process.
test("K16 rejects a long malformed br tag within a bounded subprocess budget", () => {
  const code = `import {projectDialect} from ${JSON.stringify(new URL("./projection.mjs", import.meta.url).href)}; const value='<br'+' '.repeat(200000)+'x>'; const r=projectDialect({children:[{type:'paragraph',children:[{type:'html',value}]}]},{markdown:value},{metadata:{}}); if(r.value[0].children[0].text!==value)process.exit(2);`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { timeout: 3000 });
  assert.equal(r.status, 0, String(r.error || r.stderr));
});
test("K17 parses compact reply bodies containing colons and dated replies", () => {
  for (const date of ["", " 2026-10-01T12:30:00Z"]) {
    const r = parseAgentTag(`c5 @A${date} re c3:note:more`, { agentView: true });
    assert.equal(r?.ids[0], "5");
    assert.equal(r.replyTo, "c3");
    assert.equal(r.text, "note:more");
  }
});
test("K18 second substitution author uses own fallback date", () => {
  const options = { agentView: true, date: "2026-11-01" };
  const r = prepareCritic("{~~old~>new~~}{>>r1 @A 2026-10-01<<}{>>r2 @B<<}", options);
  assert.equal(r.changes[0].date, "2026-10-01");
  assert.equal(r.changes[1].date, "2026-11-01");
  assert.equal(r.changes[1].author, "B");
  const shared = prepareCritic("{~~old~>new~~}{>>r1 @A 2026-10-01<<}", options);
  assert.deepEqual(
    shared.changes.map((c) => c.date),
    ["2026-10-01", "2026-10-01"],
  );
});
test("K19 nested replies retain direct parents inside one discussion", () => {
  const r = prepareCritic("{>>c1 @A: root<<}{>>c2 @B re c1: reply<<}{>>c3 @C re c2: nested<<}", {
    agentView: true,
  });
  assert.equal(discussions({ critic: r }).length, 1);
  assert.equal(r.comments[2].replyTo, "c2");
  const orphan = prepareCritic("{>>c3 @C re c9: orphan<<}", { agentView: true });
  assert.equal(orphan.comments[0].threadReference, "body:comment:9");
});

test("K16 preserves accepted br whitespace variants", () => {
  for (const value of ["<br>", "<br />", "<br  /  >", "<BR   >"]) {
    const r = projectDialect(
      { children: [{ type: "paragraph", children: [{ type: "html", value }] }] },
      { markdown: value },
      { metadata: {} },
    );
    assert.equal(r.value[0].children[0].text, "\n");
  }
});
