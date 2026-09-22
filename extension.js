/*
 * fast-translate@tazztone.github.io
 *
 * Copyright (c) 2022 Lorenzo Carbonell Cerezo <a.k.a. atareao>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

import Gio from "gi://Gio";
import Clutter from "gi://Clutter";
import St from "gi://St";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Pango from "gi://Pango";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import Soup from "gi://Soup?version=3.0";

import { Extension, gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";
import { parseCountryCode, buildRequestQuery, formatLanguageLabel, parseLanguageName, getFlagEmoji } from "./translation-helper.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

const Clipboard = St.Clipboard.get_default();
const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

const SHORTCUT_SETTING_KEY = "keybinding-translate-clipboard";
const TIMEOUT_MS = 500;
// Same-text re-trigger suppression window (µs). After a floating window is
// triggered, repeated double-copies of the SAME text are ignored for this long.
const FLOATING_RETRIGGER_COOLDOWN_US = 2500000; // 2.5s

class Tooltip {
    constructor(actor, text) {
        this._actor = actor;
        this._text = text;
        this._tooltipActor = null;
        this._timeoutId = null;

        this._hoverId = this._actor.connect('notify::hover', () => {
            if (this._actor.hover) {
                this._startTimer();
            } else {
                this._cancelTimer();
                this._hide();
            }
        });

        this._destroyId = this._actor.connect('destroy', () => this.destroy());
    }

    _startTimer() {
        this._cancelTimer();
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TIMEOUT_MS, () => {
            this._show();
            this._timeoutId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelTimer() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
    }

    _show() {
        this._hide();

        this._tooltipActor = new St.Label({
            text: typeof this._text === 'function' ? this._text() : this._text,
            style_class: 'translate-tooltip'
        });

        Main.uiGroup.add_child(this._tooltipActor);

        this._allocationId = this._tooltipActor.connect('notify::allocation', () => {
            if (!this._tooltipActor) return;
            this._tooltipActor.disconnect(this._allocationId);
            this._allocationId = null;

            let [x, y] = this._actor.get_transformed_position();
            let width = this._actor.get_width();
            let height = this._actor.get_height();

            let tooltipWidth = this._tooltipActor.get_width();
            let tooltipHeight = this._tooltipActor.get_height();

            let tx = x + (width - tooltipWidth) / 2;
            let ty = y - tooltipHeight - 6;

            if (ty < 0) {
                ty = y + height + 6;
            }
            if (tx < 5) tx = 5;

            this._tooltipActor.set_position(Math.round(tx), Math.round(ty));
        });
    }

    _hide() {
        this._cancelTimer();
        if (this._allocationId && this._tooltipActor) {
            try { this._tooltipActor.disconnect(this._allocationId); } catch (_e) {}
            this._allocationId = null;
        }
        if (this._tooltipActor) {
            this._tooltipActor.destroy();
            this._tooltipActor = null;
        }
    }

    destroy() {
        this._hide();
        if (this._hoverId) {
            this._actor.disconnect(this._hoverId);
            this._hoverId = null;
        }
        if (this._destroyId) {
            this._actor.disconnect(this._destroyId);
            this._destroyId = null;
        }
    }

    hide() { this._hide(); }
}

// Note: Internal widget signals and one-shot GLib.idle_add sources auto-cleanup on deactivation.
var FastTranslate = GObject.registerClass(
    class FastTranslate extends PanelMenu.Button {
        _init(extension) {
            super._init(0.5, 'FastTranslate', false);
            this._extension = extension;
            this._settings = extension.getSettings();

            this._destroyed = false;
            this._httpSession = new Soup.Session({ timeout: 10 });
            this._cancellable = null;
            this._tooltips = [];
            this.FloatingTranslationWindow = FloatingTranslationWindow;

            this._settingsChangedId = null;
            this._clipboardTimeoutId = null;
            this._selectionOwnerChangedId = null;
            this._isInternalCopy = false;
            this._internalCopyTimeoutId = null;
            this._safetyTimeoutId = null;
            this._lastTriggeredText = null;
            this._lastTriggeredTime = null;
            this._lastClipboardTime = null;
            this._lastClipboardText = null;
            // Tracks whether the global keybinding is currently registered, so
            // _unbindShortcut() never asks mutter to remove one that isn't there.
            this._shortcutBound = false;

            /* Icon indicator */
            let box = new St.BoxLayout();
            this.icon = new St.Icon({ style_class: 'system-status-icon' });
            box.add_child(this.icon);
            this.add_child(box);

            this._source_lang = this._get_country_code(this._getValue('source-lang'));
            this._target_lang = this._get_country_code(this._getValue('target-lang'));

            /* Translation block */
            this.menu.addMenuItem(this._menuTranslationBlock());

            /* Separator */
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            /* Toggles at the bottom */
            this.autoPasteSwitch = new PopupMenu.PopupSwitchMenuItem(
                _('Auto Paste from clipboard'), this._getValue("auto-paste"), {});
            this.autoPasteSwitch.activate = function(event) { this.toggle(); };
            this.menu.addMenuItem(this.autoPasteSwitch);
            this.autoPasteSwitch.connect('toggled', (item, state) => {
                this._settings.set_boolean('auto-paste', state);
                this._set_icon_indicator();
            });

            this.autoTranslateSwitch = new PopupMenu.PopupSwitchMenuItem(
                _('Auto Translate'), this._getValue("auto-translate"), {});
            this.autoTranslateSwitch.activate = function(event) { this.toggle(); };
            this.menu.addMenuItem(this.autoTranslateSwitch);
            this.autoTranslateSwitch.connect('toggled', (item, state) => {
                this._settings.set_boolean('auto-translate', state);
            });

            this.autoCopySwitch = new PopupMenu.PopupSwitchMenuItem(
                _('Auto Copy to clipboard'), this._getValue("auto-copy"), {});
            this.autoCopySwitch.activate = function(event) { this.toggle(); };
            this.menu.addMenuItem(this.autoCopySwitch);
            this.autoCopySwitch.connect('toggled', (item, state) => {
                this._settings.set_boolean('auto-copy', state);
            });

            this.shortcutSwitch = new PopupMenu.PopupSwitchMenuItem(
                _('Enable Keyboard Shortcut (Super+T)'), this._getValue("shortcut-enabled"), {});
            this.shortcutSwitch.activate = function(event) { this.toggle(); };
            this.menu.addMenuItem(this.shortcutSwitch);
            this.shortcutSwitch.connect('toggled', (item, state) => {
                this._settings.set_boolean('shortcut-enabled', state);
                if (state) {
                    this._bindShortcut();
                } else {
                    this._unbindShortcut();
                }
            });

            /* Separator */
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            /* Settings */
            this.settingsMenuItem = new PopupMenu.PopupMenuItem(_("Settings"));
            this.settingsMenuItem.connect('activate', () => {
                this._extension.openPreferences();
            });
            this.menu.addMenuItem(this.settingsMenuItem);

            /* Init */
            this._settingsChanged();
            this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
                this._settingsChanged(key);
            });

            this._setupListener();

            this._addTooltip(this.autoPasteSwitch, _("Automatically paste clipboard text when menu opens"));
            this._addTooltip(this.autoTranslateSwitch, _("Translate input text automatically while typing"));
            this._addTooltip(this.autoCopySwitch, _("Copy translation results to clipboard automatically"));
            this._addTooltip(this.settingsMenuItem, _("Open extension preferences"));

            this.menu.connect('open-state-changed', (menu, isOpen) => {
                if (this._destroyed) {
                    return;
                }
                if (this._tooltips) {
                    this._tooltips.forEach(t => t._hide());
                }
                if (!isOpen) {
                    this._toggleLanguageSelector(true, false);
                } else {
                    if (this.autoPasteSwitch.state === true) {
                        Clipboard.get_text(CLIPBOARD_TYPE, (_, clipboardText) => {
                            if (this._destroyed) {
                                return;
                            }
                            if (clipboardText) {
                                this.inputEntry.get_clutter_text().set_text(clipboardText);
                            }
                        });
                    }
                    // Give keyboard focus to the input box so the user can type immediately
                    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                        if (this._destroyed) {
                            return GLib.SOURCE_REMOVE;
                        }
                        global.stage.set_key_focus(this.inputEntry.get_clutter_text());
                        return GLib.SOURCE_REMOVE;
                    });
                }
            });
        }

        _addTooltip(actor, text) {
            let t = new Tooltip(actor, text);
            this._tooltips.push(t);
            return t;
        }

        _setupListener() {
            const metaDisplay = global.display;
            if (metaDisplay && typeof metaDisplay.get_selection === 'function') {
                const selection = metaDisplay.get_selection();
                this._setupSelectionTracking(selection);
            } else {
                this._setupTimeout();
            }
        }

        _setupSelectionTracking(selection) {
            this.selection = selection;
            this._selectionOwnerChangedId = selection.connect('owner-changed', (selection, selectionType, selectionSource) => {
                this._onSelectionChange(selection, selectionType, selectionSource);
            });
        }

        _translateIfAutoPaste(knownText) {
            if (this.autoPasteSwitch.state !== true) {
                return;
            }

            const apply = (fromText) => {
                if (this._destroyed) {
                    return;
                }
                if (fromText && fromText !== "") {
                    this.inputEntry.get_clutter_text().set_text(fromText);
                    if (this.autoTranslateSwitch.state === true) {
                        this._translateText(true, fromText, (toText) => {
                            if (this._destroyed) {
                                return;
                            }
                            this.outputEntry.get_clutter_text().set_text(toText);
                            if (this.autoCopySwitch.state === true) {
                                this._copyToClipboard(toText);
                            }
                        });
                    }
                }
            };

            // Reuse the text the selection handler already read instead of paying a
            // second clipboard IPC round-trip on every Ctrl+C. Only read here when no
            // text was supplied (the polling fallback path).
            if (typeof knownText === 'string') {
                apply(knownText);
            } else {
                Clipboard.get_text(CLIPBOARD_TYPE, (_, fromText) => apply(fromText));
            }
        }

        _onSelectionChange(_a, selectionType, _b) {
            if (selectionType !== Meta.SelectionType.SELECTION_CLIPBOARD) return;
            // Plan B: sequence guard — two rapid get_text callbacks can return
            // out of order and swallow a double-C. Stale callbacks bail out here.
            const seq = (this._clipboardSeq = (this._clipboardSeq || 0) + 1);
            if (this._isInternalCopy) {
                this._isInternalCopy = false;
                if (this._internalCopyTimeoutId) {
                    GLib.Source.remove(this._internalCopyTimeoutId);
                    this._internalCopyTimeoutId = null;
                }
                return;
            }

            let now = GLib.get_monotonic_time();

            Clipboard.get_text(CLIPBOARD_TYPE, (_, text) => {
                if (this._destroyed) {
                    return;
                }
                if (seq !== this._clipboardSeq) return; // superseded by a newer selection event
                if (!text || text.trim() === '') return;

                if (this._lastClipboardTime && this._lastClipboardText !== null) {
                    let diff = now - this._lastClipboardTime;
                    // Trigger only if same content AND within 50ms–2s window.
                    // Identical content means the user pressed Ctrl+C on the same selection.
                    // Clipboard managers (e.g. GSConnect) always change the content slightly,
                    // so they won't accidentally trigger the floating window.
                    if (diff >= 50000 && diff < 2000000 && text === this._lastClipboardText) {
                        // Same-text cooldown: while it is active, repeated double-copies
                        // are suppressed. Each suppressed double-copy refreshes the
                        // timestamp, so continuous Ctrl+C spam keeps extending the
                        // cooldown and can never open a second window.
                        if (this._lastTriggeredText === text &&
                            this._lastTriggeredTime &&
                            (now - this._lastTriggeredTime) < FLOATING_RETRIGGER_COOLDOWN_US) {
                            this._lastTriggeredTime = now; // extend cooldown
                            this._lastClipboardTime = now;
                            this._lastClipboardText = text;
                            return;
                        }
                        this._lastTriggeredText = text;
                        this._lastTriggeredTime = now;
                        // Refresh the baseline (do NOT null it): every copy during
                        // spam must keep hitting this branch so the cooldown is
                        // extended on each one.
                        this._lastClipboardTime = now;
                        this._lastClipboardText = text;
                        this._triggerFloatingTranslation(text);
                        return;
                    }
                }

                this._lastClipboardTime = now;
                this._lastClipboardText = text;
                this._translateIfAutoPaste(text);
            });
        }

        _setupTimeout(reiterate) {
            reiterate = typeof reiterate === 'boolean' ? reiterate : true;

            this._clipboardTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TIMEOUT_MS, () => {
                this._translateIfAutoPaste();

                if (reiterate === false) {
                    this._clipboardTimeoutId = null;
                }

                return reiterate;
            });
        }

        _clearClipboardTimeout() {
            if (!this._clipboardTimeoutId) {
                return;
            }

            GLib.Source.remove(this._clipboardTimeoutId);
            this._clipboardTimeoutId = null;
        }

        _disconnectSelectionListener() {
            if (!this._selectionOwnerChangedId || !this.selection) {
                return;
            }

            this.selection.disconnect(this._selectionOwnerChangedId);
            this._selectionOwnerChangedId = null;
        }

        _disconnectSettings() {
            if (!this._settingsChangedId) {
                return;
            }

            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        _loadPreferences(changedKey) {
            this._translation_service = this._settings.get_enum('translation-service');
            this._source_lang = this._get_country_code(this._getValue('source-lang'));
            this._target_lang = this._get_country_code(this._getValue('target-lang'));
            this._split_sentences = this._getValue('split-sentences');
            this._preserve_formatting = this._getValue('preserve-formatting');
            this._formality = this._getValue('formality');
            this._url = this._getValue('url');
            this._apikey = this._getValue('apikey');
            this._notifications = this._getValue('notifications');
            this._darktheme = this._getValue('darktheme');

            this._showPanelIcon = this._getValue('show-panel-icon');
            this.visible = this._showPanelIcon;

            this.autoPasteSwitch.setToggleState(this._getValue('auto-paste'));
            this.autoTranslateSwitch.setToggleState(this._getValue('auto-translate'));
            this.autoCopySwitch.setToggleState(this._getValue('auto-copy'));
            if (this.shortcutSwitch) {
                this.shortcutSwitch.setToggleState(this._getValue('shortcut-enabled'));
            }

            this._set_icon_indicator();
            // Only touch the global keybinding when it can actually have changed.
            // Rebinding on every settings write (each menu toggle writes one) is
            // wasted work: mutter already tracks the keybinding setting itself.
            if (changedKey === undefined || changedKey === 'shortcut-enabled' ||
                changedKey === SHORTCUT_SETTING_KEY) {
                this._unbindShortcut();
                if (this._getValue('shortcut-enabled')) {
                    this._bindShortcut();
                }
            }
        }

        _bindShortcut() {
            if (this._shortcutBound) {
                return;
            }
            Main.wm.addKeybinding(
                SHORTCUT_SETTING_KEY,
                this._settings,
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                () => {
                    if (this._destroyed) {
                        return;
                    }
                    // Show the menu immediately instead of waiting for the clipboard
                    // round-trip: that read is an async IPC hop, and gating menu.open()
                    // on it delayed the popup and left it closed entirely when the
                    // clipboard was empty. Text and translation fill in below.
                    this.menu.open();
                    Clipboard.get_text(CLIPBOARD_TYPE, (_, fromText) => {
                        if (this._destroyed) {
                            return;
                        }
                        if (fromText && fromText !== "") {
                            const requestText = this._truncateForCharLimit(fromText);
                            this.inputEntry.get_clutter_text().set_text(requestText);
                            this._triggerTranslation();
                        }
                    });
                }
            );
            this._shortcutBound = true;
        }

        _unbindShortcut() {
            if (!this._shortcutBound) {
                return;
            }
            Main.wm.removeKeybinding(SHORTCUT_SETTING_KEY);
            this._shortcutBound = false;
        }

        _translateText(fromOrTo, fromText, callback) {
            if (fromText && fromText !== "") {
                if (this.errorLabel) {
                    this.errorLabel.text = "";
                }
                
                if (this._cancellable) this._cancellable.cancel();
                this._cancellable = new Gio.Cancellable();
                // Identity of THIS request. The cancelled request's callback fires
                // asynchronously afterwards, so it must not touch shared state that
                // now belongs to the newer request.
                const myCancellable = this._cancellable;
                if (this.translateBtn) {
                    this.translateBtn.label = _("Cancel");
                }

                const targetLang = fromOrTo === true ? this._target_lang : this._source_lang;
                const sourceLang = fromOrTo === true ? this._source_lang : this._target_lang;

                let message;
                if (this._translation_service === 1) {
                    // Google Translate (Auth-Free)
                    const sl = sourceLang === 'AUTO' ? 'auto' : sourceLang.toLowerCase();
                    const tl = targetLang.toLowerCase();
                    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t`;

                    const bodyObj = { q: fromText };
                    const body = buildRequestQuery(bodyObj);
                    const bytes = new GLib.Bytes(body);

                    try {
                        message = Soup.Message.new('POST', url);
                        if (!message) {
                            throw new Error(_("Invalid URL"));
                        }
                    } catch (e) {
                        this._showError(`${_("Error")}: ${e.message}`);
                        this._cancellable = null;
                        if (this.translateBtn) {
                            this.translateBtn.label = _("Translate");
                        }
                        return;
                    }

                    message.set_request_body_from_bytes('application/x-www-form-urlencoded', bytes);
                    message.request_headers.replace('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
                } else {
                    // DeepL
                    const bodyObj = {
                        text: [fromText],
                        target_lang: targetLang,
                        split_sentences: this._split_sentences ? "1" : "0",
                        preserve_formatting: !!this._preserve_formatting,
                    };

                    if (sourceLang && sourceLang !== 'AUTO') {
                        bodyObj.source_lang = sourceLang;
                    }

                    if (this._formality && this._formality !== 'default') {
                        if (this._formality === 'more') {
                            bodyObj.formality = 'prefer_more';
                        } else if (this._formality === 'less') {
                            bodyObj.formality = 'prefer_less';
                        } else {
                            bodyObj.formality = this._formality;
                        }
                    }

                    const body = JSON.stringify(bodyObj);
                    const bytes = new GLib.Bytes(body);

                    try {
                        if (!this._isSafeDeepLUrl(this._url)) {
                            throw new Error(_("DeepL URL must use HTTPS"));
                        }
                        message = Soup.Message.new('POST', this._url);
                        if (!message) {
                            throw new Error(_("Invalid URL"));
                        }
                    } catch (e) {
                        this._showError(`${_("Error")}: ${e.message}`);
                        this._cancellable = null;
                        if (this.translateBtn) {
                            this.translateBtn.label = _("Translate");
                        }
                        return;
                    }

                    message.request_headers.replace('Authorization', `DeepL-Auth-Key ${this._apikey}`);
                    message.set_request_body_from_bytes('application/json', bytes);
                }
                
                if (this._destroyed || !this._httpSession) {
                    this._cancellable = null;
                    if (this.translateBtn) {
                        this.translateBtn.label = _("Translate");
                    }
                    return;
                }

                this._httpSession.send_and_read_async(
                    message,
                    GLib.PRIORITY_DEFAULT,
                    myCancellable,
                    (session, result) => {
                        let resBytes;
                        try {
                            resBytes = session.send_and_read_finish(result);
                        } catch (e) {
                            if (this._destroyed) {
                                return;
                            }
                            // Superseded by a newer request: leave its cancellable,
                            // button label and error label alone.
                            if (this._cancellable !== myCancellable) {
                                return;
                            }
                            this._cancellable = null;
                            if (this.translateBtn) {
                                this.translateBtn.label = _("Translate");
                            }
                            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED) || e.code === Gio.IOErrorEnum.CANCELLED) {
                                this._showError(_("Cancelled"));
                            } else {
                                this._showError(`Error: ${e.message || e}`);
                            }
                            return;
                        }

                        if (this._destroyed) {
                            return;
                        }
                        if (this._cancellable !== myCancellable) {
                            return;
                        }
                        this._cancellable = null;
                        if (this.translateBtn) {
                            this.translateBtn.label = _("Translate");
                        }
                        try {
                            if (message.status_code === 200) {
                                let decoder = new TextDecoder("utf-8");
                                let response = decoder.decode(resBytes.get_data());
                                let json = JSON.parse(response);
                                
                                let toText = "";
                                if (this._translation_service === 1) {
                                    toText = (json && json[0]) ? json[0].map(part => part[0]).join('') : "";
                                } else {
                                    let translations = json.translations;
                                    toText = (translations && translations.length > 0) ? translations[0].text : "";
                                }
                                
                                if (this._notifications) {
                                    Main.notify("Fast Translate", _("Translated"));
                                }
                                callback(toText);
                            } else if (this._translation_service === 1 && (message.status_code === 403 || message.status_code === 429)) {
                                this._showError(_("Rate-limited or blocked by Google Translate. Please try again later."));
                            } else if (message.status_code === 403) {
                                let errMsg = _("Auth failed (403): check API key and URL in settings");
                                try {
                                    let decoder = new TextDecoder("utf-8");
                                    let body = JSON.parse(decoder.decode(resBytes.get_data()));
                                    if (body && body.message) errMsg += `\n${body.message}`;
                                } catch (_e) {}
                                this._showError(errMsg);
                            } else {
                                let errMsg = `Error: ${message.status_code}`;
                                try {
                                    let decoder = new TextDecoder("utf-8");
                                    let body = JSON.parse(decoder.decode(resBytes.get_data()));
                                    if (body && body.message) errMsg += `\n${body.message}`;
                                } catch (_e) {}
                                this._showError(errMsg);
                            }
                        } catch (e) {
                            this._showError(`Error: ${e.message || e}`);
                        }
                    }
                );
            }
        }

        _triggerFloatingTranslation(fromText) {
            if (this._floatingWindow) {
                this._floatingWindow.destroy();
                this._floatingWindow = null;
            }

            let isBackground = this._settings.get_boolean('floating-background-mode');

            // Per-service character limit for the single request (shown, never
            // silent). Truncate the REQUEST source, keep full text on display.
            const serviceName = this._translation_service === 1 ? 'Google' : 'DeepL';
            const charLimit = this._translation_service === 1 ? FLOAT_GOOGLE_CHAR_LIMIT : FLOAT_DEEPL_CHAR_LIMIT;
            const requestText = (charLimit > 0 && fromText.length > charLimit)
                ? fromText.slice(0, charLimit)
                : fromText;

            const reTranslate = () => {
                // Same identity guard as the main reply path: the window that was
                // open when swap was pressed may be gone by the time we answer.
                const targetWin = this._floatingWindow;
                this._translateTextIndependent(requestText, (toText, errMsg) => {
                    if (this._destroyed) return;
                    if (targetWin && this._floatingWindow !== targetWin) return;
                    const w = this._floatingWindow;
                    if (w) {
                        try {
                            w.setTargetText(toText && toText.trim() !== ""
                                ? toText
                                : (errMsg || _('Translation failed — please try again.')));
                        } catch (_e) {}
                    }
                });
            };

            if (!isBackground) {
                // Plan A: open the window immediately so the double-C feels
                // instant; the translation fills in when the reply arrives.
                const PLACEHOLDER = _('Translating…');
                let win = null;
                try {
                    win = new FloatingTranslationWindow(
                        fromText,
                        PLACEHOLDER,
                        this._source_lang,
                        this._target_lang,
                        () => {
                            // Only clear the slot if it still points at THIS window —
                            // a newer trigger may have replaced it already.
                            if (this._floatingWindow === win) {
                                this._floatingWindow = null;
                            }
                        },
                        (text) => {
                            this._copyToClipboard(text);
                        },
                        this._settings,
                        {
                            onSwap: () => {
                                if (this._destroyed) return;
                                const oldTargetLang = this._target_lang;
                                this._target_lang = this._source_lang;
                                this._source_lang = oldTargetLang;
                                const w = this._floatingWindow;
                                if (w) {
                                    try {
                                        w.refreshLangs(this._source_lang, this._target_lang);
                                        w.setTargetText(PLACEHOLDER);
                                    } catch (_e) {}
                                }
                                reTranslate();
                            },
                            charLimit,
                            serviceName,
                            srcLength: fromText.length,
                        }
                    );
                } catch (e) {
                    // The constructor cleans up its own actors before rethrowing;
                    // never let a build failure escape into the signal handler.
                    win = null;
                    this._showError(`${_("Error")}: ${e.message || e}`);
                }
                this._floatingWindow = win;
                if (win) {
                    try {
                        // Safety net: Soup errors surface via _showError without a
                        // callback, so never leave the placeholder stuck forever.
                        // Drop any timer from a previous trigger first: otherwise the
                        // stale source stays alive and its callback nulls the new id,
                        // leaving destroy() unable to remove the live timer.
                        if (this._safetyTimeoutId) {
                            GLib.Source.remove(this._safetyTimeoutId);
                            this._safetyTimeoutId = null;
                        }
                        this._safetyTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 12000, () => {
                            this._safetyTimeoutId = null;
                            try {
                                if (win._currentTarget === PLACEHOLDER && this._floatingWindow === win) {
                                    win.setTargetText(_('Translation failed — please try again.'));
                                }
                            } catch (_e) {}
                            return GLib.SOURCE_REMOVE;
                        });
                    } catch (_e) {}
                }
            }

            // Capture the window this request belongs to. A newer double-C may
            // replace this._floatingWindow before the reply lands, and a stale reply
            // must never be written into the new window.
            const myWin = this._floatingWindow;
            this._translateTextIndependent(requestText, (toText, errMsg) => {
                if (toText && toText.trim() !== "") {
                    if (this._destroyed) return;

                    if (isBackground) {
                        this._copyToClipboard(toText);
                        if (this._settings.get_boolean('floating-background-toast')) {
                            Main.notify(_("Translated"), `${requestText} → ${toText}`);
                        }
                    } else {
                        // Only the display write is guarded: a stale reply must not
                        // paint the new window. Auto-copy stays unconditional, as in
                        // upstream — it must still fire when the window was closed.
                        if (myWin && this._floatingWindow === myWin) {
                            try { myWin.setTargetText(toText); } catch (_e) {}
                        }
                        if (this._settings.get_boolean('floating-auto-copy') === true) {
                            this._copyToClipboard(toText);
                        }
                    }
                } else if (!isBackground && myWin && this._floatingWindow === myWin) {
                    // Empty reply or reported failure: surface the reason in the
                    // open window instead of leaving the placeholder until the
                    // 12s safety net fires.
                    try {
                        myWin.setTargetText(errMsg || _('Translation failed — please try again.'));
                    } catch (_e) {}
                }
            });
        }

        _translateTextIndependent(fromText, callback) {
            if (!fromText || fromText.trim() === "") return;

            // Report a failure both as a notification (visible in background /
            // menu mode) and through the callback, so the floating window shows
            // the reason right away instead of sitting on "Translating…" until
            // the 12s safety net fires.
            const fail = (msg) => {
                // Respect the notification setting, matching the menu path which
                // gates Main.notify on this._notifications. The callback still runs,
                // so the floating window shows the reason inline either way.
                if (this._notifications) {
                    Main.notify("Fast Translate", msg);
                }
                try { callback("", msg); } catch (_e) {}
            };

            let message;
            if (this._translation_service === 1) {
                // Google Translate (Auth-Free)
                const sl = this._source_lang === 'AUTO' ? 'auto' : this._source_lang.toLowerCase();
                const tl = this._target_lang.toLowerCase();
                const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t`;

                const bodyObj = { q: fromText };
                const body = buildRequestQuery(bodyObj);
                const bytes = new GLib.Bytes(body);

                try {
                    message = Soup.Message.new('POST', url);
                    if (!message) throw new Error(_("Invalid URL"));
                } catch (e) {
                    fail(`${_("Error")}: ${e.message}`);
                    return;
                }

                message.set_request_body_from_bytes('application/x-www-form-urlencoded', bytes);
                message.request_headers.replace('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
            } else {
                // DeepL
                const bodyObj = {
                    text: [fromText],
                    target_lang: this._target_lang,
                    split_sentences: this._split_sentences ? "1" : "0",
                    preserve_formatting: !!this._preserve_formatting,
                };

                if (this._source_lang && this._source_lang !== 'AUTO') {
                    bodyObj.source_lang = this._source_lang;
                }

                if (this._formality && this._formality !== 'default') {
                    if (this._formality === 'more') {
                        bodyObj.formality = 'prefer_more';
                    } else if (this._formality === 'less') {
                        bodyObj.formality = 'prefer_less';
                    } else {
                        bodyObj.formality = this._formality;
                    }
                }

                const body = JSON.stringify(bodyObj);
                const bytes = new GLib.Bytes(body);

                try {
                    if (!this._isSafeDeepLUrl(this._url)) {
                        throw new Error(_("DeepL URL must use HTTPS"));
                    }
                    message = Soup.Message.new('POST', this._url);
                    if (!message) throw new Error(_("Invalid URL"));
                } catch (e) {
                    fail(`${_("Error")}: ${e.message}`);
                    return;
                }

                message.request_headers.replace('Authorization', `DeepL-Auth-Key ${this._apikey}`);
                message.set_request_body_from_bytes('application/json', bytes);
            }
            
            if (this._destroyed || !this._httpSession) return;

            this._httpSession.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                null,
                (session, result) => {
                    let resBytes;
                    try {
                        resBytes = session.send_and_read_finish(result);
                    } catch (e) {
                        if (this._destroyed) return;
                        fail(`Error: ${e.message || e}`);
                        return;
                    }

                    if (this._destroyed) return;
                    try {
                        if (message.status_code === 200) {
                            let decoder = new TextDecoder("utf-8");
                            let response = decoder.decode(resBytes.get_data());
                            let json = JSON.parse(response);
                            
                            let toText = "";
                            if (this._translation_service === 1) {
                                toText = (json && json[0]) ? json[0].map(part => part[0]).join('') : "";
                            } else {
                                let translations = json.translations;
                                toText = (translations && translations.length > 0) ? translations[0].text : "";
                            }
                            callback(toText);
                        } else if (this._translation_service === 1 && (message.status_code === 403 || message.status_code === 429)) {
                            fail(_("Rate-limited or blocked by Google Translate. Please try again later."));
                        } else if (message.status_code === 403) {
                            let errMsg = _("Auth failed (403): check API key and URL in settings");
                            try {
                                let decoder = new TextDecoder("utf-8");
                                let body = JSON.parse(decoder.decode(resBytes.get_data()));
                                if (body && body.message) errMsg += `\n${body.message}`;
                            } catch (_e) {}
                            fail(errMsg);
                        } else {
                            let errMsg = `Error: ${message.status_code}`;
                            try {
                                let decoder = new TextDecoder("utf-8");
                                let body = JSON.parse(decoder.decode(resBytes.get_data()));
                                if (body && body.message) errMsg += `\n${body.message}`;
                            } catch (_e) {}
                            fail(errMsg);
                        }
                    } catch (e) {
                        fail(`Error: ${e.message || e}`);
                    }
                }
            );
        }

        _showError(messageText) {
            if (this.errorLabel) {
                this.errorLabel.text = messageText;
            } else {
                Main.notify("Fast Translate", messageText);
            }
        }

        _get_country_code(description) {
            return parseCountryCode(description);
        }

        _copyToClipboard(inText) {
            this._isInternalCopy = true;
            if (this._internalCopyTimeoutId) {
                GLib.Source.remove(this._internalCopyTimeoutId);
            }
            this._internalCopyTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                this._isInternalCopy = false;
                this._internalCopyTimeoutId = null;
                return GLib.SOURCE_REMOVE;
            });

            Clipboard.set_text(CLIPBOARD_TYPE, inText);
        }

        _menuTranslationBlock() {
            let container = new St.BoxLayout({
                vertical: true,
                style_class: 'translate-container'
            });
            this.translationBlockContainer = container;

            // 1. Language Row
            let langRow = new St.BoxLayout({
                vertical: false,
                style_class: 'translate-lang-row',
                x_align: Clutter.ActorAlign.CENTER
            });
             this.sourceLabel = new St.Button({
                label: formatLanguageLabel(this._source_lang),
                style_class: 'translate-lang-label',
                reactive: true
            });
            this.sourceLabel.connect('clicked', () => {
                const isVisible = !!this.sourceSelector;
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    if (this._destroyed) {
                        return GLib.SOURCE_REMOVE;
                    }
                    this._toggleLanguageSelector(true, !isVisible);
                    return GLib.SOURCE_REMOVE;
                });
            });
            this.swapBtn = new St.Button({
                label: '⇄',
                style_class: 'translate-swap-button',
                reactive: true
            });
            this.swapBtn.connect('clicked', () => {
                if (this.sourceSelector || this.targetSelector) {
                    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                        if (this._destroyed) {
                            return GLib.SOURCE_REMOVE;
                        }
                        this._toggleLanguageSelector(true, false);
                        return GLib.SOURCE_REMOVE;
                    });
                }
                const oldTargetLang = this._target_lang;
                this._target_lang = this._source_lang;
                this._source_lang = oldTargetLang;
                this.sourceLabel.label = formatLanguageLabel(this._source_lang);
                this.targetLabel.label = formatLanguageLabel(this._target_lang);
                
                // Swap text in entry boxes
                let inText = this.inputEntry.get_clutter_text().get_text();
                let outText = this.outputEntry.get_clutter_text().get_text();
                this.inputEntry.get_clutter_text().set_text(outText);
                this.outputEntry.get_clutter_text().set_text(inText);
            });
            this.targetLabel = new St.Button({
                label: formatLanguageLabel(this._target_lang),
                style_class: 'translate-lang-label',
                reactive: true
            });
            this.targetLabel.connect('clicked', () => {
                const isVisible = !!this.targetSelector;
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    if (this._destroyed) {
                        return GLib.SOURCE_REMOVE;
                    }
                    this._toggleLanguageSelector(false, !isVisible);
                    return GLib.SOURCE_REMOVE;
                });
            });
            langRow.add_child(this.sourceLabel);
            langRow.add_child(this.swapBtn);
            langRow.add_child(this.targetLabel);
            container.add_child(langRow);

            // 2. Input Box
            let inputWrapper = new St.BoxLayout({
                vertical: true,
                style_class: 'translate-entry-wrapper'
            });
            this.inputWrapper = inputWrapper;
            this.inputEntry = new St.Entry({
                name: 'inputEntry',
                style_class: 'translate-entry',
                hint_text: _('Type or paste text...'),
                can_focus: true,
                track_hover: true,
                reactive: true
            });
            this.inputEntry.get_clutter_text().set_line_wrap(true);
            this.inputEntry.get_clutter_text().set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
            this.inputEntry.get_clutter_text().set_single_line_mode(false);
            this.inputEntry.get_clutter_text().set_activatable(true);
            
            let inputScroll = new St.ScrollView({
                style_class: 'translate-scroll',
                hscrollbar_policy: St.PolicyType.NEVER,
                vscrollbar_policy: St.PolicyType.AUTOMATIC
            });
            let inputScrollBox = new St.BoxLayout({
                vertical: true,
                x_expand: true,
                y_expand: true
            });
            this.inputEntry.x_expand = true;
            this.inputEntry.y_expand = true;
            this.inputEntry.x_align = Clutter.ActorAlign.FILL;
            this.inputEntry.y_align = Clutter.ActorAlign.FILL;
            // Clicking anywhere in the entry grabs keyboard focus
            this.inputEntry.connect('button-press-event', () => {
                global.stage.set_key_focus(this.inputEntry.get_clutter_text());
                return Clutter.EVENT_PROPAGATE;
            });
            inputScrollBox.add_child(this.inputEntry);
            inputScroll.add_child(inputScrollBox);
            inputWrapper.add_child(inputScroll);
            
            // Input Action Row (Paste / Clear)
            let inputActions = new St.BoxLayout({
                vertical: false,
                style_class: 'translate-actions-row'
            });
            this.pasteBtn = new St.Button({
                style_class: 'translate-action-btn',
                reactive: true
            });
            this.pasteBtn.set_child(new St.Icon({
                icon_name: 'edit-paste-symbolic',
                style_class: 'translate-btn-icon'
            }));
            this.pasteBtn.connect('clicked', () => {
                Clipboard.get_text(CLIPBOARD_TYPE, (_, inText) => {
                    if (this._destroyed) {
                        return;
                    }
                    if (inText && inText !== "") {
                        this.inputEntry.get_clutter_text().set_text(inText);
                        if (this.autoTranslateSwitch.state === true) {
                            this._triggerTranslation();
                        }
                    }
                });
            });
            this.clearBtn = new St.Button({
                style_class: 'translate-action-btn',
                reactive: true
            });
            this.clearBtn.set_child(new St.Icon({
                icon_name: 'edit-clear-symbolic',
                style_class: 'translate-btn-icon'
            }));
            this.clearBtn.connect('clicked', () => {
                this.inputEntry.get_clutter_text().set_text("");
                this.outputEntry.get_clutter_text().set_text("");
                if (this.errorLabel) {
                    this.errorLabel.text = "";
                }
            });
            inputActions.add_child(this.pasteBtn);
            inputActions.add_child(this.clearBtn);
            inputWrapper.add_child(inputActions);
            
            container.add_child(inputWrapper);

            // 3. Middle Action Row (Translate Button & Error Label)
            let middleRow = new St.BoxLayout({
                vertical: true,
                style_class: 'translate-middle-row',
                x_align: Clutter.ActorAlign.CENTER
            });
            this.middleRow = middleRow;
            this.translateBtn = new St.Button({
                label: _("Translate"),
                style_class: 'translate-submit-btn',
                reactive: true
            });
            this.translateBtn.connect('clicked', () => {
                if (this._cancellable) {
                    this._cancellable.cancel();
                } else {
                    this._triggerTranslation();
                }
            });
            middleRow.add_child(this.translateBtn);

            this.errorLabel = new St.Label({
                style_class: 'translate-error-label',
                text: '',
                x_align: Clutter.ActorAlign.CENTER
            });
            middleRow.add_child(this.errorLabel);

            container.add_child(middleRow);

            // 4. Output Box
            let outputWrapper = new St.BoxLayout({
                vertical: true,
                style_class: 'translate-entry-wrapper'
            });
            this.outputWrapper = outputWrapper;
            this.outputEntry = new St.Entry({
                name: 'outputEntry',
                style_class: 'translate-entry read-only',
                hint_text: _('Translation will appear here...'),
                can_focus: true,
                track_hover: true,
                reactive: true
            });
            this.outputEntry.get_clutter_text().set_line_wrap(true);
            this.outputEntry.get_clutter_text().set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
            this.outputEntry.get_clutter_text().set_single_line_mode(false);
            this.outputEntry.get_clutter_text().set_activatable(true);
            this.outputEntry.get_clutter_text().set_editable(false);
            
            let outputScroll = new St.ScrollView({
                style_class: 'translate-scroll',
                hscrollbar_policy: St.PolicyType.NEVER,
                vscrollbar_policy: St.PolicyType.AUTOMATIC
            });
            let outputScrollBox = new St.BoxLayout({
                vertical: true,
                x_expand: true,
                y_expand: true
            });
            this.outputEntry.x_expand = true;
            this.outputEntry.y_expand = true;
            this.outputEntry.x_align = Clutter.ActorAlign.FILL;
            this.outputEntry.y_align = Clutter.ActorAlign.FILL;
            outputScrollBox.add_child(this.outputEntry);
            outputScroll.add_child(outputScrollBox);
            outputWrapper.add_child(outputScroll);

            // Output Action Row (Copy)
            let outputActions = new St.BoxLayout({
                vertical: false,
                style_class: 'translate-actions-row'
            });
            this.copyBtn = new St.Button({
                style_class: 'translate-action-btn',
                reactive: true
            });
            this.copyBtn.set_child(new St.Icon({
                icon_name: 'edit-copy-symbolic',
                style_class: 'translate-btn-icon'
            }));
            this.copyBtn.connect('clicked', () => {
                let outText = this.outputEntry.get_clutter_text().get_text();
                if (outText && outText !== "") {
                    this._copyToClipboard(outText);
                }
            });
            outputActions.add_child(this.copyBtn);
            outputWrapper.add_child(outputActions);

            container.add_child(outputWrapper);

            // Bind tooltips
            this._addTooltip(this.swapBtn, _("Swap languages"));
            this._addTooltip(this.pasteBtn, _("Paste from clipboard"));
            this._addTooltip(this.clearBtn, _("Clear text"));
            this._addTooltip(this.copyBtn, _("Copy translation to clipboard"));
            this._addTooltip(this.translateBtn, () => {
                return this.translateBtn.label === _("Cancel") ? _("Cancel translation") : _("Translate text");
            });
            this._addTooltip(this.sourceLabel, () => {
                return _("Source language: ") + (this.sourceLabel.label || _("Auto"));
            });
            this._addTooltip(this.targetLabel, () => {
                return _("Target language: ") + (this.targetLabel.label || "");
            });

            let menuItem = new PopupMenu.PopupBaseMenuItem({
                reactive: true,
                can_focus: true
            });
            menuItem.activate = () => {};
            menuItem.actor.track_hover = false;
            menuItem.actor.style_class = 'translate-menu-item-container';
            menuItem.add_child(container);
            return menuItem;
        }

        _triggerTranslation() {
            let fromText = this.inputEntry.get_clutter_text().get_text();
            if (!fromText || fromText.trim() === "") {
                return;
            }
            const requestText = this._truncateForCharLimit(fromText);
            this._translateText(true, requestText, (toText) => {
                this.outputEntry.get_clutter_text().set_text(toText);
                if (this.autoCopySwitch.state === true) {
                    this._copyToClipboard(toText);
                }
            });
        }

        _getValue(keyName) {
            return this._settings.get_value(keyName).deep_unpack();
        }

        _truncateForCharLimit(text) {
            if (!text) return text;
            const limit = this._translation_service === 1 ? FLOAT_GOOGLE_CHAR_LIMIT : FLOAT_DEEPL_CHAR_LIMIT;
            return (limit > 0 && text.length > limit) ? text.slice(0, limit) : text;
        }

        _isSafeDeepLUrl(url) {
            if (typeof url !== 'string') return false;
            return url.startsWith('https://');
        }

        _set_icon_indicator() {
            let active = this.autoPasteSwitch.state;
            let themeString = (this._darktheme ? 'dark' : 'light');
            let statusString = (active ? 'active' : 'paused');
            let iconString = `fast-translate-${statusString}-${themeString}`;
            let icon = this._get_icon(iconString);
            if (icon) this.icon.set_gicon(icon);
        }

        _get_icon(iconName) {
            const iconsDir = this._extension.dir.get_child("icons");
            let fileIcon = iconsDir.get_child(`${iconName}.svg`);
            if (fileIcon.query_exists(null) === false) {
                fileIcon = iconsDir.get_child(`${iconName}.png`);
            }
            if (fileIcon.query_exists(null) === false) {
                return null;
            }
            return Gio.Icon.new_for_string(fileIcon.get_path());
        }

        _settingsChanged(changedKey) {
            this._loadPreferences(changedKey);
            if (this.sourceLabel) {
                this.sourceLabel.label = formatLanguageLabel(this._source_lang);
            }
            if (this.targetLabel) {
                this.targetLabel.label = formatLanguageLabel(this._target_lang);
            }
        }

        _toggleLanguageSelector(isSource, show) {
            if (show) {
                // Hide input, middle row, and output
                this.inputWrapper.visible = false;
                this.middleRow.visible = false;
                this.outputWrapper.visible = false;
                
                // Hide other selectors
                if (this.sourceSelector) {
                    this.sourceSelector.destroy();
                    this.sourceSelector = null;
                }
                if (this.targetSelector) {
                    this.targetSelector.destroy();
                    this.targetSelector = null;
                }
                
                // Create new selector scroll view
                const keyName = isSource ? 'source-lang' : 'target-lang';
                const key = this._settings.settings_schema.get_key(keyName);
                const enums = key.get_range().deep_unpack()[1].deep_unpack();
                const selectedIndex = this._settings.get_enum(keyName);
                
                let selectorScroll = new St.ScrollView({
                    style_class: 'translate-scroll translate-selector-scroll',
                    hscrollbar_policy: St.PolicyType.NEVER,
                    vscrollbar_policy: St.PolicyType.AUTOMATIC
                });
                
                let scrollBox = new St.BoxLayout({
                    vertical: true,
                    x_expand: true,
                    style_class: 'translate-selector-box'
                });
                
                let colCount = 2;
                let row = null;
                enums.forEach((enumStr, index) => {
                    if (index % colCount === 0) {
                        row = new St.BoxLayout({
                            vertical: false,
                            x_expand: true,
                            style_class: 'translate-lang-selector-row'
                        });
                        scrollBox.add_child(row);
                    }
                    
                    const code = parseCountryCode(enumStr);
                    const flag = getFlagEmoji(code);
                    const name = parseLanguageName(enumStr);
                    const buttonText = flag ? `${flag} ${name}` : name;
                    
                    let isSelected = (index === selectedIndex);
                    let btn = new St.Button({
                        label: buttonText,
                        style_class: isSelected ? 'translate-lang-selector-btn selected' : 'translate-lang-selector-btn',
                        x_expand: true,
                        reactive: true
                    });
                    
                    btn.connect('clicked', () => {
                        this._settings.set_enum(keyName, index);
                        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                            if (this._destroyed) {
                                return GLib.SOURCE_REMOVE;
                            }
                            this._toggleLanguageSelector(isSource, false);
                            this._triggerTranslation();
                            return GLib.SOURCE_REMOVE;
                        });
                    });
                    
                    row.add_child(btn);
                });
                
                selectorScroll.add_child(scrollBox);
                this.translationBlockContainer.add_child(selectorScroll);
                
                if (isSource) {
                    this.sourceSelector = selectorScroll;
                } else {
                    this.targetSelector = selectorScroll;
                }
            } else {
                // Destroy selectors
                if (this.sourceSelector) {
                    this.sourceSelector.destroy();
                    this.sourceSelector = null;
                }
                if (this.targetSelector) {
                    this.targetSelector.destroy();
                    this.targetSelector = null;
                }
                
                // Restore input, middle row, and output
                this.inputWrapper.visible = true;
                this.middleRow.visible = true;
                this.outputWrapper.visible = true;
            }
        }

        destroy() {
            this._destroyed = true;
            if (this._floatingWindow) {
                this._floatingWindow.destroy();
                this._floatingWindow = null;
            }
            if (this.sourceSelector) {
                this.sourceSelector.destroy();
                this.sourceSelector = null;
            }
            if (this.targetSelector) {
                this.targetSelector.destroy();
                this.targetSelector = null;
            }
            if (this._tooltips) {
                this._tooltips.forEach(t => t.destroy());
                this._tooltips = null;
            }
            this._disconnectSettings();
            this._unbindShortcut();
            this._clearClipboardTimeout();
            this._disconnectSelectionListener();
            if (this._cancellable) {
                this._cancellable.cancel();
                this._cancellable = null;
            }
            if (this._safetyTimeoutId) {
                GLib.Source.remove(this._safetyTimeoutId);
                this._safetyTimeoutId = null;
            }
            if (this._internalCopyTimeoutId) {
                GLib.Source.remove(this._internalCopyTimeoutId);
                this._internalCopyTimeoutId = null;
            }
            if (this._httpSession) {
                this._httpSession.abort();
                this._httpSession = null;
            }
            super.destroy();
        }
    }
);

export default class FastTranslateExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this.initTranslations(this.metadata['gettext-domain']);
    }

    enable() {
        // GDM autologin fix: do not block shell startup on this extension.
        // Defer heavy construction to next idle so Registering display with GDM
        // is not delayed past the fallback-greeter timeout (~12s).
        this._indicator = null;
        this._deferredEnableId = null;
        try {
            this._deferredEnableId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
                this._deferredEnableId = null;
                if (this._indicator)
                    return GLib.SOURCE_REMOVE;
                try {
                    this._indicator = new FastTranslate(this);
                    Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
                } catch (e) {
                    console.warn(`[fast-translate] deferred enable failed: ${e}`);
                }
                return GLib.SOURCE_REMOVE;
            });
        } catch (e) {
            // Fallback: synchronous if idle_add unavailable
            try {
                this._indicator = new FastTranslate(this);
                Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
            } catch (_e) {}
        }
    }

    disable() {
        try {
            if (this._deferredEnableId) {
                GLib.Source.remove(this._deferredEnableId);
                this._deferredEnableId = null;
            }
        } catch (_e) {}
        if (this._indicator) {
            try { this._indicator.destroy(); } catch (_e) {}
            this._indicator = null;
        }
    }
}

const FLOAT_GOOGLE_CHAR_LIMIT = 5000;
const FLOAT_DEEPL_CHAR_LIMIT = 5000;

class FloatingTranslationWindow {
    constructor(sourceText, targetText, sourceLang, targetLang, onDestroy, onCopyClicked, settings, opts) {
        this._onDestroy = onDestroy;
        this._settings = settings;
        this._onSwap = opts?.onSwap ?? null;
        this._srcLang = sourceLang;
        this._tgtLang = targetLang;
        this.overlay = new St.Widget({
            style_class: 'translate-floating-overlay',
            reactive: true,
            x: 0,
            y: 0,
            width: global.stage.width,
            height: global.stage.height
        });

        this.overlay.connect('button-press-event', () => {
            this.destroy();
            return Clutter.EVENT_STOP;
        });

        this.actor = new St.BoxLayout({
            style_class: 'translate-floating-window',
            vertical: true,
            reactive: true
        });

        // Header Row (Title + Close Button)
        let header = new St.BoxLayout({
            vertical: false,
            style_class: 'translate-floating-header'
        });
        
        let titleText = `${formatLanguageLabel(sourceLang)}  ➜  ${formatLanguageLabel(targetLang)}`;
        let title = new St.Label({
            text: titleText,
            style_class: 'translate-floating-title',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        this._title = title;
        header.add_child(title);

        let closeBtn = new St.Button({
            style_class: 'translate-floating-close-btn',
            reactive: true
        });
        closeBtn.set_child(new St.Icon({
            icon_name: 'window-close-symbolic',
            style_class: 'translate-btn-icon'
        }));
        closeBtn.connect('clicked', () => this.destroy());
        header.add_child(closeBtn);
        this.actor.add_child(header);

        // Divider
        let divider = new St.Widget({
            style_class: 'translate-floating-divider'
        });
        this.actor.add_child(divider);

        // Character-limit warning (per active service), shown before truncating the request.
        let charLimit = opts?.charLimit ?? 0;
        let serviceName = opts?.serviceName ?? '';
        let srcLength = opts?.srcLength ?? sourceText.length;
        this._truncated = charLimit > 0 && srcLength > charLimit;
        this._charLimit = charLimit;
        this._warnLabel = null;
        if (this._truncated) {
            this._warnLabel = new St.Label({
                text: `${srcLength} / ${charLimit} 字符，文本超过${serviceName}翻译服务的单次请求限制，已截断`,
                style_class: 'translate-floating-warning',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER
            });
            this.actor.add_child(this._warnLabel);
        }

        // Source Text (scrollable)
        let srcScroll = new St.ScrollView({
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            style_class: 'translate-floating-src-scroll'
        });
        // vscrollbar_policy is read-only after construction (Clutter only
        // honors it at build time). We keep AUTOMATIC permanently and
        // control scrolling ONLY via set_height(cap) / set_height(-1).
        let srcBox = new St.BoxLayout({
            vertical: true,
            x_expand: true
        });
        let srcLabel = new St.Label({
            text: sourceText,
            style_class: 'translate-floating-text-src'
        });
        srcLabel.get_clutter_text().set_line_wrap(true);
        srcLabel.get_clutter_text().set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        srcBox.add_child(srcLabel);
        srcScroll.add_child(srcBox);
        this.actor.add_child(srcScroll);
        this._srcScroll = srcScroll;
        this._srcLabel = srcLabel;
        this._srcBox = srcBox;

        // Divider 2
        let divider2 = new St.Widget({
            style_class: 'translate-floating-divider'
        });
        this.actor.add_child(divider2);

        // Translated Text (scrollable)
        let destScroll = new St.ScrollView({
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            style_class: 'translate-floating-dest-scroll'
        });
        // vscrollbar_policy is read-only after construction (Clutter only
        // honors it at build time). We keep AUTOMATIC permanently and
        // control scrolling ONLY via set_height(cap) / set_height(-1).
        let destBox = new St.BoxLayout({
            vertical: true,
            x_expand: true
        });
        let destLabel = new St.Label({
            text: targetText,
            style_class: 'translate-floating-text-dest'
        });
        destLabel.get_clutter_text().set_line_wrap(true);
        destLabel.get_clutter_text().set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        destBox.add_child(destLabel);
        destScroll.add_child(destBox);
        this.actor.add_child(destScroll);
        this._destScroll = destScroll;
        // Plan A: live target fill — window opens instantly with a placeholder,
        // the network reply fills this label later via setTargetText().
        this._destLabel = destLabel;
        this._destBox = destBox;
        this._currentTarget = targetText;
        this._winDestroyed = false;

        // Max-height backstop for the outer window only:
        // per-region scroll viewport heights are driven by _applyHeightCaps()
        // using set_height(). CSS max-height on individual scroll views must NOT
        // be set — it causes a silent clip with AUTOMATIC scrollbar policy,
        // breaking scroll detection.
        try {
            const monitor = Main.layoutManager.primaryMonitor;
            const h = monitor?.height ?? 800;
            this.actor.set_style(`max-height: ${Math.floor(h * 0.60)}px`);
            // Pin both scroll viewports to their caps from the very first frame
            // so layout is stable and never sustains a tall pre-measure window.
            // Label heights are then set to force overflow (or fit) in
            // _applyHeightCaps().
            this._srcScroll?.set_height(Math.floor(h * 0.25));
            this._destScroll?.set_height(Math.floor(h * 0.40));
        } catch (_e) {}

        // Actions Row (Copy Button & Auto Copy Checkbox)
        let actions = new St.BoxLayout({
            vertical: false,
            style_class: 'translate-floating-actions'
        });
        let copyBtn = new St.Button({
            style_class: 'translate-action-btn',
            reactive: true
        });
        copyBtn.set_child(new St.Icon({
            icon_name: 'edit-copy-symbolic',
            style_class: 'translate-btn-icon'
        }));
        
        copyBtn.connect('clicked', () => {
            const cur = this._currentTarget;
            if (onCopyClicked) {
                onCopyClicked(cur);
            } else {
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, cur);
            }
            this.destroy();
        });
        actions.add_child(copyBtn);

        if (this._onSwap) {
            this._swapBtn = new St.Button({
                label: '⇄',
                style_class: 'translate-floating-swap-btn',
                reactive: true
            });
            this._swapBtn.connect('clicked', () => this._onSwap());
            this._swapTip = new Tooltip(this._swapBtn, _('交换源语言和目标语言'));
            actions.add_child(this._swapBtn);
        }

        let spacer = new St.Widget({ x_expand: true });
        actions.add_child(spacer);

        if (this._settings) {
            let autoCopyBox = new St.BoxLayout({
                vertical: false,
                style_class: 'translate-floating-autocopy-box',
                y_align: Clutter.ActorAlign.CENTER
            });
            let autoCopyLabel = new St.Label({
                text: _("Auto Copy"),
                style_class: 'translate-floating-autocopy-label',
                y_align: Clutter.ActorAlign.CENTER
            });
            
            let isAutoCopy = this._settings.get_boolean('floating-auto-copy');
            let autoCopyBtn = new St.Button({
                style_class: isAutoCopy ? 'translate-floating-toggle-btn active' : 'translate-floating-toggle-btn',
                reactive: true,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER
            });
            
            let toggleIcon = new St.Icon({
                icon_name: isAutoCopy ? 'checkbox-checked-symbolic' : 'checkbox-symbolic',
                style_class: 'translate-btn-icon'
            });
            autoCopyBtn.set_child(toggleIcon);
            
            autoCopyBtn.connect('clicked', () => {
                let current = this._settings.get_boolean('floating-auto-copy');
                let next = !current;
                this._settings.set_boolean('floating-auto-copy', next);
                
                autoCopyBtn.style_class = next ? 'translate-floating-toggle-btn active' : 'translate-floating-toggle-btn';
                toggleIcon.icon_name = next ? 'checkbox-checked-symbolic' : 'checkbox-symbolic';
            });
            
            autoCopyBox.add_child(autoCopyBtn);
            autoCopyBox.add_child(autoCopyLabel);
            actions.add_child(autoCopyBox);
        }

        this.actor.add_child(actions);

        // Center on primary monitor
        let monitor = Main.layoutManager.primaryMonitor;
        let allocationId = this.actor.connect('notify::allocation', () => {
            this.actor.disconnect(allocationId);
            let width = this.actor.get_width();
            let height = this.actor.get_height();
            let x = monitor.x + (monitor.width - width) / 2;
            let y = monitor.y + (monitor.height - height) / 2;
            this.actor.set_position(x, y);
            this._allocatedWidth = width;
            // First _applyHeightCaps() runs before labels have allocated
            // widths, so get_preferred_height uses a fallback width that
            // underestimates content height for wrapped text. One idle delay
            // lets the first layout pass complete, giving get_width()
            // the real wrap width for an accurate re-measurement.
            this._settleCount = 0; this._settleFp = null;
            if (!this._winDestroyed) this._applyHeightCaps();
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                if (!this._winDestroyed) this._applyHeightCaps();
                return GLib.SOURCE_REMOVE;
            });
        });

        // Add to the stage only after every actor is built, so a constructor
        // failure can never orphan a full-screen overlay in Main.uiGroup.
        //
        // NOTE: this popup intentionally does NOT take keyboard focus and does
        // NOT install a modal grab:
        //   - global.stage.set_key_focus() stolen mid-keypress orphaned the
        //     triggering Ctrl+C key-release, so the underlying app kept
        //     auto-repeating the key.
        //   - Main.pushModal(..., {actionMode: SYSTEM_MODAL}) set the global
        //     Main.actionMode to SYSTEM_MODAL, which disables Super/Alt+Tab for
        //     as long as the popup is open (windowManager.js gates keybindings
        //     on Main.actionMode), and confined pointer events to the grab
        //     actor's subtree so the card's buttons stopped responding.
        // The popup is dismissed with the mouse: click the backdrop, the close
        // button, or the copy button.
        try {
            Main.uiGroup.add_child(this.overlay);
            Main.uiGroup.add_child(this.actor);
        } catch (e) {
            this.destroy();
            throw e;
        }
    }

    setTargetText(text) {
        this._currentTarget = text;
        try {
            if (this._winDestroyed || !this._destLabel) return;
            this._destLabel.set_text(text);
            // Reset stability tracker for new measurement epoch.
            this._settleCount = 0; this._settleFp = null;
            // Let label allocate at wrapped width first, then measure (double-idle).
            this.actor.queue_relayout();
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                if (this._winDestroyed) return GLib.SOURCE_REMOVE;
                this.actor.queue_relayout();
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    if (!this._winDestroyed) this._applyHeightCaps();
                    return GLib.SOURCE_REMOVE;
                });
                return GLib.SOURCE_REMOVE;
            });
        } catch (_e) {}
    }

    _recenter() {
        try {
            if (this._winDestroyed || !this.actor) return;
            const monitor = Main.layoutManager.primaryMonitor;
            const width = this.actor.get_width();
            const height = this.actor.get_height();
            if (!width || !height) return;
            this.actor.set_position(
                monitor.x + (monitor.width - width) / 2,
                monitor.y + (monitor.height - height) / 2
            );
        } catch (_e) {}
    }

    // Region height = min(content natural height, cap).
    // Under cap: viewport = content height, no scrollbar (compact fit).
    // Over cap: viewport fixed at cap, box + label both forced to the real
    // natural height. Box set_height prevents the viewport from clipping the
    // label; label set_height makes St.ScrollView see genuine overflow so its
    // AUTOMATIC scrollbar appears. vscrollbar_policy is read-only after
    // construction, so we control scrolling ONLY via set_height().
    _applyHeightCaps() {
        if (this._winDestroyed || !this.actor) return;
        const monitor = Main.layoutManager.primaryMonitor;
        const h = monitor?.height ?? 800;
        const srcCap = Math.floor(h * 0.25);
        const destCap = Math.floor(h * 0.40);
        // GJS note: get_allocated_* returns undefined in this Shell, use get_width().
        // After set_text, label.get_width() is stale (natural unwrapped width ~122k)
        // until next layout. Priority: scroll viewport width (already constrained)
        // first, then capped label width. <5000 guards stale huge reads.
        const _getLabelWidth = (label, scroll) => {
            const cap = Math.max(200, (this._allocatedWidth && this._allocatedWidth > 100)
                ? this._allocatedWidth - 48 : this.actor.get_width() - 48);
            const sw = scroll?.get_width?.();
            if (sw && sw > 100 && sw < 5000) return Math.min(sw - 4, cap);
            const lw = label?.get_width?.();
            if (lw && lw > 100 && lw < 5000) return Math.min(lw, cap);
            return cap;
        };
        // The vertical scrollbar steals ~10px of the label's wrap width once it
        // appears. Real width can't be read reliably (sb.get_width() returns 0),
        // so we measure in two stages: full width first to detect overflow, then
        // full width minus a conservative scrollbar estimate to get the real wrap.
        const SCROLLBAR_ESTIMATE = 16;
        const HEIGHT_SAFETY = 16;
        const _measureLabel = (label, scroll) => {
            if (!label) return { width: 200, height: 0 };
            const fullW = _getLabelWidth(label, scroll);
            const natHFull = label.get_preferred_height(fullW)[1];
            if (natHFull <= 0) return { width: fullW, height: 0 };
            if (natHFull <= Math.floor(h * 0.25)) {
                // Source cap is the smaller of the two; if it fits there, no
                // scrollbar will appear, so full-width measurement is correct.
                return { width: fullW, height: natHFull };
            }
            // Overflow expected: scrollbar will reduce available width. Add a
            // safety margin so padding / rounding never clips the last line.
            const narrowW = Math.max(200, fullW - SCROLLBAR_ESTIMATE);
            return { width: narrowW, height: label.get_preferred_height(narrowW)[1] + HEIGHT_SAFETY };
        };
        const srcM = _measureLabel(this._srcLabel, this._srcScroll);
        const destM = _measureLabel(this._destLabel, this._destScroll);
        const srcW = srcM.width;
        const srcNatH = srcM.height;
        const destW = destM.width;
        const destNatH = destM.height;
        let grew = false;
        // Source region — overflow branch: pin viewport, give the box a
        // min-height via CSS so its preferred height drives the ScrollView
        // overflow, then fix the label to the same safe height.
        if (this._srcScroll && this._srcBox && this._srcLabel && srcNatH > srcCap) {
            this._srcScroll.set_height(srcCap);
            this._srcBox.set_style(`min-height: ${srcNatH}px`);
            this._srcBox.set_height(-1);
            this._srcBox.y_align = Clutter.ActorAlign.START;
            this._srcLabel.set_height(srcNatH);
            this._srcLabel.y_align = Clutter.ActorAlign.START;
            grew = true;
        } else if (this._srcScroll && this._srcBox && this._srcLabel) {
            this._srcScroll.set_height(Math.max(srcNatH, 1));
            this._srcBox.set_style('');
            this._srcBox.set_height(-1);
            this._srcLabel.set_height(-1);
        }
        // Destination region — mirror of source above.
        if (this._destScroll && this._destBox && this._destLabel && destNatH > destCap) {
            this._destScroll.set_height(destCap);
            this._destBox.set_style(`min-height: ${destNatH}px`);
            this._destBox.set_height(-1);
            this._destBox.y_align = Clutter.ActorAlign.START;
            this._destLabel.set_height(destNatH);
            this._destLabel.y_align = Clutter.ActorAlign.START;
            grew = true;
        } else if (this._destScroll && this._destBox && this._destLabel) {
            this._destScroll.set_height(Math.max(destNatH, 1));
            this._destBox.set_style('');
            this._destBox.set_height(-1);
            this._destLabel.set_height(-1);
        }
        if (grew) {
            this.actor.queue_relayout();
        }
        // Stability re-measure: keep running until measurements stop changing.
        // This borrows dest's reliable "measure after layout settles" behaviour
        // — for src the text never changes, so it converges to a stable value.
        const fingerprint = `${srcW}:${srcNatH}:${srcCap}:${destW}:${destNatH}:${destCap}`;
        this._settleCount = (this._settleCount ?? 0) + 1;
        if (fingerprint !== this._settleFp && this._settleCount < 8) {
            this._settleFp = fingerprint;
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                if (!this._winDestroyed) this._applyHeightCaps();
                return GLib.SOURCE_REMOVE;
            });
        }
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            if (!this._winDestroyed) this._recenter();
            return GLib.SOURCE_REMOVE;
        });
    }

    refreshLangs(sourceLang, targetLang) {
        this._srcLang = sourceLang;
        this._tgtLang = targetLang;
        try {
            if (this._winDestroyed || !this._title) return;
            this._title.text = `${formatLanguageLabel(sourceLang)}  ➜  ${formatLanguageLabel(targetLang)}`;
        } catch (_e) {}
    }

    destroy() {
        if (this._winDestroyed) return; // idempotent: guard before setting the flag
        this._winDestroyed = true;
        this._destLabel = null;
        this._srcLabel = null;
        this._srcScroll = null;
        this._destScroll = null;
        this._srcBox = null;
        this._destBox = null;
        this._title = null;
        this._swapBtn = null;
        this._swapTip = null;
        if (this.overlay) {
            try { this.overlay.destroy(); } catch (_e) {}
            this.overlay = null;
        }
        if (this.actor) {
            try { this.actor.destroy(); } catch (_e) {}
            this.actor = null;
        }
        if (this._onDestroy) {
            const cb = this._onDestroy;
            this._onDestroy = null; // clear before invoking so a throw can't leave it dangling
            try { cb(); } catch (_e) {}
        }
    }
}

