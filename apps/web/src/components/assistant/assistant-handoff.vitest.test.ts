import { describe, expect, it, beforeEach } from "vitest";
import {
  setAssistantHandoff,
  consumeAssistantHandoff,
  peekAssistantHandoff,
  clearAssistantHandoff,
} from "./assistant-handoff";

describe("assistant-handoff in-memory transfer", () => {
  beforeEach(() => {
    clearAssistantHandoff();
  });

  it("stores and consumes handoff exactly once", () => {
    setAssistantHandoff({
      principal: "GUEST:test1234",
      context: { type: "DESTINATION", destinationId: "dest_1" },
      conversationId: null,
      draft: "Câu hỏi về điểm đến",
      knowledgeMode: "EXPANDED",
    });

    expect(peekAssistantHandoff()?.draft).toBe("Câu hỏi về điểm đến");

    const consumed = consumeAssistantHandoff(
      "GUEST:test1234",
      null,
      { type: "DESTINATION", destinationId: "dest_1" }
    );

    expect(consumed).not.toBeNull();
    expect(consumed?.draft).toBe("Câu hỏi về điểm đến");
    expect(consumed?.knowledgeMode).toBe("EXPANDED");

    // Second call returns null (consumed)
    expect(
      consumeAssistantHandoff(
        "GUEST:test1234",
        null,
        { type: "DESTINATION", destinationId: "dest_1" }
      )
    ).toBeNull();
  });

  it("rejects handoff when principal differs", () => {
    setAssistantHandoff({
      principal: "USER:user_1",
      context: { type: "DESTINATION", destinationId: "dest_1" },
      conversationId: "conv_123",
      draft: "Nháp bảo mật",
      knowledgeMode: "SOURCE_ONLY",
    });

    const consumed = consumeAssistantHandoff(
      "USER:user_2", // Different user
      "conv_123",
      { type: "DESTINATION", destinationId: "dest_1" }
    );

    expect(consumed).toBeNull();
    // And handoff was cleared to avoid leakage
    expect(peekAssistantHandoff()).toBeNull();
  });

  it("rejects handoff when destination context differs", () => {
    setAssistantHandoff({
      principal: "GUEST:test",
      context: { type: "DESTINATION", destinationId: "dest_a" },
      conversationId: null,
      draft: "Nháp điểm A",
      knowledgeMode: "SOURCE_ONLY",
    });

    const consumed = consumeAssistantHandoff(
      "GUEST:test",
      null,
      { type: "DESTINATION", destinationId: "dest_b" } // Different destination
    );

    expect(consumed).toBeNull();
  });

  it("rejects handoff when conversationId differs", () => {
    setAssistantHandoff({
      principal: "GUEST:test",
      context: { type: "DESTINATION", destinationId: "dest_a" },
      conversationId: "conv_a",
      draft: "Nháp",
      knowledgeMode: "EXPANDED",
    });

    const consumed = consumeAssistantHandoff(
      "GUEST:test",
      "conv_b", // Different conversation
      { type: "DESTINATION", destinationId: "dest_a" }
    );

    expect(consumed).toBeNull();
  });
});
