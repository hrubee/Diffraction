#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

mkdir -p website

# Build slim tarball using export-ignore rules from .gitattributes
git archive --format=tar.gz \
  --prefix=diffract/ \
  --worktree-attributes \
  -o website/diffract.tar.gz \
  HEAD

# Copy install.sh to website root
cp install.sh website/install.sh

# Compute sha256 (macOS: shasum -a 256; Linux: sha256sum)
if command -v sha256sum &>/dev/null; then
  TARBALL_HASH="$(sha256sum website/diffract.tar.gz | awk '{print $1}')"
else
  TARBALL_HASH="$(shasum -a 256 website/diffract.tar.gz | awk '{print $1}')"
fi

TARBALL_SIZE="$(du -sh website/diffract.tar.gz | awk '{print $1}')"
INSTALL_SIZE="$(du -sh website/install.sh | awk '{print $1}')"

echo "Built website/diffract.tar.gz ($TARBALL_SIZE, sha256 $TARBALL_HASH)"
echo "Built website/install.sh ($INSTALL_SIZE)"
echo ""
echo "Upload both to your domain root, then:"
echo "  curl -fsSL https://<domain>/install.sh | DIFFRACT_REPO_URL=https://<domain>/diffract.tar.gz DIFFRACT_DOMAIN=<your-domain> bash"
