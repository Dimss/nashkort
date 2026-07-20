import { PrismaClient } from "@/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

function createPrismaClient() {
  const url = process.env.DATABASE_URL!
  const connectionString = url.includes("uselibpqcompat")
    ? url
    : url + (url.includes("?") ? "&" : "?") + "uselibpqcompat=true"
  const adapter = new PrismaPg(connectionString)
  return new PrismaClient({ adapter })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
