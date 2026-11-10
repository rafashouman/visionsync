import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Allows an isolated verification build while the local dev server is running.
  distDir: process.env.VISIONSYNC_BUILD_DIR || ".next",
}

export default nextConfig
