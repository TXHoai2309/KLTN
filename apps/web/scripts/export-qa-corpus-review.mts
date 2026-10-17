import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { qaCorpusReviewCases, qaDialogueReviewCases } from "../src/modules/ai/__fixtures__/qa-corpus-review-cases";
const snapshotSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(snapshotSha256 ?? "")) throw new Error("Pass the measured corpus snapshot SHA-256");
const path = fileURLToPath(new URL("../../../docs/implementation/ai-chatbot-corpus-review.json", import.meta.url));
let prior;
try { prior = JSON.parse(await readFile(path, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
if (prior && (prior.ownerReview !== "PENDING" || prior.cases.some((test: { reviewer?: string | null; reviewedAt?: string | null; expectedOutcome?: string | null; expectedFacts?: unknown[]; unansweredAspects?: unknown[]; notes?: string }) => test.reviewer || test.reviewedAt || test.expectedOutcome || test.expectedFacts?.length || test.unansweredAspects?.length || test.notes?.trim()))) throw new Error("Preserve existing independent reviewer annotations");
const cases = [...qaCorpusReviewCases, ...qaDialogueReviewCases];
await writeFile(path, JSON.stringify({ version: 1, evidenceClass: "DRAFT_LITERAL_SOURCE_ANNOTATIONS_NOT_SEMANTIC_GOLD", sourceSnapshotSha256: snapshotSha256,
  ownerReview: "PENDING", instructions: "Duyệt từng ca với đúng phiên bản nguồn: ghi trạng thái hợp lệ, sự kiện phải được hỗ trợ, giới hạn/thông tin thiếu, trích dẫn thực hỗ trợ và người duyệt. Đoạn khớp nguồn bên dưới chỉ phục vụ recall, không tự chứng minh câu trả lời đúng hoặc dữ kiện du lịch đã được xác minh độc lập.",
  cases: cases.map(test => ({ ...test, reviewer: null, reviewedAt: null, expectedOutcome: null, expectedFacts: [], unansweredAspects: [], notes: "" })),
}, null, 2) + "\n");
console.info("QA_CORPUS_REVIEW_DRAFT", JSON.stringify({ cases: cases.length, ownerReview: "PENDING", path }));
