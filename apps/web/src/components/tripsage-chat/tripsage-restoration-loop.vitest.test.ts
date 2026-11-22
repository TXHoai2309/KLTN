import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { CHECK_KEYS } from "@/modules/trip-planner/planner-contract";
import { tripRequirementInputSchema } from "@/modules/trip-requirement/trip-requirement-contract";
import { pruneChosenLodgings, type ChosenLodgingMap } from "@/modules/tripsage-chat/tripsage-timeline";
import { readConversationState } from "./tripsage-conversation-state";
import { parseItineraryPart } from "./tripsage-itinerary-view";

// Execute the actual derived-state/effect block with React's dependency and
// Object.is state semantics. No DOM renderer is installed in this Node suite.
const source = readFileSync(new URL("./tripsage-chat-client.tsx", import.meta.url), "utf8");
const block = source.slice(source.indexOf("  const state = useMemo"), source.indexOf("  function handleToggleChosenLodging"));
const run = new Function("messages", "activeConversationId", "useMemo", "useEffect", "useRef", "setChosenLodgings", "lastSyncedProposalRef", "readConversationState", "parseItineraryPart", "pruneChosenLodgings", ts.transpile(block));

function restoredMessages(proposalId = "saved-plan") {
  const proposal = {
    proposalId, phase: "PRELIMINARY_PROPOSAL", status: "PROPOSAL_READY",
    requirement: tripRequirementInputSchema.parse({ startDate: null, durationDays: 2, transport: "MOTORCYCLE", interests: ["NATURE"] }),
    timezone: "Asia/Ho_Chi_Minh",
    days: [1, 2].map(day => ({ day, date: null, stops: [], distanceMeters: 0, travelSeconds: 0 })),
    checks: CHECK_KEYS.map(key => ({ key, status: "PASS", issues: [] })),
    warnings: [], reasonCodes: [], eligibleForFinalConfirmation: false,
  };
  expect(parseItineraryPart(proposal)).not.toBeNull();
  return [{ id: proposalId, role: "assistant", parts: [
    { type: "data-itinerary", data: proposal },
    { type: "data-chosen-lodgings", data: { chosenLodgings: [{ nightIndex: 1, placeId: "stay-1", name: "Saved stay" }] } },
  ] }];
}

function harness() {
  const memos: { deps: unknown[]; value: unknown }[] = [];
  const effects: unknown[][] = [];
  const proposalRef = { current: null };
  const itineraryRef = { current: null };
  let chosen: ChosenLodgingMap = {};
  const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  return {
    chosen: () => chosen,
    settle(messages: unknown[], id: string | null) {
      let changed = true;
      let renders = 0;
      while (changed && renders < 20) {
        changed = false;
        renders++;
        let memoIndex = 0;
        let effectIndex = 0;
        const pending: (() => void)[] = [];
        run(messages, id, (compute: () => unknown, deps: unknown[]) => {
          const i = memoIndex++;
          if (!memos[i] || !same(memos[i].deps, deps)) memos[i] = { deps, value: compute() };
          return memos[i].value;
        }, (effect: () => void, deps: unknown[]) => {
          const i = effectIndex++;
          if (!effects[i] || !same(effects[i], deps)) pending.push(effect);
          effects[i] = deps;
        }, () => itineraryRef, (update: ChosenLodgingMap | ((prev: ChosenLodgingMap) => ChosenLodgingMap)) => {
          const next = typeof update === "function" ? update(chosen) : update;
          changed ||= !Object.is(next, chosen);
          chosen = next;
        }, proposalRef, readConversationState, parseItineraryPart, pruneChosenLodgings);
        pending.forEach(effect => effect());
      }
      expect(renders, "restored conversation must settle instead of repeatedly updating chosen lodging state").toBeLessThan(20);
    },
  };
}

describe("saved itinerary restoration render regression", () => {
  it("settles without sending a message, preserving restored lodging choices", () => {
    const chat = harness();
    chat.settle(restoredMessages(), "conversation-1");
    expect(chat.chosen()).toEqual({ 1: { placeId: "stay-1", name: "Saved stay" } });
    chat.settle(restoredMessages(), "conversation-1");
    chat.settle(restoredMessages("other-plan"), "conversation-2");
    chat.settle([], null);
    expect(chat.chosen()).toEqual({});
  });
  it("settles for ordinary Q&A without an itinerary", () => {
    harness().settle([{ id: "answer", role: "assistant", parts: [{ type: "text", text: "Hello" }] }], "qa-conversation");
  });
});
