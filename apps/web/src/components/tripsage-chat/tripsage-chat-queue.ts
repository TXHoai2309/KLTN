export const COMPOSER_MAX_LENGTH = 1000;
export const QUEUE_PREVIEW_MAX_CHARS = 90;

export type QueueEnqueueResult = {
  queued: string[];
  accepted: boolean;
  totalLength: number;
};

export type ComposerLengthEvaluation = {
  displayCount: number;
  overLimit: boolean;
  showCounter: boolean;
};

export function computeQueuedMergedLength(queued: readonly string[], rawNextText?: string): number {
  const trimmedNext = rawNextText?.trim() ?? "";
  const parts = trimmedNext ? [...queued, trimmedNext] : [...queued];
  return parts.join("\n").length;
}

export function canEnqueueMessage(
  queued: readonly string[],
  rawText: string,
  maxLength = COMPOSER_MAX_LENGTH,
): boolean {
  const text = rawText.trim();
  if (!text) return false;
  return [...queued, text].join("\n").length <= maxLength;
}

export function enqueueQueuedMessage(
  queued: readonly string[],
  rawText: string,
  maxLength = COMPOSER_MAX_LENGTH,
): QueueEnqueueResult {
  const text = rawText.trim();
  if (!text) {
    return {
      queued: [...queued],
      accepted: false,
      totalLength: queued.join("\n").length,
    };
  }
  const nextQueued = [...queued, text];
  const totalLength = nextQueued.join("\n").length;
  if (totalLength > maxLength) {
    return {
      queued: [...queued],
      accepted: false,
      totalLength,
    };
  }
  return {
    queued: nextQueued,
    accepted: true,
    totalLength,
  };
}

export function removeQueuedMessage(queued: readonly string[], index: number): string[] {
  return queued.filter((_, currentIndex) => currentIndex !== index);
}

export function restoreQueueToDraft(queued: readonly string[], draft: string): string {
  const parts = [...queued.map(item => item.trim()), draft.trim()].filter(Boolean);
  return parts.join("\n");
}

export function formatQueuedPreview(text: string, maxChars = QUEUE_PREVIEW_MAX_CHARS): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

export function evaluateComposerLength(args: {
  busy: boolean;
  queued: readonly string[];
  draft: string;
  maxLength?: number;
}): ComposerLengthEvaluation {
  const maxLength = args.maxLength ?? COMPOSER_MAX_LENGTH;
  const trimmedDraft = args.draft.trim();
  const queuedPlusDraftLength = args.queued.length > 0
    ? computeQueuedMergedLength(args.queued, trimmedDraft)
    : Math.max(args.draft.length, trimmedDraft.length);
  const displayCount = args.busy && args.queued.length > 0
    ? Math.max(args.draft.length, queuedPlusDraftLength)
    : Math.max(args.draft.length, trimmedDraft.length);
  return {
    displayCount,
    overLimit: displayCount > maxLength,
    showCounter: displayCount > maxLength * 0.8,
  };
}

export type QueuePostTurnAction =
  | { type: "none" }
  | { type: "flush"; text: string }
  | { type: "restore"; draft: string };

export function decideQueuePostTurnAction(args: {
  chatStatus: string;
  inputLocked: boolean;
  legacyReadOnly: boolean;
  stopRequested: boolean;
  pendingAutoFlush: boolean;
  queued: readonly string[];
  draft: string;
}): QueuePostTurnAction {
  if (args.queued.length === 0) return { type: "none" };
  if (args.chatStatus === "error") {
    // Wait while recovering a stalled/interrupted stream from DB; restore to draft only if recovery finishes with an error.
    if (args.inputLocked) return { type: "none" };
    return {
      type: "restore",
      draft: restoreQueueToDraft(args.queued, args.draft),
    };
  }
  if (args.chatStatus === "ready" && args.stopRequested) {
    return {
      type: "restore",
      draft: restoreQueueToDraft(args.queued, args.draft),
    };
  }
  if (
    args.chatStatus === "ready" &&
    !args.inputLocked &&
    !args.legacyReadOnly &&
    !args.stopRequested &&
    args.pendingAutoFlush
  ) {
    return {
      type: "flush",
      text: args.queued.join("\n"),
    };
  }
  return { type: "none" };
}
