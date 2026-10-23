import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin()

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["10.100.102.18", "*.local"],
  serverExternalPackages: ["@prisma/adapter-pg", "pg"],
  outputFileTracingIncludes: {
    "/**": ["./src/generated/prisma/**/*"],
  },
}

export default withNextIntl(nextConfig)
