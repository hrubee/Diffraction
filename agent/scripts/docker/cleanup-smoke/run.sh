#!/usr/bin/env bash
set -euo pipefail

cd /repo

export DIFFRACTION_STATE_DIR="/tmp/diffraction-test"
export DIFFRACTION_CONFIG_PATH="${DIFFRACTION_STATE_DIR}/diffraction.json"

echo "==> Build"
pnpm build

echo "==> Seed state"
mkdir -p "${DIFFRACTION_STATE_DIR}/credentials"
mkdir -p "${DIFFRACTION_STATE_DIR}/agents/main/sessions"
echo '{}' >"${DIFFRACTION_CONFIG_PATH}"
echo 'creds' >"${DIFFRACTION_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${DIFFRACTION_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
pnpm diffraction reset --scope config+creds+sessions --yes --non-interactive

test ! -f "${DIFFRACTION_CONFIG_PATH}"
test ! -d "${DIFFRACTION_STATE_DIR}/credentials"
test ! -d "${DIFFRACTION_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${DIFFRACTION_STATE_DIR}/credentials"
echo '{}' >"${DIFFRACTION_CONFIG_PATH}"

echo "==> Uninstall (state only)"
pnpm diffraction uninstall --state --yes --non-interactive

test ! -d "${DIFFRACTION_STATE_DIR}"

echo "OK"
