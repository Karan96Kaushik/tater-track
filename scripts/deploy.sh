#!/usr/bin/env bash
# Build the SPA and ship dist/ to an nginx host over SSH.
#
#   DEPLOY_HOST=user@example.com DEPLOY_PATH=/var/www/tater-track ./scripts/deploy.sh
set -euo pipefail

HOST="${DEPLOY_HOST:-}"
TARGET="${DEPLOY_PATH:-/var/www/tater-track}"

if [[ -z "$HOST" ]]; then
  echo "DEPLOY_HOST is required (e.g. user@example.com)" >&2
  exit 1
fi

echo "==> Building"
npx tsc -b
npx vite build

echo "==> Packaging"
rm -f dist.zip
(cd dist && zip -qr ../dist.zip .)

echo "==> Uploading to $HOST:$TARGET"
scp dist.zip "$HOST:/tmp/tater-track-dist.zip"
ssh "$HOST" bash -se <<EOF
set -euo pipefail
sudo mkdir -p "$TARGET"
sudo rm -rf "$TARGET".bak
[ -d "$TARGET" ] && sudo cp -r "$TARGET" "$TARGET".bak
sudo rm -rf "${TARGET:?}"/*
sudo unzip -qo /tmp/tater-track-dist.zip -d "$TARGET"
rm -f /tmp/tater-track-dist.zip
sudo nginx -t && sudo systemctl reload nginx
EOF

echo "==> Deployed"
