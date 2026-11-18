import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} }),
  usePathname: () => "/trips/trip-1/edit",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));

import AddVisitDrawer from "./add-visit-drawer";
import AiEditBar from "./ai-edit-bar";
import EditTripClient from "./edit-trip-client";
import { COMPLETE_JOURNEY_FIXTURE } from "@/modules/trip-origin/trip-origin-fixtures";
import type { EditCandidate } from "@/modules/trip-edit/edit-candidate";
import type { EditPlaceDetail } from "@/modules/trip-edit/trip-edit-service";
import { editCandidateToPlannerDays } from "@/modules/trip-edit/edit-map-adapter";

const candidate: EditCandidate = {
  startDate: "2026-12-01",
  durationDays: 2,
  transport: "CAR",
  days: [
    {
      dayIndex: 1,
      visits: [
        { visitId: "v1", destinationId: "d1", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
        { visitId: "v2", destinationId: "d2", startMinute: 600, plannedDurationMinutes: 90, order: 2 },
      ],
    },
    {
      dayIndex: 2,
      visits: [
        { visitId: "v3", destinationId: "d1", startMinute: 540, plannedDurationMinutes: 60, order: 1 },
      ],
    },
  ],
};

const placeDetails: Record<string, EditPlaceDetail> = {
  d1: {
    id: "d1",
    name: "Cột cờ Lũng Cú",
    area: "Đồng Văn",
    latitude: 23.3615,
    longitude: 105.3195,
    availability: "AVAILABLE",
    external: false,
  },
  d2: {
    id: "d2",
    name: "Điểm đã ẩn",
    area: "Mèo Vạc",
    availability: "UNAVAILABLE",
    external: false,
  },
};

describe("Ticket 01 workspace rendering and map adapter", () => {
  it("converts EditCandidate to PlannerDays with mapped coordinates and legs", () => {
    const days = editCandidateToPlannerDays(candidate, placeDetails);
    expect(days).toHaveLength(2);
    expect(days[0]!.stops).toHaveLength(2);
    expect(days[0]!.stops[0]!.destination.latitude).toBe(23.3615);
    expect(days[0]!.stops[1]!.inbound?.geometry?.coordinates).toHaveLength(2);
  });

  it("renders unified workspace with inline visit controls, Undo/Redo, map, and confirmation dialog", () => {
    const html = renderToStaticMarkup(createElement(EditTripClient, {
      tripId: "trip-1",
      baseRevision: "2026-11-18T00:00:00.000Z",
      initialCandidate: candidate,
      destinationLabels: { d1: "Cột cờ Lũng Cú · Đồng Văn", d2: "Điểm đã ẩn · Mèo Vạc" },
      placeDetails,
      tripStatus: "UPCOMING",
      hasCompanionPublication: true,
    }));

    expect(html).toContain("Không gian chỉnh sửa hành trình");
    expect(html).toContain("Hoàn tác");
    expect(html).toContain("Làm lại");
    expect(html).toContain("Lưu thay đổi");
    expect(html).toContain("Hủy chỉnh sửa");
    expect(html).toContain("Tất cả (2 ngày)");
    expect(html).toContain("Cột cờ Lũng Cú");
    expect(html).toContain("Điểm đến không còn khả dụng");
    expect(html).toContain("Bản đồ hành trình");
    expect(html).not.toContain("Điều chỉnh điểm dừng");
    expect(html).toContain("Tìm bạn đồng hành");
    expect(html).toContain("Tự động dời giờ các điểm sau");
    expect(html).toContain("Thay thế nhanh");
    expect(html).toContain("Xóa nhanh");
    expect(html).toContain("Chặng tới");
    expect(html).toContain("Thời tiết và giờ mặt trời");
  });

  it("locks COMPLETED trips on edit workspace without editable controls or save button", () => {
    const html = renderToStaticMarkup(createElement(EditTripClient, {
      tripId: "trip-1",
      baseRevision: "2026-11-18T00:00:00.000Z",
      initialCandidate: candidate,
      destinationLabels: { d1: "Cột cờ Lũng Cú · Đồng Văn", d2: "Điểm đã ẩn · Mèo Vạc" },
      placeDetails,
      tripStatus: "COMPLETED",
      hasCompanionPublication: false,
    }));

    expect(html).toContain("đã hoàn thành");
    expect(html).not.toContain("Lưu thay đổi");
    expect(html).not.toContain("Hoàn tác");
  });

  it("renders per-day Add Stop buttons and accessible AddVisitDrawer dialog", () => {
    const html = renderToStaticMarkup(createElement(EditTripClient, {
      tripId: "trip-1",
      baseRevision: "2026-11-18T00:00:00.000Z",
      initialCandidate: candidate,
      destinationLabels: { d1: "Cột cờ Lũng Cú · Đồng Văn", d2: "Điểm đã ẩn · Mèo Vạc" },
      placeDetails,
      tripStatus: "UPCOMING",
      hasCompanionPublication: false,
    }));
    expect(html).toContain("Thêm điểm dừng vào Ngày 1");
    expect(html).toContain("Thêm điểm dừng vào Ngày 2");

    const drawerHtml = renderToStaticMarkup(createElement(AddVisitDrawer, {
      open: true,
      targetDayIndex: 1,
      targetLocalDate: "2026-12-01",
      targetDayVisits: candidate.days[0]!.visits,
      onClose: () => {},
      onConfirmAdd: () => {},
    }));
    expect(drawerHtml).toContain('role="dialog"');
    expect(drawerHtml).toContain("Chọn điểm đến công khai");
    expect(drawerHtml).toContain("Tìm điểm đến theo tên");
    expect(drawerHtml).toContain("Lọc theo khu vực");
    expect(drawerHtml).toContain("Yêu thích");
    expect(drawerHtml).toContain("Đóng ngăn chọn điểm đến");

    // Legacy trip shows opt-in button
    expect(html).toContain("Bổ sung nơi xuất phát");

    // Trip with origin shows boundary cards + explicit reschedule CTA
    const withOriginHtml = renderToStaticMarkup(createElement(EditTripClient, {
      tripId: "trip-1",
      baseRevision: "2026-11-18T00:00:00.000Z",
      initialCandidate: { ...candidate, journey: COMPLETE_JOURNEY_FIXTURE },
      destinationLabels: { d1: "Cột cờ Lũng Cú · Đồng Văn", d2: "Điểm đã ẩn · Mèo Vạc" },
      placeDetails,
      tripStatus: "UPCOMING",
      hasCompanionPublication: false,
    }));
    expect(withOriginHtml).toContain("Điểm xuất phát:");
    expect(withOriginHtml).toContain("Tự xếp lại giờ theo lộ trình xuất phát");
    expect(withOriginHtml).toContain("Chặng về nơi xuất phát:");

    // ExternalPlace card badge & expired cache disclosure
    const withExternalHtml = renderToStaticMarkup(createElement(EditTripClient, {
      tripId: "trip-1",
      baseRevision: "2026-11-18T00:00:00.000Z",
      initialCandidate: {
        startDate: "2026-12-01",
        durationDays: 1,
        transport: "CAR",
        days: [{
          dayIndex: 1,
          visits: [{ visitId: "v-ext", destinationId: "ext:google:ChIJ1", startMinute: 480, plannedDurationMinutes: 60, order: 1 }],
        }],
      },
      destinationLabels: { "ext:google:ChIJ1": "Địa điểm ngoài danh mục" },
      placeDetails: {
        "ext:google:ChIJ1": {
          id: "ext:google:ChIJ1",
          name: "Địa điểm ngoài danh mục",
          area: "Ngoài danh mục",
          availability: "AVAILABLE",
          external: true,
        },
      },
      tripStatus: "UPCOMING",
      hasCompanionPublication: false,
    }));
    expect(withExternalHtml).toContain("Ngoài danh mục · KLTN chưa kiểm");
    expect(withExternalHtml).toContain("Cache 30 ngày đã hết hạn");

    // ONGOING completed visits render locked badge & fixed-origin notice
    const ongoingHtml = renderToStaticMarkup(createElement(EditTripClient, {
      tripId: "trip-1",
      baseRevision: "2026-11-18T00:00:00.000Z",
      initialCandidate: { ...candidate, journey: COMPLETE_JOURNEY_FIXTURE },
      destinationLabels: { d1: "Cột cờ Lũng Cú · Đồng Văn", d2: "Điểm đã ẩn · Mèo Vạc" },
      placeDetails,
      tripStatus: "ONGOING",
      initialCompletedVisitIds: ["v1"],
      hasCompanionPublication: false,
    }));
    expect(ongoingHtml).toContain("Đã hoàn tất · Cố định");
    expect(ongoingHtml).toContain("điểm xuất phát và giờ đi/về được cố định");
    expect(ongoingHtml).toContain("Hỏi / nhờ AI chỉnh lịch trình");

    // Ticket 07 AiEditBar states: clarifying (<= 3 pills), applied Undo button, error retry keeping input
    const clarifyingHtml = renderToStaticMarkup(createElement(AiEditBar, {
      open: true,
      onToggleOpen: () => {},
      inputValue: "Thêm 1 điểm",
      onInputChange: () => {},
      disabled: false,
      state: {
        kind: "CLARIFYING",
        prompt: "Thêm 1 điểm",
        clarification: {
          code: "AMBIGUOUS_DESTINATION",
          prompt: "Bạn muốn chọn điểm đến nào?",
          choices: [
            { label: "Điểm 1", resolution: { selectedDestinationId: "d1" } },
            { label: "Điểm 2", resolution: { selectedDestinationId: "d2" } },
            { label: "Điểm 3", resolution: { selectedDestinationId: "d3" } },
            { label: "Điểm 4 dư", resolution: { selectedDestinationId: "d4" } },
          ],
        },
      },
      onSubmitPrompt: () => {},
      onRetry: () => {},
      onUndoAiStep: () => {},
      onDismissApplied: () => {},
    }));
    expect(clarifyingHtml).toContain("Điểm 1");
    expect(clarifyingHtml).toContain("Điểm 3");
    expect(clarifyingHtml).not.toContain("Điểm 4 dư");

    const appliedAiHtml = renderToStaticMarkup(createElement(AiEditBar, {
      open: true,
      onToggleOpen: () => {},
      inputValue: "",
      onInputChange: () => {},
      disabled: false,
      state: { kind: "APPLIED", summary: "AI đã thêm 1 điểm.", canUndo: true },
      onSubmitPrompt: () => {},
      onRetry: () => {},
      onUndoAiStep: () => {},
      onDismissApplied: () => {},
    }));
    expect(appliedAiHtml).toContain("AI đã thêm 1 điểm.");
    expect(appliedAiHtml).toContain("Hoàn tác bước AI này");

    const errorAiHtml = renderToStaticMarkup(createElement(AiEditBar, {
      open: true,
      onToggleOpen: () => {},
      inputValue: "Dời sang 16:00",
      onInputChange: () => {},
      disabled: false,
      state: { kind: "ERROR", prompt: "Dời sang 16:00", message: "Yêu cầu AI quá 15 giây", canRetry: true },
      onSubmitPrompt: () => {},
      onRetry: () => {},
      onUndoAiStep: () => {},
      onDismissApplied: () => {},
    }));
    expect(errorAiHtml).toContain('value="Dời sang 16:00"');
    expect(errorAiHtml).toContain("Thử lại");

    // Ticket 08 AiEditBar conversation history thread & read-only ADVISED Planning guidance
    const advisedAiHtml = renderToStaticMarkup(createElement(AiEditBar, {
      open: true,
      onToggleOpen: () => {},
      inputValue: "",
      onInputChange: () => {},
      disabled: false,
      messages: [
        { id: "u-1", role: "user", text: "Ngày 1 đi vậy gấp không?" },
        { id: "a-1", role: "assistant", kind: "ADVISED", text: "Ngày 1 hiện có 2 điểm (08:00–11:30)." },
      ],
      onClearHistory: () => {},
      state: { kind: "ADVISED", advice: "Ngày 1 hiện có 2 điểm (08:00–11:30)." },
      onSubmitPrompt: () => {},
      onRetry: () => {},
      onUndoAiStep: () => {},
      onDismissApplied: () => {},
    }));
    expect(advisedAiHtml).toContain('role="log"');
    expect(advisedAiHtml).toContain('aria-live="polite"');
    expect(advisedAiHtml).toContain("Tư vấn lịch trình (Planning guidance)");
    expect(advisedAiHtml).toContain("Không thay đổi bản nháp");
    expect(advisedAiHtml).toContain("Xóa hội thoại tạm");
  });

  it("Ticket 09 static responsive, touch-target, keyboard dialog, and floating-assistant guard checks", async () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const css = await readFile(resolve(dir, "./edit-trip.module.css"), "utf8");
    const clientSource = await readFile(resolve(dir, "./edit-trip-client.tsx"), "utf8");

    expect(css).toContain("@media (max-width:");
    expect(css).toContain("44px");
    expect(css).toContain("viewTimeline");
    expect(css).toContain("viewMap");
    expect(css).toContain("mobileBottomBar");
    expect(css).toContain("--edit-accent: var(--edit-green)");
    expect(css).toContain("--edit-surface-muted: var(--muted)");
    expect(css).toContain("focus-visible");
    expect(clientSource).toContain('aria-live="polite"');
    expect(clientSource).toContain("onCancel");
  });

  it("renders uncluttered low-click UX: collapsed origin editor, inline quick-fix & replace actions, collapsed weather, and no raw CUID strings", () => {
    const html = renderToStaticMarkup(
      createElement(EditTripClient, {
        tripId: "trip-ux-1",
        baseRevision: "rev-1",
        tripStatus: "UPCOMING",
        hasCompanionPublication: false,
        destinationLabels: {
          "dest-1": "Cổng Trời Quản Bạ",
          "dest-2": "Phố cổ Đồng Văn",
        },
        placeDetails: {
          "dest-1": {
            id: "dest-1",
            name: "Cổng Trời Quản Bạ",
            area: "Quản Bạ",
            availability: "AVAILABLE",
            external: false,
          },
          "dest-2": {
            id: "dest-2",
            name: "Phố cổ Đồng Văn",
            area: "Đồng Văn",
            availability: "AVAILABLE",
            external: false,
          },
        },
        initialCandidate: {
          startDate: "2026-12-01",
          durationDays: 2,
          transport: "CAR",
          journey: {
            origin: {
              label: "96 Định Công, Hà Nội",
              latitude: 20.98,
              longitude: 105.83,
              source: "NOMINATIM",
              confirmed: true,
            },
            departureMinute: 360,
            returnDeadlineMinute: 1320,
            returnDepartureMinute: null,
          },
          days: [
            {
              dayIndex: 1,
              visits: [
                {
                  visitId: "cmiw57x910008q67gi5dkj4xj",
                  destinationId: "dest-1",
                  startMinute: 480,
                  plannedDurationMinutes: 60,
                  order: 1,
                },
                {
                  visitId: "cmiw57x910009q67gq2j89aet",
                  destinationId: "dest-2",
                  startMinute: 560,
                  plannedDurationMinutes: 60,
                  order: 2,
                },
              ],
            },
            {
              dayIndex: 2,
              visits: [],
            },
          ],
        },
      }),
    );

    expect(html).toContain('aria-label="Không gian chỉnh sửa hành trình"');
    expect(html).not.toContain(">Không gian chỉnh sửa hành trình</p>");
    // Origin editor stays collapsed until clicked even when trip has an existing origin
    expect(html).toContain("Chỉnh xuất phát");
    expect(html).not.toContain("Xác nhận điểm xuất phát");
    // 1-click timeline controls, time-window pill, -15/+15 nudges, and per-card direct replace
    expect(html).toContain("Tự xếp lại giờ khớp di chuyển");
    expect(html).toContain("-15p");
    expect(html).toContain("+15p");
    expect(html).toContain("Đổi điểm");
    expect(html).toContain("08:00 – 09:00 · 60 phút");
    // Side column uses compact check trigger, collapsed weather <details>, and zero raw CUIDs
    expect(html).toContain("Kiểm tra lại");
    expect(html).not.toContain("Kiểm tra bản nháp");
    expect(html).toContain("<details");
    expect(html).toContain("Thời tiết và giờ mặt trời");
    expect(html).not.toContain("cmiw57x910008q67gi5dkj4xj → cmiw57x910009q67gq2j89aet");
  });
});
