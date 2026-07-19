"use client"

import { useState, useEffect, useTransition } from "react"
import { useTranslations } from "next-intl"
import { format } from "date-fns"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getAvailableSlots } from "@/actions/bookings"
import { getMaxBookableDate } from "@/lib/constants"
import { TimeSlotGrid } from "@/components/booking/time-slot-grid"
import { BookingDialog } from "@/components/booking/booking-dialog"

type Slot = {
  startTime: string
  endTime: string
  status: "available" | "booked" | "past"
  bookedBy: string | null
}


export function BookingCalendar({ courtId, courtName }: { courtId: string; courtName: string }) {
  const t = useTranslations("booking")
  const tc = useTranslations("common")
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedSlots, setSelectedSlots] = useState<Slot[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const maxDate = getMaxBookableDate()

  useEffect(() => {
    if (!selectedDate) return
    const dateStr = format(selectedDate, "yyyy-MM-dd")
    setSelectedSlots([])
    startTransition(async () => {
      const result = await getAvailableSlots(courtId, dateStr)
      setSlots(result)
    })
  }, [selectedDate, courtId])

  function handleSlotToggle(slot: Slot) {
    if (slot.status !== "available") return
    setSelectedSlots((prev) => {
      const exists = prev.find((s) => s.startTime === slot.startTime)
      if (exists) return prev.filter((s) => s.startTime !== slot.startTime)
      return [...prev, slot].sort((a, b) => a.startTime.localeCompare(b.startTime))
    })
  }

  function handleBookingComplete() {
    setDialogOpen(false)
    setSelectedSlots([])
    if (selectedDate) {
      const dateStr = format(selectedDate, "yyyy-MM-dd")
      startTransition(async () => {
        const result = await getAvailableSlots(courtId, dateStr)
        setSlots(result)
      })
    }
  }

  return (
    <div className="grid md:grid-cols-[300px_1fr] gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("selectDate")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            disabled={(date) => date < today || date > maxDate}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("availableSlots")}</CardTitle>
            {selectedSlots.length > 0 && (
              <Button onClick={() => setDialogOpen(true)}>
                {tc("confirm")} ({selectedSlots.length})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <p className="text-muted-foreground">{t("selectDate")}...</p>
          ) : slots.length === 0 ? (
            <p className="text-muted-foreground">{t("noSlots")}</p>
          ) : (
            <TimeSlotGrid
              slots={slots}
              selectedSlots={selectedSlots}
              onSlotToggle={handleSlotToggle}
            />
          )}
        </CardContent>
      </Card>

      {selectedSlots.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t md:hidden z-50">
          <Button className="w-full" onClick={() => setDialogOpen(true)}>
            {tc("confirm")} ({selectedSlots.length} × 30 min)
          </Button>
        </div>
      )}

      {selectedSlots.length > 0 && selectedDate && (
        <BookingDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          courtId={courtId}
          courtName={courtName}
          date={format(selectedDate, "yyyy-MM-dd")}
          slots={selectedSlots}
          onComplete={handleBookingComplete}
        />
      )}
    </div>
  )
}
