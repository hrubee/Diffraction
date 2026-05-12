#!/usr/bin/env bash
# diffract-forward-watchdog.sh — supervise `openshell forward` for a sandbox.
#
# Uses an HTTP probe against /health (not just a PID/port check) so we detect
# ssh-tunnel silent death (mulch mx-527903) — where the forward process is
# alive, the host port is listening, but the app-layer tunnel is broken.
#
# Usage:
#   diffract-forward-watchdog.sh <sandbox-name> [gateway-port]
#
# Managed by systemd unit: diffract-forward-watchdog@<sandbox>.service

set -u

SANDBOX="${1:?Usage: $0 <sandbox-name> [gateway-port]}"
GATEWAY_PORT="${2:-18789}"

PROBE_INTERVAL=10            # seconds between HTTP probes
PROBE_TIMEOUT=3              # curl timeout per probe
FAIL_THRESHOLD=3             # consecutive probe failures before restart
LOG_FILE="/var/log/diffract-forward-watchdog-${SANDBOX}.log"

export PATH="$PATH:/usr/local/bin:/root/.local/bin:${HOME:-/root}/.local/bin"

log()  { printf '[%s] [watchdog/%s] %s\n' "$(date -Is)" "$SANDBOX" "$*" | tee -a "$LOG_FILE"; }
warn() { log "WARN: $*"; }

cleanup() {
  warn "shutting down"
  openshell forward stop "$GATEWAY_PORT" "$SANDBOX" >/dev/null 2>&1 || true
  exit 0
}
trap cleanup INT TERM

ensure_forward() {
  log "(re)starting openshell forward"
  openshell forward stop "$GATEWAY_PORT" "$SANDBOX" >/dev/null 2>&1 || true
  fuser -k "${GATEWAY_PORT}/tcp" >/dev/null 2>&1 || true
  sleep 1
  openshell forward start "$GATEWAY_PORT" "$SANDBOX" --background 2>&1 \
    | tail -2 | tee -a "$LOG_FILE"
  sleep 2
}

probe() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time "$PROBE_TIMEOUT" \
    "http://127.0.0.1:${GATEWAY_PORT}/health" 2>/dev/null || true)"
  # 2xx = up; anything else (0, 5xx) = needs restart.
  case "$code" in
    2??) return 0 ;;
    *)   return 1 ;;
  esac
}

log "starting watchdog for sandbox '${SANDBOX}' on port ${GATEWAY_PORT}"

# If the forward is already running (e.g. set up by onboard), leave it alone.
# Only start one if probe currently fails.
if ! probe; then
  ensure_forward
fi

consecutive_failures=0
while true; do
  sleep "$PROBE_INTERVAL"
  if probe; then
    if [ "$consecutive_failures" -gt 0 ]; then
      log "recovered after ${consecutive_failures} failure(s)"
      consecutive_failures=0
    fi
    continue
  fi
  consecutive_failures=$((consecutive_failures + 1))
  warn "probe failed (#${consecutive_failures})"
  if [ "$consecutive_failures" -ge "$FAIL_THRESHOLD" ]; then
    warn "hit ${FAIL_THRESHOLD} consecutive failures — restarting forward"
    ensure_forward
    consecutive_failures=0
  fi
done
