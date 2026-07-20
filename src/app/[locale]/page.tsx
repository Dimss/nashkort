import { getTranslations } from "next-intl/server"
import { getCourts } from "@/actions/courts"
import { ReadonlyCalendar } from "@/components/booking/readonly-calendar"
import { Header } from "@/components/layout/header"

export default async function HomePage() {
  const t = await getTranslations()
  const courts = await getCourts()

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {courts.length > 0 && (
          <section className="py-6 md:py-12 bg-muted/50">
            <div className="container mx-auto px-4">
              <ReadonlyCalendar courts={courts} />
            </div>
          </section>
        )}
      </main>

      <footer className="border-t py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} {t("common.appName")}
        </div>
      </footer>
    </div>
  )
}
