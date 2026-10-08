import type { ExtractionFailureState } from "./extraction-contract";

export class ProcessingError extends Error {
  constructor(public readonly state: ExtractionFailureState, public readonly code: string) {
    // Never attach parser exceptions or document text to outward diagnostics.
    super(code);
  }
}
export function corrupt(code: string): never { throw new ProcessingError("CORRUPT_DOCUMENT", code); }
export function limit(code: string): never { throw new ProcessingError("RESOURCE_LIMIT", code); }
