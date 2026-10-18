"use server"

import { z } from "zod"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

const profileSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
})

export async function updateProfile(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) return { error: "UNAUTHORIZED" }

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
  })

  if (!parsed.success) return { error: "VALIDATION_ERROR" }

  await db.user.update({
    where: { id: session.user.id },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
    },
  })

  revalidatePath("/profile")
  return { success: true }
}

export async function changePassword(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) return { error: "UNAUTHORIZED" }

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  })

  if (!parsed.success) return { error: "VALIDATION_ERROR" }

  const user = await db.user.findUnique({ where: { id: session.user.id } })
  if (!user || !user.passwordHash) return { error: "NOT_FOUND" }

  const isValid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash)
  if (!isValid) return { error: "WRONG_PASSWORD" }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10)
  await db.user.update({
    where: { id: session.user.id },
    data: { passwordHash: newHash },
  })

  return { success: true }
}

export async function getProfile() {
  const session = await auth()
  if (!session?.user?.id) return null

  return db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, phone: true },
  })
}
