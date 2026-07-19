import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getCourtById } from "@/actions/courts"
import { CourtForm } from "@/components/courts/court-form"

export default async function EditCourtPage({ params }: { params: Promise<{ courtId: string }> }) {
  const { courtId } = await params
  const t = await getTranslations("admin")
  const court = await getCourtById(courtId)

  if (!court) notFound()

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">{t("editCourt")}</h1>
      <CourtForm court={court} />
    </div>
  )
}
