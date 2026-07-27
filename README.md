# Spotify Control Centre — V6

A custom GNOME Shell extension combining the compact top-panel controls from
**Spotify Controls + Track Info** with the detailed popup, artwork, seeking and
lyrics components from **Spotify Controller**.

## V6 change

V5 relied only on GNOME's insertion index. That was not reliable when Spotify
Control Centre loaded before Space Bar: both extensions could be inserted while
the left panel box was still empty, leaving Spotify first.

V6 now detects the Space Bar actor by its `space-bar` style class and moves the
existing Spotify actor immediately after it. A lightweight one-second check
keeps the order stable if either extension loads late or Space Bar rebuilds its
panel widget after a settings change.

Expected order:

```text
[ Workspaces ] [ Spotify controls ]
```

All V4/V5 behaviour remains unchanged:

- 170 px fixed top-panel text viewport
- continuous marquee for long artist/track text
- compact white panel controls
- popup centred under the text viewport
- square 300 px album artwork
- cached last track while Spotify is open but stopped
- MPRIS playback controls, seeking, shuffle, repeat and lyrics

## Install or upgrade

From the extracted directory:

```bash
./install.sh
```

The installer backs up the currently installed custom build. On Wayland, log
out and back in after installation, then ensure it is enabled:

```bash
gnome-extensions disable spotify-controls@Sonath21
gnome-extensions disable spotify-controller@narkagni
gnome-extensions enable spotify-control-centre@harry
```

Preferences:

```bash
gnome-extensions prefs spotify-control-centre@harry
```

## Upstream projects and licence

- Spotify Controls by Sonath21
- Spotify Controller by NarkAgni

Both upstream projects are GPL-3.0. The complete licence and attribution notice
are included in the extension directory.
