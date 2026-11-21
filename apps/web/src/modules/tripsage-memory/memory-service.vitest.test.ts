import { describe, expect, it, vi } from "vitest";
import { EMBEDDING_PROVENANCE, type EmbeddingProvider } from "../rag-processing/embedding-contract";
import { createMemoryService } from "./memory-service";
import { isSensitiveMemory } from "./memory-privacy";
import { fakeMemoryStore } from "./memory-test-fixtures";

const traveler = { userId: "traveler-a" };
const other = { userId: "traveler-b" };
const preference = { content: "Tôi thích đi xe máy.", kind: "PREFERENCE" } as const;
const source = { messageId: "message-a", text: preference.content };
const vector = [1, ...Array<number>(EMBEDDING_PROVENANCE.dimensions - 1).fill(0)];
const embeddings = (): EmbeddingProvider => ({ ...EMBEDDING_PROVENANCE, embed: vi.fn(async () => [{ index: 0, embedding: vector }]) });

describe("traveler memory", () => {
  it("keeps list, cosine recall and deletes scoped to the authenticated traveler", async () => {
    const store = fakeMemoryStore();
    const service = createMemoryService(store, embeddings());
    const saved = await service.save(traveler, preference, source);
    expect(saved).toMatchObject({ status: "SUCCESS" });
    const [item] = await service.list(traveler);
    expect(item).toMatchObject(preference);
    expect(await service.list(other)).toEqual([]);
    expect(await service.recall(other, "xe máy")).toEqual([]);
    expect(await service.recall(traveler, "xe máy")).toEqual([preference]);
    expect(await service.delete(other, item!.id, "my-key")).toMatchObject({ status: "FAILED", httpStatus: 404 });
    expect(await service.deleteAll(other, "clear")).toMatchObject({ status: "SUCCESS", data: { count: 0 } });
    expect(await service.list(traveler)).toHaveLength(1);
    expect(await service.delete(traveler, item!.id, "my-key")).toMatchObject({ status: "SUCCESS", data: { count: 1 } });
    expect(await service.delete(traveler, item!.id, "my-key")).toMatchObject({ status: "SUCCESS", replayed: true });
    expect(await service.list(traveler)).toEqual([]);
  });

  it("deduplicates normalized content even at the cap, keeps the original and refuses item 101", async () => {
    const store = fakeMemoryStore();
    const service = createMemoryService(store, embeddings());
    await service.save(traveler, preference, source);
    for (let index = 0; index < 99; index++) {
      const content = `Gợi ý du lịch số ${index}`;
      await service.save(traveler, { content, kind: "NOTE" }, { text: `Hãy nhớ: ${content}` });
    }
    expect(await service.save(traveler, { ...preference, content: "TÔI  THÍCH ĐI XE MÁY!" }, { messageId: "new", text: "TÔI  THÍCH ĐI XE MÁY!" })).toMatchObject({ status: "SUCCESS" });
    expect(await service.save(traveler, { content: "Đi chơi", kind: "NOTE" }, { text: "Hãy nhớ: Đi chơi" })).toMatchObject({ status: "FAILED", error: { code: "MEMORY_LIMIT" } });
    expect(await service.list(traveler)).toHaveLength(100);
    expect(await service.list(traveler)).toEqual(expect.arrayContaining([expect.objectContaining(preference)]));
  });

  it("reuses the key after a lost response and confirms the record by reading it back", async () => {
    const store = fakeMemoryStore();
    const provider = embeddings();
    const service = createMemoryService(store, provider);
    store.loseNextWriteResponse();
    expect(await service.save(traveler, preference, source)).toMatchObject({ status: "UNKNOWN", retryWithSameKey: true });
    expect(await service.save(traveler, preference, source)).toMatchObject({ status: "SUCCESS", replayed: true });
    expect(provider.embed).toHaveBeenCalledTimes(1);
    expect(await service.list(traveler)).toHaveLength(1);
    expect(await service.deleteAll(traveler, "delete")).toMatchObject({ status: "SUCCESS", data: { count: 1 } });
    expect(await service.save(traveler, preference, source)).toMatchObject({ status: "FAILED", httpStatus: 404 });
    expect(await service.save(traveler, preference, { ...source, messageId: "new-intent" })).toMatchObject({ status: "SUCCESS" });
  });

  it("does not embed sensitive or invented text, or write when embedding fails", async () => {
    const store = fakeMemoryStore();
    const provider = embeddings();
    const service = createMemoryService(store, provider);
    for (const [content, text] of [
      ["Mật khẩu xyz", "Hãy nhớ: Mật khẩu xyz"],
      ["ăn chay", "Nơi nào có nhà hàng ngon?"],
      ["mật khẩu", "Hãy nhớ tên nhà nghỉ Mật khẩu"],
      ["ăn chay", "Đừng lưu thông tin ăn chay"],
    ]) {
      expect(await service.save(traveler, { content: content!, kind: "NOTE" }, { text: text! })).toMatchObject({ status: "FAILED" });
    }
    expect(provider.embed).not.toHaveBeenCalled();
    vi.mocked(provider.embed).mockRejectedValueOnce(new Error("private provider failure"));
    expect(await service.save(traveler, preference, source)).toMatchObject({ status: "FAILED", error: { code: "MEMORY_UNAVAILABLE" } });
    vi.mocked(provider.embed).mockResolvedValueOnce([{ index: 0, embedding: Array(1536).fill(0) }]);
    expect(await service.save(traveler, preference, source)).toMatchObject({ status: "FAILED", error: { code: "MEMORY_UNAVAILABLE" } });
    expect(await service.list(traveler)).toEqual([]);
  });

  it("does not let the model remove a negation from a preference or an explicit note", async () => {
    const provider = embeddings();
    const service = createMemoryService(fakeMemoryStore(), provider);
    const text = "Tôi không thích đi xe máy.";
    for (const prefix of ["", "Hãy nhớ: "]) {
      expect(await service.save(traveler, { content: "thích đi xe máy", kind: "PREFERENCE" }, { text: prefix + text }))
        .toMatchObject({ status: "FAILED", error: { code: "MEMORY_NOT_ALLOWED" } });
    }
    expect(provider.embed).not.toHaveBeenCalled();
  });

  it("accepts a clear transport constraint as stated", async () => {
    const service = createMemoryService(fakeMemoryStore(), embeddings());
    expect(await service.save(traveler, { content: "Đi xe máy.", kind: "CONSTRAINT" }, { text: "Đi xe máy." }))
      .toMatchObject({ status: "SUCCESS" });
  });
});

describe("server-side sensitive data filter", () => {
  it.each([
    "mật khẩu của tôi", "mật-khẩu", "password", "API key", "access token", "sk-test-abc",
    "4111 1111 1111 1111", "số tài khoản ngân hàng", "bank account number",
    "CCCD", "hộ chiếu", "passport", "nhà tôi ở 12 Nguyễn Huệ", "home address",
    "+84 912 345 678", "số điện thoại", "me@example.test", "địa chỉ thư điện tử",
    "tôi bị dị ứng", "medical diagnosis", "tôi theo đạo Phật", "religion",
    "quan điểm chính trị", "political party",
    "I live at 20 Main Street", "123 Nguyễn Trãi, Quận 1", "date of birth", "ngày sinh của tôi",
  ])("refuses %s", text => expect(isSensitiveMemory(text)).toBe(true));
  it.each(["Tôi ăn chay", "Tôi thích đi xe máy", "Không thích leo núi"])("accepts %s", text => expect(isSensitiveMemory(text)).toBe(false));
});
