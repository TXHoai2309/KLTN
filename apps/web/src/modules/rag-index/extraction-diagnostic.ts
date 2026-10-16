import { z } from "zod";
import type { ExtractionWarning } from "../rag-processing/extraction-contract";

const schema = z.object({
  extractionStage: z.literal("TEXT_EXTRACTION"),
  ooxmlPart: z.string().max(200).regex(/^word\/[a-zA-Z0-9_./-]+$/).nullable(),
  unsupportedElement: z.string().max(120).regex(/^[a-zA-Z0-9_:./-]+$/).nullable(),
  location: z.string().max(2000).regex(/^[a-zA-Z0-9_:/.[\]-]+$/).nullable(),
  coverageFailureReason: z.string().regex(/^[A-Z0-9_]{1,80}$/),
  recoverable: z.literal(false),
  diagnosticCorrelationId: z.string().uuid(),
}).strict();
export type ExtractionDiagnostic = z.infer<typeof schema>;
export function extractionDiagnostic(warning: ExtractionWarning, id: string): ExtractionDiagnostic {
  return schema.parse({ extractionStage: "TEXT_EXTRACTION", ooxmlPart: warning.ooxmlPart ?? null,
    unsupportedElement: warning.unsupportedElement ?? null, location: warning.location ?? null,
    coverageFailureReason: warning.code, recoverable: false, diagnosticCorrelationId: id });
}
export function readExtractionDiagnostic(value: unknown): ExtractionDiagnostic | null {
  if (Array.isArray(value)) for (const item of value) {
    const result = schema.safeParse(item);
    if (result.success) return result.data;
  }
  return null;
}

export function parserExtractionDiagnostic(code: string, id: string): ExtractionDiagnostic {
  return schema.parse({ extractionStage: "TEXT_EXTRACTION", ooxmlPart: null,
    unsupportedElement: null, location: null, coverageFailureReason: code,
    recoverable: false, diagnosticCorrelationId: id });
}
