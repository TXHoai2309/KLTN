// A navigation notice can only originate from a confirmed write response.
let pending = false;
export function markDestinationSaved() { pending = true; }
export function takeDestinationSaved() {
  const saved = pending;
  pending = false;
  return saved;
}
