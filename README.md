# Spotify Control Centre — V7

V7 keeps the compact white GNOME panel controls, dynamic Hazy-style popup
colouring, transparent rounded popup shell and subtle shadow from the final V6
build.

## Live Spotify DJ artwork

During a detected Spotify DJ speech segment, V7 now prefers the artwork URL
reported live by Spotify over the bundled image. While the DJ is speaking, a
remote Spotify artwork URL is re-read every 2.5 seconds so changing artwork can
be reflected even when Spotify keeps the same MPRIS URL.

The bundled `assets/spotify-dj.png` is now strictly a fallback and appears only
when Spotify provides no DJ artwork or the live image cannot be loaded.

MPRIS exposes an image URI, not Spotify's animated/video DJ surface. Therefore
V7 can follow images Spotify publishes through MPRIS, but it cannot mirror the
full animated Spotify client view without a separate screen-capture or
Spicetify-to-GNOME bridge.

## Install or upgrade

```bash
./install.sh
```

The installer backs up the currently installed custom extension. On Wayland,
log out and back in, then ensure it is enabled:

```bash
gnome-extensions disable spotify-controls@Sonath21
gnome-extensions disable spotify-controller@narkagni
gnome-extensions enable spotify-control-centre@harry
```

Preferences:

```bash
gnome-extensions prefs spotify-control-centre@harry
```

## DJ metadata diagnostic

If the fallback still appears during a spoken segment, run this while DJ X is
talking and save the output:

```bash
./diagnose-dj-mpris.sh
```

Press `Ctrl+C` after several seconds. This shows exactly which title, artist,
track ID and artwork URL Spotify is exposing to Linux.

## Licence and attribution

The extension remains GPL-3.0-or-later and is based on Spotify Controller by
NarkAgni and Spotify Controls by Sonath21. See `LICENSE` and `ATTRIBUTION.md`.
