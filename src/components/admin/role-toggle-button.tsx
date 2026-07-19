"use client"

import { useTransition } from "react"
import { setUserRole } from "@/actions/admin"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function RoleToggleButton({ userId, currentRole }: { userId: string; currentRole: string }) {
  const [isPending, startTransition] = useTransition()
  const newRole = currentRole === "ADMIN" ? "USER" : "ADMIN"

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => {
        if (!confirm(`Change role to ${newRole}?`)) return
        startTransition(async () => {
          const result = await setUserRole(userId, newRole as "USER" | "ADMIN")
          if (result?.success) {
            toast.success("Role updated")
          }
        })
      }}
    >
      {isPending ? "..." : `→ ${newRole}`}
    </Button>
  )
}
