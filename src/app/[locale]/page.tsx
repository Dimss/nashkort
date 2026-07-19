import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { getCourts } from "@/actions/courts"
import { ReadonlyCalendar } from "@/components/booking/readonly-calendar"
import { LocaleSwitcher } from "@/components/layout/locale-switcher"

export default async function HomePage() {
  const t = await getTranslations()
  const courts = await getCourts()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("common.appName")}</h1>
          <div className="flex items-center gap-4">
            <LocaleSwitcher />
            <Link href="/login">
              <Button variant="ghost">{t("nav.login")}</Button>
            </Link>
            <Link href="/register">
              <Button>{t("nav.register")}</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {courts.length > 0 && (
          <section className="py-12 bg-muted/50">
            <div className="container mx-auto px-4">
              <ReadonlyCalendar courts={courts} />
            </div>
          </section>
        )}

      </main>

      <footer className="border-t py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © 2024 {t("common.appName")}
        </div>
      </footer>
    </div>
  )
}
