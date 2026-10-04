import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { buildAuthModeHref } from "./auth-mode-href";
import {
  authorizeAuthContextDemoAction,
  buildAuthContextDemoLoginHref,
} from "./auth-context-demo";
import { DEFAULT_AUTH_RETURN_TO, resolveAuthReturnTo, buildAuthLoginHref } from "./auth-return-to";

const CONTEXT = "/auth-context-demo?item=sample&view=detail#favorite";

test("login URL captures pathname, query, and hash through the canonical resolver", () => {
  const href = buildAuthContextDemoLoginHref({
    pathname: "/auth-context-demo",
    search: "?item=sample&view=detail",
    hash: "#favorite",
  });

  assert.equal(new URLSearchParams(href.split("?")[1]).get("returnTo"), CONTEXT);
  assert.equal(buildAuthLoginHref(CONTEXT), href);
});

test("returnTo preserves a safe internal route, query, and hash", () => {
  assert.equal(resolveAuthReturnTo(CONTEXT), CONTEXT);
});

test("invalid and repeated returnTo values fall back to dashboard", () => {
  for (const value of [
    "https://example.com",
    "//example.com/path",
    "/\\example.com",
    "/%25252fexample.com",
    "/bad%escape",
    "/%E0%A4%A",
    "javascript:alert(1)",
    "data:text/html,hi",
    "/auth-context-demo?password=secret",
    "/auth-context-demo?%2570assword=secret",
    "/auth-context-demo?request_body=secret",
    [CONTEXT, "/dashboard"],
  ]) {
    assert.equal(resolveAuthReturnTo(value), DEFAULT_AUTH_RETURN_TO);
  }
});

test("Sign In and Sign Up mode hrefs retain a deep-link context", () => {
  for (const mode of ["signin", "signup"] as const) {
    const href = buildAuthModeHref(mode, CONTEXT);
    const params = new URLSearchParams(href.split("?")[1]);
    assert.equal(params.get("mode"), mode);
    assert.equal(params.get("returnTo"), CONTEXT);
  }

  const signUp = buildAuthModeHref("signup", CONTEXT);
  const refreshedReturnTo = new URLSearchParams(signUp.split("?")[1]).get("returnTo");
  assert.equal(resolveAuthReturnTo(refreshedReturnTo), CONTEXT);
  assert.equal(
    new URLSearchParams(buildAuthModeHref("signin", refreshedReturnTo ?? "").split("?")[1]).get("returnTo"),
    CONTEXT,
  );
});

test("login page parses mode and returnTo, and both auth success paths restore it", async () => {
  const loginPage = await readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8");
  const signIn = await readFile(new URL("../components/sign-in-form.tsx", import.meta.url), "utf8");
  const signUp = await readFile(new URL("../components/sign-up-form.tsx", import.meta.url), "utf8");

  assert.match(loginPage, /const \{ returnTo, mode \} = await searchParams/);
  assert.match(loginPage, /initialMode=\{mode === "signup" \? "signup" : "signin"\}/);
  assert.match(loginPage, /returnTo=\{resolveAuthReturnTo\(returnTo\)\}/);
  for (const source of [signIn, signUp]) {
    assert.match(source, /router\.push\(resolveAuthReturnTo\(returnTo\) as Route\)/);
  }
});

test("auth failures leave the user on the auth surface with returnTo intact", async () => {
  const signIn = await readFile(new URL("../components/sign-in-form.tsx", import.meta.url), "utf8");
  const signUp = await readFile(new URL("../components/sign-up-form.tsx", import.meta.url), "utf8");

  assert.match(signIn, /onError: \(error\) => \{\s*setAuthError\(getSignInErrorMessage\(error\.error\.code\)\);\s*\}/);
  assert.match(signUp, /onError: \(error\) => \{\s*toast\.error\(getSignUpErrorMessage\(error\.error\.code\)\);\s*\}/);
  assert.equal(resolveAuthReturnTo(CONTEXT), CONTEXT);
});

test("guest capture and auth return do not persist or replay a pending write", async () => {
  const demo = await readFile(new URL("../app/auth-context-demo/auth-context-demo.tsx", import.meta.url), "utf8");
  const actionStart = demo.indexOf("async function handleFavoriteAttempt()");
  const unauthenticatedBranch = demo.indexOf("if (!session?.user)", actionStart);
  const authActionCall = demo.indexOf("confirmAuthContextDemoAction()", unauthenticatedBranch);

  assert.ok(actionStart >= 0);
  assert.ok(unauthenticatedBranch > actionStart);
  assert.ok(authActionCall > unauthenticatedBranch);
  assert.match(demo, /onClick=\{\(\) => void handleFavoriteAttempt\(\)\}/);
  assert.match(demo.slice(unauthenticatedBranch, authActionCall), /router\.push\(buildAuthContextDemoLoginHref\(window\.location\) as Route\);\s*return;/);
  assert.doesNotMatch(demo, /useEffect|localStorage|sessionStorage|document\.cookie|indexedDB|FormData|JSON\.stringify/i);
  assert.equal((demo.match(/confirmAuthContextDemoAction\(\)/g) ?? []).length, 1);
});

test("the simulated write stays untouched through auth return until a second explicit click", () => {
  let confirmedActions = 0;
  const clickDemoAction = (trustedRole: string | null) => {
    const result = authorizeAuthContextDemoAction(trustedRole);
    if (result.status === "CONFIRMED") confirmedActions += 1;
    return result;
  };

  const loginHref = buildAuthContextDemoLoginHref({
    pathname: "/auth-context-demo",
    search: "?item=sample&view=detail",
    hash: "#favorite",
  });
  assert.equal(confirmedActions, 0);

  const returnTo = new URLSearchParams(loginHref.split("?")[1]).get("returnTo");
  assert.equal(resolveAuthReturnTo(returnTo), CONTEXT);
  assert.equal(confirmedActions, 0);

  assert.equal(clickDemoAction("TRAVELER").status, "CONFIRMED");
  assert.equal(confirmedActions, 1);
});

test("role authorization uses trusted Better Auth session data and denies Admin/Guest", async () => {
  const action = await readFile(new URL("../app/auth-context-demo/actions.ts", import.meta.url), "utf8");

  assert.match(action, /requireActor\(await headers\(\), authorizationDependencies, "traveler"\)/);
  assert.match(action, /authorizeAuthContextDemoAction\(actor.role\)/);
  assert.doesNotMatch(action, /export async function confirmAuthContextDemoAction\([^)]/);
  assert.equal(authorizeAuthContextDemoAction("TRAVELER").status, "CONFIRMED");
  assert.equal(authorizeAuthContextDemoAction("ADMIN").status, "FORBIDDEN");
  assert.equal(authorizeAuthContextDemoAction(null).status, "UNAUTHENTICATED");
});
