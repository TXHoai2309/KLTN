import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";

import AuthModeLink from "../components/auth-mode-link";
import SafeAuthForm from "../components/safe-auth-form";
import { buildAuthModeHref } from "./auth-mode-href";
import { claimSubmission, releaseSubmission } from "./auth-submission-guard";
import { isSignOutConfirmed } from "./sign-out-confirmation";
import { DEFAULT_AUTH_RETURN_TO, resolveAuthReturnTo } from "./auth-return-to";

test("auth form SSR is interactive and uses POST for native submission", () => {
  const html = renderToStaticMarkup(
    createElement(SafeAuthForm, {
      onSubmit: () => undefined,
      children: createElement(
        "div",
        null,
        createElement("input", { name: "email", type: "email" }),
        createElement("input", { name: "password", type: "password" }),
        createElement("button", { type: "submit" }, "Sign in"),
      ),
    }),
  );

  assert.match(html, /method="post"/);
  assert.match(html, /action="\/login"/);
  assert.match(html, /<fieldset class="auth-form-controls">/);
  assert.doesNotMatch(html, /\sdisabled(?:=""|=|\s|>)/i);
  assert.doesNotMatch(html, /method="get"/i);
});

test("sign-in and sign-up both use the safe POST form", async () => {
  for (const path of ["../components/sign-in-form.tsx", "../components/sign-up-form.tsx"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /<SafeAuthForm/);
  }
});

test("mode links have a server-renderable destination and retain safe returnTo", () => {
  const returnTo = "/dashboard?from=register#trip";
  const href = buildAuthModeHref("signup", returnTo);
  const html = renderToStaticMarkup(
    createElement(AuthModeLink, {
      href,
      onSwitch: () => undefined,
      children: "Đăng ký",
    }),
  );

  assert.equal(new URLSearchParams(href.split("?")[1]).get("mode"), "signup");
  assert.equal(new URLSearchParams(href.split("?")[1]).get("returnTo"), returnTo);
  assert.match(html, /href="\/login\?mode=signup&amp;returnTo=%2Fdashboard%3Ffrom%3Dregister%23trip"/);
});

test("the synchronous submission lock admits one attempt until released", () => {
  const lock = { current: false };
  let requests = 0;
  const submit = () => {
    if (claimSubmission(lock)) requests += 1;
  };

  submit();
  submit();
  assert.equal(requests, 1);
  releaseSubmission(lock);
  submit();
  assert.equal(requests, 2);
});

test("logout guards duplicate attempts and only navigates after confirmed success", async () => {
  const source = await readFile(new URL("../components/user-menu.tsx", import.meta.url), "utf8");

  assert.match(source, /claimSubmission\(signOutInProgress\)/);
  assert.match(source, /releaseSubmission\(signOutInProgress\)/);
  assert.match(source, /isSignOutConfirmed\(\(\) =>[\s\S]*?fetch\("\/api\/session\/logout", \{ method: "POST"/);
  assert.match(source, /if \(!confirmed\)[\s\S]*?return;[\s\S]*?window\.location\.replace\("\/"\)/);
  assert.match(source, /window\.location\.replace\("\/"\)/);
  assert.doesNotMatch(source, /authClient\.signOut\(/);
  assert.match(source, /disabled=\{isSigningOut\}/);
  assert.match(source, /closeOnClick=\{false\}/);
  assert.match(source, /role="alert"/);
  assert.doesNotMatch(source, /\/api\/logout/);
});

test("logout confirmation distinguishes success, failure, and uncertainty", async () => {
  assert.equal(
    await isSignOutConfirmed(async () =>
      Response.json({ success: true, operationStatus: "SUCCESS" }),
    ),
    true,
  );
  assert.equal(
    await isSignOutConfirmed(async () =>
      Response.json({ success: false, operationStatus: "UNKNOWN" }, { status: 503 }),
    ),
    false,
  );
  assert.equal(
    await isSignOutConfirmed(async () =>
      Response.json({ success: true }, { status: 200 }),
    ),
    false,
  );
  assert.equal(await isSignOutConfirmed(async () => { throw new Error("transport detail"); }), false);
});

test("sign-in and sign-up retain keyboard-operable password controls and share the submit lock", async () => {
  for (const path of ["../components/sign-in-form.tsx", "../components/sign-up-form.tsx"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    const toggleIndex = source.indexOf('className="auth-password-toggle"');
    const submitIndex = source.indexOf('type="submit"');

    assert.ok(toggleIndex >= 0 && toggleIndex < submitIndex);
    assert.match(source, /<button\s+type="button"[\s\S]*?className="auth-password-toggle"/);
    assert.match(source, /claimSubmission\(submissionInProgress\)/);
    assert.doesNotMatch(source, /tabIndex\s*=\s*\{\s*-1\s*\}/);
  }
});

test("returnTo rejects external, malformed, and encoded path separators", () => {
  assert.equal(resolveAuthReturnTo("/dashboard?from=register#trip"), "/dashboard?from=register#trip");
  assert.equal(resolveAuthReturnTo("https://example.com"), DEFAULT_AUTH_RETURN_TO);
  assert.equal(resolveAuthReturnTo("//example.com"), DEFAULT_AUTH_RETURN_TO);
  assert.equal(resolveAuthReturnTo("/dashboard%"), DEFAULT_AUTH_RETURN_TO);
  assert.equal(resolveAuthReturnTo("/%25252Fexample.com"), DEFAULT_AUTH_RETURN_TO);
});
