# WhatsApp Group Message Scheduler

Schedule text messages to WhatsApp groups from a small web UI, one linked phone per user.
Built on [Baileys](https://baileys.wiki/) (WhatsApp Web multi-device protocol), Express and SQLite,
with sign-in through Auth0.

## Requirements

- Node.js 24 or newer (uses the built-in `node:sqlite` module)
- An Auth0 tenant with a Regular Web Application (email and password sign-in)
- A phone with WhatsApp per user, linked as a companion device

## Accounts

People create an account on the Auth0 sign-in page and verify their email. Their first
sign-in creates a **pending** account that sees only a waiting page. The admin approves it
from the **Users** page; the person then links their own phone by scanning a QR code and
sees only their own groups and messages. Nobody, the admin included, can see another
person's messages or link state.

The admin is the one account whose email equals `ADMIN_EMAIL`. The admin is also an
ordinary user with their own phone and schedule. From the Users page the admin can:

| Action | Effect |
| --- | --- |
| Approve | A pending account gets access on its next request. |
| Reject | A pending account becomes disabled. |
| Disable | Every session of the account ends at once, its WhatsApp connection closes (the link is kept) and its queued messages are held. |
| Enable | Messages whose time passed while disabled are marked **missed** and never sent; recurring series continue from the next future occurrence; the connection comes back. |

Signing out of the app also ends the Auth0 session, so the next sign-in on that browser
asks for credentials again.

## Run locally

```bash
npm install
cp .env.example .env   # fill in the Auth0 values and ADMIN_EMAIL
set -a; . ./.env; set +a
npm start
```

Open http://localhost:3000. The app binds to 127.0.0.1 only. For local use the Auth0
application must list `http://localhost:3000/auth/callback` as an allowed callback URL
and `http://localhost:3000/` as an allowed logout URL. Sign in with the account whose
email is `ADMIN_EMAIL`; you land in the app as the admin.

Tests: `npm test` (Node's built-in runner; no network, no Auth0).

## Configuration

All variables are read from the environment. The required ones make the process exit
with a message naming the variable when missing.

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `BASE_URL` | yes | | Public address as the browser sees it, no trailing slash. Cookies are `__Host-` and Secure under https. |
| `ADMIN_EMAIL` | yes | | Email of the one admin account, compared case-insensitively with the Auth0 email. |
| `AUTH0_DOMAIN` | yes | | Tenant domain, for example `your-tenant.eu.auth0.com`. |
| `AUTH0_CLIENT_ID` | yes | | Regular Web Application client id. |
| `AUTH0_CLIENT_SECRET` | yes | | Its client secret. |
| `PORT` | no | `3000` | Web UI port on 127.0.0.1. |
| `DATA_DIR` | no | `./data` | Database and per-user WhatsApp credentials (`wa/<user id>/`). |
| `TIME_ZONE` | no | `Asia/Jerusalem` | IANA zone for send times shown and entered in the form, repeat dates and `{{day}}`/`{{month}}`/`{{year}}` (the date one week after sending). |
| `WA_LOG_LEVEL` | no | `warn` | Baileys log level. |

### Auth0 tenant checklist

These are requirements, not suggestions; the app refuses subjects that are not from the
database connection or Google.

- One **database** connection (email and password) and the **google-oauth2** social connection,
  with your own Google OAuth client keys (Auth0's development keys are for testing only).
  No other connections. One email belongs to one identity: someone who signed up with a
  password cannot later sign in with Google under the same email, and the reverse.
- A Regular Web Application with **Authorization Code** as the only grant.
- Allowed Callback URLs: `<BASE_URL>/auth/callback`. Allowed Logout URLs: `<BASE_URL>/`.
  Allowed Web Origins: empty.
- Tenant languages: Russian and English enabled (the app passes `ui_locales`).
- A post-login Action that denies unverified emails with the reason `email_not_verified`
  (the app also refuses unverified emails itself). Example:

  ```js
  exports.onExecutePostLogin = async (event, api) => {
    if (!event.user.email_verified) api.access.deny('email_not_verified')
  }
  ```

- An SMTP provider configured for verification emails (Auth0's built-in sender is for testing only).
- Password policy at least "Good".

## Behaviour

- Messages are stored in SQLite (`data/scheduler.db`) and survive restarts.
- If a user's phone is disconnected when a message is due, it stays pending and goes out as soon as the connection is back.
- A failed send is retried up to 5 times, 30 seconds apart, then marked **failed** with the error.
- Pending messages can be cancelled; sent, failed, missed or cancelled ones can be deleted.
- **Log out of WhatsApp** unlinks the user's own phone and shows a fresh QR code.
- A WhatsApp connection is opened for a user at start-up only if they have saved credentials, otherwise when they open the app; an unlinked connection waiting for a scan is closed after 5 minutes without the page open.

## API

Every `/api` route needs the session cookie set by sign-in and an approved account
(`401` without a session, `403` with `{ error, state }` otherwise). State-changing requests
must come from the app's own origin.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/auth/login` | Redirects to Auth0 (`?lang=ru|en`) |
| GET | `/auth/callback` | Auth0 returns here |
| POST | `/auth/logout` | Ends the app session and the Auth0 session |
| GET | `/api/me` | `{ email, state, isAdmin }` for any signed-in account |
| GET | `/api/status` | The caller's connection status and QR code (data URL) when a scan is needed |
| GET | `/api/groups?refresh=1` | Groups the caller's phone is in |
| GET | `/api/messages` | The caller's scheduled messages |
| POST | `/api/messages` | `{ groupJid, groupName, message, sendAt, repeat }` (`sendAt` epoch ms, `repeat` `none`\|`weekly`\|`monthly`) |
| POST | `/api/messages/:id/cancel` | Cancel one of the caller's pending messages |
| DELETE | `/api/messages/:id` | Delete one of the caller's non-pending messages |
| POST | `/api/logout` | Unlink the caller's phone |
| GET | `/api/admin/users` | Admin: all accounts |
| POST | `/api/admin/users/:id/{approve,reject,disable,enable}` | Admin actions |

## Deploying

This is one always-on Node process with a persistent local disk, so it needs a real
host (not serverless). Production runs on an Oracle Cloud Always Free VM behind a
Cloudflare Tunnel: Cloudflare terminates HTTPS for the hostname and reaches the app on
127.0.0.1:3000 through an outbound connection from `cloudflared` on the VM, so the VM
accepts no inbound web traffic at all. The app sets its own security headers (CSP, HSTS
under an `https://` base URL, nosniff, same-origin referrer, deny framing). The
`Dockerfile` and `fly.toml` are not the production path and predate the Auth0 login.

### One-time set-up on the Oracle VM

1. **Auth0.** Complete the tenant checklist above with your public hostname as `BASE_URL`,
   and create your own account with the admin email.
2. **Cloudflare Tunnel.** The domain's DNS must be on Cloudflare. In the dashboard,
   Zero Trust → Networks → Tunnels → Create a tunnel (type Cloudflared), name it, and copy
   the token from the install command. Under Public Hostname add the hostname with service
   `http://localhost:3000`; delete any existing A record for that hostname first, because the
   tunnel creates its own proxied CNAME. Set SSL/TLS → Edge Certificates → Always Use HTTPS on.
   No Oracle ingress rules are needed beyond SSH; remove any for 80, 443 or 3000.
3. **Environment files** on the VM, as root:

   ```bash
   sudo mkdir -p /etc/court-scheduler /etc/cloudflared
   sudo install -m 0600 -o root -g root /dev/null /etc/court-scheduler/env
   sudo nano /etc/court-scheduler/env     # paste deploy/court-scheduler.env.example, filled in
   sudo install -m 0600 -o root -g root /dev/null /etc/cloudflared/token
   sudo nano /etc/cloudflared/token       # the tunnel token alone, nothing else
   ```

4. **Sync and set up.** From your Mac, `./deploy/redeploy.sh` syncs the tree to `~/court-scheduler`
   on the VM. Then on the VM:

   ```bash
   cd ~/court-scheduler && ./deploy/setup-vm.sh
   ```

   This installs Node 24, a 2 GB swap file and `cloudflared`, removes the 80, 443 and 3000
   rules (and the old port-80 redirect) from the host firewall, sets the data directory to
   mode 0700, installs both systemd units (`deploy/court-scheduler.service`, which reads the
   environment file, and `deploy/cloudflared.service`, which reads the token; it replaces a unit installed by
   `cloudflared service install` in place) and
   starts them.

5. Once the tunnel shows Healthy in the dashboard, open `https://<hostname>/`, sign in, and scan the QR code.

The SSH tunnel (`ssh -L 3000:localhost:3000 ubuntu@<vm-ip>`) still works as an
administrative path; the app itself is only reachable through the Cloudflare Tunnel.

### Updating later

`./deploy/redeploy.sh` checks that the environment file on the VM is complete, keeps a copy
of the current tree in `~/court-scheduler-prev`, syncs the tree (removing files that were
removed locally, never touching `data/` or the environment file), installs dependencies and
the unit, and restarts the service. The unit caps the service at 700 MB and stops retrying
after five quick failures, so a bad environment file shows in `systemctl status`. `DRY_RUN=1 ./deploy/redeploy.sh` shows what would change.

### Cutover from the password login (one time)

The first start of this version migrates the database in one transaction: it adds the
account columns, drops the password column, approves the admin, assigns existing
messages to the admin, recreates the sessions table and sets the schema version to 1.
Before that it writes `data/scheduler.pre-auth0.db`, a self-contained copy of the old
database. The single legacy credential folder `data/auth` is moved to `data/wa/<admin id>`.
The old code cannot start against the migrated schema, so back up first:

1. On the VM, stop the service and take backups only you can read, then copy them off the VM:
   ```
   sudo systemctl stop court-scheduler
   (umask 077; tar czf ~/court-scheduler-data-$(date +%F).tgz -C ~/court-scheduler data)
   (umask 077; tar czf ~/court-scheduler-tree-$(date +%F).tgz --exclude=node_modules --exclude=data -C ~ court-scheduler)
   sudo cp /etc/systemd/system/court-scheduler.service ~/court-scheduler.service.old
   ```
   From your machine: `scp ubuntu@<vm>:court-scheduler-*.tgz ~/backups/`.
2. Check that the legacy account's email is byte for byte the value you will put in `ADMIN_EMAIL`.
   The cutover matches the stored string exactly; a difference in case or spacing leaves the old
   account pending next to a new admin row.
   ```
   cd ~/court-scheduler && node -e 'const {DatabaseSync}=require("node:sqlite");console.log(new DatabaseSync("data/scheduler.db").prepare("SELECT id,email FROM users").all())'
   ```
   If it differs, fix the row first: `node -e '...prepare("UPDATE users SET email=? WHERE id=?").run("you@example.com", 1)'`.
3. Create both environment files (step 3 above), then `DRY_RUN=1 ./deploy/redeploy.sh` and `./deploy/redeploy.sh`
   from your machine (it refuses to run until the environment file is complete and keeps the previous
   tree in `~/court-scheduler-prev`), then run the setup script on the VM.
4. Sign in; your schedule is there; scan a fresh QR if the phone was not linked on the server.
5. Verify the migrated database before trusting it. Each line prints what its comment says:
   ```
   cd ~/court-scheduler && node -e '
   const {DatabaseSync}=require("node:sqlite");const d=new DatabaseSync("data/scheduler.db",{readOnly:true});const q=s=>d.prepare(s).all();
   console.log(q("PRAGMA user_version"));                                              // [ { user_version: 1 } ]
   console.log(q("PRAGMA table_info(users)").some(c=>c.name==="password_hash"));         // false
   console.log(q("SELECT email FROM users WHERE state=\x27approved\x27"));              // only the admin
   console.log(q("SELECT count(*) n FROM scheduled_messages WHERE owner_id IS NULL"));  // [ { n: 0 } ]
   console.log(q("SELECT series_id FROM scheduled_messages WHERE status=\x27pending\x27 AND series_id IS NOT NULL GROUP BY series_id HAVING count(*)>1")); // []
   console.log(q("SELECT series_id FROM scheduled_messages WHERE series_id IS NOT NULL GROUP BY series_id HAVING count(DISTINCT owner_id)>1"));           // []
   console.log(q("PRAGMA foreign_key_check"), q("PRAGMA integrity_check"));            // [] [ { integrity_check: "ok" } ]'
   ls -l data/scheduler.pre-auth0.db                                                    # the backup exists
   ```
   Anything else: roll back (below) and investigate before going on.
6. Link a second test phone and record the service memory (`systemctl status court-scheduler`
   shows it) with zero, one and two linked phones. Approve people two at a time while watching it.
   If two phones already exceed half the VM's memory, either move to an Always Free A1.Flex
   instance (a new ARM VM: new IP, DNS re-pointed, setup re-run, tarball restored), if the region
   has capacity, or record the per-phone figure here and keep the user count within it.
7. Once everything works, delete the tarballs and `data/scheduler.pre-auth0.db`; they contain the old password hash.

**Rollback** before step 7. Never unpack over the migrated files: a leftover `scheduler.db-wal`
next to the old database corrupts it.
```
sudo systemctl stop court-scheduler cloudflared
mv ~/court-scheduler/data ~/court-scheduler/data.failed
tar xzf ~/court-scheduler-data-<date>.tgz -C ~/court-scheduler      # or: mkdir -m 700 ~/court-scheduler/data && cp ~/court-scheduler/data.failed/scheduler.pre-auth0.db ~/court-scheduler/data/scheduler.db
tar xzf ~/court-scheduler-tree-<date>.tgz -C ~                        # or: rsync -a --delete --exclude node_modules --exclude data ~/court-scheduler-prev/ ~/court-scheduler/
sudo cp ~/court-scheduler.service.old /etc/systemd/system/court-scheduler.service && sudo systemctl daemon-reload
cd ~/court-scheduler && npm ci --omit=dev && sudo systemctl start court-scheduler
```
With the copy variant, also move `data.failed/wa/<admin id>` back to `data/auth` if the phone was
linked after the cutover.

Memory measured on a laptop while building this: about 171 MB with no connection, 175 MB
with one linked phone connected, 190 MB with two clients (one connected, one waiting for a scan).
Record the VM's own figures here after cutover.

## Notes

- Baileys is an unofficial client. Keep the process running so scheduled messages go out,
  and avoid bulk messaging, which can get a number banned.
- `data/` holds every user's WhatsApp credentials, which are equivalent to their logged-in
  phone session. Keep it at mode 0700 and out of any sync or backup that leaves the VM unencrypted.
