# US-40 external-service failure handling plan

1. Audit every OpenAI and routing boundary, preserving each module's existing budget and provider.
2. Add failing tests for uncooperative response bodies, total retry budget, request cancellation, routing cancellation, error-state copy and service isolation.
3. Fix only the uncovered boundaries: cancel response-body reads, share one retry deadline, forward routing abort signals and retain retryable UI state.
4. Keep routing failures as `INSUFFICIENT_DATA`, keep business-data insufficiency separate and prove public/Trip reads do not call OpenAI.
5. Run targeted tests, full tests, typecheck, production build, UI static audit and whitespace checks; document browser/live-provider limits.

No provider, schema, migration, dependency, auth, database data, commit or push change is in scope.
