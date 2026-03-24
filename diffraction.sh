#!/usr/bin/env bash
# Diffraction — root-level launcher
# Runs from anywhere: ./diffraction.sh [command] [options]
#
# Usage:
#   ./diffraction.sh             → interactive onboarding wizard
#   ./diffraction.sh onboard     → set up a new sandbox
#   ./diffraction.sh start       → start an existing sandbox
#   ./diffraction.sh status      → check sandbox status
#   ./diffraction.sh stop        → stop the active sandbox
#   ./diffraction.sh list        → list all sandboxes
#   ./diffraction.sh uninstall   → remove everything

set -euo pipefail

# Resolve the directory of this script (works even when called via symlink)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$SCRIPT_DIR/cli"

# Prereq: Node.js >= 20
if ! command -v node &>/dev/null; then
  echo "❌ Node.js is required but not found."
  echo "   Install it from https://nodejs.org (v20 or later)"
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "❌ Node.js v20+ is required. You have v$(node --version)."
  echo "   Upgrade at https://nodejs.org"
  exit 1
fi

# Prereq: Docker
if ! command -v docker &>/dev/null; then
  echo "❌ Docker is required but not found."
  echo "   Install Docker Desktop from https://www.docker.com/products/docker-desktop"
  exit 1
fi

# Install CLI dependencies if not present
if [ ! -d "$CLI_DIR/node_modules" ]; then
  echo "📦 Installing CLI dependencies..."
  (cd "$CLI_DIR" && npm install --omit=dev --ignore-scripts)
fi

# Forward all arguments to the Diffraction CLI
exec node "$CLI_DIR/bin/diffraction.js" "$@"
