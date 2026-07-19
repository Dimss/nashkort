import { getTranslations } from "next-intl/server"
import { getUserBookings } from "@/actions/bookings"
import { BookingList } from "@/components/booking/booking-list"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"

export default async function BookingsPage() {
  const t = await getTranslations("myBookings")
  const bookings = await getUserBookings()

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <Link href="/courts">
          <Button>{t("bookNow")}</Button>
        </Link>
      </div>
      <BookingList bookings={bookings} />
    </div>
  )
}
