import fs from 'node:fs'
import { config } from './config.js'
import { users, integrity } from './db.js'
import { hasCredentials } from './whatsapp.js'

// Per-boot repair outside the schema transaction: the configured admin exists
// and is approved, the single legacy credential folder moves into the admin's
// folder once, and ownerless messages are reported, never reassigned.
export function bootstrap() {
  const adminEmail = config.adminEmail
  if (!adminEmail) throw new Error('ADMIN_EMAIL is not set')
  const admin = users.upsertAdmin(adminEmail)

  let movedLegacyAuth = false
  const legacy = config.legacyAuthDir
  if (hasCredentials(legacy)) {
    const target = config.authDirFor(admin.id)
    if (fs.existsSync(target)) {
      console.error(`[bootstrap] both ${legacy} and ${target} exist; leaving both in place`)
    } else {
      fs.mkdirSync(config.waRoot, { recursive: true, mode: 0o700 })
      fs.renameSync(legacy, target)
      movedLegacyAuth = true
      console.log(`[bootstrap] moved legacy WhatsApp credentials to ${target}`)
    }
  }

  const ownerless = integrity.countOwnerless()
  if (ownerless > 0) console.error(`[bootstrap] integrity: ${ownerless} scheduled message(s) have no owner`)

  return { admin, movedLegacyAuth }
}
