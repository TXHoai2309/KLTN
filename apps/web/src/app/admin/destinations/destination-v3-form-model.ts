import type { DestinationDto } from "@/modules/destination/destination-contract";
import { unknownSchedule } from "@/modules/destination/destination-contract";
import type { DestinationV3Input } from "@/modules/destination/destination-v3-contract";
export function destinationDraft(dto?: DestinationDto) {
  return {
    name: dto?.name ?? "",
    description: dto?.description ?? "",
    category: dto?.category ?? "",
    googleMapsUrl: dto?.profile?.googleMapsUrl ?? "",
    address: dto?.profile?.address ?? "",
    suggestedDurationMinutes:
      dto?.suggestedDurationMinutes == null
        ? ""
        : String(dto.suggestedDurationMinutes),
    minimumDurationMinutes:
      dto?.minimumDurationMinutes == null
        ? ""
        : String(dto.minimumDurationMinutes),
    openingDays: dto?.openingDays ?? unknownSchedule(),
    sources: (dto?.profile?.sources ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      url: s.url ?? "",
    })),
  };
}
export type DestinationDraft = ReturnType<typeof destinationDraft>;
export function destinationDraftPayload(
  draft: DestinationDraft,
  dto?: DestinationDto,
): DestinationV3Input {
  const baseline = destinationDraft(dto);
  const payload: DestinationV3Input = {
    formVersion: "V3",
    ...(dto ? { expectedUpdatedAt: dto.updatedAt } : {}),
  };
  for (const key of [
    "name",
    "description",
    "category",
    "googleMapsUrl",
  ] as const)
    if (!dto || draft[key] !== baseline[key]) payload[key] = draft[key];
  if (!dto || draft.address !== baseline.address)
    payload.address = draft.address.trim() || null;
  for (const key of [
    "suggestedDurationMinutes",
    "minimumDurationMinutes",
  ] as const)
    if (!dto || draft[key] !== baseline[key])
      payload[key] = draft[key].trim() ? Number(draft[key]) : null;
  if (
    JSON.stringify(draft.openingDays) !== JSON.stringify(baseline.openingDays)
  )
    payload.openingDays = draft.openingDays;
  const changes = draft.sources.filter(
    (s) =>
      !s.id ||
      !baseline.sources.some(
        (b) => b.id === s.id && b.title === s.title && b.url === s.url,
      ),
  );
  if (changes.length) payload.sources = changes;
  const removed = baseline.sources.flatMap((s) =>
    s.id && !draft.sources.some((n) => n.id === s.id) ? [s.id] : [],
  );
  if (removed.length) payload.removedSourceIds = removed;
  return payload;
}
