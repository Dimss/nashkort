"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

type Slot = {
  startTime: string
  endTime: string
  status: "available" | "booked" | "past"
  bookedBy: string | null
}

export function TimeSlotGrid({
  slots,
  selectedSlots,
  onSlotToggle,
}: {
  slots: Slot[]
  selectedSlots: Slot[]
  onSlotToggle: (slot: Slot) => void
}) {
  const t = useTranslations("booking")
  const selectedTimes = new Set(selectedSlots.map((s) => s.startTime))

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2">
      {slots.map((slot) => {
        const isSelected = selectedTimes.has(slot.startTime)

        return (
          <button
            key={slot.startTime}
            onClick={() => onSlotToggle(slot)}
            disabled={slot.status !== "available"}
            className={cn(
              "p-2 rounded-md text-sm font-medium border transition-colors",
              slot.status === "available" && !isSelected &&
                "bg-green-50 border-green-200 text-green-700 hover:bg-green-100 cursor-pointer",
              slot.status === "available" && isSelected &&
                "bg-primary border-primary text-primary-foreground cursor-pointer",
              slot.status === "booked" &&
                "bg-red-50 border-red-200 text-red-400 cursor-not-allowed",
              slot.status === "past" &&
                "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
            )}
          >
            <div className="text-xs">{slot.startTime}</div>
            <div className="text-[10px] mt-0.5 opacity-70">
              {slot.status === "available"
                ? isSelected
                  ? "✓"
                  : t("available")
                : slot.status === "booked"
                ? t("booked")
                : t("past")}
            </div>
          </button>
        )
      })}
    </div>
  )
}
