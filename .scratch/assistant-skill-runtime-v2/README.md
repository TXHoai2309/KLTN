# Assistant Skill Runtime V2 — tracer-bullet tickets

Source plan: `docs/implementation/assistant-skill-runtime-v2-plan.md`

These tickets are ordered by blocking edges, not by technical layer. Each should fit a fresh implementation session and end with demonstrable behavior.

| # | Ticket | Blocked by |
| --- | --- | --- |
| 01 | Feature-gated `travel-planning` V2 can run one conversational turn | — |
| 02 | Minimum useful brief creates a preliminary proposal after duration + transport | 01 |
| 03 | Progressive refinement updates the proposal without returning to a questionnaire | 02 |
| 04 | Proposal replanning preserves unaffected scope and revalidates | 02 |
| 05 | Grounded Q&A interruption preserves the active planning session | 01 |
| 06 | In-trip skill reuses the V2 runtime without weakening US-35/36/37 invariants | 01, 04 |
| 07 | V2 evaluation and rollout gate prove parity/safety before retiring V1 | 02, 03, 04, 05, 06 |

Implementation priority for “run first”: complete 01 → 02 before starting the other branches.
