#!/usr/bin/env bash
set -euo pipefail

# RELEASE_REPO_URL: the default REPO_URL baked into the hosted install.sh so that
# end users only need one command:  bash <(curl -fsSL https://diffraction.in/install.sh)
# The hosted copy will default to fetching the tarball from this URL instead of the
# private GitHub repo.  Override per release with:
#   RELEASE_REPO_URL=https://other/diffract.tar.gz bash scripts/build-release.sh
RELEASE_REPO_URL="${RELEASE_REPO_URL:-https://diffraction.in/diffract.tar.gz}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

mkdir -p website

# Build slim tarball using export-ignore rules from .gitattributes
git archive --format=tar.gz \
  --prefix=diffract/ \
  --worktree-attributes \
  -o website/diffract.tar.gz \
  HEAD

# Emit hosted install.sh with REPO_URL default pointing to the release tarball
# (not the private GitHub repo).  Source install.sh is left unchanged.
sed 's|https://github.com/hrubee/Diffraction.git|'"$RELEASE_REPO_URL"'|' install.sh > website/install.sh
chmod +x website/install.sh

# Compute sha256 (macOS: shasum -a 256; Linux: sha256sum)
if command -v sha256sum &>/dev/null; then
  TARBALL_HASH="$(sha256sum website/diffract.tar.gz | awk '{print $1}')"
else
  TARBALL_HASH="$(shasum -a 256 website/diffract.tar.gz | awk '{print $1}')"
fi

TARBALL_SIZE="$(du -sh website/diffract.tar.gz | awk '{print $1}')"
INSTALL_SIZE="$(du -sh website/install.sh | awk '{print $1}')"

echo "Built website/diffract.tar.gz ($TARBALL_SIZE, sha256 $TARBALL_HASH)"
echo "Built website/install.sh ($INSTALL_SIZE, REPO_URL baked to $RELEASE_REPO_URL)"
echo ""
echo "Upload both to your domain root, then users can run:"
echo "  bash <(curl -fsSL https://diffraction.in/install.sh)"
