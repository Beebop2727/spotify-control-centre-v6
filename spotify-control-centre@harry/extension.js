/*
 * Spotify Control Centre
 * Modified 24 July 2026.
 *
 * Based on Spotify Controller by NarkAgni and Spotify Controls by Sonath21.
 * Distributed under the GNU General Public License v3.0 or later.
 */

import GLib from 'gi://GLib';
import {MediaIndicator} from './ui/panel.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const SPACE_BAR_STYLE_CLASS = 'space-bar';

export default class SpotifyControlCentreExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._orderTimeoutId = null;
        this._setupIndicator();
        this._positionSignalId = this._settings.connect(
            'changed::position',
            () => this._reload()
        );
    }

    _reload() {
        this._removeIndicator();
        this._setupIndicator();
    }

    _setupIndicator() {
        this._indicator = new MediaIndicator(this._settings, this.path);

        const position = this._settings.get_string('position');
        let section = 'left';
        let index = 0;

        if (position === 'right') {
            section = 'right';
            index = 1;
        } else if (position === 'center-before') {
            section = 'center';
            index = 0;
        } else if (position === 'center-after') {
            section = 'center';
            index = 1;
        }

        Main.panel.addToStatusArea(this.uuid, this._indicator, index, section);

        if (section === 'left')
            this._startOrderEnforcer();
    }

    _getPanelActor(indicator) {
        return indicator?.container ?? indicator ?? null;
    }

    _actorContainsStyleClass(actor, styleClass, depth = 0) {
        if (!actor || depth > 4)
            return false;

        try {
            if (actor.has_style_class_name?.(styleClass))
                return true;
        } catch (_error) {
            // Some intermediary actors are not St widgets.
        }

        try {
            const classes = actor.get_style_class_name?.()
                ?? actor.style_class
                ?? actor.styleClass
                ?? '';
            if (String(classes).split(/\s+/).includes(styleClass))
                return true;
        } catch (_error) {
            // Keep searching descendants.
        }

        const children = actor.get_children?.() ?? [];
        return children.some(child =>
            this._actorContainsStyleClass(child, styleClass, depth + 1)
        );
    }

    _findWorkspaceActor(leftBox) {
        // Space Bar registers itself using its display name, but searching by
        // CSS class as well makes this robust across translated names and
        // minor upstream changes.
        for (const indicator of Object.values(Main.panel.statusArea ?? {})) {
            const actor = this._getPanelActor(indicator);
            if (actor?.get_parent?.() === leftBox &&
                this._actorContainsStyleClass(actor, SPACE_BAR_STYLE_CLASS))
                return actor;
        }

        return (leftBox.get_children?.() ?? []).find(actor =>
            this._actorContainsStyleClass(actor, SPACE_BAR_STYLE_CLASS)
        ) ?? null;
    }

    _placeAfterWorkspace() {
        if (!this._indicator)
            return;

        const leftBox = Main.panel._leftBox;
        const spotifyActor = this._getPanelActor(this._indicator);
        const workspaceActor = this._findWorkspaceActor(leftBox);

        if (!leftBox || !spotifyActor || !workspaceActor ||
            spotifyActor === workspaceActor ||
            spotifyActor.get_parent?.() !== leftBox ||
            workspaceActor.get_parent?.() !== leftBox)
            return;

        const children = leftBox.get_children();
        const workspaceIndex = children.indexOf(workspaceActor);
        const spotifyIndex = children.indexOf(spotifyActor);

        if (workspaceIndex < 0 || spotifyIndex < 0 ||
            spotifyIndex === workspaceIndex + 1)
            return;

        // Reorder the existing actor rather than destroying/recreating it, so
        // playback state, popup state and MPRIS connections remain untouched.
        if (typeof leftBox.set_child_at_index === 'function') {
            leftBox.set_child_at_index(spotifyActor, workspaceIndex + 1);
            return;
        }

        // Fallback for older Clutter APIs.
        leftBox.remove_child(spotifyActor);
        const refreshedWorkspaceIndex = leftBox.get_children().indexOf(workspaceActor);
        leftBox.insert_child_at_index(spotifyActor, refreshedWorkspaceIndex + 1);
    }

    _startOrderEnforcer() {
        this._stopOrderEnforcer();
        this._placeAfterWorkspace();

        // Extension startup order is not deterministic. Space Bar may create
        // or rebuild its actor after Spotify Control Centre has loaded, so a
        // lightweight periodic check keeps the requested order stable.
        this._orderTimeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            1,
            () => {
                if (!this._indicator)
                    return GLib.SOURCE_REMOVE;

                this._placeAfterWorkspace();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _stopOrderEnforcer() {
        if (!this._orderTimeoutId)
            return;

        GLib.source_remove(this._orderTimeoutId);
        this._orderTimeoutId = null;
    }

    _removeIndicator() {
        this._stopOrderEnforcer();
        this._indicator?.destroy();
        this._indicator = null;
    }

    disable() {
        if (this._positionSignalId && this._settings)
            this._settings.disconnect(this._positionSignalId);

        this._positionSignalId = null;
        this._removeIndicator();
        this._settings = null;
    }
}
