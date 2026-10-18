import { describe, it, expect } from "vitest"
import { z } from "zod"

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

const bookingSchema = z.object({
  courtId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
})

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
})

describe("Court validation", () => {
  it("accepts valid court data", () => {
    const result = courtSchema.safeParse({
      name: "Court 1",
      nameRu: "Корт 1",
      surface: "HARD",
      isIndoor: false,
      openTime: "08:00",
      closeTime: "22:00",
      slotMinutes: 60,
    })
    expect(result.success).toBe(true)
  })

  it("rejects empty name", () => {
    const result = courtSchema.safeParse({
      name: "",
      nameRu: "Корт 1",
      surface: "HARD",
      isIndoor: false,
      openTime: "08:00",
      closeTime: "22:00",
      slotMinutes: 60,
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid surface type", () => {
    const result = courtSchema.safeParse({
      name: "Court 1",
      nameRu: "Корт 1",
      surface: "CONCRETE",
      isIndoor: false,
      openTime: "08:00",
      closeTime: "22:00",
      slotMinutes: 60,
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid time format", () => {
    const result = courtSchema.safeParse({
      name: "Court 1",
      nameRu: "Корт 1",
      surface: "HARD",
      isIndoor: false,
      openTime: "8:00",
      closeTime: "22:00",
      slotMinutes: 60,
    })
    expect(result.success).toBe(false)
  })

  it("rejects slot duration below minimum", () => {
    const result = courtSchema.safeParse({
      name: "Court 1",
      nameRu: "Корт 1",
      surface: "HARD",
      isIndoor: false,
      openTime: "08:00",
      closeTime: "22:00",
      slotMinutes: 15,
    })
    expect(result.success).toBe(false)
  })

  it("rejects slot duration above maximum", () => {
    const result = courtSchema.safeParse({
      name: "Court 1",
      nameRu: "Корт 1",
      surface: "HARD",
      isIndoor: false,
      openTime: "08:00",
      closeTime: "22:00",
      slotMinutes: 240,
    })
    expect(result.success).toBe(false)
  })

  it("accepts optional price", () => {
    const result = courtSchema.safeParse({
      name: "Court 1",
      nameRu: "Корт 1",
      surface: "CLAY",
      isIndoor: true,
      openTime: "09:00",
      closeTime: "21:00",
      slotMinutes: 90,
      pricePerSlot: 1500,
    })
    expect(result.success).toBe(true)
  })

  it("accepts null price", () => {
    const result = courtSchema.safeParse({
      name: "Court 1",
      nameRu: "Корт 1",
      surface: "GRASS",
      isIndoor: false,
      openTime: "08:00",
      closeTime: "20:00",
      slotMinutes: 60,
      pricePerSlot: null,
    })
    expect(result.success).toBe(true)
  })
})

describe("Booking validation", () => {
  it("accepts valid booking data", () => {
    const result = bookingSchema.safeParse({
      courtId: "abc123",
      date: "2025-03-15",
      startTime: "10:00",
      endTime: "11:00",
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid date format", () => {
    const result = bookingSchema.safeParse({
      courtId: "abc123",
      date: "15-03-2025",
      startTime: "10:00",
      endTime: "11:00",
    })
    expect(result.success).toBe(false)
  })

  it("rejects empty courtId", () => {
    const result = bookingSchema.safeParse({
      courtId: "",
      date: "2025-03-15",
      startTime: "10:00",
      endTime: "11:00",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid time format", () => {
    const result = bookingSchema.safeParse({
      courtId: "abc123",
      date: "2025-03-15",
      startTime: "10:00am",
      endTime: "11:00",
    })
    expect(result.success).toBe(false)
  })
})

describe("Registration validation", () => {
  it("accepts valid registration data", () => {
    const result = registerSchema.safeParse({
      name: "John Doe",
      email: "john@example.com",
      password: "password123",
    })
    expect(result.success).toBe(true)
  })

  it("rejects short name", () => {
    const result = registerSchema.safeParse({
      name: "J",
      email: "john@example.com",
      password: "password123",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid email", () => {
    const result = registerSchema.safeParse({
      name: "John",
      email: "not-an-email",
      password: "password123",
    })
    expect(result.success).toBe(false)
  })

  it("rejects short password", () => {
    const result = registerSchema.safeParse({
      name: "John",
      email: "john@example.com",
      password: "12345",
    })
    expect(result.success).toBe(false)
  })

  it("accepts optional phone", () => {
    const result = registerSchema.safeParse({
      name: "Иван Иванов",
      email: "ivan@example.com",
      password: "password123",
      phone: "+7 999 123 4567",
    })
    expect(result.success).toBe(true)
  })
})
