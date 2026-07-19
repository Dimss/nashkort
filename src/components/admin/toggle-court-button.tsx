"use client"

import { useTransition } from "react"
import { toggleCourtActive } from "@/actions/courts"
import { Button } from "@/components/ui/button"

export function ToggleCourtButton({ courtId, isActive }: { courtId: string; isActive: boolean }) {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await toggleCourtActive(courtId)
        })
      }}
    >
      {isActive ? "Deactivate" : "Activate"}
    </Button>
  )
}
