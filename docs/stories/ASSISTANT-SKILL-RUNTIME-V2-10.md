# ASSISTANT-SKILL-RUNTIME-V2-10 - Conversation polish and final evaluation

Spec: `.scratch/assistant-skill-runtime-v2/SPEC-V2-10.md`. Decisions: ADR-34. Terms: GLOSSARY (Caveat policy and related).

## Delivered
- Safety gates split from style gates; one caveat sentence on create/change turns, none on unrelated read-only turns.
- Deterministic templates (edit outcomes, QA wrappers, failures, saved-trip states) rewritten naturally; number checks by unit (`reply-quantities.ts`).
- `composerOutcomes` (accepted/fallback per goal) in turn metrics; `eval-metrics.ts` scoring; runner `apps/web/scripts/assistant-v2-10-eval.ts`; corpus `docs/implementation/assistant-v2-final-evaluation-corpus.json`.
- Live fixes: one corrective retry when the first selection over-packs a day; advice without a proposal does not re-ask known facts.

## Evidence
| Group | Result |
|---|---|
| 11 live V2 scenarios (Dev DB, disposable user, deleted after) | 0 hard failures, 0 caveat violations, 0 mechanical phrases; S10 real save SUCCESS |
| 4 paired V1 runs (S11-S14) | V1 asked 5-7 questions with redundant re-asks in every run; V2 asked 0-2. V2 better in all 4 |
| QA / homestay comparisons | not comparable with V1 |
| Controlled scenarios | covered by existing session/unit tests, not separate runs |
| Composer fallback rate (dev server log, final live batch) | 4/24 = 16.7% (<=20%); PRESENT/REFINE 0/14, GUIDANCE 1/8, ASK_*/ACK 3/4 (small sample); log rows matched to the batch by the last 39 turns |
| Full suite | 63 failures in 10 files, identical to the pre-existing baseline |

## Open
- Verdict: READY_TO_FREEZE_V2 (all thresholds measured and met). ASK_* and no-change acknowledgements fall back often; consider making them deterministic in a later story.
- 4 of 6 V1 pairs run; no product-owner tie-break or manual rubric excerpts recorded.
- Dialogue-memory decision (guidance/QA replies in recent memory): no live problem observed, left unchanged.
- Review notes (judgement calls): duplicated normalisation/caveat regexes between `eval-metrics.ts` and `planning-response.ts`; the removed per-implication topic guard for REFINE replies is intentional (ADR-34).
