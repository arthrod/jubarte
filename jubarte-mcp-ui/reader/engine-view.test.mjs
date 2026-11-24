// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// The reader against the engine's own output: the adoption redline as
// jubarte-mcp's docx_preview hands it over (read_view, page markers off).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJubarte } from './jubarte.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const jubarte = process.env.JUBARTE || join(repo, 'jubarte-python/.venv/bin/jubarte');
const redline = join(repo, 'examples/adoption/08-accept-reject/redline.docx');

test('no attribution tag of the engine reaches the page as text', { skip: !existsSync(jubarte) && 'no jubarte binary' }, () => {
  const md = execFileSync(jubarte, ['read', redline, '--no-page-markers'], { encoding: 'utf8' });
  assert.match(md, /\{r\d+(?:\+\d+)* @\w+\}/, 'the engine still writes plain tags');
  const result = parseJubarte(md);
  const text = JSON.stringify(result.value ?? result);
  assert.doesNotMatch(text, /\{r\d+(?:\+\d+)* @/);
  const changes = result.metadata.changes;
  assert.equal(changes.length, 9);
  assert.ok(changes.every((c) => c.revisionIds.length && c.author === 'Ann'), JSON.stringify(changes.map((c) => [c.author, c.revisionIds])));
});
