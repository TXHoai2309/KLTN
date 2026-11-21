import Link from "next/link";

/** Two modes of the one assistant address. Plain links, no client state. */
export function AssistantModeTabs({ active }: { active: "chat" | "plan" }) {
  const item = (mode: "chat" | "plan", href: "/assistant" | "/assistant?mode=plan", label: string) => (
    <Link
      key={mode}
      href={href}
      aria-current={active === mode ? "page" : undefined}
      style={{ padding: "6px 14px", borderRadius: 999, fontWeight: active === mode ? 700 : 400, textDecoration: "none", border: "1px solid currentColor", opacity: active === mode ? 1 : 0.65 }}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Chế độ trợ lý" style={{ display: "flex", gap: 8, justifyContent: "center", margin: "12px 0" }}>
      {item("chat", "/assistant", "Trò chuyện và hỏi đáp")}
      {item("plan", "/assistant?mode=plan", "Lập hành trình AI")}
    </nav>
  );
}
