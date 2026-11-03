import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { companionFormFixture, publicCompanionFixture } from "@/modules/trip-companions/companion-fixtures";

type Element = { type: unknown; props: Record<string, any> };
type Slot = { value?: any };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const nodes = (tree: any): Element[] => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === "object" && "props" in tree ? [tree, ...nodes(tree.props.children)] : [];
const text = (tree: any): string => Array.isArray(tree) ? tree.map(text).join("")
  : tree && typeof tree === "object" && "props" in tree ? text(tree.props.children)
  : typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" },
});
const preview = (title = "Cùng khám phá Hà Giang (2 ngày)") => json({
  success: true, data: { introduction: { ...publicCompanionFixture.introduction, title } },
});
const success = () => json({
  success: true, operationStatus: "SUCCESS", data: { tripId: "trip-flow", publicationId: "publication-flow" },
});

async function setup() {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../../app/trips/[id]/publication/publication-form-client.tsx", import.meta.url))],
    bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", logLevel: "silent",
    external: ["react", "react/*", "next/*", "lucide-react", "sonner", "@/components/trip-companions/companion-introduction-view"],
  });
  const require = createRequire(import.meta.url), slots: Slot[] = [];
  let cursor = 0;
  const slot = () => slots[cursor++] ?? (slots[cursor - 1] = {});
  const hooks = { ...require("react"),
    useState: (initial: any) => {
      const s = slot(); if (!("value" in s)) s.value = typeof initial === "function" ? initial() : initial;
      return [s.value, (next: any) => { s.value = typeof next === "function" ? next(s.value) : next; }];
    },
    useRef: (initial: any) => { const s = slot(); return s.value ?? (s.value = { current: initial }); },
    useId: () => { const s = slot(); return s.value ?? (s.value = `publication-flow-${cursor}`); },
  };
  const jsx = (type: unknown, props: Record<string, any>): Element => ({ type, props });
  const push = vi.fn(), toast = { success: vi.fn() };
  const module = { exports: {} as { PublicationFormClient: (props: object) => Element } };
  new Function("require", "module", "exports", bundle.outputFiles[0]!.text)((id: string) => {
    if (id === "react") return hooks;
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (id === "next/navigation") return { useRouter: () => ({ push }) };
    if (id === "next/link") return { default: "Link", __esModule: true };
    if (id === "lucide-react") return new Proxy({}, { get: (_object, key) => String(key) });
    if (id === "sonner") return { toast };
    if (id === "@/components/trip-companions/companion-introduction-view") return { CompanionIntroductionView: "Introduction" };
    return require(id);
  }, module, module.exports);
  const context = structuredClone(companionFormFixture);
  const render = () => {
    cursor = 0;
    let tree = module.exports.PublicationFormClient({ tripId: "trip-flow", context });
    // The public wrapper may delegate its editable state to a keyed child.
    while (typeof tree.type === "function") tree = tree.type(tree.props);
    return nodes(tree);
  };
  const button = (label: string) => {
    const element = render().find(node => node.type === "button" && text(node) === label);
    if (!element) throw new Error(`Missing button: ${label}`);
    return element;
  };
  const titleInput = () => render().find(node => node.type === "input" && node.props.type === "text")!;
  const submit = () => render().find(node => node.type === "form")!.props.onSubmit({ preventDefault() {} });
  const openPreview = () => button("Xem trước (Góc nhìn người xem)").props.onClick();
  const confirm = () => button("Xác nhận công khai").props.onClick();
  const request = (fetcher: ReturnType<typeof vi.fn>, index: number) => {
    const [url, init] = fetcher.mock.calls[index]!;
    return { url, body: JSON.parse(init.body), key: new Headers(init.headers).get("Idempotency-Key") };
  };
  return { render, button, titleInput, submit, preview: openPreview, confirm, request, push, toast };
}

afterEach(() => vi.unstubAllGlobals());

describe("Publication form actual handlers and mutation transport", () => {
  it("submitting the edit form previews without publishing, then confirms the reviewed payload", async () => {
    const t = await setup();
    const fetcher = vi.fn().mockResolvedValueOnce(preview()).mockResolvedValueOnce(success());
    vi.stubGlobal("fetch", fetcher);
    t.submit(); await tick();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(t.request(fetcher, 0).url).toMatch(/\/publication\/preview$/);
    expect(t.request(fetcher, 0).body).not.toHaveProperty("confirm");
    t.confirm(); await tick();
    expect(t.request(fetcher, 1).body).toEqual({ ...t.request(fetcher, 0).body, confirm: true });
    expect(t.push).toHaveBeenCalledWith("/trip-companions/publication-flow");
  });

  it("freezes all fields and replays the identical body/key after UNKNOWN", async () => {
    const t = await setup();
    const fetcher = vi.fn().mockResolvedValueOnce(preview()).mockRejectedValueOnce(new TypeError("Lost acknowledgement"))
      .mockResolvedValueOnce(success());
    vi.stubGlobal("fetch", fetcher);
    const initialTitle = t.titleInput();
    const imageChoice = t.render().find(node => node.props.role === "radio" && text(node) === "Không dùng ảnh")!;
    t.preview(); await tick(); t.confirm(); await tick();
    initialTitle.props.onChange({ target: { value: "Changed after UNKNOWN" } });
    imageChoice.props.onClick();
    t.button("Soạn nội dung").props.onClick();
    expect(t.button("Soạn nội dung").props.disabled).toBe(true);
    // A callback captured before the lock must not change the attempted payload.
    const frozenTitle = t.request(fetcher, 1).body.title;
    const retry = t.button("Thử lại kiểm tra");
    retry.props.onClick(); await tick();
    expect(t.request(fetcher, 2)).toEqual(t.request(fetcher, 1));
    expect(t.request(fetcher, 2).body.title).toBe(frozenTitle);
    expect(t.push).toHaveBeenCalledTimes(1);
  });

  it("ignores a preview result when its draft was edited while the request was pending", async () => {
    const t = await setup();
    let release!: (response: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    t.preview();
    t.titleInput().props.onChange({ target: { value: "Changed while preview pending" } });
    release(preview()); await tick();
    expect(t.render().find(node => node.type === "Introduction")).toBeUndefined();
    expect(t.render().find(node => node.type === "button" && text(node) === "Xác nhận công khai")).toBeUndefined();
    expect(t.titleInput().props.value).toBe("Changed while preview pending");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("requires another preview after editing and rejects a stale confirmation callback", async () => {
    const t = await setup();
    const fetcher = vi.fn().mockResolvedValueOnce(preview()).mockResolvedValueOnce(preview("Reviewed version B"))
      .mockResolvedValueOnce(success());
    vi.stubGlobal("fetch", fetcher);
    t.preview(); await tick();
    const staleConfirm = t.button("Xác nhận công khai").props.onClick;
    t.button("Chỉnh sửa thêm").props.onClick();
    t.titleInput().props.onChange({ target: { value: "Reviewed version B" } });
    staleConfirm(); await tick();
    expect(fetcher).toHaveBeenCalledTimes(1);
    t.preview(); await tick(); t.confirm(); await tick();
    expect(t.request(fetcher, 2).body.title).toBe("Reviewed version B");
  });

  it("prevents image changes while publishing and keeps the same snapshot for retry", async () => {
    const t = await setup();
    let release!: (response: Response) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(preview())
      .mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValueOnce(success());
    vi.stubGlobal("fetch", fetcher);
    const initialTitle = t.titleInput();
    const imageChoice = t.render().find(node => node.props.role === "radio" && text(node) === "Không dùng ảnh")!;
    t.preview(); await tick(); t.confirm();
    initialTitle.props.onChange({ target: { value: "Changed during publish" } });
    imageChoice.props.onClick();
    release(json({ success: false, operationStatus: "UNKNOWN", error: { code: "OPERATION_STATUS_UNKNOWN", message: "Uncertain" } }, 503));
    await tick();
    t.button("Thử lại kiểm tra").props.onClick(); await tick();
    expect(t.request(fetcher, 2)).toEqual(t.request(fetcher, 1));
  });

  it("keeps the draft after a known failure but creates a new reviewed attempt/key after correction", async () => {
    const t = await setup();
    const fetcher = vi.fn().mockResolvedValueOnce(preview())
      .mockResolvedValueOnce(json({ success: false, operationStatus: "FAILED", error: { code: "COMPANION_IMAGE_UNAVAILABLE", message: "Choose another image" } }, 422))
      .mockResolvedValueOnce(preview("Corrected draft")).mockResolvedValueOnce(success());
    vi.stubGlobal("fetch", fetcher);
    t.preview(); await tick(); t.confirm(); await tick();
    expect(t.titleInput().props.value).toBe(t.request(fetcher, 1).body.title);
    t.titleInput().props.onChange({ target: { value: "Corrected draft" } });
    t.preview(); await tick(); t.confirm(); await tick();
    expect(t.request(fetcher, 3).key).not.toBe(t.request(fetcher, 1).key);
    expect(t.request(fetcher, 3).body.title).toBe("Corrected draft");
  });

  it("guards rapid double confirmation and retains the confirmed-success state while navigating", async () => {
    const t = await setup();
    let release!: (response: Response) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(preview())
      .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    t.preview(); await tick();
    const confirm = t.button("Xác nhận công khai").props.onClick;
    confirm(); confirm();
    expect(fetcher).toHaveBeenCalledTimes(2);
    release(success()); await tick();
    confirm(); await tick();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(t.toast.success).toHaveBeenCalledTimes(1);
  });
});
