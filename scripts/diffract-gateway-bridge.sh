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

# ── Main loop ─────────────────────────────────────────────────────────────────

info "Starting gateway bridge for sandbox '${SANDBOX}' on port ${GATEWAY_PORT}"

# Initial start
start_bridge || {
  err "Initial bridge start failed — will retry in ${PROBE_INTERVAL}s"
}

consecutive_failures=0

while true; do
  sleep "$PROBE_INTERVAL"

  # Check child processes are still alive
  kpf_alive=true
  socat_alive=true
  [ -z "$KPF_PID" ] || kill -0 "$KPF_PID" 2>/dev/null || kpf_alive=false
  [ -z "$SOCAT_PID" ] || kill -0 "$SOCAT_PID" 2>/dev/null || socat_alive=false

  if ! $kpf_alive; then
    warn "kpf process died (pid=$KPF_PID)"
  fi
  if ! $socat_alive; then
    warn "socat process died (pid=$SOCAT_PID)"
  fi

  if ! $kpf_alive || ! $socat_alive; then
    warn "Process death detected — restarting bridge"
    consecutive_failures=$((consecutive_failures + 1))
    start_bridge || true
    continue
  fi

  # HTTP health probe
  if ! probe_health; then
    consecutive_failures=$((consecutive_failures + 1))
    warn "HTTP probe failed (failure #${consecutive_failures}) — restarting bridge"
    start_bridge || true
  else
    if [ "$consecutive_failures" -gt 0 ]; then
      info "Bridge recovered after ${consecutive_failures} failure(s)"
    fi
    consecutive_failures=0
  fi
done
