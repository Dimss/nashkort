"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/routing"
import { createCourt, updateCourt } from "@/actions/courts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"

type Court = {
  id: string
  name: string
  nameRu: string
  description: string | null
  descriptionRu: string | null
  surface: string
  isIndoor: boolean
  openTime: string
  closeTime: string
  slotMinutes: number
  pricePerSlot: unknown
}

export function CourtForm({ court }: { court?: Court }) {
  const t = useTranslations()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isIndoor, setIsIndoor] = useState(court?.isIndoor ?? false)

  async function handleSubmit(formData: FormData) {
    formData.set("isIndoor", String(isIndoor))

    startTransition(async () => {
      const result = court
        ? await updateCourt(court.id, formData)
        : await createCourt(formData)

      if (result?.error) {
        toast.error(t("common.error"))
      } else {
        toast.success(court ? t("admin.courtUpdated") : t("admin.courtCreated"))
        router.push("/admin/courts")
      }
    })
  }

  const surfaces = ["HARD", "CLAY", "GRASS", "CARPET", "ARTIFICIAL"] as const

  return (
    <form action={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t("admin.courtName")}</Label>
          <Input id="name" name="name" defaultValue={court?.name} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nameRu">{t("admin.courtNameRu")}</Label>
          <Input id="nameRu" name="nameRu" defaultValue={court?.nameRu} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="description">{t("admin.description")}</Label>
          <Input id="description" name="description" defaultValue={court?.description ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="descriptionRu">{t("admin.descriptionRu")}</Label>
          <Input id="descriptionRu" name="descriptionRu" defaultValue={court?.descriptionRu ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("admin.surfaceType")}</Label>
          <Select name="surface" defaultValue={court?.surface ?? "HARD"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {surfaces.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`courts.surface.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 flex items-end">
          <div className="flex items-center gap-2">
            <Checkbox
              id="isIndoor"
              checked={isIndoor}
              onCheckedChange={(checked) => setIsIndoor(checked === true)}
            />
            <Label htmlFor="isIndoor">{t("admin.indoorCourt")}</Label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="openTime">{t("admin.openTime")}</Label>
          <Input id="openTime" name="openTime" type="time" defaultValue={court?.openTime ?? "08:00"} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="closeTime">{t("admin.closeTime")}</Label>
          <Input id="closeTime" name="closeTime" type="time" defaultValue={court?.closeTime ?? "22:00"} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slotMinutes">{t("admin.slotDuration")}</Label>
          <Input id="slotMinutes" name="slotMinutes" type="number" min={30} max={180} step={30} defaultValue={court?.slotMinutes ?? 60} required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="pricePerSlot">{t("admin.pricePerSlot")}</Label>
        <Input id="pricePerSlot" name="pricePerSlot" type="number" min={0} step={0.01} defaultValue={court?.pricePerSlot != null ? String(court.pricePerSlot) : ""} />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "..." : t("common.save")}
      </Button>
    </form>
  )
}
