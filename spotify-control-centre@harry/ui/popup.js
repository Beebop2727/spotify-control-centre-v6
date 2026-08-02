/*
 * Popup UI derived from Spotify Controller by NarkAgni.
 * Modified 24 July 2026 for Spotify Control Centre.
 * GPL-3.0-or-later.
 */

import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
import Pango from 'gi://Pango';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import { MediaSlider } from './slider.js';
import { LyricsWidget } from './LyricsWidget.js';
import { LyricsClient } from '../core/LyricsClient.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

Gio._promisify(Soup.Session.prototype, "send_and_read_async", "send_and_read_finish");
Gio._promisify(Gio.File.prototype, "replace_contents_bytes_async", "replace_contents_finish");
Gio._promisify(GdkPixbuf.Pixbuf, "new_from_stream_async", "new_from_stream_finish");

export class MediaPopup {
    constructor(menu, settings, controlsCallback, extensionPath) {
        this._menu = menu;
        this._settings = settings;
        this._callbacks = controlsCallback;
        this._extensionPath = extensionPath;
        this._djImageUri = extensionPath
            ? Gio.File.new_for_path(GLib.build_filenamev([
                extensionPath, 'assets', 'spotify-dj.png',
            ])).get_uri()
            : null;

        this._isPlaying = false;

        // PanelMenu wraps the content box in GNOME Shell's BoxPointer actor.
        // Styling only menu.box leaves the shell theme's large dark popover
        // surface visible behind our rounded card. Make that outer layer fully
        // transparent, then draw the card and its subtle shadow on menu.box.
        this._menu.actor?.add_style_class_name('spotify-popup-shell');
        this._menu._boxPointer?.add_style_class_name?.('spotify-popup-shell');
        this._menu._boxPointer?.actor?.add_style_class_name?.('spotify-popup-shell');
        this._menu.box.add_style_class_name('spotify-popup-menu');

        this._currentTrackHash = null;
        this._currentRGB = null;
        this._currentImageUri = null;
        this._imageRequestSerial = 0;
        this._djRefreshInFlight = false;
        this._djRefreshRequestSerial = 0;
        this._lastDjRefreshMs = 0;
        this._djRefreshIntervalMs = 2500;
        this._lastNonDjArtUrl = '';

        this._lyricsClient = new LyricsClient();
        this._isLyricsMode = false;
        this._currentLyricsData = null;
        this._lyricsTimerId = null;
        this._overlayTimeoutId = null;

        this._httpSession = new Soup.Session();
        this._httpSession.timeout = 10;
        this._httpSession.user_agent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36';

        this._cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), "spotify-control-centre-art"]);
        if (GLib.mkdir_with_parents(this._cacheDir, 0o755) === -1) { }

        this._buildUI();

        // Listen for all style changes
        const styleKeys = [
            'popup-button-color', 'time-text-color', 'title-text-color', 'artist-text-color',
            'custom-font-family', 'title-font-size', 'artist-font-size', 'time-font-size',
            'cover-art-size', 'popup-icon-size',
            'art-pad-top', 'art-pad-bottom', 'art-pad-left', 'art-pad-right',
            'text-margin-top', 'text-margin-bottom', 'text-margin-left', 'text-margin-right',
            'slider-pad-top', 'slider-pad-bottom', 'slider-pad-left', 'slider-pad-right',
            'ctrl-pad-top', 'ctrl-pad-bottom', 'ctrl-pad-left', 'ctrl-pad-right',
            'header-font-size', 'header-text-color',
            'lyrics-active-color', 'lyrics-neighbor-color', 'lyrics-inactive-color',
            'lyrics-active-size', 'lyrics-neighbor-size', 'lyrics-inactive-size', 'lyrics-line-spacing'
        ];

        styleKeys.forEach(key => {
            if (this._settings) this._settings.connect(`changed::${key}`, () => this._updateStyles());
        });

        this._settings.connect('changed::cover-art-radius', () => {
            this._updateStyles();
            this._checkRotationState();
        });
        this._settings.connect('changed::art-rotate-speed', () => this._checkRotationState());
        this._settings.connect('changed::bg-mode', () => this._updateBackground());
        this._settings.connect('changed::custom-bg-color', () => this._updateBackground());
        this._settings.connect('changed::custom-header-text', () => this._updateHeaderText());

        this._menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen) {
                this._checkRotationState();
                this._manageLyricsTimer();
            } else {
                this._freezeAnimation();
                this._removeLyricsTimer();
            }
        });
    }

    async updateTrack(info) {
        const isSpotifyDj = this._isSpotifyDjSegment(info);
        const spotifyArtUrl = String(info?.artUrl || '').trim();
        if (!isSpotifyDj && spotifyArtUrl)
            this._lastNonDjArtUrl = spotifyArtUrl;

        // Some Spotify builds leave the previous song cover in MPRIS while DJ
        // X is speaking. Do not mistake that stale URL for a live DJ visual.
        const hasSpotifyDjArtwork = isSpotifyDj &&
            Boolean(spotifyArtUrl) &&
            spotifyArtUrl !== this._lastNonDjArtUrl;
        const preferredArtUrl = hasSpotifyDjArtwork
            ? spotifyArtUrl
            : (isSpotifyDj ? this._djImageUri : spotifyArtUrl);
        const newHash = `${info.title}|${info.artist}|${info.album}|${preferredArtUrl}|${isSpotifyDj}`;
        const trackChanged = this._currentTrackHash !== newHash;
        const nowMs = GLib.get_monotonic_time() / 1000;

        // Spotify sometimes keeps the same MPRIS artwork URL throughout a DJ
        // interlude while changing the image behind it. Re-request the URL at a
        // restrained interval so V7 can follow that feed when it is available.
        const shouldRefreshLiveDj = hasSpotifyDjArtwork &&
            this._menu.isOpen &&
            !this._djRefreshInFlight &&
            (nowMs - this._lastDjRefreshMs >= this._djRefreshIntervalMs);

        if (trackChanged) {
            this._resetAnimation();
            this._currentLyricsData = null;
            if (this._isLyricsMode) this._fetchLyrics(info);
            this._currentTrackHash = newHash;
            this._currentRGB = null;
            this._lastDjRefreshMs = 0;
        } else if (!shouldRefreshLiveDj) {
            this._checkRotationState();
            return;
        }

        const requestSerial = ++this._imageRequestSerial;
        const forceRefresh = !trackChanged && shouldRefreshLiveDj;
        const refreshKey = forceRefresh
            ? `dj_${Math.floor(nowMs)}`
            : '';

        if (hasSpotifyDjArtwork) {
            this._djRefreshInFlight = true;
            this._djRefreshRequestSerial = requestSerial;
            this._lastDjRefreshMs = nowMs;
        }

        try {
            let result = await this.loadImage(preferredArtUrl, {
                forceRefresh,
                cacheKeySuffix: refreshKey,
            });

            // The static asset is deliberately a fallback only. It is used if
            // Spotify publishes no DJ image or its live artwork request fails.
            if (!result && isSpotifyDj && this._djImageUri &&
                preferredArtUrl !== this._djImageUri) {
                result = await this.loadImage(this._djImageUri);
            }

            if (requestSerial !== this._imageRequestSerial ||
                this._currentTrackHash !== newHash)
                return;

            if (result) {
                this._currentImageUri = result.uri;
                if (result.color)
                    this._currentRGB = result.color;
                this.garbageCollect(result.id);
            } else {
                this._currentImageUri = null;
                this.garbageCollect('LOCAL');
            }
        } catch (e) {
            if (requestSerial === this._imageRequestSerial)
                this._currentImageUri = null;
        } finally {
            if (hasSpotifyDjArtwork &&
                this._djRefreshRequestSerial === requestSerial) {
                this._djRefreshInFlight = false;
                this._djRefreshRequestSerial = 0;
            }
        }

        if (requestSerial !== this._imageRequestSerial)
            return;

        this._updateStyles();
        this._updateBackground();
        this._checkRotationState();
    }

    _isSpotifyDjSegment(info) {
        if (!info)
            return false;

        const title = String(info.title || '').trim().toLowerCase();
        const artist = String(info.artist || '').trim().toLowerCase();
        const album = String(info.album || '').trim().toLowerCase();
        const trackId = String(info.trackId || '').trim().toLowerCase();
        const combined = `${title} ${artist} ${album}`;

        const exactDjTitle = new Set([
            'dj',
            'dj x',
            'spotify dj',
            'spotify ai dj',
            'your dj',
            'your ai dj',
        ]).has(title);

        const explicitSpotifyDj =
            combined.includes('spotify dj') ||
            combined.includes('spotify ai dj') ||
            combined.includes('your ai dj') ||
            combined.includes('dj x');

        const spotifyOwned =
            artist === 'spotify' ||
            artist.startsWith('spotify ') ||
            album.includes('spotify dj');

        // Spotify's spoken DJ interludes commonly have no ordinary album art.
        // Requiring an explicit DJ marker, plus either Spotify ownership or
        // missing artwork, avoids replacing legitimate songs whose title
        // happens to be "DJ".
        return explicitSpotifyDj ||
            (exactDjTitle && (spotifyOwned || !info.artUrl)) ||
            (trackId.includes(':dj:') && !info.artUrl);
    }

    _updateBackground() {
        const mode = this._settings.get_string('bg-mode');
        const artSize = this._settings.get_int('cover-art-size');
        const menuWidth = artSize + 52;
        const fallbackColor = this._settings.get_string('custom-bg-color') || '#180f16';
        const baseStyle = `
            min-width: ${menuWidth}px;
            border-radius: 22px;
            border: 1px solid rgba(255, 255, 255, 0.10);
            box-shadow: none;
            transition-duration: 350ms;
        `;

        let style = `${baseStyle} background-color: ${fallbackColor};`;

        if (mode === 'ambient' && this._currentRGB) {
            const palette = this._buildAmbientPalette(this._currentRGB);
            style = `
                ${baseStyle}
                background-color: rgb(${palette.end.r}, ${palette.end.g}, ${palette.end.b});
                background-gradient-direction: vertical;
                background-gradient-start: rgba(${palette.start.r}, ${palette.start.g}, ${palette.start.b}, 0.97);
                background-gradient-end: rgba(${palette.end.r}, ${palette.end.g}, ${palette.end.b}, 0.99);
            `;
        }

        this._menu.box.style = style;
    }

    _rgbToHsl(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const lightness = (max + min) / 2;
        const delta = max - min;

        if (delta === 0)
            return { h: 0, s: 0, l: lightness };

        const saturation = delta / (1 - Math.abs((2 * lightness) - 1));
        let hue;

        if (max === r)
            hue = 60 * (((g - b) / delta) % 6);
        else if (max === g)
            hue = 60 * (((b - r) / delta) + 2);
        else
            hue = 60 * (((r - g) / delta) + 4);

        if (hue < 0)
            hue += 360;

        return { h: hue, s: saturation, l: lightness };
    }

    _hslToRgb(h, s, l) {
        const chroma = (1 - Math.abs((2 * l) - 1)) * s;
        const segment = h / 60;
        const x = chroma * (1 - Math.abs((segment % 2) - 1));
        let r1 = 0;
        let g1 = 0;
        let b1 = 0;

        if (segment < 1) [r1, g1, b1] = [chroma, x, 0];
        else if (segment < 2) [r1, g1, b1] = [x, chroma, 0];
        else if (segment < 3) [r1, g1, b1] = [0, chroma, x];
        else if (segment < 4) [r1, g1, b1] = [0, x, chroma];
        else if (segment < 5) [r1, g1, b1] = [x, 0, chroma];
        else [r1, g1, b1] = [chroma, 0, x];

        const match = l - (chroma / 2);
        return {
            r: Math.round((r1 + match) * 255),
            g: Math.round((g1 + match) * 255),
            b: Math.round((b1 + match) * 255),
        };
    }

    _mixColor(first, second, amount) {
        const keep = 1 - amount;
        return {
            r: Math.round((first.r * keep) + (second.r * amount)),
            g: Math.round((first.g * keep) + (second.g * amount)),
            b: Math.round((first.b * keep) + (second.b * amount)),
        };
    }

    _relativeLuminance(color) {
        const linearise = value => {
            const channel = value / 255;
            return channel <= 0.03928
                ? channel / 12.92
                : Math.pow((channel + 0.055) / 1.055, 2.4);
        };

        return (0.2126 * linearise(color.r)) +
            (0.7152 * linearise(color.g)) +
            (0.0722 * linearise(color.b));
    }

    _buildAmbientPalette(color) {
        const hsl = this._rgbToHsl(color.r, color.g, color.b);
        const isNeutral = hsl.s < 0.10;
        const saturation = isNeutral
            ? 0
            : Math.min(0.78, Math.max(0.42, hsl.s * 1.12));
        let lightness = Math.min(0.42, Math.max(0.25, hsl.l * 0.82));
        let start = this._hslToRgb(hsl.h, saturation, lightness);

        // HSL lightness is not perceived brightness: yellow and green can still
        // be dazzling at the same numeric value. Darken until white reaches a
        // normal-text contrast ratio of at least 4.5:1.
        while ((1.05 / (this._relativeLuminance(start) + 0.05)) < 4.5 &&
               lightness > 0.16) {
            lightness -= 0.02;
            start = this._hslToRgb(hsl.h, saturation, lightness);
        }

        // A deep tinted lower edge gives the popup the soft, hazy depth used by
        // dynamic Spicetify themes without changing any button foregrounds.
        const end = this._mixColor(start, { r: 10, g: 8, b: 12 }, 0.68);
        return { start, end };
    }

    _buildUI() {
        // --- HEADER ---
        this._headerItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'popup-header-item'
        });
        
        this.headerLabel = new St.Label({
            text: this._settings.get_string('custom-header-text') || 'Spotify',
            style_class: 'popup-header-label',
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        this._headerItem.actor.add_child(this.headerLabel);
        this._menu.addMenuItem(this._headerItem);

        // --- ART ---
        this._artItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false, style_class: 'album-art-item-container', can_focus: false
        });
        this._artItem.actor.x_align = Clutter.ActorAlign.CENTER;

        const contentBox = new St.BoxLayout({
            vertical: true, x_align: Clutter.ActorAlign.CENTER, style_class: 'art-content-box'
        });

        this._artStack = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: false,
            y_expand: false,
            reactive: true,
        });

        this._artWrapper = new St.Bin({
            style_class: 'album-art-wrapper',
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
            x_expand: false, y_expand: false,
        });
        this._artWrapper.set_pivot_point(0.5, 0.5);

        this._artIcon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic', style_class: 'album-art-icon',
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER
        });
        this._artWrapper.set_child(this._artIcon);

        this.lyricsWidget = new LyricsWidget(300, 300);
        this.lyricsWidget.opacity = 0;
        this.lyricsWidget.visible = false; 

        this.lyricsOverlayLabel = new St.Label({
            text: "Show Lyrics", style_class: 'lyrics-overlay-label', 
            opacity: 0, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
        });

        this._artStack.add_child(this._artWrapper);
        this._artStack.add_child(this.lyricsWidget);
        this._artStack.add_child(this.lyricsOverlayLabel);

        this._artStack.connect('button-release-event', () => {
            this._toggleLyricsView();
            return Clutter.EVENT_STOP;
        });

        this._artStack.connect('notify::hover', () => {
            if (this._artStack.hover) {
                this.lyricsOverlayLabel.text = this._isLyricsMode ? "Hide Lyrics" : "Show Lyrics";
                if (this._overlayTimeoutId) GLib.source_remove(this._overlayTimeoutId);
                this.lyricsOverlayLabel.ease({ opacity: 255, duration: 200, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
                this._overlayTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
                    this.lyricsOverlayLabel.ease({ opacity: 0, duration: 1000, mode: Clutter.AnimationMode.EASE_IN_QUAD });
                    this._overlayTimeoutId = null;
                    return GLib.SOURCE_REMOVE;
                });
            } else {
                if (this._overlayTimeoutId) { GLib.source_remove(this._overlayTimeoutId); this._overlayTimeoutId = null; }
                this.lyricsOverlayLabel.opacity = 0;
            }
        });

        contentBox.add_child(this._artStack);

        const textBox = new St.BoxLayout({
            vertical: true, x_align: Clutter.ActorAlign.CENTER, style_class: 'text-info-box'
        });

        this.titleLabel = new St.Label({ style_class: 'track-title-label', x_align: Clutter.ActorAlign.CENTER });
        this.titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.detailsLabel = new St.Label({ style_class: 'track-artist-label', x_align: Clutter.ActorAlign.CENTER });
        this.detailsLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;

        textBox.add_child(this.titleLabel);
        textBox.add_child(this.detailsLabel);
        contentBox.add_child(textBox);

        this._artItem.add_child(contentBox);
        this._menu.addMenuItem(this._artItem);

        this._sliderItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false, style_class: 'slider-item' });
        const sliderBox = new St.BoxLayout({ vertical: true, x_expand: true });
        const timeBox = new St.BoxLayout({ x_expand: true, style_class: 'time-box' });
        this.elapsedLabel = new St.Label({ text: '0:00', style_class: 'time-label' });
        const spacer = new St.Widget({ x_expand: true });
        this.totalLabel = new St.Label({ text: '0:00', style_class: 'time-label' });

        timeBox.add_child(this.elapsedLabel);
        timeBox.add_child(spacer);
        timeBox.add_child(this.totalLabel);
        this.slider = new MediaSlider((val) => this._callbacks.seek(val), this.elapsedLabel, this._settings);

        sliderBox.add_child(timeBox);
        sliderBox.add_child(this.slider);
        this._sliderItem.add_child(sliderBox);
        this._menu.addMenuItem(this._sliderItem);

        this._buildControls();
        this._updateStyles();
        this._updateIconSizes();
    }

    _buildControls() {
        this._controlItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false, can_focus: false, style_class: 'media-controls-item'
        });
        this._controlItem.actor.x_align = Clutter.ActorAlign.CENTER;

        const box = new St.BoxLayout({
            x_align: Clutter.ActorAlign.CENTER, style_class: 'media-controls-box'
        });

        const createBtn = (iconName, cb, styleClass) => {
            const icon = new St.Icon({ icon_name: iconName });
            const btn = new St.Button({
                child: icon, style_class: `popup-control-btn ${styleClass}`,
                x_expand: false, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
                reactive: true, can_focus: true, button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO
            });
            btn.connect('clicked', cb);
            return { btn, icon };
        };

        this.shuffle = createBtn('media-playlist-shuffle-symbolic', () => this._callbacks.shuffle(), 'small-control-btn');
        this.prev = createBtn('media-skip-backward-symbolic', () => { this._callbacks.prev(); this.resetPosition(); }, 'small-control-btn');
        this.play = createBtn('media-playback-start-symbolic', () => this._callbacks.playPause(), 'large-control-btn');
        this.next = createBtn('media-skip-forward-symbolic', () => { this._callbacks.next(); this.resetPosition(); }, 'small-control-btn');
        this.repeat = createBtn('media-playlist-repeat-symbolic', () => this._callbacks.repeat(), 'small-control-btn');

        this.controlIcons = [this.shuffle.icon, this.prev.icon, this.play.icon, this.next.icon, this.repeat.icon];
        this.playIcon = this.play.icon;
        this.shuffleBtn = this.shuffle.btn;
        this.repeatIcon = this.repeat.icon;
        this.repeatBtn = this.repeat.btn;

        box.add_child(this.shuffle.btn);
        box.add_child(this.prev.btn);
        box.add_child(this.play.btn);
        box.add_child(this.next.btn);
        box.add_child(this.repeat.btn);

        this._controlItem.add_child(box);
        this._menu.addMenuItem(this._controlItem);
    }

    _updateIconSizes() {
        let baseSize = 24;
        try { baseSize = this._settings.get_int('popup-icon-size'); } catch (e) { }
        if (baseSize > 32) baseSize = 32;

        this.shuffle.icon.set_icon_size(baseSize);
        this.prev.icon.set_icon_size(baseSize + 4);
        this.next.icon.set_icon_size(baseSize + 4);
        this.repeat.icon.set_icon_size(baseSize);
        const playSize = Math.floor(baseSize * 1.6);
        this.play.icon.set_icon_size(playSize);
    }

    _toggleLyricsView() {
        this._isLyricsMode = !this._isLyricsMode;
        const duration = 500;

        if (this._isLyricsMode) {
            this._freezeAnimation(); 
            this.lyricsWidget.show();
            this.lyricsWidget.ease({ opacity: 255, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
            this._artWrapper.ease({ 
                opacity: 0, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => this._artWrapper.hide()
            });

            if (this._lastTrackInfo) this._fetchLyrics(this._lastTrackInfo);
            this._manageLyricsTimer();
        } else {
            this._artWrapper.show();
            this._artWrapper.ease({ opacity: 255, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
            this.lyricsWidget.ease({ 
                opacity: 0, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => this.lyricsWidget.hide()
            });

            this._removeLyricsTimer();
            this._checkRotationState();
        }
    }

    _updateHeaderText() {
        if (this.headerLabel) {
            const text = this._settings.get_string('custom-header-text');
            this.headerLabel.set_text(text || 'Spotify');
        }
    }

    _manageLyricsTimer() {
        if (this._isLyricsMode && this._isPlaying && this._menu.isOpen) {
            if (!this._lyricsTimerId) {
                this._lyricsTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    this._onLyricsTick();
                    return GLib.SOURCE_CONTINUE;
                });
            }
        } else {
            this._removeLyricsTimer();
        }
    }

    _removeLyricsTimer() {
        if (this._lyricsTimerId) {
            GLib.source_remove(this._lyricsTimerId);
            this._lyricsTimerId = null;
        }
    }

    _onLyricsTick() {
        if (this.lyricsWidget && this.slider) {
            const posSeconds = this.slider._position; 
            if (posSeconds !== undefined) {
                this.lyricsWidget.updatePosition(posSeconds * 1000);
            }
        }
    }

    async _fetchLyrics(info) {
        if (!info) return;
        const requestTrackId = info.title + info.artist;
        if (this._currentLyricsData && this._currentLyricsData.id === requestTrackId) return; 

        this._currentLyricsData = { id: requestTrackId };
        this.lyricsWidget.showLoading();

        const durationSec = info.length ? info.length / 1000000 : 0;
        const lyrics = await this._lyricsClient.getLyrics(info.title, info.artist, info.album, durationSec);

        const currentPlayingId = this._lastTrackInfo ? (this._lastTrackInfo.title + this._lastTrackInfo.artist) : null;
        if (requestTrackId !== currentPlayingId) return;

        if (lyrics && lyrics.length > 0) {
            this.lyricsWidget.setLyrics(lyrics);
        } else {
            this.lyricsWidget.showEmpty();
        }
    }

    syncPosition(posMicro) {
        this.slider.syncPosition(posMicro);
        if (this._isLyricsMode && this.lyricsWidget) this.lyricsWidget.updatePosition(posMicro/1000);
    }

    _checkRotationState() {
        if (!this._artWrapper || this._isLyricsMode) return;

        const radius = this._settings.get_int('cover-art-radius');
        const artSize = this._settings.get_int('cover-art-size');
        let speedVal = 0;
        try { speedVal = this._settings.get_int('art-rotate-speed'); } catch (e) { }
        
        
        if (radius < artSize / 2 || speedVal <= 0) {
            this._resetAnimation();
            return;
        }

        if (!this._menu.isOpen) {
            this._freezeAnimation();
            return;
        }

        if (this._isPlaying) {
            this._startSpinning(speedVal);
        } else {
            this._freezeAnimation();
        }
    }

    _resetAnimation() {
        if (!this._artWrapper) return;
        this._artWrapper.remove_transition('rotate-infinite');
        this._artWrapper.rotation_angle_z = 0;
    }

    _freezeAnimation() {
        if (!this._artWrapper) return;
        const currentAngle = this._artWrapper.rotation_angle_z;
        this._artWrapper.remove_transition('rotate-infinite');
        this._artWrapper.rotation_angle_z = currentAngle;
    }

    _startSpinning(speedVal) {
        if (!this._artWrapper) return;

        this._artWrapper.set_pivot_point(0.5, 0.5);
        this._artWrapper.reactive = true;
        const duration = (60 / speedVal) * 1000;

        // Check duplicate transition
        const existing = this._artWrapper.get_transition('rotate-infinite');
        if (existing) {
             if (Math.abs(existing.get_duration() - duration) < 50) return; 
             this._artWrapper.remove_transition('rotate-infinite');
        }

        let currentAngle = this._artWrapper.rotation_angle_z % 360;
        this._artWrapper.rotation_angle_z = currentAngle;

        // Explicit Clutter Transition
        const transition = new Clutter.PropertyTransition({
            property_name: 'rotation-angle-z',
            interval: new Clutter.Interval({
                value_type: GObject.TYPE_DOUBLE,
                initial: currentAngle,
                final: currentAngle + 360
            }),
            duration: duration,
            progress_mode: Clutter.AnimationMode.LINEAR,
            repeat_count: -1
        });

        this._artWrapper.add_transition('rotate-infinite', transition);
    }

    _updateStyles() {
        const s = this._settings;
        const getInt = (k, def = 0) => { try { return s.get_int(k); } catch(e) { return def; } };
        const getStr = (k, def = '#ffffff') => { try { return s.get_string(k); } catch(e) { return def; } };

        this._updateIconSizes();

        // Padding application
        this._artItem.set_style(`padding: ${getInt('art-pad-top')}px ${getInt('art-pad-right')}px ${getInt('art-pad-bottom')}px ${getInt('art-pad-left')}px !important;`);
        const textBox = this.titleLabel.get_parent();
        if (textBox) textBox.set_style(`margin: ${getInt('text-margin-top')}px ${getInt('text-margin-right')}px ${getInt('text-margin-bottom')}px ${getInt('text-margin-left')}px !important;`);
        this._sliderItem.set_style(`padding: ${getInt('slider-pad-top')}px ${getInt('slider-pad-right')}px ${getInt('slider-pad-bottom')}px ${getInt('slider-pad-left')}px !important;`);
        this._controlItem.set_style(`padding: ${getInt('ctrl-pad-top')}px ${getInt('ctrl-pad-right')}px ${getInt('ctrl-pad-bottom')}px ${getInt('ctrl-pad-left')}px !important;`);

        const btnColor = getStr('popup-button-color');
        const artSize = getInt('cover-art-size', 300);
        const radius = getInt('cover-art-radius', 16);

        // Header Styling
        const headerFont = getStr('custom-font-family');
        const headerSize = getInt('header-font-size', 12);
        const headerColor = getStr('header-text-color', '#ffffff');
        const headerFontCSS = headerFont ? `font-family: '${headerFont}';` : '';
        this.headerLabel.style = `color: ${headerColor}; font-size: ${headerSize}pt; ${headerFontCSS}`;

        // Lyrics Widget Configuration update
        if (this.lyricsWidget) {
            this.lyricsWidget.set_width(artSize);
            this.lyricsWidget.set_height(artSize);
            
            this.lyricsWidget.updateAppearance({
                activeColorStr: getStr('lyrics-active-color'),
                neighborColorStr: getStr('lyrics-neighbor-color'),
                inactiveColorStr: getStr('lyrics-inactive-color'),
                activeSize: getInt('lyrics-active-size'),
                neighborSize: getInt('lyrics-neighbor-size'),
                inactiveSize: getInt('lyrics-inactive-size'),
                spacing: getInt('lyrics-line-spacing')
            });
        }

        if (this._artStack) {
            this._artStack.set_width(artSize);
            this._artStack.set_height(artSize);
        }

        if (this._artWrapper) {
            this._artWrapper.set_width(artSize);
            this._artWrapper.set_height(artSize);

            let wrapperStyle = `width: ${artSize}px; height: ${artSize}px; border-radius: ${radius}px; box-shadow: none;`;
            if (this._currentImageUri) {
                wrapperStyle += `background-image: url("${this._currentImageUri}"); background-size: cover; background-position: center; background-repeat: no-repeat;`;
                this._artIcon.visible = false;
            } else {
                wrapperStyle += `background-image: none; background-color: rgba(49, 50, 68, 0.9);`;
                this._artIcon.visible = true;
                this._artIcon.set_icon_size(Math.floor(artSize / 2));
            }
            this._artWrapper.style = wrapperStyle;
        }

        this.controlIcons.forEach(icon => {
            icon.style = (icon === this.playIcon) ? "color: #000000 !important;" : `color: ${btnColor};`;
        });

        const fontCSS = headerFont ? `font-family: '${headerFont}';` : '';
        const alignStyle = `width: ${artSize}px; text-align: center;`;
        this.titleLabel.style = `color: ${getStr('title-text-color')}; font-size: ${getInt('title-font-size')}pt; ${fontCSS} ${alignStyle}`;
        this.detailsLabel.style = `color: ${getStr('artist-text-color')}; font-size: ${getInt('artist-font-size')}pt; ${fontCSS} ${alignStyle}`;
        const timeStyle = `color: ${getStr('time-text-color')}; font-size: ${getInt('time-font-size')}pt; ${fontCSS}`;
        this.elapsedLabel.style = timeStyle;
        this.totalLabel.style = timeStyle;
    }

    _formatTime(microseconds) {
        if (microseconds === undefined || microseconds === null || microseconds < 0) return '0:00';
        let totalSeconds = Math.floor(microseconds / 1000000);
        let mins = Math.floor(totalSeconds / 60);
        let secs = totalSeconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    updateControls(info) {
        if (!info) return;
        this._lastTrackInfo = info;

        this.titleLabel.set_text(info.title || 'Unknown Title');
        const artist = info.artist || 'Unknown Artist';
        let album = info.album;
        if (!album || album === 'Unknown Album' || album === '') album = null;
        else if (album.length > 30) album = album.substring(0, 30) + '...';
        const subText = album ? `${artist} / ${album}` : artist;
        this.detailsLabel.set_text(subText);

        const isPlaying = info.status === 'Playing' || info.status === 'playing';
        if (this._isPlaying !== isPlaying) {
            this._isPlaying = isPlaying;
            this._checkRotationState();
            this._manageLyricsTimer();
        }

        this.playIcon.icon_name = isPlaying ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        this.shuffleBtn.opacity = info.shuffle ? 255 : 120;
        if (info.loopStatus === 'Track') {
            this.repeatIcon.icon_name = 'media-playlist-repeat-song-symbolic';
            this.repeatBtn.opacity = 255;
        } else {
            this.repeatIcon.icon_name = 'media-playlist-repeat-symbolic';
            this.repeatBtn.opacity = info.loopStatus === 'Playlist' ? 255 : 120;
        }

        if (info.length > 0) {
            this.totalLabel.text = this._formatTime(info.length);
            this.slider.updateMetadata(info.length, info.rate || 1.0, info.trackId, isPlaying, info.position);
        } else {
            this.totalLabel.text = '0:00';
            this.slider.updateMetadata(1, 1.0, null, false, 0);
        }
        
        if (this._isLyricsMode) {
             this._fetchLyrics(info);
        }
    }

    syncPosition(position) { this.slider.syncPosition(position); if(this._isLyricsMode && this.lyricsWidget) this.lyricsWidget.updatePosition(position/1000); }
    resetPosition() { this.slider.resetToZero(); }

    _extractColor(pixbuf) {
        try {
            // Hazy chooses a prominent cover colour after rejecting pixels that
            // are too dark or too close to white. Quantising nearby JPEG colours
            // into small buckets keeps that behaviour stable with compressed art.
            const scaled = pixbuf.scale_simple(48, 48, GdkPixbuf.InterpType.BILINEAR);
            if (!scaled)
                return null;

            const pixels = scaled.get_pixels();
            const width = scaled.get_width();
            const height = scaled.get_height();
            const channels = scaled.get_n_channels();
            const rowstride = scaled.get_rowstride();
            const hasAlpha = scaled.get_has_alpha();
            const filteredBuckets = new Map();
            const allBuckets = new Map();

            const addToBucket = (buckets, r, g, b, weight) => {
                // Four bits per channel are enough to merge compression noise
                // without collapsing distinct colours into the same group.
                const key = `${r >> 4}:${g >> 4}:${b >> 4}`;
                const bucket = buckets.get(key) || {
                    r: 0, g: 0, b: 0, weight: 0,
                };

                bucket.r += r * weight;
                bucket.g += g * weight;
                bucket.b += b * weight;
                bucket.weight += weight;
                buckets.set(key, bucket);
            };

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const offset = (y * rowstride) + (x * channels);
                    const alpha = hasAlpha ? pixels[offset + 3] / 255 : 1;
                    if (alpha < 0.35)
                        continue;

                    const r = pixels[offset];
                    const g = pixels[offset + 1];
                    const b = pixels[offset + 2];
                    const brightness = (0.299 * r) + (0.587 * g) + (0.114 * b);
                    const tooDark = brightness < 100;
                    const tooCloseToWhite = r > 200 && g > 200 && b > 200;

                    addToBucket(allBuckets, r, g, b, alpha);
                    if (!tooDark && !tooCloseToWhite)
                        addToBucket(filteredBuckets, r, g, b, alpha);
                }
            }

            const mostProminent = buckets => {
                let winner = null;
                let winnerWeight = -1;

                for (const bucket of buckets.values()) {
                    if (bucket.weight > winnerWeight) {
                        winner = bucket;
                        winnerWeight = bucket.weight;
                    }
                }

                if (!winner || winner.weight <= 0)
                    return null;

                return {
                    r: Math.round(winner.r / winner.weight),
                    g: Math.round(winner.g / winner.weight),
                    b: Math.round(winner.b / winner.weight),
                };
            };

            // Match Hazy's behaviour: retry without the brightness filters when
            // the artwork is almost entirely black, white or monochrome.
            return mostProminent(filteredBuckets) || mostProminent(allBuckets);
        } catch (e) {
            console.warn(`[SpotifyControlCentre] Colour extraction failed: ${e.message}`);
            return null;
        }
    }

    async loadImage(artUrl, options = {}) {
        if (!artUrl) return null;

        try {
            // 1. Ensure Cache Directory
            if (GLib.mkdir_with_parents(this._cacheDir, 0o755) !== 0) {
                 if (!GLib.file_test(this._cacheDir, GLib.FileTest.IS_DIR)) return null;
            }

            // 2. Prepare Filename
            const forceRefresh = Boolean(options.forceRefresh);
            const cacheKeySuffix = String(options.cacheKeySuffix || '')
                .replace(/[^a-z0-9_-]/gi, '_');
            const urlParts = artUrl.split('/');
            let uniqueID = urlParts[urlParts.length - 1].split('?')[0].replace(/[^a-z0-9]/gi, '_');
            if (!uniqueID || uniqueID.length < 2)
                uniqueID = "image_" + Math.floor(Math.random() * 10000);
            if (cacheKeySuffix)
                uniqueID = `${uniqueID}_${cacheKeySuffix}`;

            const fileName = `${uniqueID}.jpg`;
            const filePath = GLib.build_filenamev([this._cacheDir, fileName]);
            const file = Gio.File.new_for_path(filePath);
            
            let isLocal = artUrl.startsWith('file://');
            let fileReady = false;

            // 3. Download or Verify Existence
            if (isLocal) {
                const localFile = Gio.File.new_for_uri(artUrl);
                if (localFile.query_exists(null)) { 
                    uniqueID = 'LOCAL'; 
                    fileReady = true; 
                }
            } else {
                if (file.query_exists(null) && !forceRefresh) {
                    fileReady = true;
                } else {
                    const msg = Soup.Message.new('GET', artUrl);
                    msg.request_headers.append('User-Agent', 'Mozilla/5.0');
                    const bytes = await this._httpSession.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null);
                    
                    if (msg.status_code === 200) {
                        const [success] = file.replace_contents(bytes.get_data(), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                        if (success) fileReady = true;
                    }
                }
            }

            // 4. Extract Color & Return
            if (fileReady) {
                const targetFile = isLocal ? Gio.File.new_for_uri(artUrl) : file;
                let resultColor = null;

                try {
                    // Try Synchronous Load (More Reliable for Local Files)
                    const path = targetFile.get_path();
                    if (path) {
                        const pixbuf = GdkPixbuf.Pixbuf.new_from_file(path);
                        resultColor = this._extractColor(pixbuf);
                    } else {
                        // Fallback for URIs without paths
                        const inputStream = await targetFile.read_async(null, null);
                        const pixbuf = await GdkPixbuf.Pixbuf.new_from_stream_async(inputStream, null);
                        if (pixbuf) resultColor = this._extractColor(pixbuf);
                    }
                } catch (e) {
                    console.warn("[SpotifyControlCentre] Pixbuf load failed:", e);
                }

                return { uri: targetFile.get_uri(), id: uniqueID, color: resultColor };
            }
        } catch (e) { 
            console.warn(`[SpotifyControlCentre] loadImage Error: ${e.message}`);
        }
        return null;
    }

    garbageCollect(keepID) {
        try {
            const dir = Gio.File.new_for_path(this._cacheDir);
            if (!dir.query_exists(null)) return;

            const enumerator = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = enumerator.next_file(null))) {
                const name = info.get_name();
                if (name.endsWith('.jpg')) {
                    if (keepID && name === `${keepID}.jpg`) continue;
                    // Delete old files
                    const child = dir.get_child(name);
                    try { child.delete(null); } catch(e) {}
                }
            }
        } catch (e) { }
    }

    destroy() {
        if (this._httpSession) { this._httpSession.abort(); this._httpSession = null; }
        if (this._overlayTimeoutId) {
            GLib.source_remove(this._overlayTimeoutId);
            this._overlayTimeoutId = null;
        }
        this._removeLyricsTimer();
        
        if (this._lyricsClient) {
            this._lyricsClient.destroy();
        }

        this._artItem.destroy();
        this._controlItem.destroy();
        this._sliderItem.destroy();
        this.garbageCollect(null);
    }
}