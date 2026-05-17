#!/usr/bin/env bash
# Pi boot autostart kurulumu. backend/systemd/ içinden çalıştır:
#   bash install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
UNIT="/etc/systemd/system/rosellea-backend.service"

sudo systemctl enable docker
sudo systemctl start docker

sudo sed "s|/home/pi/rosellea/backend|${BACKEND_DIR}|" \
  "$SCRIPT_DIR/rosellea-backend.service" \
  | sudo tee "$UNIT" > /dev/null

sudo systemctl daemon-reload
sudo systemctl enable rosellea-backend.service
sudo systemctl start rosellea-backend.service
sudo systemctl status rosellea-backend.service --no-pager
