import type { NextConfig } from "next";

// AURORA_STATIC=1 → build estático (out/) para embutir no APK Android.
// No APK não há servidor: o app fala direto ao painel Xtream (src/lib/direct.ts).
const isStatic = process.env.AURORA_STATIC === "1";

const nextConfig: NextConfig = {
  output: isStatic ? "export" : "standalone",
  ...(isStatic ? { images: { unoptimized: true }, distDir: "out-build" } : {}),
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
