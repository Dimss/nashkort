import { notFound } from "next/navigation"
import { getTranslations, getLocale } from "next-intl/server"
import { getCourtById } from "@/actions/courts"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BookingCalendar } from "@/components/booking/booking-calendar"

export default async function CourtDetailPage({ params }: { params: Promise<{ courtId: string }> }) {
  const { courtId } = await params
  const t = await getTranslations()
  const locale = await getLocale()
  const court = await getCourtById(courtId)

  if (!court) notFound()

  const name = locale === "ru" && court.nameRu ? court.nameRu : court.name
  const description = locale === "ru" && court.descriptionRu ? court.descriptionRu : court.description

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <h1 className="text-3xl font-bold">{name}</h1>
          <Badge variant="secondary">
            {court.isIndoor ? t("courts.indoor") : t("courts.outdoor")}
          </Badge>
          <Badge>{t(`courts.surface.${court.surface}`)}</Badge>
        </div>
        {description && (
          <p className="text-muted-foreground">{description}</p>
        )}
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>{t("courts.details")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{t("courts.operatingHours")}</p>
              <p className="font-medium">{court.openTime} - {court.closeTime}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("courts.slotDuration")}</p>
              <p className="font-medium">{court.slotMinutes} {t("courts.minutes")}</p>
            </div>
            {court.pricePerSlot != null && (
              <div>
                <p className="text-sm text-muted-foreground">{t("courts.price")}</p>
                <p className="font-medium">{String(court.pricePerSlot)} ₽ {t("courts.perSlot")}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-bold mb-6">{t("booking.title")}</h2>
        <BookingCalendar courtId={court.id} courtName={name} />
      </div>
    </div>
  )
}
