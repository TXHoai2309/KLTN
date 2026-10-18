export type MapFailureDiagnostic = {
  stage: "load" | "mount" | "provider" | "timeout";
  code: "AUTHORIZATION" | "HTTP" | "WEBGL" | "WORKER" | "TIMEOUT" | "UNKNOWN";
  httpStatus?: number;
};

/** Never log provider URLs/messages: they can contain credentials or user data. */
export function mapFailureDiagnostic(stage: MapFailureDiagnostic["stage"], value?: unknown): MapFailureDiagnostic {
  const event = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const error = event.error && typeof event.error === "object" ? event.error as Record<string, unknown> : event;
  const status = typeof error.status === "number" && Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : undefined;
  const message = typeof error.message === "string" ? error.message : "";
  const code = stage === "timeout" ? "TIMEOUT" : status === 401 || status === 403 ? "AUTHORIZATION"
    : status ? "HTTP" : /webgl|context.*(?:create|initializ)|(?:create|initializ).*context/iu.test(message) ? "WEBGL"
      : /worker/iu.test(message) ? "WORKER" : "UNKNOWN";
  return { stage, code, ...(status ? { httpStatus: status } : {}) };
}

export function reportMapFailure(diagnostic: MapFailureDiagnostic) {
  console.warn("KLTN_MAP_FAILURE", diagnostic);
}
