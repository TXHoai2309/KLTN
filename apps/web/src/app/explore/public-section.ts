import { AppError } from "@/server/http/app-error";
export async function loadPublicSection<T>(load: () => Promise<T>, message: string): Promise<{ data: T; error?: never } | { error: string; data?: never }> {
  try { return { data: await load() }; }
  catch (error) { return { error: error instanceof AppError ? error.message : message }; }
}
export function culturePageHref(params: URLSearchParams, page: number): `/explore?${string}` {
  const next = new URLSearchParams(params); next.set("culturePage", String(page)); return `/explore?${next}`;
}
