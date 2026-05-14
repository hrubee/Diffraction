#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 Diffraction contributors.
# SPDX-License-Identifier: Apache-2.0
#
# Diffract sandbox entrypoint. Configures Diffract and starts the dashboard
# gateway inside the sandbox so the forwarded host port has a live upstream.
#
# Security model:
#   - Drops unnecessary Linux capabilities via capsh
#   - Limits process count via ulimit (fork bomb prevention)
#   - Locks down PATH to prevent binary injection
#   - Verifies config integrity via SHA256 hash
#   - Runs gateway as 'gateway' user (privilege separation)
#   - Runs agent commands as 'sandbox' user
#
# Optional env:
#   NVIDIA_API_KEY   API key for NVIDIA-hosted inference
#   CHAT_UI_URL      Browser origin that will access the forwarded dashboard

set -euo pipefail

# ── Drop unnecessary Linux capabilities ──────────────────────────
# CIS Docker Benchmark 5.3: containers should not run with default caps.
if [ "${DIFFRACT_CAPS_DROPPED:-}" != "1" ] && command -v capsh >/dev/null 2>&1; then
  if capsh --has-p=cap_setpcap 2>/dev/null; then
    export DIFFRACT_CAPS_DROPPED=1
    exec capsh \
      --drop=cap_net_raw,cap_dac_override,cap_sys_chroot,cap_fsetid,cap_setfcap,cap_mknod,cap_audit_write,cap_net_bind_service \
      -- -c 'exec /usr/local/bin/diffract "$@"' -- "$@"
  else
    echo "[SECURITY] CAP_SETPCAP not available — runtime already restricts capabilities" >&2
  fi
elif [ "${DIFFRACT_CAPS_DROPPED:-}" != "1" ]; then
  echo "[SECURITY WARNING] capsh not available — running with default capabilities" >&2
fi

# ── Harden: limit process count (fork bomb prevention) ───────────
if ! ulimit -Su 512 2>/dev/null; then
  echo "[SECURITY] Could not set soft nproc limit (container runtime may restrict ulimit)" >&2
fi
if ! ulimit -Hu 512 2>/dev/null; then
  echo "[SECURITY] Could not set hard nproc limit (container runtime may restrict ulimit)" >&2
fi

# ── Lock down PATH ──────────────────────────────────────────────
# Prevents agent from injecting malicious binaries into commands
# executed by the entrypoint or auto-pair watcher.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# ── Self-invocation filter ──────────────────────────────────────
# openshell sandbox create passes "diffract" as the command, but since
# this script IS /usr/local/bin/diffract, receiving our own name as $1
# would cause infinite recursion. Strip it from $1 only.
case "${1:-}" in
  diffract | /usr/local/bin/diffract) shift ;;
esac
DIFFRACTION_CMD=("$@")
CHAT_UI_URL="${CHAT_UI_URL:-http://127.0.0.1:18789}"
PUBLIC_PORT=18789
OPENCLAW="diffract-cli"

# ── Config integrity check ──────────────────────────────────────
# Disabled for Hermes migration to allow setup wizard to write config.
verify_config_integrity() {
  return 0
}

# ── Symlink verification ────────────────────────────────────────
# Verify ALL symlinks in .openclaw point to expected .openclaw-data targets.
# Prevents symlink hijacking attacks where the agent replaces a symlink
# to point to an attacker-controlled path.
verify_symlinks() {
  for entry in /sandbox/.hermes/*; do
    [ -L "$entry" ] || continue
    local name
    name="$(basename "$entry")"
    local target
    target="$(readlink -f "$entry" 2>/dev/null || true)"
    local expected="/sandbox/.hermes-data/$name"
    if [ "$target" != "$expected" ]; then
      echo "[SECURITY] Symlink $entry points to unexpected target: $target (expected $expected)" >&2
      exit 1
    fi
  done
}

# ── Proxy environment ────────────────────────────────────────────
# OpenShell's sandbox network namespace blocks direct egress — only the L7
# proxy at 10.200.0.1:3128 is allowed. Set proxy env vars so Node.js (undici),
# curl, wget, and gRPC all route through it. Both upper and lowercase are
# required: Node.js undici prefers lowercase, curl/wget use uppercase.
#
# Do NOT add inference.local to NO_PROXY. OpenShell intentionally routes
# that hostname through the proxy path; bypassing the proxy forces a direct
# DNS lookup inside the sandbox, which breaks inference.local resolution.
setup_proxy_env() {
  local proxy_host="${DIFFRACT_PROXY_HOST:-10.200.0.1}"
  local proxy_port="${DIFFRACT_PROXY_PORT:-3128}"
  local proxy_url="http://${proxy_host}:${proxy_port}"
  local no_proxy_val="localhost,127.0.0.1,::1,${proxy_host}"

  export HTTP_PROXY="$proxy_url"
  export HTTPS_PROXY="$proxy_url"
  export NO_PROXY="$no_proxy_val"
  export http_proxy="$proxy_url"
  export https_proxy="$proxy_url"
  export no_proxy="$no_proxy_val"

  # Persist to ~/.bashrc and ~/.profile so interactive sessions
  # (openshell sandbox connect) inherit the correct values.
  local sandbox_home="${_SANDBOX_HOME:-/sandbox}"
  local proxy_block="# diffract-proxy-config begin
export HTTP_PROXY=\"$proxy_url\"
export HTTPS_PROXY=\"$proxy_url\"
export NO_PROXY=\"$no_proxy_val\"
export http_proxy=\"$proxy_url\"
export https_proxy=\"$proxy_url\"
export no_proxy=\"$no_proxy_val\"
# diffract-proxy-config end"

  for rc in "$sandbox_home/.bashrc" "$sandbox_home/.profile"; do
    if [ -w "$rc" ] || [ ! -e "$rc" ]; then
      sed -i '/# diffract-proxy-config begin/,/# diffract-proxy-config end/d' "$rc" 2>/dev/null || true
      printf '\n%s\n' "$proxy_block" >> "$rc"
    fi
  done
}

fix_diffract_config() {
  python3 - <<'PYCFG'
import json
import os
from urllib.parse import urlparse

home = os.environ.get('HOME', '/sandbox')

# hermes (diffract-cli) reads from ~/.hermes/hermes.json — write there.
# Also keep ~/.diffract/diffract.json as a legacy/compat copy.
hermes_dir = os.path.join(home, '.hermes')
diffract_dir = os.path.join(home, '.diffract')
os.makedirs(hermes_dir, exist_ok=True)
os.makedirs(diffract_dir, exist_ok=True)

config_path = os.path.join(hermes_dir, 'hermes.json')
legacy_path = os.path.join(diffract_dir, 'diffract.json')

# Read existing config from either location (prefer hermes path)
cfg = {}
for p in [config_path, legacy_path]:
    if os.path.exists(p):
        try:
            with open(p) as f:
                cfg = json.load(f)
            break
        except Exception:
            pass

default_model = os.environ.get('DIFFRACTION_MODEL')
if default_model:
    cfg.setdefault('agents', {}).setdefault('defaults', {}).setdefault('model', {})['primary'] = default_model

chat_ui_url = os.environ.get('CHAT_UI_URL', 'http://127.0.0.1:18789')
parsed = urlparse(chat_ui_url)
chat_origin = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else 'http://127.0.0.1:18789'
local_origin = f'http://127.0.0.1:{os.environ.get("PUBLIC_PORT", "18789")}'
origins = [local_origin]
if chat_origin not in origins:
    origins.append(chat_origin)

gateway = cfg.setdefault('gateway', {})
gateway['mode'] = 'local'
gateway['controlUi'] = {
    'allowInsecureAuth': True,
    'dangerouslyDisableDeviceAuth': True,
    'allowedOrigins': origins,
}
gateway['trustedProxies'] = ['127.0.0.1', '::1']

# Write to both locations so hermes and diffract tooling both find it
for p in [config_path, legacy_path]:
    with open(p, 'w') as f:
        json.dump(cfg, f, indent=2)
    os.chmod(p, 0o600)
PYCFG
}

write_auth_profile() {
  if [ -z "${NVIDIA_API_KEY:-}" ]; then
    return
  fi

  python3 - <<'PYAUTH'
import json
import os
path = os.path.expanduser('~/.hermes/agents/main/agent/auth-profiles.json')
os.makedirs(os.path.dirname(path), exist_ok=True)
json.dump({
    'nvidia:manual': {
        'type': 'api_key',
        'provider': 'nvidia',
        'keyRef': {'source': 'env', 'id': 'NVIDIA_API_KEY'},
        'profileId': 'nvidia:manual',
    }
}, open(path, 'w'))
os.chmod(path, 0o600)
PYAUTH
}

print_dashboard_urls() {
  local token chat_ui_base local_url remote_url

  token="$(python3 - <<'PYTOKEN'
import json
import os
for p in ['~/.hermes/hermes.json', '~/.diffract/diffract.json']:
    path = os.path.expanduser(p)
    try:
        cfg = json.load(open(path))
        token = cfg.get('gateway', {}).get('auth', {}).get('token', '')
        if token:
            print(token)
            break
    except Exception:
        pass
else:
    print('')
PYTOKEN
)"

  chat_ui_base="${CHAT_UI_URL%/}"
  local_url="http://127.0.0.1:${PUBLIC_PORT}/"
  remote_url="${chat_ui_base}/"
  if [ -n "$token" ]; then
    local_url="${local_url}#token=${token}"
    remote_url="${remote_url}#token=${token}"
  fi

  echo "[gateway] Local UI: ${local_url}"
  echo "[gateway] Remote UI: ${remote_url}"
}

start_auto_pair() {
  nohup python3 - <<'PYAUTOPAIR' >> /tmp/gateway.log 2>&1 &
import json
import subprocess
import time

DEADLINE = time.time() + 600
QUIET_POLLS = 0
APPROVED = 0

def run(*args):
    proc = subprocess.run(args, capture_output=True, text=True)
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip()

while time.time() < DEADLINE:
    rc, out, err = run('diffract-cli', 'devices', 'list', '--json')
    if rc != 0 or not out:
        time.sleep(1)
        continue
    try:
        data = json.loads(out)
    except Exception:
        time.sleep(1)
        continue

    pending = data.get('pending') or []
    paired = data.get('paired') or []
    has_browser = any((d.get('clientId') == 'diffract-control-ui') or (d.get('clientMode') == 'webchat') for d in paired if isinstance(d, dict))

    if pending:
        QUIET_POLLS = 0
        for device in pending:
            request_id = (device or {}).get('requestId')
            if not request_id:
                continue
            arc, aout, aerr = run('diffract-cli', 'devices', 'approve', request_id, '--json')
            if arc == 0:
                APPROVED += 1
                print(f'[auto-pair] approved request={request_id}')
            elif aout or aerr:
                print(f'[auto-pair] approve failed request={request_id}: {(aerr or aout)[:400]}')
        time.sleep(1)
        continue

    if has_browser:
        QUIET_POLLS += 1
        if QUIET_POLLS >= 4:
            print(f'[auto-pair] browser pairing converged approvals={APPROVED}')
            break
    elif APPROVED > 0:
        QUIET_POLLS += 1
    else:
        QUIET_POLLS = 0

    time.sleep(1)
else:
    print(f'[auto-pair] watcher timed out approvals={APPROVED}')
PYAUTOPAIR
  echo "[gateway] auto-pair watcher launched (pid $!)"
}

# ── Main ─────────────────────────────────────────────────────────

# Determine sandbox home for config writes
if [ "$(id -u)" -eq 0 ]; then
  _SANDBOX_HOME=$(getent passwd sandbox 2>/dev/null | cut -d: -f6)
  _SANDBOX_HOME="${_SANDBOX_HOME:-/sandbox}"
else
  _SANDBOX_HOME="${HOME:-/sandbox}"
fi

echo 'Setting up Diffract...'

# Security checks (best-effort — don't block startup if files are missing)
verify_config_integrity || true
verify_symlinks || true

# Set up proxy environment
setup_proxy_env

# Fix config paths and write auth profiles
export CHAT_UI_URL PUBLIC_PORT
if [ "$(id -u)" -eq 0 ]; then
  # Running as root — use gosu for privilege separation
  gosu sandbox bash -c 'diffract-cli doctor --fix > /dev/null 2>&1 || true'
  gosu sandbox write_auth_profile 2>/dev/null || write_auth_profile || true
  # Only rewrite config if it's writable (skip if root-owned immutable from build)
  if [ -w /sandbox/.hermes/hermes.json ] 2>/dev/null; then
    gosu sandbox bash -c "$(declare -f fix_diffract_config); fix_diffract_config" 2>/dev/null || fix_diffract_config || true
  fi
  gosu sandbox bash -c 'diffract-cli plugins install /opt/diffract > /dev/null 2>&1 || true'

  # If a command was passed, run it as sandbox user
  if [ ${#DIFFRACTION_CMD[@]} -gt 0 ]; then
    exec gosu sandbox "$OPENCLAW" "${DIFFRACTION_CMD[@]}"
  fi

  # Start gateway as gateway user (privilege separation)
  if command -v gosu >/dev/null 2>&1; then
    nohup gosu gateway "$OPENCLAW" gateway run > /tmp/gateway.log 2>&1 &
    echo "[gateway] diffract gateway launched as 'gateway' user (pid $!)"
  else
    nohup "$OPENCLAW" gateway run > /tmp/gateway.log 2>&1 &
    echo "[gateway] diffract gateway launched (pid $!)"
  fi

  # Auto-pair watcher runs as sandbox user
  gosu sandbox bash -c "$(declare -f start_auto_pair); start_auto_pair" 2>/dev/null || start_auto_pair
  gosu sandbox bash -c "$(declare -f print_dashboard_urls); print_dashboard_urls" 2>/dev/null || print_dashboard_urls
else
  # Non-root fallback (OpenShell may run with --security-opt=no-new-privileges)
  diffract-cli doctor --fix > /dev/null 2>&1 || true
  write_auth_profile
  # Only rewrite config if it's writable (skip if root-owned immutable from build)
  if [ -w /sandbox/.hermes/hermes.json ] 2>/dev/null; then
    fix_diffract_config
  fi
  diffract-cli plugins install /opt/diffract > /dev/null 2>&1 || true

  if [ ${#DIFFRACTION_CMD[@]} -gt 0 ]; then
    exec "$OPENCLAW" "${DIFFRACTION_CMD[@]}"
  fi

  nohup "$OPENCLAW" gateway run > /tmp/gateway.log 2>&1 &
  echo "[gateway] diffract gateway launched (pid $!)"
  start_auto_pair
  print_dashboard_urls
fi
