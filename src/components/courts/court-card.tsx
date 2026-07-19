import { useTranslations, useLocale } from "next-intl"
import { Link } from "@/i18n/routing"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type Court = {
  id: string
  name: string
  nameRu: string
  surface: string
  isIndoor: boolean
  openTime: string
  closeTime: string
  slotMinutes: number
  pricePerSlot: unknown
}

export function CourtCard({ court }: { court: Court }) {
  const t = useTranslations()
  const locale = useLocale()
  const name = locale === "ru" && court.nameRu ? court.nameRu : court.name

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{name}</span>
          <Badge variant="secondary">
            {court.isIndoor ? t("courts.indoor") : t("courts.outdoor")}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 mb-4">
          <p className="text-sm text-muted-foreground">
            {t(`courts.surface.${court.surface}`)}
          </p>
          <p className="text-sm">
            {t("courts.operatingHours")}: {court.openTime} - {court.closeTime}
          </p>
          <p className="text-sm">
            {t("courts.slotDuration")}: {court.slotMinutes} {t("courts.minutes")}
          </p>
          {court.pricePerSlot != null && (
            <p className="text-sm font-medium">
              {t("courts.price")}: {String(court.pricePerSlot)} ₽ {t("courts.perSlot")}
            </p>
          )}
        </div>
        <Link href={`/courts/${court.id}`}>
          <Button className="w-full">{t("courts.bookNow")}</Button>
        </Link>
      </CardContent>
    </Card>
  )
}
