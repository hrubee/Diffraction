#!/usr/bin/env bash
# Start the Diffract web UI stack
# 1. Connect sandbox (gateway + port forward)
# 2. Fetch gateway token
# 3. Start API bridge
# 4. Start Next.js UI
#
# Usage: bash scripts/start-ui.sh [--dev]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MODE="${1:-prod}"
PID_DIR="/tmp/diffract-ui"
OPENSHELL="${HOME}/.local/bin/openshell"
mkdir -p "$PID_DIR"

# Load nvm if available
export NVM_DIR="${HOME}/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
export PATH="$PATH:${HOME}/.local/bin"

stop_all() {
  echo "Stopping Diffract UI services..."
  for pidfile in "$PID_DIR"/*.pid; do
    [ -f "$pidfile" ] || continue
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      echo "  Stopped PID $pid ($(basename "$pidfile" .pid))"
    fi
    rm -f "$pidfile"
  done
}

trap stop_all EXIT
stop_all 2>/dev/null || true

echo "Starting Diffract services..."

# ── 0. Detect sandbox name ──────────────────────────────────────────────
SANDBOX_NAME="${SANDBOX_NAME:-}"
if [ -z "$SANDBOX_NAME" ]; then
  # Try to find it from openshell
  SANDBOX_NAME=$("$OPENSHELL" sandbox list 2>/dev/null | grep -oP '^\S+' | head -1 || echo "")
  if [ -z "$SANDBOX_NAME" ]; then
    echo "  WARNING: No sandbox found. Skipping sandbox connect."
    echo "  Run 'openshell sandbox list' to check."
  fi
fi

# ── 1. Connect sandbox + port forward ──────────────────────────────────
if [ -n "$SANDBOX_NAME" ]; then
  echo "  Connecting sandbox: $SANDBOX_NAME"

  # Kill any stale forward on 18789
  fuser -k 18789/tcp 2>/dev/null || true
  sleep 1

  # Start sandbox connect session via FIFO (keeps forward alive)
  echo "  Opening sandbox connection..."
  PIPE="/tmp/sandbox-pipe-$$"
  mkfifo "$PIPE" 2>/dev/null || true
  nohup bash -c "cat '$PIPE' | $OPENSHELL sandbox connect $SANDBOX_NAME" > "$PID_DIR/connect.log" 2>&1 &
  echo $! > "$PID_DIR/connect.pid"
  sleep 5

  # Start OpenClaw gateway inside the sandbox via the FIFO
  echo "  Starting OpenClaw gateway inside sandbox..."
  CONTAINER="openshell-cluster-diffract"
  echo "export HOME=/sandbox && nohup /usr/local/bin/diffract gateway run --bind loopback --port 18789 > /tmp/gw.log 2>&1 &" > "$PIPE" &
  sleep 8

  # Verify forward is running and gateway responds
  if ss -tlnp | grep -q ":18789 " && curl -s http://127.0.0.1:18789/health | grep -q "ok"; then
    echo "  Port forward active on :18789 — gateway healthy"
  else
    echo "  WARNING: Gateway not responding. Check $PID_DIR/connect.log"
    echo "  You may need to run: openshell sandbox connect $SANDBOX_NAME"
  fi

  # ── 2. Fetch gateway token ────────────────────────────────────────────
  echo "  Fetching gateway token..."
  CONTAINER="openshell-cluster-diffract"
  TOKEN=$(docker exec "$CONTAINER" kubectl exec -n openshell "$SANDBOX_NAME" -- \
    python3 -c "import json; d=json.load(open('/sandbox/.openclaw/openclaw.json')); print(d['gateway']['auth']['token'])" 2>/dev/null || echo "")

  if [ -n "$TOKEN" ]; then
    echo "  Gateway token: $TOKEN"
    echo "$TOKEN" > "$PID_DIR/gateway-token.txt"
    # Write token to a JSON file the API bridge can serve
    echo "{\"token\":\"$TOKEN\",\"sandbox\":\"$SANDBOX_NAME\"}" > "$PROJECT_ROOT/api/gateway-token.json"
    echo "  Token saved to api/gateway-token.json"
  else
    echo "  WARNING: Could not fetch gateway token."
    echo "  Get it manually: openshell sandbox connect $SANDBOX_NAME"
    echo "  Then: python3 -c \"import json; d=json.load(open('/sandbox/.openclaw/openclaw.json')); print(d['gateway']['auth']['token'])\""
  fi
fi

# ── 3. API bridge ──────────────────────────────────────────────────────
echo "  Starting API bridge on :3001..."
cd "$PROJECT_ROOT/api"
if [ "$MODE" = "--dev" ]; then
  nohup node --watch server.js > "$PID_DIR/api.log" 2>&1 &
else
  nohup node server.js > "$PID_DIR/api.log" 2>&1 &
fi
echo $! > "$PID_DIR/api.pid"

# ── 4. Next.js UI ─────────────────────────────────────────────────────
echo "  Starting Next.js UI on :3000..."
cd "$PROJECT_ROOT/ui"
if [ "$MODE" = "--dev" ]; then
  nohup npm run dev > "$PID_DIR/ui.log" 2>&1 &
else
  nohup npm run start > "$PID_DIR/ui.log" 2>&1 &
fi
echo $! > "$PID_DIR/ui.pid"

echo ""
echo "═══════════════════════════════════════════"
echo "  Diffract UI running"
echo "═══════════════════════════════════════════"
echo "  Sandbox:    ${SANDBOX_NAME:-none}"
echo "  Forward:    :18789 → sandbox gateway"
echo "  API bridge: http://localhost:3001"
echo "  Web UI:     http://localhost:3000"
[ -n "${TOKEN:-}" ] && echo "  Token:      $TOKEN"
echo "  Logs:       $PID_DIR/*.log"
echo "═══════════════════════════════════════════"
echo ""
echo "Press Ctrl+C to stop all services."

wait
