# Cột cờ Quốc gia Lũng Cú — owner review package

Updated 2026-10-12 on TXH. PREPARATION ONLY; US-21/US-22 not ACCEPTED.
Development migration previously verified 16/16; no migration or Neon operation
performed for this preparation. Existing US-21 synthetic fixture must remain.

## Prepared artifacts

- [Destination create payload](lung-cu-destination.payload.json): strict existing
  DestinationInput shape; real name, verified map landmark point, nullable visit
  durations and seven UNKNOWN opening-day entries. No visibility field: existing
  create defaults HIDDEN, separate Admin visibility action is required.
- [Original authored RAG summary](lung-cu-authored-rag.txt): UTF-8 TXT, original
  phrasing with per-claim provenance, confirmed F1/F2 and explicitly unresolved
  U1–U4. It is a KLTN AI-assisted draft, not a publisher's original article.
- [Metadata / rights / map provenance](lung-cu-authored-rag.metadata.json): sidecar,
  not a direct finalize API payload. Only proposedFinalizeMetadata has the existing
  supported upload-finalize fields. No invented sourceUrl for the unpublished
  authored summary; source URLs are claim provenance, not a publisher impersonation.

No original newspaper/government article is copied into the RAG body. Adding the
canonical name to original authored sentences is explicit authorship; do not mutate
third-party originals or claim the resulting prose was authored by their publishers.
TXT public citations use the authored title/source alias, with no fabricated page
or section locator. Underlying URLs support provenance review; they are not promises
of individual third-party document citations from this one uploaded summary.

## Rechecked evidence and factual disposition

| Item | Finding | Pilot decision |
| --- | --- | --- |
| Mountain | S1 and S2 both place the destination on Núi Rồng. | Keep F1 with both provenance URLs. |
| Elevation | S1 uses approximately 1,470m; S2 uses nearly 1,500m. These approximations may reflect rounding or reference differences; neither proves an exact elevation. | U1 UNKNOWN; no forced numeric answer, no invented survey/datum. |
| Tower height | Site elevation and structure height are different quantities. Google Maps has a rounded building-height description, not accepted survey evidence. | U2 UNKNOWN; do not mix quantities. |
| Northernmost position | S1 distinguishes the landmark from the geographic northernmost point by an approximate distance. | Keep only F2 distinction; exact measured distance U3 UNKNOWN. |
| Coordinates | Map landmark pin verified separately below. | Destination location metadata only; not extreme-border coordinates or a measured entrance. |
| Hours/prices/durations/accessibility | Not established by the reviewed official corpus. Maps listings/reviews are not adopted as current operational evidence. | U4 UNKNOWN; seven UNKNOWN days and null durations. |
| Administration | Current government publisher and Maps place address refer to Lũng Cú, Tuyên Quang; S2's Đồng Văn/Hà Giang labels describe 2024 context. | Proposed area taxonomy lũng cú; no stale district/province assertion in description. |

### Map pin verification

Google Maps name search resolved **Cột Cờ Lũng Cú**, feature
0x36cbe1f68a0c33c7:0x302c4d0acbe9911f. The actual place URL includes
!3d23.3634061!4d105.3163001; these landmark fields, not viewport center,
provide latitude **23.3634061**, longitude **105.3163001**.
[Open landmark search](https://www.google.com/maps/search/?api=1&query=C%E1%BB%99t+c%E1%BB%9D+L%C5%A9ng+C%C3%BA).

[Mapcarta / OSM way 504649258](https://mapcarta.com/W504649258) reports
23.36346, 105.31633 and identifies a tower/tourist attraction next to Dragon
Mountain. Separation is about 7m, consistent at landmark scale. This cross-check
is a map-derived point, not a geodetic accuracy certificate. Direct OSM browser
access failed; Mapcarta interactive view was challenged, so its retrieved feature
page was used for cross-check and Google Maps supplied the live visible map pin.
Map source usage/terms and final pin suitability remain owner review gates.
No coordinates were inferred from news descriptions.

## Source / rights register

S1: [UBND xã Lũng Cú article](https://lungcu.tuyenquang.gov.vn/vi/tin-bai/thieng-lieng-le-ket-nap-doan-vien-duoi-co-to-quoc-tai-cot-co-quoc-gia-lung-cu?id=219248&type=NEWS), published 26/03/2026 20:32,
Ngọc Đức attribution; accessed 2026-10-12. Publisher footer identifies UBND xã
Lũng Cú and requires source attribution when republishing. This condition does
not establish explicit embedding/provider-sharing approval.

S2: [Báo Hà Giang article](https://baohagiang.vn/thoi-su-chinh-tri/202402/doan-cong-tac-bo-tong-tham-muu-quan-doi-nhan-dan-viet-nam-du-le-thuong-co-va-tang-qua-tai-dong-van-106205f/), published 26/02/2024 23:04,
Kim Tiến attribution; accessed 2026-10-12. No explicit reuse/provider-sharing
license was verified on the inspected page.

AUTHORED_SUMMARY is original wording, not a claim that underlying source rights,
map terms or provider sharing were cleared. **RIGHTS_REVIEW_PENDING**, storage/
public use/indexing/provider sharing **NOT_APPROVED**. Owner must document the
permitted scope, rights basis/evidence, reviewer/date and OpenAI evidence-sharing
scope. Owner execution consent and third-party usage rights are separate checks.
Do not mark APPROVED or extend allowlist until those checks pass.

## Five QA cases — authored-summary corpus

| # | Question / mode | Expected | Evidence / citation |
| --- | --- | --- | --- |
| 1 | GENERAL: Cột cờ Quốc gia Lũng Cú nằm trên ngọn núi nào? | ANSWERED: Núi Rồng. | F1; citation to approved authored summary, with S1/S2 provenance retained. |
| 2 | New DESTINATION: Cột cờ Quốc gia Lũng Cú nằm trên ngọn núi nào? | Same fact; context matches destination reference. | F1; current publication/allowlisted authored document. |
| 3 | Follow-up #2: Cột cờ Quốc gia Lũng Cú có đồng nhất với điểm cực Bắc địa lý không? | ANSWERED: không đồng nhất; no invented distance. Same conversation/context. | F2; S1 provenance. |
| 4 | Same context: Độ cao chính xác của Cột cờ Quốc gia Lũng Cú so với mực nước biển là bao nhiêu? | No confirmed numeric answer. INSUFFICIENT_SOURCE under this narrow corpus; UNKNOWN must not become a number. | U1 is limitation metadata, not affirmative elevation evidence. |
| 5 | Same context: Giá vé hiện tại và giờ mở cửa hôm nay của Cột cờ Quốc gia Lũng Cú là gì? | INSUFFICIENT_SOURCE; no invented operational data/citations. | U4 / missing factual evidence. |

These expected outcomes still need owner live validation. Evidence containing
UNKNOWN must not be treated as an established travel fact; report unexpected
PARTIAL/CLARIFICATION output rather than silently accepting it. Each question
uses the full canonical name and authored factual sentences do too, fitting the
existing conservative exact-name filter without changing retrieval/generation.
Replay #3 with identical key/payload must add zero provider calls. Check source
isolation via existing mocks; switch/clear creates a new conversation and passive
browsing does not change context. No fake provider calls performed in preparation.

## Existing ingestion workflow — execution remains separately gated

1. Owner reviews payload, map point and proposed area/category taxonomy; accepts
   unknown schedules/null durations. Admin create via existing UI/API -> HIDDEN;
   review and separate visibility action -> VISIBLE. No direct SQL.
2. Culture management and destination relations exist but are unnecessary here;
   do not create an unsupported Culture narrative to unblock this pilot.
3. Owner clears authored-content/underlying-rights/public-use/provider scope.
   Upload only the reviewed UTF-8 TXT through /admin/rag. Finalize its actual title,
   KLTN draft authorship/topic/locality; do not pretend it is a government original.
4. UPLOADED -> START_REVIEW -> REVIEWING -> human/Admin APPROVE -> APPROVED.
5. Separate approval covers live embedding/indexing budget. Existing INDEX request
   admits a job and may run it immediately: clicking INDEX already crosses the
   provider-call gate. Worker checks complete generations before atomically writing
   publication and INDEXED; admission SUCCESS is not completion.
6. Read-only verify INDEXED/READY/current publication, totals/hashes/model/vector
   dimensions, safe citation metadata and eligible F1/F2 sentences. Keep sidecar
   with the rights and file SHA-256 evidence; do not invent original-file hashes.
7. Owner approves adding actual new document ID to QA_PUBLIC_SOURCE_IDS, retaining
   the US-21 fixture ID. No automatic publication-to-allowlist integration exists.
8. Owner separately approves live questions/budget; preserve current model and
   runtime/abuse gates. Record outcomes, Guest/auth stability, citations and replay.

## Owner approval checklist

- [ ] Pin matches the public flag-tower landmark; point is suitable for Destination Detail/map.
- [ ] Destination name/description/category/area, UNKNOWN schedules and null durations accepted.
- [ ] Authored-summary content, provenance and conflicting-number exclusions reviewed.
- [ ] Underlying-source/map usage basis and public display/citation permission documented.
- [ ] OpenAI evidence sharing and indexing budgets explicitly authorized.
- [ ] Development destination create/show and RAG upload/review/index operations authorized.
- [ ] Actual source ID allowlist update approved; keep synthetic US-21 fixture.
- [ ] Separate live acceptance run approved; no ACCEPTED claim until evidence is complete.

## Context UI correction and verification

AssistantChat's controller remains the sole active context authority. Shell-local
presentation now receives its resolved label and renders that same destination in
sidebar. Switch/clear updates both displays; no window/global storage, server
context mutation or provider behavior is added. Unmounted chat clears its shell
label; unresolved context initially says it is being verified, not a false GENERAL.
Context errors display unavailable, with existing sending/context-change guards.
Mobile wraps long names using existing tokens/layout. Browser and focused checks
are recorded in the current progress entry. Previous 21 global static audit findings
remain outside this focused fix, not a full compliance claim.
