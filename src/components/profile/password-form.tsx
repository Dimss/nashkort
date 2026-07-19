"use client"

import { useTransition, useRef } from "react"
import { useTranslations } from "next-intl"
import { changePassword } from "@/actions/users"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

export function PasswordForm() {
  const t = useTranslations()
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await changePassword(formData)
      if (result?.error === "WRONG_PASSWORD") {
        toast.error(t("profile.errors.wrongPassword"))
      } else if (result?.error) {
        toast.error(t("common.error"))
      } else {
        toast.success(t("profile.passwordSuccess"))
        formRef.current?.reset()
      }
    })
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">{t("profile.currentPassword")}</Label>
        <Input id="currentPassword" name="currentPassword" type="password" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">{t("profile.newPassword")}</Label>
        <Input id="newPassword" name="newPassword" type="password" required minLength={6} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmNewPassword">{t("profile.confirmNewPassword")}</Label>
        <Input id="confirmNewPassword" name="confirmNewPassword" type="password" required minLength={6} />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "..." : t("common.save")}
      </Button>
    </form>
  )
}
