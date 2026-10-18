import { useTranslations } from "next-intl"
import { CourtForm } from "@/components/courts/court-form"

export default function NewCourtPage() {
  const t = useTranslations("admin")

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">{t("createCourt")}</h1>
      <CourtForm />
    </div>
  )
}
