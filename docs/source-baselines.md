# Source baselines and precedence

This document resolves conflicts between the product requirements, historical architecture material, the repository, and design references. Use it before turning a source statement into implementation work.

## Business truth

The supplied **Product document.docx** controls MVP scope, users/roles, business rules, non-functional requirements, RQ1/RQ2, and acceptance intent. The supplied **System Specification.docx** derives testable behavior, inputs/processing/outputs, error cases, ownership, validator behavior, and write semantics from the Product Document. A system detail cannot silently expand the product scope.

A current task instruction sets the scope, method, and goal of that task; it does not automatically override locked product/business invariants. Only an explicitly approved requirement or project decision changes the baseline.

For implementation work, cite the relevant document sections in the story. The condensed [product contract](product/product-spec.md) is a navigation aid, not a replacement for either source document. The repository is implementation truth; accepted decisions in [decisions.md](decisions.md) record implementation decisions. The old Architecture document is historical reference when it conflicts, and Figma is the UI/interaction baseline only.

## Implementation truth

Current Assistant/Trip snapshot, 2026-10-27: the repository contains Q&A, natural-language requirements, Planner/Validator, Trip Save/Read/Edit and Favorites beyond the older foundation inventory below. Conversational trip planning is implemented under its [current story](stories/ASSISTANT-CONVERSATIONAL-PLANNING.md), with separate [verification and acceptance limits](implementation/assistant-trip-planning-verification.md). Earlier future-work inventory is historical evidence, not the current delivery status.

The checked-out repository controls what is implemented. Accepted choices are summarized in [decisions.md](decisions.md), but a technology choice does not mean its product integration already exists.

The repository currently contains a Next.js App Router application, Better Auth, Prisma/Neon, shared API/error and idempotency helpers, and `system`, `auth`, `account`, `destination`, `culture`, and `map` modules. Destination/Culture Admin management, public Destination detail, Home, public Explore summaries and shared maps are implemented. Trip/Favorite, RAG, Validator, and OpenAI/Google Routes service implementations remain future work. Auth, idempotency, Destination, and Culture tables are modeled; PostGIS/pgvector extensions are enabled, but no domain spatial/vector model was found in this snapshot.

Therefore, product flows in the Product Document and System Specification are requirements for future stories unless a repository route/module demonstrates otherwise. Do not describe a planned feature as delivered.

The same-day owner-approved [chat-first follow-up](stories/ASSISTANT-CHAT-FIRST-PLANNING.md) supersedes only the Assistant's automatic needs form/create-button interaction in the original nine-ticket design. Q1–Q7 approve conversational needs review/confirmation, proactive point options and explicit edit/save semantics. Existing implemented cards are historical UI evidence; the newer decisions define the requested interaction, with [verification limits](implementation/assistant-chat-first-planning-verification.md) recorded separately.

## Historical architecture reference

The supplied **Architecture (1).docx** is historical context. It describes a NestJS backend and leaves deployment TBD. Those parts conflict with the current implementation and accepted project direction:

| Historical document | Current direction and repository evidence |
| --- | --- |
| NestJS backend; frontend calls a separate NestJS API | Next.js full-stack App Router. API delivery uses Next.js Route Handlers in `apps/web/src/app/api/`. No NestJS application/package is present. |
| Deployment platform TBD | `vercel.json` configures the `apps/web` Next.js service and the app has Vercel deployment scripts. |
| Modular backend boundary | Retained as a Modular Monolith principle: Route Handlers are delivery adapters; business rules belong in modules/services. |
| AI separate from Validator; PostGIS for spatial queries; pgvector for RAG; Google Routes for routing | The responsibility boundary remains. The Google provider choice is historical for US-28/US-29B/US-30; the owner-selected MapLibre/Stadia decisions are recorded in ADR-17 and ADR-18. |

Do not reintroduce NestJS to make current implementation match the historical document.

## UI and interaction baseline

The supplied file `KLTN – Trợ lý AI Du lịch Hà Giang – EDU (1).fig` is intended as the UI/interaction baseline. This environment could not inspect its local `.fig` contents. The design baseline therefore remains **“Figma must be consulted separately”** before implementing UI details. Do not infer screen layouts or interactions from the filename or from product requirements.

Figma may define layout, navigation, screen flow, components, and responsive intent. It cannot override product business rules, authorization, validator outcomes, or acceptance criteria.

## Conflict handling

Use the current task instruction to determine task scope, method, and goal, subject to the locked business baseline above. The Product Document remains the product/business source of truth; the System Specification details behavior; the repository is implementation truth; accepted decisions are implementation decisions; the old Architecture document is historical when it conflicts; and Figma controls UI/interaction only. If these sources do not resolve a conflict, document an open question in the story and ask for a decision rather than choosing silently.

## Assistant dialogue approval — 2026-10-27

The owner approved Q1–Q5 in `docs/implementation/assistant-dialogue-naturalness-design.md`, selecting Luna/high for all planning AI and a visible Guest login navigation. This task refines date interpretation, grounded language and continuation UX. Guest still uses public QA; personal planning requires Traveler/Admin, and official Save retains authoritative validation/idempotency. No locked permission or validation invariant is replaced. Implementation/verification is recorded in the corresponding story and report.
