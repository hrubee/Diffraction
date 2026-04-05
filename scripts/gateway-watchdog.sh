#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 Diffraction contributors.
# SPDX-License-Identifier: Apache-2.0
#
# Gateway watchdog — polls the sandbox gateway health and restarts it
# if it becomes unreachable. Runs on the host as a background service.
#
# Usage: gateway-watchdog.sh <sandbox-name> [poll-interval-secs]
#
# The watchdog:
#   1. Checks if the gateway port (18789) is listening via openshell forward
#   2. If not, reconnects to the sandbox and re-runs the diffract entrypoint
#   3. Restarts the openshell port forward
#
# Designed to be launched by start-services.sh alongside the Telegram bridge.

set -euo pipefail

SANDBOX_NAME="${1:-}"
POLL_INTERVAL="${2:-30}"
MAX_CONSECUTIVE_FAILURES=3

if [ -z "$SANDBOX_NAME" ]; then
  echo "[watchdog] Usage: $0 <sandbox-name> [poll-interval-secs]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# shellcheck source=./lib/runtime.sh
if [ -f "$SCRIPT_DIR/lib/runtime.sh" ]; then
  . "$SCRIPT_DIR/lib/runtime.sh"
fi

consecutive_failures=0

check_gateway() {
  # Quick check: is the forward alive and responding?
  curl -sf --max-time 5 -o /dev/null http://127.0.0.1:18789/ 2>/dev/null
}

restart_gateway() {
  echo "[watchdog] Gateway unreachable — attempting restart..."

  # Restart port forward
  openshell forward stop 18789 "$SANDBOX_NAME" 2>/dev/null || true
  sleep 2
  openshell forward start --background 18789 "$SANDBOX_NAME" 2>/dev/null || true
  sleep 5

  # Check if it came back
  if check_gateway; then
    echo "[watchdog] Gateway recovered after forward restart"
    return 0
  fi

  # Port forward is up but gateway inside sandbox is dead — re-run entrypoint
  echo "[watchdog] Forward alive but gateway not responding — restarting gateway inside sandbox..."

  # Get the cluster container name
  local cluster
  cluster="$(docker ps --filter "name=openshell-cluster" --format '{{.Names}}' 2>/dev/null | head -1)"
  if [ -z "$cluster" ]; then
    echo "[watchdog] No openshell cluster container found"
    return 1
  fi

  # Re-run the diffract entrypoint inside the sandbox
  printf '%s\n' "su -s /bin/bash sandbox -c diffract" \
    | openshell sandbox connect "$SANDBOX_NAME" 2>/dev/null || true

  sleep 8

  # Restart forward again
  openshell forward stop 18789 "$SANDBOX_NAME" 2>/dev/null || true
  sleep 1
  openshell forward start --background 18789 "$SANDBOX_NAME" 2>/dev/null || true
  sleep 3

  if check_gateway; then
    echo "[watchdog] Gateway recovered after full restart"
    return 0
  fi

  echo "[watchdog] Gateway still unreachable after restart attempt"
  return 1
}

echo "[watchdog] Monitoring gateway for sandbox '$SANDBOX_NAME' (poll every ${POLL_INTERVAL}s)"

while true; do
  sleep "$POLL_INTERVAL"

  if check_gateway; then
    consecutive_failures=0
    continue
  fi

  consecutive_failures=$((consecutive_failures + 1))
  echo "[watchdog] Gateway check failed ($consecutive_failures/$MAX_CONSECUTIVE_FAILURES)"

  if [ "$consecutive_failures" -ge "$MAX_CONSECUTIVE_FAILURES" ]; then
    if restart_gateway; then
      consecutive_failures=0
    else
      # Back off before retrying
      echo "[watchdog] Recovery failed — backing off 60s"
      sleep 60
      consecutive_failures=0
    fi
  fi
done
