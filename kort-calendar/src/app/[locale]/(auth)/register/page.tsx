import { RegisterForm } from "@/components/auth/register-form"
import { useTranslations } from "next-intl"

export default function RegisterPage() {
  const t = useTranslations("auth")

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-card rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center mb-6">{t("registerTitle")}</h1>
        <RegisterForm />
      </div>
    </div>
  )
}
