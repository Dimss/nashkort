#!/usr/bin/env bash
# Syncs the project to the Oracle Cloud VM, reinstalls dependencies, and
# restarts the systemd service. Run this after any local change.
set -euo pipefail

VM_HOST="${VM_HOST:-ubuntu@84.13.81.192}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

rsync -az --exclude node_modules --exclude data --exclude .git --exclude .idea \
  "$PROJECT_DIR"/ "$VM_HOST":~/court-scheduler/

ssh "$VM_HOST" "cd ~/court-scheduler && npm ci --omit=dev && sudo systemctl restart court-scheduler && sleep 1 && sudo systemctl status court-scheduler --no-pager"
