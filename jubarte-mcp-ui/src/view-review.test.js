// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// Integration: load the actual card with the SDK's in-memory transport.
import {afterEach, expect, it, vi} from 'vitest';
import markup from './document.html?raw';
import {AppBridge} from '@modelcontextprotocol/ext-apps/app-bridge';
import {InMemoryTransport} from '@modelcontextprotocol/client';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
let bridge,app;
afterEach(async()=>{await app?.close();await bridge?.close();vi.restoreAllMocks();vi.unstubAllGlobals();});
for(const transition of ['empty result','file list','tool input','current preview'])it(transition==='current preview'?'K40 current preview still renders':`K40 ${transition} invalidates an outstanding preview`,async()=>{
 vi.resetModules();
 const {App}=await import('@modelcontextprotocol/ext-apps');
 document.documentElement.innerHTML=markup;
 vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
 vi.stubGlobal('requestAnimationFrame',()=>0);
 vi.stubGlobal('OffscreenCanvas',class {getContext(){return {font:'',measureText:text=>({width:text.length*7})}}});
 const [client,host]=InMemoryTransport.createLinkedPair();
 bridge=new AppBridge(null,{name:'test-host',version:'1'},{serverTools:{}});
 const preview=deferred(),requested=deferred();bridge.oncalltool=()=>{requested.resolve();return preview.promise};
 await bridge.connect(host);
 const connect=App.prototype.connect;
 vi.spyOn(App.prototype,'connect').mockImplementation(function(){app=this;return connect.call(this,client)});
 await import('./view.js');
 const calls=vi.spyOn(app,'callServerTool');
 await bridge.sendToolResult({content:[],structuredContent:{path:'old.docx'}});
 await requested.promise;
 if(transition==='empty result')await bridge.sendToolResult({content:[]});
 if(transition==='file list')await bridge.sendToolResult({content:[],structuredContent:{files:[{path:'new.docx'}]}});
 if(transition==='tool input')await bridge.sendToolInput({arguments:{}});
 const expected=document.getElementById('empty-title').textContent;
 preview.resolve({content:[],structuredContent:{markdown:'Old content',path:'old.docx'}});
 // Drain the in-memory protocol response and its async open continuation.
 await calls.mock.results[0].value;
 await Promise.resolve();
 if(transition==='current preview'){
  expect(document.getElementById('result').hidden).toBe(false);
  expect(document.getElementById('outname').textContent).toBe('old.docx');
  return;
 }
 expect(document.getElementById('result').hidden).toBe(true);
 if(transition==='file list')expect(document.getElementById('files').hidden).toBe(false);
 else expect(document.getElementById('empty-title').textContent).toBe(expected);
});
