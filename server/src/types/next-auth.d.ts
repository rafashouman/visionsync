import "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      analyticsConsent: boolean
      name?: string | null
      email?: string | null
    }
  }
}
