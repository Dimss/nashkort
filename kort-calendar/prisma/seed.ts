import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { hash } from "bcryptjs"

const dbUrl = process.env.DATABASE_URL!
const connectionString = dbUrl.includes("uselibpqcompat")
  ? dbUrl
  : dbUrl + (dbUrl.includes("?") ? "&" : "?") + "uselibpqcompat=true"
const adapter = new PrismaPg(connectionString)
const prisma = new PrismaClient({ adapter })

async function main() {
  const passwordHash = await hash("admin123", 12)

  const admin = await prisma.user.upsert({
    where: { email: "admin@nashkort.ru" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@nashkort.ru",
      passwordHash,
      role: "ADMIN",
    },
  })

  console.log(`Admin user created: ${admin.email}`)

  const dimssss = await prisma.user.upsert({
    where: { email: "dimssss@gmail.com" },
    update: { role: "ADMIN" },
    create: {
      name: "Dimssss",
      email: "dimssss@gmail.com",
      passwordHash,
      role: "ADMIN",
    },
  })

  console.log(`Admin user created: ${dimssss.email}`)

  const courts = [
    {
      name: "Neve Sha'anan",
      nameRu: "Неве Шанан",
      description: "Outdoor hard court",
      descriptionRu: "Открытый хард корт",
      surface: "HARD" as const,
      isIndoor: false,
      slotMinutes: 30,
    },
  ]

  for (const courtData of courts) {
    const existing = await prisma.court.findFirst({
      where: { name: courtData.name },
    })
    if (!existing) {
      const created = await prisma.court.create({ data: courtData })
      console.log(`Court created: ${created.name}`)
    } else {
      console.log(`Court already exists: ${existing.name}`)
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
