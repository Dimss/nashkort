"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { updateProfile } from "@/actions/users"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

type Profile = {
  id: string
  name: string | null
  email: string
  phone: string | null
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const t = useTranslations()
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateProfile(formData)
      if (result?.error) {
        toast.error(t("common.error"))
      } else {
        toast.success(t("profile.updateSuccess"))
      }
    })
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input id="email" value={profile.email} disabled />
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">{t("auth.name")}</Label>
        <Input id="name" name="name" defaultValue={profile.name ?? ""} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">{t("auth.phone")}</Label>
        <Input id="phone" name="phone" type="tel" defaultValue={profile.phone ?? ""} />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "..." : t("common.save")}
      </Button>
    </form>
  )
}
