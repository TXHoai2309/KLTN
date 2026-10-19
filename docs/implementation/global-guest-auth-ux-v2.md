# Implementation Report: Global Guest Access & Authentication UX V2

**Document:** `docs/implementation/global-guest-auth-ux-v2.md`
**Date:** 2026-10-18
**Author:** Principal Frontend Engineer, Senior Next.js Architect & Security QA
**Branch:** `feat/global-guest-auth-ux-v2` (Worktree isolated at base `86bb942`)

---

## 1. Executive Summary & Problem Statement

### 1.1 Context & Problem
Prior to this enhancement, unauthenticated guests interacting with protected features on the Hà Giang Travel Assistant platform (such as clicking **Yêu thích**, **Lập hành trình**, **Chuyến đi của tôi**, or clicking destination heart buttons) were abruptly redirected to `/login`. This direct, unexplained redirection led to high bounce rates, disrupted the user's discovery flow, and failed to communicate *why* an account is required or what benefits travelers gain by signing in.

### 1.2 Target Experience
Every user intent requiring authenticated Traveler or Account permissions now presents a clear, contextual, non-intrusive **Authentication Required Modal** (`AuthRequiredDialog`). The modal explains the feature, offers explicit options (**Đăng nhập**, **Tạo tài khoản**, **Để sau**), and navigates *only* when the guest makes an explicit decision.

---

## 2. Protected Route & Feature Inventory

| Surface / Action | Target Route / API | Classification | Guest Experience (Before) | Guest Experience (After UX V2) |
|---|---|---|---|---|
| **Header Nav: Favorites** | `/favorites` | `TRAVELER` | Direct redirect to `/login` | Intercepted: Opens `AuthRequiredDialog` with `favorites` context |
| **Header Nav: Planner** | `/trips/new` | `TRAVELER` | Direct redirect to `/login` | Intercepted: Opens `AuthRequiredDialog` with `planner` context |
| **Header Nav: My Trips** | `/trips` | `TRAVELER` | Direct redirect to `/login` | Intercepted: Opens `AuthRequiredDialog` with `trips` context |
| **Header Nav: Dashboard** | `/dashboard` | `ACCOUNT` | Direct redirect to `/login` | Intercepted: Opens `AuthRequiredDialog` with `dashboard` context |
| **Mobile Drawer Nav** | Protected routes | `TRAVELER` | Drawer remained open while redirecting | Drawer closes cleanly first, then opens dialog without focus trap collision |
| **Landing Hero CTA** | `/trips/new` | `TRAVELER` | Direct redirect to `/login` | Intercepted: Opens `AuthRequiredDialog` with `planner` context |
| **Landing Timeline CTA** | `/trips/new` | `TRAVELER` | Direct redirect to `/login` | Intercepted: Opens `AuthRequiredDialog` with `planner` context |
| **Landing Final CTA** | `/trips/new` | `TRAVELER` | Direct redirect to `/login` | Intercepted: Opens `AuthRequiredDialog` with `planner` context |
| **Footer Protected Links** | `/favorites`, `/trips`, `/dashboard` | `TRAVELER` / `ACCOUNT` | Direct redirect to `/login` | Intercepted: Opens `AuthRequiredDialog` with respective context |
| **Favorite Button (Heart)** | `/api/favorites/[type]/[id]` | `TRAVELER` | Redirect to `/login` | Intercepted: Opens `AuthRequiredDialog` with `favorites` context; no mutation sent |
| **Direct URL Access** | `/favorites`, `/trips/new`, `/account` | `TRAVELER` / `ACCOUNT` | Direct redirect to `/login` | Preserved server RBAC boundary (`requireActor`) redirecting to `/login` with safe returnTo |
| **Public Features** | `/`, `/explore`, `/destinations/[id]`, `/culture` | `PUBLIC` | Open access | Kept fully open; zero uninvited popups |

---

## 3. Architecture & Core Components

### 3.1 Centralized Intent Configuration (`apps/web/src/lib/auth-intent-config.ts`)
Defines structured metadata for each user intent (`favorites`, `planner`, `trips`, `trip_save`, `dashboard`, `account`, `session_expired`, `generic`):
- `title`: Natural Vietnamese title.
- `description`: Value-focused explanation.
- `icon`: Semantic Lucide icon key (`heart`, `compass`, `map`, `save`, `user`, `alert`).
- `primaryAction`: "Đăng nhập".
- `secondaryAction`: "Tạo tài khoản".
- `tertiaryAction`: "Để sau".
- `defaultReturnTo`: Canonical safe internal path.

### 3.2 Accessible Dialog Component (`apps/web/src/components/auth-required-dialog.tsx`)
Conforms to WAI-ARIA and accessibility requirements:
- Native `<dialog>` element with `role="dialog"` and `aria-modal="true"`.
- Focus trap handling Tab and Shift+Tab cycles.
- Escape key and backdrop click detection with cleanup.
- Scroll locking via `overflow: hidden` on document body with automatic restoration on close.
- Focus restoration returning focus to the trigger button/element when dismissed.
- Highland emerald and cream palette (`#0F4C3A`, `#E9B94B`, `#F7F5F0`) with responsive styling (390px mobile, 768px tablet, 1440px desktop) and dark mode support.
- `prefers-reduced-motion` compliance.

### 3.3 Auth Intent Guard & Context (`apps/web/src/components/auth-required-provider.tsx`)
Centralizes client-side authorization state:
- Differentiates 8 authentication states:
  1. `pending`: Session checking; queues or informs user, never assumes guest.
  2. `authenticated traveler`: Executes action immediately.
  3. `authenticated admin`: Inherits traveler privileges under RBAC V2.
  4. `confirmed guest`: Triggers `AuthRequiredDialog`.
  5. `session expired`: Displays expired notification without claiming user has no account.
  6. `auth verification error`: Provides retry mechanism; never logs out or forces guest flow on network glitch.
  7. `account locked`: Blocks actions safely.
  8. `insufficient permission`: Surfaces 403 notification without redirect loop.
- Safe fallback context ensures SSR and non-wrapped tree components render without runtime exceptions.

### 3.4 Protected Semantic Link (`apps/web/src/components/protected-link.tsx`)
- Renders standard semantic HTML `<a>` via Next.js `Link`.
- Preserves native browser behaviors: right click, Middle click, Ctrl+Click, Cmd+Click, Shift+Click, Alt+Click (open in new tab/window).
- Intercepts primary click for guests, executing `onGuestIntercept` (e.g. closing mobile drawer) and prompting the dialog without causing URL hash jumps or scroll-to-top glitches.

### 3.5 Safe ReturnTo Integration
Leverages `apps/web/src/lib/auth-return-to.ts`:
- Rejects open redirect attacks, protocol-relative URLs (`//evil.com`), encoded separators (`%2F%2F`), and sensitive query parameters.
- Mode switcher correctly toggles between `?mode=signin&returnTo=...` and `?mode=signup&returnTo=...`.
- Invariant upheld: **No automatic mutation replay**. When a user logs in, they are redirected back to the context page, but mutations (such as favoriting) must be explicitly re-clicked by the user.

---

## 4. Security & Server RBAC Invariants

1. **Client UX Boundary Only**: `AuthRequiredProvider` and `ProtectedLink` serve solely as a UX layer. All Route Handlers and server pages retain strict `requireActor()` and `requireTraveler()` checks.
2. **No Data Leakage**: Private APIs continue returning 401/403 with empty data envelopes when accessed directly.
3. **No Optimistic Mutation**: Guests never trigger database writes, pre-flight idempotency allocations, or optimistic state changes.
4. **Admin Inheritance**: Admins correctly access Traveler features without experiencing guest interruptions.

---

## 5. Verification & Test Summary

- **Typecheck**: `npm run check-types` passed across all workspace packages (`@KLTN/ui`, `@KLTN/db`, `@KLTN/auth`, `web`).
- **Production Build**: Next.js 16.3.8 Turbopack production build (`npm run build`) compiled 45 static and dynamic pages with 0 errors.
- **Focused Vitest Tests**: 5 test files, 15 tests passed:
  - `auth-intent-config.vitest.test.ts` (3 tests)
  - `auth-required-dialog.vitest.test.ts` (4 tests)
  - `auth-required-provider.vitest.test.ts` (3 tests)
  - `protected-link.vitest.test.ts` (2 tests)
  - `favorite-button-guest-ux.vitest.test.ts` (3 tests)
- **Regression Test Suites**:
  - `test:auth-ui`: 36 tests passed.
  - `test:favorite`: 27 tests passed.
  - `test:authorization`: 21 tests passed.
  - `test:account`: 18 tests passed.
  - `test:idempotency`: 4 tests passed.
  - `test:destination`: 63 tests passed.
  - `test:culture`: 37 tests passed.
  - `test:map`: 27 tests passed.
  - `test:search`: 33 tests passed.
  - `test:rag`: 56 tests passed.
  - US-14, US-15, US-24, US-25, US-26, US-27 suites: 103 tests passed.
- **Pre-existing Regression**: `test:explore` (`public-culture-list.test.tsx` line 85) fails on matching legacy `home-hero-visual` CSS class from an earlier master commit (`c5ede132`). Per repository rules, unrelated legacy tests were kept untouched.

---

## 6. Git & Worktree Status

- **Base Commit**: `86bb942` on `master`
- **Worktree**: `D:/KLTN/KLTN/.worktrees/feat-global-guest-auth-ux-v2`
- **Branch**: `feat/global-guest-auth-ux-v2`
- **Working Tree Cleanliness**: `git diff --check` reported 0 whitespace or formatting errors.
