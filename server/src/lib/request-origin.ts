/** Use the configured public URL behind a reverse proxy; never trust arbitrary forwarded hosts. */
export function hasTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin || origin === "null") return false
  const configured = process.env.AUTH_URL || process.env.NEXTAUTH_URL
  try {
    const expected = process.env.NODE_ENV === "production" && configured ? new URL(configured).origin : new URL(request.url).origin
    return origin === expected
  } catch { return false }
}
