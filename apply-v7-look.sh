#!/usr/bin/env bash
set -euo pipefail
UUID='spotify-control-centre@harry'
SCHEMA='org.gnome.shell.extensions.spotify-control-centre'
DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
if [[ ! -d "$DIR/schemas" ]]; then
    echo "Install the extension first: $DIR not found" >&2
    exit 1
fi
G=(gsettings --schemadir "$DIR/schemas")
"${G[@]}" set "$SCHEMA" button-spacing 1
"${G[@]}" set "$SCHEMA" label-margin 3
"${G[@]}" set "$SCHEMA" bg-mode 'ambient'
"${G[@]}" set "$SCHEMA" custom-bg-color '#180f16'
"${G[@]}" set "$SCHEMA" header-font-size 12
"${G[@]}" set "$SCHEMA" header-text-color '#ffffff'
"${G[@]}" set "$SCHEMA" slider-style 'wavy'
"${G[@]}" set "$SCHEMA" slider-color '#ffffff'
"${G[@]}" set "$SCHEMA" slider-track-color 'rgba(255, 255, 255, 0.30)'
"${G[@]}" set "$SCHEMA" thumb-color '#ffffff'
"${G[@]}" set "$SCHEMA" panel-label-width 170
"${G[@]}" set "$SCHEMA" marquee-enabled true
"${G[@]}" set "$SCHEMA" marquee-speed 32
"${G[@]}" set "$SCHEMA" cover-art-size 300
"${G[@]}" set "$SCHEMA" cover-art-radius 14
"${G[@]}" set "$SCHEMA" popup-icon-size 24
"${G[@]}" set "$SCHEMA" art-rotate-speed 0
"${G[@]}" set "$SCHEMA" popup-button-color '#ffffff'
"${G[@]}" set "$SCHEMA" time-text-color '#ffffff'
"${G[@]}" set "$SCHEMA" title-text-color '#ffffff'
"${G[@]}" set "$SCHEMA" artist-text-color '#cccccc'
"${G[@]}" set "$SCHEMA" custom-font-family ''
"${G[@]}" set "$SCHEMA" title-font-size 16
"${G[@]}" set "$SCHEMA" artist-font-size 11
"${G[@]}" set "$SCHEMA" time-font-size 10
"${G[@]}" set "$SCHEMA" art-pad-top 12
"${G[@]}" set "$SCHEMA" art-pad-bottom 12
"${G[@]}" set "$SCHEMA" art-pad-left 12
"${G[@]}" set "$SCHEMA" art-pad-right 12
echo 'V7 compact layout and dynamic artwork theme applied. Log out and back in to reload the extension.'
