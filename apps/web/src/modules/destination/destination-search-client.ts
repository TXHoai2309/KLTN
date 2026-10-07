import { z } from "zod";
import { parsePublicListQuery, publicLocationListSchema, type PublicLocationList } from "./public-destination-query";

export type DestinationRequestState =
  | { status: "loading" }
  | { status: "ready"; data: PublicLocationList }
  | { status: "error" };

/** One destination request. Cleanup also guards transports that complete after abort. */
export function startDestinationRequest(
  params: URLSearchParams,
  onState: (state: DestinationRequestState) => void,
  fetcher: typeof fetch = fetch,
): () => void {
  const controller = new AbortController();
  onState({ status: "loading" });
  void (async () => {
    try {
      const query = new URLSearchParams(parsePublicListQuery(params));
      const response = await fetcher(`/api/destinations${query.size ? `?${query}` : ""}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Destination request failed");
      const result = z.object({ success: z.literal(true), data: publicLocationListSchema }).parse(await response.json());
      if (!controller.signal.aborted) onState({ status: "ready", data: result.data });
    } catch {
      if (!controller.signal.aborted) onState({ status: "error" });
    }
  })();
  return () => controller.abort();
}
