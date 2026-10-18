#!/usr/bin/env bash
# Run this ON the VM (as the ubuntu user), from inside the project directory,
# after rsyncing the project there. Installs Node.js 24, installs
# dependencies, and enables the systemd service so the app runs permanently.
set -euo pipefail

if ! command -v node >/dev/null || [[ "$(node --version)" != v24* ]]; then
  echo "Installing Node.js 24..."
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

cd "$(dirname "$0")/.."
npm ci --omit=dev

sudo cp deploy/court-scheduler.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now court-scheduler

echo
echo "Service status:"
sudo systemctl status court-scheduler --no-pager
echo
echo "Tail logs with: sudo journalctl -u court-scheduler -f"
