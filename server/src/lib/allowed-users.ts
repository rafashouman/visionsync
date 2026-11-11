export function isAllowedUser(email: string | null | undefined): boolean {
  if (!email) return false
  const allowed = process.env.ALLOWED_USER_EMAILS
  if (!allowed) return false
  const normalized = email.trim().toLowerCase()
  return allowed.split(",").some(entry => entry.trim().toLowerCase() === normalized)
}
