import { config, validateConfig } from './config.js'

const missing = validateConfig()
if (missing.length) {
  console.error(`Missing required environment variable(s): ${missing.join(', ')}`)
  process.exit(1)
}

// Loaded after validation so the database (which may need ADMIN_EMAIL to migrate) opens with the config present.
const { bootstrap } = await import('./bootstrap.js')
const { createApp } = await import('./server.js')
const { whatsapp } = await import('./whatsapp.js')
const { scheduler } = await import('./scheduler.js')

bootstrap()

const app = createApp()
const server = app.listen(config.port, () => {
  console.log(`Web UI: http://localhost:${config.port}`)
})

whatsapp.start().catch((err) => {
  console.error('Failed to start WhatsApp client', err)
})
scheduler.start()

async function shutdown() {
  console.log('Shutting down…')
  scheduler.stop()
  server.close()
  await whatsapp.stop()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
