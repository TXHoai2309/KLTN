export type AssistantAuthSnapshot = { userId?: string; isPending: boolean; hasError: boolean; unauthorized: boolean };

export function assistantAuthBoundary(snapshot: AssistantAuthSnapshot, confirmed: string | null): string | null {
  if (snapshot.unauthorized) return null;
  if (snapshot.isPending || snapshot.hasError) return confirmed;
  return snapshot.userId ? `USER:${snapshot.userId}` : "GUEST";
}
