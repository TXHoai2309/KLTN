import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

const withVarlock = varlockNextConfigPlugin();
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  // PDF.js resolves its Node worker relative to the installed ESM package.
  // Turbopack bundling breaks that path; keep this server-only parser external.
  serverExternalPackages: ["pdfjs-dist"],
  // PDF.js dynamically loads this relative ESM asset; the route trace cannot
  // discover it from the external parser's import alone.
  outputFileTracingIncludes: {
    "/api/admin/rag-documents/*/index": [
      "../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
  images: {
    unoptimized: true,
  },
  // Next 16.3's development Flight decoder waits for this one-shot channel
  // over HMR. A disconnected initial socket can lose it before hydration;
  // reconnecting does not replay the server stream. Keep HMR independent of
  // application startup until that transport can recover the initial stream.
  experimental: { reactDebugChannel: false },
};

export default withVarlock(nextConfig);
