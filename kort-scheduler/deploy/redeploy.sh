#!/usr/bin/env bash
# Syncs the project to the Oracle Cloud VM, installs dependencies and the
# systemd unit, and restarts the service.
#
# Follow the cutover runbook in README.md the first time (backup and environment
# file first). The script refuses to run until /etc/court-scheduler/env is complete,
# keeps the previous tree in ~/court-scheduler-prev, and never touches the data
# directory or the environment file (a dry run saying otherwise stops it).
#
#   DRY_RUN=1 ./deploy/redeploy.sh   # show what would change and stop
set -euo pipefail

VM_HOST="${VM_HOST:-ubuntu@84.13.81.192}"
REMOTE_DIR="~/court-scheduler"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EXCLUDES=(--exclude node_modules --exclude data --exclude .env --exclude .git --exclude .idea --exclude docs)

preview="$(rsync -az --delete --dry-run --itemize-changes "${EXCLUDES[@]}" "$PROJECT_DIR"/ "$VM_HOST:$REMOTE_DIR/")"
if grep -E '^\*deleting +(data(/|$)|\.env$)' <<<"$preview"; then
  echo "refusing to deploy: the sync would delete under data/ or the env file" >&2
  exit 1
fi
if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "dry run; changes that would be synced:"
  printf '%s\n' "$preview"
  exit 0
fi

# Preflight on the VM: a complete environment file, and a copy of the tree about to be replaced.
ssh "$VM_HOST" bash -s <<'REMOTE'
set -euo pipefail
f=/etc/court-scheduler/env
sudo test -s "$f" || { echo "missing $f: create it from deploy/court-scheduler.env.example first (README, Deploying)" >&2; exit 1; }
for k in ADMIN_EMAIL BASE_URL AUTH0_DOMAIN AUTH0_CLIENT_ID AUTH0_CLIENT_SECRET; do
  sudo grep -qE "^$k=.+" "$f" || { echo "$f: $k is not set" >&2; exit 1; }
done
if sudo grep -q 'example\.com' "$f"; then echo "$f still contains example.com placeholders" >&2; exit 1; fi
if [ -f ~/court-scheduler/package.json ]; then
  rsync -a --delete --exclude node_modules --exclude data ~/court-scheduler/ ~/court-scheduler-prev/
fi
REMOTE

rsync -az --delete "${EXCLUDES[@]}" "$PROJECT_DIR"/ "$VM_HOST:$REMOTE_DIR/"

ssh "$VM_HOST" "cd $REMOTE_DIR && npm ci --omit=dev \
  && sudo cp deploy/court-scheduler.service /etc/systemd/system/ && sudo systemctl daemon-reload \
  && sudo systemctl restart court-scheduler && sleep 1 && sudo systemctl status court-scheduler --no-pager"
