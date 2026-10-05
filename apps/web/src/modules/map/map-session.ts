/** Small provider lifecycle boundary; injectable in tests, no fake runtime provider. */
export function startMapSession<T>({ load, mount, onState, schedule = callback => setTimeout(callback, 15000), cancel = timer => clearTimeout(timer) }: {
  load: () => Promise<T>;
  mount: (libraries: T, ready: () => void, fail: () => void) => () => void;
  onState: (state: "loading" | "ready" | "error") => void;
  schedule?: (callback: () => void) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  let active = true; let failed = false; let dispose = () => {};
  onState("loading");
  const timer = schedule(() => fail());
  function fail() { if (active && !failed) { failed = true; cancel(timer); dispose(); onState("error"); } }
  Promise.resolve().then(load).then(libraries => {
    if (!active || failed) return;
    dispose = mount(libraries, () => { if (active && !failed) { cancel(timer); onState("ready"); } }, fail);
    if (!active || failed) dispose();
  }).catch(fail);
  return () => { active = false; cancel(timer); dispose(); };
}
