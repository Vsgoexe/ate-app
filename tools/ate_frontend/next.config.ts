import path from "node:path";
import type { NextConfig } from "next";

/**
 * On Vercel, set API_PROXY_TARGET + NEXT_PUBLIC_API_BASE_URL=/api so the
 * browser talks same-origin (avoids CORS / "Failed to fetch" to Render).
 * Electron / offline builds use standalone output + local ate_backend.
 */
const apiProxyTarget = (process.env.API_PROXY_TARGET || "").replace(/\/$/, "");
const electronBuild =
  process.env.ELECTRON_BUILD === "1" || process.env.VERILUMEN_OFFLINE === "1";

const nextConfig: NextConfig = {
  ...(electronBuild || process.env.DOCKER_BUILD === "1"
    ? { output: "standalone" as const }
    : {}),
  // Keeps standalone output flat (server.js at its root) instead of nesting it
  // under tools/ate_frontend because of the repo-level lockfile.
  ...(electronBuild ? { outputFileTracingRoot: path.resolve(process.cwd()) } : {}),
  ...(electronBuild ? { images: { unoptimized: true } } : {}),
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
