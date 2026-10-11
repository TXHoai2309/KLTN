---
version: alpha
name: KLTN Admin RAG
description: Existing Admin utility surfaces for verified indexing progress
colors:
  primary: "#35765c"
  ink: "#192337"
  muted: "#68768c"
  surface: "#ffffff"
  tint: "#edf5f0"
  border: "#dce6e0"
  error: "#ad3131"
typography:
  sans:
    fontFamily: "var(--font-sans), system-ui, sans-serif"
rounded:
  DEFAULT: "8px"
  card: "16px"
spacing:
  card-padding: "26px"
  form-max: "960px"
components:
  button: {}
  card: {}
  progress: {}
---

# Admin RAG design context

## Overview

Scope: Task186 indexing panel in the existing Admin document detail. Audience:
Vietnamese administrators reviewing private reference documents. This is a utility
screen: clear persisted status takes priority over new visual decoration. Canonical
runtime styling remains apps/web/src/app/admin/destinations/destinations.css,
rag-review.css and the shared @KLTN/ui Button. This document mirrors existing
values; it does not generate or replace application tokens. Other screens are not
redesigned by this package. UI language is Vietnamese; code/error identifiers may
remain technical. No Japanese localization is requested.

## Colors and Typography

Reuse destination semantic variables including dark overrides. Progress accent
uses destination-green; errors use destination-error. Inherit the application's
Vietnamese-capable sans font. Do not download new fonts or introduce colors for
new states when textual labels communicate them. Technical counts remain text,
never part of a background image.

## Layout, Elevation and Shapes

Reuse the Admin form's 960px content width, 16px card corners and restrained border
and shadow. Controls have a 44px minimum target. The toolbar wraps and becomes a
column below 480px; long error identifiers wrap inside the card. Mobile scroll is
normal document flow. No modal, sticky overlay or new navigation is introduced.

## Components and Motion

Use shared Button, lucide LoaderCircle and native progress. Disable admission
while loading, reading uncertain state, an active request or UNKNOWN job. Keep
read-again available. Spinner is decorative; reduced-motion removes animation.
Each panel uses useId for its heading relation. Status is announced politely;
known errors use alert semantics. Preserve inherited keyboard focus outlines.

## Behavioral contract

POST acceptance is not completion. GET provides persisted progress and job outcome.
Embeddings percentage has a real denominator and is explicitly not total task
completion. Earlier stages remain unconfirmed until database completion evidence.
No provider retry for UNKNOWN. Known failure retry uses a new key; uncertain
mutation reconciliation retains the exact key/payload. QUEUED/expired work offers
explicit targeted resume. Poll serially, cancel on unmount, isolate stale identities,
and refresh document status after COMPLETED. Preserve upload/review actions.

## Verification and boundaries

Browser component harness uses fake HTTP fixtures in a test-only script, never
production imports. Verify 1440px/360px, light/dark, keyboard, no horizontal overflow,
progress, failures, retry, reconciliation, resume, stale response and unmount.
This does not substitute for authenticated Next.js browser/live owner acceptance.
Task186 introduces no new route screen, destructive action or provider credentials.

The premium skill strict audit was run read-only:22 findings (4 unresolved ownership,
18 violations), all in unchanged global/demo/shared UI files. No finding targets
the indexing panel. They are recorded as existing cross-screen debt, not silently
fixed or represented as a repository-wide audit PASS.
