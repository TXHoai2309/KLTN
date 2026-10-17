import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError } from "../../server/http/app-error";
import type { QaAnswer, QaGenerationInput } from "./qa-runtime-contract";
import { qaSourceReviewBinding } from "./qa-source-sufficiency";
import { createQaJsonProvider, type QaProviderOptions } from "./qa-json-provider";
import { qaOrigin, qaStage, qaRejectSynthesis } from "./qa-diagnostics";
import { qaScopedEvidenceSentences } from "./qa-prompt";
import { QA_SOURCE_POLICY, QA_SCOPE_TIME_POLICY, QA_ADMISSION_SCOPE_POLICY } from "./qa-answer-policy";
import { qaReviewedSupport } from "./qa-reviewed-support";

export const QA_SYNTHESIS_GATES = ["ANSWER_RELEVANCE", "REQUIRED_FACETS_COVERAGE", "ENTITY_SCOPE", "TEMPORAL_VALIDITY", "NUMERIC_FIDELITY", "CLAIM_GROUNDING", "CITATION_VALIDITY", "NATURAL_LANGUAGE_QUALITY"] as const;
// The certificate is process-local, never model/client supplied or serialized.
// Hashing the answer AND review prevents a changed answer, reference or coverage
// decision from reusing a previously verified result at the service boundary.
const certificates = new WeakMap<QaAnswer, string>();
function binding(answer: QaAnswer, input: QaGenerationInput): string {
  return createHash("sha256").update(JSON.stringify([qaSourceReviewBinding(input), input.sourceReview, answer])).digest("hex");
}
export function hasQaSynthesisCertificate(answer: QaAnswer, input: QaGenerationInput): boolean {
  return certificates.get(answer) === binding(answer, input);
}

type Support = { citationId: string; sentence: string };
const verificationSchema = z.object({
  // A concise assessment justification, not a chain of thought. Private to this
  // call: never log, publish, persist or use it to override a failed gate.
  summary: z.string().min(1).max(400),
  gates: z.array(z.object({ name: z.enum(QA_SYNTHESIS_GATES), passed: z.boolean() }).strict()).length(QA_SYNTHESIS_GATES.length),
  coveredAspects: z.array(z.string().min(1).max(64)).max(20),
  claims: z.record(z.string(), z.object({ entailed: z.boolean(), citationsValid: z.boolean() }).strict()),
}).strict();
const outputSchema = { type: "object", additionalProperties: false, required: ["summary", "gates", "coveredAspects", "claims"], properties: {
  summary: { type: "string" },
  gates: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "passed"], properties: { name: { type: "string", enum: QA_SYNTHESIS_GATES }, passed: { type: "boolean" } } } },
  coveredAspects: { type: "array", items: { type: "string" } },
  claims: { type: "object" },
} };
const invalid = () => qaOrigin(new AppError("AI_INVALID_RESPONSE", "Kiểm chứng câu trả lời không hợp lệ.", 502), "SYNTHESIS_VERIFICATION", "SCHEMA");

/** A valid negative semantic verdict is missing support, not a provider failure.
 * No lexical similarity score can certify entailment. The semantic reviewer is
 * probabilistic; reference membership and complete claim coverage are enforced
 * independently here. All source/approval/revocation guards still apply. */
function validateVerification(output: unknown, answer: QaAnswer, input: QaGenerationInput, registry: ReadonlyMap<string, Support>, partSupports: readonly (readonly string[])[], onSemanticRejection?: () => void): boolean {
  const parsed = verificationSchema.safeParse(output);
  if (!parsed.success) {
    throw invalid();
  }
  const verdict = parsed.data;
  const partKeys = answer.answerParts.map((_, index) => `p${index}`);
  if (Object.keys(verdict.claims).length !== partKeys.length || partKeys.some(key => !Object.hasOwn(verdict.claims, key))) throw invalid();
  // Text and exact references come from THIS server-bound candidate, never a
  // model-authored reconstruction or a second selection of source handles.
  // The independent reviewer must verify ALL assertions and EVERY attached
  // citation for that fixed input. Any negative verdict still rejects it.
  const raw = { ...verdict, claims: answer.answerParts.map((part, partIndex) => ({
    partIndex, text: part.text, entailed: verdict.claims[`p${partIndex}`]!.entailed,
    citationsValid: verdict.claims[`p${partIndex}`]!.citationsValid,
    supportIds: [...partSupports[partIndex]!],
  })) };
  // One verdict covers ALL wording in a part. No model-authored reconstruction
  // of sentence boundaries can accidentally drop a qualification or connective.
  if (raw.claims.length !== answer.answerParts.length || new Set(raw.claims.map(claim => claim.partIndex)).size !== answer.answerParts.length) {
    return qaRejectSynthesis("CLAIM_PARTITION");
  }
  if (raw.claims.some(claim => new Set(claim.supportIds).size !== claim.supportIds.length || claim.supportIds.some(id => !registry.has(id) || !partSupports[claim.partIndex]?.includes(id)))) {
    return qaRejectSynthesis("SUPPORT_REFERENCE");
  }
  // Model output selects bounded handles only. Exact sentences and citation IDs
  // come from this turn's reviewed server registry, never reconstructed prose.
  const value = { ...raw, claims: raw.claims.map(claim => ({ ...claim, supports: claim.supportIds.map(id => registry.get(id)!) })) };
  if (new Set(value.gates.map(gate => gate.name)).size !== QA_SYNTHESIS_GATES.length ||
      new Set(value.coveredAspects).size !== value.coveredAspects.length) {
    throw invalid();
  }
  const failedGate = value.gates.find(gate => !gate.passed);
  if (failedGate) {
    const critical = ["ANSWER_RELEVANCE", "REQUIRED_FACETS_COVERAGE", "ENTITY_SCOPE", "TEMPORAL_VALIDITY", "NUMERIC_FIDELITY"];
    const expected = new Set(input.sourceReview?.aspects.filter(aspect => aspect.status === "SUPPORTED").map(aspect => aspect.id));
    if (value.gates.filter(gate => !gate.passed).every(gate => !critical.includes(gate.name)) &&
        critical.every(name => value.gates.some(gate => gate.name === name && gate.passed)) &&
        value.coveredAspects.length === expected.size && value.coveredAspects.every(id => expected.has(id))) onSemanticRejection?.();
    return qaRejectSynthesis("GATE_REJECTED", failedGate.name);
  }
  if (value.claims.some(claim => !claim.citationsValid)) return qaRejectSynthesis("UNJUSTIFIED_CITATION");
  const unentailedClaim = value.claims.find(claim => !claim.entailed || !claim.supports.length);
  if (unentailedClaim) {
    return qaRejectSynthesis("UNENTAILED_CLAIM");
  }
  const aspects = input.sourceReview?.aspects.filter(aspect => aspect.status === "SUPPORTED") ?? [];
  const supportedAspectIds = new Set(aspects.map(a => a.id));

  const key = (ref: { citationId: string; sentence: string }) => JSON.stringify([ref.citationId, ref.sentence]);
  const allowed = new Set(aspects.flatMap(aspect => aspect.supports.map(key)));

  const validCovered = new Set(value.coveredAspects.filter(id => supportedAspectIds.has(id)));
  if (validCovered.size !== supportedAspectIds.size || value.coveredAspects.some(id => !supportedAspectIds.has(id))) {
    return qaRejectSynthesis("ASPECT_COVERAGE");
  }
  if (value.claims.some(claim => !answer.answerParts[claim.partIndex] || claim.supports.some(ref =>
    !allowed.has(key(ref)) || !answer.answerParts[claim.partIndex]!.citationIds.includes(ref.citationId)))) {
    return qaRejectSynthesis("SUPPORT_REFERENCE");
  }
  // A narrow extra guard for explicit digit-written VND amounts. Do not apply
  // numeric-token overlap to arbitrary facts: "bốn huyện" -> "4 huyện" is a
  // valid paraphrase. Spelled/scaled amounts and units require semantic review.
  const amounts = (text: string) => [...text.matchAll(/(\d+(?:[.,]\d+)*)\s*(?:đồng|VNĐ|VND)(?![\p{L}\p{N}_])/giu)]
    .map(match => match[1]!.replace(/[.,](?=\d{3}(?:[.,]|$))/g, "").replace(",", "."));
  if (value.claims.some(claim => {
    const sourceAmounts = claim.supports.flatMap(ref => amounts(ref.sentence));
    return sourceAmounts.length > 0 && amounts(claim.text).some(amount => !sourceAmounts.includes(amount));
  })) {
    return qaRejectSynthesis("NUMERIC_FIDELITY");
  }
  for (const [index, part] of answer.answerParts.entries()) {
    const claims = value.claims.filter(claim => claim.partIndex === index);
    // No unreviewed text between claims, and no decorative unrelated citations.
    const joined = claims.map(claim => claim.text).join(" ").trim();
    const target = part.text.trim();
    if (joined !== target) {
      return qaRejectSynthesis("CLAIM_PARTITION");
    }
    if (part.citationIds.some(id => !claims.some(claim => claim.supports.some(ref => ref.citationId === id)))) {
      return qaRejectSynthesis("UNJUSTIFIED_CITATION");
    }
  }
  // A reviewer cannot claim facet coverage without citing that facet's evidence.
  if (aspects.some(aspect => !aspect.supports.some(ref => value.claims.some(claim => claim.supports.some(used => key(ref) === key(used)))))) {
    return qaRejectSynthesis("ASPECT_SUPPORT");
  }
  certificates.set(answer, binding(answer, input));
  return true;
}

export function createQaSynthesisVerifier(options: QaProviderOptions = {}) {
  const provider = createQaJsonProvider({ timeoutMs: 10_000, ...options });
  const verifyOutcome = async (answer: QaAnswer, input: QaGenerationInput, selectedSupportIds?: readonly (readonly string[])[], partAspectIds?: readonly string[]): Promise<{ verified: boolean; quoteAllowed: boolean }> => {
    qaStage("SYNTHESIS_VERIFICATION");
    const requiredAspectIds = input.sourceReview?.aspects.filter(aspect => aspect.status === "SUPPORTED").map(aspect => aspect.id) ?? [];
    if (!requiredAspectIds.length) throw invalid();
    const { registry, aspects: reviewedSupport } = qaReviewedSupport(input);
    if (!registry.size) throw invalid();
    // Facet IDs are references, not prose to regenerate. A static string schema
    // lets the verifier rename an umbrella "overview" aspect into several topic
    // labels even when all semantic gates pass, spuriously discarding the answer.
    const partSupports = answer.answerParts.map((part, index) => [...registry].filter(([id, ref]) => part.citationIds.includes(ref.citationId) && (!selectedSupportIds || selectedSupportIds[index]?.includes(id))).map(([id]) => id));
    if (partSupports.some(ids => !ids.length)) { qaRejectSynthesis("SUPPORT_REFERENCE"); return { verified: false, quoteAllowed: false }; }
    const schema = { ...outputSchema, properties: { ...outputSchema.properties,
      coveredAspects: { type: "array", items: { type: "string", enum: requiredAspectIds } },
      claims: { type: "object", additionalProperties: false, required: answer.answerParts.map((_, index) => `p${index}`),
        properties: Object.fromEntries(answer.answerParts.map((_, index) => [`p${index}`, { type: "object", additionalProperties: false, required: ["entailed", "citationsValid"], properties: { entailed: { type: "boolean" }, citationsValid: { type: "boolean" } } }])) },
    } };
    const reviewedPairs = new Set(input.sourceReview?.aspects.flatMap(aspect => aspect.supports.map(ref => JSON.stringify([ref.citationId, ref.sentence]))));
    // Let the independent reviewer see omitted overview/table rows too. Do not
    // duplicate reviewed sentences or treat omitted rows as certified support.
    const otherEvidence = input.evidence.map(item => ({ citationId: item.citationId,
      sentences: qaScopedEvidenceSentences(item.text, input).filter(sentence => !reviewedPairs.has(JSON.stringify([item.citationId, sentence]))) })).filter(item => item.sentences.length);
    const messages: { role: "system" | "user"; content: string }[] = [
      { role: "system", content: [
        "Independently verify the entire Vietnamese answer. Output only the specified JSON. Do not repair, rewrite or improve it.",
        QA_SOURCE_POLICY, QA_SCOPE_TIME_POLICY, QA_ADMISSION_SCOPE_POLICY,
        "The claims object has one fixed key p0, p1, ... for EVERY input answer part. Assess EVERY word and ALL factual assertions in that complete part against ONLY its allowedSupportIds in SUPPORT_REGISTRY. Do not copy, reconstruct or select text/source references in your output; the server keeps the exact input text and references. Set entailed=false if even one assertion is unsupported. Set citationsValid=true only when EVERY citation attached to the part genuinely supports some asserted content using its selected source handles. Do not fail solely because fewer genuinely supporting citations were possible. A decorative citation still fails. No omitted parts or repaired answers.",
        "Evaluate all eight gates against meaning. ANSWER_RELEVANCE: direct response to the resolved question. REQUIRED_FACETS_COVERAGE: all requested facets, with PARTIAL allowed to leave MISSING facets unresolved. An overview needs a concise supported introduction; it need not repeat every available background fact or every support sentence. OTHER_CURRENT_EVIDENCE may reveal a necessary omission or contradiction, but is not certified claim support. Do not demand optional unasked details. coveredAspects uses the exact REQUIRED_ASPECT_IDS, never renamed topic labels. One overview facet can be covered across several parts.",
        "ENTITY_SCOPE: preserve the subject, relation and geographic/service scope. TEMPORAL_VALIDITY: preserve the actual time qualifications; REFERENCE_DATE is not price evidence. NUMERIC_FIDELITY: preserve values, units and conditions. CLAIM_GROUNDING: every factual assertion in every complete part is entailed by selected support; return a negative detailed verdict for the offending part. CITATION_VALIDITY: every selected handle belongs to that part's citations and actually supports its assertion. NATURAL_LANGUAGE_QUALITY: understandable, direct Vietnamese without irrelevant padding or pasted headings; do not reject equivalent correct wording merely because another wording would be more elegant. All gates must pass; no majority vote.",
        "summary is one private justification of at most 400 characters, identifying the concrete defect for negative gates. Detailed verdicts and global gates must agree. No step-by-step reasoning. The summary cannot override a negative gate and is never answer content.",
        "Clear pronouns/short names may refer to the unambiguous subject established by the resolved question or the earlier answer parts. This resolves reference only: earlier answer text never supplies factual evidence for another part. Do not require the full destination name or an administrative attribution phrase in every sentence. All values, scope, time qualifications and selected-source entailment still need verification.",
      ].join("\n\n") },
      { role: "user", content: JSON.stringify({ question: input.question, context: input.context, REFERENCE_DATE: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()), HISTORY_QUESTIONS: input.history.slice(-2).map(turn => turn.question), status: answer.status, answerParts: answer.answerParts.map((part, index) => ({ ...part, partId: `p${index}`, aspectId: partAspectIds?.[index], allowedSupportIds: partSupports[index] })), REQUIRED_ASPECT_IDS: requiredAspectIds, REVIEWED_SUPPORT: reviewedSupport, SUPPORT_REGISTRY: [...registry].map(([id, ref]) => ({ id, ...ref, sourceTitle: input.evidence.find(item => item.citationId === ref.citationId)!.citation.title })), OTHER_CURRENT_EVIDENCE: otherEvidence }) },
    ];
    return provider.request({ name: "qa_claim_verification", schema, signal: input.signal, messages }, output => {
      let quoteAllowed = false;
      const verified = validateVerification(output, answer, input, registry, partSupports, () => { quoteAllowed = true; });
      return { verified, quoteAllowed: !verified && quoteAllowed };
    });
  };
  return { verifyOutcome, verify: async (...args: Parameters<typeof verifyOutcome>) => (await verifyOutcome(...args)).verified };
}
