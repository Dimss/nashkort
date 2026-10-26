import { config, validateConfig } from './config.js'

const missing = validateConfig()
if (missing.length) {
  console.error(`Missing required environment variable(s): ${missing.join(', ')}`)
  process.exit(1)
}

const { isValidTimeZone } = await import('../public/template.js')
if (!isValidTimeZone(config.timeZone)) {
  console.error('TIME_ZONE is not a valid IANA time zone')
  process.exit(1)
}

// Loaded after validation so the database (which may need ADMIN_EMAIL to migrate) opens with the config present.
const { bootstrap } = await import('./bootstrap.js')
const { createApp } = await import('./server.js')
const { clients } = await import('./clients.js')
const { users, groupMessages } = await import('./db.js')
const { scheduler } = await import('./scheduler.js')

bootstrap()

const app = createApp()
// Loopback only: the reverse proxy on the same host is the public face.
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`Web UI: http://localhost:${config.port}`)
})

clients.bootAll(users.list().filter((u) => u.state === 'approved').map((u) => u.id)).catch((err) => {
  console.error('Failed to start WhatsApp clients', err)
})
scheduler.start()

// Saved group messages are kept for 30 days.
groupMessages.prune()
setInterval(() => groupMessages.prune(), 60 * 60 * 1000).unref()

async function shutdown() {
  console.log('Shutting down…')
  scheduler.stop()
  server.close()
  await clients.stopAll()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
