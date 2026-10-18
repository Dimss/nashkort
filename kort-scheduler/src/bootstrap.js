import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { users, integrity } from './db.js'

// Per-boot repair that cannot live in the schema transaction: make sure the
// configured admin exists and is approved, move the single legacy credential
// folder into the admin's own folder exactly once, and report (never repair)
// messages without an owner.
export function bootstrap() {
  const adminEmail = config.adminEmail
  if (!adminEmail) throw new Error('ADMIN_EMAIL is not set')
  const admin = users.upsertAdmin(adminEmail)

  let movedLegacyAuth = false
  const legacy = config.legacyAuthDir
  if (fs.existsSync(path.join(legacy, 'creds.json'))) {
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
