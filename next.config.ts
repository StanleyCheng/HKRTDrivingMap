import type { NextConfig } from "next";

const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  agentRules: false,
  ...(staticExport && {
    output: "export",
    basePath: "/HKRTTrafficInfo",
    assetPrefix: "/HKRTTrafficInfo/",
    images: { unoptimized: true },
    trailingSlash: true,
    env: { NEXT_PUBLIC_BASE_PATH: "/HKRTTrafficInfo" },
  }),
};

export default nextConfig;
