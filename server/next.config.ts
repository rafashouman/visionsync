import type { NextConfig } from "next"
import { BRAND_VERSION } from "./src/lib/brand"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.2", ...(process.env.DEV_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean)],
  // Brand files are requested as /brand/...?v=<BRAND_VERSION> so replaced logos bypass caches.
  images: { localPatterns: [{ pathname: "/brand/**", search: `?v=${BRAND_VERSION}` }] },
  // Allows an isolated verification build while the local dev server is running.
  distDir: process.env.VISIONSYNC_BUILD_DIR || ".next",
}

export default nextConfig
