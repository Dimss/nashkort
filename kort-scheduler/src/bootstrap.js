import fs from 'node:fs'
import { config } from './config.js'
import { users, integrity, transaction } from './db.js'
import { hasCredentials } from './whatsapp.js'
import { sweepMissed } from './scheduler.js'

// Per-boot repair outside the schema transaction: the configured admin exists
// and is approved, the single legacy credential folder moves into the admin's
// folder once, and ownerless messages are reported, never reassigned.
// A configured admin who is currently pending or disabled is enabled the way the
// admin page enables anyone: state flip and missed sweep in one transaction, so
// rows held while they were paused are marked missed instead of sent late.
function approveAdmin(adminEmail) {
  const existing = users.findByEmail(adminEmail)
  if (!existing || existing.state === 'approved') return users.upsertAdmin(adminEmail)
  return transaction(() => {
    users.setState(existing.id, 'approved')
    const { missed } = sweepMissed(existing.id)
    console.log(`[bootstrap] configured admin ${existing.email} was ${existing.state}; enabled, ${missed} overdue message(s) marked missed`)
    return users.get(existing.id)
  })
}

export function bootstrap() {
  const adminEmail = config.adminEmail
  if (!adminEmail) throw new Error('ADMIN_EMAIL is not set')
  const admin = approveAdmin(adminEmail)

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
