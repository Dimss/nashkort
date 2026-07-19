import { describe, it, expect } from "vitest"
import {
  BOOKING_WINDOW_DAYS,
  BOOKING_OPEN_HOUR,
} from "@/lib/constants"

function generateSlots(openTime: string, closeTime: string, slotMinutes: number) {
  const slots: { startTime: string; endTime: string }[] = []
  const [openH, openM] = openTime.split(":").map(Number)
  const [closeH, closeM] = closeTime.split(":").map(Number)
  const openMinutes = openH * 60 + openM
  const closeMinutes = closeH * 60 + closeM

  for (let m = openMinutes; m + slotMinutes <= closeMinutes; m += slotMinutes) {
    const startH = String(Math.floor(m / 60)).padStart(2, "0")
    const startM = String(m % 60).padStart(2, "0")
    const endTotal = m + slotMinutes
    const endH = String(Math.floor(endTotal / 60)).padStart(2, "0")
    const endM = String(endTotal % 60).padStart(2, "0")
    slots.push({
      startTime: `${startH}:${startM}`,
      endTime: `${endH}:${endM}`,
    })
  }
  return slots
}

function markSlotStatuses(
  slots: { startTime: string; endTime: string }[],
  bookedTimes: Set<string>,
  dateStr: string,
  currentDate: string,
  currentMinutes: number
) {
  return slots.map((slot) => {
    const isBooked = bookedTimes.has(slot.startTime)
    const [slotH, slotM] = slot.startTime.split(":").map(Number)
    const slotMinutes = slotH * 60 + slotM
    const isPast = dateStr === currentDate && slotMinutes <= currentMinutes

    return {
      ...slot,
      status: (isBooked ? "booked" : isPast ? "past" : "available") as
        | "available"
        | "booked"
        | "past",
    }
  })
}

function getMaxBookableDate(now: Date): Date {
  const todayAtOpen = new Date(now)
  todayAtOpen.setHours(BOOKING_OPEN_HOUR, 0, 0, 0)

  const maxDate = new Date(now)
  if (now >= todayAtOpen) {
    maxDate.setDate(maxDate.getDate() + BOOKING_WINDOW_DAYS)
  } else {
    maxDate.setDate(maxDate.getDate() + BOOKING_WINDOW_DAYS - 1)
  }
  maxDate.setHours(23, 59, 59, 999)
  return maxDate
}

describe("Slot generation (30-min)", () => {
  it("generates correct number of 30-min slots from 08:00 to 22:00", () => {
    const slots = generateSlots("08:00", "22:00", 30)
    expect(slots).toHaveLength(28)
    expect(slots[0]).toEqual({ startTime: "08:00", endTime: "08:30" })
    expect(slots[27]).toEqual({ startTime: "21:30", endTime: "22:00" })
  })

  it("generates correct 30-min slots from 09:00 to 12:00", () => {
    const slots = generateSlots("09:00", "12:00", 30)
    expect(slots).toHaveLength(6)
    expect(slots[0]).toEqual({ startTime: "09:00", endTime: "09:30" })
    expect(slots[5]).toEqual({ startTime: "11:30", endTime: "12:00" })
  })

  it("generates no slots if window is too small", () => {
    const slots = generateSlots("08:00", "08:15", 30)
    expect(slots).toHaveLength(0)
  })

  it("handles edge case where close time equals start time", () => {
    const slots = generateSlots("10:00", "10:00", 30)
    expect(slots).toHaveLength(0)
  })

  it("generates exactly one slot when window equals slot duration", () => {
    const slots = generateSlots("08:00", "08:30", 30)
    expect(slots).toHaveLength(1)
    expect(slots[0]).toEqual({ startTime: "08:00", endTime: "08:30" })
  })
})

describe("Slot status marking", () => {
  const slots = generateSlots("08:00", "12:00", 30)

  it("marks booked slots correctly", () => {
    const booked = new Set(["09:00", "11:00"])
    const result = markSlotStatuses(slots, booked, "2025-01-15", "2025-01-14", 0)

    expect(result.find((s) => s.startTime === "09:00")!.status).toBe("booked")
    expect(result.find((s) => s.startTime === "11:00")!.status).toBe("booked")
    expect(result.find((s) => s.startTime === "08:00")!.status).toBe("available")
    expect(result.find((s) => s.startTime === "10:00")!.status).toBe("available")
  })

  it("marks past slots for today", () => {
    const booked = new Set<string>()
    const result = markSlotStatuses(slots, booked, "2025-01-15", "2025-01-15", 600)

    expect(result.find((s) => s.startTime === "08:00")!.status).toBe("past")
    expect(result.find((s) => s.startTime === "09:30")!.status).toBe("past")
    expect(result.find((s) => s.startTime === "10:00")!.status).toBe("past")
    expect(result.find((s) => s.startTime === "10:30")!.status).toBe("available")
  })

  it("does not mark past for future dates", () => {
    const booked = new Set<string>()
    const result = markSlotStatuses(slots, booked, "2025-01-16", "2025-01-15", 600)

    expect(result.every((s) => s.status === "available")).toBe(true)
  })

  it("booked takes precedence over past", () => {
    const booked = new Set(["09:00"])
    const result = markSlotStatuses(slots, booked, "2025-01-15", "2025-01-15", 600)

    expect(result.find((s) => s.startTime === "09:00")!.status).toBe("booked")
  })
})

describe("Booking window (7-day rolling)", () => {
  it("allows booking 7 days ahead after 8:00 AM", () => {
    const now = new Date("2025-03-15T09:00:00")
    const maxDate = getMaxBookableDate(now)

    expect(maxDate.getDate()).toBe(22)
    expect(maxDate.getMonth()).toBe(2)
  })

  it("only allows 6 days ahead before 8:00 AM", () => {
    const now = new Date("2025-03-15T07:00:00")
    const maxDate = getMaxBookableDate(now)

    expect(maxDate.getDate()).toBe(21)
    expect(maxDate.getMonth()).toBe(2)
  })

  it("allows booking 7 days ahead at exactly 8:00 AM", () => {
    const now = new Date("2025-03-15T08:00:00")
    const maxDate = getMaxBookableDate(now)

    expect(maxDate.getDate()).toBe(22)
    expect(maxDate.getMonth()).toBe(2)
  })

  it("handles month boundary", () => {
    const now = new Date("2025-03-28T10:00:00")
    const maxDate = getMaxBookableDate(now)

    expect(maxDate.getDate()).toBe(4)
    expect(maxDate.getMonth()).toBe(3)
  })

  it("exports correct constants", () => {
    expect(BOOKING_WINDOW_DAYS).toBe(7)
    expect(BOOKING_OPEN_HOUR).toBe(8)
  })
})
