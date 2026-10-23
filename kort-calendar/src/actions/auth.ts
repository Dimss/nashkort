"use server"

import { z } from "zod"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { signIn } from "@/auth"
import { AuthError } from "next-auth"

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
})

export async function registerUser(formData: FormData) {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    phone: formData.get("phone"),
  })

  if (!parsed.success) {
    return { error: "VALIDATION_ERROR" }
  }

  const { name, email, password, phone } = parsed.data

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return { error: "EMAIL_EXISTS" }
  }

  const passwordHash = await bcrypt.hash(password, 10)

  await db.user.create({
    data: { name, email, passwordHash, phone: phone || null },
  })

  try {
    await signIn("credentials", { email, password, redirect: false })
    return { success: true }
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "AUTH_ERROR" }
    }
    throw error
  }
}

export async function loginUser(formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  try {
    await signIn("credentials", { email, password, redirect: false })
    return { success: true }
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "INVALID_CREDENTIALS" }
    }
    throw error
  }
}
