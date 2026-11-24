// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

import {composeLayout} from '@premirror/composer';
import {createFootnoteAllocator,flattenLayoutBlocks} from './footnote-layout.js';

/** A table extension around the real Premirror measurer and line composer.
 * Coordinates in tableFragments are frame-relative; cell coordinates are local
 * to the fragment, line coordinates local to the cell. Repeated header copies
 * are explicitly marked and never included in the canonical PM mapping.
 */
/** The grid's column widths in px: in proportion to the source grid's widths
 * (Word's tblGrid, from the table line's `widths`), or even. A zero-width
 * column keeps 2px so its cell stays drawable. */
export function gridWidths(weights,columns,width){
 const usable=Array.isArray(weights)&&weights.length===columns&&weights.every(n=>Number.isFinite(n)&&n>=0)&&weights.some(n=>n>0);
 let out;
 if(usable){const floor=Math.min(2,width/columns),zero=weights.filter(w=>w===0).length,total=weights.reduce((a,b)=>a+b,0),room=width-floor*zero;out=weights.map(w=>w===0?floor:room*w/total)}
 else out=Array.from({length:columns},()=>width/columns);
 out[columns-1]+=width-out.reduce((a,b)=>a+b,0);return out}
/** Widths no narrower than each column's longest word (`mins`), as Word's
 * autofit keeps them: a short column takes room from the others in
 * proportion to their slack; when the words cannot all fit, the columns
 * share the frame by their minimums. */
export function fitMinimums(widths,mins,total){
 const need=widths.reduce((n,w,i)=>n+Math.max(0,mins[i]-w),0);if(need<=0)return widths;
 const minTotal=mins.reduce((a,b)=>a+b,0);if(minTotal>=total)return mins.map(m=>total*m/minTotal);
 const slack=widths.map((w,i)=>Math.max(0,w-mins[i])),free=slack.reduce((a,b)=>a+b,0);
 return widths.map((w,i)=>w<mins[i]?mins[i]:w-need*slack[i]/free)}
/** A table's drawn width: the frame's, or the source grid's own width
 * (inches) when that is wider, reaching into the right margin as Word draws
 * it, short of the page edge by a 12px gutter. */
export function tableWidth(widthsIn,frame,rightMargin){
 const natural=Array.isArray(widthsIn)&&widthsIn.every(Number.isFinite)?widthsIn.reduce((a,b)=>a+b,0)*96:0;
 return natural>frame?Math.min(natural,frame+Math.max(0,rightMargin-12)):frame}
/** Padding and width for a table whose columns' longest words (`textMins`,
 * px) must fit: as Word's autofit, the table first grows from the frame
 * (`width`) toward `maxWidth`, then its cell padding tightens from 8px to
 * 2px; past that, words break. An empty column costs nothing. */
export function fitTable(textMins,width,maxWidth){
 for(let pad=8;pad>=2;pad--){const need=textMins.reduce((n,t)=>n+(t>0?t+2*pad+3:0),0);if(need<=width)return {pad,width};if(need<=maxWidth)return {pad,width:need}}
 return {pad:2,width:Math.max(width,maxWidth)}}
export function composeWithTables(snapshot,runtime,input){
 const started=performance.now(),diagnostics=[],tableFragments=[],footnoteFragments=[],footnoteBands=[];
 const lh=input.typography.defaultLineHeightPx;
 // A section's pages bring their own size and margins (#47); these follow the page being filled.
 let spec=input.page,margins=input.margins,label;
 let width=spec.widthPx-margins.leftPx-margins.rightPx;
 let height=spec.heightPx-margins.topPx-margins.bottomPx;
 if(!(width>0&&height>=lh&&lh>0))throw new Error('Page content area must fit at least one text line.');
 const warningKeys=new Set();
 const warn=(code,message,tableId)=>{const key=code+'|'+message+'|'+tableId;if(!warningKeys.has(key)){warningKeys.add(key);diagnostics.push({code,message,tableId});}};
 const allBlocks=flattenLayoutBlocks([...snapshot.blocks,...(snapshot.footnotes||[]).flatMap(n=>n.blocks||[])]);
 const measured=runtime.measureSnapshot({...snapshot,blocks:allBlocks});
 const fallback=Object.values(measured.measuredRuns).some(m=>m.prepared?.kind==='premirror-measurement-fallback');
 const pages=[];let frameBounds={x:margins.leftPx,y:margins.topPx,width,height};
 let page,y=0,notes,finished=false,pending=null,held=false,colX=0;
 function applyPending(){if(!pending)return;const g=pending.geometry;spec=g.page;margins=g.margins;label=g.label;width=spec.widthPx-margins.leftPx-margins.rightPx;height=spec.heightPx-margins.topPx-margins.bottomPx;frameBounds={x:margins.leftPx,y:margins.topPx,width,height};notes.setGeometry({width,height});pending=null;}
 // Word's w:type: nextPage (the default) breaks, oddPage/evenPage may leave a blank
 // page, and a continuous section of the same size flows on (its setup takes the next page).
 function startSection(section){pending=section;const kind=String(section.starts).toLowerCase(),g=section.geometry.page;
  // A continuous section takes its left and right margins at the break (#50); the rest waits for the next page.
  if((kind==='continuous'||kind==='nextcolumn')&&Math.abs(g.widthPx-spec.widthPx)<0.5&&Math.abs(g.heightPx-spec.heightPx)<0.5){if(page&&(y>0||page.frames[0].fragments.length)){const m=section.geometry.margins;colX=m.leftPx-margins.leftPx;width=Math.max(1,spec.widthPx-m.leftPx-m.rightPx);}else{applyPending();Object.assign(page,{spec,margins,label});page.frames[0].bounds={...frameBounds};}return;}
  if(y>0||held||page.frames[0].fragments.length){const previous=page.frames[0].fragments.at(-1);if(previous)previous.breakReason='section_break';newPage();}
  else{applyPending();Object.assign(page,{spec,margins,label});page.frames[0].bounds={...frameBounds};}
  const parity=kind==='oddpage'?0:kind==='evenpage'?1:null;if(parity!=null&&page.index%2!==parity)newPage();
  // An empty section's page stays, blank, for the next section to break from.
  held=!!section.empty;}
 function finishPage(){if(!page||finished)return;const result=notes.finishPage(page.index);if(result.band)footnoteBands.push(result.band);for(const fragment of result.fragments){footnoteFragments.push(fragment);const byBlock=new Map();for(const line of fragment.lines){if(!byBlock.has(line.blockId))byBlock.set(line.blockId,[]);byBlock.get(line.blockId).push({...line,y:fragment.y+line.y});}for(const [blockId,lines] of byBlock)addFragment(blockId,lines,{footnote:true,footnoteId:fragment.footnoteId,continuedBefore:fragment.continuedBefore,continuedAfter:fragment.continuedAfter,orphan:fragment.orphan});}finished=true;}
 function newPage(){finishPage();applyPending();held=false;if(colX){colX=0;width=spec.widthPx-margins.leftPx-margins.rightPx;}page={index:pages.length,spec,margins,label,frames:[{bounds:{...frameBounds},fragments:[]}]};pages.push(page);y=0;finished=false;notes.beginPage();}
 function ensurePage(){if(y>=notes.bodyLimit-0.001)newPage();}
 const lineCache=new Map(),charWidths=new Map(),fragmentCounts=new Map();
 function glyphWidth(text,font){const key=font+'\0'+text;if(charWidths.has(key))return charWidths.get(key);const run={id:'table-glyph',text,font,marks:{},pmRange:{from:0,to:text.length}};const m=runtime.measureSnapshot({blocks:[{id:'table-glyph',type:'paragraph',attrs:{},runs:[run],pmRange:run.pmRange}]}).measuredRuns[run.id];const w=m?.widthPx??text.length*7;charWidths.set(key,w);return w;}
 const constrain=(lines,w)=>constrainLines(lines,w,lh,glyphWidth);
 // The room left on a line, its trailing spaces hanging as in Word.
 function alignShift(line,inner,rtl){const right=Math.max(0,...line.runs.filter(r=>r.text?.trim()).map(r=>{const t=r.text,kept=rtl?t.length:t.trimEnd().length;return r.x+(r.width||0)*(t.length?kept/t.length:1)}));return right?Math.max(0,inner-right):0;}
 // A paragraph whose first strong letter is Hebrew, Arabic, Syriac or Thaana reads
 // right to left (Unicode P2); the engine writes no w:bidi, so each line's runs are
 // mirrored across the room they take, the browser ordering the text inside each (#51).
 const RTL=/[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/,STRONG=/[\p{L}]/u;
 function isRtl(block){for(const r of block.runs||[])for(const ch of r.text||'')if(STRONG.test(ch))return RTL.test(ch);return false;}
 function mirror(line){const xs=line.runs.map(r=>r.x),lo=Math.min(...xs),hi=Math.max(...line.runs.map(r=>r.x+(r.width||0)));return {...line,runs:line.runs.map(r=>({...r,x:lo+hi-r.x-(r.width||0),rtl:true}))};}
 function composeLines(blocks,w){const key=blocks.map(b=>b.id+':'+(b.attrs?.indentPx||0)+':'+(b.attrs?.clipFrom??'')).join('|')+'@'+w;if(lineCache.has(key))return lineCache.get(key);if(!blocks.length)return [];
  let result=[];
  for(const block of blocks){const indent=Math.min(Math.max(0,block.attrs?.indentPx||0),Math.max(0,w-1)),inner=Math.max(1,w-indent);const clean={...block,attrs:{...block.attrs,manualPageBreakBefore:false,keepWithNext:false}};
   const count=1+(block.runs||[]).reduce((n,r)=>n+r.text.length,0);
   const layout=composeLayout({...measured,blocks:[clean]},null,{...input,page:{widthPx:inner,heightPx:Math.max(lh,(count+1)*lh)},margins:{leftPx:0,rightPx:0,topPx:0,bottomPx:0},policies:{...input.policies,minSlotWidthPx:1},obstacles:[]});
   let lines=[];for(const p of layout.pages)for(const f of p.frames)for(const fragment of f.fragments)for(const line of fragment.lines)lines.push({...line,blockId:fragment.blockId});
   lines=constrain(lines,inner);
   // Word's w:jc right and center: each line against the right edge or about the middle (#50).
   const data=block.attrs?.sourceData,align=data?.paragraphProperties?.alignment??data?.documentStyle?.alignment;
   const rtl=isRtl(block);
   for(const drawn of lines){const line=rtl&&drawn.runs.length?mirror(drawn):drawn;const shift=align==='right'||align==='center'?alignShift(line,inner,rtl)*(align==='center'?0.5:1):0;result.push({...line,y:result.length*lh,runs:line.runs.map(run=>({...run,x:run.x+indent+shift}))});}
  }
  lineCache.set(key,result);return result;
 }
 function addFragment(blockId,lines,extra={}){const index=fragmentCounts.get(blockId)||0;fragmentCounts.set(blockId,index+1);const ranges=lines.map(l=>l.pmRange);page.frames[0].fragments.push({blockId,fragmentIndex:index,pmRange:ranges.length?{from:Math.min(...ranges.map(r=>r.from)),to:Math.max(...ranges.map(r=>r.to))}:{from:0,to:0},lines,...extra});}
 function grid(table){const rows=table.rows||[],occupied=[],cells=[];let columns=0;const explicitColumns=rows.some(r=>r.cells.some(c=>Number.isInteger(c.columnIndex)));const sourceWidth=explicitColumns?Math.max(1,...rows.flatMap(r=>r.cells.map(c=>(c.columnIndex||0)+1))):null;
  for(let ri=0;ri<rows.length;ri++){occupied[ri]||=[];let cursor=0;for(const source of rows[ri].cells||[]){let ci=Number.isInteger(source.columnIndex)&&source.columnIndex>=0?source.columnIndex:cursor;
   if(source.mergedCovered){const anchor=occupied[ri][ci];if(anchor){anchor.blocks.push(...(source.blocks||[]));anchor.sourceCellIds.push(source.id);if(source.blocks?.some(b=>b.runs.some(r=>r.text)))warn('merged-covered-content',`Covered cell ${source.id} has content; it is preserved in spanning cell ${anchor.id}.`,table.id);cursor=ci+1;continue;}warn('orphan-covered-cell',`Covered cell ${source.id} has no spanning anchor and is rendered as a normal cell.`,table.id);}
   const valid=n=>Number.isInteger(n)&&n>=1&&n<=1000;let colspan=source.colspan??1,rowspan=source.rowspan??1;
   if(!valid(colspan)||!valid(rowspan)){warn('invalid-table-span',`Cell ${source.id} has invalid spans; rendered as one grid cell.`,table.id);colspan=rowspan=1;}
   if(sourceWidth&&ci+colspan>sourceWidth){warn('colspan-out-of-bounds',`Cell ${source.id} extends past the source grid; its colspan is constrained to the table.`,table.id);colspan=Math.max(1,sourceWidth-ci);}
   if(ri+rowspan>rows.length){warn('rowspan-out-of-bounds',`Cell ${source.id} extends past the last row; its rowspan is constrained to the table.`,table.id);rowspan=rows.length-ri;}
   const free=(col)=>{for(let r=ri;r<ri+rowspan;r++)for(let c=col;c<col+colspan;c++)if(occupied[r]?.[c])return false;return true;};
   if(!free(ci)){const original=ci;while(!free(ci))ci++;if(source.columnIndex!==undefined)warn('overlapping-table-span',`Cell ${source.id} overlaps an existing span at column ${original+1}; moved to the next free grid position without discarding content.`,table.id);}
   const cell={...source,id:source.id||`${table.id}-cell-${ri}-${ci}`,blocks:[...(source.blocks||[])],sourceCellIds:[source.id],rowIndex:ri,columnIndex:ci,colspan,rowspan,header:!!(source.header||rows[ri].header)};cells.push(cell);
   for(let r=ri;r<ri+rowspan;r++){occupied[r]||=[];for(let c=ci;c<ci+colspan;c++)occupied[r][c]=cell;}cursor=ci+colspan;columns=Math.max(columns,cursor);
  }}
  if(!columns)return {cells:[],rowHeights:[],rowTops:[0],columnWidths:[],total:0,headerHeight:0};
  const mins=Array.from({length:columns},()=>0);for(const c of cells){if(c.colspan!==1)continue;for(const block of c.blocks||[])for(const run of block.runs||[])for(const word of run.text.split(/\s+/))if(word)mins[c.columnIndex]=Math.max(mins[c.columnIndex],glyphWidth(word,run.font))}
  const weights=table.columnWidths||table.attrs?.columnWidths,maxWidth=width+Math.max(0,margins.rightPx-12),fit=fitTable(mins,width,maxWidth),drawn=Math.max(tableWidth(weights,width,margins.rightPx),fit.width);
  const columnWidths=fitMinimums(gridWidths(weights,columns,drawn),mins.map(t=>t>0?t+2*fit.pad+3:0),drawn);
  const colTops=[0];for(const w of columnWidths)colTops.push(colTops.at(-1)+w);
  const rowHeights=rows.map(()=>lh);
  for(const c of cells){c.x=colTops[c.columnIndex];c.width=colTops[c.columnIndex+c.colspan]-c.x;c.paddingX=Math.min(fit.pad,Math.max(0,(c.width-1)/4));c.innerWidth=Math.max(1,c.width-2*c.paddingX-1);c.lines=composeLines(c.blocks,c.innerWidth);const align=c.sourceData?.align||c.align;if(align==='center'||align==='right')c.lines=c.lines.map(l=>{const used=l.runs.reduce((n,r)=>Math.max(n,r.x+r.width),0),shift=Math.max(0,c.innerWidth-used)*(align==='center'?0.5:1);return {...l,runs:l.runs.map(r=>({...r,x:r.x+shift}))};});if(c.lines.some(l=>l.runs.some(r=>r.x+r.width>c.innerWidth+0.01)))warn('table-column-too-narrow',`Cell ${c.id} is narrower than a single rendered character. Its text remains visible without clipping, but may extend beyond the cell; use wider paper or fewer columns.`,table.id);c.naturalHeight=Math.max(lh,c.lines.length*lh);if(c.rowspan===1)rowHeights[c.rowIndex]=Math.max(rowHeights[c.rowIndex],c.naturalHeight);}
  for(const c of cells.filter(c=>c.rowspan>1)){const current=rowHeights.slice(c.rowIndex,c.rowIndex+c.rowspan).reduce((a,b)=>a+b,0);if(current<c.naturalHeight)rowHeights[c.rowIndex+c.rowspan-1]+=Math.ceil((c.naturalHeight-current)/lh)*lh;}
  const rowTops=[0];for(const h of rowHeights)rowTops.push(rowTops.at(-1)+h);
  for(const c of cells){c.y=rowTops[c.rowIndex];c.height=rowTops[c.rowIndex+c.rowspan]-c.y;}
  let headerCount=0;while(headerCount<rows.length&&(rows[headerCount].header||(rows[headerCount].cells.length&&rows[headerCount].cells.every(c=>c.header))))headerCount++;
  // A header/body-crossing rowspan cannot be repeated independently.
  if(cells.some(c=>c.rowIndex<headerCount&&c.rowIndex+c.rowspan>headerCount)){warn('header-rowspan-crosses-body','Header repetition is disabled because a header cell spans into the table body.',table.id);headerCount=0;}
  const headerHeight=rowTops[headerCount];return {cells,rowHeights,rowTops,columnWidths,width:drawn,total:rowTops.at(-1),headerHeight,headerCount};
 }
 // A table's grid is measured on the width of the section it falls in.
 const grids={cache:new Map(),get(id){const b=tableBlocks.get(id);if(!b)return undefined;const key=id+'@'+width;if(!this.cache.has(key))this.cache.set(key,grid(b));return this.cache.get(key);}};const tableBlocks=new Map(snapshot.blocks.filter(b=>b.type==='table').map(b=>[b.id,b]));
 notes=createFootnoteAllocator({snapshot,composeLines,width,height,lineHeight:lh,warn});newPage();
 function emitTableSlice(table,g,start,end,repeated=false){if(end<=start)return;const fragment={tableId:table.id,pageIndex:page.index,frameIndex:0,x:colX,y,width:g.width||width,height:end-start,columnWidths:g.columnWidths,rowStart:g.rowTops.findIndex((v,i)=>v<=start&&g.rowTops[i+1]>start),repeated,rows:g.rowHeights.flatMap((h,i)=>{const top=Math.max(g.rowTops[i],start),bottom=Math.min(g.rowTops[i+1],end);return bottom>top?[{rowIndex:i,y:top-start,height:bottom-top,header:i<g.headerCount,repeated}]:[]}),cells:[]};
  for(const c of g.cells){const top=Math.max(c.y,start),bottom=Math.min(c.y+c.height,end);if(bottom<=top)continue;const lines=c.lines.filter(l=>c.y+l.y>=start-0.001&&c.y+l.y+lh<=end+0.001).map(l=>({...l,y:c.y+l.y-top,runs:l.runs.map(r=>({...r,x:r.x+c.paddingX}))}));
   const cell={cellId:c.id,sourceCellIds:c.sourceCellIds,rowIndex:Math.max(c.rowIndex,fragment.rowStart),originalRowIndex:c.rowIndex,columnIndex:c.columnIndex,colspan:c.colspan,rowspan:fragment.rows.filter(r=>r.rowIndex>=c.rowIndex&&r.rowIndex<c.rowIndex+c.rowspan).length,originalRowspan:c.rowspan,pmRange:c.pmRange,x:c.x,y:top-start,width:c.width,height:bottom-top,lines,header:c.header,repeated,continuedBefore:top>c.y,continuedAfter:bottom<c.y+c.height,paddingX:c.paddingX};fragment.cells.push(cell);
   const byBlock=new Map();for(const l of lines){if(!byBlock.has(l.blockId))byBlock.set(l.blockId,[]);byBlock.get(l.blockId).push({...l,y:y+cell.y+l.y,runs:l.runs.map(r=>({...r,x:r.x+cell.x+colX}))});}for(const [id,ls] of byBlock)addFragment(id,ls,{tableCell:true,tableId:table.id,cellId:c.id,repeated,repeatedHeader:repeated});
  }const previous=tableFragments.at(-1);if(previous&&previous.tableId===fragment.tableId&&previous.pageIndex===fragment.pageIndex&&Math.abs(previous.y+previous.height-fragment.y)<0.001){const offset=previous.height;previous.cells.push(...fragment.cells.map(c=>({...c,y:c.y+offset})));previous.rows.push(...fragment.rows.map(r=>({...r,y:r.y+offset})));previous.height+=fragment.height;previous.repeated=previous.repeated&&fragment.repeated;}else tableFragments.push(fragment);y+=fragment.height;
 }
 for(let bi=0;bi<snapshot.blocks.length;bi++){const block=snapshot.blocks[bi];for(const section of block.attrs?.sectionStarts||[])startSection(section);ensurePage();if(block.attrs?.manualPageBreakBefore&&y>0){const previous=page.frames[0].fragments.at(-1);if(previous)previous.breakReason='manual_page_break';newPage();}
  if(block.type!=='table'){const lines=composeLines([block],width);let cursor=0,fragmentIndex=0;const next=snapshot.blocks[bi+1];if(block.attrs?.keepWithNext&&input.policies.keepWithNextEnabled&&next){const need=lines.length*lh+(next.type==='table'?(grids.get(next.id).rowHeights[0]||0):composeLines([next],width).length*lh);if(need<=height&&y>0&&notes.bodyLimit-y<need)newPage();}
   while(cursor<lines.length){let fit=Math.floor((notes.bodyLimit-y+0.001)/lh),remaining=lines.length-cursor;if(!fit){newPage();continue;}const orphan=input.policies.orphanLinesMin||1,widow=input.policies.widowLinesMin||1;if(remaining>fit){if(fit<orphan&&y>0){newPage();continue;}if(remaining-fit<widow&&fit-(widow-(remaining-fit))>=orphan)fit-=widow-(remaining-fit);}
    const checkpoint=notes.checkpoint();let accepted=0;while(accepted<Math.min(fit,remaining)&&notes.accept([lines[cursor+accepted]],y+(accepted+1)*lh,y+accepted*lh))accepted++;
    if(!accepted){notes.restore(checkpoint);newPage();continue;}
    if(accepted<remaining&&accepted<orphan&&y>0){notes.restore(checkpoint);newPage();continue;}
    if(remaining>accepted&&remaining-accepted<widow&&accepted-(widow-(remaining-accepted))>=orphan){const reduced=accepted-(widow-(remaining-accepted));notes.restore(checkpoint);accepted=0;while(accepted<reduced&&notes.accept([lines[cursor+accepted]],y+(accepted+1)*lh,y+accepted*lh))accepted++;}
    const chunk=lines.slice(cursor,cursor+accepted).map((l,i)=>({...l,y:y+i*lh,runs:colX?l.runs.map(r=>({...r,x:r.x+colX})):l.runs}));addFragment(block.id,chunk,{fragmentIndex:fragmentIndex++,...(colX?{offsetX:colX}:{}),...(cursor+accepted<lines.length?{breakReason:'frame_overflow'}:{})});cursor+=chunk.length;y+=chunk.length*lh;if(cursor<lines.length)newPage();}
   continue;}
  const g=grids.get(block.id);if(!g.total)continue;
  if(y>0&&g.headerCount>0&&g.headerCount<g.rowHeights.length){const initialGroup=g.rowTops[g.headerCount+1];if(initialGroup<=height&&initialGroup>notes.bodyLimit-y)newPage();}
  let start=0;const repeat=g.headerHeight>0&&g.headerHeight<=height/4&&height-g.headerHeight>=lh&&block.repeatHeader!==false&&block.attrs?.repeatHeader!==false;
  if(g.headerHeight>0&&!repeat&&block.repeatHeader!==false&&block.attrs?.repeatHeader!==false)warn('header-too-tall','Header repetition is disabled because the header occupies more than one quarter of the page.',block.id);
  const sliceLines=(from,to)=>g.cells.flatMap(c=>c.lines.filter(l=>c.y+l.y>=from-0.001&&c.y+l.y+lh<=to+0.001));
  let repeatedHeight=0;
  function nextTablePage(){newPage();repeatedHeight=0;if(repeat&&start>=g.headerHeight){emitTableSlice(block,g,0,g.headerHeight,true);repeatedHeight=g.headerHeight;}}
  while(start<g.total-0.001){
   // Prefer whole rows, but probe every source line because a reference within
   // a tall row may introduce a new reserved note band midway through it.
   const checkpoint=notes.checkpoint();let end=start,used=0;
   while(end<g.total-0.001&&notes.accept(sliceLines(end,end+lh),y+used+lh,Math.max(0,y+used-repeatedHeight))){end+=lh;used+=lh;}
   if(end<=start+0.001){notes.restore(checkpoint);nextTablePage();continue;}
   const boundaries=g.rowTops.filter(v=>v>start+0.001&&v<=end+0.001);
   const nextBoundary=g.rowTops.find(v=>v>start+0.001),rowRemainder=nextBoundary-start;
   let selected=boundaries.length?boundaries.at(-1):end;
   // A short row is moved intact to a fresh page when possible. A note-bearing
   // row that cannot fit there is split into measured line slices instead.
   if(!boundaries.length&&y>repeatedHeight+0.001&&rowRemainder<=height-(repeat&&start>=g.headerHeight?g.headerHeight:0)){
    notes.restore(checkpoint);nextTablePage();continue;
   }
   if(selected<end-0.001){notes.restore(checkpoint);let pos=start,offset=0;while(pos<selected-0.001){if(!notes.accept(sliceLines(pos,pos+lh),y+offset+lh,Math.max(0,y+offset-repeatedHeight)))throw new Error('Footnote row rollback lost a previously accepted line.');pos+=lh;offset+=lh;}}
   emitTableSlice(block,g,start,selected);start=selected;
   if(start<g.total-0.001)nextTablePage();
  }
 }
 // Keep otherwise-unreferenced definitions visible. Once body flow ends,
 // continuation-only pages use the whole measured content area.
 notes.enqueueOrphans();notes.fillRemainder(y);finishPage();
 while(notes.hasPending){newPage();notes.fillRemainder(0);finishPage();if(!footnoteFragments.some(f=>f.pageIndex===page.index))throw new Error('Page content area cannot fit one footnote line and its label.');}

 // Stable canonical mapping excludes decorative repeated header copies.
 const refs=[];pages.forEach((p,pi)=>p.frames.forEach((f,fi)=>f.fragments.forEach((fr,fri)=>{if(fr.repeated)return;fr.lines.forEach((line,li)=>refs.push({line,pageIndex:pi,frameIndex:fi,fragmentIndex:fri,lineIndex:li}));})));
 const mapping={pmPosToLayout(pos){const r=refs.find(r=>r.line.pmRange.from<=pos&&r.line.pmRange.to>=pos);return r?{pageIndex:r.pageIndex,frameIndex:r.frameIndex,fragmentIndex:r.fragmentIndex,lineIndex:r.lineIndex,offsetInLine:pos-r.line.pmRange.from}:null;},layoutToPmPos(point){const l=pages[point.pageIndex]?.frames[point.frameIndex]?.fragments[point.fragmentIndex]?.lines[point.lineIndex];return l?Math.min(l.pmRange.to,l.pmRange.from+point.offsetInLine):null;}};
 const layout={pages,mapping,metrics:{extractionMs:0,measurementMs:0,composeMs:performance.now()-started,pages:pages.length,blocks:allBlocks.length},tableFragments,footnoteFragments,footnoteBands};
 return {layout,measured,fallback,tableFragments,footnoteFragments,footnoteBands,diagnostics};
}

const graphemes=text=>typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(s=>s.segment):Array.from(text);

/** Upstream's word-boundary repair may exceed the slot for long unbroken
 * words, and a line can end a hair past it on a trailing space. Wrap only
 * those lines, preserving code points, marks and PM spans. Spaces hang past
 * the edge as Word lets them, a line breaks after its last space, and only a
 * word wider than the slot is cut by grapheme (b106: "(i" / "f "). */
export function constrainLines(lines,w,lh,glyphWidth){
  const space=ch=>ch===' '||ch==='\t';
  const out=[];
  for(const line of lines){
    // Judged on the composer's own widths: a sum of glyphs runs wider than a
    // kerned run, so the space alone must be what crosses the edge.
    const last=line.runs.at(-1),trail=last?.text.match(/[ \t]+$/)?.[0]||'',hang=trail?glyphWidth(trail,last.font):0;
    if(line.runs.every((r,i)=>r.x+r.width-(i===line.runs.length-1?hang:0)<=w+0.01)){out.push(line);continue;}
    const chars=[];
    for(const run of line.runs){let offset=0;const span=run.pmRange.to-run.pmRange.from;for(const ch of graphemes(run.text)){chars.push({run,ch,cw:glyphWidth(ch,run.font),from:run.pmRange.from+Math.floor(offset*span/run.text.length),to:run.pmRange.from+Math.floor((offset+ch.length)*span/run.text.length)});offset+=ch.length;}}
    const pieces=[];
    for(let start=0;start<chars.length;){
      let end=start,used=0,lastBreak=-1;
      while(end<chars.length){const c=chars[end];if(!space(c.ch)&&end>start&&used+c.cw>w+0.01)break;used+=c.cw;end++;if(space(c.ch))lastBreak=end;}
      if(end<chars.length&&lastBreak>start)end=lastBreak;
      pieces.push(chars.slice(start,end));start=end;
    }
    if(pieces.length<=1){out.push(line);continue;}
    for(const piece of pieces){
      const runs=[];let used=0;
      for(const c of piece){const previous=runs.at(-1);if(previous&&previous.runId===c.run.runId&&previous.pmRange.to===c.from){previous.text+=c.ch;previous.width+=c.cw;previous.pmRange.to=c.to;}else runs.push({...c.run,text:c.ch,x:used,width:c.cw,pmRange:{from:c.from,to:c.to}});used+=c.cw;}
      out.push({...line,runs,pmRange:{from:Math.min(...runs.map(r=>r.pmRange.from)),to:Math.max(...runs.map(r=>r.pmRange.to))}});
    }
  }
  return out.map((line,i)=>({...line,y:i*lh,height:lh}));
}
