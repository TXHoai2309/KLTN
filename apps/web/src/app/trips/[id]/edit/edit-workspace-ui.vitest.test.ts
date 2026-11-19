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
import type { AdviceSuggestionCard } from "@/modules/trip-edit/saved-trip-advisory";
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
    expect(errorAiHtml).toContain("<textarea");
    expect(errorAiHtml).toContain("Dời sang 16:00</textarea>");
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
    expect(css).toContain("viewAssistant");
    expect(css).toContain("viewTimeline");
    expect(css).toContain("viewMap");
    expect(css).toContain("mobileBottomBar");
    expect(css).toContain("mobileAiJumpBanner");
    expect(css).toContain("workspaceGridCollapsed");
    expect(css).toContain("--edit-accent: var(--edit-green)");
    expect(css).toContain("--edit-surface-muted: var(--muted)");
    expect(css).toContain("focus-visible");
    expect(clientSource).toContain('aria-live="polite"');
    expect(clientSource).toContain("onCancel");
  });

  it("Saved-trip assistant Ticket 01: unifies /edit and /in-trip entry modes, 3 mobile tabs, and AI focus", async () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const inTripPageSource = await readFile(resolve(dir, "../in-trip/page.tsx"), "utf8");
    const editPageSource = await readFile(resolve(dir, "./page.tsx"), "utf8");
    expect(inTripPageSource).toContain("renderSavedTripAssistantPage");
    expect(inTripPageSource).toContain('"in-trip"');
    expect(editPageSource).toContain("renderSavedTripAssistantPage");
    expect(editPageSource).toContain('"edit"');

    const editHtml = renderToStaticMarkup(createElement(EditTripClient, {
      tripId: "trip-unified",
      baseRevision: "2026-11-18T00:00:00.000Z",
      initialCandidate: candidate,
      destinationLabels: { d1: "Cột cờ Lũng Cú · Đồng Văn", d2: "Điểm đã ẩn · Mèo Vạc" },
      placeDetails,
      tripStatus: "UPCOMING",
      hasCompanionPublication: false,
      entryMode: "edit",
    }));
    expect(editHtml).toContain("Trợ lý chuyến đi");
    expect(editHtml).toContain('id="mobile-tab-assistant"');
    expect(editHtml).toContain('id="mobile-tab-timeline"');
    expect(editHtml).toContain('id="mobile-tab-map"');
    expect(editHtml).toMatch(/id="mobile-tab-timeline"[^>]*aria-selected="true"/);
    expect(editHtml).toMatch(/id="mobile-tab-assistant"[^>]*aria-selected="false"/);
    expect(editHtml).toContain("<textarea");
    expect(editHtml).toContain("Thu gọn");

    const inTripHtml = renderToStaticMarkup(createElement(EditTripClient, {
      tripId: "trip-unified",
      baseRevision: "2026-11-18T00:00:00.000Z",
      initialCandidate: candidate,
      destinationLabels: { d1: "Cột cờ Lũng Cú · Đồng Văn", d2: "Điểm đã ẩn · Mèo Vạc" },
      placeDetails,
      tripStatus: "ONGOING",
      initialCompletedVisitIds: ["v1"],
      hasCompanionPublication: false,
      entryMode: "in-trip",
    }));
    expect(inTripHtml).toContain("Trợ lý chuyến đi");
    expect(inTripHtml).toMatch(/id="mobile-tab-assistant"[^>]*aria-selected="true"/);
    expect(inTripHtml).toContain("Tiếp theo mình đi đâu, mấy giờ xuất phát?");
    expect(inTripHtml).toContain("Bản đồ hành trình");
    expect(inTripHtml).toContain("Hoàn tác");
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

  it("Saved-trip assistant Ticket 02: renders actionable advice suggestion cards and wires 1-tap apply + Undo without calling LLM", async () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const clientSource = await readFile(resolve(dir, "./edit-trip-client.tsx"), "utf8");
    const cssSource = await readFile(resolve(dir, "./edit-trip.module.css"), "utf8");

    const suggestedCandidate: EditCandidate = {
      ...candidate,
      days: [
        {
          dayIndex: 1,
          visits: [
            { visitId: "v1", destinationId: "d1", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
            { visitId: "v2", destinationId: "d2", startMinute: 630, plannedDurationMinutes: 90, order: 2 },
          ],
        },
        candidate.days[1]!,
      ],
    };

    const suggestion: AdviceSuggestionCard = {
      id: "advice-suggestion-1",
      title: "Phương án 1: Dời giờ tự động khớp thời gian di chuyển",
      summary: "Dời lại 1 mốc giờ chưa khóa để đủ thời gian di chuyển và hết chồng chéo.",
      diffSummaryLines: ["Chỉnh Điểm đã ẩn · Mèo Vạc (Ngày 1): 10:00 → 10:30 (90 phút)"],
      candidate: suggestedCandidate,
      diff: { added: [], removed: [], updated: [], tripChanges: {} },
      validation: {
        timeReference: "2026-11-18T00:00:00.000Z",
        groups: {
          openingHours: { status: "SATISFIED", findings: [] },
          minimumDuration: { status: "SATISFIED", findings: [] },
          travelTime: { status: "SATISFIED", findings: [] },
          scheduleConflict: { status: "SATISFIED", findings: [] },
        },
        canConfirm: true,
      },
      changedVisitIds: { added: [], updated: ["v2"], shifted: [], removedCount: 0 },
      saveEligibility: "PASS",
    };

    const onApplySuggestion = vi.fn();
    const html = renderToStaticMarkup(createElement(AiEditBar, {
      open: true,
      onToggleOpen: () => {},
      inputValue: "",
      onInputChange: () => {},
      disabled: false,
      state: {
        kind: "ADVISED",
        advice: "Ngày 1 có thể dời nhẹ điểm thứ 2 sang 10:30 để thoải mái hơn.",
        suggestions: [suggestion],
      },
      onSubmitPrompt: () => {},
      onApplySuggestion,
      onRetry: () => {},
      onUndoAiStep: () => {},
      onDismissApplied: () => {},
    }));

    expect(html).toContain("Gợi ý chỉnh sửa từ tư vấn");
    expect(html).toContain("Phương án 1: Dời giờ tự động khớp thời gian di chuyển");
    expect(html).toContain("Hợp lệ · PASS");
    expect(html).toContain("Chỉnh Điểm đã ẩn · Mèo Vạc (Ngày 1): 10:00 → 10:30 (90 phút)");
    expect(html).toContain("Áp dụng phương án này vào bản nháp");

    // Verify 1-tap apply handler updates workingDraft & previewState directly without LLM calls and supports Undo
    expect(clientSource).toContain("function handleApplyAdviceSuggestion");
    expect(clientSource).toContain("commitDraft(suggestion.candidate");
    expect(clientSource).toContain("finishEditPreview(");
    expect(clientSource).toContain("onApplySuggestion={handleApplyAdviceSuggestion}");
    expect(cssSource).toContain("aiSuggestionCard");
    expect(cssSource).toContain("min-height: 44px");
  });

  it("Saved-trip assistant Ticket 03: renders rest-buffer relief cards and compound direct-applied explanation + Undo", () => {
    const restRelievedCandidate: EditCandidate = {
      ...candidate,
      days: [
        {
          dayIndex: 1,
          visits: [
            { visitId: "v1", destinationId: "d1", startMinute: 540, plannedDurationMinutes: 60, order: 1 },
          ],
        },
        candidate.days[1]!,
      ],
    };

    const restHtml = renderToStaticMarkup(createElement(AiEditBar, {
      open: true,
      onToggleOpen: () => {},
      inputValue: "",
      onInputChange: () => {},
      disabled: false,
      state: {
        kind: "ADVISED",
        advice: "Nếu nghỉ đến 09:00 rồi dời dây chuyền Ngày 1, điểm cuối sẽ quá giờ mở cửa. Mình đã mô phỏng 2 phương án tháo gỡ bên dưới.",
        suggestions: [
          {
            id: "advice-suggestion-1",
            title: "Phương án 1: Nghỉ đến 09:00 + rút ngắn nhẹ thời lượng",
            summary: "Giữ nguyên điểm trong ngưỡng tối thiểu cho phép.",
            diffSummaryLines: ["Chỉnh Cổng Trời (Ngày 1): 08:00 → 09:00 (60 phút)"],
            candidate: restRelievedCandidate,
            diff: { added: [], removed: [], updated: [], tripChanges: {} },
            validation: {
              timeReference: "2026-11-18T00:00:00.000Z",
              groups: {
                openingHours: { status: "SATISFIED", findings: [] },
                minimumDuration: { status: "SATISFIED", findings: [] },
                travelTime: { status: "SATISFIED", findings: [] },
                scheduleConflict: { status: "SATISFIED", findings: [] },
              },
              canConfirm: true,
            },
            changedVisitIds: { added: [], updated: ["v1"], shifted: [], removedCount: 0 },
            saveEligibility: "PASS",
          },
        ],
      },
      onSubmitPrompt: () => {},
      onApplySuggestion: () => {},
      onRetry: () => {},
      onUndoAiStep: () => {},
      onDismissApplied: () => {},
    }));

    expect(restHtml).toContain("09:00");
    expect(restHtml).toContain("Nghỉ đến 09:00 + rút ngắn nhẹ thời lượng");
    expect(restHtml).toContain("Áp dụng phương án này vào bản nháp");

    const compoundAppliedHtml = renderToStaticMarkup(createElement(AiEditBar, {
      open: true,
      onToggleOpen: () => {},
      inputValue: "",
      onInputChange: () => {},
      disabled: false,
      state: {
        kind: "APPLIED",
        summary: "Lịch Ngày 1 trước đó thiếu thời gian di chuyển. AI đã dời giờ để đạt PASS mà vẫn giữ đủ mọi điểm.",
        canUndo: true,
      },
      onSubmitPrompt: () => {},
      onRetry: () => {},
      onUndoAiStep: () => {},
      onDismissApplied: () => {},
    }));

    expect(compoundAppliedHtml).toContain("Lịch Ngày 1 trước đó thiếu thời gian di chuyển");
    expect(compoundAppliedHtml).toContain("Hoàn tác bước AI này");
  });

  it("Saved-trip assistant Ticket 04: displays unavailable alert, 3 Destination option cards, and preserves ExternalPlace notice", () => {
    const htmlWithHiddenAndRecs = renderToStaticMarkup(createElement(AiEditBar, {
      open: true,
      onToggleOpen: () => {},
      inputValue: "",
      onInputChange: () => {},
      disabled: false,
      unavailableCount: 1,
      state: {
        kind: "ADVISED",
        advice: "Bản nháp có Điểm đến không còn khả dụng tại Ngày 1. Gợi ý 3 điểm công khai cùng khu vực Đồng Văn bên dưới.",
        suggestions: [
          {
            id: "advice-suggestion-1",
            title: "Lựa chọn #1: Thay bằng Dinh Thự Vua Mèo",
            summary: "Phù hợp vì cùng khu vực Đồng Văn, thời lượng gợi ý 90 phút.",
            diffSummaryLines: ["Đổi Điểm đến không còn khả dụng → Dinh Thự Vua Mèo"],
            candidate,
            diff: { added: [], removed: [], updated: [], tripChanges: {} },
            validation: {
              timeReference: "2026-11-18T00:00:00.000Z",
              groups: {
                openingHours: { status: "SATISFIED", findings: [] },
                minimumDuration: { status: "SATISFIED", findings: [] },
                travelTime: { status: "SATISFIED", findings: [] },
                scheduleConflict: { status: "SATISFIED", findings: [] },
              },
              canConfirm: true,
            },
            changedVisitIds: { added: [], updated: ["v2"], shifted: [], removedCount: 0 },
            saveEligibility: "PASS",
          },
          {
            id: "advice-suggestion-2",
            title: "Lựa chọn #2: Thay bằng Làng Lô Lô Chải",
            summary: "Phù hợp vì cùng khu vực Đồng Văn.",
            diffSummaryLines: ["Đổi Điểm đến không còn khả dụng → Làng Lô Lô Chải"],
            candidate,
            diff: { added: [], removed: [], updated: [], tripChanges: {} },
            validation: {
              timeReference: "2026-11-18T00:00:00.000Z",
              groups: {
                openingHours: { status: "SATISFIED", findings: [] },
                minimumDuration: { status: "SATISFIED", findings: [] },
                travelTime: { status: "SATISFIED", findings: [] },
                scheduleConflict: { status: "SATISFIED", findings: [] },
              },
              canConfirm: true,
            },
            changedVisitIds: { added: [], updated: ["v2"], shifted: [], removedCount: 0 },
            saveEligibility: "PASS",
          },
          {
            id: "advice-suggestion-3",
            title: "Lựa chọn #3: Thay bằng Cột Cờ Lũng Cú",
            summary: "Phù hợp vì cùng khu vực Đồng Văn.",
            diffSummaryLines: ["Đổi Điểm đến không còn khả dụng → Cột Cờ Lũng Cú"],
            candidate,
            diff: { added: [], removed: [], updated: [], tripChanges: {} },
            validation: {
              timeReference: "2026-11-18T00:00:00.000Z",
              groups: {
                openingHours: { status: "SATISFIED", findings: [] },
                minimumDuration: { status: "SATISFIED", findings: [] },
                travelTime: { status: "SATISFIED", findings: [] },
                scheduleConflict: { status: "SATISFIED", findings: [] },
              },
              canConfirm: true,
            },
            changedVisitIds: { added: [], updated: ["v2"], shifted: [], removedCount: 0 },
            saveEligibility: "PASS",
          },
        ],
      },
      onSubmitPrompt: () => {},
      onApplySuggestion: () => {},
      onRetry: () => {},
      onUndoAiStep: () => {},
      onDismissApplied: () => {},
    }));

    expect(htmlWithHiddenAndRecs).toContain("Lịch hiện có 1 điểm đến không còn khả dụng");
    expect(htmlWithHiddenAndRecs).toContain("Lựa chọn #1: Thay bằng Dinh Thự Vua Mèo");
    expect(htmlWithHiddenAndRecs).toContain("Lựa chọn #2: Thay bằng Làng Lô Lô Chải");
    expect(htmlWithHiddenAndRecs).toContain("Lựa chọn #3: Thay bằng Cột Cờ Lũng Cú");

    // ExternalPlace timeline card continues rendering unverified external badge + time controls inside unified workspace
    const extHtml = renderToStaticMarkup(createElement(EditTripClient, {
      tripId: "trip-ext",
      baseRevision: "rev-ext",
      tripStatus: "UPCOMING",
      hasCompanionPublication: false,
      destinationLabels: { "ext:google:cafe": "Quán Cà Phê Ngoài" },
      placeDetails: {
        "ext:google:cafe": {
          id: "ext:google:cafe",
          name: "Quán Cà Phê Ngoài",
          area: "Đồng Văn",
          availability: "AVAILABLE",
          external: true,
        },
      },
      initialCandidate: {
        startDate: "2026-12-01",
        durationDays: 1,
        transport: "CAR",
        days: [
          {
            dayIndex: 1,
            visits: [
              {
                visitId: "v-ext",
                destinationId: "ext:google:cafe",
                startMinute: 540,
                plannedDurationMinutes: 45,
                order: 1,
              },
            ],
          },
        ],
      },
    }));
    expect(extHtml).toContain("Ngoài danh mục · KLTN chưa kiểm");
    expect(extHtml).toContain("+15p");
    expect(extHtml).toContain("Trợ lý chuyến đi");
  });

  it("Saved-trip assistant Ticket 05: renders Kiến thức mở rộng badge, real RAG citations, weather/progress answers without changing Edit draft", () => {
    const htmlQa = renderToStaticMarkup(createElement(AiEditBar, {
      open: true,
      onToggleOpen: () => {},
      inputValue: "",
      onInputChange: () => {},
      disabled: false,
      messages: [
        { id: "u-1", role: "user", text: "Dinh Vua Mèo có câu chuyện gì?" },
        {
          id: "a-1",
          role: "assistant",
          kind: "ADVISED",
          text: "Dinh Vua Mèo là công trình kiến trúc họ Vương. [Kiến thức mở rộng] Nên ghé buổi sáng.",
          knowledgeParts: [
            { text: "Dinh Vua Mèo là công trình kiến trúc họ Vương.", mode: "SOURCE", citationIds: ["c1"] },
            { text: "Nên ghé buổi sáng để ánh sáng đẹp.", mode: "EXPANDED", citationIds: [] },
          ],
          citations: [
            {
              id: "c1",
              sourceId: "s1",
              title: "Cẩm nang di sản Đồng Văn",
              sourceUrl: "https://example.test/cam-nang",
              locators: [{ pageNumber: 12 }],
            },
          ],
        },
      ],
      state: {
        kind: "ADVISED",
        advice: "Dinh Vua Mèo là công trình kiến trúc họ Vương. Nên ghé buổi sáng để ánh sáng đẹp.",
        knowledgeParts: [
          { text: "Dinh Vua Mèo là công trình kiến trúc họ Vương.", mode: "SOURCE", citationIds: ["c1"] },
          { text: "Nên ghé buổi sáng để ánh sáng đẹp.", mode: "EXPANDED", citationIds: [] },
        ],
        citations: [
          {
            id: "c1",
            sourceId: "s1",
            title: "Cẩm nang di sản Đồng Văn",
            sourceUrl: "https://example.test/cam-nang",
            locators: [{ pageNumber: 12 }],
          },
        ],
      },
      onSubmitPrompt: () => {},
      onRetry: () => {},
      onUndoAiStep: () => {},
      onDismissApplied: () => {},
    }));

    expect(htmlQa).toContain("Kiến thức mở rộng");
    expect(htmlQa).toContain("Nguồn tham khảo đã duyệt:");
    expect(htmlQa).toContain("Cẩm nang di sản Đồng Văn");
    expect(htmlQa).toContain("Trang 12");
    expect(htmlQa).toContain("Không thay đổi bản nháp");
  });

  it("Saved-trip assistant Ticket 06: renders NEEDS_LOCATION GPS & manual fallback card cleanly without watchPosition or persistent storage", async () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const clientSource = await readFile(resolve(dir, "./edit-trip-client.tsx"), "utf8");
    const barSource = await readFile(resolve(dir, "./ai-edit-bar.tsx"), "utf8");
    const locServiceSource = await readFile(
      resolve(dir, "../../../../modules/trip-edit/saved-trip-location-guidance.ts"),
      "utf8",
    );

    // Privacy & single-shot GPS hygiene across unified workspace
    for (const src of [clientSource, barSource, locServiceSource]) {
      expect(src).not.toMatch(/watchPosition|localStorage|sessionStorage|indexedDB|document\.cookie|console\./u);
    }
    expect(clientSource).toContain("requestBrowserLocation");
    expect(clientSource).toContain("handleSelectManualLocationForAi");
    expect(clientSource).toContain("void handleAiSubmit(pendingMessage, undefined, verifiedLocation)");

    const gpsHtml = renderToStaticMarkup(createElement(AiEditBar, {
      open: true,
      onToggleOpen: () => {},
      inputValue: "",
      onInputChange: () => {},
      disabled: false,
      state: {
        kind: "NEEDS_LOCATION",
        prompt: "Yêu cầu này cần biết vị trí bạn đang đứng.",
        pendingMessage: "Tôi đang bị kẹt xe ở đây thì chiều nay đi tiếp những điểm nào kịp?",
        locationFlow: { status: "idle", requestId: 0 },
        manualPickerOpen: false,
        manualCoords: null,
        coverageError: null,
      },
      onSubmitPrompt: () => {},
      onRequestGps: () => {},
      onOpenManualLocation: () => {},
      onSelectManualCoords: () => {},
      onCancelPendingLocation: () => {},
      onRetry: () => {},
      onUndoAiStep: () => {},
      onDismissApplied: () => {},
    }));

    expect(gpsHtml).toContain("Cần vị trí hiện tại (ONGOING)");
    expect(gpsHtml).toContain("Tôi đang bị kẹt xe ở đây thì chiều nay đi tiếp những điểm nào kịp?");
    expect(gpsHtml).toContain("Dùng vị trí GPS hiện tại");
    expect(gpsHtml).toContain("Chọn vị trí thủ công trên bản đồ");

    const manualFallbackHtml = renderToStaticMarkup(createElement(AiEditBar, {
      open: true,
      onToggleOpen: () => {},
      inputValue: "",
      onInputChange: () => {},
      disabled: false,
      state: {
        kind: "NEEDS_LOCATION",
        prompt: "Yêu cầu này cần biết vị trí bạn đang đứng.",
        pendingMessage: "Gần chỗ tôi đang đứng có điểm nào ghé được không?",
        locationFlow: { status: "denied", requestId: 1 },
        manualPickerOpen: true,
        manualCoords: { latitude: 23.27, longitude: 105.36 },
        coverageError: null,
      },
      onSubmitPrompt: () => {},
      onRequestGps: () => {},
      onOpenManualLocation: () => {},
      onSelectManualCoords: () => {},
      onCancelPendingLocation: () => {},
      onRetry: () => {},
      onUndoAiStep: () => {},
      onDismissApplied: () => {},
    }));

    expect(manualFallbackHtml).toContain("Chưa có quyền truy cập vị trí");
    expect(manualFallbackHtml).toContain("Chọn vị trí thủ công");
    expect(manualFallbackHtml).toContain("Dùng tọa độ");
  });
});
