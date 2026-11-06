import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AssistantOriginModal } from "./assistant-origin-modal";
import { PlanningProposalView } from "./planning-panel";
import type { PlanningGenerated } from "@/modules/assistant-planning/planning-contract";
import type { TripJourney } from "@/modules/trip-origin/trip-origin-contract";

describe("Assistant V2 Origin Planning (Ticket 07)", () => {
  const dummyJourney: TripJourney = {
    origin: {
      label: "Bến xe Mỹ Đình",
      latitude: 21.0285,
      longitude: 105.7785,
      source: "NOMINATIM",
      confirmed: true,
    },
    returnDepartureMinute: null,
    departureMinute: 390,
    returnDeadlineMinute: 1140,
  };

  it("renders AssistantOriginModal with title, picker, and time inputs", () => {
    const html = renderToStaticMarkup(
      createElement(AssistantOriginModal, {
        isOpen: true,
        onClose: () => undefined,
        initialJourney: dummyJourney,
        onConfirm: () => undefined,
      })
    );

    expect(html).toContain("Chọn nơi xuất phát cho chuyến đi");
    expect(html).toContain("Trợ lý AI sẽ dùng điểm xuất phát và khung giờ này");
    expect(html).toContain("Giờ khởi hành ngày đầu");
    expect(html).toContain("Hạn trở về ngày cuối");
    expect(html).toContain("Áp dụng cho Trợ lý");
    expect(html).toContain("Bến xe Mỹ Đình");
  });

  it("renders origin departure and return stops in PlanningProposalView", () => {
    const generated: PlanningGenerated = {
      version: 1,
      attempts: [],
      repairError: null,
      selection: { days: [["dest-1"]] },
      proposal: {
        proposalId: "prop-1", phase: "PRELIMINARY_PROPOSAL", status: "PROPOSAL_READY", timezone: "Asia/Ho_Chi_Minh", reasonCodes: [],
        eligibleForFinalConfirmation: true,
        requirement: {
          startDate: "2026-11-20",
          durationDays: 1,
          transport: "CAR",
          journey: dummyJourney, companions: null, interests: [], pace: null, mobilityConstraints: null,
        },
        days: [
          {
            day: 1,
            date: "2026-11-20",
            stops: [
              {
                destination: { id: "dest-1", name: "Cột cờ Lũng Cú", description: "", area: "", address: null, category: "", latitude: 23, longitude: 105, image: null }, validationStatus: "PASS",
                arrivalMinute: 600,
    departureMinute: 690,
                visitDurationMinutes: 90,
                order: 1,
                scheduleState: "PLANNED",
                inbound: null,
              },
            ],
            travelSeconds: 3600,
            distanceMeters: 50000,
          },
        ],
        journeyPlan: {
          policy: "roadside-rest-v1",
          legs: [],
          totals: {
            drivingSeconds: 14400,
            restMinutes: 30,
            distanceMeters: 300000,
          },
        },
        checks: [
          { key: "OPENING_HOURS", status: "PASS", issues: [] },
          { key: "MINIMUM_DURATION", status: "PASS", issues: [] },
          { key: "TRAVEL_TIME", status: "PASS", issues: [] },
          { key: "SCHEDULE_CONFLICTS", status: "PASS", issues: [] },
          { key: "MOBILITY", status: "PASS", issues: [] },
        ],
        warnings: [],
      },
    };

    const html = renderToStaticMarkup(
      createElement(PlanningProposalView, {
        generated,
        isCurrent: true,
        disabled: false,
        onSave: () => undefined,
      })
    );

    expect(html).toContain("Nơi xuất phát hành trình");
    expect(html).toContain("Bến xe Mỹ Đình");
    expect(html).toContain("Điểm kết thúc hành trình");
    expect(html).toContain("Chạy xe: 4 giờ");
    expect(html).toContain("Nghỉ ven đường: 30 phút");
    expect(html).toContain("300 km");
    expect(html).toContain("Chưa tính đường ra/vào nơi nghỉ");
    expect(html).toContain("Xác nhận và lưu chuyến đi");
  });
});
