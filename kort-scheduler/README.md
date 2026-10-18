# WhatsApp Group Message Scheduler

Schedule text messages to WhatsApp groups from a small web UI. Built on
[Baileys](https://baileys.wiki/) (WhatsApp Web multi-device protocol), Express and SQLite.

## Requirements

- Node.js 22.5 or newer (uses the built-in `node:sqlite` module)
- A phone with WhatsApp to link as a companion device

## Run

```bash
npm install
npm start
```

Open http://localhost:3000. On first start a QR code is shown; on your phone go to
**WhatsApp → Settings → Linked devices → Link a device** and scan it. The session is
saved under `data/auth`, so later restarts reconnect automatically.

Then pick a group, type a message, choose a date and time (in your browser's local
timezone) and click **Schedule**. The server checks every 5 seconds and sends due messages.

## Configuration

Environment variables (see `.env.example`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | Web UI port |
| `DATA_DIR` | `./data` | Where credentials and the SQLite database live |
| `WA_LOG_LEVEL` | `warn` | Baileys log level |

## Behaviour

- Messages are stored in SQLite (`data/scheduler.db`) and survive restarts.
- If WhatsApp is disconnected when a message is due, it stays pending and goes out as soon as the connection is back.
- A failed send is retried up to 5 times, 30 seconds apart, then marked **failed** with the error.
- Pending messages can be cancelled; sent, failed or cancelled ones can be deleted.
- **Log out** clears the saved session and shows a fresh QR code.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/status` | Connection status and QR code (data URL) when login is needed |
| GET | `/api/groups?refresh=1` | Groups the linked account is in |
| GET | `/api/messages` | All scheduled messages |
| POST | `/api/messages` | `{ groupJid, groupName, message, sendAt, repeat }` (`sendAt` is epoch ms, `repeat` is `none`\|`weekly`\|`monthly`) |
| POST | `/api/messages/:id/cancel` | Cancel a pending message |
| DELETE | `/api/messages/:id` | Delete a non-pending message |
| POST | `/api/logout` | Unlink the device |

## Notes

- The web UI has no authentication. Run it on localhost or behind a reverse proxy with auth.
- Baileys is an unofficial client. Keep the process running (e.g. with `pm2` or a systemd unit) so scheduled messages go out, and avoid bulk messaging, which can get the number banned.

## Deploying

This app is a single always-on Node process: it holds a persistent WhatsApp socket
and polls for due messages in-process, and it keeps its database and WhatsApp
session as local files under `DATA_DIR`. That rules out serverless platforms
(Vercel, Netlify, etc.) — they tear the process down between requests and wipe
the filesystem, which would drop the WhatsApp connection and lose scheduled
messages. It needs a host that keeps one process running continuously with a
persistent disk. Two options below: Fly.io (small ongoing cost, easiest setup)
and an Oracle Cloud Always Free VM (genuinely free forever, more manual setup).

### Option A: Fly.io (paid, ~$2-5/month at this scale)

```bash
# 1. Install the CLI and log in (one-time)
brew install flyctl        # or see https://fly.io/docs/flyctl/install/
fly auth login

# 2. From the project root, create the app (pick a globally-unique name if
#    "court-scheduler" is taken — edit the `app` line in fly.toml to match)
fly launch --no-deploy

# 3. Create a persistent volume for the database + WhatsApp session
#    (must be in the same region as fly.toml's primary_region)
fly volumes create court_scheduler_data --region iad --size 1

# 4. Deploy
fly deploy

# 5. Watch logs and scan the QR code
fly logs
```

The app will be reachable at `https://<app-name>.fly.dev`. Open it, scan the QR
code once, and the session persists on the volume across deploys/restarts.

**Before exposing this publicly**, note the web UI has no login — anyone with the
URL can schedule messages, cancel pending ones, or log out the WhatsApp session.
Consider adding basic auth (Fly supports a simple reverse-proxy or an Express
middleware checking a shared secret from `fly secrets set`) before sharing the
URL, or keep it on Fly's private network instead of its public one.

### Option B: Oracle Cloud Always Free VM (free forever)

Oracle Cloud's Always Free tier includes a small compute VM with persistent
storage, at no cost indefinitely (not a time-limited trial). It requires a
credit card at signup for identity verification, but Always Free resources are
never billed. This is a real VM, so setup is closer to a traditional server
than a git-push deploy.

**1. Create the VM** (console.oracle.com, after signup):
- Compute → Instances → Create instance
- Image: **Canonical Ubuntu** (latest LTS)
- Shape: any **"Always Free eligible"** shape — `VM.Standard.A1.Flex` (ARM,
  more RAM) or `VM.Standard.E2.1.Micro` (x86). If A1 shows "out of capacity"
  in your region (a common free-tier issue), use E2.1.Micro or try a
  different availability domain.
- Add your SSH public key in the "Add SSH keys" section
- Keep "Assign a public IPv4 address" checked
- Create, then note the instance's public IP

**2. Copy the project to the VM** (run from your Mac — there's no git remote
for this project, so `rsync` is simplest):

```bash
rsync -az --exclude node_modules --exclude data \
  /Users/dkartsev/code/court-scheduler/ ubuntu@<vm-ip>:~/court-scheduler/
```

**3. Install and start it** (run on the VM):

```bash
ssh ubuntu@<vm-ip>
cd ~/court-scheduler
./deploy/setup-vm.sh
```

This installs Node.js 24, runs `npm ci`, and installs+starts
`deploy/court-scheduler.service` as a systemd service (auto-restarts on crash
or reboot). Check it with `sudo systemctl status court-scheduler` or follow
logs with `sudo journalctl -u court-scheduler -f`.

**4. Open the web UI.** Since the UI has no login, the safest option is to
**not** open any inbound port at all and instead tunnel over SSH:

```bash
ssh -L 3000:localhost:3000 ubuntu@<vm-ip>
```

then open http://localhost:3000 on your Mac. If you'd rather reach it directly
from the internet, you must open the port in **two** places (both are
required — Oracle blocks by default at both layers): the VCN's Security
List/Network Security Group (Networking → Virtual Cloud Networks → your VCN →
Security Lists → Add Ingress Rule, source `0.0.0.0/0`, TCP, destination port
3000), and the VM's own firewall (`sudo iptables -I INPUT 6 -m state --state
NEW -p tcp --dport 3000 -j ACCEPT && sudo netfilter-persistent save` on
Ubuntu). Do this only if you've also added auth in front of the app.

**Updating later**: re-run the `rsync` command, then on the VM run
`cd ~/court-scheduler && npm ci --omit=dev && sudo systemctl restart court-scheduler`.
