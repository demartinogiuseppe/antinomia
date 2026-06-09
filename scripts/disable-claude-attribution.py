"""
Antinomia — Disable Claude Code attribution in commits and PRs.

Sets `attribution.commit = ""` and `attribution.pr = ""` in ~/.claude/settings.json.
Safe: preserves any other existing settings, creates a timestamped backup before writing.

Usage in Git Bash from repo root:
    python scripts/disable-claude-attribution.py
"""
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

settings_path = Path.home() / ".claude" / "settings.json"
settings_path.parent.mkdir(parents=True, exist_ok=True)

if settings_path.exists():
    try:
        data = json.loads(settings_path.read_text(encoding="utf-8"))
        print(f"[INFO] Found existing settings.json with keys: {list(data.keys())}")
    except json.JSONDecodeError as e:
        print(f"[WARN] Existing {settings_path} is not valid JSON ({e}). Backing up and starting fresh.")
        shutil.copy2(settings_path, f"{settings_path}.broken.{datetime.now():%Y%m%d_%H%M%S}")
        data = {}
else:
    print(f"[INFO] No existing settings.json — will create new at {settings_path}")
    data = {}

# Backup before any modification
if settings_path.exists():
    backup = f"{settings_path}.bak.{datetime.now():%Y%m%d_%H%M%S}"
    shutil.copy2(settings_path, backup)
    print(f"[OK] Backup saved: {backup}")

# Merge — don't overwrite other unrelated keys
data.setdefault("attribution", {})
data["attribution"]["commit"] = ""
data["attribution"]["pr"] = ""

settings_path.write_text(
    json.dumps(data, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8",
)

print(f"\n[OK] Updated: {settings_path}")
print("[OK] Final content:")
print(json.dumps(data, indent=2, ensure_ascii=False))
print("\n--- Next: open a NEW Claude Code session (restart VSCode or new chat) for the setting to take effect. ---")
