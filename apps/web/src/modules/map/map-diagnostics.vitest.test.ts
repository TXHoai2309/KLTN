import { expect, it } from "vitest";
import { mapFailureDiagnostic } from "./map-diagnostics";
import { startMapSession } from "./map-session";

it("classifies only observed status or error evidence without logging URLs or credentials", () => {
  for (const status of [401, 403]) expect(mapFailureDiagnostic("provider", { error: { status, message: "https://provider.invalid/?api_key=synthetic-secret" } })).toEqual({ stage: "provider", code: "AUTHORIZATION", httpStatus: status });
  expect(mapFailureDiagnostic("mount", new Error("Failed to initialize WebGL"))).toEqual({ stage: "mount", code: "WEBGL" });
  expect(mapFailureDiagnostic("load", new Error("Worker import failed"))).toEqual({ stage: "load", code: "WORKER" });
  expect(mapFailureDiagnostic("timeout")).toEqual({ stage: "timeout", code: "TIMEOUT" });
  expect(mapFailureDiagnostic("provider", { error: { status: "403", message: "private details" } })).toEqual({ stage: "provider", code: "UNKNOWN" });
});

it("reports provider failures once and refuses late success after disposal", async () => {
  const states: string[] = [], diagnostics: unknown[] = [];
  let fail!: (error?: unknown) => void, ready!: () => void;
  const stop = startMapSession({ load: async () => 1, onState: value => states.push(value), onDiagnostic: value => diagnostics.push(value), mount: (_, yes, no) => { ready = yes; fail = no; return () => {}; } });
  await new Promise<void>(resolve => setImmediate(resolve));
  fail({ error: { status: 403, message: "synthetic-secret" } }); fail(); ready(); stop();
  expect(states).toEqual(["loading", "error"]);
  expect(diagnostics).toEqual([{ stage: "provider", code: "AUTHORIZATION", httpStatus: 403 }]);
});
