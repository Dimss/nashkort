import { getTranslations } from "next-intl/server"
import { getCourts } from "@/actions/courts"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleCourtButton } from "@/components/admin/toggle-court-button"

export default async function AdminCourtsPage() {
  const t = await getTranslations()
  const courts = await getCourts(false)

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">{t("admin.courts")}</h1>
        <Link href="/admin/courts/new">
          <Button>{t("admin.createCourt")}</Button>
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("admin.courtName")}</TableHead>
            <TableHead>{t("admin.surfaceType")}</TableHead>
            <TableHead>{t("courts.indoor")}/{t("courts.outdoor")}</TableHead>
            <TableHead>{t("common.status")}</TableHead>
            <TableHead>{t("common.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {courts.map((court) => (
            <TableRow key={court.id}>
              <TableCell className="font-medium">{court.name}</TableCell>
              <TableCell>{t(`courts.surface.${court.surface}`)}</TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {court.isIndoor ? t("courts.indoor") : t("courts.outdoor")}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={court.isActive ? "default" : "secondary"}>
                  {court.isActive ? t("admin.active") : t("admin.inactive")}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Link href={`/admin/courts/${court.id}/edit`}>
                    <Button variant="outline" size="sm">
                      {t("admin.editCourt")}
                    </Button>
                  </Link>
                  <ToggleCourtButton courtId={court.id} isActive={court.isActive} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
