export const BROWSER_LOCATION_TIMEOUT_MS = 10_000;

export type BrowserLocationResult =
  | {
      status: "OK";
      latitude: number;
      longitude: number;
      accuracyMeters: number;
      /** Browser acquisition timestamp, in milliseconds since the Unix epoch. */
      capturedAt: number;
    }
  | { status: "DENIED" | "UNAVAILABLE" | "TIMEOUT" | "UNSUPPORTED" };

export type BrowserGeolocation = Pick<Geolocation, "getCurrentPosition">;

/** Call from an explicit button handler; importing this module does no work. */
export function requestBrowserLocation(
  geolocation: BrowserGeolocation | null | undefined,
): Promise<BrowserLocationResult> {
  if (!geolocation) return Promise.resolve({ status: "UNSUPPORTED" });

  return new Promise(resolve => {
    let settled = false;
    const finish = (result: BrowserLocationResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    // Also bound the caller's wait if the browser never invokes either callback.
    const timer = setTimeout(() => finish({ status: "TIMEOUT" }), BROWSER_LOCATION_TIMEOUT_MS);

    try {
      geolocation.getCurrentPosition(
        position => {
          if (settled) return;
          finish({
            status: "OK",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
            capturedAt: position.timestamp,
          });
        },
        error => finish({
          status: error.code === 1 ? "DENIED" : error.code === 3 ? "TIMEOUT" : "UNAVAILABLE",
        }),
        {
          timeout: BROWSER_LOCATION_TIMEOUT_MS,
          // Avoid requesting a slower, more battery-intensive high-accuracy fix by default.
          enableHighAccuracy: false,
          maximumAge: 0,
        },
      );
    } catch {
      finish({ status: "UNAVAILABLE" });
    }
  });
}
