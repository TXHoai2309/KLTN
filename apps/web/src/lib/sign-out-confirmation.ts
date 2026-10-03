export async function isSignOutConfirmed(
  signOut: () => Promise<Response>,
): Promise<boolean> {
  try {
    const response = await signOut();
    if (!response.ok) return false;

    const result: unknown = await response.json();
    return (
      typeof result === "object" &&
      result !== null &&
      "success" in result &&
      result.success === true &&
      "operationStatus" in result &&
      result.operationStatus === "SUCCESS"
    );
  } catch {
    return false;
  }
}
