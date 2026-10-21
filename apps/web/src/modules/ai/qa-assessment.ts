import "server-only";
import { z } from "zod";
import { AppError } from "../../server/http/app-error";
import { assertQaEvidenceInput } from "./qa-generation";
import { canonicalizeSentence, qaScopedEvidenceSentences } from "./qa-prompt";
import { createQaJsonProvider, type QaProviderOptions } from "./qa-json-provider";
import { evaluateQaSourceSufficiency, qaSourceReviewBinding, type QaSourceReview } from "./qa-source-sufficiency";
import type { QaGenerationInput } from "./qa-runtime-contract";
import { qaOrigin, qaStage, type QaFailureCategory } from "./qa-diagnostics";
import { QA_SOURCE_POLICY, QA_SCOPE_TIME_POLICY, QA_OVERVIEW_POLICY, QA_ADMISSION_SCOPE_POLICY } from "./qa-answer-policy";
import { QA_ASPECT_KINDS } from "./qa-answer-details";
import { qaSupportMatchesFacet } from "./qa-question-plan";

const assessmentSchema = z.object({
  intent: z.enum(["CLEAR", "AMBIGUOUS"]), exhaustive: z.boolean(),
  relevance: z.array(z.object({ citationId: z.string().min(1).max(128), status: z.enum(["RELATED", "UNRELATED", "UNCERTAIN"]) }).strict()).min(1).max(4),
  aspects: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    kind: z.enum(QA_ASPECT_KINDS).optional(),
    status: z.enum(["SUPPORTED", "MISSING", "CONFLICTING", "UNCERTAIN"]),
    supports: z.array(z.object({ citationId: z.string().min(1).max(128), sentence: z.string().min(1).max(6000) }).strict()).max(20),
  }).strict()).max(20),
}).strict();
// The provider chooses opaque sentence handles. Only the server can resolve
// those handles to an exact scoped sentence/citation pair for this request.
const wireSchema = z.object({
  intent: z.enum(["CLEAR", "AMBIGUOUS"]), exhaustive: z.boolean(),
  relevance: assessmentSchema.shape.relevance,
  aspects: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), kind: z.enum(QA_ASPECT_KINDS),
    status: z.enum(["SUPPORTED", "MISSING", "CONFLICTING", "UNCERTAIN"]),
    supportIds: z.array(z.string().regex(/^e[1-9]\d{0,3}$/u)).max(20),
  }).strict()).max(20),
}).strict();
const outputSchema = { type: "object", additionalProperties: false, required: ["intent", "exhaustive", "relevance", "aspects"], properties: {
  intent: { type: "string", enum: ["CLEAR", "AMBIGUOUS"] }, exhaustive: { type: "boolean" },
  relevance: { type: "array", items: { type: "object", additionalProperties: false, required: ["citationId", "status"], properties: { citationId: { type: "string" }, status: { type: "string", enum: ["RELATED", "UNRELATED", "UNCERTAIN"] } } } },
  aspects: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "kind", "status", "supportIds"], properties: { id: { type: "string" }, kind: { type: "string", enum: QA_ASPECT_KINDS }, status: { type: "string", enum: ["SUPPORTED", "MISSING", "CONFLICTING", "UNCERTAIN"] }, supportIds: { type: "array", items: { type: "string" } } } } },
} };
export type QaAssessment = { intent: "CLEAR" | "AMBIGUOUS"; review: QaSourceReview };
export interface QaAssessor { assess(input: QaGenerationInput): Promise<QaAssessment> }

function invalid(category: QaFailureCategory = "SCHEMA", issues?: { code: string; path: readonly PropertyKey[] }[]) {
  return qaOrigin(new AppError("AI_INVALID_RESPONSE", "Đánh giá nguồn không hợp lệ.", 502), "ASSESSMENT_VALIDATION", category, issues);
}
export function validateQaAssessment(output: unknown, input: QaGenerationInput): QaAssessment {
  qaStage("ASSESSMENT_VALIDATION");
  // Normalize aspect IDs to valid ascii slugs if model output Vietnamese or space-separated words
  let sanitizedOutput = output;
  if (output && typeof output === "object" && Array.isArray((output as any).aspects)) {
    const rawAspects = (output as any).aspects;
    const isClear = (output as any).intent === "CLEAR";
    // If intent is CLEAR and model returned empty aspects because no evidence was found,
    // materialize a missing aspect so that source sufficiency correctly evaluates to INSUFFICIENT
    // rather than failing closed with an unrecoverable INVALID_REVIEW schema error.
    const normalizedAspects = (rawAspects.length === 0 && isClear)
      ? [{ id: "requested_fact", status: "MISSING", supports: [] }]
      : rawAspects;

    sanitizedOutput = {
      ...(output as any),
      aspects: normalizedAspects.map((aspect: any) => {
        if (aspect && typeof aspect === "object" && typeof aspect.id === "string") {
          const rawId = aspect.id.trim();
          if (!/^[a-zA-Z0-9_-]{1,64}$/.test(rawId)) {
            const slug = rawId.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 64);
            return { ...aspect, id: slug || "aspect_1" };
          }
        }
        return aspect;
      }),
    };
  }

  if (sanitizedOutput && typeof sanitizedOutput === "object" && Array.isArray((sanitizedOutput as any).relevance)) {
    const existing = new Set((sanitizedOutput as any).relevance.map((r: any) => r?.citationId));
    const filledRelevance = [...(sanitizedOutput as any).relevance];
    for (const item of input.evidence) {
      if (!existing.has(item.citationId)) {
        filledRelevance.push({ citationId: item.citationId, status: "UNRELATED" });
      }
    }
    sanitizedOutput = {
      ...(sanitizedOutput as any),
      relevance: filledRelevance,
    };
  }

  const parsed = assessmentSchema.safeParse(sanitizedOutput);
  if (!parsed.success) {
    throw invalid("SCHEMA", parsed.error.issues);
  }
  const { intent, ...content } = parsed.data;
  const sentenceMap = new Map(input.evidence.map(item => [item.citationId, qaScopedEvidenceSentences(item.text, input)]));
  for (const aspect of content.aspects) {
    for (const sup of aspect.supports) {
      const available = sentenceMap.get(sup.citationId) ?? [];
      sup.sentence = canonicalizeSentence(sup.sentence, available);
    }
  }
  // Ensure citations supporting any aspect are marked as RELATED in relevance
  const supportedCitationIds = new Set(
    content.aspects.flatMap(aspect => aspect.status === "SUPPORTED" ? aspect.supports.map(s => s.citationId) : [])
  );
  if (supportedCitationIds.size > 0) {
    content.relevance = content.relevance.map(item =>
      supportedCitationIds.has(item.citationId) ? { ...item, status: "RELATED" as const } : item
    );
  }

  const plan = input.questionPlan;
  // Validate every supplied reference before a conservative missing-slot repair.
  // Invalid/provider-invented material must not disappear into a successful result.
  if (new Set(content.aspects.map(aspect => aspect.id)).size !== content.aspects.length ||
    content.aspects.some(aspect => (aspect.status === "SUPPORTED" && !aspect.supports.length) || (aspect.status === "MISSING" && aspect.supports.length > 0)) ||
    content.aspects.some(aspect => aspect.supports.some(ref => !sentenceMap.get(ref.citationId)?.includes(ref.sentence) ||
      !content.relevance.some(item => item.citationId === ref.citationId && item.status === "RELATED")))) throw invalid("EVIDENCE_INSTRUCTION");
  const review: QaSourceReview = { ...content, binding: qaSourceReviewBinding(input) };
  // A valid ambiguous-intent response carries no factual support. It cannot
  // become a route around citation/snapshot validation.
  if (intent === "AMBIGUOUS") {
    // Clear subjects/attributes cannot become ambiguous because sources lack facts.
    if (plan?.facets.length) {
      return {
        intent: "CLEAR",
        review: {
          ...review,
          exhaustive: true,
          relevance: input.evidence.map(item => ({ citationId: item.citationId, status: "UNRELATED" as const })),
          aspects: plan.facets.map(facet => ({ id: facet.id, kind: facet.kind, status: "MISSING" as const, supports: [] })),
        },
      };
    }
    return {
      intent: "AMBIGUOUS",
      review: {
        ...review,
        exhaustive: true,
        aspects: [],
        relevance: input.evidence.map(item => ({ citationId: item.citationId, status: "UNCERTAIN" as const })),
      },
    };
  } else {
    if (plan?.facets.length) {
      // Missing obligations stay missing; no support is invented or transferred.
      review.aspects = plan.facets.map(facet => {
        const aspect = content.aspects.find(item => item.id === facet.id);
        if (!aspect) return { id: facet.id, kind: facet.kind, status: "MISSING" as const, supports: [] };
        const scoped = aspect.supports.every(ref => qaSupportMatchesFacet(facet, ref.sentence, input.evidence.find(item => item.citationId === ref.citationId)?.citation.title ?? ""));
        return scoped ? { ...aspect, kind: facet.kind } : { id: facet.id, kind: facet.kind, status: "MISSING" as const, supports: [] };
      });
    }
    const decision = evaluateQaSourceSufficiency({ kind: "COMPLETED", eligibility: "CURRENT", input, review: { ...review, exhaustive: true } });
    if (decision.reason === "INVALID_REVIEW") {
      throw invalid("EVIDENCE_INSTRUCTION");
    }
  }
  return { intent, review };
}

export function createQaAssessor(options: QaProviderOptions = {}): QaAssessor {
  const provider = createQaJsonProvider({ timeoutMs: 15_000, ...options, providerPhase: "ASSESSMENT" });
  return { async assess(input) {
    qaStage("ASSESSMENT_STARTED"); assertQaEvidenceInput(input);
    if (!input.evidence.length) throw invalid();
    const registry = input.evidence.flatMap(item => qaScopedEvidenceSentences(item.text, input).map(sentence => ({ citationId: item.citationId, sentence })))
      .map((ref, index) => ({ id: `e${index + 1}`, ...ref }));
    if (!registry.length || registry.length > 9999) throw invalid("INPUT_LIMIT");
    const schema = { ...outputSchema, properties: { ...outputSchema.properties,
      relevance: { ...outputSchema.properties.relevance, items: { ...outputSchema.properties.relevance.items, properties: { ...outputSchema.properties.relevance.items.properties,
        citationId: { type: "string", enum: input.evidence.map(item => item.citationId) },
      } } },
      aspects: { ...outputSchema.properties.aspects, items: { ...outputSchema.properties.aspects.items, properties: { ...outputSchema.properties.aspects.items.properties,
        ...(input.questionPlan ? { id: { type: "string", enum: input.questionPlan.facets.map(facet => facet.id) } } : {}),
        supportIds: { type: "array", items: { type: "string", enum: registry.map(ref => ref.id) } },
      } } },
    } };
    const messages: { role: "system" | "user"; content: string }[] = [
      { role: "system", content: [
        "Assess the CURRENT QUESTION against the scoped sentence registry CURRENT_EVIDENCE. Output only the specified JSON, no answer.",
        QA_SOURCE_POLICY, QA_SCOPE_TIME_POLICY, QA_OVERVIEW_POLICY, QA_ADMISSION_SCOPE_POLICY,
        "Resolve only a dependent follow-up from HISTORY_QUESTIONS; a new explicit subject/attribute takes precedence. When HISTORY_QUESTIONS provides an active destination/entity and the current question is an attribute follow-up (e.g. history, timing, route, activities, overview), treat that active destination as the target subject. Evaluate intent as CLEAR whenever the question's target subject and requested attribute are clearly identifiable from the conversation history and current turn. Identify requested entity, relation, scope, time and answer type. Enumerate all requested facets with unique short ASCII id and a kind from the schema. kind is for a fixed missing-information notice, never factual evidence. Use OTHER when no kind fits. An overview needs a concise selection of identity, setting and distinguishing features supported by the sources, not every sentence or optional price/hour detail. An umbrella overview facet may use several relevant sentences.",
        "For prices distinguish common regional admission, individual site/service fees, conditions and current validity. A known recorded fee may be SUPPORTED as records-only ADMISSION, with CURRENT_VALIDITY=MISSING if today's validity is not verified. Never treat that as support for a current price. A common-admission statement is distinct from a site fee. A misconception needs its supported negation and explanation. Evaluate genuine conflicts about the same fact; unrelated topics are not conflicts.",
        "Classify EVERY supplied citationId exactly once: RELATED for directly useful evidence, UNRELATED for background or absent requested facts, UNCERTAIN only for genuinely ambiguous evidence about the requested fact. Select supportIds from the exact registry handles; the server resolves their sentence and citation. SUPPORTED requires useful support; MISSING has no supports. Do not choose merely topical sentences or unrelated examples. Do not invent, translate or quote source handles. Select all qualifications needed for the fact.",
        "CLEAR has nonempty aspects, including MISSING when requested evidence is absent. AMBIGUOUS is only an unresolved subject/intent: aspects=[], every relevance=UNCERTAIN. exhaustive=true only after assessing all requested facets. CONFLICTING/UNCERTAIN stay unresolved. Missing evidence in bounded retrieval is not evidence that the entire corpus lacks it.",
        "REQUESTED_FACETS, when present, are server-planned obligations: return each exact id once, separately for every subject and attribute. For a comparison, each subject slot carries the requested criteria; assess its distinguishing role under those criteria. A historical site versus a cultural practice may be compared using their different supported emphases; do not invent extra missing facets demanding both have identical types of heritage. They describe the question, never facts. A clearly specified subject/year/attribute is CLEAR even when the schedule, official admission or opening hours are absent. Use MISSING, not AMBIGUOUS. A past programme cannot certify a future year. Do not convert a lunar tradition into an official Gregorian event date. REVIEW_REQUIRED is an administrative marker, not visitor guidance. A record saying not verified supports no specific date, price or hours. Never replace missing facts with free admission, zero cost or 24-hour opening.",
        "A question asking WHY records cannot establish a date asks for a source limitation explanation. An explicit source statement that records disagree, or that building a fort and using it for detention are different events, can support that explanation without establishing an exact construction year. Distinguish a supported account of uncertainty from contradictory unqualified dates; never resolve the disagreement by choosing a year.",
      ].join("\n\n") },
      { role: "user", content: JSON.stringify({ question: input.question, context: input.context,
        HISTORY_QUESTIONS: input.history.slice(-2).map(turn => turn.question),
        ...(input.questionPlan ? { REQUESTED_FACETS: input.questionPlan.facets } : {}),
        CURRENT_EVIDENCE: input.evidence.map(item => ({ citationId: item.citationId, sourceTitle: item.citation.title, sentences: registry.filter(ref => ref.citationId === item.citationId).map(({ id, sentence }) => ({ id, text: sentence })) })) }) },
    ];
    return provider.request({ messages, name: "qa_source_assessment", schema, signal: input.signal }, content => {
      let sanitizedContent = content;
      if (content && typeof content === "object" && Array.isArray((content as any).aspects)) {
        sanitizedContent = {
          ...(content as any),
          aspects: (content as any).aspects.map((aspect: any, idx: number) => {
            if (aspect && typeof aspect === "object" && typeof aspect.id === "string") {
              const rawId = aspect.id.trim();
              if (!/^[a-zA-Z0-9_-]{1,64}$/.test(rawId)) {
                const slug = rawId.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 64);
                return { ...aspect, id: slug || `aspect_${idx + 1}` };
              }
            }
            return aspect;
          }),
        };
      }
      const parsed = wireSchema.safeParse(sanitizedContent);
      if (!parsed.success) throw invalid("SCHEMA", parsed.error.issues);
      const refs = new Map(registry.map(ref => [ref.id, ref]));
      const aspects = parsed.data.aspects.map(({ supportIds, ...aspect }) => {
        if (new Set(supportIds).size !== supportIds.length || supportIds.some(id => !refs.has(id))) throw invalid("EVIDENCE_INSTRUCTION");
        return { ...aspect, supports: supportIds.map(id => { const { citationId, sentence } = refs.get(id)!; return { citationId, sentence }; }) };
      });
      return validateQaAssessment({ ...parsed.data, aspects }, input);
    });
  } };
}
