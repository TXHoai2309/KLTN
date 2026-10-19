import { describe, it, expect, vi } from "vitest";
import {
  resolveMapsUrl,
  mapsUrl,
  publicIp,
  admitMapsResolution,
} from "./maps-url-resolver";
import {
  routingRegistry,
  routingCandidateAllowed,
} from "./destination-routing-registry";
describe("Maps URL resolver without Places", () => {
  it.each([
    "https://www.google.com/maps/search/?api=1&query=23.391%2C105.308",
    "https://www.google.com/maps?q=23.391,105.308",
    "https://www.google.com/maps/place/test/@1,2,10z/data=!3d23.391!4d105.308",
  ])("resolves explicit point %s", async (url) => {
    expect(await resolveMapsUrl(url)).toMatchObject({
      status: "RESOLVED",
      latitude: 23.391,
      longitude: 105.308,
    });
  });
  it.each([
    "https://www.google.com/maps/place/Test/@23,105,10z",
    "https://www.google.com/maps/search/?api=1&query=Lung+Cu",
    "https://www.google.com/maps/search/?query_place_id=ChIJtest&query=23,105",
  ])("does not infer %s", async (url) => {
    expect((await resolveMapsUrl(url)).status).toBe("UNSUPPORTED");
  });
  it.each([
    "http://www.google.com/maps?q=23,105",
    "https://google.com.evil.org/maps?q=23,105",
    "https://user:pass@google.com/maps?q=23,105",
    "https://127.0.0.1/maps",
    "https://google.com:444/maps",
    "https://google.com/other?q=23,105",
  ])("rejects unsafe input %s", (url) => expect(() => mapsUrl(url)).toThrow());
  it("rejects conflicting or invalid coordinates", async () => {
    expect(
      (await resolveMapsUrl("https://google.com/maps?q=91,105")).status,
    ).toBe("UNRESOLVED");
    expect(
      (await resolveMapsUrl("https://google.com/maps?q=23,105&query=24,105"))
        .status,
    ).toBe("AMBIGUOUS");
  });
  it("resolves short link and validates every redirect", async () => {
    const redirect = vi.fn(async () => "https://www.google.com/maps?q=23,105");
    expect(
      (await resolveMapsUrl("https://maps.app.goo.gl/test", { redirect }))
        .status,
    ).toBe("RESOLVED");
    for (const target of [
      "https://evil.org/",
      "https://127.0.0.1/",
      "https://google.com.evil.org/maps",
    ]) {
      expect(
        (
          await resolveMapsUrl("https://maps.app.goo.gl/test", {
            redirect: async () => target,
          })
        ).status,
      ).toBe("UNRESOLVED");
    }
  });
  it("caps redirects, handles network/timeout without coordinates", async () => {
    const redirect = vi.fn(async () => "https://maps.app.goo.gl/loop");
    expect(
      (await resolveMapsUrl("https://maps.app.goo.gl/test", { redirect }))
        .status,
    ).toBe("UNRESOLVED");
    expect(redirect).toHaveBeenCalledTimes(4);
    const controller = new AbortController();
    controller.abort();
    expect(
      (
        await resolveMapsUrl("https://maps.app.goo.gl/test", {
          signal: controller.signal,
        })
      ).status,
    ).toBe("UNRESOLVED");
    expect(
      (
        await resolveMapsUrl("https://maps.app.goo.gl/test", {
          redirect: async () => {
            throw Error("network");
          },
        })
      ).latitude,
    ).toBeUndefined();
  });
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
  ])("blocks non-public DNS %s", (ip) => expect(publicIp(ip)).toBe(false));
  it("accepts public addresses and rate-limits per actor with expiry", () => {
    expect(publicIp("8.8.8.8")).toBe(true);
    expect(publicIp("2607:f8b0:4001::1")).toBe(true);
    for (let n = 0; n < 12; n++) admitMapsResolution("test-only", 0);
    expect(() => admitMapsResolution("test-only", 1)).toThrow();
    expect(() => admitMapsResolution("test-only", 60001)).not.toThrow();
  });
  it("registry isolates reviewed region ID by actual environment; POI still eligible", () => {
    const reg = routingRegistry(
      "postgresql://test@ep-purple-pond-b3xujb8o-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
    );
    expect(routingCandidateAllowed("cmv7kc5eu0003209w9ggzpolq", reg)).toBe(
      false,
    );
    expect(routingCandidateAllowed("poi", reg)).toBe(true);
    expect(
      routingCandidateAllowed(
        "poi",
        routingRegistry("postgresql://test@other.example.invalid/neondb"),
      ),
    ).toBe(false);
  });
});
