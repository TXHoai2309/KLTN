import type { ReactNode } from "react";

export default function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <section className="auth-card" aria-labelledby="auth-card-title">
      <div className="auth-card-heading">
        <h1 id="auth-card-title">{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children}
      {footer}
    </section>
  );
}
