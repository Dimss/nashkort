"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

type Slot = {
  startTime: string
  endTime: string
  status: "available" | "booked" | "mine" | "past"
  bookedBy: string | null
  isPast: boolean
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
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3 md:gap-2">
      {slots.map((slot) => {
        const isSelected = selectedTimes.has(slot.startTime)

        const tooltip =
          slot.status === "available"
            ? `${slot.startTime} - ${slot.endTime} · ${t("available")}`
            : slot.status === "mine"
            ? `${slot.startTime} - ${slot.endTime} · ${t("mySlot")}`
            : slot.status === "booked"
            ? `${slot.startTime} - ${slot.endTime} · ${t("taken")}${slot.bookedBy ? ` · ${slot.bookedBy}` : ""}`
            : null

        return (
          <button
            key={slot.startTime}
            onClick={() => onSlotToggle(slot)}
            disabled={slot.status !== "available"}
            className={cn(
              "relative group p-3 md:p-2 rounded-md text-base md:text-sm font-medium border transition-colors",
              slot.status === "available" && !isSelected &&
                "bg-green-50 border-green-200 text-green-700 hover:bg-green-100 cursor-pointer",
              slot.status === "available" && isSelected &&
                "bg-primary border-primary text-primary-foreground cursor-pointer",
              slot.status === "mine" &&
                "bg-blue-50 border-blue-200 text-blue-700 cursor-not-allowed",
              slot.status === "booked" &&
                "bg-red-50 border-red-200 text-red-400 cursor-not-allowed",
              slot.status === "past" &&
                "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed",
              slot.isPast && (slot.status === "mine" || slot.status === "booked") &&
                "opacity-50"
            )}
          >
            <div className="text-sm md:text-xs">{slot.startTime}</div>
            <div className="text-xs md:text-[10px] mt-0.5 opacity-70">
              {slot.status === "available"
                ? isSelected
                  ? "✓"
                  : t("available")
                : slot.status === "mine"
                ? t("mySlot")
                : slot.status === "booked"
                ? t("booked")
                : t("past")}
            </div>
            {tooltip && (
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block whitespace-nowrap rounded bg-foreground px-2 py-1 text-[11px] text-background shadow z-50">
                {tooltip}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
