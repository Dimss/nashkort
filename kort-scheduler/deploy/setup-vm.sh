#!/usr/bin/env bash
# Run this ON the VM (as the ubuntu user), from inside the project directory,
# after syncing the project there:
#
#   ./deploy/setup-vm.sh
#
# Idempotent. Installs Node.js 24, a 2 GB swap file and cloudflared (Cloudflare
# Tunnel: Cloudflare terminates HTTPS and reaches the app on loopback through an
# outbound connection), closes every inbound web port in the host firewall,
# locks down the data directory, installs dependencies and the systemd units,
# and starts both services.
# Requires /etc/court-scheduler/env (see deploy/court-scheduler.env.example)
# and /etc/cloudflared/env holding TUNNEL_TOKEN=<token from the Cloudflare dashboard>.
set -euo pipefail

ENV_FILE=/etc/court-scheduler/env
if ! sudo test -s "$ENV_FILE"; then
  echo "Missing $ENV_FILE. Create it from deploy/court-scheduler.env.example (owner root, mode 0600) first." >&2
  exit 1
fi
sudo chown root:root "$ENV_FILE" && sudo chmod 0600 "$ENV_FILE"
for key in ADMIN_EMAIL BASE_URL AUTH0_DOMAIN AUTH0_CLIENT_ID AUTH0_CLIENT_SECRET; do
  if ! sudo grep -qE "^$key=.+" "$ENV_FILE"; then
    echo "$ENV_FILE: $key is not set." >&2
    exit 1
  fi
done
if sudo grep -q 'example\.com' "$ENV_FILE"; then
  echo "$ENV_FILE still contains example.com placeholders." >&2
  exit 1
fi
if ! sudo grep -qE '^BASE_URL=https://[^/]+$' "$ENV_FILE"; then
  echo "$ENV_FILE: BASE_URL must be https://<hostname> with no trailing slash" >&2
  exit 1
fi
TUNNEL_ENV=/etc/cloudflared/env
if ! sudo grep -qE '^TUNNEL_TOKEN=.+' "$TUNNEL_ENV" 2>/dev/null; then
  echo "Missing TUNNEL_TOKEN in $TUNNEL_ENV. Create the tunnel in the Cloudflare dashboard and write its token there." >&2
  exit 1
fi
sudo chown root:root "$TUNNEL_ENV" && sudo chmod 0600 "$TUNNEL_ENV"

cd "$(dirname "$0")/.."

if ! command -v node >/dev/null || [[ "$(node --version)" != v24* ]]; then
  echo "Installing Node.js 24..."
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# Swap: the free-tier VM has about 1 GB of RAM and no swap by default.
if ! sudo swapon --show | grep -q '^/swapfile'; then
  echo "Creating a 2 GB swap file..."
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# cloudflared from Cloudflare's package repository.
if ! command -v cloudflared >/dev/null; then
  echo "Installing cloudflared..."
  sudo mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y cloudflared
fi

# Host firewall (iptables + netfilter-persistent on Oracle's Ubuntu images):
# only SSH comes in; the tunnel is outbound. Remove the app port, any web ports
# an earlier setup opened, and the old port-80-to-3000 redirect.
for port in 80 443 3000; do
  while sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; do
    sudo iptables -D INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  done
  while sudo iptables -C INPUT -m state --state NEW -p tcp --dport "$port" -j ACCEPT 2>/dev/null; do
    sudo iptables -D INPUT -m state --state NEW -p tcp --dport "$port" -j ACCEPT
  done
done
while sudo iptables -t nat -C PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 3000 2>/dev/null; do
  sudo iptables -t nat -D PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 3000
done
sudo netfilter-persistent save >/dev/null

# The data directory holds the database and every user's WhatsApp credentials.
mkdir -p data
chmod 700 data

npm ci --omit=dev

sudo cp deploy/court-scheduler.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now court-scheduler
sudo systemctl restart court-scheduler

sudo cp deploy/court-scheduler-tunnel.service /etc/systemd/system/court-scheduler-tunnel.service
sudo systemctl daemon-reload
sudo systemctl enable --now court-scheduler-tunnel
sudo systemctl restart court-scheduler-tunnel

echo
echo "Service status:"
sudo systemctl status court-scheduler --no-pager
echo
sudo systemctl status court-scheduler-tunnel --no-pager
echo
echo "Open $(sudo sed -n 's/^BASE_URL=//p' "$ENV_FILE")/ once the tunnel shows HEALTHY in the Cloudflare dashboard."
echo "Tail logs with: sudo journalctl -u court-scheduler -f"
