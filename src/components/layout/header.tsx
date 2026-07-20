"use client"

import { useState } from "react"
import { useSession, signOut } from "next-auth/react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { LocaleSwitcher } from "@/components/layout/locale-switcher"

export function Header() {
  const { data: session } = useSession()
  const t = useTranslations()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="border-b">
      <div className="container mx-auto px-4 py-4 md:py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold">
            {t("common.appName")}
          </Link>
          <nav className="hidden md:flex items-center gap-4">
            <Link href="/courts" className="text-sm hover:text-primary transition-colors">
              {t("nav.courts")}
            </Link>
            {session && (
              <Link href="/bookings" className="text-sm hover:text-primary transition-colors">
                {t("nav.myBookings")}
              </Link>
            )}
            {session?.user?.role === "ADMIN" && (
              <Link href="/admin" className="text-sm hover:text-primary transition-colors">
                {t("nav.admin")}
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <LocaleSwitcher />

          {/* Mobile menu button */}
          <button
            className="md:hidden p-3"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          {/* Desktop user menu */}
          <div className="hidden md:flex items-center">
            {session ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="relative h-8 w-8 rounded-full cursor-pointer">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {session.user?.name?.charAt(0)?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <div className="px-2 py-1.5 text-sm font-medium">{session.user?.name}</div>
                  <div className="px-2 py-1 text-xs text-muted-foreground">{session.user?.email}</div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Link href="/profile">{t("nav.profile")}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>
                    {t("nav.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button variant="ghost" size="sm">{t("nav.login")}</Button>
                </Link>
                <Link href="/register">
                  <Button size="sm">{t("nav.register")}</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav className="md:hidden border-t px-4 py-3 space-y-2">
          <Link
            href="/courts"
            className="block py-3 text-base"
            onClick={() => setMobileOpen(false)}
          >
            {t("nav.courts")}
          </Link>
          {session && (
            <Link
              href="/bookings"
              className="block py-3 text-base"
              onClick={() => setMobileOpen(false)}
            >
              {t("nav.myBookings")}
            </Link>
          )}
          {session?.user?.role === "ADMIN" && (
            <Link
              href="/admin"
              className="block py-3 text-base"
              onClick={() => setMobileOpen(false)}
            >
              {t("nav.admin")}
            </Link>
          )}
          {session ? (
            <>
              <Link
                href="/profile"
                className="block py-3 text-base"
                onClick={() => setMobileOpen(false)}
              >
                {t("nav.profile")}
              </Link>
              <button
                className="block py-3 text-base text-destructive"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                {t("nav.logout")}
              </button>
            </>
          ) : (
            <div className="flex gap-2 pt-2">
              <Link href="/login" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" size="sm">{t("nav.login")}</Button>
              </Link>
              <Link href="/register" onClick={() => setMobileOpen(false)}>
                <Button size="sm">{t("nav.register")}</Button>
              </Link>
            </div>
          )}
        </nav>
      )}
    </header>
  )
}
