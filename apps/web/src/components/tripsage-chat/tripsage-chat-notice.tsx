import type { ChatNotice } from "@/modules/tripsage-chat/tripsage-chat-errors";

/** Vietnamese error/limit/interrupted notice for the chat. Shows only the classified message, never raw error text. */
export function TripsageChatNotice({ notice, onResend }: { notice: ChatNotice | null; onResend?: () => void }) {
  if (!notice) return null;
  return (
    <div role="alert" data-notice={notice.kind} className="assistant-planning-error" style={{ margin: "0 0 8px", padding: "8px 12px", borderRadius: 10, border: "1px solid #f1c7c2", background: "#fdf2f0", color: "#8c2e22", fontSize: 12.5, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <p style={{ margin: 0 }}>{notice.message}</p>
      {notice.canResend && onResend && (
        <button
          type="button"
          className="assistant-composer-retry"
          style={{ minHeight: 32, padding: "4px 12px", border: "1px solid #165b3f", borderRadius: 9999, background: "#fff", color: "#165b3f", font: "inherit", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
          onClick={onResend}
        >
          Gửi lại
        </button>
      )}
    </div>
  );
}
