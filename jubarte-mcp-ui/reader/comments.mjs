// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

import {Plugin,PluginKey} from 'prosemirror-state';
import {Decoration,DecorationSet} from 'prosemirror-view';
import {discussionId} from './jubarte.mjs';
export const reviewKey=new PluginKey('jubarteReview');
export function discussions(result){const groups=new Map();for(const c of result.critic.comments){let id=discussionId(c);if(!groups.has(id))groups.set(id,{id,index:groups.size+1,comments:[],resolved:false,anchorKind:c.anchorKind,story:c.story||'body'});let d=groups.get(id);d.comments.push(c);if(!c.replyTo){d.root=c;d.resolved=!!c.resolved;d.anchorKind=c.anchorKind}}for(const d of groups.values()){d.root??=d.comments[0];d.quote=result.critic.markdown.slice(d.root.start,d.root.end)}return [...groups.values()]}
export function sourcePositions(result){const offsets=[];const walk=n=>{if(typeof n.text==='string'){for(let i=0;i<n.text.length;i++)offsets.push(n.textOffsets?.[i]??(n.sourceRange?.start||0)+i)}else(n.children||[]).forEach(walk)};result.value.forEach(walk);let cursor=0;const map=[];result.doc.descendants((n,p)=>{if(n.isText)for(let i=0;i<n.text.length;i++)map.push({source:offsets[cursor++]??0,pos:p+i})});return map}
export function reviewPlugin(result,onSelect){const groups=discussions(result),positions=sourcePositions(result),boundaries=[];result.doc.descendants((n,pos)=>{if(n.isInline&&!n.isText&&n.attrs.data?.sourceRange)boundaries.push({source:n.attrs.data.sourceRange.end,pos:pos+n.nodeSize})});const positionAt=createPositionLookup(positions,boundaries);const decorations=[];for(const d of groups){const root=d.root;const pos=positionAt(root.end);decorations.push(Decoration.widget(pos,()=>{const b=document.createElement('button');b.type='button';b.className='comment-point'+(d.resolved?' resolved':'');b.dataset.discussion=d.id;b.textContent=String(d.index);b.title=`${root.author||'Reviewer'}: ${root.text}`;b.setAttribute('aria-label',`Open discussion ${d.index}: ${root.text}`);b.onclick=e=>{e.preventDefault();onSelect(d.id)};return b},{key:d.id,side:1}))}return new Plugin({key:reviewKey,state:{init:()=>DecorationSet.create(result.doc,decorations),apply:(tr,set)=>set.map(tr.mapping,tr.doc)},props:{decorations:s=>reviewKey.getState(s),handleDOMEvents:{click(view,event){const id=event.target.closest('[data-discussions]')?.dataset.discussions?.split('|')[0];if(id){onSelect(id);return true}return false},keydown(view,event){if(event.key!=='Enter'&&event.key!==' ')return false;const id=event.target.closest('[data-discussions]')?.dataset.discussions?.split('|')[0];if(id){event.preventDefault();onSelect(id);return true}return false}},handleClick(view,pos,event){let el=event.target.closest('[data-discussions]');let id=el?.dataset.discussions?.split('|')[0];if(id){onSelect(id);return true}return false}}})}

export function createPositionLookup(positions, boundaries = []) {
 const exact = new Map();
 const ordered = positions.map((entry, order) => {
  const source = entry.source;
  if (!exact.has(source)) exact.set(source, entry.pos);
  return {source, pos: entry.pos, order};
 }).sort((a,b) => a.source-b.source || a.order-b.order);
 let last = null;
 const preceding = ordered.map(entry => {
  if (!last || entry.order > last.order) last = entry;
  return {source: entry.source, pos: last.pos + 1};
 });
 let max = 0;
 const inline = [...boundaries].sort((a,b)=>a.source-b.source).map(entry=>({source:entry.source,pos:max=Math.max(max,entry.pos)}));
 const before = (items, source, inclusive) => {
  let lo=0, hi=items.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(items[mid].source<source||(inclusive&&items[mid].source===source))lo=mid+1;else hi=mid;}
  return items[lo-1]?.pos;
 };
 return source => exact.get(source) ?? Math.max(before(preceding,source,false) ?? positions[0]?.pos ?? 1, before(inline,source,true) ?? 0);
}
