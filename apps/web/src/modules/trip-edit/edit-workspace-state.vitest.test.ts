import { describe, expect, it } from "vitest";

import type { EditCandidate } from "./edit-candidate";
import {
  applyWorkspaceDraft,
  countWorkspaceChanges,
  createWorkspaceState,
  MAX_WORKSPACE_UNDO_HISTORY,
  redoWorkspaceDraft,
  resetWorkspaceToBaseline,
  syncWorkspaceApplied,
  undoWorkspaceDraft,
} from "./edit-workspace-state";

const base = (): EditCandidate => ({
  startDate: "2026-10-20",
  durationDays: 2,
  transport: "CAR",
  days: [
    {
      dayIndex: 1,
      visits: [
        { visitId: "v1", destinationId: "d1", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
      ],
    },
    { dayIndex: 2, visits: [] },
  ],
});

describe("editWorkspaceState", () => {
  it("tracks Undo and Redo across sequential edits without mutating baseline", () => {
    const initial = createWorkspaceState("2026-10-15T12:00:00.000Z", base());
    const step1 = applyWorkspaceDraft(initial, {
      ...base(),
      days: [
        { dayIndex: 1, visits: [{ visitId: "v1", destinationId: "d1", startMinute: 540, plannedDurationMinutes: 60, order: 1 }] },
        { dayIndex: 2, visits: [] },
      ],
    });
    const step2 = applyWorkspaceDraft(step1, {
      ...base(),
      days: [
        { dayIndex: 1, visits: [{ visitId: "v1", destinationId: "d1", startMinute: 600, plannedDurationMinutes: 90, order: 1 }] },
        { dayIndex: 2, visits: [] },
      ],
    });

    expect(countWorkspaceChanges(step2.baseline, step2.workingDraft)).toBe(1);
    expect(step2.undoStack).toHaveLength(2);

    const undone1 = undoWorkspaceDraft(step2);
    expect(undone1.workingDraft.days[0]!.visits[0]!.startMinute).toBe(540);
    expect(undone1.redoStack).toHaveLength(1);

    const undone2 = undoWorkspaceDraft(undone1);
    expect(undone2.workingDraft.days[0]!.visits[0]!.startMinute).toBe(480);
    expect(countWorkspaceChanges(undone2.baseline, undone2.workingDraft)).toBe(0);

    const redone = redoWorkspaceDraft(undone2);
    expect(redone.workingDraft.days[0]!.visits[0]!.startMinute).toBe(540);

    const branched = applyWorkspaceDraft(undone1, {
      ...base(),
      days: [
        { dayIndex: 1, visits: [{ visitId: "v1", destinationId: "d1", startMinute: 660, plannedDurationMinutes: 60, order: 1 }] },
        { dayIndex: 2, visits: [] },
      ],
    });
    expect(branched.redoStack).toEqual([]);
    expect(initial.baseline.days[0]!.visits[0]!.startMinute).toBe(480);
  });

  it("ignores no-op edits, caps undo history, resets baseline and syncs after save", () => {
    let state = createWorkspaceState("2026-10-15T12:00:00.000Z", base());
    expect(applyWorkspaceDraft(state, base())).toBe(state);

    for (let index = 1; index <= MAX_WORKSPACE_UNDO_HISTORY + 5; index += 1) {
      state = applyWorkspaceDraft(state, {
        ...base(),
        days: [
          { dayIndex: 1, visits: [{ visitId: "v1", destinationId: "d1", startMinute: 480 + index, plannedDurationMinutes: 60, order: 1 }] },
          { dayIndex: 2, visits: [] },
        ],
      });
    }
    expect(state.undoStack).toHaveLength(MAX_WORKSPACE_UNDO_HISTORY);

    const discarded = resetWorkspaceToBaseline(state);
    expect(discarded.workingDraft).toEqual(discarded.baseline);
    expect(discarded.undoStack).toEqual([]);
    expect(discarded.redoStack).toEqual([]);

    const synced = syncWorkspaceApplied("2026-10-16T12:00:00.000Z", state.workingDraft);
    expect(synced.baseRevision).toBe("2026-10-16T12:00:00.000Z");
    expect(synced.baseline).toEqual(state.workingDraft);
    expect(synced.undoStack).toEqual([]);
  });
});
