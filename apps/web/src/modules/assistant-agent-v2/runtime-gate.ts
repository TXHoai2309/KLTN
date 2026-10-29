/** Server deployment setting. V2 is the default; explicit V1 and malformed
 * values retain the supported rollback path. Never a browser preference. */
export function assistantRuntimeVersion(value = process.env.ASSISTANT_RUNTIME_VERSION): "v1" | "v2" {
  return value === undefined || value === "v2" ? "v2" : "v1";
}
