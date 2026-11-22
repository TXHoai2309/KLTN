"use client";

import { useCallback, useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@KLTN/ui/components/tooltip";
import type { RuntimeService } from "@/modules/runtime-config/runtime-config-contract";

type Field = { name: string; configured: boolean; source: "CMS" | "ENV"; value: string | number | boolean | null };
type Overview = {
  scope: string;
  services: { service: RuntimeService; version: number; updatedAt: string | null; fields: Field[]; canMoveCredentials: boolean }[];
  readOnly: { embedding: string; vaultConfigured: boolean; previousKeyConfigured: boolean; blobConfigured: boolean };
  history: { id: string; service: string; version: number; changedKeys: string; actorId: string; createdAt: string }[];
};
type MutationResponse = { success: boolean; operationStatus: "SUCCESS" | "FAILED" | "UNKNOWN"; error?: { message: string } };
const labels: Record<string, string> = {
  apiKey: "API key", apiSecret: "API secret", cloudName: "Cloud name",
  preferenceModel: "Model phân tích nhu cầu", editorialModel: "Model biên tập",
  qaModel: "Model QA", editorialTimeoutMs: "Timeout biên tập (ms)",
  chatEnabled: "Chat lập hành trình", budget: "Ước tính ngân sách", flights: "Tra cứu chuyến bay",
  hotels: "Tra cứu khách sạn", memory: "Ghi nhớ sở thích", calendar: "Xuất lịch chuyến đi",
  amadeusEnvironment: "Môi trường Amadeus", tripAssistantAgentEnabled: "Trợ lý chỉnh sửa chuyến đã lưu",
  provider: "Nhà cung cấp bản đồ", googleMapId: "Google Map ID", enabled: "Bật trợ lý hỏi đáp",
  abuseProtectionAccepted: "Xác nhận bảo vệ chống lạm dụng", databaseHost: "Host database cho hỏi đáp",
  databaseName: "Tên database cho hỏi đáp", localNetworkId: "Định danh mạng local", legacySourceFilter: "Bộ lọc nguồn theo ID",
  publicSourceIds: "Danh sách ID nguồn công khai", cleanupEnabled: "Bật endpoint dọn dữ liệu hỏi đáp",
  cleanupDatabaseHost: "Host database cho dọn dữ liệu", cleanupDatabaseName: "Tên database cho dọn dữ liệu",
};
const serviceLabels: Record<RuntimeService, string> = { APPLICATION: "Tính năng ứng dụng", MAPS: "Bản đồ", QA: "Trợ lý hỏi đáp và lưu trữ", OPENAI: "OpenAI", CLOUDINARY: "Cloudinary", STADIA: "Stadia Routing" };
const selectOptions: Record<string, readonly [string, string][]> = {
  amadeusEnvironment: [["test", "Thử nghiệm"], ["production", "Chính thức"]],
  provider: [["GOOGLE", "Google Maps"], ["STADIA", "Stadia Maps"]],
};
const descriptions: Record<RuntimeService, Record<string, string>> = {
  APPLICATION: {
    chatEnabled: "Hiện chế độ Lập hành trình trong trợ lý và cho phép khách đăng nhập lập kế hoạch bằng hội thoại.",
    budget: "Cho phép trợ lý cộng các khoản chi ước tính và so với ngân sách của chuyến đi.",
    flights: "Cho phép trợ lý tra giá vé máy bay tham khảo từ Duffel bằng token đặt trong env.",
    hotels: "Cho phép trợ lý tra khách sạn và giá phòng tham khảo từ Amadeus quanh điểm đến đã chọn.",
    memory: "Cho phép khách quản lý sở thích đã lưu và dùng lại chúng trong các cuộc trò chuyện lập hành trình.",
    calendar: "Hiện nút tải tệp .ics để đưa các điểm dừng có giờ vào ứng dụng lịch.",
    amadeusEnvironment: "Chọn máy chủ thử nghiệm hoặc máy chủ chính thức cho tra cứu khách sạn. Dùng thông tin xác thực tương ứng.",
    tripAssistantAgentEnabled: "Dùng trợ lý có công cụ mô phỏng và kiểm tra khi sửa chuyến đã lưu. Tắt để dùng luồng tư vấn cơ bản.",
  },
  MAPS: {
    provider: "Dùng cùng nhà cung cấp cho bản đồ tương tác, tìm điểm xuất phát và tính tuyến mới. Tải lại trang để cập nhật bản đồ đang mở.",
    googleMapId: "ID tài nguyên Google Maps cho giao diện bản đồ và ghim nâng cao. Khóa JavaScript và khóa máy chủ được khai báo trong env.",
  },
  QA: {
    enabled: "Cho phép trợ lý hỏi đáp hoạt động ở môi trường này khi đã xác nhận chống lạm dụng và database khớp.",
    abuseProtectionAccepted: "Xác nhận bạn đã kiểm tra giới hạn truy cập và chống lạm dụng trước khi mở trợ lý hỏi đáp.",
    databaseHost: "Tên máy chủ Neon phải khớp host trong DATABASE_URL để trợ lý hỏi đáp được bật.",
    databaseName: "Tên database phải khớp DATABASE_URL. Điền cùng host để tránh mở hỏi đáp trên nhầm dữ liệu.",
    localNetworkId: "Định danh mạng dùng kiểm thử giới hạn truy cập ở máy phát triển, chỉ có hiệu lực ở Local.",
    legacySourceFilter: "Giới hạn tìm kiếm và trích dẫn trong danh sách ID bên dưới. Nguồn vẫn phải được duyệt để dùng cho hỏi đáp công khai.",
    publicSourceIds: "Các ID nguồn được phép tra cứu khi bật bộ lọc, phân cách bằng dấu phẩy.",
    cleanupEnabled: "Cho phép endpoint dọn hội thoại và dữ liệu hỏi đáp hết hạn. Job định kỳ và CRON_SECRET cần được cấu hình riêng.",
    cleanupDatabaseHost: "Host database mà endpoint dọn dữ liệu được phép chạy. Phải khớp DATABASE_URL.",
    cleanupDatabaseName: "Tên database được phép dọn dữ liệu. Chỉ dọn khi cả tên và host khớp DATABASE_URL.",
  },
  OPENAI: {
    apiKey: "Xác thực các yêu cầu OpenAI của hệ thống, gồm hỏi đáp, lập hành trình, biên tập và tạo vector tài liệu.",
    preferenceModel: "Trích xuất ngày, số ngày, phương tiện và sở thích từ mô tả chuyến đi của khách.",
    editorialModel: "Đề xuất cách biên tập và trình bày nội dung điểm đến trong trang quản trị.",
    qaModel: "Soạn câu trả lời của trợ lý hỏi đáp du lịch dựa trên các nguồn đã duyệt.",
    editorialTimeoutMs: "Số mili giây tối đa hệ thống chờ OpenAI trả đề xuất biên tập điểm đến.",
  },
  CLOUDINARY: {
    cloudName: "Tên môi trường Cloudinary lưu ảnh điểm đến của dự án.",
    apiKey: "Định danh tài khoản Cloudinary dùng cho thao tác ảnh từ máy chủ.",
    apiSecret: "Dùng để ký các thao tác tải lên và quản lý ảnh Cloudinary từ máy chủ.",
  },
  STADIA: { apiKey: "Xác thực yêu cầu tính tuyến và thời gian di chuyển khi ứng dụng dùng Stadia.", },
};
const secrets = new Set(["apiKey", "apiSecret"]);
const modelMessages = { preferenceModel: "model phân tích nhu cầu", editorialModel: "model biên tập", qaModel: "model QA" } as const;

function SettingHelp({ label, description }: { label: string; description: string }) {
  return <Tooltip>
    <TooltipTrigger aria-label={`Giải thích ${label}`} className="inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold text-muted-foreground outline-offset-2 hover:text-foreground focus-visible:outline-2">
      <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded-full border border-current">?</span>
    </TooltipTrigger>
    <TooltipContent>{description}</TooltipContent>
  </Tooltip>;
}

function DeploymentSettings({ settings }: { settings: Overview["readOnly"] }) {
  const fields = [
    { label: "Kho tài liệu RAG", value: settings.blobConfigured ? "Đã cấu hình" : "Chưa cấu hình", description: "Vercel Blob lưu tài liệu nguồn cho trợ lý hỏi đáp. Token ghi được đặt ở môi trường triển khai." },
    { label: "Model tạo vector", value: settings.embedding, description: "Chuyển tài liệu và câu hỏi thành vector để tìm nguồn liên quan. Model và số chiều phải tương thích với chỉ mục hiện tại." },
  ];
  return <section className="rounded-xl border bg-card p-5">
    <h2 className="text-lg font-semibold">Cấu hình triển khai</h2>
    <dl className="mt-3 grid gap-4 md:grid-cols-2">
      {fields.map(field => <div key={field.label}>
        <dt className="flex items-center gap-1 text-sm font-medium">{field.label}<SettingHelp label={field.label} description={field.description} /></dt>
        <dd className="text-sm text-muted-foreground">{field.value}</dd>
      </div>)}
    </dl>
  </section>;
}

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

  async function save(service: RuntimeService, action: "changes" | "current" | "env" = "changes") {
    const existing = pending?.service === service ? pending : null;
    const appGroup = service === "APPLICATION" || service === "QA" || service === "MAPS";
    const changes = Object.fromEntries(Object.entries(drafts).filter(([name, value]) => name.startsWith(`${service}.`) && (appGroup || value.trim() !== "")).map(([name, value]) => {
      const field = name.split(".")[1]!;
      const currentValue = data?.services.find(group => group.service === service)?.fields.find(item => item.name === field)?.value;
      if (typeof currentValue === "boolean") return [field, value === "true"];
      return [field, field === "editorialTimeoutMs" ? Number(value) : value.trim()];
    }));
    if (!existing && action === "changes" && !Object.keys(changes).length) { setError("Nhập ít nhất một giá trị cần thay."); return; }
    const body = action === "env" ? { service, changes: {}, useEnvironmentCredentials: true } : { service, changes, ...(action === "current" ? { saveCurrent: true } : {}) };
    const request = existing ?? { service, body: JSON.stringify(body), key: crypto.randomUUID() };
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

  return <TooltipProvider delay={150}><main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
    <header><h1 className="text-2xl font-semibold">Cấu hình hệ thống</h1><p className="text-sm text-muted-foreground">Thiết lập áp dụng cho môi trường đang mở. Các khóa dịch vụ chỉ hiện trạng thái cấu hình.</p></header>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
    {!data && !error && <p role="status">Đang tải cấu hình…</p>}
    {data && <>
      <p className="text-sm">Môi trường: <strong>{data.scope}</strong></p>
      {!data.readOnly.vaultConfigured && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Đặt khóa mã hóa cấu hình trong env để Admin lưu được thiết lập.</p>}
      {data.services.map(group => <section key={group.service} className="rounded-xl border bg-card p-5" aria-label={serviceLabels[group.service]}>
        <h2 className="mb-1 text-lg font-semibold">{serviceLabels[group.service]}</h2>
        <p className="mb-4 text-xs text-muted-foreground">Phiên bản {group.version}{group.updatedAt ? ` · cập nhật ${new Date(group.updatedAt).toLocaleString("vi-VN")}` : " · dùng cấu hình triển khai hoặc mặc định"}</p>
        {group.service === "OPENAI" && <p className="mb-4 text-sm text-muted-foreground">Mỗi luồng AI chọn model riêng. Danh sách chỉ gồm model API key hiện tại truy cập được và ứng dụng hỗ trợ với định dạng JSON; hãy kiểm tra chức năng sau khi đổi model.</p>}
        <div className="grid gap-4 md:grid-cols-2">{group.fields.map(field => {
          const id = `${group.service}.${field.name}`;
          const label = labels[field.name] ?? field.name;
          const description = descriptions[group.service][field.name];
          const editableCurrent = group.service === "QA" || group.service === "MAPS";
          const currentValue = String(field.value ?? "");
          const options = typeof field.value === "boolean" ? [["false", "Tắt"], ["true", "Bật"]] : selectOptions[field.name];
          const currentModel = typeof field.value === "string" ? field.value : "";
          if (secrets.has(field.name) || group.service === "CLOUDINARY") return <div key={id}>
            <div className="flex items-center gap-1 text-sm font-medium">
              {label}{description && <SettingHelp label={label} description={description} />}
            </div>
            <p className="text-xs text-muted-foreground">{field.configured ? field.source === "ENV" ? "Đã cấu hình trong env" : "Đang dùng cấu hình lưu trước đây" : "Chưa cấu hình trong env"}</p>
          </div>;
          function setDraft(value: string) {
            setDrafts(old => {
              if (value !== currentValue) return { ...old, [id]: value };
              const next = { ...old };
              delete next[id];
              return next;
            });
          }
          return <div key={id} className="space-y-1">
            <div className="flex items-center gap-1">
              <label htmlFor={id} className="text-sm font-medium">{label}</label>
              {description && <SettingHelp label={label} description={description} />}
            </div>
            <p className="text-xs text-muted-foreground">{field.configured ? field.source === "CMS" ? "Đã lưu trong quản trị" : "Triển khai hoặc mặc định" : "Chưa cấu hình"}</p>
            {options ? <select id={id} disabled={busy !== null || pending !== null} className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={drafts[id] ?? currentValue} onChange={event => setDraft(event.target.value)}>
                {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select> : field.name.endsWith("Model") ? <><select id={id} disabled={busy !== null || pending !== null || availableModels.length === 0} className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={drafts[id] ?? currentModel} onChange={event => {
                const selected = event.target.value;
                setDrafts(old => {
                  const next = { ...old };
                  if (selected === currentModel) delete next[id]; else next[id] = selected;
                  return next;
                });
              }}>
                {!currentModel && <option value="" disabled>Chưa cấu hình</option>}{currentModel && !availableModels.includes(currentModel) && <option value={currentModel}>{currentModel}</option>}{availableModels.map(model => <option key={model} value={model}>{model}</option>)}
              </select>{modelListError && <p role="status" className="text-xs text-amber-700">{modelListError}</p>}{!modelListError && availableModels.length === 0 && <p className="text-xs text-muted-foreground">Chưa có model phù hợp. Kiểm tra khóa OpenAI đang dùng rồi tải lại trang.</p>}</> : <input id={id} disabled={busy !== null || pending !== null} type={field.name === "editorialTimeoutMs" ? "number" : "text"} autoComplete="off" className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder={String(field.value || "Nhập giá trị mới")} value={drafts[id] ?? (editableCurrent ? currentValue : "")} onChange={event => editableCurrent ? setDraft(event.target.value) : setDrafts(old => ({ ...old, [id]: event.target.value }))} />}
          </div>;
        })}</div>
        {group.service !== "CLOUDINARY" && group.service !== "STADIA" && <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!data.readOnly.vaultConfigured || busy !== null || (pending !== null && pending.service !== group.service)} onClick={() => void save(group.service)}>{busy === group.service ? "Đang lưu…" : pending?.service === group.service ? "Thử lại cùng yêu cầu" : "Lưu thay đổi"}</button>
          {group.fields.some(field => field.source === "ENV" && field.configured && !secrets.has(field.name)) && (
            <button type="button" className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50" disabled={!data.readOnly.vaultConfigured || busy !== null || pending !== null} onClick={() => void save(group.service, "current")}>
              Lưu cấu hình đang dùng
            </button>
          )}
        </div>}
        {(group.canMoveCredentials || (pending?.service === group.service && (group.service === "CLOUDINARY" || group.service === "STADIA"))) && <div className="mt-4 flex items-center gap-1">
          <button type="button" className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50" disabled={!data.readOnly.vaultConfigured || busy !== null || (pending !== null && pending.service !== group.service)} onClick={() => void save(group.service, "env")}>
            {pending?.service === group.service ? "Thử lại cùng yêu cầu" : "Chuyển sang khóa trong env"}
          </button>
          <SettingHelp label="Chuyển sang khóa trong env" description="Xóa thông tin xác thực ghi đè đã lưu của dịch vụ này để dùng các khóa trong env. Kiểm tra khóa trong env trước khi chuyển." />
        </div>}
      </section>)}
      <DeploymentSettings settings={data.readOnly} />
      {data.readOnly.previousKeyConfigured && <section className="rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">Xoay khóa mã hóa</h2><p className="mt-1 text-sm text-muted-foreground">Sau khi đặt khóa mới và khóa cũ trên Vercel, mã hóa lại các cấu hình của môi trường này. Chỉ xóa khóa cũ khỏi Vercel khi thao tác đã thành công.</p><button type="button" className="mt-3 rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50" disabled={busy !== null || (pending !== null && pending.service !== "REWRAP")} onClick={() => void rewrap()}>{busy === "REWRAP" ? "Đang mã hóa lại…" : pending?.service === "REWRAP" ? "Thử lại cùng yêu cầu" : "Mã hóa lại bằng khóa mới"}</button></section>}
      <section className="rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">Lịch sử thay đổi</h2><ul className="mt-2 space-y-2 text-sm">{data.history.map(item => <li key={item.id}>{new Date(item.createdAt).toLocaleString("vi-VN")} · {item.service} · v{item.version} · {item.changedKeys} · Admin {item.actorId}</li>)}</ul></section>
    </>}
  </main></TooltipProvider>;
}
