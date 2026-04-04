#!/usr/bin/env bash
# Diffract — root launcher
# Deploy safe, autonomous AI agents with one command.
#
# Usage:
#   ./diffract.sh init            → interactive setup wizard
#   ./diffract.sh agent create    → create a new agent
#   ./diffract.sh agent connect   → connect to a running agent
#   ./diffract.sh agent list      → list all agents
#   ./diffract.sh status          → check system status
#   ./diffract.sh stop            → stop all services
#   ./diffract.sh uninstall       → remove everything

set -euo pipefail

# Resolve the directory of this script (follows symlinks to the real location)
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
CLI_DIR="$SCRIPT_DIR/cli"

# Prereq: Node.js >= 20
if ! command -v node &>/dev/null; then
  echo "Node.js is required but not found."
  echo "   Install it from https://nodejs.org (v20 or later)"
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js v20+ is required. You have v$(node --version)."
  echo "   Upgrade at https://nodejs.org"
  exit 1
fi

# Install CLI dependencies if not present
if [ ! -d "$CLI_DIR/node_modules" ]; then
  echo "Installing CLI dependencies..."
  (cd "$CLI_DIR" && npm install --omit=dev --ignore-scripts)
fi

# Forward all arguments to the Diffract CLI
exec node "$CLI_DIR/bin/diffract.js" "$@"
