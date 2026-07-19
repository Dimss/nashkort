"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/routing"
import { loginUser } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Link } from "@/i18n/routing"
import { toast } from "sonner"

export function LoginForm() {
  const t = useTranslations("auth")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  async function handleSubmit(formData: FormData) {
    setError("")
    startTransition(async () => {
      const result = await loginUser(formData)
      if (result?.error) {
        setError(t("errors.invalidCredentials"))
      } else {
        toast.success(t("loginTitle"))
        router.push("/courts")
        router.refresh()
      }
    })
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input id="password" name="password" type="password" required />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "..." : t("loginButton")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link href="/register" className="text-primary hover:underline">
          {t("registerButton")}
        </Link>
      </p>
    </form>
  )
}
