// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

import {longSample} from './long-sample.mjs';
import {tableExamples} from './table-examples.mjs';

// Everything in these review documents is fictional, including people, dates,
// costs and results. The helper supplies stable paragraph IDs, not filler text.
function reviewDocument({title, subtitle, page, authors, introduction, sections, table, closing}) {
  let paragraph = 0;
  const block = text => `<!-- p${paragraph++} -->\n${text}`;
  const body = [block(`# ${title}`), block(`**${subtitle} · FICTIONAL REVIEW SAMPLE**`), block(introduction)];
  for (const [heading, ...paragraphs] of sections) body.push(block(`## ${heading}`), ...paragraphs.map(block));
  body.push(`<!-- t0 header row repeats -->\n${table}`, block('## Review checklist'), '- [x] Confirm the scope and name a decision owner\n- [x] Compare the revised wording against the baseline\n- [ ] Resolve the remaining review discussion\n- [ ] Verify the final document before distribution', block(closing), block('This sample uses **bold**, *emphasis*, <u>underlining</u>, and ~~superseded wording~~. A hard break follows.<br>All figures are demonstration data; a label such as CO<sub>2</sub> or m<sup>2</sup> illustrates inline formatting. See the [review checklist](#review-checklist) and the method note.[^method]'), '[^method]: The source, dates, organizations and measurements in this document are invented for reader testing. No external records were consulted.');
  return `---\nview: tracked\ntitle: ${title}\npage: ${page}\nauthors:\n${authors.map(([handle,name]) => `  ${handle}: ${name} # 2026-10-13T09:00:00Z`).join('\n')}\nstyles:\n  Normal: Aptos 11pt, after 8pt, line 1.12, left\n  "#": Heading1, Aptos bold 20pt, keep-next\n  "##": Heading2, Aptos bold 14pt, keep-next\n---\n\n${body.join('\n\n')}\n`;
}

const launch = reviewDocument({
  title:'Cedar Lane Library Evening Access Pilot',
  subtitle:'Decision brief · draft 0.6 · 13 October 2026',
  page:'Letter portrait, margins 0.85in, top 0.75in, bottom 0.9in',
  authors:[['RK','Rowan Kim'],['MT','Morgan Teal']],
  introduction:'Cedar Lane Library proposes a twelve-week evening-access pilot at its fictional Eastbank branch. This brief records the operational case, staffing approach, evaluation plan, and unresolved review points. The proposal extends access to existing services without introducing unattended entry. All attendance estimates and costs below are invented so the document can demonstrate a realistic review workflow.',
  sections:[
    ['1. Decision requested',
      'Approve a limited pilot on {~~three~>two~~}{>>r1 @RK<<} weekday evenings, with doors closing at 8:30 p.m. The branch manager will make the final opening decision each afternoon after confirming staffing, building readiness, and transport arrangements. Approval of this pilot does not automatically authorize a permanent schedule change or commit the library to additional sites.',
      'The team recommends Tuesday and Thursday because those evenings overlap with the local adult-learning timetable. {==The proposed dates remain provisional until the building team confirms access.==}{>>c1 @MT: Please record the building confirmation before announcing the launch.<<}{>>c2 @RK re c1: Added to the readiness checklist; the communications draft remains on hold.<<}'],
    ['2. Community need and evidence',
      'The fictional consultation included thirty-six short interviews and two open sessions. Participants most often requested a quiet place to study after work, help using online forms, and reliable access to printers. Several described arriving too late for the current closing time. These responses are useful for designing the pilot but are not a statistically representative measure of neighborhood demand.',
      'Staff will keep a daily count of arrivals during the additional hours. Visitors may optionally select a broad purpose for their visit on an anonymous card. The card will not request names, account numbers, or details about the forms being completed. The team will compare overall participation across evenings and check whether demand persists after the initial publicity period.'],
    ['3. Staffing and visitor experience',
      'Each evening requires two trained staff members and a duty manager reachable throughout the session. Volunteers may help with wayfinding and event setup, but they will not replace the minimum staffing requirement. A short shift briefing will identify rooms in use, equipment faults, accessibility requests already received, and the person responsible for the final building check.',
      '{++A visitor who needs additional time near closing should receive a clear explanation of the available options and assistance arranging a return visit.++}{>>r2 @MT<<} Staff must not promise specialist advice they are not qualified to provide. Printed information will explain the pilot hours in plain language, with a large-print version available at the welcome desk.'],
    ['4. Building readiness and disruption',
      'Facilities staff will test lighting, accessible entrances, heating controls, and the closing alarm before the first extended session. A fault that prevents safe entry or exit pauses the session until the duty manager confirms a remedy. The library will keep a simple incident log that separates verified facts from assumptions and notes any action required before the next opening.',
      'The cleaning schedule will move to the following morning on pilot days. Deliveries must finish before the public session begins so the entrance remains clear. If another building activity creates excessive noise, staff will offer a quieter room where practical and record the interruption. Repeated conflicts will be discussed at the weekly operations meeting rather than left to individual staff to negotiate.'],
    ['5. Communications and accessibility',
      'Public notices should state the two pilot evenings, opening dates, available services, and a contact route for access questions. The team will distribute notices through the branch newsletter and partner noticeboards after readiness is confirmed. {--The pilot will be described as a permanent expansion of opening hours.--}{>>r3 @RK<<} The replacement announcement will make the trial duration explicit.',
      '> A successful visit means the visitor can understand what is available, find assistance, and leave knowing the next practical step.\n\nThe communications lead will check that printed and digital notices use matching times. Partners may translate the notice, provided the opening hours and temporary nature of the pilot remain clear.'],
    ['6. Evaluation and next decision',
      'The midpoint review occurs after six weeks. It will consider attendance, service interruptions, staffing coverage, and visitor feedback together; no single count determines success. If use is low, the team will test a small communications change before changing the schedule. Any change to opening days requires an updated notice and a reasonable lead time for visitors.',
      'The final recommendation will distinguish recurring operating costs from one-time setup costs. It will also describe limitations in the evidence, including missed counting periods and unusual events. A proposal to continue the service must name a sustainable staffing plan and explain what existing work would be reduced if the same budget is reused.'],
  ],
  table:'| Workstream | Owner | Readiness evidence |\n| :--- | :--- | :--- |\n| Building | Facilities lead | Lighting and alarm check recorded |\n| Staffing | Branch manager | Two trained staff on each rota |\n| Communications | Outreach lead | Times checked across all notices |\n| Evaluation | Service analyst | Anonymous count sheet prepared |\n| Accessibility | Visitor services | Large-print notice at the desk |',
  closing:'The next review meeting will decide whether the readiness evidence is sufficient to announce the opening dates. {>>c3 @MT resolved: The evaluation sheet now separates unique visits from repeat attendance.<<} The branch manager will keep the decision record with this brief so later reviewers can understand the assumptions behind the pilot.'
});

const field = reviewDocument({
  title:'Willow Reach Wetland Monitoring Plan',
  subtitle:'Field protocol · review copy · autumn campaign',
  page:'A4 portrait, margins 20mm, left 25mm, right 18mm',
  authors:[['AS','Ari Solis'],['JP','Jules Park']],
  introduction:'The fictional Willow Reach partnership is preparing a seasonal survey of a restored wetland. The plan describes a repeatable observation method, equipment checks, sample labeling, and review responsibilities. It is a document-layout demonstration rather than an approved field-safety protocol. Named locations and environmental measurements are invented.',
  sections:[
    ['1. Purpose and survey boundaries',
      'The campaign will document visible vegetation cover, standing-water extent, and changes to marked observation points. It will not establish water quality, habitat condition, or a causal effect of restoration from a single visit. The team will compare the new observations with the same locations in the fictional baseline record and flag places where conditions prevent a reliable comparison.',
      'Surveyors will visit {~~eight~>six~~}{>>r1 @AS<<} fixed stations along the accessible perimeter route. Two earlier stations are excluded because the approach is no longer maintained. {==The exclusion must remain visible in the final summary.==}{>>c1 @JP: Otherwise a reader may assume the missing observations indicate no change.<<}{>>c2 @AS re c1: Added an explicit missing-data category.<<}'],
    ['2. Preparation and team briefing',
      'The coordinator will prepare station cards, an equipment register, spare labels, and a printed route map. Before departure, each team will confirm that device clocks use the same time zone and that the camera naming convention matches the station register. A second person will check the first completed record so labeling problems are caught before the route is repeated.',
      'The briefing will identify the visit leader, the planned return time, and the local access conditions verified for that day. This sample does not prescribe emergency procedures. The real operating organization would supply its own approved procedures and competent supervision. Staff should record a station as inaccessible rather than improvise a route outside the authorized survey boundary.'],
    ['3. Observation method',
      'At each station, the observer will take a wide view from the marked standing point and record visible cover using the same category definitions as the baseline. The written note should describe what can actually be seen. Terms such as healthy, degraded, or recovered require additional evidence and should not substitute for a description of vegetation, exposed ground, or standing water.',
      '{++Where glare or vegetation blocks the view, record the limitation and retain the photograph even if no numeric estimate is entered.++}{>>r2 @JP<<} Repeat observations should use the same approximate viewing direction. A meaningful difference in camera position belongs in the note so reviewers can distinguish an apparent change caused by framing from a change in the site.'],
    ['4. Labels, files, and traceability',
      'Every record will use a station identifier, visit date, and sequence number. The identifier travels with both the observation sheet and the photograph. Renaming files to improve readability must not remove the original identifier. The coordinator will retain an untouched copy of the received files and create a separate working folder for resized review images.',
      'The demonstration naming pattern is `WR-S03-20261020-02`. A simple text manifest will list the expected files and explain missing entries. If two observers submit different values for the same station, both observations remain in the review record until a reviewer documents the reason for selecting, combining, or rejecting them. Silent replacement would make the comparison difficult to audit.'],
    ['5. Quality review and uncertainty',
      'The reviewer will first check completeness: station identifier, observer initials, date, image reference, and any access limitation. The next pass checks consistency between the image and the written description. It is acceptable to return a question to the observer, but a reviewer should not infer a precise measurement from a photograph that was not captured for that purpose.',
      '{==A missing value is different from a measured zero.==}{>>c3 @AS: Preserve that distinction in the summary table and exported data.<<} The final narrative should identify uncertainty in ordinary language. If a station is only partly visible, the team may describe the visible area while leaving the overall estimate blank. This avoids giving an unsupported impression of precision.'],
    ['6. Reporting and next season',
      'The report will pair a short narrative with the station register. It should show which observations are comparable, which are limited, and which are missing. Recommendations for a later visit must be tied to a question that additional evidence could answer. A request for more data without a clear purpose adds effort without improving the decision.',
      'After review, the coordinator will archive the approved record and a list of proposed method changes. Any change to station position or category definitions will be versioned before the next campaign. The team will retain enough explanation that a new observer can repeat the method without relying on an unwritten understanding held by the current staff.'],
  ],
  table:'| Station | Planned evidence | Review status |\n| :--- | :--- | :--- |\n| WR-S01 | Overview image and cover note | Ready |\n| WR-S02 | Water-edge image | Ready |\n| WR-S03 | Baseline comparison | {~~Complete~>Awaiting image check~~} |\n| WR-S04 | Access limitation note | Ready |\n| WR-S05 | Repeat photograph | Pending |\n| WR-S06 | Perimeter observation | Pending |',
  closing:'The coordinator will release the review copy after the completeness check, keeping unresolved questions attached to their source observations. {>>c4 @JP resolved: The file manifest now includes the two excluded baseline stations.<<} No conclusion about restoration success should be drawn from this fictional demonstration dataset.'
});

const workshop = reviewDocument({
  title:'Lumen Works Service Readiness Workshop',
  subtitle:'Facilitator packet · fictional operational review',
  page:'\n  size: A4\n  orientation: landscape\n  margins:\n    top: 15mm\n    right: 18mm\n    bottom: 15mm\n    left: 22mm',
  authors:[['EN','Ellis North'],['SB','Sam Bell']],
  introduction:'This fictional workshop packet prepares a cross-functional team to review the launch of an internal equipment-booking service. It uses a landscape page for a broad readiness matrix and preserves the reasoning behind proposed changes. The service, organizations, people, milestones, and reported observations are invented. The packet is intended for review before a decision meeting.',
  sections:[
    ['1. Workshop outcome',
      'By the end of the session, participants should agree which launch conditions are met, which remain open, and who owns the next action for each gap. The meeting should not treat a polished demonstration as proof that day-to-day support is ready. Evidence must cover the ordinary booking journey, cancellation, conflicting requests, and recovery when the service is unavailable.',
      'The proposed launch gate moves from {~~all issues closed~>all critical issues closed and remaining issues explicitly owned~~}{>>r1 @EN<<}. {==A named owner alone does not make an unresolved critical issue acceptable.==}{>>c1 @SB: Please keep the critical-issue condition visible on the decision slide.<<}{>>c2 @EN re c1: Confirmed; exceptions require a separate decision.<<}'],
    ['2. Participants and preparation',
      'The facilitator will invite representatives from reception, equipment operations, service support, and the project team. Each representative should bring evidence from their part of the workflow, including a realistic example of something that failed. Participants are not expected to read every technical record, but they should review the summary and flag any claim they cannot support.',
      'The packet should arrive two working days before the meeting. A short pre-read will explain the booking rules, the proposed launch boundary, and the difference between a defect and a future enhancement. The facilitator will collect factual corrections beforehand so meeting time can focus on decisions and trade-offs rather than repairing avoidable misunderstandings.'],
    ['3. Demonstration sequence',
      'Begin with a standard request from an employee who has not used the service before. Demonstrate finding an item, checking availability, reserving it, and receiving a confirmation. Then show a cancellation and a conflicting request. The presenter should use the same interface available to an ordinary user rather than an administrative shortcut that bypasses a difficult step.',
      '{++After each scenario, pause to ask what evidence supports the result and what remains untested.++}{>>r2 @SB<<} The note taker will distinguish an observed success from an explanation of how the feature is intended to work. If a scenario cannot be completed, record the point of failure and continue with the remaining agenda instead of improvising an unreviewed workaround.'],
    ['4. Support and operational handover',
      'Reception needs a clear route for urgent booking conflicts and a short explanation of which issues it can resolve directly. Equipment operations needs a daily view of upcoming reservations and an agreed process for marking an item unavailable. The support team needs enough context in an incoming request to identify the affected booking without asking the employee to repeat the entire story.',
      'A handover is complete only when the receiving team can perform the task, locate the relevant instructions, and explain when to escalate. Attendance at a demonstration is useful evidence of engagement but is not sufficient evidence of readiness. The workshop should identify a practical rehearsal for each responsibility that has not yet been exercised.'],
    ['5. Launch boundary and fallback',
      'The initial release covers two equipment rooms and weekday reservations only. Adding a third room or weekend collection would require new operating arrangements and is outside this launch decision. The project team will retain the existing manual request channel during the initial observation period, with a clear instruction to prevent the same item being reserved in both systems.',
      '{--Every reported issue will cause the service to be withdrawn immediately.--}{>>r3 @EN<<} Instead, the duty owner will assess the effect, preserve the relevant evidence, and choose the agreed response. A broad outage may justify returning to the manual channel; a minor display problem may be recorded for correction while the service remains available.'],
    ['6. Decision record and follow-through',
      'The final decision record will state the approved scope, evidence reviewed, unresolved conditions, and the person authorized to confirm that a condition has been met. It should also name the start and end of the observation period. The record must not turn a tentative workshop suggestion into an approved commitment without the decision owner confirming that interpretation.',
      '> Record the decision in words that a colleague who missed the meeting can act on.\n\nThe facilitator will circulate the record for factual corrections and retain the reviewed version with this packet. Any later change to scope should refer back to the original decision and explain the new evidence or operational need that prompted the change.'],
  ],
  table:'| Scenario | Evidence required | Receiving team | Open question | Exit condition |\n| :--- | :--- | :--- | :--- | :--- |\n| Standard reservation | Confirmation and reservation record | Reception | Is collection location clear? | Employee completes without coaching |\n| Conflicting request | Conflict message and recovery path | Equipment operations | Can alternatives be found? | No duplicate reservation |\n| Cancellation | Released inventory and updated record | Reception | Does confirmation arrive promptly? | Item becomes available again |\n| Item unavailable | Operations update and user notice | Equipment operations | Who approves substitutions? | Affected reservations identified |\n| Service outage | Manual-channel rehearsal | Support | Who announces restoration? | Duty owner demonstrates fallback |\n| Handover | Reviewed guide and exercise record | All teams | Are escalation owners current? | Receiving team confirms readiness |',
  closing:'The facilitator should close with a read-back of the decision and the remaining actions. {>>c3 @SB resolved: The matrix now distinguishes evidence from the final exit condition.<<} The next check will verify the open conditions rather than rerun the full workshop.'
});

const archive = reviewDocument({
  title:'Mariner House Community Archive Transfer Plan',
  subtitle:'Collection operations · review draft · fictional example',
  page:'Legal portrait, margins 0.7in, top 54pt, bottom 60px, left 1.1in',
  authors:[['DL','Drew Lane'],['NF','Nico Finch']],
  introduction:'Mariner House is a fictional community archive preparing to move a small collection of recorded interviews, photographs, and event leaflets to a new reading room. This operational plan describes inventory, packaging, handover, and post-move verification. It is a demonstration document and does not authorize a transfer, establish ownership, or provide specialist conservation advice.',
  sections:[
    ['1. Scope and decision boundary',
      'The move includes catalogued material in cabinets A through D and the associated finding aids. Uncatalogued deposits remain outside scope until a separate inventory is complete. The project coordinator will keep a clear list of excluded material so movers and volunteers do not mistake proximity for authorization to pack an item. Each container will carry an identifier linked to the inventory.',
      'The target transfer window changes from {~~one day~>two supervised sessions~~}{>>r1 @DL<<}. The revised window leaves time for checking container counts at both ends of the move. {==No container should be left in an unattended shared corridor.==}{>>c1 @NF: Can the room booking cover the entire checking period?<<}{>>c2 @DL re c1: The draft timetable now includes a receiving-room hold.<<}'],
    ['2. Inventory and preparation',
      'Before packing, the team will confirm the identifier, brief description, current location, and destination location for each group of items. The inventory should be specific enough to reconcile the transfer without publishing unnecessary personal details from the collection. A missing or ambiguous identifier must be resolved before the container is sealed, not reconstructed from memory after arrival.',
      'The coordinator will preserve a dated copy of the inventory before work begins. Corrections made during packing should identify the person making the change and the reason. If an item is found in an unexpected location, record the discovery and verify the intended destination rather than silently moving it to the nearest available shelf. This keeps the location history intelligible.'],
    ['3. Handling and packaging',
      'Only trained participants will handle materials that require specialist methods. The team will follow the archive’s approved handling guidance and refer uncertain cases to its qualified adviser. This fictional plan deliberately does not prescribe conservation treatments. Ordinary transport containers must be clean, clearly labeled, and suitable for the items assigned to them under that guidance.',
      '{++A container may be closed only after the checker reconciles its contents with the packing list.++}{>>r2 @NF<<} The packing team and checker will initial the record separately. Labels should remain legible in the receiving room and should not obscure any original identifier. The outside label will use the container reference rather than a detailed description of private interview content.'],
    ['4. Transport and receiving sequence',
      'The transfer lead will confirm the authorized vehicle, access times, and receiving contact before loading begins. A signed count sheet records containers handed over, but it does not replace the detailed inventory. The receiving team will compare container identifiers before placing them in their temporary checking area. Any discrepancy is reported to the transfer lead while the movement record is still current.',
      'If a container is delayed or redirected, record its location and the person responsible for it. Do not mark an entire shipment complete because most containers arrived. The move is complete only when every in-scope container is accounted for, destination locations are recorded, and unresolved discrepancies have a named owner and an agreed next step.'],
    ['5. Access during the transition',
      'The archive will publish a temporary service notice explaining which materials are unavailable and when the next update will be issued. It will avoid promising a reopening date before the receiving checks are complete. Reading-room staff may suggest available alternatives, but should not imply that a digital copy exists or that access permission has been granted without checking the catalogue record.',
      '{--All interview recordings will be made publicly downloadable during the move.--}{>>r3 @DL<<} Existing access restrictions remain attached to the catalogue record throughout the transition. A change of building does not itself authorize a change in permissions. Requests involving restricted material will continue through the archive’s established review process.'],
    ['6. Verification and closure',
      'The post-move check will confirm shelf locations, container counts, and the availability of finding aids. Staff will test a small set of retrieval requests to check whether a colleague can locate material using the updated record. The sample should include more than the easiest containers and should cover each destination shelving area.',
      'The coordinator will close the project only after the receiving team accepts the location register and outstanding discrepancies are resolved or formally transferred to ongoing work. The closure note will describe what changed, what was learned, and which process improvements should be used next time. It will retain the original transfer record rather than replacing it with a summary that loses the sequence of events.'],
  ],
  table:'| Checkpoint | Responsible role | Required record |\n| :--- | :--- | :--- |\n| Inventory baseline | Catalogue lead | Dated inventory copy |\n| Container closure | Packing checker | Reconciled packing list |\n| Loading | Transfer lead | Container handover count |\n| Receiving | Reading-room lead | Arrival and discrepancy record |\n| Shelving | Collection assistant | Updated location register |\n| Retrieval test | Receiving team | Test request outcomes |\n| Project closure | Coordinator | Accepted handover and issue record |',
  closing:'Before scheduling the first session, the coordinator will confirm room access and the receiving team’s availability. {>>c3 @NF resolved: The revised inventory now includes an explicit destination-location field.<<} The plan remains a review draft until those operational details have been checked.'
});

const notesBrief=`---
view: tracked
page: Letter portrait, margins 1in
---
# Field programme review

This fictional planning brief demonstrates notes attached to the page containing their first reference.[^scope]

## Checklist and nested responsibilities

998. {==Confirm site access==}{>>@LM: Please confirm this before departure.<<} and the field-team briefing before equipment leaves the stores. This long checklist item wraps over several lines so its hanging indent can be inspected alongside the page margins.
999. Record the instrument calibration and retain the {--draft--}{++signed++} control readings.
1000. Confirm the handover arrangements.
    - Name the local contact and alternate contact.
    - Record the location of the accessible route and assembly point.
      - Check the route again after heavy rain.

- [x] Consent forms checked by the coordinator.
- [ ] Confirm the {==return transport==}{>>@AC: Add the accessible vehicle booking reference.<<} and the contingency meeting point. The checkbox and every wrapped line belong inside the printable area.

## Reporting cycle

${Array.from({length:12},(_,i)=>`### Visit ${i+1}

The coordinator reviews the site log, access restrictions, equipment condition and participant questions. ${i===2?'The third visit adds an extended observation note.[^observations]':i===6?'This is another reference to the scope note.[^scope]':i===9?'The final checks include a methods note.[^methods]':''} The team keeps factual observations separate from recommendations and records any revision with its author.

| Check | Evidence |
| --- | --- |
| Access | Confirmed with local contact ${i===4?'and the archive note.[^archive]':''} |
| Equipment | Calibration sheet reviewed |`).join('\n\n')}

[^scope]: The programme is a fictional example for reviewing document layout. The same note is printed once at the first visible reference and later references navigate back to that definition.

[^observations]: ${('The observer records weather, water level, access conditions and the exact time of each measurement. Long notes continue on later pages without repeating their source text. ').repeat(26)}

[^methods]: {==The methods checklist==}{>>@LM: Keep this note beside the reference when the paper size changes.<<} is reviewed independently before the results are combined.

[^archive]: The archive copy includes the original field sheets, a versioned methods description and the calibration record.
`;
export const readerExamples = [
  {id:'field-notes',title:'Field notes & checklists',description:'Letter portrait · nested lists · wide numbers · page footnotes',source:notesBrief},
  {id:'services-agreement',title:'Services agreement',description:'Long negotiation draft · Letter portrait · four schedules',source:longSample},
  {id:'library-pilot',title:'Library pilot brief',description:'Letter portrait · asymmetric inch margins · public-service review',source:launch},
  {id:'wetland-plan',title:'Wetland monitoring',description:'A4 portrait · millimetre margins · field protocol',source:field},
  {id:'readiness-workshop',title:'Readiness workshop',description:'A4 landscape · structured YAML · broad readiness matrix',source:workshop},
  {id:'archive-transfer',title:'Archive transfer plan',description:'Legal portrait · mixed-unit margins · collection operations',source:archive},
  ...tableExamples,
];
