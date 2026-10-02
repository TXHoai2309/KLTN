# Development workflow

## Branch roles

- Each developer should work on their own personal/feature branch. **`TXH`** is the personal branch of Tô Xuân Hoài; it is not a shared branch and other developers are not expected to work directly on it.
- **`dev`** — shared integration and testing branch.
- **`master`** — production/stable branch.

The current checkout was observed on `TXH` when this handoff was written. These names describe team intent; they do not cause or authorize an automatic merge.

## Recommended work sequence

1. Read the project rules and current story. Confirm the story is READY and identify unresolved decisions.
2. Work on the appropriate personal/feature branch. Keep the change scoped to its acceptance criteria.
3. Run appropriate typecheck, build, tests/smoke checks, migration checks, and `git diff --check`.
4. Record evidence and known gaps in the story and append a progress entry.
5. When requested by the developer, commit/push the personal branch and use its Preview deployment for review.
6. Promote a reviewed change to `dev` manually, with explicit approval; test the integrated state.
7. Promote `master` to Production manually, with explicit approval from the responsible owner.

Branch promotion is always manual and requires explicit approval. An assistant must not merge or push without an explicit user request.
