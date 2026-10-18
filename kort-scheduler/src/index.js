import { config } from './config.js'
import { createApp } from './server.js'
import { whatsapp } from './whatsapp.js'
import { scheduler } from './scheduler.js'

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
