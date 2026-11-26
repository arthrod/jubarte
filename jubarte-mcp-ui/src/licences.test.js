// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
// SPDX-License-Identifier: Apache-2.0
// Integration tests: exercise the build banner against the packaged notices.
import {describe, it, expect} from 'vitest';
import config, {packageDirOf} from '../vite.config.js';
describe('licence distribution', () => {
 it('K1 includes the bundled Source Serif 4 copyright in the HTML', () => {
  const banner = config.plugins.find(p => p.name === 'jubarte-licence-banner');
  const html = banner.transformIndexHtml.handler('<!doctype html><html></html>');
  expect(html).toContain('© 2014 - 2021 Adobe Systems Incorporated (http://www.adobe.com/), with Reserved Font Name ‘Source’.');
 });
 it('K2 discovers normalized and native Windows package IDs', () => {
  for (const root of ['C:/repo', 'C:\\repo']) {
   const normalize = p => p?.replaceAll('\\', '/');
   expect(normalize(packageDirOf('C:/repo/node_modules/react/index.js', root))).toBe('C:/repo/node_modules/react');
   expect(normalize(packageDirOf('C:\\repo\\node_modules\\@scope\\pkg\\index.js', root))).toBe('C:/repo/node_modules/@scope/pkg');
   for (const vendor of ['premirror', 'remark-critic-markup-jubarte'])
    expect(normalize(packageDirOf(`C:/repo/reader/vendor/${vendor}/index.js`, root))).toBe(`C:/repo/reader/vendor/${vendor}`);
  }
 });
});
