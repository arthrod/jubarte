// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// What the card knows of a picture before its bytes arrive (#95). The engine's
// view writes each picture's w:drawing after the body as
// `<!-- image1 drawing:BASE64URL-JSON -->`; its wp:extent is the size Word
// draws it at, and wp:inline (not wp:anchor) says it sits on the line.
import {fencedCodeRanges} from './metadata.mjs';

const EMU_PER_PX=9525;
// crates/jubarte-markdown write.rs MAX_PICTURE_WIDTH, 5,943,600 EMU.
const MAX_WIDTH_PX=5943600/EMU_PER_PX;
const DEFINITION=/^ {0,3}\[(\S+)\]: <[\w.+-]+\/[\w.+-]+, \d+ KB, (\d+)x(\d+) px>[ \t]*$/gm;
const COMMENT=/^ {0,3}<!-- (\S+) drawing:([A-Za-z0-9_-]+={0,2}) -->[ \t]*$/gm;
// Types an <img> draws in every browser the card runs in; EMF and WMF are not.
const DRAWABLE=new Set(['image/png','image/jpeg','image/gif','image/webp','image/bmp','image/svg+xml']);

function decode(text){
 const b64=text.replace(/-/g,'+').replace(/_/g,'/');
 const raw=atob(b64+'='.repeat((4-b64.length%4)%4));
 return JSON.parse(new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0))));
}

/** Label → {widthPx, heightPx, inline} for every picture the view describes. */
export function pictureExtents(body){
 const code=fencedCodeRanges(body),out=new Map();
 for(const m of body.matchAll(COMMENT)){
  if(code.some(r=>m.index>=r.start&&m.index<r.end))continue;
  let xml;try{xml=decode(m[2]).xml}catch{continue}
  const ext=typeof xml==='string'&&/<wp:extent\b[^>]*>/.exec(xml)?.[0],cx=ext&&/\bcx="(\d+)"/.exec(ext),cy=ext&&/\bcy="(\d+)"/.exec(ext);
  if(!cx||!cy)continue;
  out.set(m[1],{widthPx:Number(cx[1])/EMU_PER_PX,heightPx:Number(cy[1])/EMU_PER_PX,inline:/<wp:inline\b/.test(xml)});
 }
 // A picture the engine regenerates carries no drawing comment (#122): it is an inline picture
 // at its raster's size, one pixel to a px, no wider than the writer's MAX_PICTURE_WIDTH. The
 // server's stand-in says that size.
 for(const m of body.matchAll(DEFINITION)){
  if(out.has(m[1])||code.some(r=>m.index>=r.start&&m.index<r.end))continue;
  const w=Number(m[2]),h=Number(m[3]),scale=Math.min(1,MAX_WIDTH_PX/w);
  out.set(m[1],{widthPx:w*scale,heightPx:Math.max(1/EMU_PER_PX,h*scale),inline:true});
 }
 return out;
}

/** The mime type of a stand-in such as `image/png, 412 KB, 640x480 px`, if a browser draws it. */
export function pictureMime(standIn){
 const m=/^([\w.+-]+\/[\w.+-]+), \d+ KB(?:, \d+x\d+ px)?$/.exec(standIn||'');
 return m&&DRAWABLE.has(m[1])?m[1]:null;
}
