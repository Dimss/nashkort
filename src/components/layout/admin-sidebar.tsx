"use client"

import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/routing"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export function AdminSidebar() {
  const t = useTranslations("admin")
  const pathname = usePathname()

  const links = [
    { href: "/admin" as const, label: t("dashboard") },
    { href: "/admin/courts" as const, label: t("courts") },
    { href: "/admin/bookings" as const, label: t("bookings") },
    { href: "/admin/users" as const, label: t("users") },
  ]

  return (
    <aside className="w-64 border-r bg-muted/30 p-6">
      <h2 className="text-lg font-bold mb-6">{t("dashboard")}</h2>
      <nav className="space-y-2">
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-start",
                pathname === link.href && "bg-muted"
              )}
            >
              {link.label}
            </Button>
          </Link>
        ))}
      </nav>
    </aside>
  )
}
