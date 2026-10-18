#!/usr/bin/env bash
# Syncs the project to the Oracle Cloud VM, installs dependencies and the
# systemd unit, and restarts the service.
#
# Do not run this for the first time before the cutover runbook in README.md
# (environment file and backup first). Files removed locally are removed on
# the VM too; the data directory and the environment file are never touched,
# and the script refuses to run if a dry run says otherwise.
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

rsync -az --delete "${EXCLUDES[@]}" "$PROJECT_DIR"/ "$VM_HOST:$REMOTE_DIR/"

ssh "$VM_HOST" "cd $REMOTE_DIR && npm ci --omit=dev \
  && sudo cp deploy/court-scheduler.service /etc/systemd/system/ && sudo systemctl daemon-reload \
  && sudo systemctl restart court-scheduler && sleep 1 && sudo systemctl status court-scheduler --no-pager"
