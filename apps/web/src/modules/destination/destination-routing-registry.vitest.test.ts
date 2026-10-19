import { describe, expect, it } from "vitest";
import { routingCandidateAllowed, routingRegistry } from "./destination-routing-registry";

const host = (endpoint: string, pooled = false) => `postgresql://test:test@${endpoint}${pooled ? "-pooler" : ""}.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`;
describe("reviewed routing database identity", () => {
  it.each([false, true])("recognizes the independently reviewed Production endpoint (pooled=%s)", pooled => {
    const registry = routingRegistry(host("ep-blue-art-b3v3vr4h", pooled));
    expect(registry).toEqual({ verified: true, excludedIds: [] });
    expect(routingCandidateAllowed("cmv97lcrq0016z09ws0o74lqp", registry)).toBe(true);
    // Development exclusion IDs must not be copied to Production.
    expect(routingCandidateAllowed("cmv7kc5eu0003209w9ggzpolq", registry)).toBe(true);
  });
  it.each([false, true])("keeps the Development exclusions scoped to Development (pooled=%s)", pooled => {
    const registry = routingRegistry(host("ep-purple-pond-b3xujb8o", pooled));
    expect(registry.verified).toBe(true);
    expect(routingCandidateAllowed("cmv7kc5eu0003209w9ggzpolq", registry)).toBe(false);
  });
  it.each(["", "not a URL", host("ep-unknown"), host("ep-blue-art-b3v3vr4h").replace("neondb?", "other?"),
    host("ep-purple-pond-b3xujb8o").replace(".c-4.ap-southeast-1.aws.neon.tech", ".example.invalid"),
    host("ep-purple-pond-b3xujb8o").replace("postgresql:", "https:"),
    host("ep-blue-art-b3v3vr4h").replace("/neondb", ":9999/neondb"),
    host("ep-blue-art-b3v3vr4h") + "#unexpected"])("rejects unknown or malformed database identity safely: %s", input => {
    expect(routingRegistry(input)).toEqual({ verified: false, excludedIds: [] });
    expect(routingCandidateAllowed("public-id", routingRegistry(input))).toBe(false);
  });
});
