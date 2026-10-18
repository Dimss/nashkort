"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

async function requireAdmin() {
  const session = await auth()
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    throw new Error("FORBIDDEN")
  }
  return session
}

export async function getDashboardStats() {
  await requireAdmin()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  const [totalCourts, bookingsToday, totalUsers, monthlyBookings] = await Promise.all([
    db.court.count({ where: { isActive: true } }),
    db.booking.count({ where: { date: today, status: "CONFIRMED" } }),
    db.user.count(),
    db.booking.count({
      where: {
        date: { gte: firstOfMonth },
        status: "CONFIRMED",
      },
    }),
  ])

  return { totalCourts, bookingsToday, totalUsers, monthlyBookings }
}

export async function getAllBookings(params: {
  page?: number
  pageSize?: number
  courtId?: string
  status?: string
}) {
  await requireAdmin()

  const { page = 1, pageSize = 20, courtId, status } = params
  const where: Record<string, unknown> = {}
  if (courtId) where.courtId = courtId
  if (status) where.status = status

  const [bookings, total] = await Promise.all([
    db.booking.findMany({
      where,
      include: { court: true, user: true },
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.booking.count({ where }),
  ])

  return { bookings, total, pages: Math.ceil(total / pageSize) }
}

export async function getUsers(params: {
  page?: number
  pageSize?: number
  search?: string
}) {
  await requireAdmin()

  const { page = 1, pageSize = 20, search } = params
  const where: Record<string, unknown> = {}
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ]
  }

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      include: { _count: { select: { bookings: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.user.count({ where }),
  ])

  return { users, total, pages: Math.ceil(total / pageSize) }
}

export async function setUserRole(userId: string, role: "USER" | "ADMIN") {
  await requireAdmin()

  await db.user.update({
    where: { id: userId },
    data: { role },
  })

  revalidatePath("/admin/users")
  return { success: true }
}
