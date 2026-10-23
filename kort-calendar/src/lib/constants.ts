export const CANCELLATION_DEADLINE_HOURS = 2
export const DEFAULT_SLOT_MINUTES = 30
export const DEFAULT_OPEN_TIME = "08:00"
export const DEFAULT_CLOSE_TIME = "22:00"
export const BOOKING_WINDOW_DAYS = 7
export const BOOKING_OPEN_HOUR = 8
export const TIMEZONE = "Asia/Jerusalem"

export function nowInTimezone(): Date {
  const str = new Date().toLocaleString("en-US", { timeZone: TIMEZONE })
  return new Date(str)
}

export function todayDateStr(): string {
  const now = nowInTimezone()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function currentMinutesInTimezone(): number {
  const now = nowInTimezone()
  return now.getHours() * 60 + now.getMinutes()
}

export function getMaxBookableDate(): Date {
  const now = nowInTimezone()
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
