#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 Diffraction contributors.
# SPDX-License-Identifier: Apache-2.0
#
# diffract-gateway-bridge.sh — Supervised kpf+socat bridge for OpenClaw gateway.
#
# Replaces the unreliable `openshell forward ssh -f` tunnel with a supervised
# kubectl port-forward + socat pair that self-heals on failure.
#
# Architecture:
#   socat (127.0.0.1:18789) → cluster bridge IP:18789
#   ← cluster bridge is the Docker container running openshell k3s
#   ← cluster bridge IP is discovered dynamically via docker inspect
#
# Usage:
#   diffract-gateway-bridge.sh <sandbox-name> [gateway-port]
#
# Arguments:
#   sandbox-name   Kubernetes namespace / sandbox name (e.g. smoke1)
#   gateway-port   Port the OpenClaw gateway listens on (default: 18789)
#
# Designed to be managed by systemd unit diffract-gateway-bridge@<name>.service

set -euo pipefail

SANDBOX="${1:?Usage: $0 <sandbox-name> [gateway-port]}"
GATEWAY_PORT="${2:-18789}"

LOG_FILE="/var/log/diffract-gateway-bridge-${SANDBOX}.log"
PROBE_INTERVAL=10        # seconds between HTTP health probes
PROBE_TIMEOUT=3          # curl timeout per probe
KPF_BIND_ADDR="0.0.0.0" # kpf binds on all interfaces inside cluster network

export PATH="/root/.local/bin:$PATH"

# ── Logging ──────────────────────────────────────────────────────────────────

ts() { date '+%Y-%m-%dT%H:%M:%S'; }

log()  { echo "[$(ts)] [bridge/${SANDBOX}] $*" | tee -a "$LOG_FILE"; }
info() { echo "[$(ts)] [bridge/${SANDBOX}] INFO  $*" | tee -a "$LOG_FILE"; }
warn() { echo "[$(ts)] [bridge/${SANDBOX}] WARN  $*" | tee -a "$LOG_FILE"; }
err()  { echo "[$(ts)] [bridge/${SANDBOX}] ERROR $*" | tee -a "$LOG_FILE" >&2; }

# ── Dynamic cluster discovery ─────────────────────────────────────────────────

# Find the Docker container running the openshell k3s cluster.
# The container is named openshell-cluster-<something> and attached to the
# openshell cluster Docker network.
discover_cluster_container() {
  docker ps --format '{{.Names}}' | grep -E '^openshell-cluster-' | head -1
}

# Get the bridge IP of the cluster container (its IP on the Docker bridge network).
discover_cluster_bridge_ip() {
  local container="$1"
  # Prefer the network named after the container (openshell-cluster-*), fall back to bridge.
  local network
  network="$(docker inspect "$container" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
    | tr ' ' '\n' | grep -E '^openshell-cluster-' | head -1)" || true
  if [ -z "$network" ]; then
    network="bridge"
  fi
  docker inspect "$container" \
    --format "{{(index .NetworkSettings.Networks \"${network}\").IPAddress}}"
}

# ── Process management ────────────────────────────────────────────────────────

KPF_PID=""
SOCAT_PID=""

stop_children() {
  if [ -n "$KPF_PID" ] && kill -0 "$KPF_PID" 2>/dev/null; then
    warn "Stopping kpf pid=$KPF_PID"
    kill "$KPF_PID" 2>/dev/null || true
    KPF_PID=""
  fi
  if [ -n "$SOCAT_PID" ] && kill -0 "$SOCAT_PID" 2>/dev/null; then
    warn "Stopping socat pid=$SOCAT_PID"
    kill "$SOCAT_PID" 2>/dev/null || true
    SOCAT_PID=""
  fi
  # Kill any stragglers by command match on the host (docker exec wrappers)
  pkill -f "kubectl port-forward.*${SANDBOX}.*${GATEWAY_PORT}" 2>/dev/null || true
  pkill -f "socat.*TCP-LISTEN:${GATEWAY_PORT}" 2>/dev/null || true
  # Also kill kubectl processes INSIDE the cluster container.
  # Killing the host-side 'docker exec' wrapper does NOT send signals into the
  # container process, so kubectl port-forward keeps running and holds the port.
  local cluster_container
  cluster_container="$(docker ps --format '{{.Names}}' | grep -E '^openshell-cluster-' | head -1 || true)"
  if [ -n "$cluster_container" ]; then
    docker exec "$cluster_container" \
      pkill -f "kubectl port-forward.*${SANDBOX}.*${GATEWAY_PORT}" 2>/dev/null || true
  fi
  sleep 1
}

cleanup() {
  warn "Caught signal — shutting down bridge"
  stop_children
  exit 0
}
trap cleanup INT TERM EXIT

start_bridge() {
  stop_children

  # Discover cluster container + bridge IP on every restart (IP may change after Docker restart)
  local cluster_container
  cluster_container="$(discover_cluster_container)" || {
    err "Cannot find openshell cluster container — is Docker running?"
    return 1
  }
  info "Cluster container: $cluster_container"

  # Kill any process inside the cluster container that's listening on our
  # gateway port. These are typically leaked kubectl port-forwards from
  # previous bridge runs that exited mid-session. We identify them by the
  # socket inode in /proc/net/tcp rather than by argv, because kubectl's
  # cmdline sometimes gets cleared (defunct / argv rewrite) making a
  # grep-based match miss them.
  local port_hex
  port_hex="$(printf '%04X' "${GATEWAY_PORT}")"
  local leaked
  leaked="$(docker exec "$cluster_container" sh -c '
    INODE=$(awk "NR>1 && \$2 ~ /:'"$port_hex"'\$/ && \$4 == \"0A\" {print \$10; exit}" /proc/1/net/tcp)
    [ -z "$INODE" ] && exit 0
    for pid in /proc/[0-9]*; do
      test -d "$pid/fd" || continue
      if ls -l "$pid/fd" 2>/dev/null | grep -q "socket:\[$INODE\]"; then
        echo "${pid#/proc/}"
      fi
    done
  ' 2>/dev/null || true)"
  if [ -n "$leaked" ]; then
    warn "Killing leaked listener PIDs inside cluster (port ${GATEWAY_PORT}): $leaked"
    docker exec "$cluster_container" sh -c "kill -9 $leaked 2>/dev/null; true" 2>/dev/null || true
    sleep 1
  fi

  local bridge_ip
  bridge_ip="$(discover_cluster_bridge_ip "$cluster_container")" || {
    err "Cannot determine bridge IP for $cluster_container"
    return 1
  }
  info "Cluster bridge IP: $bridge_ip"

  # Launch kubectl port-forward inside the cluster container.
  # Binds on all interfaces so socat (on host) can reach it via bridge IP.
  docker exec "$cluster_container" \
    kubectl port-forward \
      -n openshell \
      "${SANDBOX}" \
      "${GATEWAY_PORT}:${GATEWAY_PORT}" \
      --address "${KPF_BIND_ADDR}" \
    >> "$LOG_FILE" 2>&1 &
  KPF_PID=$!
  info "kubectl port-forward started (pid=$KPF_PID)"

  # Give kpf a moment to establish the tunnel before socat connects
  sleep 2

  if ! kill -0 "$KPF_PID" 2>/dev/null; then
    err "kubectl port-forward exited immediately — check sandbox name and namespace"
    return 1
  fi

  # Launch socat to front the kpf on 127.0.0.1 so Caddy can reach it.
  socat \
    "TCP-LISTEN:${GATEWAY_PORT},bind=127.0.0.1,fork,reuseaddr" \
    "TCP:${bridge_ip}:${GATEWAY_PORT}" \
    >> "$LOG_FILE" 2>&1 &
  SOCAT_PID=$!
  info "socat started (pid=$SOCAT_PID)"

  sleep 1
  if ! kill -0 "$SOCAT_PID" 2>/dev/null; then
    err "socat exited immediately — port ${GATEWAY_PORT} may already be in use"
    return 1
  fi

  info "Bridge up: 127.0.0.1:${GATEWAY_PORT} → ${bridge_ip}:${GATEWAY_PORT}"
  return 0
}

# ── Health probe ──────────────────────────────────────────────────────────────

probe_health() {
  # Attempt HTTP GET; an empty reply or connection refused counts as failure.
  local http_code
  http_code="$(curl -o /dev/null -s -w '%{http_code}' \
    --max-time "$PROBE_TIMEOUT" \
    "http://127.0.0.1:${GATEWAY_PORT}/" 2>/dev/null)" || true

  # 000 = connection refused / timeout; treat non-zero as alive
  if [ "$http_code" = "000" ]; then
    return 1
  fi
  return 0
}

# Restart the openclaw-gateway *inside the sandbox pod*. Used when the bridge
# tunnel is healthy but the upstream gateway process has died.
# Uses `openshell sandbox connect` piped stdin — the documented way to run
# commands persistently inside a sandbox (mulch mx-f3875a).
#
# Restart sequence (order matters):
#   1. `diffract gateway stop` — graceful shutdown, releases lock normally
#   2. `pkill -9` — force kill anything that survived
#   3. `rm -f /tmp/openclaw-*/gateway.*.lock` — clear stale lock files
#      (kill -9 can't run cleanup handlers; lock file survives and blocks
#      the next gateway from starting with "gateway already running")
#   4. nohup+disown start with --auth token
restart_pod_gateway() {
  local pipe
  pipe="$(mktemp -u)"
  mkfifo "$pipe" || { err "mkfifo failed"; return 1; }

  (cat "$pipe" | openshell sandbox connect "${SANDBOX}" >> "$LOG_FILE" 2>&1) &
  local connect_pid=$!

  # Give the SSH session a moment to establish
  sleep 5

  # OpenClaw uses a supervisor pattern: the `openclaw` process (comm `openclaw`)
  # spawns and restarts `openclaw-gateway` (comm truncated to `openclaw-gatewa`
  # by Linux TASK_COMM_LEN). A naive `pkill openclaw-gateway` misses the
  # worker (comm truncated) AND `nohup diffract gateway run` races the
  # supervisor's auto-respawn, causing EADDRINUSE loops.
  #
  # Correct sequence:
  #   1. `diffract gateway stop`  — asks supervisor to stop the worker
  #   2. `pkill -9 -f openclaw-gateway` — targets worker via argv, NOT the
  #      supervisor (whose argv is just "openclaw" and would be matched by
  #      an overly-broad pattern)
  #   3. Remove stale lock files (kill -9 can't run cleanup handlers)
  #   4. `diffract gateway`  — NOT `gateway run`; lets supervisor manage the
  #      new worker lifecycle (mulch mx-f3875a)
  {
    printf 'diffract gateway stop 2>/dev/null || true; sleep 3\n'
    printf 'pkill -9 -f openclaw-gateway 2>/dev/null || true; sleep 2\n'
    printf 'rm -f /tmp/openclaw-*/gateway.*.lock /tmp/openclaw/gateway.*.lock 2>/dev/null || true\n'
    printf 'export HOME=/sandbox\n'
    printf 'nohup /usr/local/bin/diffract gateway > /tmp/gw.log 2>&1 &\n'
    printf 'disown; sleep 30; exit\n'
  } > "$pipe"

  # Wait for the connect session to end; cap at 60s (gateway boot takes 15-30s)
  local waited=0
  while kill -0 "$connect_pid" 2>/dev/null && [ "$waited" -lt 60 ]; do
    sleep 2
    waited=$((waited + 2))
  done
  kill "$connect_pid" 2>/dev/null || true
  rm -f "$pipe"

  info "pod gateway restart attempt complete"
}

# ── Main loop ─────────────────────────────────────────────────────────────────

info "Starting gateway bridge for sandbox '${SANDBOX}' on port ${GATEWAY_PORT}"

# Initial start
start_bridge || {
  err "Initial bridge start failed — will retry in ${PROBE_INTERVAL}s"
}

consecutive_failures=0

while true; do
  sleep "$PROBE_INTERVAL"

  # Ground truth is the HTTP probe — if it works, everything is fine
  # regardless of what kpf/socat are doing.
  if probe_health; then
    if [ "$consecutive_failures" -gt 0 ]; then
      info "Bridge recovered after ${consecutive_failures} failure(s)"
    fi
    consecutive_failures=0
    continue
  fi

  consecutive_failures=$((consecutive_failures + 1))
  warn "HTTP probe failed (#${consecutive_failures})"

  # First response: restart the pod gateway. This is cheap and idempotent —
  # if the pod gateway was genuinely healthy, the restart just cycles the
  # worker. If it was dead (the common case), we recover here without
  # having to rebuild the tunnel.
  restart_pod_gateway || true
  sleep 5
  if probe_health; then
    info "Gateway recovered after pod-level restart"
    consecutive_failures=0
    continue
  fi

  # Pod-gateway restart didn't help — the tunnel itself may be stale.
  warn "Pod-gateway restart didn't recover — rebuilding tunnel"
  start_bridge || true
  sleep 3
  if probe_health; then
    info "Bridge recovered after tunnel rebuild"
    consecutive_failures=0
  else
    # Still down — keep looping. restart_pod_gateway will be retried next tick.
    warn "Still down after tunnel rebuild — will retry in ${PROBE_INTERVAL}s"
  fi
done
