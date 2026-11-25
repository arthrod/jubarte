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

test('the extent reads cy before cx as well (#122)',()=>{
 const xml='<w:drawing><wp:inline><wp:extent cy="1905000" cx="2857500"/></wp:inline></w:drawing>';
 assert.deepEqual(pictureExtents(drawing('image1',xml)).get('image1'),{widthPx:300,heightPx:200,inline:true});
});

test('a picture with no drawing comment takes its stand-in\'s raster size, as the engine writes it (#122)',()=>{
 const body='![a][image1] ![b][image2] ![c][image3]\n\n[image1]: <image/png, 2 KB, 40x30 px>\n[image2]: <image/png, 9 KB, 1248x100 px>\n[image3]: <image/png, 2 KB>\n';
 const got=pictureExtents(body);
 assert.deepEqual(got.get('image1'),{widthPx:40,heightPx:30,inline:true});
 // Wider than MAX_PICTURE_WIDTH (5,943,600 EMU = 624px): scaled to it, keeping its shape.
 assert.deepEqual(got.get('image2'),{widthPx:624,heightPx:50,inline:true});
 assert.equal(got.has('image3'),false);
 assert.equal(pictureMime('image/png, 2 KB, 40x30 px'),'image/png');
});

test('a drawing comment wins over the stand-in\'s raster size, and code is text (#122)',()=>{
 const body=`[image1]: <image/png, 2 KB, 40x30 px>\n${drawing('image1',inline(952500,952500))}\n\n\`\`\`\n[image2]: <image/png, 2 KB, 40x30 px>\n\`\`\`\n`;
 const got=pictureExtents(body);
 assert.deepEqual(got.get('image1'),{widthPx:100,heightPx:100,inline:true});
 assert.equal(got.has('image2'),false);
});

test('a stand-in size no raster has leaves the picture a chip (#125)',()=>{
 const body=`[image1]: <image/png, 1 KB, ${'9'.repeat(400)}x30 px>\n[image2]: <image/png, 1 KB, 0x30 px>\n[image3]: <image/png, 1 KB, 40x0 px>\n`;
 const got=pictureExtents(body);
 assert.equal(got.size,0,JSON.stringify([...got]));
});
