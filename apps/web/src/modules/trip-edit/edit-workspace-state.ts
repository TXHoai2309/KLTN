import {
  diffEditCandidate,
  editCandidateSchema,
  hasJourneyChanged,
  type EditCandidate,
} from "./edit-candidate";
import { areEditCandidatesEqual } from "./edit-preview-state";

export const MAX_WORKSPACE_UNDO_HISTORY = 50;

export type EditWorkspaceState = {
  baseRevision: string;
  baseline: EditCandidate;
  workingDraft: EditCandidate;
  undoStack: EditCandidate[];
  redoStack: EditCandidate[];
};

export function createWorkspaceState(
  baseRevision: string,
  candidate: EditCandidate,
): EditWorkspaceState {
  const snapshot = editCandidateSchema.parse(candidate);
  return {
    baseRevision,
    baseline: structuredClone(snapshot),
    workingDraft: structuredClone(snapshot),
    undoStack: [],
    redoStack: [],
  };
}

export function applyWorkspaceDraft(
  state: EditWorkspaceState,
  nextCandidate: EditCandidate,
): EditWorkspaceState {
  const next = editCandidateSchema.parse(nextCandidate);
  if (areEditCandidatesEqual(state.workingDraft, next)) return state;
  const undoStack = [...state.undoStack, structuredClone(state.workingDraft)];
  if (undoStack.length > MAX_WORKSPACE_UNDO_HISTORY) {
    undoStack.shift();
  }
  return {
    ...state,
    workingDraft: structuredClone(next),
    undoStack,
    redoStack: [],
  };
}

export function undoWorkspaceDraft(state: EditWorkspaceState): EditWorkspaceState {
  if (state.undoStack.length === 0) return state;
  const previous = state.undoStack[state.undoStack.length - 1]!;
  return {
    ...state,
    workingDraft: structuredClone(previous),
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, structuredClone(state.workingDraft)],
  };
}

export function redoWorkspaceDraft(state: EditWorkspaceState): EditWorkspaceState {
  if (state.redoStack.length === 0) return state;
  const next = state.redoStack[state.redoStack.length - 1]!;
  return {
    ...state,
    workingDraft: structuredClone(next),
    undoStack: [...state.undoStack, structuredClone(state.workingDraft)],
    redoStack: state.redoStack.slice(0, -1),
  };
}

export function syncWorkspaceApplied(
  nextRevision: string,
  savedCandidate: EditCandidate,
): EditWorkspaceState {
  return createWorkspaceState(nextRevision, savedCandidate);
}

export function resetWorkspaceToBaseline(state: EditWorkspaceState): EditWorkspaceState {
  return {
    ...state,
    workingDraft: structuredClone(state.baseline),
    undoStack: [],
    redoStack: [],
  };
}

export function rebaseWorkspaceDraft(
  state: EditWorkspaceState,
  next: {
    nextRevision: string;
    nextBaseline: EditCandidate;
    nextWorkingDraft: EditCandidate;
  },
): EditWorkspaceState {
  const baselineSnapshot = editCandidateSchema.parse(next.nextBaseline);
  const workingSnapshot = editCandidateSchema.parse(next.nextWorkingDraft);
  return {
    baseRevision: next.nextRevision,
    baseline: structuredClone(baselineSnapshot),
    workingDraft: structuredClone(workingSnapshot),
    undoStack: [...state.undoStack, structuredClone(state.workingDraft)].slice(
      -MAX_WORKSPACE_UNDO_HISTORY,
    ),
    redoStack: [],
  };
}

export function countWorkspaceChanges(
  baseline: EditCandidate,
  workingDraft: EditCandidate,
): number {
  const diff = diffEditCandidate(baseline, workingDraft);
  return (
    diff.added.length +
    diff.removed.length +
    diff.updated.length +
    Object.keys(diff.tripChanges).length +
    (hasJourneyChanged(baseline.journey, workingDraft.journey) ? 1 : 0)
  );
}
