// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Page-local footnotes. A source definition is scheduled exactly once, by its
 * first canonical reference. The compositor accepts body lines in order and
 * commits the note reservation at the same time. Reservations never shrink.
 * A rejected line has no side effects; page/row checkpoints support rollback.
 * Oversized definitions have an explicit source-line cursor and continue on
 * later pages. There is no speculative global repagination/fixed-point loop.
 */
export function flattenLayoutBlocks(blocks) {
 return (blocks || []).flatMap(block => block.type === 'table'
  ? block.rows.flatMap(row => row.cells.flatMap(cell => flattenLayoutBlocks(cell.blocks)))
  : [block]);
}

export function createFootnoteAllocator({snapshot, composeLines, width, height, lineHeight, warn}) {
 // Extremely short custom frames can still show one source line on a
 // continuation-only page. Suppress decorative label/rule spacing if needed.
 const labelHeight = Math.min(20, Math.max(0, height - lineHeight));
 const separator = Math.min(12, Math.max(0, height - lineHeight - labelHeight));
 const between = 6;
 const notes = new Map(), sourceRuns = new Map(), missing = new Set(), nestedReferences = new Set();
 const definitions = snapshot.footnotes || [];
 for (const block of flattenLayoutBlocks([...snapshot.blocks, ...definitions.flatMap(note => note.blocks || [])]))
  for (const run of block.runs || []) sourceRuns.set(run.id, run);
 for (const source of definitions) {
  const id = String(source.id ?? source.identifier);
  if (notes.has(id)) {
   // Keep malformed duplicate definitions visible instead of silently replacing.
   const previous = notes.get(id);
   previous.blocks.push(...flattenLayoutBlocks(source.blocks));
   warn('duplicate-footnote-definition', `Footnote ${id} has multiple definitions; all definition text is preserved together.`, id);
   continue;
  }
  if ((source.blocks || []).some(block => block.type === 'table'))
   warn('footnote-table-linearized', `The table in footnote ${id} is shown in row and cell order in the page-bottom note band.`, id);
  notes.set(id, {...source, id, identifier: String(source.identifier ?? id), blocks: flattenLayoutBlocks(source.blocks), orphan: false});
 }
 for (const note of notes.values()) for (const block of note.blocks) for (const run of block.runs || []) {
  const target = run.footnoteId ?? snapshot.runMap?.get(run.id)?.footnoteId;
  if (target == null || target === '') continue;
  const id = String(target); nestedReferences.add(id);
  if (!notes.has(id)) warn('missing-footnote-definition', `Footnote reference ${id} inside note ${note.identifier} has no visible definition.`, id);
 }
 const wrap = note => {
  note.lines = composeLines(note.blocks, width);
  // An empty definition is still a visible labelled note.
  if (!note.lines.length) note.lines = [{blockId: note.blocks[0]?.id || `empty-footnote-${note.id}`, y: 0, height: lineHeight, runs: [], pmRange: note.pmRange || {from: 0, to: 0}}];
 };
 for (const note of notes.values()) wrap(note);
 let scheduled = new Set(), pending = [], requests = [], allocations = [], active = false;
 const cloneEntries = items => items.map(item => ({...item}));
 const footprint = items => items.length ? separator + items.reduce((sum, item) => sum + labelHeight + item.count * lineHeight, 0) + between * (items.length - 1) : 0;
 function checkpoint() { return {scheduled: new Set(scheduled), pending: cloneEntries(pending), requests: cloneEntries(requests), allocations: cloneEntries(allocations), active}; }
 function restore(state) { scheduled = new Set(state.scheduled); pending = cloneEntries(state.pending); requests = cloneEntries(state.requests); allocations = cloneEntries(state.allocations); active = state.active; }
 function beginPage() { requests = cloneEntries(pending); allocations = []; active = false; }
 function referenceIds(lines) {
  const ids = [];
  for (const line of lines) for (const run of line.runs || []) {
   const value = run.footnoteId ?? sourceRuns.get(run.runId ?? run.id)?.footnoteId ?? snapshot.runMap?.get(run.runId ?? run.id)?.footnoteId;
   if (value == null || value === '') continue;
   const id = String(value);
   // An endnote's reference: its note follows the body, not the page (#46).
   if (snapshot.endnoteIds?.has(id)) continue;
   if (!notes.has(id)) {
    if (!missing.has(id)) { missing.add(id); warn('missing-footnote-definition', `Footnote reference ${id} has no visible definition.`, id); }
    continue;
   }
   if (!scheduled.has(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
 }
 // Allocate whole measured lines. Reserve one line per newly referenced note
 // first when possible, so a large earlier note cannot hide a short later one.
 function allocate(items, budget, preferred = []) {
  const result = [], counts = new Map(); let used = 0;
  function addLine(item) {
   const old = counts.get(item.id) || 0;
   if (item.offset + old >= notes.get(item.id).lines.length) return false;
   const cost = lineHeight + (old ? 0 : labelHeight + (counts.size ? between : separator));
   if (used + cost > budget + 0.001) return false;
   counts.set(item.id, old + 1); used += cost; return true;
  }
  for (const id of preferred) { const item = items.find(item => item.id === id); if (item) addLine(item); }
  for (const item of items) while (addLine(item)) { /* bounded by source line count */ }
  for (const item of items) if (counts.has(item.id)) result.push({...item, count: counts.get(item.id)});
  return result;
 }
 function accept(lines, bodyBottom, bodyStart = bodyBottom - lineHeight) {
  if (bodyBottom > height + 0.001) return false;
  const ids = referenceIds(lines), additions = ids.map(id => ({id, offset: 0}));
  if (!active) {
   const all = [...requests, ...additions], budget = height - bodyBottom;
   const proposed = allocate(all, budget, ids);
   // At least the first note must fit beside the reference if geometry allows;
   // otherwise retain the call, carry the definition, and disclose the limit.
   if (all.length && !proposed.length && bodyStart > 0) return false;
   if (ids.length && bodyStart > 0) {
    const full = all.map(item => ({...item, count: notes.get(item.id).lines.length - item.offset}));
    if (footprint(full) > budget + 0.001) return false;
   }
   requests = all; allocations = proposed; active = true;
  } else if (!ids.length) {
   if (bodyBottom + footprint(allocations) > height + 0.001) return false;
  } else {
   const full = additions.map(item => ({...item, count: notes.get(item.id).lines.length}));
   if (bodyBottom + footprint([...allocations, ...full]) > height + 0.001) return false;
   requests.push(...additions); allocations.push(...full);
  }
  for (const id of ids) scheduled.add(id);
  if (ids.some(id => !allocations.some(item => item.id === id)))
   warn('footnote-reference-capacity', 'This page has more footnote references than its available note area can hold. Excess notes continue on the following page.', ids.find(id => !allocations.some(item => item.id === id)));
  return true;
 }
 function enqueueOrphans() {
  for (const note of notes.values()) if (!scheduled.has(note.id)) {
   scheduled.add(note.id); note.orphan = !nestedReferences.has(note.id); requests.push({id: note.id, offset: 0});
   if (note.orphan) warn('unreferenced-footnote', `Footnote ${note.identifier} is unreferenced; its definition is retained in the final page-bottom notes.`, note.id);
   else warn('nested-footnote-deferred', `Footnote ${note.identifier} is referenced within another note. Nested footnotes are retained with the final page-bottom notes rather than allocated recursively.`, note.id);
  }
 }
 // Once the body is finished, spend remaining page space on pending definitions.
 function fillRemainder(bodyBottom = 0) {
  const old = new Map(allocations.map(item => [item.id, item.count]));
  const left = requests.map(item => ({...item, offset: item.offset + (old.get(item.id) || 0)})).filter(item => item.offset < notes.get(item.id).lines.length);
  if (!allocations.length) { allocations = allocate(left, height - bodyBottom); active = true; return; }
  let budget = height - bodyBottom - footprint(allocations);
  for (const item of left) {
   const existing = allocations.find(part => part.id === item.id);
   const overhead = existing ? 0 : labelHeight + between;
   const count = Math.min(notes.get(item.id).lines.length - item.offset, Math.floor((budget - overhead + 0.001) / lineHeight));
   if (count <= 0) continue;
   if (existing) existing.count += count; else allocations.push({...item, count});
   budget -= overhead + count * lineHeight;
  }
 }
 function finishPage(pageIndex) {
  const total = footprint(allocations), band = total ? {pageIndex, frameIndex: 0, x: 0, y: height - total, width, height: total} : null;
  let y = height - total + separator;
  const fragments = allocations.map(item => {
   const note = notes.get(item.id), continuedBefore = item.offset > 0, continuedAfter = item.offset + item.count < note.lines.length;
   const lines = note.lines.slice(item.offset, item.offset + item.count).map((line, index) => ({...line, y: labelHeight + index * lineHeight}));
   const fragment = {footnoteId: note.id, identifier: note.identifier, pageIndex, frameIndex: 0, x: 0, y, width, height: labelHeight + item.count * lineHeight, lines, continuedBefore, continuedAfter, orphan: note.orphan};
   y += fragment.height + between; return fragment;
  });
  const emitted = new Map(allocations.map(item => [item.id, item.count]));
  pending = requests.map(item => ({...item, offset: item.offset + (emitted.get(item.id) || 0)})).filter(item => item.offset < notes.get(item.id).lines.length);
  return {band, fragments};
 }
 return {beginPage, accept, checkpoint, restore, finishPage, enqueueOrphans, fillRemainder, referenceIds,
  get bodyLimit() { return height - footprint(allocations); },
 // A section's pages bring their own content area (#47).
 // Notes are rewrapped to its width (#49); a note continued from the previous
 // page resumes at the new line holding the first text it had not shown.
 setGeometry(geometry) {
  const rewrap = Math.abs(geometry.width - width) > 0.001;
  width = geometry.width; height = geometry.height;
  if (!rewrap) return;
  for (const note of notes.values()) {
   const carried = pending.filter(item => item.id === note.id), from = carried.map(item => note.lines[item.offset]?.pmRange?.from);
   wrap(note);
   carried.forEach((item, i) => { let at = 0; note.lines.forEach((line, li) => { if ((line.pmRange?.from ?? 0) <= from[i]) at = li; }); item.offset = at; });
  }
 },
  get hasPending() { return pending.length > 0; },
  get enabled() { return notes.size > 0 || sourceRuns.size > 0; }};
}
