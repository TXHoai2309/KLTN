import { describe, expect, it } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import {
  createInlineSourceStreamFilter,
  filterRelevantKnowledgeExcerpts,
  selectUsedDocumentSources,
  stripExpandedKnowledgeSections,
  stripRedundantInlineSourceLines,
  type KnowledgeCandidate,
} from "./tripsage-knowledge-sources";
import { sourcesPartSchema } from "./tripsage-chat-context";
import { streamTripsageChat, TRIPSAGE_CHAT_INSTRUCTIONS } from "./tripsage-chat-service";

// Exact excerpts retrieved by production RAG in conversation 66a36527-9de1-4420-a464-4106c09e83d9
const L1_FIXTURE: KnowledgeCandidate[] = [
  {
    title: "Cột cờ lũng cú",
    text: "11.2. Giày dép và trang phục\n\nNên sử dụng giày có độ bám tốt và phù hợp đi bộ/leo bậc. Trang phục nên linh hoạt theo nhiệt độ vùng cao; áo khoác mỏng hoặc lớp giữ ấm hữu ích khi trời lạnh và có gió. Khi dự báo có mưa, nên chuẩn bị áo mưa hoặc lớp chống ẩm gọn nhẹ thay vì chỉ dựa vào ô, vì khu vực đỉnh núi thường thoáng gió.",
  },
  {
    title: "Cao nguyên đá Đồng Văn – Tài liệu tri thức du lịch",
    text: "Mùa xuân – đào, mận và không khí bản làng (khoảng tháng 1–3): UNESCO ghi nhận tháng 1–2 là giai đoạn hoa đào và hoa mận làm thay đổi rõ cảnh quan mùa xuân.",
  },
  {
    title: "Đình Chiều Lầu Thi",
    text: "21. Thời điểm tham quan\n\nChiêu Lầu Thi có thể tham quan quanh năm... Khoảng tháng 9 đến tháng 2 năm sau thường được nhắc tới như mùa săn mây nổi bật. Từ khoảng tháng 2 đến tháng 5, rừng đỗ quyên bước vào mùa hoa.",
  },
];

const L9_FIXTURE: KnowledgeCandidate[] = [
  {
    title: "Đình Chiều Lầu Thi",
    text: "24. An toàn trên tuyến\n\nChiêu Lầu Thi thuộc nhóm điểm trải nghiệm núi cao có yếu tố mạo hiểm... Rủi ro lớn nhất không nằm ở chiều dài đoạn đi bộ mà ở sự kết hợp giữa độ dốc, bề mặt ẩm, rêu, sương, gió.",
  },
  {
    title: "Cao nguyên đá Đồng Văn – Tài liệu tri thức du lịch",
    text: "18. Cách tiếp cận và phương tiện di chuyển\n\nMIA mô tả quãng đường từ khu vực thành phố Hà Giang cũ lên Đồng Văn khoảng 130 km theo Quốc lộ 4C và thời gian đi xe máy có thể khoảng 3–4 giờ.",
  },
  {
    title: "Pả Vi Hạ & Pả Vi Thượng",
    text: "12. Lưu ý khi trải nghiệm\n\nNên chuẩn bị nước uống và đồ ăn nếu đi tuyến dài... Đi bộ giúp quan sát cảnh quan chậm hơn... Cần giữ gìn môi trường, không xả rác.",
  },
  {
    title: "Đèo Mã Pì Lèng",
    text: "20. An toàn khi tham quan\n\nĐường đèo có nhiều đoạn dốc, cua, tầm nhìn thay đổi nhanh; trong điều kiện mưa hoặc sương mù có thể trơn trượt... Không dừng tùy tiện ở khúc cua, đoạn hẹp, đầu dốc hoặc nơi khuất tầm nhìn để chụp ảnh.",
  },
];

const L12_FIXTURE: KnowledgeCandidate[] = [
  {
    title: "Di tích lịch sử căng bắc mê",
    text: "20. Cách tiếp cận và các hướng di chuyển chính\n\nCăng Bắc Mê có thể tiếp cận bằng đường bộ từ các khu vực lân cận. Quốc lộ 34 là trục quan trọng kết nối khu vực Hà Giang cũ với Bắc Mê và hướng sang Cao Bằng.",
  },
  {
    title: "Đình Chiều Lầu Thi",
    text: "24. An toàn trên tuyến\n\nChiêu Lầu Thi thuộc nhóm điểm trải nghiệm núi cao có yếu tố mạo hiểm... Sau mưa, đá và đất có thể rất trơn; sương dày làm giảm khả năng quan sát lối đi.",
  },
  {
    title: "Cao nguyên đá Đồng Văn – Tài liệu tri thức du lịch",
    text: "18. Cách tiếp cận và phương tiện di chuyển\n\nVới khách ở Hà Nội hoặc từ nơi khác đến miền Bắc, hành trình thường gồm hai bước: đến khu vực Hà Giang cũ, sau đó tiếp tục theo đường bộ lên Quản Bạ – Yên Minh – Đồng Văn – Mèo Vạc.",
  },
];

describe("Point 2 — knowledge source relevance & actual-usage filtering", () => {
  it("L1 (general December weather & packing): drops off-topic Cột cờ Lũng Cú, Cao nguyên đá spring flowers, and Đình Chiều Lầu Thi", () => {
    const question = "chào bạn, hà giang tháng 12 có lạnh không, có cần mang gì đặc biệt không?";
    const filtered = filterRelevantKnowledgeExcerpts(question, L1_FIXTURE);
    const titles = filtered.map(item => item.title);
    expect(titles).not.toContain("Cột cờ lũng cú");
    expect(titles).not.toContain("Đình Chiều Lầu Thi");
    expect(titles).not.toContain("Cao nguyên đá Đồng Văn – Tài liệu tri thức du lịch");
    expect(filtered).toHaveLength(0);
  });

  it("L9 (motion sickness & mountain pass safety): drops Đình Chiều Lầu Thi and Pả Vi, keeps only Đèo Mã Pì Lèng when answer uses pass-safety facts", () => {
    const question = "vợ mình hay say xe, đường đèo có đáng lo không, lịch này có cần chỉnh gì không?";
    const filtered = filterRelevantKnowledgeExcerpts(question, L9_FIXTURE);
    const filteredTitles = filtered.map(item => item.title);
    expect(filteredTitles).not.toContain("Đình Chiều Lầu Thi");
    expect(filteredTitles).not.toContain("Pả Vi Hạ & Pả Vi Thượng");

    const answerText =
      "Đường đèo có nhiều cua và tầm nhìn thay đổi nhanh; ô tô có tài xế giúp vợ bạn đỡ phải tập trung lái, nhưng vẫn có thể say xe. Theo tài liệu địa phương, nên tránh dừng chụp ở khúc cua hay nơi khuất tầm nhìn.\n\n**Kiến thức mở rộng:** ngồi ghế trước, nhìn xa, hạn chế đọc hoặc nhìn điện thoại.";
    const used = selectUsedDocumentSources(answerText, filtered);
    expect(used).toEqual(["Đèo Mã Pì Lèng"]);
  });

  it("L12 (foreigner motorbike license in English): drops all 3 off-topic local docs (0 sources)", () => {
    const question = "Is it safe for a foreigner to ride a motorbike in Ha Giang without a Vietnamese license?";
    const filtered = filterRelevantKnowledgeExcerpts(question, L12_FIXTURE);
    expect(filtered).toHaveLength(0);

    const answerText =
      "Riding a motorbike in Hà Giang without a valid license in Vietnam is not recommended.\n\n**Kiến thức mở rộng:** Foreigners generally need a Vietnamese license or a 1968 Vienna Convention IDP.";
    const used = selectUsedDocumentSources(answerText, filtered);
    expect(used).toEqual([]);
  });

  it("drops low-similarity chunks below score threshold even when keywords loosely overlap", () => {
    const filtered = filterRelevantKnowledgeExcerpts(
      "Cột cờ Lũng Cú có gì nổi bật?",
      [
        { title: "Cột cờ Lũng Cú", text: "Cột cờ Lũng Cú nằm trên đỉnh núi Rồng.", score: 0.72 },
        { title: "Tài liệu lạc đề", text: "Lũng Cú nhắc thoáng qua.", score: 0.28 },
      ],
    );
    expect(filtered.map(item => item.title)).toEqual(["Cột cờ Lũng Cú"]);
  });

  it("strips Kiến thức mở rộng sections so general model knowledge never attaches local document sources", () => {
    const text = "Phần này là kiến thức chung.\n\n**Kiến thức mở rộng:** Đèo Mã Pì Lèng có nhiều khúc cua và tầm nhìn thay đổi nhanh.";
    expect(stripExpandedKnowledgeSections(text)).not.toContain("Mã Pì Lèng");
    const used = selectUsedDocumentSources(text, [L9_FIXTURE[3]!]);
    expect(used).toEqual([]);
  });

  it("retains genuinely relevant and used sources for direct destination Q&A", () => {
    const candidates: KnowledgeCandidate[] = [
      { title: "Cẩm nang Cột cờ Lũng Cú", text: "Cột cờ Lũng Cú nằm trên đỉnh núi Rồng ở cực Bắc.", score: 0.78 },
      { title: "Ẩm thực Đồng Văn", text: "Thắng cố và bánh tam giác mạch là đặc sản Đồng Văn.", score: 0.31 },
    ];
    const filtered = filterRelevantKnowledgeExcerpts("Cột cờ Lũng Cú có gì hay?", candidates);
    expect(filtered.map(item => item.title)).toEqual(["Cẩm nang Cột cờ Lũng Cú"]);
    const used = selectUsedDocumentSources("Cột cờ Lũng Cú nằm trên đỉnh núi Rồng rất đáng đi.", filtered);
    expect(used).toEqual(["Cẩm nang Cột cờ Lũng Cú"]);
  });

  it("end-to-end streamTripsageChat: L1, L9, L12 emit zero off-topic document citations", async () => {
    const runTurn = async (userText: string, query: string, replyText: string, fixture: KnowledgeCandidate[]) => {
      let step = 0;
      const model = new MockLanguageModelV3({
        doStream: async () => {
          const isTool = step++ === 0;
          const chunks = isTool
            ? [
                { type: "tool-call" as const, toolCallId: "k1", toolName: "lookupLocalKnowledge", input: JSON.stringify({ question: query }) },
                { type: "finish" as const, finishReason: { unified: "tool-calls" as const, raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } } },
              ]
            : [
                { type: "text-start" as const, id: "t1" },
                { type: "text-delta" as const, id: "t1", delta: replyText },
                { type: "text-end" as const, id: "t1" },
                { type: "finish" as const, finishReason: { unified: "stop" as const, raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } } },
              ];
          return {
            stream: new ReadableStream({
              start(controller) {
                for (const c of chunks) controller.enqueue(c);
                controller.close();
              },
            }),
          };
        },
      });
      const res = streamTripsageChat({
        model,
        messages: [{ role: "user", content: userText }],
        latestUserText: userText,
        planning: { candidates: async () => [], routes: { route: async () => ({ fromDestinationId: "", toDestinationId: "", status: "INSUFFICIENT_DATA", reason: "NOT_CONFIGURED", durationSeconds: null, distanceMeters: null, provider: null }) } },
        knowledge: async () => fixture,
      });
      const sse = await res.text();
      const sourceLines = sse
        .split("\n")
        .filter(line => line.startsWith("data: ") && line !== "data: [DONE]")
        .map(line => JSON.parse(line.slice(6)) as { type?: string; data?: unknown })
        .filter(chunk => chunk.type === "data-sources");
      const last = sourceLines.at(-1);
      return last ? sourcesPartSchema.parse(last.data).sources.map(s => ("title" in s ? s.title : s.domain)) : [];
    };

    const l1Sources = await runTurn(
      "chào bạn, hà giang tháng 12 có lạnh không, có cần mang gì đặc biệt không?",
      "Thời tiết Hà Giang tháng 12 lạnh không và cần mang gì",
      "**Kiến thức mở rộng:** Tháng 12 ở Hà Giang khá lạnh, nên mang áo khoác ấm, găng tay và giày bám tốt.",
      L1_FIXTURE,
    );
    expect(l1Sources).toEqual([]);

    const l9Sources = await runTurn(
      "vợ mình hay say xe, đường đèo có đáng lo không, lịch này có cần chỉnh gì không?",
      "Say xe và an toàn đường đèo Hà Giang",
      "Đường đèo có nhiều khúc cua và tầm nhìn thay đổi nhanh, không nên dừng tùy tiện ở khúc cua để chụp ảnh.\n\n**Kiến thức mở rộng:** Ngồi ghế trước, nhìn xa và hạn chế nhìn điện thoại để đỡ say xe.",
      L9_FIXTURE,
    );
    expect(l9Sources).toEqual(["Đèo Mã Pì Lèng"]);

    const l12Sources = await runTurn(
      "Is it safe for a foreigner to ride a motorbike in Ha Giang without a Vietnamese license?",
      "Người nước ngoài lái xe máy ở Hà Giang cần bằng lái gì",
      "Riding without a valid license is not recommended.\n\n**General knowledge:** Foreign riders need a Vietnamese license or 1968 IDP.",
      L12_FIXTURE,
    );
    expect(l12Sources).toEqual([]);
  });

  it("B2: strips self-inserted 'Nguồn tài liệu:' / 'Nguồn:' / 'Source:' lines in prose and live streams without hiding real source cards or mid-sentence 'nguồn'", async () => {
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("TUYỆT ĐỐI KHÔNG tự viết dòng 'Nguồn tài liệu:'");

    const withDupSource = [
      "Đường đèo Hà Giang có nhiều khúc cua và tầm nhìn thay đổi nhanh.",
      "",
      "**Kiến thức mở rộng:** Ngồi ghế trước và hạn chế nhìn điện thoại.",
      "",
      "Nguồn tài liệu: *Cao nguyên đá Đồng Văn – Tài liệu tri thức du lịch* — lưu ý đường đèo nhiều khúc cua.",
      "",
      "Nghề dệt lanh là nguồn thu nhập ổn định và người dân lấy nguồn nước suối trong vắt.",
    ].join("\n");

    const cleaned = stripRedundantInlineSourceLines(withDupSource);
    expect(cleaned).not.toContain("Nguồn tài liệu:");
    expect(cleaned).toContain("nguồn thu nhập ổn định");
    expect(cleaned).toContain("nguồn nước suối trong vắt");

    // Chunked streaming test (mid-token splits across "Nguồn tài liệu:")
    const filter = createInlineSourceStreamFilter();
    const chunks = [
      "Có nhiều khúc cua. ",
      "\n\n*Ng",
      "uồn tài liệu: Cao nguyên đá Đồng Văn.*",
      "\n\nBạn muốn chỉnh lịch không?",
    ];
    const streamed = chunks.map(c => filter.push(c)).join("") + filter.end();
    expect(streamed).toContain("Có nhiều khúc cua.");
    expect(streamed).toContain("Bạn muốn chỉnh lịch không?");
    expect(streamed).not.toContain("Nguồn tài liệu");

    // End-to-end stream check preserving data-sources while stripping inline citation line from streamed text & persisted parts
    const persistedTexts: string[] = [];
    let call = 0;
    const model = new MockLanguageModelV3({
      doStream: async () => {
        const idx = call++;
        const chunksOut =
          idx === 0
            ? [
                { type: "tool-call" as const, toolCallId: "k1", toolName: "lookupLocalKnowledge", input: JSON.stringify({ question: "Đường đèo Hà Giang và say xe" }) },
                { type: "finish" as const, finishReason: "tool-calls" as const, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
              ]
            : [
                { type: "text-start" as const, id: "t1" },
                { type: "text-delta" as const, id: "t1", delta: "Đường đèo có nhiều khúc cua và tầm nhìn thay đổi nhanh; nên tránh dừng tùy tiện để chụp ảnh.\n\n" },
                { type: "text-delta" as const, id: "t1", delta: "Nguồn tài liệu: *Cao nguyên đá Đồng Văn – Tài liệu tri thức du lịch* — lưu ý đường đèo nhiều khúc cua." },
                { type: "text-end" as const, id: "t1" },
                { type: "finish" as const, finishReason: "stop" as const, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
              ];
        return {
          stream: new ReadableStream({
            start(c) {
              for (const chunk of chunksOut) c.enqueue(chunk as never);
              c.close();
            },
          }),
        };
      },
    });
    const res = streamTripsageChat({
      model,
      messages: [{ role: "user", content: "vợ mình hay say xe, đường đèo có đáng lo không?" }],
      latestUserText: "vợ mình hay say xe, đường đèo có đáng lo không?",
      planning: { candidates: async () => [], routes: { route: async () => ({ fromDestinationId: "", toDestinationId: "", status: "INSUFFICIENT_DATA", reason: "NOT_CONFIGURED", durationSeconds: null, distanceMeters: null, provider: null }) } },
      knowledge: async () => [
        {
          title: "Cao nguyên đá Đồng Văn – Tài liệu tri thức du lịch",
          text: "An toàn giao thông đường đèo Hà Giang: nhiều khúc cua và tầm nhìn thay đổi nhanh, không nên dừng tùy tiện ở khúc cua để chụp ảnh.",
          score: 0.72,
        },
      ],
      onPersistAssistant: async (parts) => {
        for (const part of parts) {
          if (part.type === "text") persistedTexts.push(part.text);
        }
        return { status: "SUCCESS", data: {} };
      },
    });
    const sse = await res.text();
    const events = sse
      .split("\n")
      .filter(l => l.startsWith("data: ") && l !== "data: [DONE]")
      .map(l => JSON.parse(l.slice(6)) as { type?: string; delta?: string; data?: unknown });
    const streamedText = events
      .filter(e => e.type === "text-delta" && typeof e.delta === "string")
      .map(e => e.delta)
      .join("");
    expect(streamedText).toContain("khúc cua");
    expect(streamedText).not.toContain("Nguồn tài liệu");
    expect(persistedTexts.join("")).not.toContain("Nguồn tài liệu");

    const sourceEvents = events.filter(e => e.type === "data-sources");
    const lastSources = sourceEvents.at(-1)?.data;
    expect(sourcesPartSchema.parse(lastSources).sources.map(s => ("title" in s ? s.title : s.domain))).toEqual([
      "Cao nguyên đá Đồng Văn – Tài liệu tri thức du lịch",
    ]);
  });

  it("C1: strips :::suggest_replies mid-stream and converts valid replies into data-quick-replies without leaking raw fences", async () => {
    // 1. Mid-stream chunk boundary filter check
    const filter = createInlineSourceStreamFilter();
    const midChunks = [
      "Ba ngày của bạn tính cả đi-về?\n\n::",
      ":suggest_replies\n{\"replies\":[\"3 ngày tính cả đi-về\",",
      "\"3 ngày trọn vẹn ở Hà Giang\"]}\n:::",
    ];
    const streamedClean = midChunks.map(c => filter.push(c)).join("") + filter.end();
    expect(streamedClean).not.toContain(":::");
    expect(streamedClean).not.toContain("suggest_replies");
    expect(filter.takeReplies()).toEqual(["3 ngày tính cả đi-về", "3 ngày trọn vẹn ở Hà Giang"]);

    // 2. Full SSE stream & persistence check (repro dbc94215 turn 27)
    const persistedParts: unknown[] = [];
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: new ReadableStream({
          start(c) {
            c.enqueue({ type: "text-start" as const, id: "t1" });
            c.enqueue({ type: "text-delta" as const, id: "t1", delta: "Ba ngày của bạn tính cả đi-về từ Hà Nội hay là ba ngày ở điểm đến?\n\n:::" });
            c.enqueue({ type: "text-delta" as const, id: "t1", delta: "suggest_replies\n{\"replies\":[\"3 ngày tính cả đi-về\",\"3 ngày trọn vẹn ở Hà Giang\"]}\n:::" });
            c.enqueue({ type: "text-end" as const, id: "t1" });
            c.enqueue({ type: "finish" as const, finishReason: "stop" as const, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } } as never);
            c.close();
          },
        }),
      }),
    });

    const res = streamTripsageChat({
      model,
      messages: [{ role: "user", content: "so sánh Hà Giang với Sapa, nên đi đâu nếu chỉ có 3 ngày?" }],
      latestUserText: "so sánh Hà Giang với Sapa, nên đi đâu nếu chỉ có 3 ngày?",
      planning: { candidates: async () => [], routes: { route: async () => ({ fromDestinationId: "", toDestinationId: "", status: "INSUFFICIENT_DATA", reason: "NOT_CONFIGURED", durationSeconds: null, distanceMeters: null, provider: null }) } },
      onPersistAssistant: async (parts) => {
        persistedParts.push(...parts);
        return { status: "SUCCESS", data: {} };
      },
    });
    const sse = await res.text();
    const events = sse
      .split("\n")
      .filter(l => l.startsWith("data: ") && l !== "data: [DONE]")
      .map(l => JSON.parse(l.slice(6)) as { type?: string; delta?: string; data?: unknown });
    const streamedText = events.filter(e => e.type === "text-delta").map(e => e.delta ?? "").join("");
    expect(streamedText).not.toContain(":::");
    expect(streamedText).not.toContain("suggest_replies");
    expect(streamedText).toContain("Ba ngày của bạn tính cả đi-về");

    const qrEvents = events.filter(e => e.type === "data-quick-replies");
    expect(qrEvents).toHaveLength(1);
    expect((qrEvents[0]!.data as { replies: string[] }).replies).toEqual([
      "3 ngày tính cả đi-về",
      "3 ngày trọn vẹn ở Hà Giang",
    ]);

    const persistedText = (persistedParts.find((p): p is { type: "text"; text: string } => (p as { type?: string }).type === "text"))?.text ?? "";
    expect(persistedText).not.toContain(":::");
    expect(persistedParts.some(p => (p as { type?: string }).type === "data-quick-replies")).toBe(true);
  });
});
