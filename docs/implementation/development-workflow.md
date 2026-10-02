# Development workflow

## Branch roles

- **`TXH`** — personal/feature development branch for Tô Xuân Hoài.
- **`dev`** — shared integration and testing branch.
- **`master`** — production/stable branch.

The current checkout was observed on `TXH` when this handoff was written. These names describe team intent; they do not cause or authorize an automatic merge.

## Recommended work sequence

1. Read the project rules and current story. Confirm the story is READY and identify unresolved decisions.
2. Work on the appropriate personal/feature branch. Keep the change scoped to its acceptance criteria.
3. Run appropriate typecheck, build, tests/smoke checks, migration checks, and `git diff --check`.
4. Record evidence and known gaps in the story and append a progress entry.
5. When requested by the developer, commit/push the personal branch and use its Preview deployment for review.
6. Merge/promote to `dev` when the team chooses; test the integrated state.
7. Promote `master` to Production only after the responsible owner approves release.

Branch promotion is deliberate. An assistant must not merge or push without an explicit user request.
