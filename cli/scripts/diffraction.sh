#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Diffraction sandbox entrypoint. Configures Diffraction and starts the dashboard
# gateway inside the sandbox so the forwarded host port has a live upstream.
#
# Optional env:
#   NVIDIA_API_KEY   API key for NVIDIA-hosted inference
#   CHAT_UI_URL      Browser origin that will access the forwarded dashboard

set -euo pipefail

DIFFRACTION_CMD=("$@")
CHAT_UI_URL="${CHAT_UI_URL:-http://127.0.0.1:18789}"
PUBLIC_PORT=18789

fix_diffraction_config() {
  python3 - <<'PYCFG'
import json
import os
from urllib.parse import urlparse

home = os.environ.get('HOME', '/sandbox')
config_path = os.path.join(home, '.diffraction', 'diffraction.json')
os.makedirs(os.path.dirname(config_path), exist_ok=True)

cfg = {}
if os.path.exists(config_path):
    with open(config_path) as f:
        cfg = json.load(f)

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

with open(config_path, 'w') as f:
    json.dump(cfg, f, indent=2)
os.chmod(config_path, 0o600)
PYCFG
}

write_auth_profile() {
  if [ -z "${NVIDIA_API_KEY:-}" ]; then
    return
  fi

  python3 - <<'PYAUTH'
import json
import os
path = os.path.expanduser('~/.diffraction/agents/main/agent/auth-profiles.json')
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
path = os.path.expanduser('~/.diffraction/diffraction.json')
try:
    cfg = json.load(open(path))
except Exception:
    print('')
else:
    print(cfg.get('gateway', {}).get('auth', {}).get('token', ''))
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
    rc, out, err = run('diffraction-cli', 'devices', 'list', '--json')
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
    has_browser = any((d.get('clientId') == 'diffraction-control-ui') or (d.get('clientMode') == 'webchat') for d in paired if isinstance(d, dict))

    if pending:
        QUIET_POLLS = 0
        for device in pending:
            request_id = (device or {}).get('requestId')
            if not request_id:
                continue
            arc, aout, aerr = run('diffraction-cli', 'devices', 'approve', request_id, '--json')
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

echo 'Setting up Diffraction...'
diffraction-cli doctor --fix > /dev/null 2>&1 || true
write_auth_profile
export CHAT_UI_URL PUBLIC_PORT
fix_diffraction_config
diffraction-cli plugins install /opt/diffraction > /dev/null 2>&1 || true

if [ ${#DIFFRACTION_CMD[@]} -gt 0 ]; then
  if [ "${DIFFRACTION_CMD[0]}" = "diffraction" ]; then
    DIFFRACTION_CMD[0]="diffraction-cli"
  fi
  exec "${DIFFRACTION_CMD[@]}"
fi

nohup diffraction-cli gateway run > /tmp/gateway.log 2>&1 &
echo "[gateway] diffraction gateway launched (pid $!)"
start_auto_pair
print_dashboard_urls
