#!/usr/bin/env bash
# Diffract installer — from zero to running AI agent with one command.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/hrubee/Diffraction/main/install.sh | bash
#
# What this does:
#   1. Installs system dependencies (git, curl) if missing
#   2. Installs Node.js via nvm if missing
#   3. Installs Docker if missing + applies cgroup v2 fix
#   4. Installs OpenShell CLI if missing
#   5. Clones/updates the Diffract repo
#   6. Installs CLI + API + UI dependencies
#   7. Builds the UI
#   8. Creates the `diffract` command
#
# After install, run: diffract onboard

set -euo pipefail

REPO_URL="https://github.com/hrubee/Diffraction.git"
INSTALL_DIR="${DIFFRACT_HOME:-$HOME/.diffract}"
BIN_DIR="/usr/local/bin"
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

echo ""
echo "  Diffract — Enterprise AI Agent Platform"
echo "  ========================================="
echo ""

# ── Helpers ────────────────────────────────────────────────────────

command_exists() { command -v "$1" >/dev/null 2>&1; }

ensure_sudo() {
  if [ "$(id -u)" -ne 0 ]; then
    if ! command_exists sudo; then
      echo "  ERROR: This script needs root access. Run as root or install sudo."
      exit 1
    fi
    SUDO="sudo"
  else
    SUDO=""
  fi
}

# ── 1. System dependencies ────────────────────────────────────────

echo "  [1/8] Checking system dependencies..."
ensure_sudo

if ! command_exists git || ! command_exists curl; then
  echo "  Installing git and curl..."
  if command_exists apt-get; then
    $SUDO apt-get update -qq && $SUDO apt-get install -y -qq git curl >/dev/null 2>&1
  elif command_exists yum; then
    $SUDO yum install -y git curl >/dev/null 2>&1
  elif command_exists dnf; then
    $SUDO dnf install -y git curl >/dev/null 2>&1
  elif command_exists brew; then
    brew install git curl >/dev/null 2>&1
  else
    echo "  ERROR: Could not install git/curl. Install them manually."
    exit 1
  fi
fi
echo "  ✓ git and curl available"

# ── 2. Node.js (via nvm) ──────────────────────────────────────────

echo "  [2/8] Checking Node.js..."

# Load nvm if already installed
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

if ! command_exists node || [ "$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)" -lt 20 ] 2>/dev/null; then
  echo "  Installing Node.js 22 via nvm..."
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    \. "$NVM_DIR/nvm.sh"
  fi
  nvm install 22 >/dev/null 2>&1
  nvm use 22 >/dev/null 2>&1
  nvm alias default 22 >/dev/null 2>&1

  # Persist nvm in shell profile
  for profile in "$HOME/.bashrc" "$HOME/.zshrc"; do
    if [ -f "$profile" ] && ! grep -q "NVM_DIR" "$profile" 2>/dev/null; then
      echo 'export NVM_DIR="$HOME/.nvm"' >> "$profile"
      echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> "$profile"
    fi
  done
fi
echo "  ✓ Node.js $(node -v)"

# ── 3. Docker ─────────────────────────────────────────────────────

echo "  [3/8] Checking Docker..."

if ! command_exists docker; then
  echo "  Installing Docker..."
  if [ "$(uname)" = "Darwin" ]; then
    if command_exists brew; then
      brew install --cask docker-desktop 2>/dev/null || true
      open -a Docker 2>/dev/null || true
    else
      echo "  Install Docker Desktop from https://docker.com/get-docker"
      exit 1
    fi
  else
    curl -fsSL https://get.docker.com | $SUDO sh
    $SUDO usermod -aG docker "$(whoami)" 2>/dev/null || true
  fi
fi

# Ensure Docker is running
if ! docker info >/dev/null 2>&1; then
  echo "  Starting Docker..."
  $SUDO systemctl start docker 2>/dev/null || true
  $SUDO systemctl enable docker 2>/dev/null || true
  for i in $(seq 1 40); do
    docker info >/dev/null 2>&1 && break
    sleep 3
    [ $((i % 5)) -eq 0 ] && echo "  Still waiting for Docker... (${i}s)"
  done
fi

if ! docker info >/dev/null 2>&1; then
  echo "  ERROR: Docker is not running. Start it manually and re-run this script."
  exit 1
fi

# Apply cgroup v2 fix for Ubuntu 24.04+ (required by OpenShell)
if [ "$(uname)" != "Darwin" ]; then
  if [ ! -f /etc/docker/daemon.json ] || ! grep -q "cgroupns" /etc/docker/daemon.json 2>/dev/null; then
    echo "  Applying cgroup v2 fix..."
    echo '{"default-cgroupns-mode": "host"}' | $SUDO tee /etc/docker/daemon.json >/dev/null
    $SUDO systemctl restart docker 2>/dev/null || true
    sleep 3
  fi
fi
echo "  ✓ Docker $(docker --version | grep -oP '\d+\.\d+\.\d+')"

# ── 4. OpenShell CLI ──────────────────────────────────────────────

echo "  [4/8] Checking OpenShell CLI..."

export PATH="$PATH:$HOME/.local/bin"

if ! command_exists openshell; then
  echo "  Installing OpenShell CLI (v0.0.21 — v0.0.22 has port forward regression)..."
  # Pin to v0.0.21: v0.0.22 SSH port forwarding returns empty replies
  curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | OPENSHELL_VERSION=v0.0.21 sh
  export PATH="$PATH:$HOME/.local/bin"

  # Persist PATH
  for profile in "$HOME/.bashrc" "$HOME/.zshrc"; do
    if [ -f "$profile" ] && ! grep -q '\.local/bin' "$profile" 2>/dev/null; then
      echo 'export PATH="$PATH:$HOME/.local/bin"' >> "$profile"
    fi
  done
fi
echo "  ✓ OpenShell $(openshell --version 2>/dev/null || echo 'installed')"

# ── 5. Clone/update Diffract ──────────────────────────────────────

echo "  [5/8] Setting up Diffract..."

if [ -d "$INSTALL_DIR/repo" ]; then
  echo "  Updating existing installation..."
  (cd "$INSTALL_DIR/repo" && git pull --rebase --quiet 2>/dev/null || true)
else
  mkdir -p "$INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR/repo"
fi

# ── 6. Install dependencies ──────────────────────────────────────

echo "  [6/8] Installing dependencies..."

(cd "$INSTALL_DIR/repo/cli" && npm install --ignore-scripts --silent 2>/dev/null)
(cd "$INSTALL_DIR/repo/api" && npm install --silent 2>/dev/null)
(cd "$INSTALL_DIR/repo/ui" && npm install --silent 2>/dev/null)

# ── 7. Build UI ───────────────────────────────────────────────────

echo "  [7/8] Building dashboard UI..."

(cd "$INSTALL_DIR/repo/ui" && npm run build 2>/dev/null)

# ── 8. Create diffract command ────────────────────────────────────

echo "  [8/8] Creating diffract command..."

WRAPPER="$BIN_DIR/diffract"
WRAPPER_CONTENT="#!/usr/bin/env bash
set -euo pipefail
export NVM_DIR=\"\${NVM_DIR:-\$HOME/.nvm}\"
[ -s \"\$NVM_DIR/nvm.sh\" ] && \\. \"\$NVM_DIR/nvm.sh\"
export PATH=\"\$PATH:\$HOME/.local/bin\"
DIFFRACT_HOME=\"\${DIFFRACT_HOME:-\$HOME/.diffract}\"
exec \"\$DIFFRACT_HOME/repo/diffract.sh\" \"\$@\"
"

if [ -w "$BIN_DIR" ]; then
  echo "$WRAPPER_CONTENT" > "$WRAPPER"
  chmod +x "$WRAPPER"
else
  echo "$WRAPPER_CONTENT" | $SUDO tee "$WRAPPER" >/dev/null
  $SUDO chmod +x "$WRAPPER"
fi

echo ""
echo "  ========================================="
echo "  Diffract installed successfully!"
echo "  ========================================="
echo ""
echo "  Next step — set up your first agent:"
echo ""
echo "    diffract onboard"
echo ""
echo "  Other commands:"
echo "    diffract --help"
echo "    diffract list"
echo "    diffract doctor"
echo ""
