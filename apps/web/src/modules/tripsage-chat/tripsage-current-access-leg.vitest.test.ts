import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TripsageAccessLegCard } from "../../components/tripsage-chat/tripsage-access-leg-card";
import type { PinControl } from "../../components/tripsage-chat/tripsage-pin-button";
import type { PinnedItem } from "../trip-save/trip-pin-contract";
import {
  buildAccessLeg,
  formatAccessLegCostBasis,
  isCurrentAccessLeg,
  reconcileAccessPins,
  type AccessLegInput,
} from "./tripsage-access-leg";
import { estimateTripCost } from "./tripsage-cost";

const ESTIMATE_INPUT: AccessLegInput = {
  hubId: "HA_GIANG_CITY",
  outbound: [
    { mode: "FLIGHT", from: "TP Hồ Chí Minh (SGN)", to: "Hà Nội (HAN)", durationMinutes: 120, priceVndPerPerson: 2_500_000 },
    { mode: "SLEEPER_BUS", from: "Hà Nội", to: "TP Hà Giang", durationMinutes: 360, priceVndPerPerson: 300_000 },
  ],
  return: [
    { mode: "SLEEPER_BUS", from: "TP Hà Giang", to: "Hà Nội", durationMinutes: 360, priceVndPerPerson: 300_000 },
    { mode: "FLIGHT", from: "Hà Nội (HAN)", to: "TP Hồ Chí Minh (SGN)", durationMinutes: 120, priceVndPerPerson: 2_500_000 },
  ],
};

describe("Ticket 05: current access leg parity (PARITY BR-1..BR-5, AC-1, AC-2)", () => {
  it("generates unique ids in buildAccessLeg and records accessLegId + segment breakdown in estimateTripCost", () => {
    const leg1 = buildAccessLeg(ESTIMATE_INPUT, "TP Hồ Chí Minh", 10);
    const leg2 = buildAccessLeg(ESTIMATE_INPUT, "TP Hồ Chí Minh", 10, {
      totalVnd: 31_164_420,
      adults: 10,
      roundTrip: true,
      lookupDate: "2026-11-23",
    });

    expect(leg1.id).toBeTruthy();
    expect(leg2.id).toBeTruthy();
    expect(leg1.id).not.toBe(leg2.id);
    expect(leg1.totalVnd).toBe(56_000_000);
    expect(leg2.totalVnd).toBe(37_164_420);

    const basis = formatAccessLegCostBasis(leg2);
    expect(basis).toContain("Máy bay");
    expect(basis).toContain("Xe khách");
    expect(basis).toContain("10 người");
    expect(basis.length).toBeLessThanOrEqual(120);

    const cost = estimateTripCost({
      transport: "MOTORCYCLE",
      travelers: 10,
      days: 5,
      distanceKm: 300,
      accessLegId: leg2.id,
      extraLines: [{ category: "transport", label: "Chặng tiếp cận (đi và về)", amount: leg2.totalVnd, basis }],
      lines: [{ category: "food", label: "Ăn uống", amount: 5_000_000 }],
    });
    expect(cost.accessLegId).toBe(leg2.id);
    const accessLine = cost.lines.find(l => l.label === "Chặng tiếp cận (đi và về)");
    expect(accessLine?.amount).toBe(leg2.totalVnd);
    expect(accessLine?.basis).toBe(basis);
  });

  it("marks an older access-leg card as stale with 'Đã có bản mới' and removes its pin button (PARITY AC-1)", () => {
    const leg1 = buildAccessLeg(ESTIMATE_INPUT, "TP Hồ Chí Minh", 10);
    const leg2 = buildAccessLeg(ESTIMATE_INPUT, "TP Hồ Chí Minh", 10, {
      totalVnd: 31_164_420,
      adults: 10,
      roundTrip: true,
    });

    expect(isCurrentAccessLeg(leg1, leg2)).toBe(false);
    expect(isCurrentAccessLeg(leg2, leg2)).toBe(true);

    const pins: PinControl = { saved: false, isPinned: () => false, toggle: () => {} };
    const staleHtml = renderToStaticMarkup(createElement(TripsageAccessLegCard, { leg: leg1, isStale: true, pins }));
    expect(staleHtml).toContain('data-stale="true"');
    expect(staleHtml).toContain("Đã có bản mới");
    expect(staleHtml).not.toContain("Ghim");

    const currentHtml = renderToStaticMarkup(createElement(TripsageAccessLegCard, { leg: leg2, isStale: false, pins }));
    expect(currentHtml).not.toContain('data-stale="true"');
    expect(currentHtml).not.toContain("Đã có bản mới");
    expect(currentHtml).toContain("Ghim");
  });

  it("replaces stale ACCESS pins with the current access leg for unsaved chat/save, while keeping a saved snapshot unchanged (PARITY AC-1 & AC-2)", () => {
    const leg1 = buildAccessLeg(ESTIMATE_INPUT, "TP Hồ Chí Minh", 10);
    const leg2 = buildAccessLeg(ESTIMATE_INPUT, "TP Hồ Chí Minh", 10, {
      totalVnd: 31_164_420,
      adults: 10,
      roundTrip: true,
    });

    // Unsaved chat: pinned old leg1 is replaced by current leg2 (no duplicate, same total as cost table)
    const unsavedPins: PinnedItem[] = [{ kind: "ACCESS", leg: leg1 }];
    const reconciled = reconcileAccessPins(unsavedPins, leg2);
    const accessPins = reconciled.filter((item): item is Extract<PinnedItem, { kind: "ACCESS" }> => item.kind === "ACCESS");
    expect(accessPins).toHaveLength(1);
    expect(accessPins[0]!.leg.id).toBe(leg2.id);
    expect(accessPins[0]!.leg.totalVnd).toBe(37_164_420);

    // Saved trip snapshot: keeps leg1 (56M) even after leg2 (37.16M) is generated later in chat
    const savedSnapshot: PinnedItem[] = structuredClone(reconcileAccessPins([], leg1));
    expect(savedSnapshot[0]?.kind === "ACCESS" && savedSnapshot[0].leg.totalVnd).toBe(56_000_000);
    // Generating leg2 later does not mutate the already-saved snapshot
    expect(savedSnapshot[0]?.kind === "ACCESS" && savedSnapshot[0].leg.id).toBe(leg1.id);
    expect(savedSnapshot[0]?.kind === "ACCESS" && savedSnapshot[0].leg.totalVnd).toBe(56_000_000);
  });
});
