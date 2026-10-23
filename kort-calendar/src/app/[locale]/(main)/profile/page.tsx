import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getProfile } from "@/actions/users"
import { ProfileForm } from "@/components/profile/profile-form"
import { PasswordForm } from "@/components/profile/password-form"
import { Separator } from "@/components/ui/separator"

export default async function ProfilePage() {
  const t = await getTranslations("profile")
  const profile = await getProfile()

  if (!profile) redirect("/login")

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">{t("title")}</h1>

      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">{t("personalInfo")}</h2>
          <ProfileForm profile={profile} />
        </div>

        <Separator />

        <div>
          <h2 className="text-xl font-semibold mb-4">{t("changePassword")}</h2>
          <PasswordForm />
        </div>
      </div>
    </div>
  )
}
