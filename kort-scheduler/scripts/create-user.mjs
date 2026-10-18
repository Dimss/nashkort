// Creates or resets a login user. Credentials are passed as arguments, never
// stored in a file — run it directly:
//   node scripts/create-user.mjs <email> <password>
import { hashPassword } from '../src/auth.js'
import { users } from '../src/db.js'

const [, , email, password] = process.argv
if (!email || !password) {
  console.error('Usage: node scripts/create-user.mjs <email> <password>')
  process.exit(1)
}

const row = users.upsert({ email: email.trim().toLowerCase(), passwordHash: hashPassword(password) })
console.log(`User ready: ${row.email} (id ${row.id})`)
