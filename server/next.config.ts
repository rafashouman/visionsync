import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.2", ...(process.env.DEV_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean)],
  // Allows an isolated verification build while the local dev server is running.
  distDir: process.env.VISIONSYNC_BUILD_DIR || ".next",
}

export default nextConfig
