import type { Prisma } from "@KLTN/db";
import { AppError } from "@/server/http/app-error";
import type { DestinationProfile } from "../content-profile/content-profile-contract";
import type { DestinationInput } from "./destination-contract";
import { fromMinute, toMinute } from "./destination-contract";

type Source = Prisma.ContentSourceGetPayload<object>;
type Media = Prisma.ContentMediaGetPayload<object>;
export const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
function matches(row: Record<string, unknown>, item: Record<string, unknown>) {
  return Object.entries(item).every(
    ([key, value]) => key === "id" || equal(row[key], value),
  );
}
/** Legacy replacement lists reconcile in place, rather than deleting retained children. */
function reconcile<T extends { id: string }>(
  previous: T[],
  items: Record<string, unknown>[],
  actorId: string,
  isMedia = false,
) {
  const remaining = new Map(previous.map((row) => [row.id, row]));
  const create: Record<string, unknown>[] = [],
    update: { where: { id: string }; data: Record<string, unknown> }[] = [];
  for (const [position, item] of items.entries()) {
    const { id, ...fields } = item;
    const old =
      typeof id === "string"
        ? remaining.get(id)
        : ([...remaining.values()].find((row) =>
            matches(row as Record<string, unknown>, fields),
          ) ??
          [...remaining.values()].find(
            (row) => (row as Record<string, unknown>).position === position,
          ));
    if (id && !old)
      throw new AppError(
        "INVALID_CONTENT_REFERENCES",
        "Nguồn/ảnh không thuộc điểm đến này hoặc bị lặp.",
        400,
      );
    const reviewed = Object.entries(fields).some(
      ([k, v]) => k.endsWith("Rights") && v !== "UNKNOWN",
    );
    if (old) {
      remaining.delete(old.id);
      const changes = Object.fromEntries(
        Object.entries({ ...fields, position }).filter(
          ([k, v]) => !equal((old as Record<string, unknown>)[k], v),
        ),
      );
      // Retained rights/review evidence keep their original reviewer and time.
      if (
        Object.keys(changes).some(
          (k) => k.endsWith("Rights") || k === "rightsEvidence",
        )
      )
        Object.assign(changes, {
          reviewedBy: reviewed ? actorId : null,
          reviewedAt: reviewed ? new Date() : null,
        });
      if (isMedia && changes.url) Object.assign(changes, {
        storageReference: null, websiteRights: "UNKNOWN", rightsEvidence: null,
        reviewedBy: null, reviewedAt: null,
      });
      if (Object.keys(changes).length)
        update.push({ where: { id: old.id }, data: changes });
    } else
      create.push({
        ...fields,
        position,
        reviewedBy: reviewed ? actorId : null,
        reviewedAt: reviewed ? new Date() : null,
      });
  }
  const deleteMany = [...remaining.keys()].map((id) => ({ id }));
  return {
    ...(create.length ? { create } : {}),
    ...(update.length ? { update } : {}),
    ...(deleteMany.length ? { deleteMany } : {}),
  };
}
export function legacyProfileChanges(
  previous: Record<string, unknown>,
  profile: DestinationProfile,
  actorId: string,
  keys: string[],
) {
  const data: Record<string, unknown> = {};
  for (const key of keys) {
    if (key === "sources" || key === "media") {
      const change = reconcile(
        (previous[key] ?? []) as (Source | Media)[],
        profile[key] as unknown as Record<string, unknown>[],
        actorId,
        key === "media",
      );
      if (Object.keys(change).length) data[key] = change;
    } else if (key === "areaIds") {
      const old = ((previous.areas ?? []) as { id: string }[])
        .map((r) => r.id)
        .sort();
      if (!equal(old, profile.areaIds))
        data.areas = { set: profile.areaIds.map((id) => ({ id })) };
    } else if (key === "cultureIds") {
      const old = (
        (previous.cultureLinks ?? []) as { cultureId: string }[]
      ).map((r) => r.cultureId);
      const removed = old.filter((id) => !profile.cultureIds.includes(id));
      const added = profile.cultureIds.filter((id) => !old.includes(id));
      if (removed.length || added.length)
        data.cultureLinks = {
          ...(removed.length
            ? { deleteMany: { cultureId: { in: removed } } }
            : {}),
          ...(added.length
            ? { create: added.map((cultureId) => ({ cultureId })) }
            : {}),
        };
    } else if (!equal(previous[key], profile[key as keyof DestinationProfile]))
      data[key] = profile[key as keyof DestinationProfile];
  }
  return data;
}
export function openingChanges(
  previous: {
    dayOfWeek: string;
    status: string;
    intervals: { id?: string; opensAtMinute: number; closesAtMinute: number }[];
  }[],
  days: DestinationInput["openingDays"],
) {
  return days.flatMap((day) => {
    const old = previous.find((d) => d.dayOfWeek === day.dayOfWeek);
    if (!old)
      throw new AppError(
        "INVALID_DESTINATION_INPUT",
        "Lịch hoạt động cũ thiếu ngày, cần rà soát dữ liệu.",
        409,
      );
    const before = old.intervals.map((i) => ({
      opensAt: fromMinute(i.opensAtMinute),
      closesAt: fromMinute(i.closesAtMinute),
    }));
    if (old.status === day.status && equal(before, day.intervals)) return [];
    const retained = (i: { opensAtMinute: number; closesAtMinute: number }) =>
      day.intervals.some((n) => toMinute(n.opensAt) === i.opensAtMinute);
    return [
      {
        where: { dayOfWeek: day.dayOfWeek },
        data: {
          status: day.status,
          intervals: {
            deleteMany: old.intervals
              .filter((i) => !retained(i))
              .map((i) => ({ opensAtMinute: i.opensAtMinute })),
            updateMany: day.intervals.flatMap((n) => {
              const match = old.intervals.find(
                (i) => i.opensAtMinute === toMinute(n.opensAt),
              );
              return match && match.closesAtMinute !== toMinute(n.closesAt)
                ? [
                    {
                      where: { opensAtMinute: match.opensAtMinute },
                      data: { closesAtMinute: toMinute(n.closesAt) },
                    },
                  ]
                : [];
            }),
            create: day.intervals
              .filter(
                (n) =>
                  !old.intervals.some(
                    (i) => toMinute(n.opensAt) === i.opensAtMinute,
                  ),
              )
              .map((i) => ({
                opensAtMinute: toMinute(i.opensAt),
                closesAtMinute: toMinute(i.closesAt),
              })),
          },
        },
      },
    ];
  });
}
