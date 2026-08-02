#!/usr/bin/env bash
set -u

PLAYER='org.mpris.MediaPlayer2.spotify'
OBJECT='/org/mpris/MediaPlayer2'
INTERFACE='org.mpris.MediaPlayer2.Player'

if ! command -v gdbus >/dev/null 2>&1; then
    echo 'gdbus is required (normally provided by libglib2.0-bin).' >&2
    exit 1
fi

echo 'Spotify Control Centre V7 — DJ MPRIS diagnostic'
echo 'Start Spotify DJ, wait until the voice is speaking, then leave this running.'
echo 'Press Ctrl+C after 5–10 seconds.'
echo

while true; do
    printf '\n=== %(%Y-%m-%d %H:%M:%S)T ===\n' -1
    gdbus call --session \
        --dest "$PLAYER" \
        --object-path "$OBJECT" \
        --method org.freedesktop.DBus.Properties.Get \
        "$INTERFACE" Metadata 2>&1 || true
    sleep 1
done
