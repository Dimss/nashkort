import { getTranslations } from "next-intl/server"
import { getUsers } from "@/actions/admin"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RoleToggleButton } from "@/components/admin/role-toggle-button"

export default async function AdminUsersPage() {
  const t = await getTranslations()
  const { users } = await getUsers({})

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">{t("admin.users")}</h1>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("auth.name")}</TableHead>
            <TableHead>{t("auth.email")}</TableHead>
            <TableHead>{t("auth.phone")}</TableHead>
            <TableHead>{t("admin.role")}</TableHead>
            <TableHead>{t("admin.joined")}</TableHead>
            <TableHead>{t("common.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name || "—"}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{user.phone || "—"}</TableCell>
              <TableCell>
                <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                  {user.role}
                </Badge>
              </TableCell>
              <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
              <TableCell>
                <RoleToggleButton
                  userId={user.id}
                  currentRole={user.role}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
