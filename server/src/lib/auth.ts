import { allowAuthAttempt } from "@/lib/auth-rate-limit"
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const email = String(credentials.email).trim().toLowerCase().slice(0, 254)
        if (typeof credentials.password !== "string" || credentials.password.length > 1024) return null
        if (!await allowAuthAttempt("login:global", 300, 60_000) || !await allowAuthAttempt(`login:${email}`, 20, 900_000)) return null
        const user = await prisma.user.findUnique({
          where: { email: email },
        })
        if (!user || !user.password) return null
        const valid = await bcrypt.compare(credentials.password as string, user.password)
        if (!valid) return null
        return { id: user.id, email: user.email, name: user.name }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.id = user.id; token.authenticatedAt = Date.now() }
      if (token.id) {
        const account = await prisma.user.findUnique({ where: { id: String(token.id) }, select: { passwordChangedAt: true, analyticsConsent: true } })
        if (!account || (account.passwordChangedAt && account.passwordChangedAt.getTime() > Number(token.authenticatedAt || 0))) return null
        token.analyticsConsent = account.analyticsConsent === true
      }
      return token
    },
    async session({ session, token }) {
      if (token) { session.user.id = token.id as string; session.user.analyticsConsent = token.analyticsConsent === true }
      return session
    },
  },
})
