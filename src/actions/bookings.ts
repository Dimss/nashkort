"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import {
  CANCELLATION_DEADLINE_HOURS,
  getMaxBookableDate,
} from "@/lib/constants"

const bookingSchema = z.object({
  courtId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slots: z.array(
    z.object({
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
    })
  ).min(1),
})

export async function getAvailableSlots(courtId: string, dateStr: string) {
  const court = await db.court.findUnique({ where: { id: courtId } })
  if (!court) return []

  const allSlots: { startTime: string; endTime: string }[] = []
  const [openH, openM] = court.openTime.split(":").map(Number)
  const [closeH, closeM] = court.closeTime.split(":").map(Number)
  const openMinutes = openH * 60 + openM
  const closeMinutes = closeH * 60 + closeM

  for (let m = openMinutes; m + court.slotMinutes <= closeMinutes; m += court.slotMinutes) {
    const startH = String(Math.floor(m / 60)).padStart(2, "0")
    const startM = String(m % 60).padStart(2, "0")
    const endTotal = m + court.slotMinutes
    const endH = String(Math.floor(endTotal / 60)).padStart(2, "0")
    const endM = String(endTotal % 60).padStart(2, "0")
    allSlots.push({
      startTime: `${startH}:${startM}`,
      endTime: `${endH}:${endM}`,
    })
  }

  const date = new Date(dateStr + "T00:00:00")
  const bookings = await db.booking.findMany({
    where: {
      courtId,
      date,
      status: "CONFIRMED",
    },
    select: { startTime: true, user: { select: { name: true } } },
  })

  const bookedMap = new Map(bookings.map((b) => [b.startTime, b.user?.name || null]))

  const now = new Date()
  const today = now.toISOString().split("T")[0]
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const maxDate = getMaxBookableDate()
  const requestedDate = new Date(dateStr + "T12:00:00")
  const isBeyondWindow = requestedDate > maxDate

  return allSlots.map((slot) => {
    const bookedBy = bookedMap.get(slot.startTime)
    const isBooked = bookedBy !== undefined
    const [slotH, slotM] = slot.startTime.split(":").map(Number)
    const slotMinutes = slotH * 60 + slotM
    const isPast = dateStr === today && slotMinutes <= currentMinutes

    let status: "available" | "booked" | "past"
    if (isBeyondWindow) status = "past"
    else if (isBooked) status = "booked"
    else if (isPast) status = "past"
    else status = "available"

    return { ...slot, status, bookedBy: isBooked ? bookedBy : null }
  })
}

export async function createBooking(data: {
  courtId: string
  date: string
  slots: { startTime: string; endTime: string }[]
}) {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "UNAUTHORIZED" }
  }

  const parsed = bookingSchema.safeParse(data)
  if (!parsed.success) {
    return { error: "VALIDATION_ERROR" }
  }

  const { courtId, date: dateStr, slots } = parsed.data
  const date = new Date(dateStr + "T00:00:00")

  const now = new Date()
  const today = now.toISOString().split("T")[0]
  const firstSlot = slots[0]
  const [slotH, slotM] = firstSlot.startTime.split(":").map(Number)
  if (dateStr < today || (dateStr === today && slotH * 60 + slotM <= now.getHours() * 60 + now.getMinutes())) {
    return { error: "PAST_DATE" }
  }

  const maxDate = getMaxBookableDate()
  const requestedDate = new Date(dateStr + "T12:00:00")
  if (requestedDate > maxDate) {
    return { error: "TOO_FAR_AHEAD" }
  }

  const startTimes = slots.map((s) => s.startTime)
  const overlapping = await db.booking.findFirst({
    where: {
      courtId,
      date,
      status: "CONFIRMED",
      startTime: { in: startTimes },
    },
  })

  if (overlapping) {
    return { error: "OVERLAP" }
  }

  try {
    await db.booking.createMany({
      data: slots.map((slot) => ({
        courtId,
        userId: session.user.id,
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
      })),
    })
  } catch {
    return { error: "OVERLAP" }
  }

  revalidatePath(`/courts/${courtId}`)
  revalidatePath("/bookings")
  return { success: true }
}

export async function cancelBooking(bookingId: string) {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "UNAUTHORIZED" }
  }

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { court: true },
  })

  if (!booking) return { error: "NOT_FOUND" }

  const isAdmin = (session.user as { role?: string }).role === "ADMIN"
  if (booking.userId !== session.user.id && !isAdmin) {
    return { error: "FORBIDDEN" }
  }

  if (!isAdmin) {
    const bookingDate = new Date(booking.date)
    const [h, m] = booking.startTime.split(":").map(Number)
    bookingDate.setHours(h, m, 0, 0)
    const hoursUntil = (bookingDate.getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursUntil < CANCELLATION_DEADLINE_HOURS) {
      return { error: "TOO_LATE" }
    }
  }

  await db.booking.update({
    where: { id: bookingId },
    data: { status: "CANCELLED" },
  })

  revalidatePath(`/courts/${booking.courtId}`)
  revalidatePath("/bookings")
  revalidatePath("/admin/bookings")
  return { success: true }
}

export async function getUserBookings() {
  const session = await auth()
  if (!session?.user?.id) return []

  return db.booking.findMany({
    where: { userId: session.user.id },
    include: { court: true },
    orderBy: { date: "desc" },
  })
}
