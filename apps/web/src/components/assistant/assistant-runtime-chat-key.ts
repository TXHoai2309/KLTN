/** Selects the assistant chat instance across auth and QA-session bootstrap. */
export function assistantRuntimeChatKey(boundary: string, identity: string | null): string {
  return identity === null ? `bootstrap:${boundary}` : `ready:${identity}`;
}
