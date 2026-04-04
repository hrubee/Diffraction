#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib/live-docker-auth.sh"
IMAGE_NAME="${DIFFRACTION_IMAGE:-diffraction:local}"
LIVE_IMAGE_NAME="${DIFFRACTION_LIVE_IMAGE:-${IMAGE_NAME}-live}"
CONFIG_DIR="${DIFFRACTION_CONFIG_DIR:-$HOME/.diffraction}"
WORKSPACE_DIR="${DIFFRACTION_WORKSPACE_DIR:-$HOME/.diffraction/workspace}"
PROFILE_FILE="${DIFFRACTION_PROFILE_FILE:-$HOME/.profile}"

PROFILE_MOUNT=()
if [[ -f "$PROFILE_FILE" ]]; then
  PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/node/.profile:ro)
fi

AUTH_DIRS=()
if [[ -n "${DIFFRACTION_DOCKER_AUTH_DIRS:-}" ]]; then
  while IFS= read -r auth_dir; do
    [[ -n "$auth_dir" ]] || continue
    AUTH_DIRS+=("$auth_dir")
  done < <(diffraction_live_collect_auth_dirs)
elif [[ -n "${DIFFRACTION_LIVE_GATEWAY_PROVIDERS:-}" ]]; then
  while IFS= read -r auth_dir; do
    [[ -n "$auth_dir" ]] || continue
    AUTH_DIRS+=("$auth_dir")
  done < <(diffraction_live_collect_auth_dirs_from_csv "${DIFFRACTION_LIVE_GATEWAY_PROVIDERS:-}")
else
  while IFS= read -r auth_dir; do
    [[ -n "$auth_dir" ]] || continue
    AUTH_DIRS+=("$auth_dir")
  done < <(diffraction_live_collect_auth_dirs)
fi
AUTH_DIRS_CSV="$(diffraction_live_join_csv "${AUTH_DIRS[@]}")"

EXTERNAL_AUTH_MOUNTS=()
for auth_dir in "${AUTH_DIRS[@]}"; do
  host_path="$HOME/$auth_dir"
  if [[ -d "$host_path" ]]; then
    EXTERNAL_AUTH_MOUNTS+=(-v "$host_path":/host-auth/"$auth_dir":ro)
  fi
done

read -r -d '' LIVE_TEST_CMD <<'EOF' || true
set -euo pipefail
[ -f "$HOME/.profile" ] && source "$HOME/.profile" || true
IFS=',' read -r -a auth_dirs <<<"${DIFFRACTION_DOCKER_AUTH_DIRS_RESOLVED:-}"
for auth_dir in "${auth_dirs[@]}"; do
  [ -n "$auth_dir" ] || continue
  if [ -d "/host-auth/$auth_dir" ]; then
    mkdir -p "$HOME/$auth_dir"
    cp -R "/host-auth/$auth_dir/." "$HOME/$auth_dir"
    chmod -R u+rwX "$HOME/$auth_dir" || true
  fi
done
tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT
tar -C /src \
  --exclude=.git \
  --exclude=node_modules \
  --exclude=dist \
  --exclude=ui/dist \
  --exclude=ui/node_modules \
  -cf - . | tar -C "$tmp_dir" -xf -
ln -s /app/node_modules "$tmp_dir/node_modules"
ln -s /app/dist "$tmp_dir/dist"
if [ -d /app/dist-runtime/extensions ]; then
  export DIFFRACTION_BUNDLED_PLUGINS_DIR=/app/dist-runtime/extensions
elif [ -d /app/dist/extensions ]; then
  export DIFFRACTION_BUNDLED_PLUGINS_DIR=/app/dist/extensions
fi
cd "$tmp_dir"
pnpm test:live
EOF

echo "==> Build live-test image: $LIVE_IMAGE_NAME (target=build)"
docker build --target build -t "$LIVE_IMAGE_NAME" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"

echo "==> Run gateway live model tests (profile keys)"
echo "==> External auth dirs: ${AUTH_DIRS_CSV:-none}"
docker run --rm -t \
  --entrypoint bash \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e HOME=/home/node \
  -e NODE_OPTIONS=--disable-warning=ExperimentalWarning \
  -e DIFFRACTION_DOCKER_AUTH_DIRS_RESOLVED="$AUTH_DIRS_CSV" \
  -e DIFFRACTION_LIVE_TEST=1 \
  -e DIFFRACTION_LIVE_GATEWAY_MODELS="${DIFFRACTION_LIVE_GATEWAY_MODELS:-modern}" \
  -e DIFFRACTION_LIVE_GATEWAY_PROVIDERS="${DIFFRACTION_LIVE_GATEWAY_PROVIDERS:-}" \
  -e DIFFRACTION_LIVE_GATEWAY_MAX_MODELS="${DIFFRACTION_LIVE_GATEWAY_MAX_MODELS:-24}" \
  -e DIFFRACTION_LIVE_GATEWAY_MODEL_TIMEOUT_MS="${DIFFRACTION_LIVE_GATEWAY_MODEL_TIMEOUT_MS:-}" \
  -v "$ROOT_DIR":/src:ro \
  -v "$CONFIG_DIR":/home/node/.diffraction \
  -v "$WORKSPACE_DIR":/home/node/.diffraction/workspace \
  "${EXTERNAL_AUTH_MOUNTS[@]}" \
  "${PROFILE_MOUNT[@]}" \
  "$LIVE_IMAGE_NAME" \
  -lc "$LIVE_TEST_CMD"
