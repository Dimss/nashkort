"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { createBooking } from "@/actions/bookings"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

type Slot = {
  startTime: string
  endTime: string
}

export function BookingDialog({
  open,
  onOpenChange,
  courtId,
  courtName,
  date,
  slots,
  onComplete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  courtId: string
  courtName: string
  date: string
  slots: Slot[]
  onComplete: () => void
}) {
  const t = useTranslations("booking")
  const tc = useTranslations("common")
  const tCourts = useTranslations("courts")
  const [isPending, startTransition] = useTransition()

  const firstSlot = slots[0]
  const lastSlot = slots[slots.length - 1]
  const totalTime = `${firstSlot.startTime} - ${lastSlot.endTime}`

  function handleConfirm() {
    startTransition(async () => {
      const result = await createBooking({
        courtId,
        date,
        slots: slots.map((s) => ({ startTime: s.startTime, endTime: s.endTime })),
      })

      if (result?.error === "OVERLAP") {
        toast.error(t("errors.overlap"))
      } else if (result?.error === "PAST_DATE") {
        toast.error(t("errors.pastDate"))
      } else if (result?.error === "UNAUTHORIZED") {
        toast.error(t("errors.unauthorized"))
      } else if (result?.error === "TOO_FAR_AHEAD") {
        toast.error(t("errors.pastDate"))
      } else if (result?.error) {
        toast.error(t("errors.overlap"))
      } else {
        toast.success(t("success"))
        onComplete()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(value) => onOpenChange(value)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("confirmTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("court")}</span>
            <span className="font-medium">{courtName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("date")}</span>
            <span className="font-medium">{date}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("time")}</span>
            <span className="font-medium">{totalTime}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{tc("status")}</span>
            <span className="font-medium">
              {slots.length} × 30 {tCourts("minutes")}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? "..." : tc("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
