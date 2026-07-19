"use client"

import { useTransition } from "react"
import { cancelBooking } from "@/actions/bookings"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function AdminCancelButton({ bookingId }: { bookingId: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Cancel this booking?")) return
        startTransition(async () => {
          const result = await cancelBooking(bookingId)
          if (result?.error) {
            toast.error("Failed to cancel")
          } else {
            toast.success("Booking cancelled")
          }
        })
      }}
    >
      {isPending ? "..." : "Cancel"}
    </Button>
  )
}
