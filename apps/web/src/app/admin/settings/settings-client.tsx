"use client";

import { useCallback, useEffect, useState } from "react";
import type { RuntimeService } from "@/modules/runtime-config/runtime-config-contract";

type Field = { name: string; configured: boolean; source: "CMS" | "ENV"; value: string | number | null };
type Overview = {
  scope: string;
  services: { service: RuntimeService; version: number; updatedAt: string | null; fields: Field[] }[];
  readOnly: { embedding: string; vaultConfigured: boolean; previousKeyConfigured: boolean; blobConfigured: boolean; qaRuntimeEnabled: boolean; mapTiles: string };
  history: { id: string; service: string; version: number; changedKeys: string; actorId: string; createdAt: string }[];
};
type MutationResponse = { success: boolean; operationStatus: "SUCCESS" | "FAILED" | "UNKNOWN"; error?: { message: string } };
const labels: Record<string, string> = {
  apiKey: "API key", apiSecret: "API secret", cloudName: "Cloud name",
  preferenceModel: "Model phân tích nhu cầu", editorialModel: "Model biên tập",
  qaModel: "Model QA", editorialTimeoutMs: "Timeout biên tập (ms)",
};
const serviceLabels: Record<RuntimeService, string> = { OPENAI: "OpenAI", CLOUDINARY: "Cloudinary", STADIA: "Stadia Routing" };
const secrets = new Set(["apiKey", "apiSecret"]);
const modelMessages = { preferenceModel: "model phân tích nhu cầu", editorialModel: "model biên tập", qaModel: "model QA" } as const;

function savedConfigurationMessage(service: RuntimeService, body: string): string {
  let changes: Record<string, unknown>;
  try {
    const parsed = JSON.parse(body) as { changes?: unknown };
    changes = parsed.changes && typeof parsed.changes === "object" && !Array.isArray(parsed.changes) ? parsed.changes as Record<string, unknown> : {};
  } catch { changes = {}; }
  const messages = Object.entries(modelMessages).flatMap(([field, label]) =>
    typeof changes[field] === "string" ? [`Đã chọn ${changes[field]} cho ${label}`] : []);
  if (Object.keys(changes).some(field => !(field in modelMessages))) messages.push(`Đã cập nhật cấu hình ${serviceLabels[service]}`);
  return messages.join(" · ") || `Đã lưu cấu hình ${serviceLabels[service]}`;
}

export default function SettingsClient() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ service: RuntimeService | "REWRAP"; body: string; key: string } | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelListError, setModelListError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/settings", { cache: "no-store" });
      const result = await response.json() as { success: boolean; data?: Overview; error?: { message: string } };
      if (!response.ok || !result.success || !result.data) throw Error(result.error?.message ?? "Không thể tải cấu hình.");
      setData(result.data); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tải cấu hình."); }
  }, []);
  const loadModels = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/settings/models", { cache: "no-store" });
      const result = await response.json() as { success: boolean; data?: { models: string[] }; error?: { message: string } };
      if (!response.ok || !result.success || !result.data) throw Error(result.error?.message ?? "Không thể lấy danh sách model.");
      setAvailableModels(result.data.models); setModelListError(null);
    } catch (cause) { setAvailableModels([]); setModelListError(cause instanceof Error ? cause.message : "Không thể lấy danh sách model."); }
  }, []);
  useEffect(() => { void load(); void loadModels(); }, [load, loadModels]);

  async function save(service: RuntimeService) {
    const existing = pending?.service === service ? pending : null;
    const changes = Object.fromEntries(Object.entries(drafts).filter(([name, value]) => name.startsWith(`${service}.`) && value.trim() !== "").map(([name, value]) => {
      const field = name.split(".")[1]!;
      return [field, field === "editorialTimeoutMs" ? Number(value) : value.trim()];
    }));
    if (!existing && !Object.keys(changes).length) { setError("Nhập ít nhất một giá trị cần thay."); return; }
    const request = existing ?? { service, body: JSON.stringify({ service, changes }), key: crypto.randomUUID() };
    setBusy(service); setError(null); setSuccess(null);
    try {
      const response = await fetch("/api/admin/settings", { method: "PATCH", headers: { "content-type": "application/json", "Idempotency-Key": request.key }, body: request.body });
      const result = await response.json() as MutationResponse;
      if (result.operationStatus === "UNKNOWN") { setPending(request); setError("Chưa xác định được kết quả. Bấm Lưu lại để thử với cùng yêu cầu."); return; }
      setPending(null);
      if (!result.success) { setError(result.error?.message ?? "Không thể lưu cấu hình."); return; }
      setSuccess(savedConfigurationMessage(service, request.body));
      setDrafts(current => Object.fromEntries(Object.entries(current).filter(([name]) => !name.startsWith(`${service}.`))));
      await load();
      if (service === "OPENAI") await loadModels();
    } catch { setPending(request); setError("Chưa xác định được kết quả. Bấm Lưu lại để thử với cùng yêu cầu."); }
    finally { setBusy(null); }
  }

  async function rewrap() {
    const request = pending?.service === "REWRAP" ? pending : { service: "REWRAP" as const, body: "", key: crypto.randomUUID() };
    setBusy("REWRAP"); setError(null); setSuccess(null);
    try {
      const response = await fetch("/api/admin/settings", { method: "POST", headers: { "Idempotency-Key": request.key } });
      const result = await response.json() as MutationResponse;
      if (result.operationStatus === "UNKNOWN") { setPending(request); setError("Chưa xác định kết quả xoay khóa. Thử lại cùng yêu cầu."); return; }
      setPending(null);
      if (!result.success) { setError(result.error?.message ?? "Không thể xoay khóa."); return; }
      setSuccess("Đã mã hóa lại cấu hình bằng khóa mới.");
      await load();
    } catch { setPending(request); setError("Chưa xác định kết quả xoay khóa. Thử lại cùng yêu cầu."); }
    finally { setBusy(null); }
  }

  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
    <header><h1 className="text-2xl font-semibold">Cấu hình hệ thống</h1><p className="text-sm text-muted-foreground">Key dịch vụ được lưu trên server. Giá trị đã lưu không hiển thị lại. Lưu chỉ kiểm tra định dạng; hãy kiểm tra chức năng tương ứng sau khi thay key.</p></header>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
    {!data && !error && <p role="status">Đang tải cấu hình…</p>}
    {data && <>
      <p className="text-sm">Môi trường: <strong>{data.scope}</strong></p>
      {!data.readOnly.vaultConfigured && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Kho mã hóa chưa được cấu hình trên server. Admin chưa thể lưu key mới.</p>}
      {data.services.map(group => <section key={group.service} className="rounded-xl border bg-card p-5" aria-label={serviceLabels[group.service]}>
        <h2 className="mb-1 text-lg font-semibold">{serviceLabels[group.service]}</h2>
        <p className="mb-4 text-xs text-muted-foreground">Phiên bản {group.version}{group.updatedAt ? ` · cập nhật ${new Date(group.updatedAt).toLocaleString("vi-VN")}` : " · dùng environment"}</p>
        {group.service === "CLOUDINARY" && <p className="mb-4 text-sm text-muted-foreground">Khi thay Cloudinary, nhập cùng lúc Cloud name, API key và API secret.</p>}
        {group.service === "OPENAI" && <p className="mb-4 text-sm text-muted-foreground">Mỗi luồng AI chọn model riêng. Danh sách chỉ gồm model API key hiện tại truy cập được và ứng dụng hỗ trợ với định dạng JSON; hãy kiểm tra chức năng sau khi đổi model.</p>}
        <div className="grid gap-4 md:grid-cols-2">{group.fields.map(field => {
          const id = `${group.service}.${field.name}`;
          const currentModel = typeof field.value === "string" ? field.value : "";
          return <div key={id} className="space-y-1">
            <label htmlFor={id} className="block text-sm font-medium">{labels[field.name] ?? field.name}</label>
            <p className="text-xs text-muted-foreground">{field.configured ? `Đã cấu hình · ${field.source}` : "Chưa cấu hình"}</p>
            {field.name.endsWith("Model") ? <><select id={id} disabled={busy !== null || pending !== null || availableModels.length === 0} className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={drafts[id] ?? currentModel} onChange={event => {
                const selected = event.target.value;
                setDrafts(old => {
                  const next = { ...old };
                  if (selected === currentModel) delete next[id]; else next[id] = selected;
                  return next;
                });
              }}>
                {!currentModel && <option value="" disabled>Chưa cấu hình</option>}{currentModel && !availableModels.includes(currentModel) && <option value={currentModel}>{currentModel}</option>}{availableModels.map(model => <option key={model} value={model}>{model}</option>)}
              </select>{modelListError && <p role="status" className="text-xs text-amber-700">{modelListError}</p>}{!modelListError && availableModels.length === 0 && <p className="text-xs text-muted-foreground">Chưa có model phù hợp từ API key hiện tại. Lưu key trước rồi tải lại danh sách.</p>}</> : <input id={id} disabled={busy !== null || pending !== null} type={secrets.has(field.name) ? "password" : field.name === "editorialTimeoutMs" ? "number" : "text"} autoComplete="off" className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder={secrets.has(field.name) ? "Nhập key mới để thay" : String(field.value ?? "Nhập giá trị mới")} value={drafts[id] ?? ""} onChange={event => setDrafts(old => ({ ...old, [id]: event.target.value }))} />}
          </div>;
        })}</div>
        <button type="button" className="mt-5 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!data.readOnly.vaultConfigured || busy !== null || (pending !== null && pending.service !== group.service)} onClick={() => void save(group.service)}>{busy === group.service ? "Đang lưu…" : pending?.service === group.service ? "Thử lại cùng yêu cầu" : "Lưu thay đổi"}</button>
      </section>)}
      {data.readOnly.previousKeyConfigured && <section className="rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">Xoay khóa mã hóa</h2><p className="mt-1 text-sm text-muted-foreground">Sau khi đặt khóa mới và khóa cũ trên Vercel, mã hóa lại các cấu hình của môi trường này. Chỉ xóa khóa cũ khỏi Vercel khi thao tác đã thành công.</p><button type="button" className="mt-3 rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50" disabled={busy !== null || (pending !== null && pending.service !== "REWRAP")} onClick={() => void rewrap()}>{busy === "REWRAP" ? "Đang mã hóa lại…" : pending?.service === "REWRAP" ? "Thử lại cùng yêu cầu" : "Mã hóa lại bằng khóa mới"}</button></section>}
      <section className="rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">Lịch sử thay đổi</h2><ul className="mt-2 space-y-2 text-sm">{data.history.map(item => <li key={item.id}>{new Date(item.createdAt).toLocaleString("vi-VN")} · {item.service} · v{item.version} · {item.changedKeys} · Admin {item.actorId}</li>)}</ul></section>
    </>}
  </main>;
}
