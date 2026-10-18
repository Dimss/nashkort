#!/usr/bin/env bash
# Run this ON the VM (as the ubuntu user), from inside the project directory,
# after syncing the project there:
#
#   ./deploy/setup-vm.sh scheduler.example.com
#
# Idempotent. Installs Node.js 24, a 2 GB swap file, Caddy (automatic HTTPS
# on the given hostname, proxying to the app on loopback), opens ports 80 and
# 443 in the host firewall, closes 3000, locks down the data directory,
# installs dependencies and the systemd unit, and starts the service.
# Requires /etc/court-scheduler/env to exist (see deploy/court-scheduler.env.example).
set -euo pipefail

APP_HOSTNAME="${1:-${APP_HOSTNAME:-}}"
if [[ -z "$APP_HOSTNAME" ]]; then
  echo "usage: $0 <public-hostname>" >&2
  exit 1
fi
ENV_FILE=/etc/court-scheduler/env
if ! sudo test -s "$ENV_FILE"; then
  echo "Missing $ENV_FILE. Create it from deploy/court-scheduler.env.example (owner root, mode 0600) first." >&2
  exit 1
fi
sudo chown root:root "$ENV_FILE" && sudo chmod 0600 "$ENV_FILE"

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

# Caddy from its official repository (ships a systemd unit running as the caddy user).
if ! command -v caddy >/dev/null; then
  echo "Installing Caddy..."
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y caddy
fi
sed "s/APP_HOSTNAME_PLACEHOLDER/$APP_HOSTNAME/" deploy/Caddyfile | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy

# Host firewall (iptables + netfilter-persistent on Oracle's Ubuntu images):
# allow 80 and 443 before the final REJECT, and stop exposing the app port.
for port in 80 443; do
  if ! sudo iptables -C INPUT -m state --state NEW -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport "$port" -j ACCEPT
  fi
done
while sudo iptables -C INPUT -p tcp --dport 3000 -m state --state NEW -j ACCEPT 2>/dev/null; do
  sudo iptables -D INPUT -p tcp --dport 3000 -m state --state NEW -j ACCEPT
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

echo
echo "Service status:"
sudo systemctl status court-scheduler --no-pager
echo
echo "Open https://$APP_HOSTNAME/ once DNS points here and ports 80/443 are open in the Oracle VCN security list."
echo "Tail logs with: sudo journalctl -u court-scheduler -f"
