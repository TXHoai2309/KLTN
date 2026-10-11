// Resource ceilings, not execution-time guarantees. No live upload path is enabled.
export const EXTRACTION_LIMITS = Object.freeze({
  inputBytes: 20 * 1024 * 1024,
  pdfPages: 500,
  segments: 100_000,
  textUtf16Units: 5_000_000,
  chunks: 10_000,
  zipEntries: 2048,
  selectedXmlBytes: 32 * 1024 * 1024,
  singleXmlBytes: 16 * 1024 * 1024,
  xmlDepth: 128,
});
