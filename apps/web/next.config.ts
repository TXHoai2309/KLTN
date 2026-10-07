import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

const withVarlock = varlockNextConfigPlugin();
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
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
