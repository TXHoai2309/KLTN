# KLTN documentation

This folder is the developer and AI-agent handoff for KLTN. It separates product requirements, the architecture currently in the repository, design references, implementation contracts, and session progress. Source documents are references for requirements; they do not replace the repository rules in `/AGENTS.md`.

## Reading paths

**New developer**

`/AGENTS.md` → this page → [source baselines](source-baselines.md) → [product contract](product/product-spec.md) → [technical architecture](architecture/technical-architecture.md) → [current story](stories/README.md) → [AI progress](ai-progress.md)

**AI agent starting a task**

Follow the required order in `/AGENTS.md`: include [user flows](flow/user-flow.md), the active story, and the relevant implementation guide. Do not reread every document for a narrowly scoped task, but do verify the current story and its source references.

## Source-of-truth hierarchy

1. The user's current task instructions and explicitly approved decisions.
2. Product Document for product scope, roles, rules, and acceptance intent.
3. System Specification for testable behavior and edge cases.
4. The current repository for what is actually implemented.
5. Accepted decisions in [decisions](decisions.md) for implementation choices already adopted.
6. The old Architecture document as historical context only.
7. Figma for UI and interaction only; it cannot override product rules.

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
| [stories/README.md](stories/README.md) | Story lifecycle and READY criteria. |
| [stories/US-TEMPLATE.md](stories/US-TEMPLATE.md) | Reusable implementation contract for future stories. |
| [templates/decision-template.md](templates/decision-template.md) | Format for adding an architecture decision. |
| [templates/ai-progress-entry-template.md](templates/ai-progress-entry-template.md) | Format for appending a task handoff entry. |
