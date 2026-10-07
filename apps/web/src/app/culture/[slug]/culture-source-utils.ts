export function safeCultureSourceUrl(url: string | null): string | null {
  const normalized = url?.trim();
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? normalized
      : null;
  } catch {
    return null;
  }
}

export function sortCultureSources<T extends { sortOrder: number }>(
  sources: readonly T[],
): T[] {
  return sources
    .map((source, index) => ({ source, index }))
    .sort(
      (left, right) =>
        left.source.sortOrder - right.source.sortOrder ||
        left.index - right.index,
    )
    .map(({ source }) => source);
}
