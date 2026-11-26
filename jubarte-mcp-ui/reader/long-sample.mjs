// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

/** Fictional negotiation sample for the Jubarte/Plate browser demonstration. */
let nextParagraph = 0;
const paragraph = (text, clauses = '') => `<!-- p${nextParagraph++}${clauses ? ` ${clauses}` : ''} -->\n${text}`;
const blocks = [];
const add = (text, clauses) => blocks.push(paragraph(text, clauses));
const section = title => add(`## ${title}`);
const addList = text => blocks.push(text.split('\n').map(line => {
  const indent = line.match(/^\s*/)[0];
  return `${indent}<!-- p${nextParagraph++} -->\n${line}`;
}).join('\n'));
const table = (id, rows, columns, text) => blocks.push(`<!-- ${id} ${rows}x${columns}, header row repeats -->\n${text}`);

add('# Professional Services and Data Stewardship Agreement', 'center');
add('**FICTIONAL NEGOTIATION SAMPLE • NOT LEGAL ADVICE • NOT FOR SIGNATURE**', 'center');
add('This entirely fictional agreement illustrates tracked changes, review discussions, structured metadata, and rich Markdown. All organizations, people, contact addresses, commercial terms, and project details are invented. The displayed revisions are unresolved drafting alternatives; this demonstration does not establish a final legal position.');
add('**Draft 0.8 · 13 October 2026**<br>Project: Harbor Operations Planning Platform<br>Proposed effective date: 1 November 2026', 'center');
add('This Agreement is between **North Quay Research Cooperative** (the “Client”) and **Meridian Loom Systems Ltd.** (the “Supplier”). Avery Chen reviews for Client; Jordan Diaz reviews for Supplier; Maya Patel reviews security and privacy; and Luca Navarro reviews delivery. {>>c1 @AC resolved: Confirmed that the parties and all contact details are fictional.<<}');
add('Navigation: [Commercial framework](#1-purpose-and-contract-structure) · [Delivery plan](#schedule-a-delivery-and-acceptance) · [Fees](#schedule-b-fees-and-resources) · [Security and processing](#schedule-c-security-and-processing) · [Exit checklist](#schedule-d-transition-checklist).');

section('1. Purpose and contract structure');
add('Supplier will design, configure, and support a planning platform that helps Client coordinate warehouse capacity, vessel arrivals, and equipment maintenance. The platform supports operational decisions but does not control cranes, vehicles, safety alarms, or other physical equipment. Client remains responsible for validating recommendations before using them in a live operation. {==No autonomous control functionality is included.==}{>>c2 @MP: Keep this boundary in the solution description and the acceptance tests.<<}{>>c3 @LN re c2: Schedule A now includes a test for advisory-only operation.<<}');
add('The Agreement consists of these terms and Schedules A through D. If provisions conflict, an expressly identified amendment takes priority, followed by the security and processing provisions for their subject matter, these terms, and then the remaining schedules. A purchase order supplies administrative references only and cannot amend the agreed allocation of responsibility.');

section('2. Definitions and interpretation');
add('“Client Data” means records supplied by or on behalf of Client, including operational identifiers, business contacts, and resulting customer-specific reports. “Deliverables” means the outputs expressly listed in Schedule A. “Business Day” means Monday through Friday, excluding holidays mutually recorded in the project calendar. “Material Defect” means a reproducible failure to satisfy an agreed acceptance criterion that substantially prevents the intended use.');
add('A reference to written approval includes a message from an authorized representative in the designated project workspace, provided the message identifies the decision and is retained with the project record. Silence, an automated receipt, or attendance at a demonstration does not constitute approval. {==Authorized representatives cannot delegate signature authority through an informal workspace comment.==}{>>c4 @AC: Distinguish operational approvals from amendments involving liability or price.<<}{>>c5 @JD re c4: Agreed; section 5 reserves those amendments to the contract representatives.<<}');

section('3. Term and delivery governance');
add('The initial term begins on the effective date and continues for twelve months unless terminated under section 17. The parties may renew by a signed written extension agreed at least {~~30~>45~~}{>>r1 @JD<<}{>>r2 @AC<<} days before expiry. No renewal occurs solely because Supplier continues to answer support questions during the transition period.');
add('Each party will appoint one project lead and one contract representative. Project leads meet weekly during implementation and monthly during support, maintain the decision log, and identify dependencies that could affect scope or timing. A party replacing its lead will provide a reasonable handover and identify an interim contact. {>>c6 @LN: Add the named representatives to the execution copy once staffing is confirmed.<<}');

section('4. Services and Client dependencies');
add('Supplier will perform the services with reasonable professional skill and care, using personnel with experience appropriate to their assigned roles. Client will provide access to designated test environments, representative datasets, and subject-matter reviewers by the dates in Schedule A. Supplier will identify an incomplete or unusable dependency promptly and describe its expected effect on the plan.');
add('A missed dependency does not automatically extend every milestone. The parties will first consider resequencing work, using a suitable substitute dataset, or completing an unaffected workstream. Any justified schedule adjustment will apply only to the affected activities and will be documented through the change process. {==Supplier must explain the causal connection between the dependency and the requested adjustment.==}{>>c7 @AC: This prevents a minor access delay from reopening the entire implementation schedule.<<}');
add('{--Client shall make all personnel available on demand and shall bear any cost arising from delayed participation, whether or not the delay affects delivery.--}{>>r3 @JD<<}');

section('5. Scope changes and decision authority');
add('Either project lead may propose a change request describing the requested outcome, reason, affected Deliverables, assumptions, fee impact, and schedule impact. Supplier will provide an estimate before beginning changed work. Only the contract representatives may approve a change that increases fees, changes ownership, or alters security commitments, liability, or termination rights.');
add('Approved changes will receive a unique number and be incorporated into the baseline plan. Supplier may continue unaffected services while a request is under review. Emergency measures needed to contain an active incident may proceed within the security obligations, but do not authorize additional charges without subsequent written agreement. {==Work performed while a proposal is pending remains at Supplier’s commercial risk.==}{>>c8 @JD: Acceptable for discretionary scope additions; existing support obligations remain payable.<<}{>>c9 @AC re c8: Agreed, subject to the existing fee schedule.<<}');

section('6. Acceptance and corrective work');
add('Supplier will submit each Deliverable with the relevant test results and a written readiness notice. Client has {~~five~>ten~~}{>>r4 @JD<<}{>>r5 @AC<<} Business Days to accept it or provide a rejection describing the failed criterion and supporting evidence. Supplier will correct a valid Material Defect without additional charge and resubmit the affected portion for a focused review.');
add('Minor defects that do not prevent the agreed use may be recorded on a punch list with a reasonable correction date. Production use for a limited pilot, security testing, or business-continuity purposes does not alone constitute acceptance. {==Acceptance does not waive a defect that could not reasonably have been discovered during the agreed tests.==}{>>c10 @AC: Confirm that the warranty remedy survives acceptance.<<}{>>c11 @JD re c10: Yes, subject to the notice and remedy provisions in section 13.<<}');

section('7. Fees, invoicing, and disputed amounts');
add('The fixed implementation fee and support charges appear in Schedule B. Supplier will invoice only after the stated milestone is achieved and will include the purchase order reference, service period, applicable taxes, and enough detail to reconcile the charge. Payment of an undisputed invoice is due within {~~30~>45~~}{>>r6 @JD<<}{>>r7 @AC<<} days after receipt of a valid invoice.');
add('Client will notify Supplier promptly of a good-faith dispute and pay the undisputed balance when due. The finance contacts will try to resolve disputed amounts within fifteen Business Days. Supplier may not suspend services over an amount genuinely under review while Client cooperates and pays undisputed charges. {>>c12 @JD resolved: The separate proposal for advance support payment has been withdrawn.<<}');

section('8. Personnel and subcontractors');
add('Supplier remains responsible for the acts and omissions of its personnel and approved subcontractors as if they were its own. Access to Client systems will be limited to people who need it for assigned services and who are bound by appropriate confidentiality obligations. Supplier will remove access promptly when a person leaves the assignment.');
add('Supplier will give at least thirty days’ advance notice before adding a subcontractor that processes Client Data, identifying its role and processing location. Client may object on reasonable, documented security or privacy grounds. The parties will seek a workable alternative before considering termination of the affected service. {==A subcontractor change must not silently move production data to a new region.==}{>>c13 @MP: Align this approval path with the regional restriction in Schedule C.<<}');

section('9. Confidentiality and permitted disclosures');
add('Each recipient will protect the other party’s non-public business, technical, and commercial information using at least reasonable care, use it only to perform or receive the services, and disclose it only to people with a legitimate need to know. Information is excluded if the recipient can demonstrate that it was public without breach, already lawfully known, independently developed, or lawfully received without restriction.');
add('Where disclosure is required by a binding legal demand, the recipient will, to the extent permitted, give timely notice and reasonable assistance in seeking protective treatment. It will disclose only the required portion. Neither party may use the other’s name, logo, or project results in publicity without prior written consent. {==The existence of this project is not itself a marketing permission.==}{>>c14 @AC resolved: The case-study language has been removed from the sales proposal.<<}');

section('10. Data stewardship and instructions');
add('Client determines the business purposes for which Client Data is processed. Supplier will process that data only to provide the services and according to documented instructions within the agreed scope. Supplier will flag an instruction it reasonably believes creates a compliance conflict and pause the affected processing while the parties resolve it, without unnecessarily interrupting unaffected services.');
add('Supplier will not sell Client Data, use it to advertise to individuals, or use it to train a generally available model. {++Customer-specific tuning, if separately approved, must use an isolated environment and remain subject to the deletion and return obligations.++}{>>r8 @MP<<} {==Aggregated metrics must not identify Client or permit reconstruction of a person’s records.==}{>>c15 @MP: De-identification needs an actual assessment, not simply removal of a name field.<<}{>>c16 @JD re c15: The security review will document the method before any metric leaves the client environment.<<}');

section('11. Security controls and incident response');
add('Supplier will maintain the controls in Schedule C throughout the services, including role-based access, encryption, vulnerability management, and tested recovery procedures. A change may improve or replace a control if it provides materially equivalent protection. Supplier will not materially reduce the agreed protection without Client’s prior written approval. Security documentation may be supplied under reasonable confidentiality restrictions.');
add('Supplier will notify Client of a confirmed incident affecting the confidentiality, integrity, or availability of Client Data without undue delay and in any event within {~~48~>24~~}{>>r9 @JD<<}{>>r10 @MP<<} hours after confirmation. Initial notice may be incomplete, but must state known facts, immediate containment measures, and the next update time. {==Supplier must also report a credible suspected compromise that requires Client action.==}{>>c17 @MP: A narrow “confirmed only” trigger could delay protective steps.<<}{>>c18 @JD re c17: Agreed where there is actionable evidence; routine rejected scans are excluded.<<}');
add('{++The parties will preserve relevant logs and coordinate investigation so that evidence is not overwritten or unnecessarily disclosed. Client controls notifications to its customers and affected individuals, except where Supplier has a separate mandatory obligation.');
add('Supplier will provide a written root-cause summary and corrective-action plan when the investigation reasonably permits. The summary will distinguish verified facts from hypotheses and identify the owner and target date for each remaining action.++}{>>r11 @MP<<}');

section('12. Intellectual property and reuse');
add('Client retains ownership of Client Data and its pre-existing materials. On full payment of the applicable implementation fees, Supplier assigns to Client the rights it owns in the bespoke Deliverables identified as “Client-owned” in Schedule A. Supplier retains its pre-existing tools, reusable libraries, and general methods, and grants Client a perpetual, non-exclusive license to embedded Supplier materials necessary to use those Deliverables.');
add('Supplier will identify material third-party components and associated license restrictions before incorporation. It will not add a component that requires disclosure of Client’s proprietary source code without express approval. {==General know-how excludes Client’s confidential algorithms, datasets, and operational playbooks.==}{>>c19 @AC: Please confirm that the reuse carve-out does not swallow the bespoke-work assignment.<<}{>>c20 @JD re c19: Agreed; the component register will distinguish background tools from commissioned outputs.<<}');

section('13. Warranties and support');
add('For ninety days after acceptance, Supplier warrants that each Deliverable will materially conform to its agreed specification. Client will report a suspected defect with information reasonably available to reproduce it. Supplier will investigate and correct a covered defect without additional charge; if correction is not reasonably achievable, the parties will agree a practical workaround or an appropriate refund for the affected Deliverable.');
add('The warranty does not cover a defect caused solely by an unauthorized modification, unsupported integration, or use contrary to written operating instructions, but Supplier must explain that connection. Support targets in Schedule C measure response rather than guaranteed resolution. {>>c21 @LN: Delivery and support teams should use the same defect record so the handover loses no history.<<}');

section('14. Third-party claims');
add('Supplier will defend a third-party claim that an unmodified Deliverable, used as permitted, infringes that party’s intellectual property rights, and pay amounts awarded or agreed in an approved settlement. Client will give prompt notice, reasonable cooperation, and control of the defense, provided no settlement admits Client fault or imposes a non-monetary obligation on Client without its consent.');
add('If a claim is likely to restrict use, Supplier may obtain continued rights, modify the affected component without material loss of functionality, or replace it with a reasonably equivalent component. If those remedies are not commercially reasonable, Client may terminate the affected service and receive the agreed unused-fee refund. {==These remedies do not authorize deletion of Client Data or abrupt withdrawal of transition support.==}{>>c22 @AC: Coordinate the remedy with the exit protections in section 17.<<}');

section('15. Liability allocation and insurance');
add('Subject to the exceptions below, each party’s aggregate liability under this Agreement is limited to {~~fees paid in the preceding twelve months~>150% of the total fees paid or payable during the initial term~~}{>>r12 @JD<<}{>>r13 @AC<<}. Neither party is liable for indirect or consequential losses, but reasonable data-restoration costs and documented incident-response costs are treated as direct losses where caused by that party’s breach.');
add('The general cap does not limit payment obligations, fraud, deliberate misconduct, or liability that cannot lawfully be limited. A separate cap of twice the general cap applies to confidentiality, data protection, and covered intellectual-property claims. {==The parties have not yet agreed the interaction between overlapping claims and the separate cap.==}{>>c23 @JD: Commercial decision required: aggregate higher cap, rather than additive caps for one event.<<}{>>c24 @AC re c23: Pending client approval; retain the issue as open rather than accepting either interpretation.<<}');
add('Supplier will maintain professional indemnity and cyber coverage reasonably appropriate to the services and provide evidence of coverage upon request. Insurance does not replace contractual obligations or increase an agreed liability cap. Coverage amounts and renewal dates will be recorded in the execution checklist.');

section('16. Audit, records, and continuity');
add('Supplier will keep records sufficient to demonstrate material compliance with the agreed security and billing obligations. Client may review relevant assurance reports annually and request a targeted additional review following a significant incident or credible evidence of non-compliance. Reviews will protect other customers’ information and avoid unreasonable disruption. {==Independent assurance can satisfy a routine review only if its scope covers the actual service.==}{>>c25 @MP: A corporate certificate without the hosted environment in scope is insufficient.<<}');
add('Supplier will test restoration of the agreed backup set at least annually and after a material recovery-design change. The parties will rehearse escalation contacts before production launch. An event outside a party’s reasonable control excuses only the obligations directly prevented, and the affected party must give notice, mitigate the impact, and resume performance as soon as reasonably possible.');

section('17. Termination and orderly exit');
add('Either party may terminate for a material breach not cured within thirty days after written notice describing the breach. A shorter reasonable cure period may apply where delay would expose Client Data to a continuing material risk. Client may terminate for convenience on sixty days’ notice and pay for accepted work and approved non-cancellable commitments, without an unearned-profit charge.');
add('On expiry or termination, Supplier will provide the transition assistance in Schedule D, return Client Data in the agreed portable formats, and revoke unneeded access. Data will be deleted within {~~30~>45~~}{>>r14 @MP<<}{>>r15 @AC<<} days after Client confirms successful export, except for isolated backups expiring under the disclosed retention cycle or records legally required to be retained. {==Retained copies remain protected and cannot be restored to active use except for an authorized recovery or mandatory retention purpose.==}{>>c26 @MP: Please verify that the backup exception has an outer retention limit.<<}{>>c27 @JD re c26: Schedule C sets a ninety-day maximum and restricts restoration.<<}');

section('18. Notices, disputes, and general terms');
add('Formal notices will be sent to the contract contacts recorded at signature, with a copy to the project leads. The parties will escalate disputes first to contract representatives and then to an executive of each party, allowing ten Business Days at each stage. Either party may seek urgent protective relief where waiting would create material harm. The governing-law and forum provisions remain open for counsel to complete.');
add('Neither party may assign this Agreement without consent, except to a successor acquiring substantially all of the relevant business that assumes the obligations and does not materially increase the other party’s risk. Amendments require written agreement by authorized contract representatives. Invalid provisions will be narrowed only as necessary, and the remaining provisions continue in effect. {>>c28 @AC: Governing law, notice addresses, and signature authority are deliberately incomplete in this fictional draft.<<}');

const schedulesStart = nextParagraph;
section('Schedule A. Delivery and acceptance');
add('The baseline plan assumes that synthetic test data and sandbox access are available during the first week. Dates below are relative to the effective date and are planning commitments only after the dependency review. Each milestone has a named evidence package, so acceptance can be assessed against a concrete result rather than general satisfaction. {>>c29 @LN: Replace relative weeks with calendar dates after the kickoff dependency review.<<}');
table('t0', 5, 4, `| Milestone | Target | Evidence and acceptance criterion | Ownership |
| :--- | :---: | :--- | :--- |
| Discovery baseline | Week 2 | Approved workflow map, exclusions, and data dictionary | Client-owned |
| Advisory pilot | Week 6 | Forecast replay and proof that no physical controls are invoked | Client-owned |
| Production handover | Week 10 | Runbook, recovery test, training, and resolved critical defects | Client-owned |
| {++Stabilization review++}{>>r16 @LN<<} | {++Week 12++}{>>r17 @LN<<} | {++Two consecutive weekly reviews without a critical defect++}{>>r18 @LN<<} | {++Client-owned report++}{>>r19 @LN<<} |`);
add('The acceptance sequence is:');
addList('1. Supplier submits the readiness notice and evidence package.\n2. Client validates the agreed scenarios in a representative environment.\n   1. Compare forecast output with the approved reference dataset.\n   2. Confirm role restrictions and advisory-only operation.\n   3. Record exceptions with reproducible steps and expected results.\n3. The project leads agree the defect disposition and correction dates.\n4. The authorized Client reviewer records acceptance or a reasoned rejection.');
add('A pass requires all critical scenarios to succeed and no unresolved defect that prevents ordinary use. A difference attributable to an expressly approved source-data limitation will be recorded separately. {==The dataset and numerical tolerances must be frozen before formal testing begins.==}{>>c30 @LN: Avoid moving the acceptance threshold after seeing the results.<<}');

section('Schedule B. Fees and resources');
add('All amounts are fictional and stated in USD, excluding applicable transaction taxes. Travel requires prior written approval of the purpose and budget; no travel is currently assumed. Routine remote meetings, development tools, and ordinary administrative overhead are included in the fees. No fee change is effective solely because an individual rate changes.');
table('t1', 6, 4, `| Charge | Trigger | Amount (USD) | Invoice reference |
| :--- | :--- | ---: | :--- |
| Discovery and design | Acceptance of discovery baseline | 24,000 | M1 |
| Configuration and pilot | Acceptance of advisory pilot | 48,000 | M2 |
| Production handover | Acceptance of handover package | 36,000 | M3 |
| {--Optional reporting bundle--}{>>r20 @JD<<} | {--Automatic at launch--}{>>r21 @JD<<} | {--12,000--}{>>r22 @JD<<} | {--OPT-1--}{>>r23 @JD<<} |
| Monthly support | Monthly in arrears after handover | 3,500 | SUP |`);
add('The implementation total is **USD 108,000**, excluding the deleted optional bundle and separately invoiced support. Additional approved work uses the resource rates below; a rate is not an authorization to incur time. {==Each time-and-materials change requires its own not-to-exceed amount.==}{>>c31 @AC: The deleted optional row must not be included in accepted-view totals.<<}{>>c32 @JD re c31: Confirmed; the commercial baseline is USD 108,000.<<}');
table('t2', 4, 3, `| Resource | Hourly rate (USD) | Approval condition |
| :--- | ---: | :--- |
| Solution architect | 190 | Named change request and capped estimate |
| Data engineer | 155 | Named change request and capped estimate |
| Security specialist | 205 | Named change request; incident duties remain included |`);

section('Schedule C. Security and processing');
add('Processing is limited to business contact details, pseudonymous staff identifiers, warehouse schedules, equipment status, and project audit records. Client will exclude payment-card details, government identifiers, health records, and children’s information from the supplied datasets. The permitted purpose is implementation, operation, support, and recovery of the planning service.[^data]');
table('t3', 6, 3, `| Control area | Agreed baseline | Evidence |
| :--- | :--- | :--- |
| Access | Individual accounts, least privilege, and multi-factor authentication | Quarterly access review |
| Encryption | Encrypted transit and encrypted managed storage | Configuration review |
| Location | Production and backups in the agreed European hosting region | Hosting inventory |
| Recovery | Daily backup; ninety-day maximum isolated-backup retention | Annual restoration report |
| Monitoring | Centralized security logs with restricted access | Alert triage and retention record |`);
add('Supplier’s incident contact is security@meridian-loom.example; Client’s coordinating contact is response@north-quay.example. These addresses are fictional placeholders and must not be used for a real notification. {==A critical incident receives a human response within one hour, at any time.==}{>>c33 @MP: Confirm the on-call rota rather than relying on an unmonitored shared mailbox.<<}{>>c34 @LN re c33: The launch checklist includes a live escalation exercise.<<}');
add('A high-priority service fault receives an initial response within four support hours; routine requests receive a response within two Business Days. Support hours are 09:00–17:00 UTC on Business Days. Response means a qualified person has acknowledged the issue and begun triage. Recovery objectives will be validated in the rehearsal rather than represented as guaranteed outcomes.[^recovery]');
add('Client may request a copy of the current subprocessor register and relevant assurance summary through the designated project workspace. The register identifies each processor’s role, location, access scope, and review date. The [transition checklist](#schedule-d-transition-checklist) remains the controlling operational list when access and data are being removed.');

section('Schedule D. Transition checklist');
add('The project leads will begin exit planning at least thirty days before a known expiry date, or promptly after an earlier termination notice. Transition assistance is limited to reasonable knowledge transfer, export verification, and orderly access removal. Any additional migration engineering requires a scoped estimate and approval. {>>c35 @LN resolved: The checklist now identifies evidence for completion rather than merely a responsible team.<<}');
addList('- [x] Agree CSV and JSON export schemas using a synthetic example.\n- [x] Record ownership of the configuration and operating runbook.\n- [ ] Confirm the recipient environment and export encryption method.\n  - [ ] Client validates record counts and a representative sample.\n  - [ ] Supplier records export checksums and the handover date.\n- [ ] Revoke Supplier access after Client approves the cutover.\n- [ ] Deliver deletion confirmation, including the backup-expiry date.\n- [ ] Close remaining incident and defect records with named owners.');
add('{++Supplier will preserve access to the read-only export for ten Business Days after delivery unless Client requests earlier removal. This limited verification window does not extend the service subscription or authorize new processing.++}{>>r24 @LN<<}');
add('A transition is complete when Client confirms that the export can be opened and reconciled, the agreed knowledge transfer has occurred, active access has been revoked, and remaining retention exceptions are documented. {==A deletion certificate must identify its scope and any excluded backup copies.==}{>>c36 @MP: Please attach the retention schedule to the final certificate so that “deleted” is not misleading.<<}');

section('Execution placeholders');
add('**Client authorized signatory:** ____________________<br>**Supplier authorized signatory:** ____________________<br>**Dates:** ____________________<br>**Governing law and forum:** To be agreed.');
add('No signature, approval, or legal commitment is created by viewing or editing this demonstration. Open review discussions remain visible to illustrate negotiation state. {>>c37 @AC resolved: Final reminder retained for anyone copying the sample outside the demo.<<}');
const schedulesEnd = nextParagraph - 1;

blocks.push('<!-- footnotes.p0 -->\n[^data]: This fictional dataset description is a drafting assumption, not a determination of legal roles or permission to supply real personal information. {++Any expanded category requires a documented scope and security review before transfer.++}{>>footnotes.r7 @MP<<}');
blocks.push('<!-- footnotes.p1 -->\n[^recovery]: The planned recovery-point objective is twenty-four hours and the recovery-time objective is eight hours for the covered service. The rehearsal must state its dataset, dependency assumptions, and measured results.');

const frontmatter = `---
title: Fictional Harbor Operations Services Agreement
author: North Quay and Meridian Loom review team
date: 2026-10-13T09:00:00Z
view: tracked
authors:
  document_owner: Fictional Contract Working Group
  AC: Avery Chen # Client counsel, 2026-10-13T09:00:00Z
  JD: Jordan Diaz # Supplier counsel, 2026-10-13T09:15:00Z
  MP: Maya Patel # Security and privacy reviewer, 2026-10-13T09:30:00Z
  LN: Luca Navarro # Delivery lead, 2026-10-13T09:45:00Z
page: Letter portrait, margins 0.85in, header/footer 0.4in
styles:
  Normal: Aptos 11pt, after 8pt, line 1.12, left
  "#": Heading1, Aptos bold 20pt, before 14pt, after 10pt, keep-next
  "##": Heading2, Aptos bold 14pt, before 12pt, after 6pt, keep-next
  Quote: Aptos italic 10pt, after 8pt, left
headers:
  first: none
  default: {id: header1, text: "NORTH QUAY × MERIDIAN LOOM | FICTIONAL DRAFT", right}
footers:
  default: {id: footer1, text: "Review copy · Page {PAGE} of {NUMPAGES}"}
sections:
  1: {p0-p${schedulesStart - 1}, page: Letter portrait}
  2: {p${schedulesStart}-p${schedulesEnd}, page: A4 landscape, headers: {first: none}}
---`;

export const longSample = `${frontmatter}\n\n${blocks.join('\n\n')}\n`;
export const sampleStats = Object.freeze({
  title: 'Complex services agreement',
  bodyParagraphs: nextParagraph,
  tables: 4,
  namedAuthors: 4,
  comments: [...longSample.matchAll(/\{>>c\d+\s/g)].length,
  rootComments: [...longSample.matchAll(/\{>>c\d+\s+@\w+(?:\s+resolved)?:/g)].length,
  fictional: true,
});
