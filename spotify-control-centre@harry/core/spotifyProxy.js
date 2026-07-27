import { MprisClient } from './mprisClient.js';

// ========= CONFIGURATION =========
const SpotifyKeys = {
    BUS_NAME: 'org.mpris.MediaPlayer2.spotify',
    TRACK_ID: 'mpris:trackid',
    TITLE: 'xesam:title',
    ARTIST: 'xesam:artist',
    ALBUM: 'xesam:album',
    ART_URL: 'mpris:artUrl',
    LENGTH: 'mpris:length'
};

export class SpotifyProxy {
    constructor(onChange, settings) {
        this.client = new MprisClient(SpotifyKeys.BUS_NAME, onChange);
        this._settings = settings;
        this._seekedCallback = null;
        this._lastSavedKey = '';
    }

    // ========= INITIALIZATION =========
    async init() {
        await this.client.init();
        if (this.client._proxy) {
            this.client._proxy.connectSignal('Seeked', (proxy, sender, [position]) => {
                if (this._seekedCallback) this._seekedCallback(position);
            });
        }
    }

    destroy() {
        if (this.client) this.client.destroy();
        this._seekedCallback = null;
        this._settings = null;
    }

    onSeeked(callback) { this._seekedCallback = callback; }
    isAvailable() { return Boolean(this.client?.Available); }

    _runtimeState() {
        return {
            source: 'Spotify',
            status: this.client.Status,
            position: this.client.Position,
            shuffle: this.client.Shuffle,
            loopStatus: this.client.LoopStatus,
            rate: 1.0,
        };
    }

    _saveLastTrack(info) {
        if (!this._settings || !info?.title || info.placeholder)
            return;

        const key = [info.title, info.artist, info.album, info.artUrl, info.trackId, info.length].join('\u241f');
        if (key === this._lastSavedKey)
            return;

        this._lastSavedKey = key;
        try {
            this._settings.set_string('last-track-title', info.title || '');
            this._settings.set_string('last-track-artist', info.artist || '');
            this._settings.set_string('last-track-album', info.album || '');
            this._settings.set_string('last-track-art-url', info.artUrl || '');
            this._settings.set_string('last-track-id', info.trackId || '');
            this._settings.set_string('last-track-length', String(info.length || 0));
        } catch (e) {
            console.warn('Spotify Control Centre: could not save last track', e);
        }
    }

    _loadLastTrack() {
        if (!this._settings)
            return null;

        try {
            const title = this._settings.get_string('last-track-title');
            if (!title)
                return null;

            return {
                title,
                artist: this._settings.get_string('last-track-artist') || 'Unknown Artist',
                album: this._settings.get_string('last-track-album') || '',
                artUrl: this._settings.get_string('last-track-art-url') || '',
                trackId: this._settings.get_string('last-track-id') || '/org/mpris/MediaPlayer2/TrackList/NoTrack',
                length: Number(this._settings.get_string('last-track-length') || 0),
                cached: true,
            };
        } catch (e) {
            return null;
        }
    }

    // ========= DATA FETCHING =========
    getInfo() {
        if (!this.client || !this.client.Available)
            return null;

        const runtime = this._runtimeState();
        const meta = this.client.Metadata;
        const title = meta?.[SpotifyKeys.TITLE];
        const artists = meta?.[SpotifyKeys.ARTIST];
        const hasTrack = Boolean(title || (Array.isArray(artists) && artists.length));

        if (hasTrack) {
            const info = {
                ...runtime,
                title: title || 'Unknown Track',
                artist: artists?.join(', ') || 'Unknown Artist',
                album: meta?.[SpotifyKeys.ALBUM] || '',
                artUrl: meta?.[SpotifyKeys.ART_URL] || '',
                trackId: meta?.[SpotifyKeys.TRACK_ID] || '/org/mpris/MediaPlayer2/TrackList/NoTrack',
                length: meta?.[SpotifyKeys.LENGTH] || 0,
            };
            this._saveLastTrack(info);
            return info;
        }

        const cached = this._loadLastTrack();
        if (cached)
            return { ...runtime, ...cached };

        // Spotify is open, but has not exposed any track metadata yet.
        return {
            ...runtime,
            title: 'Spotify',
            artist: '',
            album: '',
            artUrl: '',
            trackId: '/org/mpris/MediaPlayer2/TrackList/NoTrack',
            length: 0,
            placeholder: true,
        };
    }

    // ========= PLAYER ACTIONS =========
    seek(percent) {
        const info = this.getInfo();
        if (info?.length && !info.cached) {
            const newPosMicro = Math.floor(percent * info.length);
            this.client.seek(info.trackId, newPosMicro);
        }
    }

    controls() {
        return {
            playPause: () => this.client.playPause(),
            next: () => this.client.next(),
            previous: () => this.client.previous(),
            seek: (percent) => this.seek(percent)
        };
    }

    toggleShuffle() { this.client.Shuffle = !this.client.Shuffle; }

    toggleRepeat() {
        const current = this.client.LoopStatus;
        const next = current === 'None' ? 'Playlist' : current === 'Playlist' ? 'Track' : 'None';
        this.client.LoopStatus = next;
    }

    changeVolume(delta) {
        const currentVol = this.client.Volume || 1.0;
        this.client.Volume = Math.max(0.0, Math.min(1.0, currentVol + delta));
    }
}
