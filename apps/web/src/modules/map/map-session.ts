/** Small provider lifecycle boundary; injectable in tests, no fake runtime provider. */
import { mapFailureDiagnostic, reportMapFailure, type MapFailureDiagnostic } from "./map-diagnostics";
export function startMapSession<T>({ load, mount, onState, onDiagnostic = reportMapFailure, schedule = callback => setTimeout(callback, 15000), cancel = timer => clearTimeout(timer) }: {
  load: () => Promise<T>;
  mount: (libraries: T, ready: () => void, fail: (error?: unknown) => void) => () => void;
  onState: (state: "loading" | "ready" | "error") => void;
  onDiagnostic?: (diagnostic: MapFailureDiagnostic) => void;
  schedule?: (callback: () => void) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  let active = true; let failed = false; let dispose = () => {};
  onState("loading");
  let stage: MapFailureDiagnostic["stage"] = "load";
  const timer = schedule(() => fail(undefined, "timeout"));
  function fail(error?: unknown, at = stage) { if (active && !failed) { failed = true; cancel(timer); dispose(); onDiagnostic(mapFailureDiagnostic(at, error)); onState("error"); } }
  Promise.resolve().then(load).then(libraries => {
    if (!active || failed) return;
    stage = "mount";
    dispose = mount(libraries, () => { if (active && !failed) { cancel(timer); onState("ready"); } }, error => fail(error, "provider"));
    if (!active || failed) dispose();
  }).catch(fail);
  return () => { active = false; cancel(timer); dispose(); };
}
