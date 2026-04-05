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
#   DIFFRACT_DOMAIN=example.com SANDBOX_NAME=my-bot bash deploy-vps.sh

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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"

# ╔══════════════════════════════════════════════════════════════╗
# ║  STEP 0 — Load environment & set defaults                   ║
# ╚══════════════════════════════════════════════════════════════╝
step "Step 0/7 — Loading environment"

SANDBOX_NAME="${SANDBOX_NAME:-my-assistant}"
REPO_DIR="${REPO_DIR:-$HOME/.diffract/repo}"
REPO_URL="${REPO_URL:-https://github.com/hrubee/Diffraction.git}"
DIFFRACT_DOMAIN="${DIFFRACT_DOMAIN:-}"
OPENSHELL_VERSION="${OPENSHELL_VERSION:-0.0.21}"
NVM_DIR="${NVM_DIR:-${HOME}/.nvm}"

export SANDBOX_NAME REPO_DIR DIFFRACT_DOMAIN

info "SANDBOX_NAME  = $SANDBOX_NAME"
info "REPO_DIR      = $REPO_DIR"
info "OPENSHELL_VER = $OPENSHELL_VERSION"
[ -n "$DIFFRACT_DOMAIN" ] && info "DOMAIN        = $DIFFRACT_DOMAIN"

# ╔══════════════════════════════════════════════════════════════╗
# ║  STEP 1 — System prerequisites + Node 22                    ║
# ╚══════════════════════════════════════════════════════════════╝
step "Step 1/7 — System prerequisites + Node 22"

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
step "Step 2/7 — Docker + cgroup fix"

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
CGROUP_CONF='{"default-cgroupns-mode":"host"}'
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
  echo "$CGROUP_CONF" > "$DOCKER_DAEMON_JSON"
  systemctl restart docker
  info "Docker restarted with cgroup host mode"
fi

# ╔══════════════════════════════════════════════════════════════╗
# ║  STEP 3 — OpenShell v${OPENSHELL_VERSION}                   ║
# ╚══════════════════════════════════════════════════════════════╝
step "Step 3/7 — OpenShell v${OPENSHELL_VERSION}"

OPENSHELL_BIN="${HOME}/.local/bin/openshell"
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
# ║  STEP 4 — Clone / update repo + npm install                 ║
# ╚══════════════════════════════════════════════════════════════╝
step "Step 4/7 — Repo + npm install"

if [ -d "$REPO_DIR/.git" ]; then
  info "Repo exists at $REPO_DIR — pulling latest..."
  git -C "$REPO_DIR" pull --ff-only 2>&1 | tail -3
else
  info "Cloning $REPO_URL → $REPO_DIR..."
  git clone --depth 1 "$REPO_URL" "$REPO_DIR"
fi

info "Installing API bridge deps..."
cd "$REPO_DIR/api" && npm install --silent

info "Installing UI deps + building..."
cd "$REPO_DIR/ui" && npm install --silent && npm run build 2>&1 | tail -5

info "Installing CLI deps..."
(cd "$REPO_DIR/cli" && npm install --ignore-scripts --silent)

# Create diffract wrapper in /usr/local/bin
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

info "Repo ready at $REPO_DIR"

# ╔══════════════════════════════════════════════════════════════╗
# ║  STEP 5 — Non-interactive onboard                           ║
# ╚══════════════════════════════════════════════════════════════╝
step "Step 5/7 — Non-interactive onboard"

mkdir -p "${HOME}/.diffract"

# Build a minimal .diffract/config.json if not already present
DIFFRACT_CONFIG="${HOME}/.diffract/config.json"
if [ ! -f "$DIFFRACT_CONFIG" ]; then
  info "Writing initial diffract config..."
  python3 - <<PYEOF
import json, os
cfg = {
    "sandbox_name": os.environ.get("SANDBOX_NAME", "my-assistant"),
    "provider": os.environ.get("DIFFRACT_PROVIDER", "nvidia"),
    "model": os.environ.get("DIFFRACT_MODEL", "nvidia/nemotron-3-super-120b-a12b"),
    "domain": os.environ.get("DIFFRACT_DOMAIN", ""),
    "nvidia_api_key": os.environ.get("NVIDIA_API_KEY", ""),
    "onboarded": False,
}
with open("$DIFFRACT_CONFIG", "w") as f:
    json.dump(cfg, f, indent=2)
PYEOF
fi

# Run onboard non-interactively
# DIFFRACTION_NON_INTERACTIVE=1 skips all prompts; SANDBOX_NAME is pre-set
DIFFRACTION_NON_INTERACTIVE=1 \
  SANDBOX_NAME="$SANDBOX_NAME" \
  PATH="$PATH:${HOME}/.local/bin" \
  node "$REPO_DIR/cli/bin/diffract.js" onboard \
  --non-interactive \
  2>&1 | tail -20 || {
    warn "Onboard exited non-zero (may be already complete or interactive step was skipped)."
    warn "Check: node $REPO_DIR/cli/bin/diffract.js doctor"
  }

info "Onboard complete"

# ╔══════════════════════════════════════════════════════════════╗
# ║  STEP 6 — Caddy reverse proxy                               ║
# ╚══════════════════════════════════════════════════════════════╝
step "Step 6/7 — Caddy reverse proxy"

# Install Caddy from official apt repo
if ! command -v caddy > /dev/null 2>&1; then
  info "Installing Caddy..."
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
  info "Caddy $(caddy version) installed"
else
  info "Caddy already installed: $(caddy version)"
fi

# Detect public IP and generate Caddyfile inline
detect_public_ip() {
  local ip
  ip="$(curl -sf --max-time 5 https://ifconfig.me 2>/dev/null)" && echo "$ip" && return
  ip="$(curl -sf --max-time 5 https://api.ipify.org 2>/dev/null)" && echo "$ip" && return
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')" && echo "$ip" && return
  echo ""
}

CADDY_DIR="/etc/caddy"
CADDY_CONF="$CADDY_DIR/Caddyfile"
mkdir -p "$CADDY_DIR"

if [ -z "${DIFFRACT_DOMAIN:-}" ]; then
  DIFFRACT_DOMAIN="$(detect_public_ip)"
  if [ -n "$DIFFRACT_DOMAIN" ]; then
    info "Detected public IP: $DIFFRACT_DOMAIN"
  else
    warn "Could not detect public IP — Caddy may not start"
  fi
fi

# Use :80 for bare IP addresses (IPv4 or IPv6); domain name triggers Caddy's automatic TLS
if echo "${DIFFRACT_DOMAIN:-}" | grep -qE '^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|[0-9a-fA-F:]+:[0-9a-fA-F:]*)$'; then
  SITE_ADDR=":80"
else
  SITE_ADDR="${DIFFRACT_DOMAIN:-:80}"
fi

info "Writing Caddyfile (site: ${SITE_ADDR})..."
cat > "$CADDY_CONF" <<CADDYEOF
${SITE_ADDR} {
    @websocket {
        header Connection *Upgrade*
        header Upgrade websocket
    }
    reverse_proxy @websocket 127.0.0.1:18789

    handle /__openclaw/* {
        reverse_proxy 127.0.0.1:18789 {
            header_up Host {hostport}
        }
    }

    handle /api/* {
        reverse_proxy 127.0.0.1:3001
    }

    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
CADDYEOF

systemctl enable caddy
systemctl restart caddy
# Give Caddy a moment to acquire the cert / start
sleep 2
if systemctl is-active --quiet caddy; then
  info "Caddy running"
else
  warn "Caddy may not have started cleanly. Check: journalctl -u caddy --no-pager -n 20"
fi

# ╔══════════════════════════════════════════════════════════════╗
# ║  STEP 7 — Start UI stack + gateway-routes sync              ║
# ╚══════════════════════════════════════════════════════════════╝
step "Step 7/7 — Start UI stack + gateway-routes sync"

PID_DIR="/tmp/diffract-ui"
mkdir -p "$PID_DIR"

# Stop any stale services
for pidfile in "$PID_DIR"/*.pid; do
  [ -f "$pidfile" ] || continue
  pid="$(cat "$pidfile")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
  rm -f "$pidfile"
done

# API bridge
info "Starting API bridge on :3001..."
cd "$REPO_DIR/api"
DIFFRACT_DOMAIN="${DIFFRACT_DOMAIN:-}" \
  nohup node server.js > "$PID_DIR/api.log" 2>&1 &
echo $! > "$PID_DIR/api.pid"

# Wait for API to be ready
for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:3001/api/health > /dev/null 2>&1; then
    info "API bridge ready"
    break
  fi
  sleep 1
done

# Next.js UI
info "Starting Next.js UI on :3000..."
cd "$REPO_DIR/ui"
nohup npm run start > "$PID_DIR/ui.log" 2>&1 &
echo $! > "$PID_DIR/ui.pid"

# Sandbox connect + gateway
export PATH="$PATH:${HOME}/.local/bin"
OPENSHELL_BIN="$(command -v openshell 2>/dev/null || echo "${HOME}/.local/bin/openshell")"

if "$OPENSHELL_BIN" sandbox list 2>/dev/null | grep -q "$SANDBOX_NAME"; then
  info "Connecting sandbox $SANDBOX_NAME and starting gateway..."

  # Kill stale port forward
  fuser -k 18789/tcp 2>/dev/null || true
  sleep 1

  # Start gateway via FIFO (pattern from start-ui.sh — mx-2191ba)
  PIPE="$PID_DIR/sandbox-pipe"
  [ -p "$PIPE" ] || mkfifo "$PIPE"
  nohup bash -c "cat '$PIPE' | $OPENSHELL_BIN sandbox connect $SANDBOX_NAME" \
    > "$PID_DIR/connect.log" 2>&1 &
  echo $! > "$PID_DIR/connect.pid"
  sleep 5

  echo "export HOME=/sandbox && nohup /usr/local/bin/diffract gateway run \
    --bind loopback --port 18789 > /tmp/gw.log 2>&1 &" > "$PIPE" &
  sleep 8

  if ss -tlnp 2>/dev/null | grep -q ":18789 " && \
     curl -sf http://127.0.0.1:18789/health 2>/dev/null | grep -q "ok"; then
    info "Gateway healthy on :18789"
  else
    warn "Gateway not yet responding. Check: $PID_DIR/connect.log"
  fi
else
  warn "Sandbox '$SANDBOX_NAME' not found — skipping gateway connect."
  warn "Run: openshell sandbox list"
fi

# Gateway-routes sync — regenerate Caddy config from live sandbox ports
info "Syncing gateway routes..."
SYNC_RESP="$(curl -sf -X POST http://127.0.0.1:3001/api/gateway-routes/sync 2>/dev/null || echo '')"
if echo "$SYNC_RESP" | grep -q '"ok":true'; then
  ROUTES="$(echo "$SYNC_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('routes',0))" 2>/dev/null || echo '?')"
  info "Routes synced ($ROUTES sandbox routes written to Caddy)"
  systemctl reload caddy 2>/dev/null || true
else
  warn "Gateway-routes sync returned no response (API may still be starting). Run:"
  warn "  curl -X POST http://127.0.0.1:3001/api/gateway-routes/sync"
fi

# ── Final banner ─────────────────────────────────────────────────
echo ""
echo -e "  ${BOLD}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "  ${BOLD}║  Diffract VPS deployment complete                     ║${NC}"
echo -e "  ${BOLD}╠═══════════════════════════════════════════════════════╣${NC}"
echo -e "  ${BOLD}║${NC}  Sandbox:    ${SANDBOX_NAME}"
if [ -n "${DIFFRACT_DOMAIN:-}" ]; then
  echo -e "  ${BOLD}║${NC}  Public:     https://${DIFFRACT_DOMAIN}"
else
  echo -e "  ${BOLD}║${NC}  Public:     set DIFFRACT_DOMAIN for TLS"
fi
echo -e "  ${BOLD}║${NC}  API bridge: http://127.0.0.1:3001"
echo -e "  ${BOLD}║${NC}  Web UI:     http://127.0.0.1:3000"
echo -e "  ${BOLD}║${NC}  Gateway:    http://127.0.0.1:18789"
echo -e "  ${BOLD}║${NC}  Logs:       $PID_DIR/*.log"
echo -e "  ${BOLD}║${NC}"
echo -e "  ${BOLD}║${NC}  Re-sync routes:  curl -X POST http://127.0.0.1:3001/api/gateway-routes/sync"
echo -e "  ${BOLD}║${NC}  Stop services:   bash $REPO_DIR/scripts/start-ui.sh --stop"
echo -e "  ${BOLD}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
