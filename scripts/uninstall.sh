#!/usr/bin/env bash
# uninstall.sh — tear down Diffract from a VPS.
#
# Three modes, ordered by aggressiveness:
#
#   bash uninstall.sh                 # DEFAULT — sandbox-only teardown.
#                                     # Destroys all sandboxes, the k3s cluster
#                                     # container, and per-sandbox systemd units.
#                                     # Leaves the UI running at /dashboard so
#                                     # users can redeploy via the form.
#
#   bash uninstall.sh --full          # sandbox teardown + remove the UI and
#                                     # Diffract CLI source. /dashboard goes
#                                     # offline. Stops diffract-ui.service and
#                                     # diffract-api.service (:3001).
#                                     # Node/Docker/Caddy still installed.
#
#   bash uninstall.sh --purge         # --full + remove Node, Caddy, Docker,
#                                     # OpenShell CLI. Back to a blank VPS.
#
# Flags:
#   --yes / -y          skip the confirmation prompt
#   --sandbox <name>    only destroy one sandbox (default: all)
#
# Idempotent. Safe to re-run.

set -euo pipefail

MODE=sandbox
ASSUME_YES=0
ONLY_SANDBOX=""
for arg in "$@"; do
  case "$arg" in
    --full)   MODE=full ;;
    --purge)  MODE=purge ;;
    --yes|-y) ASSUME_YES=1 ;;
    --sandbox=*) ONLY_SANDBOX="${arg#*=}" ;;
    --sandbox)  _want_name=1 ;;
    -h|--help)
      sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      if [ "${_want_name:-0}" = "1" ]; then
        ONLY_SANDBOX="$arg"; _want_name=0
      else
        printf 'Unknown flag: %s\n' "$arg" >&2; exit 2
      fi
      ;;
  esac
done

export PATH="$PATH:/usr/local/bin:/root/.local/bin:${HOME:-/root}/.local/bin"

log()  { printf '[uninstall] %s\n' "$*"; }
warn() { printf '[uninstall] WARN: %s\n' "$*" >&2; }

if [ "$(id -u)" -ne 0 ]; then
  warn "This script needs root. Re-run with sudo."
  exit 1
fi

# ── Confirmation ─────────────────────────────────────────────────────────────
if [ "$ASSUME_YES" -eq 0 ]; then
  printf '\nMode: %s\n' "$MODE"
  [ -n "$ONLY_SANDBOX" ] && printf 'Sandbox: %s\n' "$ONLY_SANDBOX" || printf 'Sandbox: ALL\n'
  printf '\nThis will:\n'
  printf '  - stop + remove diffract-gateway-bridge@<sandbox> units\n'
  printf '  - destroy sandbox(es) via openshell\n'
  printf '  - remove the openshell-cluster-* Docker container(s) + images\n'
  printf '  - wipe Caddy per-sandbox config (/etc/caddy/conf.d)\n'
  case "$MODE" in
    full)
      printf '  + remove the UI (/opt/diffract-ui) and CLI (/opt/diffract)\n'
      printf '  + stop + disable diffract-ui.service and diffract-api.service\n'
      printf '  + /dashboard will go offline\n'
      ;;
    purge)
      printf '  + everything from --full, plus:\n'
      printf '  + apt purge node, caddy, docker\n'
      printf '  + remove openshell CLI from ~/.local/bin\n'
      ;;
  esac
  printf '\nProceed? [y/N] '
  read -r reply
  case "$reply" in
    y|Y|yes|YES) ;;
    *) log "cancelled"; exit 0 ;;
  esac
fi

# ── Resolve the list of sandboxes to destroy ─────────────────────────────────
SANDBOXES=()
if command -v openshell >/dev/null 2>&1; then
  if [ -n "$ONLY_SANDBOX" ]; then
    SANDBOXES=("$ONLY_SANDBOX")
  else
    mapfile -t SANDBOXES < <(
      openshell sandbox list 2>/dev/null \
        | awk 'NR>1 && $1 != "" && $1 !~ /^[-=]+$/ {print $1}'
    )
  fi
fi
log "target sandbox(es): ${SANDBOXES[*]:-<none>}"

# ── 1. Stop + disable the bridge systemd units for each target sandbox ───────
for name in "${SANDBOXES[@]}"; do
  unit="diffract-gateway-bridge@${name}.service"
  if systemctl list-unit-files --no-legend --no-pager 2>/dev/null | grep -q "^${unit}"; then
    log "stopping $unit"
    systemctl stop "$unit"    2>/dev/null || true
    systemctl disable "$unit" 2>/dev/null || true
  fi
done

# Also retire any deprecated ssh-forward-watchdog units (previous versions)
while read -r unit _rest; do
  [ -z "$unit" ] && continue
  case "$unit" in diffract-forward-watchdog@*) ;;
    *) continue ;;
  esac
  log "retiring deprecated $unit"
  systemctl stop "$unit"    2>/dev/null || true
  systemctl disable "$unit" 2>/dev/null || true
done < <(systemctl list-units --all --no-legend --no-pager --type=service 2>/dev/null \
         | awk '/^ *diffract-forward-watchdog@/ {print $1}')

# ── 2. Destroy sandboxes via OpenShell ───────────────────────────────────────
if command -v openshell >/dev/null 2>&1; then
  for name in "${SANDBOXES[@]}"; do
    log "deleting sandbox: $name"
    openshell sandbox delete "$name" 2>/dev/null || true
  done
fi

# ── 3. Cluster container + images ────────────────────────────────────────────
# The openshell-cluster-* container is shared across sandboxes. Only remove
# it if we're destroying ALL sandboxes (no --sandbox) or going --full.
REMOVE_CLUSTER=0
if [ -z "$ONLY_SANDBOX" ] || [ "$MODE" != "sandbox" ]; then
  REMOVE_CLUSTER=1
fi

if [ "$REMOVE_CLUSTER" -eq 1 ] && command -v docker >/dev/null 2>&1; then
  log "removing openshell-cluster-* containers + related images"
  docker ps -a --format '{{.Names}}' 2>/dev/null \
    | grep -E '^openshell-cluster-' \
    | xargs -r docker rm -f 2>/dev/null || true
  docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null \
    | grep -iE 'openshell|openclaw|diffract' \
    | xargs -r docker rmi -f 2>/dev/null || true
  docker volume ls --format '{{.Name}}' 2>/dev/null \
    | grep -iE 'openshell|diffract' \
    | xargs -r docker volume rm -f 2>/dev/null || true
  # Also: destroy the top-level openshell gateway record
  if command -v openshell >/dev/null 2>&1; then
    log "destroying openshell gateway"
    openshell gateway destroy --yes 2>/dev/null || openshell gateway destroy 2>/dev/null || true
  fi
fi

# ── 4. Kill any stray bridge / onboard processes ─────────────────────────────
log "killing stray processes"
pkill -9 -f 'diffract-gateway-bridge'  2>/dev/null || true
pkill -9 -f 'openshell forward'        2>/dev/null || true
if [ "$REMOVE_CLUSTER" -eq 1 ]; then
  pkill -9 -f 'diffract.js'  2>/dev/null || true
  pkill -9 -f 'openclaw'     2>/dev/null || true
fi

# ── 5. Refresh / wipe Caddy per-sandbox config ───────────────────────────────
if [ -z "$ONLY_SANDBOX" ]; then
  # Full sandbox teardown — clear the whole conf.d
  log "wiping /etc/caddy/conf.d"
  rm -rf /etc/caddy/conf.d
  mkdir -p /etc/caddy/conf.d
else
  # Single-sandbox removal — regenerate via the sync script if present
  if [ -x /opt/diffract-ui/scripts/sync-sandbox-routes.sh ]; then
    log "regenerating Caddy routes for remaining sandboxes"
    bash /opt/diffract-ui/scripts/sync-sandbox-routes.sh >/dev/null 2>&1 || true
  fi
fi
if command -v caddy >/dev/null 2>&1 && systemctl is-active --quiet caddy; then
  systemctl reload caddy 2>/dev/null || true
fi

# ── 6. Remove per-sandbox log files ──────────────────────────────────────────
if [ -z "$ONLY_SANDBOX" ]; then
  rm -f /var/log/diffract-gateway-bridge-*.log 2>/dev/null || true
else
  rm -f "/var/log/diffract-gateway-bridge-${ONLY_SANDBOX}.log" 2>/dev/null || true
fi

log "sandbox teardown complete"

# ── 7. --full: remove the UI + CLI source ────────────────────────────────────
if [ "$MODE" = "full" ] || [ "$MODE" = "purge" ]; then
  log "removing UI and CLI source"
  systemctl stop    diffract-ui.service  2>/dev/null || true
  systemctl disable diffract-ui.service  2>/dev/null || true
  rm -f  /etc/systemd/system/diffract-ui.service
  rm -f  /etc/systemd/system/multi-user.target.wants/diffract-ui.service
  systemctl stop    diffract-api.service 2>/dev/null || true
  systemctl disable diffract-api.service 2>/dev/null || true
  rm -f  /etc/systemd/system/diffract-api.service
  rm -f  /etc/systemd/system/multi-user.target.wants/diffract-api.service
  rm -f  /etc/systemd/system/diffract-gateway-bridge@.service
  systemctl daemon-reload  2>/dev/null || true
  systemctl reset-failed   2>/dev/null || true

  rm -rf /opt/diffract /opt/diffract-ui
  rm -f  /usr/local/bin/diffract
  rm -f  /usr/local/bin/diffract-gateway-bridge.sh
  rm -rf "${HOME:-/root}/.diffract"
  rm -rf /tmp/diffract-ui /tmp/diffract-build-*
fi

# ── 8. --purge: remove system deps ───────────────────────────────────────────
if [ "$MODE" = "purge" ]; then
  log "--purge: removing system deps"
  rm -f "${HOME:-/root}/.local/bin/openshell" 2>/dev/null || true
  rm -rf "${HOME:-/root}/.openshell"          2>/dev/null || true

  systemctl stop caddy 2>/dev/null || true
  systemctl disable caddy 2>/dev/null || true
  DEBIAN_FRONTEND=noninteractive apt-get purge -y caddy 2>/dev/null || true
  rm -rf /etc/caddy /var/lib/caddy 2>/dev/null || true

  if dpkg -s nodejs >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get purge -y nodejs 2>/dev/null || true
    rm -f /etc/apt/sources.list.d/nodesource.list 2>/dev/null || true
  fi

  if command -v docker >/dev/null 2>&1; then
    remaining="$(docker ps -a -q 2>/dev/null | wc -l || echo 0)"
    if [ "$remaining" = "0" ]; then
      systemctl stop docker 2>/dev/null || true
      DEBIAN_FRONTEND=noninteractive apt-get purge -y \
        docker.io docker-ce docker-ce-cli containerd.io 2>/dev/null || true
      rm -rf /var/lib/docker /etc/docker 2>/dev/null || true
    else
      warn "keeping Docker — $remaining non-Diffract container(s) exist"
    fi
  fi

  apt-get autoremove -y 2>/dev/null || true
fi

case "$MODE" in
  sandbox) log "done — sandbox removed, /dashboard still online" ;;
  full)    log "done — Diffract fully removed (Node/Docker/Caddy kept)" ;;
  purge)   log "done — VPS purged, back to a clean state" ;;
esac
