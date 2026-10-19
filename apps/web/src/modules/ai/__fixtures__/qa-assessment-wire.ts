// Test-only encoder: semantic annotations remain hand-authored fixture pairs.
// Encode them at the mock transport boundary using the actual request registry.
export function fixtureAssessmentWire(value: unknown, request: { messages: { content: string }[] }): unknown {
  if (!value || typeof value !== "object" || !("aspects" in value) || !Array.isArray(value.aspects)) return value;
  const payload = JSON.parse(request.messages[1]!.content) as { CURRENT_EVIDENCE: { citationId: string; sentences: { id: string; text: string }[] }[] };
  return { ...value, aspects: value.aspects.map(aspect => {
    const { supports, ...rest } = aspect;
    return { ...rest, kind: aspect.kind ?? "OTHER", supportIds: (supports ?? []).map((ref: { citationId: string; sentence: string }) =>
      payload.CURRENT_EVIDENCE.find(item => item.citationId === ref.citationId)?.sentences.find(sentence => sentence.text === ref.sentence)?.id ?? "e9999") };
  }) };
}
