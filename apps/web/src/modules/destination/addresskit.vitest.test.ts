import { describe, it, expect, vi } from "vitest";
import {
  createAddressKitAdapter,
  formatDestinationAddress,
} from "./addresskit";
const commune = {
  code: "00691",
  name: "Phường Hà Giang 2",
  provinceCode: "08",
  provinceName: "Tỉnh Tuyên Quang",
};
describe("AddressKit bounded adapter", () => {
  it("looks up province/communes through fixed server URLs, searches accents and caches with TTL", async () => {
    let now = 0;
    const transport = vi.fn(async (url: RequestInfo | URL) =>
      Response.json(
        String(url).endsWith("/provinces")
          ? { provinces: [{ code: "08", name: "Tỉnh Tuyên Quang" }] }
          : { communes: [commune] },
      ),
    );
    const adapter = createAddressKitAdapter(
      transport as typeof fetch,
      () => now,
    );
    expect((await adapter.search("ha giang")).communes).toHaveLength(1);
    expect((await adapter.search("Hà Giang")).communes).toHaveLength(1);
    expect(transport).toHaveBeenCalledTimes(2);
    now = 7 * 60 * 60 * 1000;
    await adapter.search("");
    expect(transport).toHaveBeenCalledTimes(4);
    expect(transport.mock.calls[0]?.[0]).toBe(
      "https://production.cas.so/address-kit/latest/provinces",
    );
  });
  it.each(["network", "timeout", "malformed", "province-change"])(
    "fails to explicit text fallback: %s",
    async (kind) => {
      const adapter = createAddressKitAdapter(async () => {
        if (kind === "network" || kind === "timeout") throw Error(kind);
        return Response.json(
          kind === "malformed"
            ? {}
            : { provinces: [{ code: "99", name: "Other" }] },
        );
      });
      expect(await adapter.search("x")).toMatchObject({
        available: false,
        communes: [],
      });
    },
  );
  it("formats only chosen address without inventing coordinate or legacy mapping", () => {
    expect(formatDestinationAddress("  Nhà số 1  ", commune)).toBe(
      "Nhà số 1, Phường Hà Giang 2, Tỉnh Tuyên Quang",
    );
    expect(formatDestinationAddress("Địa chỉ cũ")).toBe("Địa chỉ cũ");
  });
  it("single-flights concurrent requests", async () => {
    const transport = vi.fn(async (url: RequestInfo | URL) =>
      Response.json(
        String(url).endsWith("/provinces")
          ? { provinces: [{ code: "08", name: "Tỉnh Tuyên Quang" }] }
          : { communes: [commune] },
      ),
    );
    const adapter = createAddressKitAdapter(transport as typeof fetch);
    await Promise.all([adapter.search(""), adapter.search("Hà")]);
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
