"use client";

import type { ReactNode } from "react";

export default function SafeAuthForm({
  children,
  onSubmit,
}: {
  children: ReactNode;
  onSubmit: () => void;
}) {
  return (
    <form
      method="post"
      action="/login"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSubmit();
      }}
      className="auth-form"
      noValidate
    >
      <fieldset className="auth-form-controls">{children}</fieldset>
    </form>
  );
}
