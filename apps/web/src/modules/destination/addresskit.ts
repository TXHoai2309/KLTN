import { z } from "zod";
import {
  communeSchema,
  addressSearchText,
  type Commune,
} from "./address-contract";
export {
  communeSchema,
  addressSearchText,
  formatDestinationAddress,
  type Commune,
} from "./address-contract";
export function createAddressKitAdapter(
  transport: typeof fetch = fetch,
  now = () => Date.now(),
) {
  let cached: { until: number; communes: Commune[] } | undefined;
  let active: Promise<Commune[]> | undefined;
  async function read(path: string) {
    const response = await transport(
      "https://production.cas.so/address-kit" + path,
      {
        signal: AbortSignal.timeout(5000),
        redirect: "error",
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
    );
    if (!response.ok || !response.body) throw Error("AddressKit unavailable");
    const reader = response.body.getReader();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 500_000) {
          await reader.cancel();
          throw Error("AddressKit response too large");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  }
  async function load() {
    const provinces = z
      .object({
        provinces: z
          .array(z.object({ code: z.string(), name: z.string() }))
          .max(100),
      })
      .parse(await read("/latest/provinces"));
    if (
      !provinces.provinces.some(
        (p) =>
          p.code === "08" && addressSearchText(p.name) === "tinh tuyen quang",
      )
    )
      throw Error("Province mapping changed");
    const data = z
      .object({ communes: z.array(communeSchema).max(500) })
      .parse(await read("/latest/provinces/08/communes"));
    if (new Set(data.communes.map((c) => c.code)).size !== data.communes.length)
      throw Error("Invalid communes");
    cached = { until: now() + 6 * 60 * 60 * 1000, communes: data.communes };
    return data.communes;
  }
  return {
    async search(query: string) {
      try {
        let communes: Commune[];
        if (cached && cached.until > now()) communes = cached.communes;
        else {
          active ??= load().finally(() => {
            active = undefined;
          });
          communes = await active;
        }
        const term = addressSearchText(query);
        return {
          available: true,
          communes: communes
            .filter((c) => addressSearchText(c.name).includes(term))
            .sort((a, b) => a.name.localeCompare(b.name, "vi")),
          reason: null,
        };
      } catch {
        return {
          available: false,
          communes: [] as Commune[],
          reason:
            "Danh mục xã/phường tạm không khả dụng. Bạn có thể nhập địa chỉ văn bản; nội dung đang nhập được giữ nguyên.",
        };
      }
    },
  };
}
export const addressKitAdapter = createAddressKitAdapter();
