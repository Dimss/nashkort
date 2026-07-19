import { getTranslations } from "next-intl/server"
import { getCourts } from "@/actions/courts"
import { CourtCard } from "@/components/courts/court-card"

export default async function CourtsPage() {
  const t = await getTranslations("courts")
  const courts = await getCourts()

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">{t("title")}</h1>
      {courts.length === 0 ? (
        <p className="text-muted-foreground">{t("noCourts")}</p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courts.map((court) => (
            <CourtCard key={court.id} court={court} />
          ))}
        </div>
      )}
    </div>
  )
}
