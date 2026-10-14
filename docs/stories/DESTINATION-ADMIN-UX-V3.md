# Destination Admin UX V3 — Simplified MVP

Status: IMPLEMENTED — QA PARTIAL / OWNER LOCAL ACCEPTANCE PENDING (2026-10-14).

Authority: owner-approved implementation request in this chat and `D:/Download/KLTN_Destination_Admin_UX_V3_Spec_for_Codex.md`. This explicitly updates the Destination part of the AF-1–AF-6 contract. Product authorization, independent durations, idempotency and hidden-content invariants remain.

Scope: shared Create/Edit/preview; Destination-only six-category taxonomy; one prose input with deterministic short summary; server-default area; administrative address through AddressKit; explicit Maps coordinates without Places; patch writes; simplified sources; Culture presentation flag; Planner region exclusions. No schema migration, provider billing, Production access, RAG ingestion, persisted Trip delivery, commit/push/deploy.

Acceptance evidence and remaining gates: [implementation report](../implementation/destination-admin-ux-v3-report.md). Offline service/browser preservation is proven with synthetic fixtures; real PostgreSQL acceptance is NOT PROVEN because Docker Desktop could not start. Main localhost:3010 anonymous authorization, Culture redirect and existing Đồng Văn public detail were checked. Owner must still review authenticated Create/Edit locally; no shared Development test writes were performed.

The existing Development region ID is verified by a READ ONLY query. Registry coverage is environment-specific; an unregistered environment fails closed for new Planner candidates. Additional geographic regions require explicit ID review, never a name/category heuristic. VISIBLE is independent from waypoint eligibility.

2026-10-14 follow-up: optional image management is implemented by
[Destination Cloudinary V3.2](DESTINATION-CLOUDINARY-V3-2.md). The current form has
five sections. V3's nine original disposable PostgreSQL regression tests now pass
alongside four image integration tests; this supersedes the earlier Docker-blocked
PG evidence for those tests only. Owner live Admin/Cloudinary acceptance is pending.
