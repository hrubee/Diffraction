#!/usr/bin/env bash
# sync-upstream.sh — Pull latest changes from upstream projects into Diffract.
#
# Upstream mapping:
#   OpenShell  (engine)  → crates/, proto/, deploy/, docs/
#   OpenClaw   (agent)   → agent/
#   Diffraction (cli)    → cli/
#
# Usage:
#   ./scripts/sync-upstream.sh              # Sync all three
#   ./scripts/sync-upstream.sh openshell    # Sync only OpenShell
#   ./scripts/sync-upstream.sh openclaw     # Sync only OpenClaw
#   ./scripts/sync-upstream.sh diffraction  # Sync only Diffraction CLI
#
# What it does:
#   1. Fetches the latest from each upstream remote
#   2. Checks out upstream files into a temp branch
#   3. Copies them into Diffract's directory structure
#   4. Applies the openshell→diffract rename
#   5. Creates a commit on your current branch
#
# Requirements: git, sed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ── Upstream repos ──────────────────────────────────────────────
OPENSHELL_REPO="https://github.com/NVIDIA/OpenShell.git"
OPENCLAW_REPO="https://github.com/openclaw/openclaw.git"
DIFFRACTION_REPO="https://github.com/NVIDIA/Diffraction.git"

# ── Helpers ─────────────────────────────────────────────────────

add_remote_if_missing() {
  local name="$1" url="$2"
  if ! git remote get-url "$name" &>/dev/null; then
    echo "  Adding remote: $name → $url"
    git remote add "$name" "$url"
  fi
}

rename_openshell_to_diffract() {
  local dir="$1"
  echo "  Renaming openshell → diffract in $dir..."

  # Cargo.toml crate names
  find "$dir" -name "Cargo.toml" -exec sed -i '' \
    -e 's/openshell-cli/diffract-cli/g' \
    -e 's/openshell-server/diffract-gateway/g' \
    -e 's/openshell-sandbox/diffract-sandbox/g' \
    -e 's/openshell-policy/diffract-policy/g' \
    -e 's/openshell-router/diffract-router/g' \
    -e 's/openshell-providers/diffract-providers/g' \
    -e 's/openshell-bootstrap/diffract-bootstrap/g' \
    -e 's/openshell-core/diffract-core/g' \
    -e 's/openshell-ocsf/diffract-ocsf/g' \
    -e 's/openshell-tui/diffract-tui/g' \
    -e 's|github.com/NVIDIA/OpenShell|github.com/hrubee/Diffract|g' \
    {} + 2>/dev/null

  # Rust source: module paths and types
  find "$dir" -name "*.rs" -exec sed -i '' \
    -e 's/openshell_cli/diffract_cli/g' \
    -e 's/openshell_server/diffract_gateway/g' \
    -e 's/openshell_sandbox/diffract_sandbox/g' \
    -e 's/openshell_policy/diffract_policy/g' \
    -e 's/openshell_router/diffract_router/g' \
    -e 's/openshell_providers/diffract_providers/g' \
    -e 's/openshell_bootstrap/diffract_bootstrap/g' \
    -e 's/openshell_core/diffract_core/g' \
    -e 's/openshell_ocsf/diffract_ocsf/g' \
    -e 's/openshell_tui/diffract_tui/g' \
    -e 's/OpenShell/Diffract/g' \
    -e 's/openshell/diffract/g' \
    {} + 2>/dev/null

  # Proto files
  find "$dir" -name "*.proto" -exec sed -i '' \
    -e 's/openshell\.v1/diffract.v1/g' \
    -e 's/OpenShell/Diffract/g' \
    -e 's/openshell/diffract/g' \
    {} + 2>/dev/null

  # Non-Rust files (rego, sql, yaml, md, sh, json)
  find "$dir" -type f \( -name "*.rego" -o -name "*.sql" -o -name "*.md" \
    -o -name "*.yaml" -o -name "*.yml" -o -name "*.json" -o -name "*.sh" \) \
    -exec sed -i '' \
    -e 's/openshell/diffract/g' \
    -e 's/OpenShell/Diffract/g' \
    {} + 2>/dev/null
}

rename_openclaw_to_diffract() {
  local dir="$1"
  echo "  Renaming openclaw → diffract in $dir..."

  find "$dir" -type f \( -name "*.ts" -o -name "*.js" -o -name "*.json" \
    -o -name "*.md" -o -name "*.yaml" -o -name "*.yml" \) \
    -exec sed -i '' \
    -e 's/openclaw/diffract/g' \
    -e 's/OpenClaw/Diffract/g' \
    {} + 2>/dev/null
}

rename_diffraction_to_diffract() {
  local dir="$1"
  echo "  Renaming diffraction → diffract in $dir..."

  find "$dir" -type f \( -name "*.js" -o -name "*.json" -o -name "*.sh" \
    -o -name "*.md" -o -name "*.yaml" \) \
    -exec sed -i '' \
    -e 's/diffraction/diffract/g' \
    -e 's/Diffraction/Diffract/g' \
    -e 's/openshell/diffract/g' \
    -e 's/OpenShell/Diffract/g' \
    -e 's/openclaw/diffract/g' \
    {} + 2>/dev/null
}

# ── Sync functions ──────────────────────────────────────────────

sync_openshell() {
  echo ""
  echo "═══ Syncing OpenShell (engine) ═══"
  add_remote_if_missing "upstream-openshell" "$OPENSHELL_REPO"
  git fetch upstream-openshell --quiet 2>/dev/null || {
    echo "  Warning: Could not fetch from $OPENSHELL_REPO"
    echo "  The repo may be private or the URL may have changed."
    echo "  Skipping OpenShell sync."
    return 0
  }

  # Use a temp dir to avoid conflicts
  local tmpdir
  tmpdir=$(mktemp -d)
  git archive upstream-openshell/main | tar -x -C "$tmpdir" 2>/dev/null || {
    echo "  Warning: Could not archive upstream-openshell/main. Trying 'master'..."
    git archive upstream-openshell/master | tar -x -C "$tmpdir" 2>/dev/null || {
      echo "  Could not find main or master branch. Skipping."
      rm -rf "$tmpdir"
      return 0
    }
  }

  # Map upstream dirs to Diffract dirs
  if [ -d "$tmpdir/crates" ]; then
    # Upstream has crates/ at root — copy each crate with renamed dir
    for crate_dir in "$tmpdir"/crates/openshell-*; do
      local crate_name
      crate_name=$(basename "$crate_dir")
      local new_name="${crate_name/openshell-/diffract-}"
      # openshell-server → diffract-gateway (special case)
      new_name="${new_name/diffract-server/diffract-gateway}"
      echo "  Updating crates/$new_name..."
      rm -rf "crates/$new_name"
      cp -R "$crate_dir" "crates/$new_name"
    done
  fi

  if [ -d "$tmpdir/proto" ]; then
    echo "  Updating proto/..."
    cp "$tmpdir"/proto/*.proto proto/ 2>/dev/null
    # Rename the proto file
    [ -f "proto/openshell.proto" ] && mv "proto/openshell.proto" "proto/diffract.proto"
  fi

  if [ -d "$tmpdir/deploy" ]; then
    echo "  Updating deploy/..."
    cp -R "$tmpdir/deploy/"* deploy/ 2>/dev/null
    # Rename helm chart dir if needed
    [ -d "deploy/helm/openshell" ] && mv "deploy/helm/openshell" "deploy/helm/diffract"
  fi

  if [ -d "$tmpdir/docs" ] || [ -d "$tmpdir/architecture" ]; then
    echo "  Updating docs/..."
    [ -d "$tmpdir/docs" ] && cp -R "$tmpdir/docs/"* docs/ 2>/dev/null
    [ -d "$tmpdir/architecture" ] && cp -R "$tmpdir/architecture/"* docs/ 2>/dev/null
  fi

  # Apply renames
  rename_openshell_to_diffract "crates/"
  rename_openshell_to_diffract "proto/"
  rename_openshell_to_diffract "deploy/"
  rename_openshell_to_diffract "docs/"

  rm -rf "$tmpdir"
  echo "  ✓ OpenShell sync complete"
}

sync_openclaw() {
  echo ""
  echo "═══ Syncing OpenClaw (agent) ═══"
  add_remote_if_missing "upstream-openclaw" "$OPENCLAW_REPO"
  git fetch upstream-openclaw --quiet 2>/dev/null || {
    echo "  Warning: Could not fetch from $OPENCLAW_REPO"
    echo "  Skipping OpenClaw sync."
    return 0
  }

  local tmpdir
  tmpdir=$(mktemp -d)
  git archive upstream-openclaw/main | tar -x -C "$tmpdir" 2>/dev/null || {
    git archive upstream-openclaw/master | tar -x -C "$tmpdir" 2>/dev/null || {
      echo "  Could not find main or master branch. Skipping."
      rm -rf "$tmpdir"
      return 0
    }
  }

  # Sync agent source — preserve our package.json and entry point
  echo "  Updating agent/src/..."
  [ -d "$tmpdir/src" ] && cp -R "$tmpdir/src/"* agent/src/ 2>/dev/null
  [ -d "$tmpdir/extensions" ] && cp -R "$tmpdir/extensions/"* agent/extensions/ 2>/dev/null
  [ -d "$tmpdir/skills" ] && cp -R "$tmpdir/skills/"* agent/skills/ 2>/dev/null

  rename_openclaw_to_diffract "agent/"

  rm -rf "$tmpdir"
  echo "  ✓ OpenClaw sync complete"
}

sync_diffraction() {
  echo ""
  echo "═══ Syncing Diffraction (CLI) ═══"
  add_remote_if_missing "upstream-diffraction" "$DIFFRACTION_REPO"
  git fetch upstream-diffraction --quiet 2>/dev/null || {
    echo "  Warning: Could not fetch from $DIFFRACTION_REPO"
    echo "  Skipping Diffraction sync."
    return 0
  }

  local tmpdir
  tmpdir=$(mktemp -d)
  git archive upstream-diffraction/main | tar -x -C "$tmpdir" 2>/dev/null || {
    git archive upstream-diffraction/master | tar -x -C "$tmpdir" 2>/dev/null || {
      echo "  Could not find main or master branch. Skipping."
      rm -rf "$tmpdir"
      return 0
    }
  }

  # Sync CLI lib files — preserve our diffract.js entry point
  echo "  Updating cli/bin/lib/..."
  [ -d "$tmpdir/cli/bin/lib" ] && cp -R "$tmpdir/cli/bin/lib/"* cli/bin/lib/ 2>/dev/null

  # Sync policies
  if [ -d "$tmpdir/cli/diffraction-blueprint/policies/presets" ]; then
    echo "  Updating policies/presets/..."
    cp "$tmpdir/cli/diffraction-blueprint/policies/presets/"*.yaml policies/presets/ 2>/dev/null
  fi

  rename_diffraction_to_diffract "cli/"
  rename_diffraction_to_diffract "policies/"

  rm -rf "$tmpdir"
  echo "  ✓ Diffraction sync complete"
}

# ── Main ────────────────────────────────────────────────────────

echo "Diffract — Upstream Sync"
echo "════════════════════════"

TARGET="${1:-all}"

case "$TARGET" in
  openshell)   sync_openshell ;;
  openclaw)    sync_openclaw ;;
  diffraction) sync_diffraction ;;
  all)
    sync_openshell
    sync_openclaw
    sync_diffraction
    ;;
  *)
    echo "Usage: $0 [openshell|openclaw|diffraction|all]"
    exit 1
    ;;
esac

echo ""
echo "═══ Sync complete ═══"
echo ""
echo "Review changes with:  git diff --stat"
echo "Commit with:          git add -A && git commit -m 'sync: pull latest from upstream'"
