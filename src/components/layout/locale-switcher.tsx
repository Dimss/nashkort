"use client"

import { useLocale } from "next-intl"
import { useRouter, usePathname } from "@/i18n/routing"
import { Button } from "@/components/ui/button"

export function LocaleSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  function switchLocale() {
    const newLocale = locale === "ru" ? "en" : "ru"
    router.replace(pathname, { locale: newLocale })
  }

  return (
    <Button variant="ghost" size="sm" onClick={switchLocale} className="text-xs font-medium">
      {locale === "ru" ? "EN" : "RU"}
    </Button>
  )
}
