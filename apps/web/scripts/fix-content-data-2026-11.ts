import { createPrismaClient, Prisma } from "@KLTN/db";
import { resolveExploreDisplayArea } from "../src/modules/destination/explore-filter-sort";
import { editorialLayoutSchema } from "../src/modules/destination-editorial/editorial-contract";

type RagTitlePatch = {
  id: string;
  oldTitle: string;
  newTitle: string;
};

type AreaPatchSpec = {
  id: string;
  name: string;
  expectedOldArea: string;
  expectedNewArea: string;
  basis: string;
};

export const B1_RAG_TITLE_PATCHES: readonly RagTitlePatch[] = [
  { id: "cmvjbs6ke000208i9ulx24h8w", oldTitle: "Chợ tình khâu vai", newTitle: "Chợ tình Khâu Vai" },
  { id: "cmvkm15t0000y08jv1xxusbga", oldTitle: "Cổng trời quản bạ", newTitle: "Cổng trời Quản Bạ" },
  { id: "cmvku9wt0000707jto99opwbt", oldTitle: "Cột cờ lũng cú", newTitle: "Cột cờ Lũng Cú" },
  { id: "cmvhqokcx000207l5smlczgcm", oldTitle: "Di tích lịch sử căng bắc mê", newTitle: "Di tích lịch sử Căng Bắc Mê" },
  { id: "cmvl8afmp000307l5spd1alef", oldTitle: "Dinh thự họ vương", newTitle: "Dinh thự họ Vương" },
  { id: "cmvukmbu8000107jr327gsy1b", oldTitle: "Ruộng bậc thang hoàng su phì", newTitle: "Ruộng bậc thang Hoàng Su Phì" },
  { id: "cmvt9th7x000108jq11imyzov", oldTitle: "Đình Chiều Lầu Thi", newTitle: "Đỉnh Chiêu Lầu Thi" },
];

export const B2_ADDRESS_PATCH = {
  id: "cmvt6u44w000108l362px0r9x",
  name: "Đỉnh Chiêu Lầu Thi",
  expectedOldPrefix: "ỉnh Chiêu Lầu Thi, ",
  newPrefix: "Đỉnh Chiêu Lầu Thi, ",
  expectedOldAddress: "ỉnh Chiêu Lầu Thi, xã Hồ Thầu, tỉnh Tuyên Quang, Xã Hồ Thầu, Tỉnh Tuyên Quang",
  newAddress: "Đỉnh Chiêu Lầu Thi, xã Hồ Thầu, tỉnh Tuyên Quang, Xã Hồ Thầu, Tỉnh Tuyên Quang",
} as const;

export const B3_OWNER_CONFIRMATION_IDS = new Set<string>([
  "cmvgb1hht000107lh49mnzwtv", // Cao nguyên đá Đồng Văn (trải 4 huyện)
]);

export const B3_AREA_PATCHES: readonly AreaPatchSpec[] = [
  { id: "cmvjbevrj000107l5pkc1kp4q", name: "Chợ tình Khâu Vai", expectedOldArea: "khu vực hà giang", expectedNewArea: "Khâu Vai", basis: "address có 'xã Khâu Vai' -> resolveExploreDisplayArea" },
  { id: "cmvklqp7c000108jvi06hb4wu", name: "Cổng trời Quản Bạ", expectedOldArea: "khu vực hà giang", expectedNewArea: "Quản Bạ", basis: "address có 'Xã Quản Bạ' -> resolveExploreDisplayArea" },
  { id: "cmvku7fq4000108jss7z5wdil", name: "Cột cờ Lũng Cú", expectedOldArea: "khu vực hà giang", expectedNewArea: "Lũng Cú", basis: "address có 'Xã Lũng Cú' -> resolveExploreDisplayArea" },
  { id: "cmvhqavct000107l6hcnk5iux", name: "Di tích Căng Bắc Mê", expectedOldArea: "khu vực hà giang", expectedNewArea: "Yên Cường", basis: "address có 'xã Yên Cường' -> resolveExploreDisplayArea" },
  { id: "cmvl82s8j000108jkkharnlgv", name: "Dinh thự họ Vương", expectedOldArea: "khu vực hà giang", expectedNewArea: "Sà Phìn", basis: "address có 'xã Sà Phìn' -> resolveExploreDisplayArea" },
  { id: "cmvkptfr5000107l55q80hi5g", name: "Làng Văn hóa du lịch cộng đồng Nặm Đăm", expectedOldArea: "khu vực hà giang", expectedNewArea: "Quản Bạ", basis: "address có 'xã Quản Bạ' -> resolveExploreDisplayArea" },
  { id: "cmvor08h1000207ldzmta1v09", name: "Làng dệt lanh Lùng Tám", expectedOldArea: "khu vực hà giang", expectedNewArea: "Lùng Tám", basis: "address có 'xã Lùng Tám' -> resolveExploreDisplayArea" },
  { id: "cmvhsmjbm000107jvtt9zzfju", name: "Làng văn hóa du lịch cộng đồng Hạ Thành", expectedOldArea: "khu vực hà giang", expectedNewArea: "TP Hà Giang", basis: "address có 'Phường Hà Giang 1' -> resolveExploreDisplayArea ('TP Hà Giang')" },
  { id: "cmvjczq9j000108jphmm6mrri", name: "Lô Lô Chải", expectedOldArea: "khu vực hà giang", expectedNewArea: "Lũng Cú", basis: "address có 'Xã Lũng Cú' -> resolveExploreDisplayArea" },
  { id: "cmvtbpn09000108l8y4t9luc2", name: "Phố cổ Đồng Văn", expectedOldArea: "khu vực hà giang", expectedNewArea: "Đồng Văn", basis: "address có 'Xã Đồng Văn' -> resolveExploreDisplayArea" },
  { id: "cmvkqrffm000107lbz5et5fyl", name: "Pả Vi Hạ – Làng Văn hóa du lịch cộng đồng dân tộc Mông Pả Vi", expectedOldArea: "khu vực hà giang", expectedNewArea: "Mèo Vạc", basis: "address có 'Xã Mèo Vạc' -> resolveExploreDisplayArea" },
  { id: "cmvksuz4w000h08jwpl5fxr4z", name: "Pả Vi Thượng", expectedOldArea: "khu vực hà giang", expectedNewArea: "Mèo Vạc", basis: "address có 'Xã Mèo Vạc' -> resolveExploreDisplayArea" },
  { id: "cmvuho815000108l9pi6zc4zm", name: "Ruộng bậc thang Hoàng Su Phì", expectedOldArea: "khu vực hà giang", expectedNewArea: "Hoàng Su Phì", basis: "address có 'Xã Hoàng Su Phì' -> resolveExploreDisplayArea" },
  { id: "cmvtdsbz1000108jumr696xmd", name: "Sông Nho Quế", expectedOldArea: "khu vực hà giang", expectedNewArea: "Mèo Vạc", basis: "address có 'xã Mèo Vạc' -> resolveExploreDisplayArea" },
  { id: "cmvsa4ob3000108l8upj3ccfu", name: "Đèo Mã Pì Lèng", expectedOldArea: "khu vực hà giang", expectedNewArea: "Đồng Văn", basis: "address ghi tuyến Đồng Văn – Mèo Vạc, kết thúc 'Xã Đồng Văn' -> resolveExploreDisplayArea" },
  { id: "cmvt6u44w000108l362px0r9x", name: "Đỉnh Chiêu Lầu Thi", expectedOldArea: "khu vực hà giang", expectedNewArea: "Hồ Thầu", basis: "address có 'xã Hồ Thầu' -> resolveExploreDisplayArea" },
];

export const B4_EDITORIAL_PATCH = {
  destinationId: "cmvgb1hht000107lh49mnzwtv",
  duplicateIndex: 18,
  duplicateSectionId: "geology-1",
  canonicalGeologyIndex: 2,
  canonicalGeologyId: "geology",
  sharedGeologyTitle: "Dấu ấn địa chất hơn 550 triệu năm",
  sungLaIndex: 9,
  sungLaSectionId: "sung-la",
  oldSungLaTitle: "Sủng Là nổi bật với cảnh quan thung lũng",
  newSungLaTitle: "Thung lũng Sủng Là",
} as const;

type EditorialSectionRecord = Record<string, unknown> & {
  id?: string;
  title?: string;
  text?: string;
};

type EditorialLayoutRecord = Record<string, unknown> & {
  schemaVersion?: number;
  sections?: EditorialSectionRecord[];
};

function sanitizeTargetLabel(urlRaw: string): { host: string; dbName: string } {
  const parsed = new URL(urlRaw);
  return {
    host: parsed.hostname,
    dbName: decodeURIComponent(parsed.pathname.replace(/^\//u, "")),
  };
}

function parseCliArgs(argv: readonly string[]) {
  const args = new Map<string, string>();
  for (const arg of argv) {
    const at = arg.indexOf("=");
    if (at < 0) args.set(arg, "true");
    else args.set(arg.slice(0, at), arg.slice(at + 1));
  }

  const allowedFlags = new Set(["--dry-run", "--apply", "--database-host", "--database-name"]);
  for (const key of args.keys()) {
    if (!allowedFlags.has(key)) throw new Error(`UNKNOWN_ARGUMENT:${key}`);
  }

  const apply = args.has("--apply");
  if (apply && args.get("--apply") !== "true") throw new Error("INVALID_APPLY_FLAG");
  if (apply && args.has("--dry-run")) throw new Error("CONFLICTING_MODE_FLAGS");

  const dbUrlRaw = process.env.DATABASE_URL ?? "";
  if (!dbUrlRaw) throw new Error("MISSING_DATABASE_URL");

  const target = sanitizeTargetLabel(dbUrlRaw);
  if (apply) {
    if (
      target.host !== args.get("--database-host") ||
      target.dbName !== args.get("--database-name")
    ) {
      throw new Error("EXPLICIT_DATABASE_TARGET_REQUIRED");
    }
  }

  return { apply, dbUrlRaw, target };
}

function transformB4Layout(rawLayout: unknown): {
  status: "READY" | "ALREADY_APPLIED" | "MISMATCH";
  reason: string;
  beforeSummary: string;
  afterSummary: string;
  nextLayout?: EditorialLayoutRecord;
} {
  if (!rawLayout || typeof rawLayout !== "object") {
    return { status: "MISMATCH", reason: "MISSING_JSON_OBJECT", beforeSummary: "null", afterSummary: "không đổi" };
  }
  const layout = rawLayout as EditorialLayoutRecord;
  const sections = Array.isArray(layout.sections) ? layout.sections : null;
  if (!sections) {
    return { status: "MISMATCH", reason: "MISSING_SECTIONS_ARRAY", beforeSummary: "không có sections[]", afterSummary: "không đổi" };
  }

  const alreadyCleaned =
    sections.length === 19 &&
    !sections.some((s) => s.id === B4_EDITORIAL_PATCH.duplicateSectionId) &&
    sections[B4_EDITORIAL_PATCH.sungLaIndex]?.id === B4_EDITORIAL_PATCH.sungLaSectionId &&
    sections[B4_EDITORIAL_PATCH.sungLaIndex]?.title === B4_EDITORIAL_PATCH.newSungLaTitle;

  if (alreadyCleaned) {
    return {
      status: "ALREADY_APPLIED",
      reason: "Đã dọn trùng section 18 và đổi tiêu đề section 9 trước đó.",
      beforeSummary: `sections=19; [9].title="${sections[B4_EDITORIAL_PATCH.sungLaIndex]?.title}"`,
      afterSummary: "(không đổi)",
    };
  }

  const sec2 = sections[B4_EDITORIAL_PATCH.canonicalGeologyIndex];
  const sec9 = sections[B4_EDITORIAL_PATCH.sungLaIndex];
  const sec18 = sections[B4_EDITORIAL_PATCH.duplicateIndex];

  if (
    sections.length !== 20 ||
    sec2?.id !== B4_EDITORIAL_PATCH.canonicalGeologyId ||
    sec2?.title !== B4_EDITORIAL_PATCH.sharedGeologyTitle ||
    sec18?.id !== B4_EDITORIAL_PATCH.duplicateSectionId ||
    sec18?.title !== B4_EDITORIAL_PATCH.sharedGeologyTitle ||
    typeof sec18?.text !== "string" ||
    typeof sec2?.text !== "string" ||
    !sec18.text.startsWith(sec2.text) ||
    sec9?.id !== B4_EDITORIAL_PATCH.sungLaSectionId ||
    sec9?.title !== B4_EDITORIAL_PATCH.oldSungLaTitle ||
    typeof sec9?.text !== "string"
  ) {
    return {
      status: "MISMATCH",
      reason: `Cấu trúc editorial khác dự kiến (len=${sections.length}, [2]=${sec2?.id}, [9]=${sec9?.id}/${sec9?.title}, [18]=${sec18?.id}/${sec18?.title}).`,
      beforeSummary: `sections=${sections.length}`,
      afterSummary: "không đổi",
    };
  }

  // Note: sec9.text on prod already starts with the full sentence "Sủng Là nổi bật với cảnh quan thung lũng, ..."
  // so we preserve sec9.text verbatim instead of duplicating the sentence at the start of the paragraph.
  const textAlreadyHasOldTitleSentence = sec9.text.startsWith(B4_EDITORIAL_PATCH.oldSungLaTitle);
  const nextSec9Text = textAlreadyHasOldTitleSentence
    ? sec9.text
    : `${B4_EDITORIAL_PATCH.oldSungLaTitle}. ${sec9.text}`;

  const nextSections = sections
    .filter((_, idx) => idx !== B4_EDITORIAL_PATCH.duplicateIndex)
    .map((sec, idx) =>
      idx === B4_EDITORIAL_PATCH.sungLaIndex
        ? { ...sec, title: B4_EDITORIAL_PATCH.newSungLaTitle, text: nextSec9Text }
        : sec,
    );

  const candidate: EditorialLayoutRecord = { ...layout, sections: nextSections };
  editorialLayoutSchema.parse(candidate);

  return {
    status: "READY",
    reason: textAlreadyHasOldTitleSentence
      ? "Xoá sections[18] trùng sections[2] (geology-1); rút tiêu đề sections[9] (đoạn văn vốn đã mở đầu bằng câu cũ nên giữ nguyên tránh lặp)."
      : "Xoá sections[18]; rút tiêu đề sections[9] và đưa câu cũ lên đầu đoạn.",
    beforeSummary: `sections=20 | [9].title="${sec9.title}" | [18].id="${sec18.id}" ("${sec18.title}")`,
    afterSummary: `sections=19 | [9].title="${B4_EDITORIAL_PATCH.newSungLaTitle}" | đã xoá [18] (${sec18.id})`,
    nextLayout: candidate,
  };
}

async function main() {
  const { apply, dbUrlRaw } = parseCliArgs(process.argv.slice(2));
  const db = createPrismaClient({ DATABASE_URL: dbUrlRaw });

  try {
    // ------------------------------------------------------------------
    // INSPECT B1 — RAG document titles
    // ------------------------------------------------------------------
    const ragIds = B1_RAG_TITLE_PATCHES.map((p) => p.id);
    const ragRows = await db.$queryRaw<
      Array<{ id: string; sourceTitle: string; status: string; publicQaApproved: boolean }>
    >(Prisma.sql`SELECT id, "sourceTitle", status::text AS status, "publicQaApproved" FROM rag_document WHERE id IN (${Prisma.join(ragIds)})`);
    const ragById = new Map(ragRows.map((r) => [r.id, r]));

    const b1Plan = B1_RAG_TITLE_PATCHES.map((patch) => {
      const cur = ragById.get(patch.id);
      if (!cur) return { ...patch, current: null, status: "NOT_IN_TARGET_DB" as const };
      if (cur.sourceTitle === patch.newTitle) return { ...patch, current: cur.sourceTitle, status: "ALREADY_APPLIED" as const };
      if (cur.sourceTitle !== patch.oldTitle) return { ...patch, current: cur.sourceTitle, status: "MISMATCH" as const };
      return { ...patch, current: cur.sourceTitle, status: "READY" as const };
    });

    // ------------------------------------------------------------------
    // INSPECT B2 — Destination address typo
    // ------------------------------------------------------------------
    const b2Rows = await db.$queryRaw<Array<{ id: string; name: string; address: string | null }>>(
      Prisma.sql`SELECT id, name, address FROM destination WHERE id = ${B2_ADDRESS_PATCH.id} LIMIT 1`,
    );
    const b2Row = b2Rows[0];
    const b2Plan = (() => {
      if (!b2Row) return { id: B2_ADDRESS_PATCH.id, name: B2_ADDRESS_PATCH.name, before: null as string | null, after: null as string | null, status: "NOT_IN_TARGET_DB" as const };
      const addr = b2Row.address ?? "";
      if (addr.startsWith(B2_ADDRESS_PATCH.newPrefix)) {
        return { id: b2Row.id, name: b2Row.name, before: addr, after: addr, status: "ALREADY_APPLIED" as const };
      }
      if (!addr.startsWith(B2_ADDRESS_PATCH.expectedOldPrefix)) {
        return { id: b2Row.id, name: b2Row.name, before: addr, after: addr, status: "MISMATCH" as const };
      }
      return {
        id: b2Row.id,
        name: b2Row.name,
        before: addr,
        after: `${B2_ADDRESS_PATCH.newPrefix}${addr.slice(B2_ADDRESS_PATCH.expectedOldPrefix.length)}`,
        status: "READY" as const,
      };
    })();

    // ------------------------------------------------------------------
    // INSPECT B3 — Area values for 22 VISIBLE destinations
    // ------------------------------------------------------------------
    const visibleDests = await db.$queryRaw<
      Array<{ id: string; name: string; area: string; address: string | null; latitude: number; longitude: number }>
    >(Prisma.sql`SELECT id, name, area, address, latitude, longitude FROM destination WHERE visibility = 'VISIBLE' AND "deletedAt" IS NULL ORDER BY name ASC`);
    const destById = new Map(visibleDests.map((d) => [d.id, d]));

    const b3PatchPlan = B3_AREA_PATCHES.map((spec) => {
      const row = destById.get(spec.id);
      if (!row) return { ...spec, currentArea: null, address: null, resolvedFromLogic: null, status: "NOT_IN_TARGET_DB" as const };
      const effectiveAddress = row.id === b2Plan.id && b2Plan.after ? b2Plan.after : row.address;
      const resolved = resolveExploreDisplayArea({
        area: "",
        address: effectiveAddress,
        latitude: row.latitude,
        longitude: row.longitude,
      });
      if (row.area === spec.expectedNewArea) {
        return { ...spec, currentArea: row.area, address: row.address, resolvedFromLogic: resolved, status: "ALREADY_APPLIED" as const };
      }
      if (row.area !== spec.expectedOldArea || resolved !== spec.expectedNewArea) {
        return { ...spec, currentArea: row.area, address: row.address, resolvedFromLogic: resolved, status: "MISMATCH" as const };
      }
      return { ...spec, currentArea: row.area, address: row.address, resolvedFromLogic: resolved, status: "READY" as const };
    });

    const b3AuditVisibleRows = visibleDests.map((d) => {
      if (d.name.startsWith("[Tam]")) {
        return { id: d.id, name: d.name, address: d.address, areaBefore: d.area, areaAfter: "(không đổi — [Tam])", basis: "Bỏ qua theo yêu cầu giữ nguyên [Tam]", action: "SKIP_TAM" };
      }
      if (B3_OWNER_CONFIRMATION_IDS.has(d.id)) {
        return { id: d.id, name: d.name, address: d.address, areaBefore: d.area, areaAfter: 'CẦN OWNER XÁC NHẬN (đề xuất "Cao nguyên đá Đồng Văn" hoặc "")', basis: "Vùng trải 4 huyện (Quản Bạ, Yên Minh, Đồng Văn, Mèo Vạc); address không gắn 1 xã", action: "NEEDS_OWNER" };
      }
      const patch = b3PatchPlan.find((p) => p.id === d.id);
      if (patch) {
        return { id: d.id, name: d.name, address: d.address, areaBefore: d.area, areaAfter: patch.expectedNewArea, basis: patch.basis, action: patch.status };
      }
      const inferred = resolveExploreDisplayArea({ area: "", address: d.address, latitude: d.latitude, longitude: d.longitude });
      return {
        id: d.id,
        name: d.name,
        address: d.address,
        areaBefore: d.area,
        areaAfter: d.area === "khu vực hà giang" ? (inferred ?? "CẦN OWNER XÁC NHẬN") : d.area,
        basis: "Bản ghi ngoài tập ID prod B3 (không nằm trong --apply)",
        action: d.area === "khu vực hà giang" ? "OUT_OF_PROD_SET" : "OK",
      };
    });

    // ------------------------------------------------------------------
    // INSPECT B4 — Cao nguyên đá Đồng Văn editorial JSON & revisions
    // ------------------------------------------------------------------
    const b4Rows = await db.$queryRaw<
      Array<{
        destinationId: string;
        schemaVersion: number;
        draftRevision: number;
        publishedRevision: number;
        draft: unknown;
        published: unknown;
      }>
    >(Prisma.sql`SELECT "destinationId", "schemaVersion", "draftRevision", "publishedRevision", draft, published FROM destination_editorial WHERE "destinationId" = ${B4_EDITORIAL_PATCH.destinationId} LIMIT 1`);
    const b4Row = b4Rows[0];
    const b4Plan = (() => {
      if (!b4Row) return { destinationId: B4_EDITORIAL_PATCH.destinationId, status: "NOT_IN_TARGET_DB" as const, reason: "Không có bản ghi editorial", beforeSummary: "-", afterSummary: "-", nextLayout: undefined, draftMatchesPublished: false, draftRevision: 0, publishedRevision: 0 };
      const draftMatchesPublished = JSON.stringify(b4Row.draft) === JSON.stringify(b4Row.published);
      const t = transformB4Layout(b4Row.published);
      return {
        destinationId: b4Row.destinationId,
        status: t.status,
        reason: t.reason,
        beforeSummary: `pubRev=${b4Row.publishedRevision}, draftRev=${b4Row.draftRevision}, draft===published=${draftMatchesPublished} | ${t.beforeSummary}`,
        afterSummary: t.status === "READY"
          ? `pubRev=${b4Row.publishedRevision + 1}, draftRev=${b4Row.draftRevision + 1}, previousPublished=published cũ | ${t.afterSummary}`
          : t.afterSummary,
        nextLayout: t.nextLayout,
        draftMatchesPublished,
        draftRevision: b4Row.draftRevision,
        publishedRevision: b4Row.publishedRevision,
      };
    })();

    // ------------------------------------------------------------------
    // APPLY (ONLY IF --apply AND TARGET MATCHED, 1 TRANSACTION PER GROUP)
    // ------------------------------------------------------------------
    const applied = { b1: 0, b2: 0, b3: 0, b4: 0 };
    if (apply) {
      const b1Ready = b1Plan.filter((p) => p.status === "READY");
      if (b1Ready.length > 0) {
        await db.$transaction(async (tx) => {
          for (const item of b1Ready) {
            const count = await tx.$executeRaw(
              Prisma.sql`UPDATE rag_document SET "sourceTitle" = ${item.newTitle}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${item.id} AND "sourceTitle" = ${item.oldTitle}`,
            );
            applied.b1 += Number(count);
          }
        });
      }

      if (b2Plan.status === "READY" && b2Plan.before !== null && b2Plan.after !== null) {
        await db.$transaction(async (tx) => {
          const count = await tx.$executeRaw(
            Prisma.sql`UPDATE destination SET address = ${b2Plan.after}, "contentRevision" = "contentRevision" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${b2Plan.id} AND address = ${b2Plan.before}`,
          );
          applied.b2 += Number(count);
        });
      }

      const b3Ready = b3PatchPlan.filter((p) => p.status === "READY");
      if (b3Ready.length > 0) {
        await db.$transaction(async (tx) => {
          for (const item of b3Ready) {
            const count = await tx.$executeRaw(
              Prisma.sql`UPDATE destination SET area = ${item.expectedNewArea}, "contentRevision" = "contentRevision" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${item.id} AND area = ${item.expectedOldArea}`,
            );
            applied.b3 += Number(count);
          }
        });
      }

      if (b4Plan.status === "READY" && b4Plan.nextLayout && b4Row) {
        const nextJson = JSON.stringify(b4Plan.nextLayout);
        await db.$transaction(async (tx) => {
          const count = b4Plan.draftMatchesPublished
            ? await tx.$executeRaw(
                Prisma.sql`UPDATE destination_editorial
                  SET "previousPublished" = published,
                      published = ${nextJson}::jsonb,
                      draft = ${nextJson}::jsonb,
                      "publishedRevision" = "publishedRevision" + 1,
                      "draftRevision" = "draftRevision" + 1,
                      "publishedAt" = CURRENT_TIMESTAMP,
                      "updatedAt" = CURRENT_TIMESTAMP
                  WHERE "destinationId" = ${b4Plan.destinationId}
                    AND "publishedRevision" = ${b4Plan.publishedRevision}
                    AND "draftRevision" = ${b4Plan.draftRevision}`,
              )
            : await tx.$executeRaw(
                Prisma.sql`UPDATE destination_editorial
                  SET "previousPublished" = published,
                      published = ${nextJson}::jsonb,
                      "publishedRevision" = "publishedRevision" + 1,
                      "publishedAt" = CURRENT_TIMESTAMP,
                      "updatedAt" = CURRENT_TIMESTAMP
                  WHERE "destinationId" = ${b4Plan.destinationId}
                    AND "publishedRevision" = ${b4Plan.publishedRevision}`,
              );
          applied.b4 += Number(count);
        });
      }
    }

    // ------------------------------------------------------------------
    // REPORT (ZERO SECRETS / ZERO DB URLs PRINTED)
    // ------------------------------------------------------------------
    console.log(
      JSON.stringify(
        {
          mode: apply ? "APPLY" : "DRY_RUN",
          applied,
          b1: b1Plan.map((p) => ({
            id: p.id,
            status: p.status,
            before: p.current ?? p.oldTitle,
            after: p.newTitle,
          })),
          b2: {
            id: b2Plan.id,
            name: b2Plan.name,
            status: b2Plan.status,
            before: b2Plan.before,
            after: b2Plan.after,
          },
          b3VisibleAudit: b3AuditVisibleRows,
          b4: {
            destinationId: b4Plan.destinationId,
            status: b4Plan.status,
            reason: b4Plan.reason,
            before: b4Plan.beforeSummary,
            after: b4Plan.afterSummary,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("FIX_CONTENT_DATA_FAILED:", err instanceof Error ? err.message : "UNKNOWN");
  process.exitCode = 1;
});
