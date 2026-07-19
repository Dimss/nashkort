import { getTranslations } from "next-intl/server"
import { getDashboardStats } from "@/actions/admin"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function AdminDashboardPage() {
  const t = await getTranslations("admin")
  const stats = await getDashboardStats()

  const cards = [
    { label: t("stats.totalCourts"), value: stats.totalCourts },
    { label: t("stats.bookingsToday"), value: stats.bookingsToday },
    { label: t("stats.totalUsers"), value: stats.totalUsers },
    { label: t("stats.monthlyBookings"), value: stats.monthlyBookings },
  ]

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">{t("dashboard")}</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
