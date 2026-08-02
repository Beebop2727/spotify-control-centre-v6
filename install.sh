#!/usr/bin/env bash
set -euo pipefail

UUID='spotify-control-centre@harry'
SCHEMA='org.gnome.shell.extensions.spotify-control-centre'
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/$UUID"
DEST_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

if [[ ! -d "$SOURCE_DIR" ]]; then
    echo "Missing source directory: $SOURCE_DIR" >&2
    exit 1
fi

if ! command -v glib-compile-schemas >/dev/null 2>&1; then
    echo "glib-compile-schemas is required (Ubuntu package: libglib2.0-bin)." >&2
    exit 1
fi

mkdir -p "$(dirname "$DEST_DIR")"

if [[ -d "$DEST_DIR" ]]; then
    BACKUP_DIR="${DEST_DIR}.bak-$(date +%Y%m%d-%H%M%S)"
    mv "$DEST_DIR" "$BACKUP_DIR"
    echo "Existing custom extension backed up to: $BACKUP_DIR"
fi

cp -a "$SOURCE_DIR" "$DEST_DIR"
glib-compile-schemas "$DEST_DIR/schemas"

# Apply the V7 compact layout and visual preset even when older GSettings values exist.
GSETTINGS=(gsettings --schemadir "$DEST_DIR/schemas")
"${GSETTINGS[@]}" set "$SCHEMA" bg-mode 'ambient'
"${GSETTINGS[@]}" set "$SCHEMA" custom-bg-color '#180f16'
"${GSETTINGS[@]}" set "$SCHEMA" header-font-size 12
"${GSETTINGS[@]}" set "$SCHEMA" header-text-color '#ffffff'
"${GSETTINGS[@]}" set "$SCHEMA" slider-style 'wavy'
"${GSETTINGS[@]}" set "$SCHEMA" slider-color '#ffffff'
"${GSETTINGS[@]}" set "$SCHEMA" slider-track-color 'rgba(255, 255, 255, 0.30)'
"${GSETTINGS[@]}" set "$SCHEMA" thumb-color '#ffffff'
"${GSETTINGS[@]}" set "$SCHEMA" button-spacing 1
"${GSETTINGS[@]}" set "$SCHEMA" label-margin 3
"${GSETTINGS[@]}" set "$SCHEMA" panel-label-width 170
"${GSETTINGS[@]}" set "$SCHEMA" marquee-enabled true
"${GSETTINGS[@]}" set "$SCHEMA" marquee-speed 32
"${GSETTINGS[@]}" set "$SCHEMA" cover-art-size 300
"${GSETTINGS[@]}" set "$SCHEMA" cover-art-radius 14
"${GSETTINGS[@]}" set "$SCHEMA" popup-icon-size 24
"${GSETTINGS[@]}" set "$SCHEMA" art-rotate-speed 0
"${GSETTINGS[@]}" set "$SCHEMA" popup-button-color '#ffffff'
"${GSETTINGS[@]}" set "$SCHEMA" time-text-color '#ffffff'
"${GSETTINGS[@]}" set "$SCHEMA" title-text-color '#ffffff'
"${GSETTINGS[@]}" set "$SCHEMA" artist-text-color '#cccccc'
"${GSETTINGS[@]}" set "$SCHEMA" custom-font-family ''
"${GSETTINGS[@]}" set "$SCHEMA" title-font-size 16
"${GSETTINGS[@]}" set "$SCHEMA" artist-font-size 11
"${GSETTINGS[@]}" set "$SCHEMA" time-font-size 10
"${GSETTINGS[@]}" set "$SCHEMA" art-pad-top 12
"${GSETTINGS[@]}" set "$SCHEMA" art-pad-bottom 12
"${GSETTINGS[@]}" set "$SCHEMA" art-pad-left 12
"${GSETTINGS[@]}" set "$SCHEMA" art-pad-right 12

echo
echo "Installed Spotify Control Centre V7 (live Spotify DJ artwork)."
echo "Log out and back in, then run:"
echo "  gnome-extensions disable spotify-controls@Sonath21"
echo "  gnome-extensions disable spotify-controller@narkagni"
echo "  gnome-extensions enable $UUID"
echo
echo "Preferences: gnome-extensions prefs $UUID"
