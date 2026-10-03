export type SignInRecoveryOutcome = "authenticated" | "unauthenticated" | "unknown";

type SessionLookup = {
  data: { user?: unknown } | null;
  error?: unknown;
};

export async function recoverSignInAfterTransportFailure(
  getSession: () => Promise<SessionLookup>,
): Promise<SignInRecoveryOutcome> {
  try {
    const session = await getSession();
    if (session.data?.user) return "authenticated";
    if (session.error) return "unknown";
    return "unauthenticated";
  } catch {
    return "unknown";
  }
}
