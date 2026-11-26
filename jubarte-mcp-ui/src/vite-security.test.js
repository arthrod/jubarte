// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
// SPDX-License-Identifier: Apache-2.0
// Integration: the upstream advisory's inert canary, confined to local scratch.
import {it, expect} from 'vitest';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
it('K46 virtual-module text cannot grant access to an out-of-root canary',async()=>{
 const scratch=resolve('../.scratch/bot8/vite-security');mkdirSync(scratch,{recursive:true});
 const dir=mkdtempSync(resolve(scratch,'case-')),root=resolve(dir,'app');mkdirSync(root);
 const canary=resolve(dir,'canary.txt');writeFileSync(canary,'INERT-REVIEW-CANARY');
 const server=await createServer({configFile:false,root,cacheDir:resolve(dir,'cache'),logLevel:'silent',server:{host:'127.0.0.1',port:0,fs:{strict:true,allow:[root]}},optimizeDeps:{noDiscovery:true}});
 try{
  await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`;
  const path='/@fs'+canary;
  expect((await fetch(base+path)).status).toBe(403);
  const injected="__vite-browser-external:`);}});\nimport '"+path+"';\nvar z=new Proxy({}, {get(_, key) {throw new Error(`";
  const loaded=await server.environments.client.pluginContainer.load(injected);
  const code=typeof loaded==='string'?loaded:loaded.code;
  expect(code).not.toContain("\nimport '"+path+"';");
  await fetch(base+'/@id/'+encodeURIComponent(injected)+'?import');
  expect((await fetch(base+path)).status).toBe(403);
 }finally{await server.close();rmSync(dir,{recursive:true,force:true});}
});
