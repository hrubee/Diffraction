#!/usr/bin/env bash
# patch-standalone-timeouts.sh — prepend HTTP timeout overrides to Next.js'
# standalone server.js so it can receive long-running uploads (5 GB takes
# ~8+ minutes over a typical residential link, well past Node's default
# 300-second requestTimeout).
#
# Idempotent: detects its own marker and skips if already applied.
#
# Usage:
#   bash patch-standalone-timeouts.sh <install-dir>
#
# Default install-dir: /opt/diffract-ui

set -euo pipefail

INSTALL_DIR="${1:-/opt/diffract-ui}"
SERVER_JS="${INSTALL_DIR}/.next/standalone/server.js"
MARKER="// __DIFFRACT_TIMEOUT_PATCH__"

if [ ! -f "$SERVER_JS" ]; then
  echo "[patch] $SERVER_JS not found — run 'npm run build' first" >&2
  exit 1
fi

if head -1 "$SERVER_JS" | grep -qF "$MARKER"; then
  echo "[patch] already applied to $SERVER_JS"
  exit 0
fi

TMP="$(mktemp)"
cat > "$TMP" <<EOF
${MARKER}
// Disable Node.js default request/headers timeouts so the standalone server
// can handle multi-GB streaming uploads (POST /api/files/upload).
// Node's default requestTimeout (300s) cuts off requests that take longer
// to receive than the limit, regardless of progress.
(function () {
  const http = require('http');
  const origCreate = http.createServer;
  http.createServer = function (...args) {
    const server = origCreate.apply(this, args);
    server.requestTimeout = 0;
    server.headersTimeout = 0;
    server.timeout = 0;
    return server;
  };
})();

EOF
cat "$SERVER_JS" >> "$TMP"
mv "$TMP" "$SERVER_JS"

echo "[patch] applied to $SERVER_JS"
