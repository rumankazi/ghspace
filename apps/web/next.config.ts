import type { NextConfig } from "next";

const config: NextConfig = {
  // @ghspace/core is consumed straight from TypeScript source rather than a
  // build artifact, so Next has to compile it alongside the app.
  transpilePackages: ["@ghspace/core"],
  serverExternalPackages: ["pg"],
  images: {
    // GitHub avatars are the only remote images the dashboard renders.
    remotePatterns: [{ protocol: "https", hostname: "avatars.githubusercontent.com" }],
  },
  typedRoutes: true,
};

export default config;
