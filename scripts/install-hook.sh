#!/usr/bin/env bash
# Antinomia — One-shot installer for the anti-Claude-attribution commit-msg hook.
# Installs in TWO places:
#   1. Local repo: .git/hooks/prepare-commit-msg          (for this repo immediately)
#   2. Global:     ~/.config/git/hooks/prepare-commit-msg (for ALL repos forever)
#
# Usage in Git Bash from repo root:
#   bash scripts/install-hook.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SRC="$SCRIPT_DIR/prepare-commit-msg"

if [ ! -f "$HOOK_SRC" ]; then
  echo "ERROR: prepare-commit-msg not found at $HOOK_SRC"
  exit 1
fi

# --- 1. Local repo hook ---
if [ -d ".git/hooks" ]; then
  cp "$HOOK_SRC" .git/hooks/prepare-commit-msg
  chmod +x .git/hooks/prepare-commit-msg
  echo "[OK] Local repo hook installed: .git/hooks/prepare-commit-msg"
else
  echo "[SKIP] No .git/hooks/ found in current dir (not in repo root?)"
fi

# --- 2. Global hooks dir ---
GLOBAL_DIR="$HOME/.config/git/hooks"
mkdir -p "$GLOBAL_DIR"
cp "$HOOK_SRC" "$GLOBAL_DIR/prepare-commit-msg"
chmod +x "$GLOBAL_DIR/prepare-commit-msg"
echo "[OK] Global hook installed: $GLOBAL_DIR/prepare-commit-msg"

# --- 3. Point git at the global hooks dir (for ALL future repos) ---
git config --global core.hooksPath "$GLOBAL_DIR"
echo "[OK] git core.hooksPath set globally to $GLOBAL_DIR"

# --- 4. Verify ---
echo ""
echo "--- Verification ---"
echo "git config --global core.hooksPath: $(git config --global core.hooksPath)"
echo "Hook exists at: $GLOBAL_DIR/prepare-commit-msg"
ls -la "$GLOBAL_DIR/prepare-commit-msg"
echo ""
echo "Done. Test with: echo -e 'test\n\nCo-Authored-By: Claude <noreply@anthropic.com>' > /tmp/m.txt && bash $GLOBAL_DIR/prepare-commit-msg /tmp/m.txt && cat /tmp/m.txt"
