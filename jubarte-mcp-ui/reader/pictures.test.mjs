// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// What the card knows of a picture before its bytes arrive (#95).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pictureExtents,pictureMime} from './pictures.mjs';

const drawing=(label,xml)=>`<!-- ${label} drawing:${Buffer.from(JSON.stringify({xml,wrap:true,rels:[],deps:[],slot:0})).toString('base64url')} -->`;
const inline=(cx,cy)=>`<w:drawing><wp:inline distT="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="x"/></wp:inline></w:drawing>`;
const anchor=(cx,cy)=>`<w:drawing><wp:anchor distT="0" behindDoc="0"><wp:extent cx="${cx}" cy="${cy}"/></wp:anchor></w:drawing>`;

test('an inline picture takes its extent in px (EMU / 9525)',()=>{
 const body=`One ![a][image1]\n\n[image1]: <image/png, 2 KB>\n${drawing('image1',inline(3041952,4029075))}\n`;
 const got=pictureExtents(body).get('image1');
 assert.ok(Math.abs(got.widthPx-319.37)<0.01&&Math.abs(got.heightPx-423.0)<0.01,JSON.stringify(got));
 assert.equal(got.inline,true);
});

test('a floating picture is known but not inline',()=>{
 const got=pictureExtents(drawing('image2',anchor(952500,952500))).get('image2');
 assert.deepEqual(got,{widthPx:100,heightPx:100,inline:false});
});

test('a drawing comment inside fenced code is the document\'s text',()=>{
 const body='```\n'+drawing('image1',inline(9525,9525))+'\n```\n';
 assert.equal(pictureExtents(body).size,0);
});

test('a comment that does not decode, or has no extent, is skipped',()=>{
 assert.equal(pictureExtents('<!-- image1 drawing:@@@ -->\n').size,0);
 assert.equal(pictureExtents(drawing('image1','<w:pict/>')).size,0);
});

test('the mime type comes from the stand-in; only types a browser draws are fetched',()=>{
 assert.equal(pictureMime('image/png, 412 KB'),'image/png');
 assert.equal(pictureMime('image/jpeg, 0 KB'),'image/jpeg');
 assert.equal(pictureMime('image/x-emf, 3 KB'),null);
 assert.equal(pictureMime('image/x-wmf, 3 KB'),null);
 assert.equal(pictureMime('https://example.com/a.png'),null);
});
