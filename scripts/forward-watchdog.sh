#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 Diffraction contributors.
# SPDX-License-Identifier: Apache-2.0
#
# Forward watchdog — polls 'openshell forward list' every POLL_INTERVAL
# seconds and revives any port-forward entries that show status 'dead'.
#
# This is a sibling to gateway-watchdog.sh, which checks HTTP reachability.
# The forward watchdog catches the case where the OS-level socat/kubectl
# port-forward process dies silently — the gateway inside the sandbox may be
# healthy, but the host-side tunnel is gone, leaving the chat iframe blank.
#
# Usage:
#   forward-watchdog.sh [sandbox-name] [poll-interval-secs]
#
# Arguments:
#   sandbox-name        Only watch forwards for this sandbox.
#                       Omit (or pass 'all') to watch every forward.
#   poll-interval-secs  Seconds between polls (default: 30)
#
# Designed to be launched by start-services.sh alongside gateway-watchdog.sh.

set -euo pipefail

SANDBOX_FILTER="${1:-all}"
POLL_INTERVAL="${2:-30}"

export PATH="$PATH:$HOME/.local/bin"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# shellcheck source=./lib/runtime.sh
if [ -f "$SCRIPT_DIR/lib/runtime.sh" ]; then
  . "$SCRIPT_DIR/lib/runtime.sh"
fi

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "[forward-watchdog] $1"; }
info() { echo -e "${GREEN}[forward-watchdog]${NC} $1"; }
warn() { echo -e "${YELLOW}[forward-watchdog]${NC} $1"; }
err()  { echo -e "${RED}[forward-watchdog]${NC} $1"; }

# Probe HTTP reachability of a local port.
# Returns 0 if the port responds with any HTTP reply, 1 on empty reply/timeout.
# Args: <local-port>
probe_http() {
  local port="$1"
  local http_code
  http_code="$(curl -o /dev/null -s -w '%{http_code}' \
    --max-time 3 "http://127.0.0.1:${port}/" 2>/dev/null)" || true
  # 000 = connection refused or timeout — port is dead
  [ "$http_code" != "000" ]
}

# Revive a single dead port-forward entry.
# Prefers restarting the systemd bridge unit (diffract-gateway-bridge@<name>)
# over openshell forward, because the bridge unit is the authoritative supervisor.
# Falls back to openshell forward if no systemd unit is present (dev environments).
# Args: <sandbox-name> <local-port>
revive_forward() {
  local name="$1"
  local port="$2"

  warn "Reviving dead forward: $name port $port"

  # Prefer systemd bridge unit restart (production path)
  local unit="diffract-gateway-bridge@${name}.service"
  if systemctl is-enabled "$unit" >/dev/null 2>&1; then
    info "Restarting systemd unit $unit"
    if systemctl restart "$unit" 2>/dev/null; then
      info "systemctl restart $unit succeeded"
      return 0
    else
      err "systemctl restart $unit failed — falling through to openshell forward"
    fi
  fi

  # Fallback: legacy openshell forward (dev / non-systemd environments)
  openshell forward stop "$port" "$name" 2>/dev/null || true
  sleep 1

  if openshell forward start --background "$port" "$name" 2>/dev/null; then
    info "Forward $name:$port restarted via openshell forward"
    return 0
  else
    err "Failed to restart forward $name:$port"
    return 1
  fi
}

# Parse 'openshell forward list' and revive any dead forwards.
# Also runs an HTTP probe on each live forward — catches the silent-death case
# where the PID is alive but the TCP connection returns empty replies.
# Output format (columns, whitespace-separated, ANSI stripped):
#   SANDBOX   BIND         PORT   PID    STATUS
#   smoke1    127.0.0.1    18789  12345  alive
check_and_revive() {
  local raw
  raw="$(openshell forward list 2>/dev/null)" || {
    warn "openshell forward list failed — skipping cycle"
    return 0
  }

  # Strip ANSI colour codes
  local clean
  clean="$(printf '%s' "$raw" | sed 's/\x1b\[[0-9;]*m//g')"

  local revived=0
  local checked=0

  while IFS= read -r line; do
    # Skip header and blank lines
    [[ -z "${line// }" ]] && continue
    [[ "$line" =~ ^SANDBOX ]] && continue

    # Split on whitespace: name bind port pid status
    read -r name _bind local_port _pid status <<< "$line"

    [[ -z "$name" || -z "$local_port" || -z "$status" ]] && continue

    # Apply sandbox filter
    if [[ "$SANDBOX_FILTER" != "all" && "$name" != "$SANDBOX_FILTER" ]]; then
      continue
    fi

    checked=$((checked + 1))

    if [[ "$status" == "dead" ]]; then
      warn "Dead forward detected (PID check): $name port $local_port"
      if revive_forward "$name" "$local_port"; then
        revived=$((revived + 1))
      fi
    else
      # PID is alive — run HTTP probe to catch silent dead connections
      if ! probe_http "$local_port"; then
        warn "HTTP probe failed (empty reply): $name port $local_port — restarting"
        if revive_forward "$name" "$local_port"; then
          revived=$((revived + 1))
        fi
      fi
    fi
  done <<< "$clean"

  if [[ "$checked" -eq 0 && "$SANDBOX_FILTER" != "all" ]]; then
    warn "No forwards found for sandbox '$SANDBOX_FILTER'"
  elif [[ "$revived" -gt 0 ]]; then
    info "Cycle complete: revived $revived forward(s)"
  fi
}

# ── Main loop ────────────────────────────────────────────────────────────────

if [[ "$SANDBOX_FILTER" == "all" ]]; then
  log "Monitoring all port-forwards (poll every ${POLL_INTERVAL}s)"
else
  log "Monitoring port-forwards for sandbox '$SANDBOX_FILTER' (poll every ${POLL_INTERVAL}s)"
fi

while true; do
  sleep "$POLL_INTERVAL"
  check_and_revive
done
