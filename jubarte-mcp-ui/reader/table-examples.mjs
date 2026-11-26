// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// Fictional operational examples for pagination, wrapping, review and merged grids.
const actions=[
 ['Access inventory','Identity team','Confirm each test account has the smallest access required; remove temporary roles after the rehearsal.'],
 ['Export validation','Data services','Compare record counts and a representative sample against the source snapshot before approving the export.'],
 ['Recovery rehearsal','Operations','Record the start and finish times, the dataset used, and any dependency that changes the recovery result.'],
 ['Support handover','Service desk','Route a synthetic request through the support queue and confirm that both escalation contacts receive it.'],
 ['Accessibility check','Experience team','Test keyboard navigation, visible focus, table headers, and readable error messages at common zoom levels.'],
 ['Configuration review','Delivery lead','Verify that the configuration record describes the environment actually deployed and links to the approved change.'],
 ['Training follow-up','Enablement','Collect questions from the workshop and assign an owner for answers that were not available during the session.'],
 ['Archive transfer','Records team','Verify the package manifest, retained formats, destination permissions, and checksums before removing staging files.'],
];
const rows=Array.from({length:48},(_,i)=>{const [action,owner,note]=actions[i%actions.length];const round=Math.floor(i/actions.length)+1;const content=i===9?`{==${note}==}{>>c41 @RV: Keep evidence linked to this row, not a separate unversioned checklist.<<}`:i===22?`{~~Complete within five days.~>Complete within three Business Days.~~}{>>r41 @DL<<} ${note}`:note;return `| ${String(i+1).padStart(2,'0')} · ${action} | ${owner} | Wave ${round} | ${content} |`}).join('\n');
const register=`---
view: tracked
title: Harbor Readiness Evidence Register
page: Letter portrait, margins 0.7in, top 0.65in, bottom 0.65in
authors:
  RV: Riley Vale
  DL: Devon Lane
---

# Harbor Readiness Evidence Register

**Fictional table review sample · not a live operational checklist**

This register records forty-eight distinct review tasks across six preparation waves. The table intentionally continues across several pages. Each continuation repeats the column headings; ordinary rows stay together when they fit, while text remains linked to its original document position.

<!-- t0 49x4, header row repeats -->
| Reference and activity | Accountable team | Checkpoint | Evidence and acceptance note |
| --- | --- | :---: | --- |
${rows}

## Review closeout

The coordinator verifies that each row has an evidence link, an accountable team and a recorded result. {==An incomplete task cannot be treated as complete merely because its target date has passed.==}{>>c42 @RV: Preserve this distinction in the status summary.<<}

{>>c43 @DL re c41: Each evidence package now includes its register row reference.<<}

Export the Markdown source after using Page Setup to inspect how physical page geometry is recorded. Switching review modes changes the reading view without accepting or rejecting the source revisions.
`;
const longNarrative=Array.from({length:28},(_,i)=>{const [,owner,note]=actions[i%actions.length];return `${owner} checkpoint ${i+1}. ${note} The reviewer records the observed result, explains any unresolved difference, and names the next action before the checkpoint is closed.`}).join(' ');
const wide=`---
view: tracked
title: Regional Transition Matrix
page:
  size: A4
  orientation: landscape
  margins: {top: 14mm, right: 14mm, bottom: 14mm, left: 14mm}
authors:
  RV: Riley Vale
  DL: Devon Lane
---

# Regional Transition Matrix

**Fictional merged-grid and oversized-row sample**

The first two body rows share a merged workstream cell spanning two columns and two rows. The retained note from a covered Markdown cell is included inside that merged cell. Later, one unusually long evidence cell must continue across pages without repeating its body text or clipping the short neighboring cells.

<!-- t0 9x8, header row repeats, merged t0.row1.cell0 across 2 down 2 -->
| Workstream | Sub-area | North | South | East | West | Owner | Decision |
| --- | --- | :---: | :---: | :---: | :---: | --- | --- |
| {==Shared platform readiness==}{>>c51 @DL: This merged cell applies to both access and export checks.<<} | Scope includes access and export. | Ready | Review | Ready | Ready | Identity team | Confirm exception |
| | | Passed | Pending | Passed | Passed | Data services | Recheck count |
| Operations | Recovery | 4h | 5h | 4h | 6h | Operations | {~~Accept~>Rehearse again~~}{>>r51 @RV<<} |
| Support | Escalation | Ready | Ready | Review | Ready | Service desk | Confirm backup |
| Records | Archive | Passed | Passed | Passed | Pending | Records team | Verify manifest |
| Accessibility | Keyboard | Passed | Review | Passed | Passed | Experience team | Check focus |
| Oversized evidence | Detailed observations | ${longNarrative} | Short sibling retained once | Complete | Review | Delivery lead | Continue by line |
| Closeout | Handover | Ready | Ready | Ready | Ready | Coordinator | Final verification |

## Completion note

A table row that exceeds the printable area continues as an explicitly bordered cell fragment. The next page repeats the header when it is small enough to leave useful room for body content. Source comments, links and marks remain attached to their original text ranges. [Review reference](https://example.com/review) is a demonstration link. {>>c52 @RV: Verify that the long evidence cell continues without repeating its text.<<}{>>c53 @DL re c51: The shared workstream has been retained as one merged cell.<<}
`;
export const tableExamples=[
 {id:'readiness-register',title:'Readiness register · long table',description:'48-row register · Letter portrait · repeated headers and revisions',source:register},
 {id:'transition-matrix',title:'Transition matrix · merged grid',description:'A4 landscape · eight columns · colspan/rowspan and oversized row',source:wide},
];
