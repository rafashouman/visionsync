import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth

  const publicRoutes = ["/login", "/cadastro"]
  const brandAssets = ["logo-big-white.png", "logo-big-dark.png", "logo-small-wh.png", "logo-small-dark.png", "bg-visionsync-1.jpg", "bg-visionsync-2.jpg", "bg-visionsync-3.jpg", "icon.png", "apple-touch-icon.png"]
  const isPublic = publicRoutes.some((r) => pathname.startsWith(r)) || brandAssets.some(name => pathname === `/brand/${name}`)

  if (!isLoggedIn && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url))
  }
  if (isLoggedIn && (pathname === "/login" || pathname === "/cadastro")) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
