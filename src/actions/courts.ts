"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

const courtSchema = z.object({
  name: z.string().min(1),
  nameRu: z.string().min(1),
  description: z.string().optional(),
  descriptionRu: z.string().optional(),
  surface: z.enum(["HARD", "CLAY", "GRASS", "CARPET", "ARTIFICIAL"]),
  isIndoor: z.boolean(),
  openTime: z.string().regex(/^\d{2}:\d{2}$/),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotMinutes: z.number().int().min(30).max(180),
  pricePerSlot: z.number().positive().nullable().optional(),
})

export async function getCourts(activeOnly = true) {
  const where = activeOnly ? { isActive: true } : {}
  return db.court.findMany({ where, orderBy: { name: "asc" } })
}

export async function getCourtById(courtId: string) {
  return db.court.findUnique({ where: { id: courtId } })
}

export async function createCourt(formData: FormData) {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") {
    return { error: "FORBIDDEN" }
  }

  const parsed = courtSchema.safeParse({
    name: formData.get("name"),
    nameRu: formData.get("nameRu"),
    description: formData.get("description") || undefined,
    descriptionRu: formData.get("descriptionRu") || undefined,
    surface: formData.get("surface"),
    isIndoor: formData.get("isIndoor") === "true",
    openTime: formData.get("openTime"),
    closeTime: formData.get("closeTime"),
    slotMinutes: Number(formData.get("slotMinutes")),
    pricePerSlot: formData.get("pricePerSlot") ? Number(formData.get("pricePerSlot")) : null,
  })

  if (!parsed.success) {
    return { error: "VALIDATION_ERROR" }
  }

  await db.court.create({ data: parsed.data })

  revalidatePath("/courts")
  revalidatePath("/admin/courts")
  return { success: true }
}

export async function updateCourt(courtId: string, formData: FormData) {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") {
    return { error: "FORBIDDEN" }
  }

  const parsed = courtSchema.safeParse({
    name: formData.get("name"),
    nameRu: formData.get("nameRu"),
    description: formData.get("description") || undefined,
    descriptionRu: formData.get("descriptionRu") || undefined,
    surface: formData.get("surface"),
    isIndoor: formData.get("isIndoor") === "true",
    openTime: formData.get("openTime"),
    closeTime: formData.get("closeTime"),
    slotMinutes: Number(formData.get("slotMinutes")),
    pricePerSlot: formData.get("pricePerSlot") ? Number(formData.get("pricePerSlot")) : null,
  })

  if (!parsed.success) {
    return { error: "VALIDATION_ERROR" }
  }

  await db.court.update({ where: { id: courtId }, data: parsed.data })

  revalidatePath("/courts")
  revalidatePath("/admin/courts")
  return { success: true }
}

export async function toggleCourtActive(courtId: string) {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") {
    return { error: "FORBIDDEN" }
  }

  const court = await db.court.findUnique({ where: { id: courtId } })
  if (!court) return { error: "NOT_FOUND" }

  await db.court.update({
    where: { id: courtId },
    data: { isActive: !court.isActive },
  })

  revalidatePath("/courts")
  revalidatePath("/admin/courts")
  return { success: true }
}
