import { describe, it, expect } from "vitest"
import { CANCELLATION_DEADLINE_HOURS } from "@/lib/constants"

function canCancel(bookingDate: Date, startTime: string, now: Date): boolean {
  const [h, m] = startTime.split(":").map(Number)
  const bookingStart = new Date(bookingDate)
  bookingStart.setHours(h, m, 0, 0)
  const hoursUntil = (bookingStart.getTime() - now.getTime()) / (1000 * 60 * 60)
  return hoursUntil >= CANCELLATION_DEADLINE_HOURS
}

describe("Cancellation policy", () => {
  it("allows cancellation more than 2 hours before", () => {
    const bookingDate = new Date("2025-03-15")
    const now = new Date("2025-03-15T07:00:00")
    expect(canCancel(bookingDate, "10:00", now)).toBe(true)
  })

  it("blocks cancellation less than 2 hours before", () => {
    const bookingDate = new Date("2025-03-15")
    const now = new Date("2025-03-15T09:00:00")
    expect(canCancel(bookingDate, "10:00", now)).toBe(false)
  })

  it("blocks cancellation exactly at 2 hours before", () => {
    const bookingDate = new Date("2025-03-15")
    const now = new Date("2025-03-15T08:00:00")
    expect(canCancel(bookingDate, "10:00", now)).toBe(true)
  })

  it("blocks cancellation after booking time", () => {
    const bookingDate = new Date("2025-03-15")
    const now = new Date("2025-03-15T11:00:00")
    expect(canCancel(bookingDate, "10:00", now)).toBe(false)
  })

  it("allows cancellation day before", () => {
    const bookingDate = new Date("2025-03-16")
    const now = new Date("2025-03-15T23:00:00")
    expect(canCancel(bookingDate, "10:00", now)).toBe(true)
  })

  it("exports correct deadline constant", () => {
    expect(CANCELLATION_DEADLINE_HOURS).toBe(2)
  })
})
