// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
// SPDX-License-Identifier: Apache-2.0
// Integration: verify the workspace declares the tools its scripts use.
import {it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
it('K34 declares the vendored typecheck toolchain',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 expect(pkg.devDependencies.typescript).toBeTruthy();expect(pkg.devDependencies['@types/bun']).toBeTruthy();
});
