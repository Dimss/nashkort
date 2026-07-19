import createIntlMiddleware from "next-intl/middleware"
import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { routing } from "./i18n/routing"

const intlMiddleware = createIntlMiddleware(routing)
const { auth } = NextAuth(authConfig)

export default auth((req) => {
  return intlMiddleware(req)
})

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
}
