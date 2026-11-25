import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPOSER_MAX_LENGTH,
  canEnqueueMessage,
  decideQueuePostTurnAction,
  enqueueQueuedMessage,
  evaluateComposerLength,
  formatQueuedPreview,
  removeQueuedMessage,
  restoreQueueToDraft,
} from "./tripsage-chat-queue";

const CLIENT_SRC = readFileSync(
  resolve(process.cwd(), "src/components/tripsage-chat/tripsage-chat-client.tsx"),
  "utf8",
);

describe("tripsage queued message behavior (Spec 1)", () => {
  it("allows typing in the composer while assistant is busy and locks only on inputLocked", () => {
    expect(CLIENT_SRC).toContain("const inputLocked = saveLocked || loadingConversation || recovering;");
    expect(CLIENT_SRC).toContain("disabled={inputLocked}");
    expect(CLIENT_SRC).not.toMatch(/id="tripsage-chat-input"[\s\S]*?disabled=\{locked\}/);
  });

  it("enqueues messages while busy instead of dropping or overwriting them", () => {
    const first = enqueueQueuedMessage([], "  Chốt phương án xe máy  ");
    expect(first.accepted).toBe(true);
    expect(first.queued).toEqual(["Chốt phương án xe máy"]);

    const second = enqueueQueuedMessage(first.queued, "Thêm Hang Lùng Khúy");
    expect(second.accepted).toBe(true);
    expect(second.queued).toEqual(["Chốt phương án xe máy", "Thêm Hang Lùng Khúy"]);
  });

  it("removes a specific queued message without reordering the rest", () => {
    const remaining = removeQueuedMessage(["mục 1", "mục 2", "mục 3"], 1);
    expect(remaining).toEqual(["mục 1", "mục 3"]);
  });

  it("auto-flushes joined queue once when assistant finishes cleanly", () => {
    const action = decideQueuePostTurnAction({
      chatStatus: "ready",
      inputLocked: false,
      legacyReadOnly: false,
      stopRequested: false,
      pendingAutoFlush: true,
      queued: ["Câu chờ 1", "Câu chờ 2"],
      draft: "",
    });
    expect(action).toEqual({
      type: "flush",
      text: "Câu chờ 1\nCâu chờ 2",
    });

    const idleAfterFlush = decideQueuePostTurnAction({
      chatStatus: "ready",
      inputLocked: false,
      legacyReadOnly: false,
      stopRequested: false,
      pendingAutoFlush: true,
      queued: [],
      draft: "",
    });
    expect(idleAfterFlush).toEqual({ type: "none" });
  });

  it("restores queue plus draft without truncating when stopped or errored", () => {
    const onStop = decideQueuePostTurnAction({
      chatStatus: "ready",
      inputLocked: false,
      legacyReadOnly: false,
      stopRequested: true,
      pendingAutoFlush: false,
      queued: ["Câu chờ A", "Câu chờ B"],
      draft: "đang gõ dở",
    });
    expect(onStop).toEqual({
      type: "restore",
      draft: "Câu chờ A\nCâu chờ B\nđang gõ dở",
    });

    const longQueued = ["a".repeat(600), "b".repeat(399)];
    const longDraft = "c".repeat(200);
    const restoredOverLimit = restoreQueueToDraft(longQueued, longDraft);
    expect(restoredOverLimit.length).toBe(1201);

    const onError = decideQueuePostTurnAction({
      chatStatus: "error",
      inputLocked: false,
      legacyReadOnly: false,
      stopRequested: false,
      pendingAutoFlush: false,
      queued: longQueued,
      draft: longDraft,
    });
    expect(onError).toEqual({
      type: "restore",
      draft: restoredOverLimit,
    });

    const evalOverLimit = evaluateComposerLength({
      busy: false,
      queued: [],
      draft: restoredOverLimit,
    });
    expect(evalOverLimit.overLimit).toBe(true);
    expect(evalOverLimit.displayCount).toBe(1201);
  });

  it("blocks enqueueing above 1000 joined characters while preserving draft and showing counter", () => {
    const existing = ["x".repeat(950)];
    const nextAttempt = "y".repeat(60);
    expect(canEnqueueMessage(existing, nextAttempt, COMPOSER_MAX_LENGTH)).toBe(false);

    const rejected = enqueueQueuedMessage(existing, nextAttempt, COMPOSER_MAX_LENGTH);
    expect(rejected.accepted).toBe(false);
    expect(rejected.queued).toEqual(existing);
    expect(rejected.totalLength).toBe(1011);

    const composerEval = evaluateComposerLength({
      busy: true,
      queued: existing,
      draft: nextAttempt,
    });
    expect(composerEval.overLimit).toBe(true);
    expect(composerEval.showCounter).toBe(true);
    expect(composerEval.displayCount).toBe(1011);
  });

  it("renders single-line preview truncation with ellipsis and accessible remove controls", () => {
    const preview = formatQueuedPreview("Dòng một\nDòng hai " + "dài ".repeat(30));
    expect(preview).not.toContain("\n");
    expect(preview.endsWith("…")).toBe(true);
    expect(CLIENT_SRC).toContain("Đang chờ gửi");
    expect(CLIENT_SRC).toContain('aria-label="Thêm vào hàng chờ"');
    expect(CLIENT_SRC).toContain('aria-label="Dừng trả lời"');
    expect(CLIENT_SRC).toContain("Bỏ câu chờ:");
    expect(CLIENT_SRC).toContain("clearQueueState()");
  });

  it("holds queued messages during INTERRUPTED recovery until recovery fails or completes", () => {
    expect(
      decideQueuePostTurnAction({
        chatStatus: "error",
        inputLocked: true, // recovering === true
        legacyReadOnly: false,
        stopRequested: false,
        pendingAutoFlush: true,
        queued: ["So sánh giúp mình cách đi"],
        draft: "",
      }),
    ).toEqual({ type: "none" });

    expect(
      decideQueuePostTurnAction({
        chatStatus: "error",
        inputLocked: false, // recovery failed
        legacyReadOnly: false,
        stopRequested: false,
        pendingAutoFlush: false,
        queued: ["So sánh giúp mình cách đi"],
        draft: "",
      }),
    ).toEqual({ type: "restore", draft: "So sánh giúp mình cách đi" });
  });

  it("wires panel actions ('So sánh cách đi', meals, savings) through submitOrQueuePrompt and reveals chat from drawer/expanded mode", () => {
    expect(CLIENT_SRC).toContain("function submitOrQueuePrompt(rawText: string)");
    expect(CLIENT_SRC).toContain("onAskAccess={() =>");
    expect(CLIENT_SRC).toContain("submitOrQueuePrompt(");
    expect(CLIENT_SRC).toContain('planPanelMode === "expanded"');
    expect(CLIENT_SRC).toContain('handlePlanPanelModeChange("split")');
    expect(CLIENT_SRC).toContain("setPlanDrawerOpen(false)");
  });
});
