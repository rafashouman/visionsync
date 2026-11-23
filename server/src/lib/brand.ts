// Increase when any file in /public/brand (or the favicons) is replaced.
// The version goes in the URL so browsers and /_next/image drop their cached copy.
export const BRAND_VERSION = "3"
export const brandSrc = (path: string) => `${path}?v=${BRAND_VERSION}`
