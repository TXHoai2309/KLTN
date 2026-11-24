import { cleanDocumentSourceTitle } from "@/lib/traveler-display-clean";
import type { TimelineSuggestion } from "./tripsage-timeline";

export interface KnowledgeSnippet {
  title: string;
  content: string;
}

export interface PreferenceStopRef {
  day: number;
  order: number;
  id: string;
  name: string;
  area?: string;
}

export interface GroundedPreferenceLabel {
  kind: "CLOUD_HUNTING" | "LOCAL_FOOD";
  slotId: string;
  stopId?: string;
  badge: string;
  detail: string;
  sourceTitle: string;
}

function fold(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\p{M}\p{Cf}]/gu, "")
    .replace(/đ/gu, "d")
    .replace(/\s+/gu, " ")
    .trim();
}

export function detectStatedPreferences(userTexts: readonly string[]): {
  wantsCloudHunting: boolean;
  wantsLocalFood: boolean;
} {
  const joined = fold(userTexts.join(" "));
  return {
    wantsCloudHunting: /\b(?:san may|bien may|ngam may)\b/u.test(joined),
    wantsLocalFood: /\b(?:an dac san|dac san|am thuc|mon ngon|thang co|lau ga den|chao au tau|men men|banh cuon)\b/u.test(joined),
  };
}

const KNOWN_DISHES: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /\bthang co\b/u, label: "Thắng cố" },
  { pattern: /\blau ga den\b/u, label: "Lẩu gà đen" },
  { pattern: /\bchao au tau\b/u, label: "Cháo ấu tẩu" },
  { pattern: /\bbanh cuon\b/u, label: "Bánh cuốn trứng Đồng Văn" },
  { pattern: /\bmen men\b/u, label: "Mèn mén" },
  { pattern: /\bpho chua\b/u, label: "Phở chua" },
  { pattern: /\bthit trau gac bep\b/u, label: "Thịt trâu gác bếp" },
];

/**
 * Slim D22, BR-6, AC-8: turns stated preferences ("săn mây", "ăn đặc sản") into grounded labels/suggestions
 * ONLY when reviewed local knowledge documents contain matching evidence.
 * Never alters visit clock times and never enters Constraint Validator.
 */
export function buildGroundedPreferenceLabels(input: {
  userTexts: readonly string[];
  stops: readonly PreferenceStopRef[];
  knowledgeChunks: readonly KnowledgeSnippet[];
}): GroundedPreferenceLabel[] {
  if (input.knowledgeChunks.length === 0 || input.stops.length === 0) return [];
  const { wantsCloudHunting, wantsLocalFood } = detectStatedPreferences(input.userTexts);
  if (!wantsCloudHunting && !wantsLocalFood) return [];

  const out: GroundedPreferenceLabel[] = [];

  if (wantsCloudHunting) {
    const cloudDocs = input.knowledgeChunks.filter((chunk) =>
      /\b(?:san may|bien may|may mu)\b/u.test(fold(`${chunk.title} ${chunk.content}`)),
    );
    if (cloudDocs.length > 0) {
      const combinedCloudText = fold(cloudDocs.map((c) => `${c.title} ${c.content}`).join(" "));
      const timeHintMatch = /(\d{1,2}[:h]\d{0,2}\s*[-–]\s*\d{1,2}[:h]\d{0,2})/iu.exec(
        cloudDocs.map((c) => c.content).join(" "),
      );
      const timeHint = timeHintMatch ? timeHintMatch[1]!.replace(/h/gi, ":") : "sáng sớm 05:30–07:00";

      for (const stop of input.stops) {
        const nameFold = fold(stop.name);
        const areaFold = fold(stop.area ?? "");
        const matchedDoc = cloudDocs.find((doc) => {
          const docFold = fold(`${doc.title} ${doc.content}`);
          return (nameFold.length >= 4 && docFold.includes(nameFold))
            || (areaFold.length >= 4 && docFold.includes(areaFold) && /\b(?:cong troi|deo|dinh|chieu lau thi|quan ba|ma pi leng|dong van|lung cu)\b/u.test(nameFold));
        });
        if (matchedDoc || (combinedCloudText.includes(nameFold) && nameFold.length >= 4)) {
          const cleanTitle = cleanDocumentSourceTitle((matchedDoc ?? cloudDocs[0]!).title) || (matchedDoc ?? cloudDocs[0]!).title;
          out.push({
            kind: "CLOUD_HUNTING",
            slotId: `d${stop.day}-visit-${stop.order}`,
            stopId: stop.id,
            badge: "Săn mây",
            detail: `Gợi ý đi sáng sớm (${timeHint}) theo tài liệu "${cleanTitle}"`,
            sourceTitle: cleanTitle,
          });
          if (out.filter((x) => x.kind === "CLOUD_HUNTING").length >= 2) break;
        }
      }
    }
  }

  if (wantsLocalFood) {
    const matchedDishes: { label: string; sourceTitle: string }[] = [];
    for (const doc of input.knowledgeChunks) {
      const docFold = fold(`${doc.title} ${doc.content}`);
      for (const dish of KNOWN_DISHES) {
        if (dish.pattern.test(docFold) && !matchedDishes.some((d) => d.label === dish.label)) {
          const cleanTitle = cleanDocumentSourceTitle(doc.title) || doc.title;
          matchedDishes.push({ label: dish.label, sourceTitle: cleanTitle });
        }
      }
    }
    if (matchedDishes.length > 0) {
      const days = [...new Set(input.stops.map((s) => s.day))].sort((a, b) => a - b);
      days.slice(0, 3).forEach((day, idx) => {
        const dish = matchedDishes[idx % matchedDishes.length]!;
        out.push({
          kind: "LOCAL_FOOD",
          slotId: `d${day}-lunch`,
          badge: "Ăn đặc sản",
          detail: `Gợi ý thử ${dish.label} (theo tài liệu "${dish.sourceTitle}")`,
          sourceTitle: dish.sourceTitle,
        });
      });
    }
  }

  return out;
}

/** Converts grounded preference labels into unchecked TimelineSuggestions (never Validator input). */
export function preferenceLabelsToSuggestions(labels: readonly GroundedPreferenceLabel[]): TimelineSuggestion[] {
  return labels.map((item) => ({
    slotId: item.slotId,
    kind: item.kind === "LOCAL_FOOD" ? "MEAL" : "TIP",
    title: item.badge,
    detail: item.detail,
  }));
}
