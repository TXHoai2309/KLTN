export const DEFAULT_AUTH_RETURN_TO = "/dashboard";

const INTERNAL_ORIGIN = "https://auth-return.invalid";
const MALFORMED_PERCENT_ESCAPE = /%(?![\da-f]{2})/i;
const ENCODED_PATH_SEPARATOR = /%(?:25)*(?:2f|5c)/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const SENSITIVE_CONTEXT_PARAMETERS = new Set([
  "password",
  "passwd",
  "passphrase",
  "credential",
  "credentials",
  "authorization",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "authtoken",
  "secret",
  "cookie",
  "session",
  "body",
  "requestbody",
  "payload",
  "mutation",
  "pendingaction",
]);

function hasSensitiveContextParameter(search: string): boolean {
  for (const rawName of new URLSearchParams(search).keys()) {
    let name = rawName;

    for (let attempt = 0; attempt <= rawName.length; attempt++) {
      const normalizedName = name.toLowerCase().replace(/[^a-z]/g, "");
      if (SENSITIVE_CONTEXT_PARAMETERS.has(normalizedName)) return true;

      const decodedName = decodeURIComponent(name);
      if (decodedName === name) break;
      name = decodedName;
    }
  }

  return false;
}

export function resolveAuthReturnTo(value: string | string[] | null | undefined): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    CONTROL_CHARACTER.test(value) ||
    MALFORMED_PERCENT_ESCAPE.test(value)
  ) {
    return DEFAULT_AUTH_RETURN_TO;
  }

  try {
    decodeURIComponent(value);
    const target = new URL(value, INTERNAL_ORIGIN);
    const decodedPath = decodeURIComponent(target.pathname);

    if (
      target.origin !== INTERNAL_ORIGIN ||
      target.username !== "" ||
      target.password !== "" ||
      hasSensitiveContextParameter(target.search) ||
      ENCODED_PATH_SEPARATOR.test(target.pathname) ||
      MALFORMED_PERCENT_ESCAPE.test(decodedPath) ||
      !decodedPath.startsWith("/") ||
      decodedPath.startsWith("//") ||
      decodedPath.includes("\\")
    ) {
      return DEFAULT_AUTH_RETURN_TO;
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return DEFAULT_AUTH_RETURN_TO;
  }
}

export function buildAuthLoginHref(returnTo: string): string {
  return `/login?returnTo=${encodeURIComponent(resolveAuthReturnTo(returnTo))}`;
}
