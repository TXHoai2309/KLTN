// Authored offline behavior annotations, NOT owner-reviewed Hà Giang facts.
// The service/adapters run for real; semantic provider verdicts are fictional.
export type QaImprovementCase = {
  id: string; group: "social" | "mixed" | "context" | "numeric";
  question: string; previous?: string; socialBetween?: boolean; destination?: boolean;
  status: "CONVERSATIONAL" | "ANSWERED" | "CLARIFICATION_REQUIRED";
  expectedQuery?: string; expectedHistory?: string[];
};
const subject = "tôi muốn tìm hiểu về điểm mẫu a";
const social = ["hi", "Hi!!!", "xin chào bạn nhé", "chào buổi sáng", "alo bạn ơi", "cảm ơn bạn nhiều nhé", "cám ơn bạn", "thanks a lot", "tạm biệt nhé", "bạn giúp được gì", "bạn có ở đó không", "mình muốn đi du lịch Hà Giang"];
const mixed = [
  ["Chào bạn, Điểm Mẫu A có gì?", "điểm mẫu a có gì"],
  ["Cảm ơn, Điểm Mẫu A có gì?", "điểm mẫu a có gì"],
  ["Cảm ơn bạn nhé, còn giá vé thì sao?", "còn giá vé thì sao"],
  ["Xin chào, ở đó có gì đặc biệt?", "ở đó có gì đặc biệt"],
  ["Thanks, giờ mở cửa là gì?", "giờ mở cửa là gì"],
  ["hi, điểm mẫu a có miễn phí không?", "điểm mẫu a có miễn phí không"],
  ["cảm ơn, bạn có biết giá vé Điểm Mẫu B không?", "bạn có biết giá vé điểm mẫu b không"],
  ["hello, mình muốn biết về Điểm Mẫu B", "mình muốn biết về điểm mẫu b"],
] as const;
const dependent = ["Ở đó có gì?", "NÓ Ở ĐÂU?", "Giờ Mở Cửa Là Gì?", "giá vé hôm nay bao nhiêu?", "còn vé thì sao?", "kể thêm đi", "mình muốn biết thêm"];
export const qaImprovementCases: readonly QaImprovementCase[] = [
  ...social.map((question, index): QaImprovementCase => ({ id: `social-${index + 1}`, group: "social", question, status: "CONVERSATIONAL" })),
  ...mixed.map(([question, expectedQuery], index): QaImprovementCase => ({ id: `mixed-${index + 1}`, group: "mixed", question, previous: subject, status: "ANSWERED", expectedQuery,
    expectedHistory: [2, 3, 4].includes(index) ? [subject] : [] })),
  ...dependent.map((question, index): QaImprovementCase => ({ id: `context-${index + 1}`, group: "context", question, previous: subject, socialBetween: true, status: "ANSWERED", expectedQuery: question.toLocaleLowerCase("vi").replace(/\?/g, ""), expectedHistory: [subject] })),
  { id: "context-new-entity", group: "context", question: "còn điểm mẫu b thì sao?", previous: subject, status: "ANSWERED", expectedQuery: "còn điểm mẫu b thì sao", expectedHistory: [] },
  { id: "context-no-subject", group: "context", question: "Nó ở đâu?", status: "CLARIFICATION_REQUIRED" },
  { id: "context-no-price-subject", group: "context", question: "Giá vé bao nhiêu?", status: "CLARIFICATION_REQUIRED" },
  { id: "context-two-subjects", group: "context", question: "Ở đó có gì?", previous: "so sánh Điểm Mẫu A và Điểm Mẫu B", status: "CLARIFICATION_REQUIRED" },
  { id: "context-two-subjects-social", group: "context", question: "cảm ơn, còn giờ mở cửa?", previous: "so sánh Điểm Mẫu A với Điểm Mẫu B", socialBetween: true, status: "CLARIFICATION_REQUIRED" },
  { id: "context-selected-subject", group: "context", question: "Ở đó có gì?", destination: true, status: "ANSWERED", expectedQuery: "ở đó có gì", expectedHistory: [] },
  { id: "context-independent", group: "context", question: "Điểm Mẫu B có gì đặc biệt?", previous: subject, status: "ANSWERED", expectedQuery: "điểm mẫu b có gì đặc biệt", expectedHistory: [] },
  ...["Giá vé Điểm Mẫu A 50.000 đồng?", "Điểm Mẫu A mất 3,5 giờ?", "Điểm Mẫu A ngày 20/10/2026?", "Điểm Mẫu A mở lúc 7:30?", "Điểm Mẫu A không miễn phí?", "Điểm Mẫu A cách 10-20 km?"].map((question, index): QaImprovementCase => ({ id: `numeric-${index + 1}`, group: "numeric", question, status: "ANSWERED", expectedQuery: question.toLocaleLowerCase("vi").replace(/\?$/u, ""), expectedHistory: [] })),
];
