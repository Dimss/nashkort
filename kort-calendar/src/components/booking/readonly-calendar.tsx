"use client"

import { useState, useEffect, useTransition } from "react"
import { useTranslations, useLocale } from "next-intl"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getAvailableSlots } from "@/actions/bookings"
import { getMaxBookableDate } from "@/lib/constants"
import { cn } from "@/lib/utils"

type Slot = {
  startTime: string
  endTime: string
  status: "available" | "booked" | "mine" | "past"
  bookedBy: string | null
  isPast: boolean
}

type Court = {
  id: string
  name: string
  nameRu: string
}

export function ReadonlyCalendar({ courts }: { courts: Court[] }) {
  const t = useTranslations("booking")
  const tc = useTranslations("courts")
  const locale = useLocale()

  function courtName(court: Court) {
    return locale === "ru" && court.nameRu ? court.nameRu : court.name
  }
  const [selectedCourt, setSelectedCourt] = useState(courts[0]?.id ?? "")
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [slots, setSlots] = useState<Slot[]>([])
  const [isPending, startTransition] = useTransition()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const maxDate = getMaxBookableDate()

  useEffect(() => {
    if (!selectedDate || !selectedCourt) return
    const dateStr = format(selectedDate, "yyyy-MM-dd")
    startTransition(async () => {
      const result = await getAvailableSlots(selectedCourt, dateStr)
      setSlots(result)
    })
  }, [selectedDate, selectedCourt])

  if (courts.length === 0) return null

  const currentCourt = courts.find((c) => c.id === selectedCourt)

  return (
    <div className="space-y-4">
      <h3 className="text-2xl font-bold text-center">
        {currentCourt ? courtName(currentCourt) : ""}
      </h3>

      {courts.length > 1 && (
        <div className="flex flex-wrap justify-center gap-2">
          {courts.map((court) => (
            <button
              key={court.id}
              onClick={() => setSelectedCourt(court.id)}
              className={cn(
                "px-5 py-3 md:px-4 md:py-2 rounded-md text-base md:text-sm font-medium border transition-colors",
                selectedCourt === court.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted border-border"
              )}
            >
              {courtName(court)}
            </button>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-[300px_1fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("selectDate")}</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={(date) => date < today || date > maxDate}
              locale={locale === "ru" ? ru : undefined}
              weekStartsOn={0}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <CardTitle>{t("availableSlots")}</CardTitle>
              <div className="flex gap-2 text-sm md:text-xs">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  {t("available")}
                </Badge>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  {t("mySlot")}
                </Badge>
                <Badge variant="outline" className="bg-red-50 text-red-400 border-red-200">
                  {t("booked")}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <p className="text-muted-foreground">{t("selectDate")}...</p>
            ) : slots.length === 0 ? (
              <p className="text-muted-foreground">{t("noSlots")}</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-2 md:gap-1.5">
                {slots.map((slot) => {
                  const tooltip =
                    slot.status === "available"
                      ? `${slot.startTime} - ${slot.endTime} · ${t("available")}`
                      : slot.status === "mine"
                      ? `${slot.startTime} - ${slot.endTime} · ${t("mySlot")}`
                      : slot.status === "booked"
                      ? `${slot.startTime} - ${slot.endTime} · ${t("taken")}${slot.bookedBy ? ` · ${slot.bookedBy}` : ""}`
                      : null

                  return (
                    <div
                      key={slot.startTime}
                      className={cn(
                        "relative group p-2.5 md:p-1.5 rounded text-sm md:text-xs font-medium text-center border cursor-default",
                        slot.status === "available" &&
                          "bg-green-50 border-green-200 text-green-700",
                        slot.status === "mine" &&
                          "bg-blue-50 border-blue-200 text-blue-700",
                        slot.status === "booked" &&
                          "bg-red-50 border-red-200 text-red-400",
                        slot.status === "past" &&
                          "bg-gray-50 border-gray-200 text-gray-400",
                        slot.isPast && (slot.status === "mine" || slot.status === "booked") &&
                          "opacity-50"
                      )}
                    >
                      {slot.startTime}
                      {tooltip && (
                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block whitespace-nowrap rounded bg-foreground px-2 py-1 text-[11px] text-background shadow z-50">
                          {tooltip}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
