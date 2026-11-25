// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

import {composeLayout,NO_LINE_START,NO_LINE_END} from '@premirror/composer';
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
/** A table's drawn width: the source grid's own width (inches), as Word
 * draws it, narrower than the frame (#65) or reaching into the right margin,
 * short of the page edge by a 12px gutter; the frame's when there is no grid. */
export function tableWidth(widthsIn,frame,rightMargin){
 const natural=Array.isArray(widthsIn)&&widthsIn.length&&widthsIn.every(Number.isFinite)?widthsIn.reduce((a,b)=>a+b,0)*96:0;
 if(!(natural>0))return frame;
 return Math.min(natural,frame+Math.max(0,rightMargin-12))}
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
 // Word keeps a paragraph's space before at the top of the document's first page and of a
 // section's, and drops it at the top of any other page (word-metrics, `pagetop`; #102).
 let topKeeps=true,prevPara=null;
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
  held=!!section.empty;if(y===0)topKeeps=true;}
 function finishPage(){if(!page||finished)return;const result=notes.finishPage(page.index);if(result.band)footnoteBands.push(result.band);for(const fragment of result.fragments){footnoteFragments.push(fragment);const byBlock=new Map();for(const line of fragment.lines){if(!byBlock.has(line.blockId))byBlock.set(line.blockId,[]);byBlock.get(line.blockId).push({...line,y:fragment.y+line.y});}for(const [blockId,lines] of byBlock)addFragment(blockId,lines,{footnote:true,footnoteId:fragment.footnoteId,continuedBefore:fragment.continuedBefore,continuedAfter:fragment.continuedAfter,orphan:fragment.orphan});}finished=true;}
 function newPage(){finishPage();applyPending();held=false;if(colX){colX=0;width=spec.widthPx-margins.leftPx-margins.rightPx;}page={index:pages.length,spec,margins,label,frames:[{bounds:{...frameBounds},fragments:[]}]};pages.push(page);y=0;finished=false;topKeeps=pages.length===1;notes.beginPage();}
 function ensurePage(){if(y>=notes.bodyLimit-0.001)newPage();}
 const lineCache=new Map(),charWidths=new Map(),fragmentCounts=new Map();
 // Word's space between two paragraphs (#102): the larger of the first's after and the second's
 // before, in px; auto is 14pt. Contextual spacing drops a side next to a paragraph of its own style.
 const styleKey=b=>b?.attrs?.sourceData?.wordStyle||b?.attrs?.sourceType||'p';
 const sidePx=(sp,side)=>sp?(sp[side+'Auto']?14:sp[side+'Pt']||0)*4/3:0;
 function pairGap(prev,next){const sp=next?.attrs?.spacing;const before=sidePx(sp,'before');if(!prev)return before;const same=styleKey(prev)===styleKey(next),after=sidePx(prev.attrs?.spacing,'after');return Math.max(same&&prev.attrs?.spacing?.contextual?0:after,same&&sp?.contextual?0:before);}
 const advance=l=>l.advance??lh;
 function glyphWidth(text,font){const key=font+'\0'+text;if(charWidths.has(key))return charWidths.get(key);const run={id:'table-glyph',text,font,marks:{},pmRange:{from:0,to:text.length}};const m=runtime.measureSnapshot({blocks:[{id:'table-glyph',type:'paragraph',attrs:{},runs:[run],pmRange:run.pmRange}]}).measuredRuns[run.id];const w=m?.widthPx??text.length*7;charWidths.set(key,w);return w;}
 // The room left on a line, its trailing spaces hanging as in Word.
 // Word hangs a line's trailing spaces outside the alignment: they are measured, not
 // estimated from their share of the run's characters (#85).
 function alignShift(line,inner,rtl){const right=Math.max(0,...line.runs.filter(r=>r.text?.trim()).map(r=>{const trail=rtl?'':r.text.match(/[ \t]+$/)?.[0]||'';return r.x+(r.width||0)-(trail?glyphWidth(trail,r.font):0)}));return right?Math.max(0,inner-right):0;}
 // Right-to-left text without the engine's w:bidi (#51, #53, #55; engine gap #54): a
 // paragraph reads in the direction of its first strong letter (Unicode P2). Runs are cut
 // where the class of their text changes (R, L, or a number, EN or AN), and the bidi algorithm
 // is applied at run level: W7 makes a number after an L an L; N1 gives neutral text the
 // direction of agreeing neighbours (a number counts as R), else the paragraph's; I1/I2
 // give the levels (a number at 2); L2 orders the runs. The browser orders the text inside
 // each run.
 const RTL=/[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/,STRONG=/[\p{L}]/u,DIGIT=/\p{Nd}/u;
 const SEPARATOR=/^[,./:\u00a0\u060c\u202f\u2044+\-\u2212]$/u,TERMINATOR=/^[#%\u00b0\u00b1\u2030-\u2034\p{Sc}]+$/u;
 // Arabic-Indic digits and the Arabic decimal and thousands separators are Arabic numbers
 // (AN): W7 leaves them, N1 counts them as R, and W4 joins only common separators (#60).
 const ARABIC_NUMBER=/[\u0660-\u0669\u066b\u066c\u0600-\u0605\u06dd\u08e2]/u,COMMON_SEPARATOR=/^[,./:\u00a0\u060c\u202f\u2044]$/u;
 function charClass(ch){if(ARABIC_NUMBER.test(ch))return 'AN';if(STRONG.test(ch))return RTL.test(ch)?'R':'L';return DIGIT.test(ch)?'EN':null;}
 // W4 and W5 on characters: a separator between two digits, and terminators beside one,
 // are part of the number.
 function numberClasses(chars){const classes=chars.map(charClass);
  chars.forEach((ch,i)=>{if(classes[i])return;for(const c of ['EN','AN'])if(classes[i-1]===c&&classes[i+1]===c&&(c==='EN'?SEPARATOR:COMMON_SEPARATOR).test(ch))classes[i]=c;});
  for(const step of [1,-1])for(let k=0;k<chars.length;k++){const i=step===1?k:chars.length-1-k;if(!classes[i]&&TERMINATOR.test(chars[i])&&classes[i-step]==='EN')classes[i]='EN';}
  return classes;}
 function isRtl(block){for(const r of block.runs||[]){for(const ch of r.text||'')if(STRONG.test(ch))return RTL.test(ch);}return false;}
 function hasRtl(block){return (block.runs||[]).some(r=>RTL.test(r.text||''));}
 // A run cut where the class of its characters changes (classes computed over the whole
 // line, so a sign or separator next to a number in another run joins it); neutral text
 // between two pieces of one class stays with them.
 function splitByClass(run,classes){const text=run.text||'',chars=[...text];if(new Set(classes.filter(Boolean)).size<2)return [{run,cls:classes.find(Boolean)||null}];
  const at=[];let offset=0;for(const ch of chars){at.push(offset);offset+=ch.length;}at.push(offset);
  const pieces=[];let start=0,cls=null,lastEnd=0;
  classes.forEach((c,i)=>{if(!c)return;if(cls==null){cls=c;lastEnd=i+1;return;}if(c!==cls){pieces.push([start,lastEnd,cls]);if(lastEnd<i)pieces.push([lastEnd,i,null]);start=i;cls=c;}lastEnd=i+1;});pieces.push([start,chars.length,cls]);
  let x=run.x;return pieces.map(([a,b,c])=>{const piece=text.slice(at[a],at[b]),width=glyphWidth(piece,run.font);const out={...run,text:piece,x,width,pmRange:{from:run.pmRange.from+at[a],to:run.pmRange.from+at[b]}};x+=width;return {run:out,cls:c};});}
 function reorder(line,base){if(!line.runs.length)return line;const sos=base===1?'R':'L';
  const lineClasses=numberClasses(line.runs.flatMap(r=>[...(r.text||'')]));let k=0;
  const cut=line.runs.flatMap(r=>{const n=[...(r.text||'')].length,own=lineClasses.slice(k,k+n);k+=n;return splitByClass(r,own);});
  const runs=cut.map(p=>p.run),classes=cut.map(p=>p.cls);
  // W7: a number whose previous strong run is L (or the paragraph, when LTR) is L.
  let strong=sos;const typed=classes.map(c=>{if(c==='R'||c==='L'){strong=c;return c;}if(c==='EN')return strong==='L'?'L':'EN';return c==='AN'?'AN':null;});
  const asStrong=c=>c==='EN'||c==='AN'?'R':c;
  const resolved=typed.map((c,i)=>{if(c)return c;let before=sos,after=sos;for(let j=i-1;j>=0;j--)if(typed[j]){before=asStrong(typed[j]);break;}for(let j=i+1;j<typed.length;j++)if(typed[j]){after=asStrong(typed[j]);break;}return before===after?before:sos;});
  const levels=resolved.map(c=>c==='EN'||c==='AN'?2:base===1?(c==='R'?1:2):(c==='R'?1:0)),order=runs.map((_,i)=>i);
  for(let level=Math.max(...levels);level>=1;level--)for(let i=0;i<order.length;){if(levels[order[i]]<level){i++;continue;}let j=i;while(j<order.length&&levels[order[j]]>=level)j++;order.splice(i,j-i,...order.slice(i,j).reverse());i=j;}
  let x=Math.min(...runs.map(r=>r.x));const placed=Array.from({length:runs.length});
  for(const i of order){const r=runs[i];placed[i]={...r,x,dir:levels[i]%2?'rtl':base===1?'ltr':undefined};x+=r.width||0;}
  return {...line,runs:placed};}
 // Word's w:ind on a paragraph (the engine's left, right, first-line and hanging clauses):
 // the paragraph moves by the smaller of its left and first-line starts, the right indent
 // narrows it, and an obstacle carves the first line (first-line) or the lines after it
 // (hanging). A note continued from another page, and the text after a manual line break (#66), has no first line here. List paragraphs
 // keep the list's own geometry (#63).
 function paragraphIndent(block){const none={shift:0,right:0,first:0,rest:0};if(block.attrs?.context?.list)return none;const own=block.attrs?.sourceData?.paragraphProperties?.indents||{},style=block.attrs?.sourceData?.documentStyle?.indents||{};
  // The style's indents stand where the paragraph states none (#96). first-line and hanging are one property in w:ind, so the
  // paragraph's own either one replaces the style's pair.
  const firstOwn=own['first-line']!=null||own.hanging!=null,p={left:own.left??style.left,right:own.right??style.right,'first-line':firstOwn?own['first-line']:style['first-line'],hanging:firstOwn?own.hanging:style.hanging};
  if(Object.values(p).every(v=>v==null))return none;
  const px=v=>Number.isFinite(v)?v*96:0,left=px(p.left),first=block.attrs?.clipFrom!=null||block.attrs?.first===false?0:px(p['first-line'])-px(p.hanging),shift=Math.min(left,left+first);
  // A negative start or right indent runs into the margin, as Word draws it (#83).
  return {shift,right:px(p.right),first:Math.max(0,left+first-shift),rest:Math.max(0,left-shift)};}
 function indentObstacles(ind,inner){const out=[],wide=(id,yStart,yEnd,end)=>out.push({id,yStart,yEnd,intervalsForBand:()=>[{start:0,end:Math.min(end,inner-1)}]});
  if(ind.first>0)wide('first-line',0,lh,ind.first);if(ind.rest>0)wide('hanging',lh,1e9,ind.rest);return out;}
 function composeLines(blocks,w){const key=blocks.map(b=>b.id+':'+(b.attrs?.indentPx||0)+':'+(b.attrs?.clipFrom??'')).join('|')+'@'+w;if(lineCache.has(key))return lineCache.get(key);if(!blocks.length)return [];
  let result=[],at=0,prev=null;
  for(const block of blocks){if(prev&&block.attrs?.first!==false&&!block.attrs?.spacer)at+=pairGap(prev,block);if(!block.attrs?.spacer)prev=block;const ind=paragraphIndent(block),indent=Math.min((block.attrs?.indentPx||0)+ind.shift,Math.max(0,w-1)),inner=Math.max(1,w-indent-Math.min(ind.right,Math.max(0,w-indent-24)));const clean={...block,attrs:{...block.attrs,manualPageBreakBefore:false,keepWithNext:false}};
   const count=1+(block.runs||[]).reduce((n,r)=>n+r.text.length,0);
   const layout=composeLayout({...measured,blocks:[clean]},null,{...input,page:{widthPx:inner,heightPx:Math.max(lh,(count+1)*lh)},margins:{leftPx:0,rightPx:0,topPx:0,bottomPx:0},policies:{...input.policies,minSlotWidthPx:1},obstacles:indentObstacles(ind,inner)});
   let lines=[];for(const p of layout.pages)for(const f of p.frames)for(const fragment of f.fragments)for(const line of fragment.lines)lines.push({...line,blockId:fragment.blockId});
   lines=constrainLines(lines,inner,lh,glyphWidth,{first:ind.first,rest:ind.rest});
   // A line Word breaks at a soft hyphen shows a hyphen there; mid-line ones stay invisible (#89).
   lines=lines.map((line,i)=>{if(i===lines.length-1)return line;const k=line.runs.findLastIndex(r=>r.text);const run=line.runs[k];if(!run?.text.endsWith('\u00ad'))return line;const runs=[...line.runs];runs[k]={...run,text:run.text.slice(0,-1)+'-',width:(run.width||0)+glyphWidth('-',run.font)-glyphWidth('\u00ad',run.font)};return {...line,runs};});
   // Word's w:jc right and center: each line against the right edge or about the middle (#50).
   const data=block.attrs?.sourceData,align=block.attrs?.cellAlign??data?.paragraphProperties?.alignment??data?.documentStyle?.alignment;
   const bidi=hasRtl(block),base=bidi&&isRtl(block)?1:0;
   // Word's w:jc both: the spaces of every line but the block's last widen until the line meets
   // the right margin (#93). A manual break ends a block, so the line before it stays as set.
   // Right-to-left lines keep their alignment.
   const justified=(line,i)=>{if(align!=='justify'||bidi||i===lines.length-1)return line;const extra=alignShift(line,inner,false);const last=line.runs.findLastIndex(r=>r.text?.trim());const spaces=line.runs.map((r,k)=>k>last?0:((k===last?r.text.replace(/[ \u00a0]+$/,''):r.text).match(/[ \u00a0]/g)||[]).length);const total=spaces.reduce((a,b)=>a+b,0);if(!total||extra<=0)return line;const add=extra/total;let before=0;return {...line,runs:line.runs.map((r,k)=>{const moved={...r,x:r.x+add*before,wordSpacing:add,width:(r.width||0)+add*spaces[k]};before+=spaces[k];return moved;})};};
   lines.forEach((drawn,i)=>{const line=justified(bidi?reorder(drawn,base):drawn,i);const shift=align==='right'||align==='center'?alignShift(line,inner,base===1)*(align==='center'?0.5:1):0;const advance=block.attrs?.lineBox?.advance??lh;result.push({...line,y:at,height:advance,advance,ascent:block.attrs?.lineBox?.ascent,runs:line.runs.map(run=>({...run,x:run.x+indent+shift}))});at+=advance;});
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
  const weights=table.columnWidths||table.attrs?.columnWidths,maxWidth=width+Math.max(0,margins.rightPx-12),base=tableWidth(weights,width,margins.rightPx),src=table.attrs?.sourceData||{},fixed=src.layoutFixed===true&&Array.isArray(weights)&&weights.length>0;
  // A fixed layout keeps its grid: no growth, words break inside their column (#67).
  const fit=fitTable(mins,base,fixed?base:maxWidth),drawn=fixed?base:Math.max(base,fit.width);
  // When the reader's larger type would break a word Word keeps whole, and every column's longest
  // word fits the fixed width together, the columns share it by those words; else the grid holds.
  const need=mins.map(t=>t>0?t+2*fit.pad+3:0),fitsFixed=need.reduce((a,b)=>a+b,0)<=drawn+0.001;
  const columnWidths=fixed&&!fitsFixed?gridWidths(weights,columns,drawn):fitMinimums(gridWidths(weights,columns,drawn),need,drawn);
  // Word's place for the table: centred or right in the text area (#68), else in by its indent (#69);
  // never past the page edge's 12px gutter on either side.
  const lo=-Math.max(0,margins.leftPx-12),hi=Math.max(lo,width+Math.max(0,margins.rightPx-12)-drawn);
  const want=src.tableAlignment==='center'?(width-drawn)/2:src.tableAlignment==='right'?width-drawn:Number.isFinite(src.indentIn)?src.indentIn*96:0;
  const offsetX=Math.min(hi,Math.max(src.tableAlignment?0:lo,want));
  const colTops=[0];for(const w of columnWidths)colTops.push(colTops.at(-1)+w);
  const rowHeights=rows.map(()=>0);
  for(const c of cells){c.x=colTops[c.columnIndex];c.width=colTops[c.columnIndex+c.colspan]-c.x;c.paddingX=Math.min(fit.pad,Math.max(0,(c.width-1)/4));c.innerWidth=Math.max(1,c.width-2*c.paddingX-1);// The engine writes a cell's alignment as its column's GFM marker; when present it is the
  // paragraph's alignment, applied once by composeLines (#81).
  const align=c.sourceData?.align||c.align;c.lines=composeLines(align?c.blocks.map(b=>({...b,attrs:{...b.attrs,cellAlign:align}})):c.blocks,c.innerWidth);if(c.lines.some(l=>l.runs.some(r=>r.x+r.width>c.innerWidth+0.01)))warn('table-column-too-narrow',`Cell ${c.id} is narrower than a single rendered character. Its text remains visible without clipping, but may extend beyond the cell; use wider paper or fewer columns.`,table.id);const paras=c.blocks.filter(b=>!b.attrs?.spacer&&b.type!=='table'),before=sidePx(paras[0]?.attrs?.spacing,'before'),after=sidePx(paras.at(-1)?.attrs?.spacing,'after');if(before)c.lines=c.lines.map(l=>({...l,y:l.y+before}));const last=c.lines.at(-1);c.naturalHeight=last?last.y+advance(last)+after:lh;if(c.rowspan===1)rowHeights[c.rowIndex]=Math.max(rowHeights[c.rowIndex],c.naturalHeight);}
  for(const c of cells.filter(c=>c.rowspan>1)){const current=rowHeights.slice(c.rowIndex,c.rowIndex+c.rowspan).reduce((a,b)=>a+b,0);if(current<c.naturalHeight)rowHeights[c.rowIndex+c.rowspan-1]+=c.naturalHeight-current;}
  const rowTops=[0];for(const h of rowHeights)rowTops.push(rowTops.at(-1)+h);
  for(const c of cells){c.y=rowTops[c.rowIndex];c.height=rowTops[c.rowIndex+c.rowspan]-c.y;}
  let headerCount=0;while(headerCount<rows.length&&(rows[headerCount].header||(rows[headerCount].cells.length&&rows[headerCount].cells.every(c=>c.header))))headerCount++;
  // A header/body-crossing rowspan cannot be repeated independently.
  if(cells.some(c=>c.rowIndex<headerCount&&c.rowIndex+c.rowspan>headerCount)){warn('header-rowspan-crosses-body','Header repetition is disabled because a header cell spans into the table body.',table.id);headerCount=0;}
  const headerHeight=rowTops[headerCount];return {cells,rowHeights,rowTops,columnWidths,width:drawn,offsetX,total:rowTops.at(-1),headerHeight,headerCount,cantSplit:rows.map(r=>!!r.cantSplit)};
 }
 // A table's grid is measured on the width of the section it falls in.
 const grids={cache:new Map(),get(id){const b=tableBlocks.get(id);if(!b)return undefined;const key=id+'@'+width;if(!this.cache.has(key))this.cache.set(key,grid(b));return this.cache.get(key);}};const tableBlocks=new Map(snapshot.blocks.filter(b=>b.type==='table').map(b=>[b.id,b]));
 notes=createFootnoteAllocator({snapshot,composeLines,width,height,lineHeight:lh,warn});newPage();
 function emitTableSlice(table,g,start,end,repeated=false){if(end<=start)return;const fragment={tableId:table.id,pageIndex:page.index,frameIndex:0,x:colX+(g.offsetX||0),y,width:g.width||width,height:end-start,columnWidths:g.columnWidths,rowStart:g.rowTops.findIndex((v,i)=>v<=start&&g.rowTops[i+1]>start),repeated,rows:g.rowHeights.flatMap((h,i)=>{const top=Math.max(g.rowTops[i],start),bottom=Math.min(g.rowTops[i+1],end);return bottom>top?[{rowIndex:i,y:top-start,height:bottom-top,header:i<g.headerCount,repeated}]:[]}),cells:[]};
  for(const c of g.cells){const top=Math.max(c.y,start),bottom=Math.min(c.y+c.height,end);if(bottom<=top)continue;const lines=c.lines.filter(l=>c.y+l.y>=start-0.001&&c.y+l.y<end-0.001).map(l=>({...l,y:c.y+l.y-top,runs:l.runs.map(r=>({...r,x:r.x+c.paddingX}))}));
   const cell={cellId:c.id,sourceCellIds:c.sourceCellIds,rowIndex:Math.max(c.rowIndex,fragment.rowStart),originalRowIndex:c.rowIndex,columnIndex:c.columnIndex,colspan:c.colspan,rowspan:fragment.rows.filter(r=>r.rowIndex>=c.rowIndex&&r.rowIndex<c.rowIndex+c.rowspan).length,originalRowspan:c.rowspan,pmRange:c.pmRange,x:c.x,y:top-start,width:c.width,height:bottom-top,lines,header:c.header,repeated,continuedBefore:top>c.y,continuedAfter:bottom<c.y+c.height,paddingX:c.paddingX};fragment.cells.push(cell);
   const byBlock=new Map();for(const l of lines){if(!byBlock.has(l.blockId))byBlock.set(l.blockId,[]);byBlock.get(l.blockId).push({...l,y:y+cell.y+l.y,runs:l.runs.map(r=>({...r,x:r.x+cell.x+colX+(g.offsetX||0)}))});}for(const [id,ls] of byBlock)addFragment(id,ls,{tableCell:true,tableId:table.id,cellId:c.id,repeated,repeatedHeader:repeated});
  }const previous=tableFragments.at(-1);if(previous&&previous.tableId===fragment.tableId&&previous.pageIndex===fragment.pageIndex&&Math.abs(previous.y+previous.height-fragment.y)<0.001){const offset=previous.height;previous.cells.push(...fragment.cells.map(c=>({...c,y:c.y+offset})));previous.rows.push(...fragment.rows.map(r=>({...r,y:r.y+offset})));previous.height+=fragment.height;previous.repeated=previous.repeated&&fragment.repeated;}else tableFragments.push(fragment);y+=fragment.height;
 }
 // Keep-with-next chains and keep-lines paragraphs (#62, #75-#77). The group runs from a paragraph
 // through every keep-with-next one after it, to the paragraph that ends the chain: its first
 // lines (all of them when it keeps its lines) or a table's first row. A paragraph's manual
 // breaks made it several blocks; they count together. When the group fits a page but not what
 // is left of this one, with the note band its own lines reserve, the page breaks before it.
 function paragraphAt(k){const b=snapshot.blocks[k];if(!b||b.type==='table'||b.attrs?.spacer)return null;const lines=[];let j=k;do{lines.push(...composeLines([snapshot.blocks[j]],width));j++;}while(b.attrs?.paragraph!=null&&snapshot.blocks[j]?.attrs?.paragraph===b.attrs.paragraph&&!snapshot.blocks[j].attrs?.spacer);return{block:b,lines,end:j};}
 // The table's first rows that must stay together: up to the first row foot no cell spans past (#119).
 function firstRowGroup(g){for(let k=1;k<g.rowTops.length;k++)if(!g.cells.some(c=>c.rowIndex<k&&c.rowIndex+(c.rowspan||1)>k))return g.rowTops[k];return g.total;}
 function keepTogether(k){
  const chainsOn=b=>!!(b.attrs?.keepWithNext&&input.policies.keepWithNextEnabled);
  let p=paragraphAt(k);if(!p)return;const first=p.block;if(!chainsOn(first)&&!first.attrs?.keepLines)return;
  const items=[];let gap=0;
  while(p){const chained=chainsOn(p.block);items.push({gap,lines:chained||p.block.attrs?.keepLines?p.lines:p.lines.slice(0,Math.max(1,input.policies.orphanLinesMin||1))});
   if(!chained)break;let n=p.end;while(snapshot.blocks[n]?.attrs?.spacer)n++;
   const next=snapshot.blocks[n];if(!next)break;
   if(next.type==='table'){const g=grids.get(next.id),row=g?firstRowGroup(g):0;items.push({gap:sidePx(p.block.attrs?.spacing,'after'),height:row,lines:(g?.cells||[]).flatMap(c=>c.lines.filter(l=>c.y+l.y<row-0.001))});break;}
   const prev=p.block;p=paragraphAt(n);if(p)gap=pairGap(prev,p.block);}
  if(items.length===1&&!first.attrs?.keepLines)return;
  const need=items.reduce((sum,item)=>sum+item.gap+(item.height??item.lines.reduce((h,l)=>h+advance(l),0)),0);
  if(need>height+0.001)return;
  const checkpoint=notes.checkpoint();let at=y,fits=true;
  // A table's first row is tried whole, with the notes its cells reference (#79).
  for(const item of items){at+=item.gap;if(item.height==null){for(const line of item.lines){if(!notes.accept([line],at+advance(line),at)){fits=false;break;}at+=advance(line);}}else{if(!notes.accept(item.lines,at+item.height,at))fits=false;at+=item.height;}if(!fits)break;}
  notes.restore(checkpoint);if(!fits)newPage();}
 for(let bi=0;bi<snapshot.blocks.length;bi++){const block=snapshot.blocks[bi];for(const section of block.attrs?.sectionStarts||[])startSection(section);
  // Spacers take no room (#102): the space between paragraphs is set where the next one starts, and
  // a space that does not fit is cut at the foot of the page, never leading the next (#58).
  if(block.attrs?.spacer)continue;
  ensurePage();if(block.attrs?.manualPageBreakBefore&&y>0){const previous=page.frames[0].fragments.at(-1);if(previous)previous.breakReason='manual_page_break';newPage();}
  if(block.type!=='table'&&block.attrs?.first!==false){const gap=y===0?(topKeeps?sidePx(block.attrs?.spacing,'before'):0):pairGap(prevPara,block);if(y>0&&y+gap>=notes.bodyLimit-0.001)newPage();else y+=gap;}
  else if(block.type==='table'&&y>0&&prevPara){const gap=sidePx(prevPara.attrs?.spacing,'after');if(y+gap>=notes.bodyLimit-0.001)newPage();else y+=gap;}
  if(block.type!=='table'&&block.attrs?.first!==false&&y>0)keepTogether(bi);
  if(block.type!=='table'){const lines=composeLines([block],width);let cursor=0,fragmentIndex=0;
   while(cursor<lines.length){let fit=0,room=notes.bodyLimit-y,used=0;while(cursor+fit<lines.length&&used+advance(lines[cursor+fit])<=room+0.001)used+=advance(lines[cursor+fit++]);
    // A line taller than the page takes a page of its own (word-metrics, `overtall`).
    const forced=!fit&&y===0;if(forced)fit=1;if(!fit){newPage();continue;}const remaining=lines.length-cursor;const orphan=input.policies.orphanLinesMin||1,widow=input.policies.widowLinesMin||1;if(remaining>fit){if(fit<orphan&&y>0){newPage();continue;}if(remaining-fit<widow&&fit-(widow-(remaining-fit))>=orphan)fit-=widow-(remaining-fit);}
    const top=k=>{let at=y;for(let i=0;i<k;i++)at+=advance(lines[cursor+i]);return at;};
    const checkpoint=notes.checkpoint();let accepted=0;while(accepted<Math.min(fit,remaining)&&notes.accept([lines[cursor+accepted]],top(accepted+1),top(accepted)))accepted++;
    if(!accepted&&forced)accepted=1;
    if(!accepted){notes.restore(checkpoint);newPage();continue;}
    if(accepted<remaining&&accepted<orphan&&y>0){notes.restore(checkpoint);newPage();continue;}
    if(remaining>accepted&&remaining-accepted<widow&&accepted-(widow-(remaining-accepted))>=orphan){const reduced=accepted-(widow-(remaining-accepted));notes.restore(checkpoint);accepted=0;while(accepted<reduced&&notes.accept([lines[cursor+accepted]],top(accepted+1),top(accepted)))accepted++;}
    const chunk=lines.slice(cursor,cursor+accepted).map((l,i)=>({...l,y:top(i),runs:colX?l.runs.map(r=>({...r,x:r.x+colX})):l.runs}));addFragment(block.id,chunk,{fragmentIndex:fragmentIndex++,...(colX?{offsetX:colX}:{}),...(cursor+accepted<lines.length?{breakReason:'frame_overflow'}:{})});y=top(chunk.length);cursor+=chunk.length;if(cursor<lines.length)newPage();}
   prevPara=block;
   continue;}
  prevPara=null;const g=grids.get(block.id);if(!g.total)continue;
  if(y>0&&g.headerCount>0&&g.headerCount<g.rowHeights.length){const initialGroup=g.rowTops[g.headerCount+1];if(initialGroup<=height&&initialGroup>notes.bodyLimit-y)newPage();}
  let start=0;const repeat=g.headerHeight>0&&g.headerHeight<=height/4&&height-g.headerHeight>=lh&&block.repeatHeader!==false&&block.attrs?.repeatHeader!==false;
  if(g.headerHeight>0&&!repeat&&block.repeatHeader!==false&&block.attrs?.repeatHeader!==false)warn('header-too-tall','Header repetition is disabled because the header occupies more than one quarter of the page.',block.id);
  // A cell line belongs to the slice that holds its top, so a cut never loses or doubles one (#119).
  const sliceLines=(from,to)=>g.cells.flatMap(c=>c.lines.filter(l=>c.y+l.y>=from-0.001&&c.y+l.y<to-0.001));
  // The places a slice may end: the foot of any cell line, and every row's foot. A clean stop
  // crosses no line of another cell; a cut takes one when it can.
  const stops=[...new Set([...g.rowTops.slice(1),...g.cells.flatMap(c=>c.lines.map(l=>c.y+l.y+advance(l)))].map(v=>Math.round(v*1000)/1000))].sort((a,b)=>a-b);
  const crossed=s=>g.cells.some(c=>c.lines.some(l=>{const t=c.y+l.y;return t<s-0.001&&t+advance(l)>s+0.001;}));
  const clean=stops.filter(s=>!crossed(s));
  const after=v=>clean.find(s=>s>v+0.001)??g.total,afterAny=v=>stops.find(s=>s>v+0.001)??g.total;
  let repeatedHeight=0;
  function nextTablePage(){newPage();repeatedHeight=0;if(repeat&&start>=g.headerHeight){emitTableSlice(block,g,0,g.headerHeight,true);repeatedHeight=g.headerHeight;}}
  while(start<g.total-0.001){
   // Prefer whole rows, but probe every source line because a reference within
   // a tall row may introduce a new reserved note band midway through it.
   const checkpoint=notes.checkpoint();let end=start,used=0;
   while(end<g.total-0.001){const next=after(end),step=next-end;if(!notes.accept(sliceLines(end,next),y+used+step,Math.max(0,y+used-repeatedHeight)))break;end=next;used+=step;}
   if(end<=start+0.001){
    // No clean stop fits: cut through a line of another cell, which then starts the next page.
    // At a page's top the table always moves on, even when that line is taller than the page.
    const fine=afterAny(start),fits=fine<after(start)-0.001&&notes.accept(sliceLines(start,fine),y+fine-start,Math.max(0,y-repeatedHeight));
    if(fits||y<=repeatedHeight+0.001){if(!fits)notes.accept(sliceLines(start,fine),y+fine-start,Math.max(0,y-repeatedHeight));end=fine;}
    else{notes.restore(checkpoint);nextTablePage();continue;}
   }
   const boundaries=g.rowTops.filter(v=>v>start+0.001&&v<=end+0.001);
   const nextBoundary=g.rowTops.find(v=>v>start+0.001),rowRemainder=nextBoundary-start;
   // A row splits at a line, as Word's rows do (#70); a cut inside the header rows falls back to
   // their last whole row.
   let selected=boundaries.length&&end<g.headerHeight-0.001?boundaries.at(-1):end;
   // A row splits across pages, as Word's rows do (#70), unless w:cantSplit keeps it on one page
   // (#71): then the cut falls back to the last whole row, or the row moves whole to the next
   // page when it fits there. A repeated header row also moves whole.
   const cut=g.rowTops.findIndex(v=>v>selected+0.001)-1,kept=cut>=0&&g.cantSplit?.[cut]&&g.rowTops[cut]<selected-0.001&&g.rowHeights[cut]<=height-repeatedHeight;
   if(kept&&boundaries.length)selected=boundaries.at(-1);
   if(!boundaries.length&&y>repeatedHeight+0.001&&(kept||start<g.headerHeight-0.001)&&rowRemainder<=height){
    notes.restore(checkpoint);nextTablePage();continue;
   }
   if(selected<end-0.001){notes.restore(checkpoint);let pos=start,offset=0;while(pos<selected-0.001){const next=Math.min(after(pos),selected),step=next-pos;if(!notes.accept(sliceLines(pos,next),y+offset+step,Math.max(0,y+offset-repeatedHeight)))throw new Error('Footnote row rollback lost a previously accepted line.');pos=next;offset+=step;}}
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

// Word breaks after a hyphen inside a word, never after "." or "/" (#110).
const HYPHEN=/^[-\u2010]$/;
const graphemes=text=>typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(s=>s.segment):Array.from(text);

/** Upstream's word-boundary repair may exceed the slot for long unbroken
 * words, and a line can end a hair past it on a trailing space. Wrap only
 * those lines, preserving code points, marks and PM spans. Spaces hang past
 * the edge as Word lets them, a line breaks after its last space or hyphen (#110), and only a
 * word wider than the slot is cut by grapheme (b106: "(i" / "f "). */
/** `indent` ({first, rest}, px): where the block's first line and its following lines begin,
 * so a line rebuilt here keeps the paragraph's indents (#72). */
export function constrainLines(lines,w,lh,glyphWidth,indent={first:0,rest:0}){
  const at=i=>Math.max(0,Math.min(w-1,i===0?indent.first||0:indent.rest||0));
  const space=ch=>ch===' '||ch==='\t';
  // The composer leaves empty lines while it looks for room for a word wider than the
  // line, then forces it; in a block with text an empty line is only that (#67).
  if(lines.some(l=>l.runs?.length))lines=lines.filter(l=>l.runs?.length);
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
      let end=start,used=0,lastBreak=-1;const room=w-at(out.length+pieces.length);
      while(end<chars.length){const c=chars[end];if(!space(c.ch)&&end>start&&used+c.cw>room+0.01)break;used+=c.cw;end++;if(space(c.ch)||(HYPHEN.test(c.ch)&&end-1>start&&!space(chars[end-2].ch)))lastBreak=end;}
      if(end<chars.length&&lastBreak>start)end=lastBreak;
      // Kinsoku, as Word wraps East Asian text: closing punctuation never starts a line and an
      // opening bracket never ends one; the break moves back a character (#82).
      else if(end<chars.length)while(end-1>start&&(NO_LINE_START.test(chars[end].ch)||NO_LINE_END.test(chars[end-1].ch)))end--;
      pieces.push(chars.slice(start,end));start=end;
    }
    if(pieces.length<=1){out.push(line);continue;}
    for(const piece of pieces){
      const runs=[];let used=at(out.length);
      for(const c of piece){const previous=runs.at(-1);if(previous&&previous.runId===c.run.runId&&previous.pmRange.to===c.from){previous.text+=c.ch;previous.width+=c.cw;previous.pmRange.to=c.to;}else runs.push({...c.run,text:c.ch,x:used,width:c.cw,pmRange:{from:c.from,to:c.to}});used+=c.cw;}
      out.push({...line,runs,pmRange:{from:Math.min(...runs.map(r=>r.pmRange.from)),to:Math.max(...runs.map(r=>r.pmRange.to))}});
    }
  }
  return out.map((line,i)=>({...line,y:i*lh,height:lh}));
}
