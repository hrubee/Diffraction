#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Diffract one-command VPS deploy script.
# Idempotent. Zero interactive. Requires Ubuntu 24.04, root or sudo.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/hrubee/Diffraction/main/scripts/deploy-vps.sh | bash
#
# Or with env overrides:
#   DIFFRACT_DOMAIN=example.com bash deploy-vps.sh

set -euo pipefail

# ── Colour helpers ───────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

step()  { echo -e "\n${BOLD}${CYAN}[deploy]${NC} ${BOLD}$1${NC}"; }
info()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn()  { echo -e "${YELLOW}[deploy]${NC} $1"; }
fail()  { echo -e "${RED}[deploy]${NC} $1"; exit 1; }

# ── Guard: Linux only ────────────────────────────────────────────
[[ "$(uname -s)" == "Linux" ]] || fail "This script targets Ubuntu 24.04 Linux."

# ╔══════════════════════════════════════════════════════════════╗
# ║  STEP 0 — Load environment & set defaults                   ║
# ╚══════════════════════════════════════════════════════════════╝
step "Step 0/6 — Loading environment"

REPO_DIR="${REPO_DIR:-$HOME/.diffract/repo}"
REPO_URL="${REPO_URL:-https://github.com/hrubee/Diffraction.git}"
DIFFRACT_DOMAIN="${DIFFRACT_DOMAIN:-}"
OPENSHELL_VERSION="${OPENSHELL_VERSION:-0.0.21}"
NVM_DIR="${NVM_DIR:-${HOME}/.nvm}"
DIFFRACT_UI_INSTALL_DIR="${DIFFRACT_UI_INSTALL_DIR:-/opt/diffract-ui}"
DIFFRACT_BASE_PATH="${DIFFRACT_BASE_PATH:-/dashboard}"
DIFFRACT_UI_PORT="${DIFFRACT_UI_PORT:-3000}"

export REPO_DIR DIFFRACT_DOMAIN DIFFRACT_UI_INSTALL_DIR DIFFRACT_BASE_PATH

info "REPO_DIR                = $REPO_DIR"
info "DIFFRACT_UI_INSTALL_DIR = $DIFFRACT_UI_INSTALL_DIR"
info "DIFFRACT_BASE_PATH      = $DIFFRACT_BASE_PATH"
info "DIFFRACT_UI_PORT        = $DIFFRACT_UI_PORT"
info "OPENSHELL_VER           = $OPENSHELL_VERSION"
[ -n "$DIFFRACT_DOMAIN" ] && info "DOMAIN                  = $DIFFRACT_DOMAIN"

# ╔══════════════════════════════════════════════════════════════╗
# ║  STEP 1 — System prerequisites + Node 22                    ║
# ╚══════════════════════════════════════════════════════════════╝
step "Step 1/6 — System prerequisites + Node 22"

export DEBIAN_FRONTEND=noninteractive

info "Updating apt packages..."
apt-get update -qq

info "Installing system packages..."
apt-get install -y -qq \
  git curl wget build-essential ca-certificates gnupg lsb-release \
  python3 python3-pip jq unzip psmisc socat

# ── Node 22 via nvm ──────────────────────────────────────────────
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  info "nvm already installed: $(nvm --version 2>/dev/null || echo 'unknown')"
else
  info "Installing nvm..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
fi

NODE_MAJOR="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1 || echo 0)"
if [ "$NODE_MAJOR" -lt 22 ] 2>/dev/null; then
  info "Installing Node.js 22..."
  nvm install 22
fi
nvm use 22 --silent
nvm alias default 22 > /dev/null 2>&1 || true

info "Node $(node -v) / npm $(npm --version) ready"

# ╔══════════════════════════════════════════════════════════════╗
# ║  STEP 2 — Docker + cgroup fix                               ║
# ╚══════════════════════════════════════════════════════════════╝
step "Step 2/6 — Docker + cgroup fix"

if command -v docker > /dev/null 2>&1 && docker info > /dev/null 2>&1; then
  info "Docker already running: $(docker --version)"
else
  info "Installing Docker..."
  apt-get install -y -qq docker.io
  systemctl enable docker
  systemctl start docker
fi

# OpenShell requires host cgroupns mode (mx-631790)
DOCKER_DAEMON_JSON="/etc/docker/daemon.json"
if [ -f "$DOCKER_DAEMON_JSON" ]; then
  if ! python3 -c "import json,sys; d=json.load(open('$DOCKER_DAEMON_JSON')); sys.exit(0 if d.get('default-cgroupns-mode')=='host' else 1)" 2>/dev/null; then
    info "Patching $DOCKER_DAEMON_JSON for cgroup host mode..."
    python3 - <<'PYEOF'
import json, os
path = "/etc/docker/daemon.json"
d = json.load(open(path)) if os.path.exists(path) and os.path.getsize(path) > 0 else {}
d["default-cgroupns-mode"] = "host"
with open(path, "w") as f:
    json.dump(d, f, indent=2)
PYEOF
    systemctl restart docker
    info "Docker restarted with cgroup host mode"
  else
    info "Docker cgroup host mode already configured"
  fi
else
  info "Writing $DOCKER_DAEMON_JSON..."
  mkdir -p "$(dirname "$DOCKER_DAEMON_JSON")"
  echo '{"default-cgroupns-mode":"host"}' > "$DOCKER_DAEMON_JSON"
  systemctl restart docker
  info "Docker restarted with cgroup host mode"
fi

# ╔══════════════════════════════════════════════════════════════╗
# ║  STEP 3 — OpenShell v${OPENSHELL_VERSION}                   ║
# ╚══════════════════════════════════════════════════════════════╝
step "Step 3/6 — OpenShell v${OPENSHELL_VERSION}"

export PATH="$PATH:${HOME}/.local/bin"

if command -v openshell > /dev/null 2>&1; then
  INSTALLED_VER="$(openshell --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1 || echo '')"
  if [ "$INSTALLED_VER" = "$OPENSHELL_VERSION" ]; then
    info "OpenShell v${OPENSHELL_VERSION} already installed"
  else
    warn "OpenShell ${INSTALLED_VER} installed; expected ${OPENSHELL_VERSION} — re-installing..."
    rm -f "$(command -v openshell)"
  fi
fi

if ! command -v openshell > /dev/null 2>&1; then
  info "Installing OpenShell v${OPENSHELL_VERSION}..."
  OPENSHELL_VERSION=${OPENSHELL_VERSION} curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh
  export PATH=$PATH:$HOME/.local/bin
  info "OpenShell $(openshell --version 2>/dev/null || echo "v${OPENSHELL_VERSION}") installed"
fi

# ╔══════════════════════════════════════════════════════════════╗
# ║  STEP 4 — Diffract CLI repo + From Scrtch UI build          ║
# ╚══════════════════════════════════════════════════════════════╝
step "Step 4/6 — Diffract CLI repo + UI build"

# 4a — Clone / update CLI repo
if [ -d "$REPO_DIR/.git" ]; then
  info "Repo exists at $REPO_DIR — pulling latest..."
  git -C "$REPO_DIR" pull --ff-only 2>&1 | tail -3
elif [ -d "$REPO_DIR" ] && [ -n "$(ls -A "$REPO_DIR" 2>/dev/null)" ]; then
  info "Repo dir already populated (rsync'd, no .git) — skipping clone"
else
  info "Cloning $REPO_URL → $REPO_DIR..."
  git clone --depth 1 "$REPO_URL" "$REPO_DIR"
fi

# 4b — CLI npm install
info "Installing CLI deps..."
(cd "$REPO_DIR/cli" && npm install --ignore-scripts --silent)

# 4c — /usr/local/bin/diffract wrapper
BIN_DIR=/usr/local/bin
WRAPPER=$BIN_DIR/diffract
if [ ! -f "$WRAPPER" ] || ! grep -q "diffract.sh" "$WRAPPER" 2>/dev/null; then
  info "Creating diffract wrapper at $WRAPPER..."
  WRAPPER_CONTENT="#!/usr/bin/env bash
export NVM_DIR=\"\$HOME/.nvm\"
[ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
export PATH=\"\$PATH:\$HOME/.local/bin\"
exec $REPO_DIR/diffract.sh \"\$@\""
  if [ -w "$BIN_DIR" ]; then
    printf '%s\n' "$WRAPPER_CONTENT" > "$WRAPPER"
    chmod +x "$WRAPPER"
  else
    printf '%s\n' "$WRAPPER_CONTENT" | sudo tee "$WRAPPER" > /dev/null
    sudo chmod +x "$WRAPPER"
  fi
  info "diffract wrapper created at $WRAPPER"
fi

info "CLI repo ready at $REPO_DIR"

# 4d — Sync UI source from local repo
mkdir -p "$DIFFRACT_UI_INSTALL_DIR"
info "Syncing UI source from $REPO_DIR/ui/ → $DIFFRACT_UI_INSTALL_DIR..."
rsync -a --delete --exclude=node_modules --exclude=.next "$REPO_DIR/ui/" "$DIFFRACT_UI_INSTALL_DIR/"

# 4e — UI npm install
info "Installing UI deps..."
(cd "$DIFFRACT_UI_INSTALL_DIR" && npm install --silent)

# 4f — Build (standalone output, with basePath)
info "Building From Scrtch UI (basePath=${DIFFRACT_BASE_PATH})..."
(cd "$DIFFRACT_UI_INSTALL_DIR" && \
  NEXT_PUBLIC_BASE_PATH="$DIFFRACT_BASE_PATH" npm run build 2>&1 | tail -5)

# 4g — Stage static + public into standalone tree (mx-659479)
STANDALONE="$DIFFRACT_UI_INSTALL_DIR/.next/standalone"
[ -d "$STANDALONE" ] || fail "Standalone build missing at $STANDALONE — check that next.config.ts sets output:'standalone'"
info "Staging static assets into standalone tree..."
mkdir -p "$STANDALONE/.next"
rm -rf "$STANDALONE/.next/static"
cp -R "$DIFFRACT_UI_INSTALL_DIR/.next/static" "$STANDALONE/.next/static"
if [ -d "$DIFFRACT_UI_INSTALL_DIR/public" ]; then
  rm -rf "$STANDALONE/public"
  cp -R "$DIFFRACT_UI_INSTALL_DIR/public" "$STANDALONE/public"
fi

# 4h — Patch standalone server for 5 GB streaming uploads (mx-668974)
info "Patching standalone server timeouts..."
bash "$DIFFRACT_UI_INSTALL_DIR/scripts/patch-standalone-timeouts.sh" "$DIFFRACT_UI_INSTALL_DIR"

# 4i — Write .env.production
info "Writing .env.production..."
cat > "$DIFFRACT_UI_INSTALL_DIR/.env.production" <<ENVEOF
NODE_ENV=production
PORT=${DIFFRACT_UI_PORT}
HOSTNAME=127.0.0.1
NEXT_PUBLIC_BASE_PATH=${DIFFRACT_BASE_PATH}
DIFFRACT_REPO_DIR=${REPO_DIR}
DIFFRACT_BIN=/usr/local/bin/diffract
ENVEOF

info "UI build complete"

# ╔══════════════════════════════════════════════════════════════╗
# ║  STEP 5 — Caddy reverse proxy                               ║
# ╚══════════════════════════════════════════════════════════════╝
step "Step 5/6 — Caddy reverse proxy"

if ! command -v caddy > /dev/null 2>&1; then
  info "Installing Caddy..."
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  rm -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
        /etc/apt/sources.list.d/caddy-stable.list
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --batch --no-tty --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
  info "Caddy $(caddy version) installed"
else
  info "Caddy already installed: $(caddy version)"
fi

# Detect public IP
detect_public_ip() {
  local ip
  ip="$(curl -sf --max-time 5 https://ifconfig.me 2>/dev/null)" && echo "$ip" && return
  ip="$(curl -sf --max-time 5 https://api.ipify.org 2>/dev/null)" && echo "$ip" && return
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')" && echo "$ip" && return
  echo ""
}

CADDY_DIR="/etc/caddy"
CADDY_CONF="$CADDY_DIR/Caddyfile"
mkdir -p "$CADDY_DIR/conf.d"

if [ -z "${DIFFRACT_DOMAIN:-}" ]; then
  DIFFRACT_DOMAIN="$(detect_public_ip)"
  if [ -n "$DIFFRACT_DOMAIN" ]; then
    info "Detected public IP: $DIFFRACT_DOMAIN"
  else
    warn "Could not detect public IP — Caddy may not start"
  fi
fi

# Resolve FQDN for auto-TLS when we only have an IP
if echo "${DIFFRACT_DOMAIN:-}" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
  FQDN="$(hostname -f 2>/dev/null || true)"
  if echo "${FQDN:-}" | grep -qE '\.' && ! echo "${FQDN:-}" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    info "Resolved FQDN: $FQDN — using for Caddy auto-TLS (HTTPS)"
    DIFFRACT_DOMAIN="$FQDN"
  fi
fi

# Use :80 for bare IP addresses; domain name triggers auto-TLS
if echo "${DIFFRACT_DOMAIN:-}" | grep -qE '^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|[0-9a-fA-F:]+:[0-9a-fA-F:]*)$'; then
  SITE_ADDR=":80"
else
  SITE_ADDR="${DIFFRACT_DOMAIN:-:80}"
fi

info "Writing Caddyfile (site: ${SITE_ADDR})..."
cat > "$CADDY_CONF" <<CADDYEOF
${SITE_ADDR} {
    request_body {
        max_size 5368709120
    }

    @any_sandbox_ws {
        path_regexp sandbox_ws ^/[^/]+/oc(/.*)?$
        header Connection *Upgrade*
        header Upgrade websocket
    }
    handle @any_sandbox_ws {
        reverse_proxy 127.0.0.1:18789 {
            header_up Host {hostport}
            header_up Origin http://127.0.0.1:18789
        }
    }

    import /etc/caddy/conf.d/*.conf

    handle {
        reverse_proxy 127.0.0.1:${DIFFRACT_UI_PORT}
    }
}
CADDYEOF

systemctl enable caddy
systemctl restart caddy
sleep 2

if command -v ufw > /dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 80/tcp > /dev/null 2>&1 || true
  ufw allow 443/tcp > /dev/null 2>&1 || true
  ufw allow 443/udp > /dev/null 2>&1 || true
  info "UFW: ports 80/443 open"
fi

if systemctl is-active --quiet caddy; then
  info "Caddy running"
else
  warn "Caddy may not have started cleanly. Check: journalctl -u caddy --no-pager -n 20"
fi

# ╔══════════════════════════════════════════════════════════════╗
# ║  STEP 6 — diffract-ui systemd service                       ║
# ╚══════════════════════════════════════════════════════════════╝
step "Step 6/6 — diffract-ui systemd service"

REAL_USER="${SUDO_USER:-$USER}"
[ -z "$REAL_USER" ] && REAL_USER=root
REAL_GROUP="$(id -gn "$REAL_USER" 2>/dev/null || echo "$REAL_USER")"
REAL_HOME="$(getent passwd "$REAL_USER" 2>/dev/null | cut -d: -f6 || echo "$HOME")"
[ -z "$REAL_HOME" ] && REAL_HOME="$HOME"
NODE_BIN="$(command -v node)"

# Ensure UI install dir is owned by the service user
chown -R "${REAL_USER}:${REAL_GROUP}" "$DIFFRACT_UI_INSTALL_DIR" 2>/dev/null || true

# Retire legacy diffract-api service if present
if [ -f /etc/systemd/system/diffract-api.service ]; then
  info "Retiring legacy diffract-api.service..."
  systemctl stop diffract-api.service 2>/dev/null || true
  systemctl disable diffract-api.service 2>/dev/null || true
  rm -f /etc/systemd/system/diffract-api.service
  fuser -k 3001/tcp 2>/dev/null || true
fi

# Render the From Scrtch UI systemd template
UNIT_SRC="$DIFFRACT_UI_INSTALL_DIR/systemd/diffract-ui.service"
UNIT_DST="/etc/systemd/system/diffract-ui.service"

if [ ! -f "$UNIT_SRC" ]; then
  fail "Systemd template not found at $UNIT_SRC"
fi

RENDERED="$(mktemp)"
sed \
  -e "s|@@USER@@|${REAL_USER}|g" \
  -e "s|@@INSTALL_DIR@@|${DIFFRACT_UI_INSTALL_DIR}|g" \
  -e "s|@@PORT@@|${DIFFRACT_UI_PORT}|g" \
  -e "s|@@NODE_BIN@@|${NODE_BIN}|g" \
  "$UNIT_SRC" > "$RENDERED"

UNIT_CHANGED=0
if [ ! -f "$UNIT_DST" ] || ! cmp -s "$RENDERED" "$UNIT_DST"; then
  cp "$RENDERED" "$UNIT_DST"
  chmod 644 "$UNIT_DST"
  UNIT_CHANGED=1
  info "Installed diffract-ui.service"
else
  info "diffract-ui.service unchanged"
fi
rm -f "$RENDERED"

[ "$UNIT_CHANGED" -eq 1 ] && systemctl daemon-reload
systemctl enable diffract-ui.service 2>/dev/null || true

# Kill stale process on UI port before starting service
fuser -k "${DIFFRACT_UI_PORT}/tcp" 2>/dev/null || true
sleep 1

if [ "$UNIT_CHANGED" -eq 1 ] || ! systemctl is-active --quiet diffract-ui.service 2>/dev/null; then
  systemctl restart diffract-ui.service
fi

# Wait up to 30s for UI to be reachable
info "Waiting for UI at http://127.0.0.1:${DIFFRACT_UI_PORT}${DIFFRACT_BASE_PATH}/..."
for i in $(seq 1 30); do
  HTTP_CODE="$(curl -s --max-time 2 -o /dev/null -w '%{http_code}' \
    "http://127.0.0.1:${DIFFRACT_UI_PORT}${DIFFRACT_BASE_PATH}/" 2>/dev/null || echo '')"
  if echo "$HTTP_CODE" | grep -qE '^[234]'; then
    info "UI ready (HTTP $HTTP_CODE)"
    break
  fi
  [ "$i" -eq 30 ] && warn "UI did not respond within 30s — check: journalctl -u diffract-ui -n 30"
  sleep 1
done

# Re-sync routes if any sandboxes already exist
export PATH="$PATH:${HOME}/.local/bin"
OPENSHELL_BIN="$(command -v openshell 2>/dev/null || echo "${HOME}/.local/bin/openshell")"
if "$OPENSHELL_BIN" sandbox list 2>/dev/null | \
   awk 'NR>1 && $1 != "" && $1 !~ /^[-=]+$/ {found=1; exit} END {exit !found}'; then
  info "Syncing sandbox routes + forward watchdogs..."
  DIFFRACT_REPO_DIR="$REPO_DIR" \
    bash "$DIFFRACT_UI_INSTALL_DIR/scripts/sync-sandbox-routes.sh" || \
    warn "sync-sandbox-routes.sh exited non-zero — check manually"
else
  info "No sandboxes found — skipping route sync (will run after first onboard)"
fi

# ── Final banner ─────────────────────────────────────────────────
if echo "${DIFFRACT_DOMAIN:-}" | grep -qE '^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|[0-9a-fA-F:]+:[0-9a-fA-F:]*)$' \
   || [ -z "${DIFFRACT_DOMAIN:-}" ]; then
  DASHBOARD_URL="http://${DIFFRACT_DOMAIN:-127.0.0.1}${DIFFRACT_BASE_PATH}"
else
  DASHBOARD_URL="https://${DIFFRACT_DOMAIN}${DIFFRACT_BASE_PATH}"
fi

echo ""
echo -e "  ${BOLD}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "  ${BOLD}║  Diffract VPS deployment complete                     ║${NC}"
echo -e "  ${BOLD}╠═══════════════════════════════════════════════════════╣${NC}"
echo -e "  ${BOLD}║${NC}  Dashboard:  ${DASHBOARD_URL}"
echo -e "  ${BOLD}║${NC}  UI server:  http://127.0.0.1:${DIFFRACT_UI_PORT}${DIFFRACT_BASE_PATH}"
echo -e "  ${BOLD}║${NC}"
echo -e "  ${BOLD}║${NC}  Logs:"
echo -e "  ${BOLD}║${NC}    journalctl -u diffract-ui -f"
echo -e "  ${BOLD}║${NC}    journalctl -u caddy -f"
echo -e "  ${BOLD}║${NC}"
echo -e "  ${BOLD}║${NC}  Next step:  open the dashboard URL and submit the SetupForm"
echo -e "  ${BOLD}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
