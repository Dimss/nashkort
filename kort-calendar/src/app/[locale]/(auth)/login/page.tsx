import { LoginForm } from "@/components/auth/login-form"
import { useTranslations } from "next-intl"

export default function LoginPage() {
  const t = useTranslations("auth")

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-card rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center mb-6">{t("loginTitle")}</h1>
        <LoginForm />
      </div>
    </div>
  )
}
