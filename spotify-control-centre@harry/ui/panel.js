/*
 * Compact panel UI for Spotify Control Centre.
 * Modified 24 July 2026.
 *
 * Panel layout inspired by Spotify Controls by Sonath21.
 * Popup/backend derived from Spotify Controller by NarkAgni.
 * GPL-3.0-or-later.
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {SpotifyProxy} from '../core/spotifyProxy.js';
import {MediaPopup} from './popup.js';

const SPOTIFY_BUS_NAME = 'org.mpris.MediaPlayer2.spotify';
const SPOTIFY_OBJECT_PATH = '/org/mpris/MediaPlayer2';
const MPRIS_ROOT_INTERFACE = 'org.mpris.MediaPlayer2';

export const MediaIndicator = GObject.registerClass(
class MediaIndicator extends PanelMenu.Button {
    _init(settings, extensionPath) {
        super._init(0.5, 'Spotify Control Centre');

        this._settings = settings;
        this._extensionPath = extensionPath;
        this._settingsSignalIds = [];
        this._buttonSignalIds = [];
        this._timeoutId = null;
        this._marqueeTimeoutId = null;
        this._marqueeGeneration = 0;
        this._panelText = '';
        this.activeProxy = null;

        this._buildPanelUI();

        this._popup = new MediaPopup(this.menu, this._settings, {
            prev: () => this.activeProxy?.controls().previous(),
            playPause: () => this.activeProxy?.controls().playPause(),
            next: () => this.activeProxy?.controls().next(),
            shuffle: () => this.activeProxy?.toggleShuffle(),
            repeat: () => this.activeProxy?.toggleRepeat(),
            seek: value => this.activeProxy?.controls().seek(value),
        }, this._extensionPath);

        this._connectSetting('show-play-pause', () => this._applyVisibility());
        this._connectSetting('show-prev', () => this._applyVisibility());
        this._connectSetting('show-next', () => this._applyVisibility());
        this._connectSetting('show-panel-title', () => this._updateState());
        this._connectSetting('show-panel-artist', () => this._updateState());
        this._connectSetting('button-spacing', () => this._applySpacing());
        this._connectSetting('label-margin', () => this._applySpacing());
        this._connectSetting('panel-label-width', () => this._applySpacing());
        this._connectSetting('marquee-enabled', () => this._scheduleMarquee());
        this._connectSetting('marquee-speed', () => this._scheduleMarquee());

        const onUpdate = () => {
            if (this.label && this.get_parent())
                this._updateState();
        };

        this.proxies = [new SpotifyProxy(onUpdate, this._settings)];
        for (const proxy of this.proxies) {
            proxy.init();
            proxy.onSeeked?.(position => {
                if (proxy === this.activeProxy)
                    this._popup.syncPosition(position);
            });
        }

        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._updateState();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _connectSetting(key, callback) {
        this._settingsSignalIds.push(
            this._settings.connect(`changed::${key}`, callback)
        );
    }

    _connectActionButton(button, callback) {
        const pressId = button.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== Clutter.BUTTON_PRIMARY)
                return Clutter.EVENT_PROPAGATE;

            callback();
            return Clutter.EVENT_STOP;
        });

        const releaseId = button.connect('button-release-event', () =>
            Clutter.EVENT_STOP
        );

        this._buttonSignalIds.push([button, pressId], [button, releaseId]);
    }

    _buildPanelUI() {
        this.box = new St.BoxLayout({
            style_class: 'spotify-compact-box',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.spotifyButton = new St.Button({
            style_class: 'spotify-logo-button',
            can_focus: true,
            child: new St.Icon({
                gicon: Gio.icon_new_for_string(
                    `${this._extensionPath}/icons/spotify.svg`
                ),
                icon_size: 16,
                style_class: 'spotify-logo-icon',
            }),
        });
        this._connectActionButton(this.spotifyButton, () => this._openSpotify());

        this.labelViewport = new St.Widget({
            style_class: 'spotify-panel-label-viewport',
            layout_manager: new Clutter.BinLayout(),
            clip_to_allocation: true,
            x_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.labelTrack = new St.BoxLayout({
            style_class: 'spotify-panel-label-track',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: false,
        });

        const makePanelLabel = () => {
            const label = new St.Label({
                text: 'Spotify',
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'spotify-panel-label',
            });
            label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            label.clutter_text.single_line_mode = true;
            return label;
        };

        this.label = makePanelLabel();
        this.labelClone = makePanelLabel();
        this.labelClone.visible = false;
        this.labelTrack.add_child(this.label);
        this.labelTrack.add_child(this.labelClone);
        this.labelViewport.add_child(this.labelTrack);

        // Anchor the dropdown to the fixed text viewport rather than the
        // complete control strip. This keeps the card centred under the text
        // even though the Spotify logo and media buttons sit either side.
        this.menu.sourceActor = this.labelViewport;
        this.menu.focusActor = this;
        this.menu._arrowAlignment = 0.5;

        this.btnBox = new St.BoxLayout({
            style_class: 'spotify-panel-controls',
            y_align: Clutter.ActorAlign.CENTER,
        });

        const makeButton = (iconName, callback) => {
            const button = new St.Button({
                style_class: 'spotify-panel-control-button',
                can_focus: true,
                child: new St.Icon({
                    icon_name: iconName,
                    icon_size: 14,
                    style_class: 'spotify-panel-control-icon',
                }),
            });
            this._connectActionButton(button, callback);
            return button;
        };

        this.prevBtn = makeButton('media-skip-backward-symbolic', () => {
            this.activeProxy?.controls().previous();
            this._popup?.resetPosition();
        });

        this.playIcon = new St.Icon({
            icon_name: 'media-playback-start-symbolic',
            icon_size: 15,
            style_class: 'spotify-panel-control-icon',
        });
        this.playBtn = new St.Button({
            style_class: 'spotify-panel-control-button',
            can_focus: true,
            child: this.playIcon,
        });
        this._connectActionButton(
            this.playBtn,
            () => this.activeProxy?.controls().playPause()
        );

        this.nextBtn = makeButton('media-skip-forward-symbolic', () => {
            this.activeProxy?.controls().next();
            this._popup?.resetPosition();
        });

        this.btnBox.add_child(this.prevBtn);
        this.btnBox.add_child(this.playBtn);
        this.btnBox.add_child(this.nextBtn);

        this.box.add_child(this.spotifyButton);
        this.box.add_child(this.labelViewport);
        this.box.add_child(this.btnBox);
        this.add_child(this.box);

        this.connect('scroll-event', (_actor, event) => {
            if (!this.activeProxy)
                return Clutter.EVENT_PROPAGATE;

            const direction = event.get_scroll_direction();
            if (direction === Clutter.ScrollDirection.UP)
                this.activeProxy.changeVolume(0.05);
            else if (direction === Clutter.ScrollDirection.DOWN)
                this.activeProxy.changeVolume(-0.05);
            else
                return Clutter.EVENT_PROPAGATE;

            return Clutter.EVENT_STOP;
        });

        this._applySpacing();
        this._applyVisibility();
    }

    _applySpacing() {
        const spacing = this._settings.get_int('button-spacing');
        const margin = this._settings.get_int('label-margin');
        const labelWidth = this._settings.get_int('panel-label-width');

        this.btnBox.style = `spacing: ${spacing}px;`;
        this.labelViewport.set_width(labelWidth);
        this.labelViewport.style = `width: ${labelWidth}px; margin-left: ${margin}px; margin-right: ${margin}px;`;
        this._scheduleMarquee();
    }

    _cancelMarquee() {
        this._marqueeGeneration++;

        if (this._marqueeTimeoutId) {
            GLib.source_remove(this._marqueeTimeoutId);
            this._marqueeTimeoutId = null;
        }

        if (this.labelTrack) {
            this.labelTrack.remove_all_transitions();
            this.labelTrack.translation_x = 0;
            this.labelTrack.set_width(-1);
        }

        if (this.label) {
            this.label.set_width(-1);
            this.label.translation_x = 0;
        }

        if (this.labelClone) {
            this.labelClone.set_width(-1);
            this.labelClone.visible = false;
        }
    }

    _scheduleMarquee() {
        this._cancelMarquee();

        if (!this.label || !this.label.visible ||
            !this._settings.get_boolean('marquee-enabled'))
            return;

        const generation = this._marqueeGeneration;
        this._marqueeTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            700,
            () => {
                this._marqueeTimeoutId = null;
                this._startMarquee(generation);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _startMarquee(generation) {
        if (generation !== this._marqueeGeneration ||
            !this.label || !this.labelTrack?.get_parent())
            return;

        // Measure the complete unellipsized string, then use a duplicated
        // label to produce a continuous loop. This prevents the text from
        // disappearing or leaving a blank interval while it scrolls.
        const [, naturalWidth] = this.label.get_preferred_width(-1);
        const viewportWidth = this._settings.get_int('panel-label-width');

        if (naturalWidth <= viewportWidth - 4) {
            this.labelClone.visible = false;
            this.labelTrack.translation_x = 0;
            return;
        }

        const gap = 28;
        this.label.set_width(naturalWidth);
        this.labelClone.set_width(naturalWidth);
        this.labelClone.visible = true;
        this.labelTrack.style = `spacing: ${gap}px;`;
        this.labelTrack.set_width((naturalWidth * 2) + gap);

        const distance = naturalWidth + gap;
        const speed = Math.max(10, this._settings.get_int('marquee-speed'));
        const duration = Math.max(2200, Math.round((distance / speed) * 1000));
        let firstRun = true;

        const run = () => {
            if (generation !== this._marqueeGeneration ||
                !this.labelTrack?.get_parent())
                return;

            this.labelTrack.translation_x = 0;
            this.labelTrack.ease({
                translation_x: -distance,
                duration,
                delay: firstRun ? 1000 : 120,
                mode: Clutter.AnimationMode.LINEAR,
                onComplete: () => {
                    firstRun = false;
                    run();
                },
            });
        };

        run();
    }

    _applyVisibility() {
        this.playBtn.visible = this._settings.get_boolean('show-play-pause');
        this.prevBtn.visible = this._settings.get_boolean('show-prev');
        this.nextBtn.visible = this._settings.get_boolean('show-next');
    }

    _updateState() {
        try {
            if (!this.label || !this.get_parent())
                return;

            const spotifyProxy = this.proxies[0];
            const info = spotifyProxy.getInfo();

            if (spotifyProxy.isAvailable() && info) {
                this.activeProxy = spotifyProxy;
                this.show();

                const isPlaying = info.status === 'Playing';
                this.playIcon.icon_name = isPlaying
                    ? 'media-playback-pause-symbolic'
                    : 'media-playback-start-symbolic';

                this._popup.updateControls(info);
                this._popup.updateTrack(info);
                this._updateLabel(info);
            } else {
                this._cancelMarquee();
                this._panelText = '';
                this.hide();
                this.activeProxy = null;
                this.menu.close();
            }
        } catch (error) {
            console.warn('Spotify Control Centre: update failed', error);
        }
    }

    _updateLabel(info) {
        const showTitle = this._settings.get_boolean('show-panel-title');
        const showArtist = this._settings.get_boolean('show-panel-artist');

        let text = '';
        if (info.placeholder) {
            text = 'Spotify';
        } else if (showTitle && showArtist) {
            text = `${info.artist} — ${info.title}`;
        } else if (showArtist) {
            text = info.artist;
        } else if (showTitle) {
            text = info.title;
        }

        const hasText = Boolean(text);
        this.label.visible = hasText;
        this.labelTrack.visible = hasText;
        this.labelViewport.visible = hasText;

        if (!hasText) {
            this._cancelMarquee();
            this.labelClone.visible = false;
            this._panelText = '';
            return;
        }

        if (text === this._panelText)
            return;

        this._panelText = text;
        this.labelClone.visible = false;
        this.label.set_text(text);
        this.labelClone.set_text(text);
        this._scheduleMarquee();
    }

    _openSpotify() {
        if (this.activeProxy) {
            Gio.DBus.session.call(
                SPOTIFY_BUS_NAME,
                SPOTIFY_OBJECT_PATH,
                MPRIS_ROOT_INTERFACE,
                'Raise',
                null,
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                (connection, result) => {
                    try {
                        connection.call_finish(result);
                    } catch (_error) {
                        this._launchSpotify();
                    }
                }
            );
        } else {
            this._launchSpotify();
        }
    }

    _launchSpotify() {
        for (const desktopId of ['spotify.desktop', 'com.spotify.Client.desktop']) {
            const app = Gio.DesktopAppInfo.new(desktopId);
            if (!app)
                continue;

            try {
                app.launch([], null);
                return;
            } catch (_error) {
                // Try the next known desktop file.
            }
        }

        try {
            GLib.spawn_command_line_async('spotify');
        } catch (error) {
            console.warn('Spotify Control Centre: could not launch Spotify', error);
        }
    }

    destroy() {
        this._cancelMarquee();

        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }

        for (const signalId of this._settingsSignalIds) {
            if (this._settings)
                this._settings.disconnect(signalId);
        }
        this._settingsSignalIds = [];

        for (const [actor, signalId] of this._buttonSignalIds) {
            if (actor)
                actor.disconnect(signalId);
        }
        this._buttonSignalIds = [];

        for (const proxy of this.proxies ?? [])
            proxy.destroy?.();

        this._popup?.destroy();
        this._popup = null;
        this.proxies = null;
        this.activeProxy = null;

        super.destroy();
    }
});
