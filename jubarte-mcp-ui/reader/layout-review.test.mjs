// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {Schema} from 'prosemirror-model';
import {EditorState,TextSelection} from 'prosemirror-state';
import {createPremirror} from '@premirror/prosemirror-adapter';
import {composeLayout,breakBlockIntoLineDrafts,measurementCacheUsage} from '@premirror/composer';
import {collectRectsForPmRange} from '@premirror/react';
import {defaultPremirrorOptions,createLayoutInputFromOptions} from '@premirror/core';
import {composeWithTables} from './table-layout.js';
import {durationStatistics} from './vendor/premirror/packages/composer/scripts/statistics.ts';
import {parseJubarte} from './jubarte.mjs';
import {resolvePageGeometry} from './page-geometry.mjs';
// Deterministic measurement backend implementing the canvas interface pretext uses.
// Its bundled measurement implementation requires only font and measureText here.
globalThis.OffscreenCanvas=class {getContext(){return {font:'',measureText(text){return {width:this.font.includes('unequal')?[...text].reduce((n,ch)=>n+(ch==='W'?11:3),0):text.length*7}}}}};
Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>0}});
const run=(text,id='r',from=1,atomic=false)=>({id,text,font:'16px sans-serif',marks:{},pmRange:{from,to:from+text.length},atomic});
const block=(runs,id='b')=>({id,type:'paragraph',attrs:{},runs,pmRange:{from:runs[0]?.pmRange.from??1,to:runs.at(-1)?.pmRange.to??1}});
const snapshot=blocks=>({blocks,measuredRuns:Object.fromEntries(blocks.flatMap(b=>b.runs).map(r=>[r.id,{runId:r.id,textLength:r.text.length,widthPx:r.text.length*7,prepared:{widthPx:r.text.length*7}}]))});
const options=(width=70,height=100)=>defaultPremirrorOptions({page:{widthPx:width,heightPx:height},margins:{topPx:0,bottomPx:0,leftPx:0,rightPx:0},typography:{defaultFont:'16px sans-serif',defaultLineHeightPx:10},policies:{widowLinesMin:2,orphanLinesMin:2,minSlotWidthPx:1}});
const input=(w,h)=>createLayoutInputFromOptions(options(w,h));
const drafts=(runs,w=100)=>{const b=block(runs);return breakBlockIntoLineDrafts(b,snapshot([b]),w)};
const texts=ls=>ls.map(l=>l.runs.map(r=>r.text).join(''));
function schema(withBreak=false){return new Schema({nodes:{doc:{content:'block+'},paragraph:{content:'inline*',group:'block',...(withBreak?{attrs:{manualPageBreakBefore:{default:false}}}:{})},text:{group:'inline'},image:{inline:true,group:'inline',atom:true},code_block:{content:'text*',group:'block'},horizontal_rule:{group:'block',atom:true},hard_break:{inline:true,group:'inline'}}});}
function stateAt(s,text='abcd'){const doc=s.nodes.doc.create(null,s.nodes.paragraph.create(null,s.text(text)));return EditorState.create({schema:s,doc,selection:TextSelection.create(doc,3)});}
test('K3 explicitly refuses unsupported schema blocks instead of dropping content',()=>{
 for(const name of ['code_block','horizontal_rule']){const s=schema();const doc=s.nodes.doc.create(null,s.nodes[name].create(null,name==='code_block'?s.text('code'):null));assert.throws(()=>createPremirror(options()).toSnapshot(EditorState.create({schema:s,doc})),/Unsupported block/);}
});
test('K4 splits the textblock at the cursor and marks the suffix with a page break',()=>{
 const state=stateAt(schema(true));let tr;assert.equal(createPremirror(options()).commands.insertPageBreak(state,t=>tr=t),true);
 assert.equal(tr.doc.child(0).textContent,'ab');assert.equal(tr.doc.child(1).textContent,'cd');assert.equal(tr.doc.child(1).attrs.manualPageBreakBefore,true);
});
test('K5 unsupported page-break schema returns false without dispatch',()=>{
 let dispatched=false;assert.equal(createPremirror(options()).commands.insertPageBreak(stateAt(schema()),()=>dispatched=true),false);assert.equal(dispatched,false);
});
const selectionLayout=()=>composeLayout(snapshot([block([run('!!!!!!!!!!')])]),null,input(35,100));
test('K8 soft-wrap boundary has one downstream caret',()=>{const rects=collectRectsForPmRange(selectionLayout(),6,6,'single');assert.equal(rects.length,1);assert.equal(rects[0].y,10)});
test('K9 caret uses the within-run character offset',()=>{const l=selectionLayout();assert.equal(collectRectsForPmRange(l,3,3,'single')[0].x-collectRectsForPmRange(l,1,1,'single')[0].x,14)});
test('K10 partial selection covers only selected glyphs and includes frame offsets',()=>{
 const l=selectionLayout();l.pages[0].frames[0].bounds.x=10;l.pages[0].frames[0].bounds.y=20;
 assert.deepEqual(collectRectsForPmRange(l,1,2,'single')[0],{x:10,y:20,width:7,height:10});assert.equal(collectRectsForPmRange(l,1,6,'single')[0].width,35);
});
test('K11 structured page settings produce no unsupported warning',()=>{
 const r=parseJubarte('---\nview: agent\npage: {size: Legal, orientation: landscape}\n---\nText');
 assert.equal(resolvePageGeometry(r).label,'Legal landscape');assert.ok(!r.document.warnings.some(w=>w.code==='unsupported-page-value'));
});
test('K23 moves an unsplittable three-line paragraph and retains a legal 2+2 split',()=>{
 const runtime={measureSnapshot:s=>snapshot(s.blocks)};
 for(const count of [15,20]){const bs=[block([run('!!','prefix')],'prefix'),block([run('!'.repeat(count),'para',4)],'para')];
  const l=composeWithTables(snapshot(bs),runtime,input(35,30)).layout;
  const counts=l.pages.map(p=>p.frames[0].fragments.filter(f=>f.blockId==='para').reduce((n,f)=>n+f.lines.length,0));
  assert.deepEqual(counts,count===15?[0,3]:[2,2]);
 }
});
test('K24 reports even/odd medians and nearest-rank p95',()=>{
 assert.deepEqual(durationStatistics(Array.from({length:20},(_,i)=>i+1)),{median:10.5,p95:19});
 assert.deepEqual(durationStatistics([3,1,2]),{median:2,p95:3});assert.deepEqual(durationStatistics([]),{median:0,p95:0});
});
test('K25 bounds retained successful measurements across documents',()=>{
 for(let i=0;i<1400;i++)drafts([run(String(i).padStart(5,'0')+'!')]);
 const usage=measurementCacheUsage();assert.ok(usage.entries>0);assert.ok(usage.entries<=1024,JSON.stringify(usage));assert.ok(usage.codeUnits<=1048576,JSON.stringify(usage));
});
test('K27 newline pieces include previous text and newline in their PM offsets',()=>{
 for(const atomic of [false,true])assert.deepEqual(drafts([run('a\n!','r',1,atomic)])[1].runs[0].pmRange,{from:3,to:4});
});
test('K28 explicit hard breaks keep blank lines and prevent word repair',()=>{
 assert.deepEqual(texts(drafts([run('A'),run('\n','n1',2),run('\n','n2',3),run('B','b',4)])),['A','','B']);
 assert.deepEqual(texts(drafts([run('A\nB')])),['A','B']);
});
test('K29 atomic segments begin after a fitting prefix or at zero after wrap',()=>{
 for(const width of [100,21]){const ls=drafts([run('Hi ','p'),run('X','x',4,true)],width);assert.equal(ls.at(-1).runs.at(-1).x,width===100?21:0);}
});
test('K30 whitespace wrapping preserves every grapheme boundary',()=>{
 const text='a \u0301bc';const boundaries=new Set([0,...[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(s=>s.index+s.segment.length)]);
 const ls=drafts([run(text)],28);for(const l of ls)for(const r of l.runs){assert.ok(boundaries.has(r.pmRange.from-1));assert.ok(boundaries.has(r.pmRange.to-1),JSON.stringify(r));}
 assert.equal(texts(ls).join(''),text);
});
test('K32 respects orphan refusal on a used page and makes progress on tiny pages',()=>{
 const bs=[block([run('!\n?\n.','intro')],'intro'),block([run('!\n?\n.\n:','para',20)],'para')];
 const l=composeLayout(snapshot(bs),null,input(100,40));assert.ok(l.pages[0].frames[0].fragments.every(f=>f.blockId!=='para'));
 const tiny=composeLayout(snapshot([bs[1]]),null,input(100,10));assert.equal(tiny.pages.length,4);
});
test('K33 reflows to each final obstacle band across page transitions',()=>{
 const obstacle={id:'ob',yStart:10,yEnd:20,intervalsForBand:()=>[{start:0,end:60}]};
 const initial=composeLayout(snapshot([block([run('!'.repeat(24))])]),null,{...input(100,100),obstacles:[obstacle]});
 for(const p of initial.pages)for(const f of p.frames[0].fragments)for(const line of f.lines)for(const r of line.runs)assert.ok(r.x+r.width<=100,JSON.stringify(r));
 const bs=[block([run('!','prefix')],'prefix'),block([run('!'.repeat(40),'body',3)],'body')];
 const l=composeLayout(snapshot(bs),null,{...input(100,20),policies:{widowLinesMin:1,orphanLinesMin:1,minSlotWidthPx:1},obstacles:[obstacle]});
 let text='';for(const p of l.pages)for(const f of p.frames[0].fragments)for(const line of f.lines)for(const r of line.runs){assert.ok(r.x+r.width<=100,JSON.stringify({page:p.index,y:line.y,...r}));if(f.blockId==='body')text+=r.text;}
 assert.equal(text,'!'.repeat(40));
});
test('K35 skipped inline atoms separate contiguous source runs',()=>{
 const s=schema();const doc=s.nodes.doc.create(null,s.nodes.paragraph.create(null,[s.text('A'),s.nodes.image.create(),s.text('B')]));
 const runs=createPremirror(options()).toSnapshot(EditorState.create({schema:s,doc})).blocks[0].runs;
 assert.deepEqual(runs.map(r=>[r.text,r.pmRange]),[['A',{from:1,to:2}],['B',{from:3,to:4}]]);
});
test('K9 measured caret and selection respect unequal glyph advances',()=>{
 const l=selectionLayout(),line=l.pages[0].frames[0].fragments[0].lines[0];
 line.pmRange={from:1,to:3};line.runs=[{runId:'unequal',text:'Wi',font:'16px unequal',marks:{},x:0,width:14,pmRange:{from:1,to:3}}];
 assert.equal(collectRectsForPmRange(l,2,2,'single')[0].x,11);
 assert.equal(collectRectsForPmRange(l,1,2,'single')[0].width,11);
});
test('K23 footnote reservations roll back when the reduced fit violates widow policy',()=>{
 const intro=block([run('!\n?\n.','intro')],'intro');
 const para=block([{...run('!'.repeat(15),'body',20),footnoteId:'n'}],'para');
 const note=block([run('!','note',100)],'note');
 const measured={...snapshot([intro,para]),footnotes:[{id:'n',blocks:[note]}]};
 const result=composeWithTables(measured,{measureSnapshot:s=>snapshot(s.blocks)},input(35,100));
 assert.deepEqual(result.layout.pages.map(p=>p.frames[0].fragments.filter(f=>f.blockId==='para').reduce((n,f)=>n+f.lines.length,0)),[0,3]);
 assert.ok(result.footnoteFragments.every(f=>f.pageIndex===1));
});
test('K3 nested unsupported blocks are refused too',()=>{
 const s=new Schema({nodes:{doc:{content:'block+'},blockquote:{content:'block+',group:'block'},code_block:{content:'text*',group:'block'},text:{group:'inline'}}});
 const doc=s.nodes.doc.create(null,s.nodes.blockquote.create(null,s.nodes.code_block.create(null,s.text('code'))));
 assert.throws(()=>createPremirror(options()).toSnapshot(EditorState.create({schema:s,doc})),/Unsupported block/);
});
