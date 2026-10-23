import { getTranslations } from "next-intl/server"
import { getAllBookings } from "@/actions/admin"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AdminCancelButton } from "@/components/admin/admin-cancel-button"

export default async function AdminBookingsPage() {
  const t = await getTranslations()
  const { bookings } = await getAllBookings({})

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">{t("admin.bookings")}</h1>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("booking.date")}</TableHead>
            <TableHead>{t("booking.time")}</TableHead>
            <TableHead>{t("booking.court")}</TableHead>
            <TableHead>{t("admin.user")}</TableHead>
            <TableHead>{t("common.status")}</TableHead>
            <TableHead>{t("common.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((booking) => (
            <TableRow key={booking.id}>
              <TableCell>{new Date(booking.date).toLocaleDateString()}</TableCell>
              <TableCell>{booking.startTime} - {booking.endTime}</TableCell>
              <TableCell>{booking.court.name}</TableCell>
              <TableCell>
                <div>
                  <p className="font-medium">{booking.user.name}</p>
                  <p className="text-xs text-muted-foreground">{booking.user.email}</p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={booking.status === "CONFIRMED" ? "default" : "secondary"}>
                  {booking.status === "CONFIRMED" ? t("myBookings.upcoming") : t("myBookings.cancelled")}
                </Badge>
              </TableCell>
              <TableCell>
                {booking.status === "CONFIRMED" && (
                  <AdminCancelButton bookingId={booking.id} />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
