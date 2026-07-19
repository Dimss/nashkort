export const CANCELLATION_DEADLINE_HOURS = 2
export const DEFAULT_SLOT_MINUTES = 30
export const DEFAULT_OPEN_TIME = "08:00"
export const DEFAULT_CLOSE_TIME = "22:00"
export const BOOKING_WINDOW_DAYS = 7
export const BOOKING_OPEN_HOUR = 8

export function getMaxBookableDate(): Date {
  const now = new Date()
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
