import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TripsageMarkdown } from "../tripsage-chat/tripsage-markdown";

const WEB = process.cwd();

const TRAVELER_CSS_FILES = [
  "src/app/trips/trips.css",
  "src/components/traveler-ui/traveler-ui.css",
  "src/components/trip-timeline/day-timeline.css",
  "src/components/assistant/assistant.css",
  "src/components/assistant/assistant-citations.css",
  "src/components/assistant/assistant-weather-card.css",
  "src/components/tripsage-chat/tripsage-result-cards.module.css",
  "src/components/tripsage-chat/tripsage-memory-panel.module.css",
  "src/app/trip-companions/companion.css",
] as const;

describe("Ticket 02: Traveler CSS tokens, 2 fonts only, no full-sentence bold", () => {
  it.each(TRAVELER_CSS_FILES)(
    "%s uses only --tv-* tokens (no font-weight 650/700+, no hardcoded hex, no Inter, no non-float shadows)",
    (relPath) => {
      const css = readFileSync(resolve(WEB, relPath), "utf8");
      expect(css, `${relPath} has font-weight >= 650`).not.toMatch(/font-weight\s*:\s*(650|700|750|800|900)\b/);
      expect(css, `${relPath} has hardcoded hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css, `${relPath} references Inter`).not.toMatch(/\bInter\b/);

      const shadows = [...css.matchAll(/box-shadow\s*:\s*([^;]+);/g)].map(m =>
        m[1]!.replace(/\s*!important\s*$/, "").trim(),
      );
      for (const value of shadows) {
        expect(["none", "var(--tv-shadow-float)"], `${relPath} has disallowed box-shadow: ${value}`).toContain(value);
      }
    },
  );

  it("keeps --tv-shadow-float on the assistant composer input", () => {
    const assistantCss = readFileSync(resolve(WEB, "src/components/assistant/assistant.css"), "utf8");
    expect(assistantCss).toMatch(/\.assistant-composer-input\s*\{[^}]*box-shadow\s*:\s*var\(--tv-shadow-float\)/);
  });

  it("strips full-sentence bold in assistant markdown while preserving short inline emphasis", () => {
    const html = renderToStaticMarkup(
      createElement(TripsageMarkdown, {
        text: "Tổng chi phí ước tính là **28,6 triệu** cho 4 người.\n\n**Bạn có muốn mình tìm thêm quán ăn gần các điểm dừng không?**\n\n**Chốt ngày bay ra Hà Nội là 12/12/2026 chứ?**",
      }),
    );
    expect(html).toContain("<strong>28,6 triệu</strong>");
    expect(html).not.toContain("<strong>Bạn có muốn");
    expect(html).not.toContain("<strong>Chốt ngày bay");
    expect(html).toContain("Bạn có muốn mình tìm thêm quán ăn gần các điểm dừng không?");
    expect(html).toContain("Chốt ngày bay ra Hà Nội là 12/12/2026 chứ?");
  });
});
