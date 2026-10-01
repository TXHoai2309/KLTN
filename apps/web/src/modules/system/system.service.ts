export function getHealthStatus() {
  return {
    status: "ok" as const,
    service: "KLTN",
  };
}
