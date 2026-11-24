// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

import {decodeString} from 'micromark-util-decode-string';
const mdTypes={paragraph:'p',heading:'h',blockquote:'blockquote',code:'code_block',listItem:'li',table:'table',tableRow:'tr',tableCell:'td',thematicBreak:'hr',footnoteDefinition:'footnote'};
const offset=n=>n.position?.start?.offset??0;
const end=n=>n.position?.end?.offset??offset(n);
const words=s=>/[^\s]/u.test(s||'');
function textMap(raw,value,start){
 const out=[];let decoded='';
 for(let i=0;i<raw.length;){let token=raw[i],size=1;
  if(raw[i]==='\\'&&i+1<raw.length&&/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(raw[i+1])){token=raw.slice(i,i+2);size=2}
  else if(raw[i]==='&'){const m=raw.slice(i).match(/^&(?:#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]+);/);if(m){token=m[0];size=token.length}}
  const v=decodeString(token);decoded+=v;for(let k=0;k<v.length;k++)out.push(start+i);i+=size;
 }
 if(decoded===value)return out;
 // Inline-code whitespace normalization and indented/fenced blocks retain a best-effort source map.
 let cursor=0;const aligned=[];for(let i=0;i<value.length;i++){const ch=value[i];let at=raw.indexOf(ch,cursor);if(at<0)at=cursor;aligned.push(start+at);cursor=Math.min(raw.length,at+1)}return aligned;
}
const safeUrl=url=>/^(?:https?:|mailto:|#)/i.test(url||'') ? url : /^(?![a-z][a-z\d+.-]*:)[^\s]+$/i.test(url||'') ? url : '';
// Headings are named as the engine names their bookmarks, so every link
// read_view writes reaches its heading (#37). Ports of github_slug, Slugger
// and bookmark_name in crates/jubarte-markdown/src/markdown/write.rs.
const MOST_BOOKMARK=40;
export function githubSlug(text){let out='';for(const c of text.toLowerCase()){if(c===' '||c==='-')out+='-';else if(/[\p{Alphabetic}\p{L}\p{M}\p{Nd}\p{Nl}\p{Pc}]/u.test(c))out+=c}return out}
export function slugger(){const seen=new Map();return slug=>{let name=slug;while(seen.has(name)){const repeats=(seen.get(slug)??0)+1;seen.set(slug,repeats);name=`${slug}-${repeats}`}seen.set(name,0);return name}}
const wordTakes=slug=>/^\p{Alphabetic}/u.test(slug)&&[...slug].length<=MOST_BOOKMARK;
export function bookmarkName(slug,used=new Set()){
 if(wordTakes(slug))return slug;
 const named=/^\p{Alphabetic}/u.test(slug)?slug:'_'+slug;
 if([...named].length<=MOST_BOOKMARK&&!used.has(named))return named;
 for(let n=0;;n++){const suffix=n?`-${n}`:'';const name=[...named].slice(0,MOST_BOOKMARK-suffix.length).join('')+suffix;if(!used.has(name))return name}
}
// An <a id="…"></a> is a bookmark the engine wrote: a link target that draws
// nothing (#37).
const ANCHOR=/<a\s+(?:id|name)="([^"]*)"\s*>\s*<\/a>/gi;
// CommonMark reads such a line as a paragraph of inline tags: it is still a
// bookmark of its own, which the engine puts on the next paragraph (#38).
const htmlOf=n=>n.type==='html'?n.value:n.type==='paragraph'&&n.children.every(c=>c.type==='html'||(c.type==='text'&&!c.value.trim()))?n.children.map(c=>c.value).join(''):null;
const anchorIds=n=>[...(htmlOf(n)??'').matchAll(ANCHOR)].map(m=>m[1]).filter(Boolean);
const anchorOnly=n=>{const v=htmlOf(n);return v!=null&&new RegExp(ANCHOR.source,'i').test(v)&&v.replace(ANCHOR,'').replace(/<!--[\s\S]*?-->/g,'').trim()===''};
export function projectDialect(tree, critic, document){
 const markdown=critic.markdown;
 const changes=critic.changes||[],highlights=critic.highlights||[],comments=critic.comments||[];
 const warnings=[];const blocks=[];const definitions=new Map();const nameHeading=slugger();const explicitNames=new Set([...markdown.matchAll(ANCHOR)].map(m=>m[1]));const usedNames=new Set(explicitNames);let aliasSink=[];let openAnchors=0;
 const sentinelPositions=new Set(critic.sentinelPositions||[]);
 const sourceOffset=p=>critic.sourceMap?.[p]??p;
 const range=(s,e)=>({start:s,end:e,sourceStart:sourceOffset(s),sourceEnd:sourceOffset(e)});
 const changesAt=p=>changes.filter(r=>r.start<=p&&p<r.end);
 const highlightsAt=p=>highlights.filter(r=>r.start<=p&&p<r.end);
 function marksAt(p){const result={};const cs=changesAt(p);if(cs.length){result.criticChanges=cs;result[cs.at(-1).kind==='deletion'?'criticDeletion':'criticInsertion']=true}
  const hs=highlightsAt(p);if(hs.length){result.criticHighlight=true;result.criticHighlights=hs}
  const commentsHere=comments.filter(r=>r.start<r.end&&r.start<=p&&p<r.end);if(commentsHere.length){result.commentAnchor=true;result.comments=commentsHere}return result;
 }
 function leaves(value,start,raw=value,base={}){
  const map=textMap(raw,value,start);const result=[];
  for(let i=0;i<value.length;i++){if(sentinelPositions.has(map[i]))continue;const props={...base,...marksAt(map[i])};const signature=JSON.stringify(props);const last=result.at(-1);if(last?._signature===signature){last.text+=value[i];last.textOffsets.push(map[i]);}else result.push({...props,text:value[i],textOffsets:[map[i]],_signature:signature,sourceRange:range(map[i],map[i]+1)})}
  for(const node of result){delete node._signature;node.sourceRange.end=(node.textOffsets.at(-1)??node.sourceRange.start)+1;node.sourceRange.sourceEnd=sourceOffset(node.sourceRange.end)}
  return result.length?result:[{...base,text:''}];
 }
 function isMappedEscape(pos){if(markdown[pos]==='\\')return true;let n=0;while(pos>0&&markdown[--pos]==='\\')n++;return n%2===1}
 function shorthand(node,base){
  const raw=markdown.slice(offset(node),end(node));const value=node.value;const result=[];const map=textMap(raw,value,offset(node));let cursor=0;
  for(let i=0;i<value.length;i++){
   const delim=value[i];if(delim!=='^'&&delim!=='~')continue;
   if(i>0&&/[\p{L}\p{N}_]/u.test(value[i-1]))continue;
   if(isMappedEscape(map[i]))continue;
   if(value[i+1]===delim)continue;
   let j=i+1;while(j<value.length&&value[j]!==delim&&value[j]!=='\n')j++;
   if(j>=value.length||value[j]!==delim||j===i+1||/\s/.test(value.slice(i+1,j)))continue;
   if(j+1<value.length&&/[\p{L}\p{N}_]/u.test(value[j+1]))continue;
   if(isMappedEscape(map[j]))continue;
   if(i>cursor)result.push(...leaves(value.slice(cursor,i),map[cursor],markdown.slice(map[cursor],map[i]),base));
   result.push(...leaves(value.slice(i+1,j),map[i+1],markdown.slice(map[i+1],map[j]),{...base,[delim==='^'?'superscript':'subscript']:true}));cursor=j+1;i=j;
  }
  if(!cursor)return leaves(value,offset(node),raw,base);
  if(cursor<value.length)result.push(...leaves(value.slice(cursor),map[cursor],markdown.slice(map[cursor],end(node)),base));return result;
 }
 function inline(nodes,base={}){
  const out=[];const active={...base};const stacks={};
  for(const n of nodes||[]){
   if(n.type==='text'){out.push(...shorthand(n,active));continue}
   if(['strong','emphasis','delete'].includes(n.type)){out.push(...inline(n.children,{...active,[{strong:'bold',emphasis:'italic',delete:'strikethrough'}[n.type]]:true}));continue}
   if(n.type==='inlineCode'){const raw=markdown.slice(offset(n),end(n)),run=raw.match(/^`+/)?.[0].length||0;out.push(...leaves(n.value,offset(n)+run,raw.slice(run,raw.length-run),{...active,code:true}));continue}
   if(n.type==='break'){out.push({...active,text:'\n',...marksAt(offset(n))});continue}
   if(n.type==='html'){
    if(commentOnly(n))continue;
    if(anchorOnly(n)){aliasSink.push(...anchorIds(n));continue}
    {const open=n.value.trim().match(/^<a\s+(?:id|name)="([^"]*)"\s*>$/i);if(open){if(open[1])aliasSink.push(open[1]);openAnchors++;continue}if(openAnchors&&/^<\/a\s*>$/i.test(n.value.trim())){openAnchors--;continue}}
    const raw=n.value.trim();const m=raw.match(/^<(\/)?(u|sup|sub|b|i|s|code|mark)(?:\s+class="hl-([A-Za-z]+)")?\s*>$/i);if(m&&!(m[3]&&m[2].toLowerCase()!=='mark')){const tag=m[2].toLowerCase(),key={u:'underline',sup:'superscript',sub:'subscript',b:'bold',i:'italic',s:'strikethrough',code:'code',mark:'highlight'}[tag];if(m[1]){active[key]=stacks[key]?.pop()||false}else{(stacks[key]??=[]).push(active[key]||false);active[key]=tag==='mark'?(m[3]||'yellow').toLowerCase():true}continue}
    if(/^<br\s*\/?\s*>$/i.test(raw)){out.push({...active,text:'\n',...marksAt(offset(n))});continue}
    out.push(...leaves(n.value,offset(n),n.value,{...active,htmlLiteral:true}));continue;
   }
   if(n.type==='link'||n.type==='linkReference'){
    const def=n.type==='linkReference'?definitions.get(n.identifier):n;out.push({type:'a',url:safeUrl(def?.url),title:def?.title,sourceRange:range(offset(n),end(n)),children:inline(n.children,active)});continue;
   }
   if(n.type==='image'||n.type==='imageReference'){
    const def=n.type==='imageReference'?definitions.get(n.identifier):n;out.push({type:'image_alt',url:def?.url||'',alt:n.alt||'',sourceRange:range(offset(n),end(n)),...marksAt(offset(n)),children:leaves(n.alt||'[image]',offset(n),markdown.slice(offset(n),end(n)),active)});continue;
   }
   if(n.type==='footnoteReference'){out.push({type:'footnote_ref',identifier:n.identifier,...marksAt(offset(n)),sourceRange:range(offset(n),end(n)),children:[{text:n.label||n.identifier}]});continue}
   if(n.children)out.push(...inline(n.children,active));else if(n.value)out.push(...leaves(n.value,offset(n),markdown.slice(offset(n),end(n)),active));
  }
  return out.length?out:[{text:''}];
 }
 // An HTML comment the directive pass left (a picture's drawing, a text box's
 // bounds) writes no text in the engine, so it draws nothing here (b106).
 const commentOnly=n=>n.type==='html'&&n.value.replace(/<!--[\s\S]*?-->/g,'').trim()==='';
 // A block's children without definitions, comments and <a id> bookmarks; a
 // bookmark on a line of its own becomes the next block's alias (#37).
function siblings(children){const kept=[];let carry=[];for(const x of children){if(x.type==='definition'||commentOnly(x))continue;if(anchorOnly(x)){carry.push(...anchorIds(x));continue}if(carry.length){x.jubarteAliases=[...(x.jubarteAliases||[]),...carry];carry=[]}kept.push(x)}if(carry.length&&kept.length){const last=kept.at(-1);last.jubarteAliases=[...(last.jubarteAliases||[]),...carry]}return kept}
 function make(n,extra={}){
  const type=n.type==='heading'?'h'+n.depth:n.type==='list'?(n.ordered?'ol':'ul'):mdTypes[n.type]||'p';
  const result={type,sourceRange:range(offset(n),end(n)),...extra,children:[]};const outerSink=aliasSink;aliasSink=[...(n.jubarteAliases||[])];
  if(['paragraph','heading','tableCell'].includes(n.type))result.children=inline(n.children);
  else if(n.type==='code'){
   result.lang=n.lang||'';const raw=markdown.slice(offset(n),end(n));const firstLine=raw.indexOf('\n');const start=/^ {0,3}(`{3,}|~{3,})/.test(raw)?offset(n)+firstLine+1:offset(n);result.children=leaves(n.value,start,markdown.slice(start,end(n)),{codeBlock:true});
  }else if(n.type==='thematicBreak')result.children=[{text:''}];
  else if(n.type==='html'){result.type='p';result.children=inline([n]);}
  else result.children=siblings(n.children||[]).map(x=>make(x));
  if(n.type==='list')result.start=n.start||1;
  if(n.type==='listItem')result.checked=n.checked;
  if(n.type==='footnoteDefinition'){result.identifier=n.identifier;result.story='footnotes'}
  if(n.type==='table'){result.align=n.align;result.headerRowRepeats=true;result.wordStyle='TableGrid';result.children.forEach((row,ri)=>row.children.forEach((cell,ci)=>{cell.type=ri===0?'th':'td';cell.align=n.align?.[ci]||null}));}
  if(n.type==='heading'){const slug=githubSlug(shown(result));if(slug){const name=bookmarkName(nameHeading(slug),usedNames);if(!explicitNames.has(name)){usedNames.add(name);result.anchor=name}}result.wordStyle='Heading'+n.depth}
  if(n.type==='paragraph')result.wordStyle='Normal';if(n.type==='blockquote')result.wordStyle='Quote';if(n.type==='listItem')result.wordStyle='ListParagraph';if(n.type==='code')result.wordStyle='SourceCode';
  if(aliasSink.length)result.aliases=aliasSink;aliasSink=outerSink;
  if(!result.children.length)result.children=[{text:''}];
  if(['p','h1','h2','h3','h4','h5','h6','code_block','li','td','th','table','tr','footnote'].includes(result.type))blocks.push(result);
  return result;
 }
 for(const n of tree.children)if(n.type==='definition')definitions.set(n.identifier,n);
 let value=siblings(tree.children).map(n=>make(n));
 function visibleLeaves(n){if(typeof n.text==='string')return words(n.text)?[n]:[];return(n.children||[]).flatMap(visibleLeaves)}
 function structural(block){const ls=visibleLeaves(block);if(!ls.length)return null;let candidates=ls[0].criticChanges||[];candidates=candidates.filter(c=>ls.every(l=>(l.criticChanges||[]).some(x=>x.id===c.id)));return candidates.length?{kind:candidates.at(-1).kind,changeIds:[candidates.at(-1).id],wholeBlock:true,includesParagraphMark:!['td','th'].includes(block.type)}:null}
 for(const block of blocks)if(!['table','tr'].includes(block.type)){const s=structural(block);if(s)block.structuralChange=s;}
 for(const table of blocks.filter(b=>b.type==='table'))for(const row of table.children){const cells=row.children.map(c=>c.structuralChange);if(cells.length&&cells.every(Boolean)&&cells.every(c=>c.kind===cells[0].kind))row.structuralChange={kind:cells[0].kind,wholeRow:true,changeIds:cells.flatMap(c=>c.changeIds)}}
 const paragraphMarks=[];for(const c of changes){const segment=markdown.slice(c.start,c.end);for(const m of segment.matchAll(/\n[ \t]*\n/g))paragraphMarks.push({kind:c.kind,changeId:c.id,start:c.start+m.index,end:c.start+m.index+m[0].length,story:c.story||'body'})}
 const paragraphs=blocks.filter(b=>['p','h1','h2','h3','h4','h5','h6','code_block'].includes(b.type)).sort((a,b)=>a.sourceRange.start-b.sourceRange.start);
 for(const mark of paragraphMarks){const before=[...paragraphs].reverse().find(b=>b.sourceRange.start<=mark.start);if(before)(before.paragraphMarks??=[]).push(mark)}
 if(paragraphs.at(-1)?.structuralChange){const last=paragraphs.at(-1),previous=paragraphs.at(-2);last.structuralChange.lastParagraphMarkProtected=true;if(previous){last.structuralChange.markTransferredTo=previous.sourceRange.sourceStart;(previous.paragraphMarks??=[]).push({...last.structuralChange,transferredFrom:last.sourceRange.sourceStart})}}
 // Agent directives bind to the next appropriate source block. All clauses remain in metadata.
 // An empty paragraph's page break starts the next paragraph on a new page (#48).
 let carriedBreak=false;
 for(const d of document.directives||[]){
  if(d.type==='paragraph'&&d.empty){if((d.properties||d.parsed||d).pageBreak)carriedBreak=true;continue;}
  const de=d.range?.end?.offset??d.range?.end??d.end??0;const dt=d.type||d.kind;const eligible=blocks.filter(b=>b.sourceRange.sourceStart>=de&&(dt==='table'?b.type==='table':dt==='page'?true:!['tr','td','th','table','li','footnote'].includes(b.type))).sort((a,b)=>a.sourceRange.sourceStart-b.sourceRange.sourceStart);
  const target=eligible[0];if(target&&carriedBreak&&d.type==='paragraph'){target.pageBreakBefore=true;carriedBreak=false}
  // A paragraph directive with no text of its own binds to the next block, whose own directive then replaces it: keep its break.
  if(target&&d.type==='paragraph'&&target.agentId&&target.agentId!==d.id&&target.paragraphProperties?.pageBreak)target.pageBreakBefore=true;
  if(target){(target.directives??=[]).push(d);if(d.id)target.agentId=d.id;if(d.type==='paragraph'||d.type==='table'){const p=d.properties||d.parsed||d;target.paragraphProperties=p;if(d.style)target.wordStyle=d.style;}}
 }
 // Reconnect explicitly continued comment ranges to their story-qualified thread.
 for(const block of blocks){const refs=block.paragraphProperties?.openComments||[];const inherited=refs.map(ref=>comments.find(c=>(c.threadReference||c.referenceId)===ref.canonicalId)).filter(Boolean);if(inherited.length){const hasHighlight=n=>!!n.criticHighlight||(n.children||[]).some(hasHighlight);const explicit=hasHighlight(block);const visit=n=>{if(typeof n.text==='string'){if(explicit&&!n.criticHighlight)return;n.commentAnchor=true;n.comments=[...new Map([...(n.comments||[]),...inherited].map(c=>[c.referenceId||c.id,c])).values()]}else(n.children||[]).forEach(visit)};visit(block)}}
 // Table identity and merge intent remain on nodes; CSS honors non-overlapping merges.
 for(const table of blocks.filter(b=>b.type==='table')){
  const d=table.directives?.find(d=>d.type==='table');if(!d)continue;
  // The engine writes `header row repeats` only for a first row with w:tblHeader (#45).
  table.headerRowRepeats=(d.properties?.headerRowRepeats??d.parsed?.headerRowRepeats??d.headerRowRepeats)===true;
  // GFM makes every table's first row a header; Word's is one only when it repeats (#78).
  if(!table.headerRowRepeats)for(const cell of table.children?.[0]?.children||[])if(cell.type==='th')cell.type='td';
  // Where Word puts the table and whether it autofits: \`t0 center\`/\`t0 right\` (w:jc), \`indent X\`
  // (w:tblInd), \`layout fixed\` (w:tblLayout) (#67, #68, #69).
  if(d.alignment==='center'||d.alignment==='right')table.tableAlignment=d.alignment;
  for(const raw of d.unknown||d.properties?.unknown||[]){const c=String(raw).trim();if(c==='layout fixed')table.layoutFixed=true;const m=/^indent (-?\d+(?:\.\d+)?)in$/.exec(c);if(m)table.indentIn=Number(m[1]);}if(d.columnWidthsIn&&d.columnWidthsIn.length===Math.max(0,...table.children.map(r=>r.children.length)))table.columnWidthsIn=d.columnWidthsIn;
  // `merged tN.rowR.cellC` counts Word cells, as write.rs plan_table does: the empty
  // Markdown cells after a span are its covered columns, and a vertical merge's
  // continuation (a Word cell of its own) covers the same grid column below.
  if(d.merges?.length){const byCell=new Map(d.merges.map(m=>[m.row+'.'+m.cell,m])),used=new Set(),below=new Map();
   table.children.forEach((row,r)=>{let cell=0,spanned=0;row.children.forEach((node,at)=>{const empty=!(node.children||[]).some(function full(n){return typeof n.text==='string'?n.text.trim()!=='':(n.children||[]).some(full)});const v=below.get(at);
    if(v&&v.until>=r){node.mergedCovered=true;spanned=v.across-1;cell++;return}
    if(spanned>0&&empty){node.mergedCovered=true;node.spanCovered=true;spanned--;return}
    const merge=byCell.get(r+'.'+cell);spanned=0;
    if(merge){used.add(merge);node.colSpan=merge.across;node.rowSpan=merge.down;node.merge=merge;spanned=merge.across-1;if(merge.down>1)below.set(at,{until:r+merge.down-1,across:merge.across})}
    cell++})});
   for(const merge of d.merges)if(!used.has(merge))warnings.push({code:'merge-outside-table',message:'A merge directive points outside the parsed table.',merge})}
  // Paragraph ids count Word cells too: a span's covered columns hold none.
  if(d.cells?.paragraphRange){let id=d.cells.paragraphRange.start;for(const row of table.children)for(const cell of row.children.filter(c=>!c.spanCovered)){if(id<=d.cells.paragraphRange.end){cell.agentId='p'+id++;cell.paragraphIds=[cell.agentId]}}}
  for(const rowGroup of d.cells?.rows||[]){const row=table.children[rowGroup.row];if(!row)continue;rowGroup.paragraphRanges.forEach((r,i)=>{const cell=row.children.filter(c=>!c.spanCovered)[i];if(cell)cell.paragraphIds=Array.from({length:r.end-r.start+1},(_,n)=>'p'+(r.start+n))})}
  if(d.cellSizes?.length)for(const row of table.children)for(const cell of row.children){const ids=(cell.paragraphIds||[]).map(id=>Number(id.slice(1)));const size=d.cellSizes.find(z=>ids.some(n=>n>=z.from&&n<=z.to));if(size)cell.fontSizePt=size.points}
 }
 // Apply the browser-expressible portion of the style legend; preserve everything else as metadata.
 const applyStyle=node=>{if(node.type){const key=/^h[1-6]$/.test(node.type)?'#'.repeat(Number(node.type[1])):node.wordStyle||'Normal';node.documentStyle=document.metadata.styles?.[key]||document.metadata.styles?.[node.wordStyle]||(/^(h[1-6]|code_block)$/.test(node.type)?null:document.metadata.styles?.Normal)||null;}for(const child of node.children||[])if(child.type)applyStyle(child)};value.forEach(applyStyle);
 // Empty ID ranges denote real empty paragraphs. Keep their identities instead of attaching to the next text.
 for(const d of document.directives||[])if(d.type==='paragraph'&&d.empty){for(let i=d.index;i<=d.endIndex;i++){const empty={type:'p',agentId:(d.story==='body'?'':d.story+'.')+'p'+i,empty:true,directives:[d],paragraphProperties:d.properties,sourceRange:{sourceStart:d.start,sourceEnd:d.end,start:d.start,end:d.end},children:[{text:''}]};let at=value.findIndex(n=>n.sourceRange?.sourceStart>d.start);if(at<0)at=value.length;value.splice(at,0,empty)}}
 // Carry comment records on the closest block, including zero-width point comments.
 for(const c of comments){let block=paragraphs.find(b=>b.sourceRange.start<=c.end&&c.end<=b.sourceRange.end)||paragraphs.find(b=>b.sourceRange.start>=c.end)||paragraphs.at(-1);if(block)(block.commentRecords??=[]).push(c)}
 // Changes of footnote references propagate to their definition metadata.
 const refs=[];function findRefs(ns){for(const n of ns){if(n.type==='footnote_ref')refs.push(n);if(n.children)findRefs(n.children)}}findRefs(value);
 for(const foot of blocks.filter(b=>b.type==='footnote')){const ref=refs.find(r=>r.identifier===foot.identifier&&(r.criticChanges||[]).length);if(ref)foot.referenceChange={changeIds:ref.criticChanges.map(c=>c.id),kind:ref.criticChanges.at(-1).kind,wholeFootnote:true};}
 return {value:value.length?value:[{type:'p',children:[{text:''}]}],paragraphMarks,warnings,blocks};
}
// The text the engine names a heading by: deleted text and note marks are no part of it.
function shown(node){if(typeof node.text==='string')return node.criticDeletion?'':node.text;if(node.type==='footnote_ref')return '';return(node.children||[]).map(shown).join('')}
export function plain(node){return typeof node.text==='string'?node.text:(node.children||[]).map(plain).join('')}
