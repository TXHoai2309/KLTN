import type { ChatNotice } from "@/modules/tripsage-chat/tripsage-chat-errors";

/** Vietnamese error/limit/interrupted notice for the chat. Shows only the classified message, never raw error text. */
export function TripsageChatNotice({ notice, onResend }: { notice: ChatNotice | null; onResend?: () => void }) {
  if (!notice) return null;
  return (
    <div role="alert" data-notice={notice.kind} className="assistant-planning-error" style={{ margin: "0 0 6px", color: "#b42318", fontSize: 12.5 }}>
      <p style={{ margin: 0 }}>{notice.message}</p>
      {notice.canResend && onResend && <button type="button" className="assistant-save-button" style={{ marginTop: 6 }} onClick={onResend}>Gửi lại</button>}
    </div>
  );
}
