# Spotify Control Centre

**Current release: V6**

Spotify Control Centre is a custom GNOME Shell extension that combines a compact
Spotify controller in the top panel with a full player popup containing artwork,
playback controls, seeking, shuffle, repeat, and synchronized lyrics.

It was built by combining and modifying ideas and GPL-licensed code from
[Spotify Controls](https://github.com/Sonath21/spotify-controls) by Sonath21 and
[Spotify Controller](https://github.com/NarkAgni/spotify-controller) by NarkAgni.

> **Repository note:** this repository contains the final V6 source only. V1–V5
> were iterative development builds rather than separately published releases.
> Their history is documented below so the evolution of the project is clear.

## Features

- Compact previous, play/pause, and next controls in the GNOME top panel
- `Artist — Track` text inside a fixed 170 px viewport
- Continuous marquee animation for long artist and track names
- White panel text and controls designed to remain readable across themes
- Spotify logo button that opens or focuses Spotify
- Track-text button that opens the full player popup
- Mouse-wheel volume control over the panel widget
- Popup centred beneath the fixed track-text area
- Square 300 px album artwork with lightly rounded corners
- Playback timeline with seeking and a wavy progress style
- Shuffle, repeat, previous, play/pause, and next controls
- Synchronized lyrics supplied through LRCLIB
- Last-track information remains visible while Spotify is open but stopped
- Configurable panel, popup, artwork, typography, colour, and lyrics settings
- Reliable placement immediately after the Space Bar workspace indicator

## Version history

### V1 — Initial merged controller

The first build joined the compact panel controls from Spotify Controls with the
larger player popup and MPRIS backend from Spotify Controller.

- Added a compact top-left panel widget displaying `Artist — Track`
- Added previous, play/pause, and next buttons to the panel
- Made the track area open the expanded player popup
- Made the Spotify logo open or focus Spotify
- Added mouse-wheel volume adjustment
- Retained artwork, timeline seeking, shuffle, repeat, and lyrics
- Used square 220 px artwork, a flat timeline, and disabled artwork rotation to
  reduce blur

### V2 — Popup visual redesign

V2 focused on making the popup feel closer to the fuller original Spotify
Controller design while keeping the compact panel interface.

- Changed panel text and icons to white
- Expanded the popup proportions and increased control sizes
- Introduced 300 px circular artwork
- Restored the original-style wavy seek bar
- Added a near-black rounded popup card and white typography
- Kept artwork rotation disabled
- Improved fixed artwork sizing and DPI-aware text sizing

### V3 — Fixed panel width and marquee

V3 stopped long track names from pushing other panel items around.

- Replaced circular artwork with square 300 px artwork and lightly rounded corners
- Added a fixed 320 px track-text area
- Added a smooth back-and-forth marquee with pauses for overflowing text
- Anchored the popup beneath the centre of the track-text area
- Added preferences for track-text width, marquee enablement, and marquee speed

### V4 — Persistent compact panel behaviour

V4 refined the panel interaction and established most of the final everyday
behaviour.

- Reduced the fixed track-text viewport from 320 px to 170 px
- Reworked the marquee into a continuous animation without the text disappearing
- Cached and displayed the last known track while Spotify remained open but
  reported a stopped playback state
- Kept the panel widget visible when Spotify was paused or stopped
- Kept the popup centred beneath the fixed text viewport
- Preserved white panel text and controls

### V5 — First Space Bar positioning attempt

V5 attempted to guarantee this panel order:

```text
[ Workspaces ] [ Spotify controls ]
```

It inserted Spotify Control Centre after the workspace indicator using GNOME
Shell's panel insertion index. This worked in some startup orders, but was not
fully reliable when Spotify Control Centre loaded before Space Bar and both
extensions initially saw an empty left panel box.

### V6 — Reliable Space Bar positioning

V6 is the current release. It replaces V5's index-only approach with active actor
detection.

- Detects the Space Bar actor through its `space-bar` style class
- Moves the existing Spotify actor immediately after Space Bar
- Performs a lightweight one-second position check
- Corrects the order when either extension loads late
- Corrects the order if Space Bar rebuilds its panel widget after a settings
  change
- Retains all panel, popup, artwork, marquee, stopped-track, MPRIS, and lyrics
  behaviour developed in V1–V5

## Compatibility

The extension metadata declares support for GNOME Shell versions:

```text
45, 46, 47, 48, 49, and 50
```

Spotify must expose its standard MPRIS interface. The installer also requires
`glib-compile-schemas`, supplied on Ubuntu by:

```bash
sudo apt install libglib2.0-bin
```

## Install or upgrade

From the extracted project directory:

```bash
./install.sh
```

The installer:

1. Backs up any existing installation of `spotify-control-centre@harry`
2. Copies the V6 extension into your local GNOME Shell extensions directory
3. Compiles its GSettings schema
4. Applies the intended V6 compact layout and visual preset

On Wayland, log out and back in after installation. Then disable the two upstream
extensions if they are still installed and enable Spotify Control Centre:

```bash
gnome-extensions disable spotify-controls@Sonath21
gnome-extensions disable spotify-controller@narkagni
gnome-extensions enable spotify-control-centre@harry
```

Open the preferences window with:

```bash
gnome-extensions prefs spotify-control-centre@harry
```

To reapply the default V6 visual preset later:

```bash
./apply-v6-look.sh
```

## Uninstall

From the project directory:

```bash
./uninstall.sh
```

Log out and back in afterward to complete removal from the GNOME Shell session.

## Lyrics and network access

Playback control and track information are obtained locally through MPRIS.
When synchronized lyrics are requested, the extension sends the current track
title, artist, album, and duration to the public
[LRCLIB](https://lrclib.net/) API to locate matching lyrics.

No Spotify account credentials or Spotify API token are required by this
extension.

## Credits and licence

Spotify Control Centre is a modified GPL-3.0-or-later work incorporating code
and design ideas from:

- [Spotify Controller](https://github.com/NarkAgni/spotify-controller) by NarkAgni
- [Spotify Controls](https://github.com/Sonath21/spotify-controls) by Sonath21

See `spotify-control-centre@harry/ATTRIBUTION.md` for the full modification and
attribution notice, and `spotify-control-centre@harry/LICENSE` for the licence.

Spotify Control Centre is an independent community project and is not affiliated
with or endorsed by Spotify.
