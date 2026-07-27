#!/usr/bin/env bash
set -euo pipefail

UUID='spotify-control-centre@harry'
DEST_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

gnome-extensions disable "$UUID" 2>/dev/null || true
rm -rf "$DEST_DIR"

echo "Removed $UUID"
echo "Log out and back in to finish removing it."
