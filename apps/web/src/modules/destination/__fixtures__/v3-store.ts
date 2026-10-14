/** TEST ONLY. In-memory Prisma adapter for service/browser failure tests. Never imported by runtime. */
import type { Database } from "@KLTN/db";
import { AppError } from "@/server/http/app-error";
import type { DestinationDependencies } from "../destination-service";
export function v3TestStore(role: string | null = "ADMIN") {
  let rows = new Map<string, any>(),
    records = new Map<string, any>(),
    seq = 0,
    fail = false;
  const defaults = {
    aliases: [],
    shortDescription: null,
    address: null,
    googleMapsUrl: null,
    locationVerified: false,
    locationEvidence: null,
    ticketPrice: null,
    ticketVerification: "UNKNOWN",
    ticketEvidence: null,
    bestVisitTime: null,
    visitNotes: null,
    contentRevision: 1,
    areas: [],
    sources: [],
    media: [],
    cultureLinks: [],
    suggestedDurationMinutes: null,
    minimumDurationMinutes: null,
  };
  const child = (value: any, kind: string) => ({
    id: `${kind}-${++seq}`,
    url: null,
    author: null,
    publisher: null,
    publishedOn: null,
    claim: null,
    websiteRights: "UNKNOWN",
    indexingRights: "UNKNOWN",
    openAiRights: "UNKNOWN",
    rightsEvidence: null,
    reviewedBy: null,
    reviewedAt: null,
    position: 0,
    ...value,
  });
  function project(row: any, select: any): any {
    if (!select) return structuredClone(row);
    return Object.fromEntries(
      Object.entries(select).map(([k, v]: any) => {
        const value = row[k];
        if (v === true) return [k, value];
        if (Array.isArray(value)) {
          let values = value;
          if (v.where?.websiteRights)
            values = values.filter(
              (x) => x.websiteRights === v.where.websiteRights,
            );
          return [k, values.map((x) => project(x, v.select))];
        }
        return [k, value];
      }),
    );
  }
  function relation(previous: any[], change: any, kind: string) {
    let values = structuredClone(previous);
    if (change.deleteMany) {
      const predicates = Array.isArray(change.deleteMany)
        ? change.deleteMany
        : [change.deleteMany];
      values = values.filter(
        (v: any) =>
          !predicates.some((p: any) =>
            Object.entries(p).every(([k, x]: any) =>
              x?.in ? x.in.includes(v[k]) : v[k] === x,
            ),
          ),
      );
    }
    for (const update of change.updateMany ?? [])
      for (const row of values)
        if (Object.entries(update.where).every(([k, v]) => row[k] === v))
          Object.assign(row, update.data);
    for (const update of change.update ?? []) {
      const old = values.find((v: any) => v.id === update.where.id);
      if (!old) throw new AppError("TEST_NOT_FOUND", "Missing child", 400);
      Object.assign(old, update.data);
    }
    for (const created of change.create ?? [])
      values.push(child(created, kind));
    return values;
  }
  const db: any = {
    user: {
      findUnique: async () => (role ? { id: "test-admin", role } : null),
    },
    area: {
      findMany: async ({ where }: any) =>
        where.id.in.map((id: string) => ({ id })),
    },
    community: {},
    cultureContent: {
      findMany: async ({ where }: any) =>
        where.id.in.map((id: string) => ({ id })),
    },
    destination: {
      findUnique: async ({ where, select }: any) => {
        const row = rows.get(where.id);
        return row && (!where.visibility || row.visibility === where.visibility)
          ? project(row, select)
          : null;
      },
      findMany: async ({ where = {}, select, skip = 0, take = 999 }: any) =>
        [...rows.values()]
          .filter(
            (row) =>
              (!where.visibility || row.visibility === where.visibility) &&
              (!where.id?.in || where.id.in.includes(row.id)),
          )
          .slice(skip, skip + take)
          .map((row) => project(row, select)),
      create: async ({ data, select }: any) => {
        const id = `destination-${++seq}`;
        const row = {
          ...structuredClone(defaults),
          ...data,
          id,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        };
        row.openingDays = data.openingDays.create.map((d: any) => ({
          id: `day-${++seq}`,
          ...d,
          intervals: d.intervals.create.map((i: any) => ({
            id: `interval-${++seq}`,
            ...i,
          })),
        }));
        for (const k of ["sources", "media"])
          row[k] = relation([], data[k] ?? {}, k);
        row.areas = data.areas?.connect ?? [];
        row.cultureLinks = data.cultureLinks?.create ?? [];
        rows.set(id, row);
        return project(row, select);
      },
      update: async ({ where, data, select }: any) => {
        const row = rows.get(where.id);
        if (!row) throw Error("missing");
        for (const [key, value] of Object.entries(data)) {
          if (key === "sources" || key === "media")
            row[key] = relation(row[key], value, key);
          else if (key === "openingDays") {
            for (const u of (value as any).update) {
              const d = row.openingDays.find(
                (d: any) =>
                  d.dayOfWeek === u.where.destinationId_dayOfWeek.dayOfWeek,
              );
              d.status = u.data.status;
              d.intervals = relation(d.intervals, u.data.intervals, "interval");
            }
          } else if (key === "contentRevision")
            row[key] += (value as any).increment;
          else if (key === "areas") row.areas = (value as any).set;
          else row[key] = value;
        }
        row.updatedAt = new Date(row.updatedAt.getTime() + 1000);
        if (fail)
          throw new AppError(
            "TEST_ROLLBACK",
            "Injected failure after writes",
            400,
          );
        return project(row, select);
      },
    },
    idempotencyRecord: {
      findUnique: async ({ where }: any) =>
        records.get(JSON.stringify(where.scope_key)) ?? null,
      create: async ({ data }: any) => {
        records.set(JSON.stringify({ scope: data.scope, key: data.key }), data);
        return data;
      },
      update: async ({ where, data }: any) =>
        Object.assign(records.get(JSON.stringify(where.scope_key)), data),
    },
    $transaction: async (fn: any) => {
      const before = structuredClone({ rows, records });
      try {
        return await fn(db);
      } catch (e) {
        rows = before.rows;
        records = before.records;
        throw e;
      }
    },
  };
  const deps: DestinationDependencies = {
    database: db as Database,
    resolveSession: async () => (role ? { user: { id: "test-admin" } } : null),
  };
  return {
    deps,
    rows: () => rows,
    records: () => records,
    failNext: () => {
      fail = true;
    },
    clearFailure: () => {
      fail = false;
    },
  };
}
