"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { cancelBooking } from "@/actions/bookings"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { useRouter } from "@/i18n/routing"

type Booking = {
  id: string
  date: Date | string
  startTime: string
  endTime: string
  status: string
  court: {
    name: string
    nameRu: string
  }
}

export function BookingList({ bookings }: { bookings: Booking[] }) {
  const t = useTranslations()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleCancel(bookingId: string) {
    if (!confirm(t("myBookings.cancelConfirm"))) return

    startTransition(async () => {
      const result = await cancelBooking(bookingId)
      if (result?.error === "TOO_LATE") {
        toast.error("Cannot cancel within 2 hours of booking time")
      } else if (result?.error) {
        toast.error(t("common.error"))
      } else {
        toast.success(t("myBookings.cancelSuccess"))
        router.refresh()
      }
    })
  }

  if (bookings.length === 0) {
    return <p className="text-muted-foreground">{t("myBookings.noBookings")}</p>
  }

  const now = new Date()

  return (
    <div className="space-y-4">
      {bookings.map((booking) => {
        const bookingDate = new Date(booking.date)
        const dateStr = bookingDate.toLocaleDateString()
        const isUpcoming = bookingDate >= new Date(now.toDateString())
        const isCancelled = booking.status === "CANCELLED"

        return (
          <Card key={booking.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="space-y-1">
                <p className="font-medium">{booking.court.name}</p>
                <p className="text-sm text-muted-foreground">
                  {dateStr} · {booking.startTime} - {booking.endTime}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={isCancelled ? "secondary" : isUpcoming ? "default" : "secondary"}>
                  {isCancelled
                    ? t("myBookings.cancelled")
                    : isUpcoming
                    ? t("myBookings.upcoming")
                    : t("myBookings.past")}
                </Badge>
                {isUpcoming && !isCancelled && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleCancel(booking.id)}
                  >
                    {t("myBookings.cancelBooking")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
