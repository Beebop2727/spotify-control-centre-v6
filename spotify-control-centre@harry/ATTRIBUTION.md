# Attribution and modification notice

Spotify Control Centre is a modified work created on 24 July 2026.

It incorporates GPL-3.0-or-later code from:

1. **Spotify Controller**, copyright its contributors, by NarkAgni.
   - Upstream: https://github.com/NarkAgni/spotify-controller
   - Used for the MPRIS backend, popup player, artwork handling, slider and lyrics.

2. **Spotify Controls**, copyright its contributors, by Sonath21.
   - Upstream: https://github.com/Sonath21/spotify-controls
   - Used as the design and interaction reference for the compact panel control and Spotify icon.

Principal modifications include a new UUID/settings schema, a compact panel UI, separate logo and popup actions, Catppuccin defaults, fixed-size popup artwork, reduced popup dimensions, exact-size artwork rendering and GNOME Shell 50 metadata.

The complete work is distributed under GPL-3.0-or-later. See `LICENSE`.


## Spotify DJ fallback artwork

The bundled `assets/spotify-dj.png` is a square crop of Spotify's official
“Your very own DJ” press artwork, used only as a local fallback while Spotify DJ is speaking and Spotify does not expose usable live artwork through MPRIS.

- Source: Spotify Newsroom, “Behind the Scenes of Spotify’s New AI DJ”
- Original asset: `Spotify_DJ_PRHeader_2-2-1441x733.png`
- Spotify and the Spotify logo are trademarks of Spotify AB.
