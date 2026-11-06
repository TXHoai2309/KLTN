# KLTN documentation

This folder is the developer and AI-agent handoff for KLTN. It separates product requirements, the architecture currently in the repository, design references, implementation contracts, and session progress. Source documents are references for requirements; they do not replace the repository rules in `/AGENTS.md`.

## Reading paths

**New developer**

`/AGENTS.md` → this page → [source baselines](source-baselines.md) → [product contract](product/product-spec.md) → [technical architecture](architecture/technical-architecture.md) → [current story](stories/README.md) → [AI progress](ai-progress.md)

**AI agent starting a task**

Follow the required order in `/AGENTS.md`: include [user flows](flow/user-flow.md), the active story, and the relevant implementation guide. Do not reread every document for a narrowly scoped task, but do verify the current story and its source references.

## Source-of-truth hierarchy

The current task instruction defines the scope, method, and goal of that task. It does not automatically override locked product/business invariants. Only an explicitly approved requirement or project decision changes the baseline.

Within that boundary:

1. The Product Document is the product/business source of truth.
2. The System Specification details behavior and edge cases.
3. The current repository is the implementation truth.
4. Accepted decisions in [decisions](decisions.md) are implementation decisions.
5. The old Architecture document is historical reference when it conflicts with current sources.
6. Figma is the UI/interaction baseline only; it cannot override product rules.

When sources conflict and this hierarchy does not resolve the conflict, record the question and get a decision before implementing it.

## Start and finish a story

Start from a story contract under `docs/stories/`. Use [US-TEMPLATE.md](stories/US-TEMPLATE.md), link product/system sources, and confirm scope, rules, authorization, ownership, dependencies, acceptance criteria, and blockers before marking it `READY`. The backlog is managed externally until story files are added here.

At handoff, record implementation changes and evidence in the story and append a dated entry to [ai-progress.md](ai-progress.md). Report checks run, migration state, smoke/deployment result, known gaps, and the next step. Do not rewrite prior progress entries except to correct a documented error.

## Document map

| File | Purpose |
| --- | --- |
| [source-baselines.md](source-baselines.md) | Resolves which source controls product, implementation, historical architecture, and UI. |
| [decisions.md](decisions.md) | Lightweight record of accepted architecture and workflow decisions. |
| [roadmap.md](roadmap.md) | Verified foundation status and next backlog handoff, without inventing stories. |
| [ai-progress.md](ai-progress.md) | Append-only handoff history between developers and AI sessions. |
| [changelog.md](changelog.md) | Significant project/documentation baselines, not a commit log. |
| [product/product-spec.md](product/product-spec.md) | Condensed developer-facing product contract. |
| [architecture/technical-architecture.md](architecture/technical-architecture.md) | Current repository architecture and implemented-versus-planned boundary. |
| [flow/user-flow.md](flow/user-flow.md) | Requirement-level flows for MVP capabilities. |
| [design/ui-baseline.md](design/ui-baseline.md) | UI source precedence, responsive requirements, and interaction states. |
| [implementation/EN-01-foundation-acceptance.md](implementation/EN-01-foundation-acceptance.md) | Foundation scope, repository evidence, and assumptions for future stories. |
| [implementation/development-workflow.md](implementation/development-workflow.md) | TXH, dev, and master branch roles and review flow. |
| [implementation/environment-deployment.md](implementation/environment-deployment.md) | Environment files, database mapping, Vercel, and migration workflow. |
| [implementation/trip-companions-user-stories-tasks.md](implementation/trip-companions-user-stories-tasks.md) | Vietnamese User Story and BE/FE/test task summary for the approved travel-companions extension. |
| [implementation/trip-origin-design.md](implementation/trip-origin-design.md) | Approved origin/return decisions Q1–Q22; planning only, not implementation authorization. |
| [implementation/trip-origin-plan.md](implementation/trip-origin-plan.md) | Consolidated origin/return plan, nine proposed work items, dependencies and acceptance groups; awaiting review. |
| [product/trip-origin-spec.md](product/trip-origin-spec.md) | Consolidated feature spec from Q1–Q22: user stories, implementation/testing decisions and scope; documentation only. |
| [Origin/return tickets](../.scratch/trip-origin/README.md) | Ten local vertical slices; backend 01–09 and BE integration receipts available, FE/browser/live acceptance and shared migration deployment pending. |
| [Origin backend prompt](../.scratch/trip-origin/prompts/backend.md), [frontend prompt](../.scratch/trip-origin/prompts/frontend.md) | Separate BE/FE ownership and contract handoffs within the ten tickets; prompts are prepared, not executed. |
| [stories/TRIP-ORIGIN-ROUND-TRIP.md](stories/TRIP-ORIGIN-ROUND-TRIP.md) | Origin/return in progress; backend routing/rest, Save/read/privacy, Assistant ORIGIN and saved edit/legacy opt-in implemented locally; FE/vertical acceptance pending. |
| [stories/README.md](stories/README.md) | Story lifecycle and READY criteria. |
| [stories/US-TEMPLATE.md](stories/US-TEMPLATE.md) | Reusable implementation contract for future stories. |
| [templates/decision-template.md](templates/decision-template.md) | Format for adding an architecture decision. |
| [templates/ai-progress-entry-template.md](templates/ai-progress-entry-template.md) | Format for appending a task handoff entry. |
