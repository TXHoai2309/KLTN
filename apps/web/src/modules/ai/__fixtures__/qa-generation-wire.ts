// Test-only transport encoder. Existing hand-authored semantic/citation fixtures
// are translated to the runtime's request-local source handles, never vice versa.
import { createQaGenerator } from "../qa-generation";
import type { QaProviderOptions } from "../qa-json-provider";
export function createFixtureQaGenerator(options: QaProviderOptions = {}) {
  if (!options.fetcher) return createQaGenerator(options);
  const original = options.fetcher;
  return createQaGenerator({ ...options, fetcher: async (url, init) => {
    const response = await original(url, init);
    const request = JSON.parse(String(init?.body));
    const name = request.response_format?.json_schema?.name;
    if (!response.ok || !["grounded_qa", "qa_claim_verification"].includes(name)) return response;
    try {
      const raw = await response.clone().text();
      if (raw.length > 64 * 1024) return response;
      const envelope = JSON.parse(raw);
      if (!envelope.choices?.[0]?.message?.content) return response;
      const output = JSON.parse(envelope.choices[0].message.content);
      const payload = JSON.parse(request.messages[1].content);
      if (name === "qa_claim_verification" && Array.isArray(output.claims)) {
        const legacy = output.claims;
        output.claims = Object.fromEntries(payload.answerParts.map((part: { text: string; citationIds: string[]; allowedSupportIds: string[] }, index: number) => {
          const claims = legacy.filter((claim: { partIndex: number }) => claim.partIndex === index);
          const ids: string[] = claims.flatMap((claim: { supportIds: string[] }) => claim.supportIds ?? []);
          const valid = new Set(ids).size === ids.length && ids.every(id => part.allowedSupportIds.includes(id));
          const citationsValid = valid && part.citationIds.every(id => ids.some(handle => payload.SUPPORT_REGISTRY.some((ref: { id: string; citationId: string }) => ref.id === handle && ref.citationId === id)));
          return [`p${index}`, { entailed: claims.length > 0 && valid && citationsValid && claims.every((claim: { entailed: boolean }) => claim.entailed) && claims.map((claim: { text: string }) => claim.text).join(" ").trim() === part.text.trim(),
            citationsValid,
            ...(claims.some((claim: object) => "supports" in claim) ? { supports: [] } : {}),
          }];
        }));
        envelope.choices[0].message.content = JSON.stringify(output);
        return new Response(JSON.stringify(envelope), { status: response.status, headers: response.headers });
      }
      if (!Array.isArray(output.answerParts)) return response;
      const registry = payload.SUPPORT_REGISTRY as { id: string; citationId: string }[];
      const parts = output.answerParts.map((part: { text: string; citationIds?: string[]; supportIds?: string[] }) => {
        if (!Array.isArray(part.citationIds)) return part;
        const supportIds = part.citationIds.flatMap(id => {
          const refs = registry.filter(ref => ref.citationId === id).map(ref => ref.id);
          return refs.length ? refs : ["s999"];
        });
        return { text: part.text, supportIds };
      });
      output.facets = Object.fromEntries(payload.REVIEWED_SUPPORT.map((aspect: { id: string; supportIds: string[] }, index: number) => [aspect.id,
        parts.filter((part: { supportIds?: string[] }) => part.supportIds?.some(id => aspect.supportIds.includes(id) || index === 0 && !registry.some(ref => ref.id === id)))
          .map((part: { text: string; supportIds: string[] }) => ({ ...part, supportIds: part.supportIds.filter(id => aspect.supportIds.includes(id) || !registry.some(ref => ref.id === id)) })),
      ]));
      delete output.answerParts;
      envelope.choices[0].message.content = JSON.stringify(output);
      return new Response(JSON.stringify(envelope), { status: response.status, headers: response.headers });
    } catch { return response; }
  } });
}
