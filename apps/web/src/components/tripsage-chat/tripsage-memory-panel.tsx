"use client";

import { useState } from "react";
import { Button } from "@KLTN/ui/components/button";
import { memoryListSchema, type MemoryItem } from "../../modules/tripsage-memory/memory-contract";
import styles from "./tripsage-memory-panel.module.css";

const endpoint = "/api/ai/memories";
const labels: Record<MemoryItem["kind"], string> = { PREFERENCE: "Sở thích", CONSTRAINT: "Ràng buộc", NOTE: "Ghi chú" };
type Deletion = { id: string | null; key: string };

export function TripsageMemoryPanel({ enabled }: { enabled: boolean }) {
  return enabled ? <MemoryPanel /> : null;
}

function MemoryPanel() {
  const [items, setItems] = useState<MemoryItem[]>();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null | undefined>(undefined);
  const [pending, setPending] = useState<Deletion>();
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean }>();

  async function load() {
    setBusy(true);
    setFeedback(undefined);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const result = memoryListSchema.parse((await response.json()).data);
      setItems(result.items);
    } catch {
      setFeedback({ error: true, message: "Không tải được bộ nhớ. Vui lòng thử lại." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(intent: Deletion) {
    setConfirm(undefined);
    setPending(intent);
    setBusy(true);
    setFeedback(undefined);
    try {
      const path = intent.id === null ? endpoint : `${endpoint}/${encodeURIComponent(intent.id)}`;
      const response = await fetch(path, { method: "DELETE", headers: { "Idempotency-Key": intent.key } });
      const result = await response.json();
      if (response.ok && result?.operationStatus === "SUCCESS" && result.success === true) {
        setItems(current => intent.id === null ? [] : current?.filter(item => item.id !== intent.id));
        setPending(undefined);
        setFeedback({ message: intent.id === null ? "Đã xóa tất cả mục bộ nhớ." : "Đã xóa mục bộ nhớ." });
      } else if (result?.operationStatus === "FAILED" || [400, 401, 403, 404].includes(response.status)) {
        setPending(undefined);
        setFeedback({ error: true, message: "Không xóa được mục bộ nhớ. Bạn có thể tải lại danh sách." });
      } else {
        throw new Error();
      }
    } catch {
      setFeedback({ error: true, message: "Chưa xác nhận được thao tác xóa. Hãy thử lại yêu cầu xóa này." });
    } finally {
      setBusy(false);
    }
  }

  const locked = busy || Boolean(pending) || confirm !== undefined;
  return (
    <details className={styles.panel} onToggle={event => {
      if (event.currentTarget.open && items === undefined && !busy && !pending) void load();
    }}>
      <summary>Bộ nhớ của tôi</summary>
      <div className={styles.body} aria-busy={busy}>
        <p className="assistant-muted">Trợ lý chỉ lưu sở thích bạn muốn nhớ; bạn có thể xóa bất kỳ lúc nào.</p>
        {feedback && <p role={feedback.error ? "alert" : "status"}>{feedback.message}</p>}
        {busy && items === undefined && <p role="status">Đang tải bộ nhớ…</p>}
        {items?.length === 0 && <p>Chưa có mục bộ nhớ nào.</p>}
        {!!items?.length && (
          <ul className={styles.list} aria-label="Các mục bộ nhớ">
            {items.map(({ id, kind, content }, index) => (
              <li key={id}>
                <div><strong>{labels[kind]}</strong><p>{content}</p></div>
                <Button size="sm" variant="outline" type="button" disabled={locked} aria-label={`Xóa mục ${index + 1}`} onClick={() => setConfirm(id)}>Xóa</Button>
              </li>
            ))}
          </ul>
        )}
        {confirm !== undefined && (
          <div className={styles.confirm} role="group" aria-label="Xác nhận xóa bộ nhớ">
            <p>{confirm === null ? "Bạn muốn xóa tất cả mục bộ nhớ?" : "Bạn muốn xóa mục bộ nhớ này?"}</p>
            <div className={styles.actions}>
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirm(undefined)}>Hủy</Button>
              <Button type="button" size="sm" variant="destructive" onClick={() => void remove({ id: confirm, key: crypto.randomUUID() })}>Xác nhận xóa</Button>
            </div>
          </div>
        )}
        <div className={styles.actions}>
          {pending ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void remove(pending)}>Thử lại yêu cầu xóa</Button>
            : <>
              <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => void load()}>Tải lại</Button>
              {!!items?.length && <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => setConfirm(null)}>Xóa tất cả</Button>}
            </>}
        </div>
      </div>
    </details>
  );
}
