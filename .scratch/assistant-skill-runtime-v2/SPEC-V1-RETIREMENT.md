# SPEC — V1 retirement: one V2 chat for guests and signed-in users

Status: ready-for-agent. Not implemented. Decisions below were accepted in the grilling round (Q1–Q6).
Follows: V2-10 (READY_TO_FREEZE_V2). Constraints: AGENTS.md, ADR-31 (V1 preserved until V2 acceptance), ADR-34.

## Problem Statement

The assistant still runs two chat experiences. Signed-in travelers get the V2 chat; guests, saved-conversation links, and some surfaces fall back to the old V1 chat, which asks fixed form-like questions and keeps a second code path (a V1 chat client, a V1 controller, a runtime switch, a V1 branch in the planning route). The team maintains both, tests both, and a deployment setting can silently send users back to the weaker V1 behavior. The owner wants one assistant experience for everyone.

## Solution

One chat component serves everyone. Signed-in travelers keep the full V2 experience. Guests (no account) get the same V2 chat in a question-and-answer mode: they ask about Hà Giang and receive source-grounded answers with citations from the existing Q&A service, under the same abuse limits as today. When a guest asks to plan a trip, the chat explains that planning needs an account, invites them to sign in, and keeps their message so it is restored after sign-in. Saved conversations open in the same chat. After this is proven live, the V1 chat, its controller, the runtime switch and the V1 route branch are deleted in a separate final commit so it can be reverted alone.

## User Stories

1. As a guest, I want to open the assistant without signing in, so that I can ask about Hà Giang right away.
2. As a guest, I want answers that cite their sources, so that I can trust what I read.
3. As a guest, I want the same natural tone signed-in travelers get, so that the assistant does not feel like a form.
4. As a guest, I want the assistant to say plainly that trip planning needs an account, so that I am not confused by a failed request.
5. As a guest, I want a clear sign-in invitation when I ask to plan a trip, so that I know the next step.
6. As a guest, I want my planning message kept through sign-in, so that I do not retype it.
7. As a guest, I want my earlier questions in the same visit kept, so that follow-up questions make sense.
8. As a guest, I want my conversation history to behave as it does today, so that nothing I already rely on disappears.
9. As a guest, I want to delete my own conversations, so that I control what is stored.
10. As a guest, I want the existing usage limits to behave as today, so that the service stays stable for everyone.
11. As a guest who hits a limit, I want a polite message saying when to try again, so that I am not left with an error.
12. As a signed-in traveler, I want the V2 chat everywhere (assistant page, destination panel, in-trip), so that behavior is consistent.
13. As a signed-in traveler, I want a saved-conversation link to open in the new chat, so that old links still work.
14. As a signed-in traveler, I want to continue asking in a conversation I saved earlier, so that history is useful.
15. As a signed-in traveler, I want my previous history intact after the change, so that no data is lost.
16. As a traveler on a destination page, I want the assistant opened with that destination as context, so that questions are about the right place.
17. As a traveler on an in-trip page, I want the in-trip assistant unchanged, so that live trip help keeps working.
18. As a traveler, I want guest and signed-in answers to come from the same Q&A service, so that a fact never differs by login state.
19. As a traveler whose session expires mid-chat, I want a clear re-sign-in path, so that I do not lose my draft.
20. As the product owner, I want exactly one chat experience, so that quality work benefits all users.
21. As the product owner, I want no guest access to planning, workspace saving or trip writes, so that account-owned data stays protected.
22. As the product owner, I want no schema change or data migration, so that rollout risk is small.
23. As the product owner, I want V1 deletion in its own commit, so that I can revert it without touching the guest-mode work.
24. As a developer, I want the runtime switch removed, so that a deployment setting cannot send users to a retired path.
25. As a developer, I want the planning route to contain only the V2 path, so that it stays thin and reviewable.
26. As a developer, I want the Q&A service, abuse limits and conversation routes untouched, so that their behavior and tests stay valid.
27. As a developer, I want fewer duplicate tests, so that the suite reflects one behavior.
28. As an operator, I want a live check with one real guest and one real signed-in traveler before deletion, so that removal is evidence-based.
29. As an operator, I want deployments that still set the old runtime variable to be harmless, so that rollout order does not matter.
30. As a security reviewer, I want the guest path to expose no V2 session state, planning, GPS or trip tools, so that its surface is only Q&A.

## Implementation Decisions

- **Scope of removal (Q1).** Keep the Q&A service, the ask and conversations endpoints, abuse limits and citation handling. Delete only V1-specific code: the V1 chat client, the V1 controller, the V1/V2 selection in the runtime chat wrapper, the V1 branch in the planning route handler, and the runtime-version switch (including the session response field and its client handling). Any module shared between the two chats (answer rendering, citations, sidebar, conversation client, followups) stays; deletion must be driven by "no remaining importer", verified at implementation time.
- **Guest mode (Q2).** The V2 chat component gains a guest mode: Q&A only. It sends questions to the existing guest-capable Q&A endpoint with the existing guest cookie principal. It creates no V2 session, no session head, no capsule; it calls no planning route. No database schema change. The planning route keeps requiring a signed-in traveler.
- **Planning intent from a guest.** The guest chat recognizes a request to plan (create, change or save a trip) and replies with a fixed, natural invitation to sign in, and stores the unsent text through the existing planning auth hand-off so it is restored after sign-in. Recognition must be conservative: a factual question that mentions a plan is still answered. Exact recognition rule is an implementation decision to be fixed by tests; unrecognized cases fall through to Q&A, never to a planning call.
- **Saved conversations (Q3).** Deep links carrying a conversation id open in the V2 chat (its sidebar and conversation client already exist). Remove the special case that routes saved-conversation links to V1. Existing guest and user conversation history is read and continued as today; no migration, no deletion.
- **Limits (Q4).** All guest abuse limits and cookie lifetime remain exactly as they are; no new quota, no changed constants.
- **Surfaces (Q5).** The assistant page, the destination assistant panel and the in-trip page all render the single V2 chat. Destination context continues to enter through the existing initial-context input; panel Q&A results must be unchanged.
- **Runtime variable.** The server no longer reads the runtime-version variable. If a deployment still defines it, the value is ignored. Env docs and the example env file drop it. The session bootstrap endpoint keeps returning identity; it stops returning a runtime version.
- **Staging (Q6).** (a) Guest mode + saved-conversation in V2, V1 still present; (b) live verification with a real guest and a real signed-in user; (c) delete V1 and the switch in a separate final commit. Each stage ends with tsc, relevant tests and `git diff --check`; stage (c) also runs the full suite and a production build.
- **Domain language.** Add to GLOSSARY: **Guest** (an unauthenticated visitor identified only by the guest cookie; Q&A only) and **Guest mode** (the V2 chat's Q&A-only mode). Record a short ADR: "One assistant chat; guests are Q&A-only; V1 retired" referencing ADR-31 (V1 preserved until V2 acceptance; V2 is accepted) and superseding the rollback-switch clause.
- **Docs.** Update the V2 evaluation document's note that the default runtime is V1 (stale), the progress log, and add a story file for this work.

## Testing Decisions

- **Good tests** assert externally visible behavior: what a guest sees and what requests leave the browser/server, not component internals or module wiring.
- **Proposed seams (confirm before coding), highest first:**
  1. **Chat surface seam** — render the chat as a guest and as a signed-in user with a fake network boundary; assert: guest question → Q&A request with citations rendered; guest planning request → no planning request, invitation shown, draft retained; saved-conversation link → opens in this chat; signed-in flow unchanged. Catches wrong mode/routing; misses real server behavior.
  2. **HTTP route seam** — planning route and session bootstrap: the planning route has no V1 path and still rejects non-travelers; bootstrap returns identity without a runtime version; Q&A endpoint behavior and limits unchanged (existing tests). Catches auth-boundary regressions.
  3. **Live seam (stage b)** — one real guest and one real traveler against the Dev setup: guest Q&A with citations, guest planning invitation + restore after sign-in, saved-conversation link, traveler planning unaffected.
- **Prior art:** assistant runtime-mode and chat-key tests, planning-auth-handoff tests, planning route tests with injected dependencies, Q&A conversation route tests, the V2-10 live runner pattern (disposable user, cleanup).
- **Deletion safety:** after stage (c), tsc plus the full suite must show no new failures against the recorded baseline of 63 pre-existing failures in 10 files; removed tests must be only those that exercised deleted code.

## Out of Scope

- Letting guests plan, save, or own any V2 session, workspace or trip.
- Any schema change, migration, or deletion of stored conversations.
- Changing Q&A retrieval, citations, abuse limits, cookie lifetime or guest identity.
- New assistant features, UI redesign, accommodation search or booking.
- Deployment, push or merge (the user decides separately).

## Further Notes

- Risk to verify in stage (a): the V2 chat's sidebar and history calls must work with a guest principal; if any call assumes a signed-in user, fix at that boundary rather than loosening authorization.
- Risk in stage (c): shared modules imported by both chats must not be deleted with V1; delete by absence of importers.
- Open fact for implementation: whether the guest Q&A transport currently lives only inside the V1 chat stack; if so it is kept (renamed if helpful) because guest mode needs it.
- The stale statement that V1 is the default runtime appears in the V2 evaluation document; correct it in this work.
