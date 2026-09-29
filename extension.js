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
import { parseCountryCode, formatLanguageLabel, parseLanguageName, getFlagEmoji, buildGoogleRequest, buildDeepLRequestBody, getProvider, buildBaiduRequest, buildYoudaoRequest, parseProviderResponse } from "./translation-helper.js";
import { hashBundle } from "./signing.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

const Clipboard = St.Clipboard.get_default();
const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

const TIMEOUT_MS = 500;
// GSettings key for the transient floating-window dismiss accelerator.
// Unlike the removed Super+T shortcut, this binding lives only while the
// floating window is open (bound on open, unbound on destroy).
const CLOSE_SHORTCUT_SETTING_KEY = "keybinding-close-floating-window";
// In-memory LRU cap for translation results. Repeated translations of the
// same text (shortcut re-press, double-copy, language swap) are common;
// without a cache every one costs a network round-trip and quota.
const TRANSLATION_CACHE_MAX = 50;
// Total resident character budget for the cache. The key embeds the full source
// text and the value is the full translation, so a count-only cap let 50
// requests of 5000 characters each (~1MB of strings) sit in the shell process.
const TRANSLATION_CACHE_MAX_CHARS = 200000;
// Watchdog delay for translation requests. Soup.Session already times out at
// 10s; this only fires when the Soup layer itself hangs without a callback,
// turning a stuck "Cancel" button / "Translating…" placeholder into an
// explicit timeout error and cancelling the underlying request.
const SAFETY_TIMEOUT_MS = 12000;
// Per-service single-request character limits live in PROVIDERS
// (translation-helper.js) so the popup warning and the request truncation can
// never disagree about the active service.
// Same-text re-trigger suppression window (µs). After a floating window is
// triggered, repeated double-copies of the SAME text are ignored for this long.
const FLOATING_RETRIGGER_COOLDOWN_US = 2500000; // 2.5s

class Tooltip {
    constructor(actor, text) {
        this._actor = actor;
        this._text = text;
        this._tooltipActor = null;
        this._timeoutId = null;
        this._allocationId = null;

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
            // Clamp all four edges. The tooltip lives in Main.uiGroup, so an
            // unclamped position puts it off-screen with no way to reach it;
            // previously only the left edge was handled.
            const margin = 5;
            const stageW = global.stage.width;
            const stageH = global.stage.height;
            if (tx < margin) tx = margin;
            if (tx + tooltipWidth > stageW - margin) tx = stageW - tooltipWidth - margin;
            if (ty < margin) ty = margin;
            if (ty + tooltipHeight > stageH - margin) ty = stageH - tooltipHeight - margin;

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
            this.FloatingTranslationWindow = FloatingTranslationWindow;

            this._settingsChangedId = null;
            this._selectionOwnerChangedId = null;
            this._isInternalCopy = false;
            this._lastInternalCopyText = null;
            this._internalCopyTimeoutId = null;
            this._safetyTimeoutId = null;
            this._lastTriggeredText = null;
            this._lastTriggeredTime = null;
            this._lastClipboardTime = null;
            this._lastClipboardText = null;
            // LRU cache of translation results (key -> translated text).
            // Memory-only; cleared on destroy. See _makeCacheKey().
            this._translationCache = new Map();
            // Cancellable of the latest floating-window request (see
            // _translateTextIndependent). Destroyed/cancelled on disable.
            this._floatingCancellable = null;
            // Generation counter for floating requests; lets a superseded
            // request's failure stay silent (the newer request owns the UI).
            this._floatingReqSeq = 0;
            // Transient Esc binding flag; see _bindEsc/_unbindEsc.
            this._escBound = false;

            /* Icon indicator */
            let box = new St.BoxLayout();
            this.icon = new St.Icon({ style_class: 'system-status-icon' });
            box.add_child(this.icon);
            this.add_child(box);

            this._source_lang = this._get_country_code(this._getValue('source-lang'));
            this._target_lang = this._get_country_code(this._getValue('target-lang'));

            /* The panel menu keeps a single Settings entry. Translation
            happens exclusively via double-copy (Ctrl+C Ctrl+C), which opens
            the floating window; there is no shortcut and no panel UI. */
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
        }

        _setupListener() {
            const metaDisplay = global.display;
            if (metaDisplay && typeof metaDisplay.get_selection === 'function') {
                const selection = metaDisplay.get_selection();
                this._setupSelectionTracking(selection);
            } else {
                // No selection tracking available: double-copy detection needs
                // owner-changed signals, so floating translation stays inert.
                // (The old polling fallback only fed the removed panel menu.)
            }
        }

        _setupSelectionTracking(selection) {
            this.selection = selection;
            this._selectionOwnerChangedId = selection.connect('owner-changed', (selection, selectionType, selectionSource) => {
                this._onSelectionChange(selection, selectionType, selectionSource);
            });
        }

        _onSelectionChange(_a, selectionType, _b) {
            if (selectionType !== Meta.SelectionType.SELECTION_CLIPBOARD) return;
            // Plan B: sequence guard — two rapid get_text callbacks can return
            // out of order and swallow a double-C. Stale callbacks bail out here.
            const seq = (this._clipboardSeq = (this._clipboardSeq || 0) + 1);

            let now = GLib.get_monotonic_time();

            Clipboard.get_text(CLIPBOARD_TYPE, (_, text) => {
                if (this._destroyed) {
                    return;
                }
                if (seq !== this._clipboardSeq) return; // superseded by a newer selection event
                if (!text || text.trim() === '') return;

                // Precise self-echo suppression: swallow only the exact text
                // we wrote via _copyToClipboard. A different text arriving
                // inside the window is a real user copy and must not be
                // swallowed (the old flag-only check ate it).
                if (this._isInternalCopy && text === this._lastInternalCopyText) {
                    this._isInternalCopy = false;
                    if (this._internalCopyTimeoutId) {
                        GLib.Source.remove(this._internalCopyTimeoutId);
                        this._internalCopyTimeoutId = null;
                    }
                    return;
                }

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
            });
        }

        _disconnectSelectionListener() {
            if (!this._selectionOwnerChangedId || !this.selection) {
                return;
            }

            this.selection.disconnect(this._selectionOwnerChangedId);
            this._selectionOwnerChangedId = null;
        }

        _bindEsc() {
            // Guarded flag (same pattern as the old shortcut code): never ask
            // mutter to add twice or remove what isn't there.
            if (this._escBound) {
                return;
            }
            try {
                Main.wm.addKeybinding(
                    CLOSE_SHORTCUT_SETTING_KEY,
                    this._settings,
                    Meta.KeyBindingFlags.NONE,
                    Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                    () => {
                        if (this._destroyed) {
                            return;
                        }
                        const w = this._floatingWindow;
                        if (w) {
                            try { w._dismiss(); } catch (_e) {}
                        }
                    }
                );
                this._escBound = true;
            } catch (_e) {
                this._escBound = false;
            }
        }

        _unbindEsc() {
            if (!this._escBound) {
                return;
            }
            try {
                Main.wm.removeKeybinding(CLOSE_SHORTCUT_SETTING_KEY);
            } catch (_e) {}
            this._escBound = false;
        }

        _disconnectSettings() {
            if (!this._settingsChangedId) {
                return;
            }

            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        _loadPreferences() {
            this._translation_service = this._settings.get_enum('translation-service');
            this._source_lang = this._get_country_code(this._getValue('source-lang'));
            this._target_lang = this._get_country_code(this._getValue('target-lang'));
            this._split_sentences = this._getValue('split-sentences');
            this._preserve_formatting = this._getValue('preserve-formatting');
            this._formality = this._getValue('formality');
            this._url = this._getValue('url');
            this._apikey = this._getValue('apikey');
            this._baiduAppid = this._getValue('baidu-appid');
            this._baiduSecret = this._getValue('baidu-secret');
            this._youdaoAppid = this._getValue('youdao-appid');
            this._youdaoSecret = this._getValue('youdao-secret');
            this._notifications = this._getValue('notifications');
            this._darktheme = this._getValue('darktheme');

            this._showPanelIcon = this._getValue('show-panel-icon');
            this.visible = this._showPanelIcon;

            this._set_icon_indicator();
            // No keybinding anymore: translation happens exclusively via
            // double-copy (Ctrl+C Ctrl+C). Nothing else to rebind here.
        }

        _makeCacheKey(service, sourceLang, targetLang, fromText, extra) {
            // DeepL-affecting options must be part of the key so a formality/
            // endpoint change never reads back a stale translation.
            return `${service}|${sourceLang}|${targetLang}|${extra || ''}|${fromText}`;
        }

        _cacheGet(key) {
            if (!this._translationCache) return undefined;
            const hit = this._translationCache.get(key);
            if (hit !== undefined) {
                // Refresh recency for LRU order.
                this._translationCache.delete(key);
                this._translationCache.set(key, hit);
            }
            return hit;
        }

        _cacheSet(key, value) {
            if (!this._translationCache || !value) return;
            if (this._translationCache.has(key)) {
                this._translationCache.delete(key);
            }
            this._translationCache.set(key, value);
            // Evict the oldest (first-inserted) entries until BOTH budgets are
            // met. The size > 1 guard stops a just-inserted entry from being
            // evicted by its own length.
            let chars = 0;
            for (const [k, v] of this._translationCache) chars += k.length + v.length;
            while (this._translationCache.size > 1 &&
                (this._translationCache.size > TRANSLATION_CACHE_MAX ||
                    chars > TRANSLATION_CACHE_MAX_CHARS)) {
                const oldest = this._translationCache.keys().next().value;
                const oldestValue = this._translationCache.get(oldest);
                chars -= oldest.length + (oldestValue ? oldestValue.length : 0);
                this._translationCache.delete(oldest);
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
            const provider = getProvider(this._translation_service);
            const serviceName = provider ? provider.label : _('Unknown');
            const charLimit = provider ? provider.charLimit : 0;
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
                            if (toText && toText.trim() !== "") {
                                w.setTargetText(toText);
                            } else {
                                w.setErrorState(errMsg || _('Translation failed — please try again.'));
                            }
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
                            // a newer trigger may have replaced it already. The
                            // transient Esc binding dies with the window too.
                            if (this._floatingWindow === win) {
                                this._floatingWindow = null;
                            }
                            this._unbindEsc();
                        },
                        (text) => {
                            this._copyToClipboard(text);
                        },
                        this._settings,
                        {
                            onSwap: () => {
                                if (this._destroyed) return;
                                // Reverse-translate the current RESULT: after the
                                // swap the old target text becomes the new
                                // source. Rebuilding via _triggerFloatingTranslation
                                // reuses the placeholder/safety/identity machinery
                                // instead of duplicating it here.
                                const w = this._floatingWindow;
                                let backText = null;
                                try {
                                    const cur = w ? w._currentTarget : null;
                                    if (cur && cur !== PLACEHOLDER && cur.trim() !== "") {
                                        backText = cur;
                                    }
                                } catch (_e) {}
                                const oldTargetLang = this._target_lang;
                                this._target_lang = this._source_lang;
                                this._source_lang = oldTargetLang;
                                if (backText) {
                                    this._triggerFloatingTranslation(backText);
                                } else {
                                    // No result yet: keep the old behavior (swap
                                    // labels, keep translating the original).
                                    if (w) {
                                        try {
                                            w.refreshLangs(this._source_lang, this._target_lang);
                                            w.setTargetText(PLACEHOLDER);
                                            w.setLoading(true);
                                        } catch (_e) {}
                                    }
                                    reTranslate();
                                }
                            },
                            onRetry: () => {
                                if (this._destroyed) return;
                                const w = this._floatingWindow;
                                if (!w) return;
                                try {
                                    // setTargetText clears the error styling and
                                    // hides the retry button; setLoading re-dims
                                    // the copy button and restarts the spinner.
                                    w.setTargetText(PLACEHOLDER);
                                    w.setLoading(true);
                                } catch (_e) {}
                                this._armSafetyTimeout(w, PLACEHOLDER);
                                reTranslate();
                            },
                            charLimit,
                            serviceName,
                            srcLength: fromText.length,
                            loading: true,
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
                    // Transient Esc binding: registered at Mutter level (which
                    // Clutter event delivery cannot swallow), alive only while
                    // this window is open. The captured-event listener inside
                    // the window stays as a backup; whichever fires first wins
                    // (dismiss is idempotent).
                    this._bindEsc();
                    this._armSafetyTimeout(win, PLACEHOLDER);
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
                    // 12s safety net fires. Error state, so the retry button is
                    // available rather than forcing a re-copy.
                    try {
                        myWin.setErrorState(errMsg || _('Translation failed — please try again.'));
                    } catch (_e) {}
                }
            });
        }

        // Display backstop so a placeholder is never stuck forever. Request
        // cancellation lives on the per-request watchdog in
        // _translateTextIndependent; this timer only replaces still-pending
        // placeholder text (its message matches the watchdog outcome).
        // Re-armed on every attempt, including retries — without that a hung
        // retry would spin until the window is closed.
        _armSafetyTimeout(win, placeholder) {
            try {
                // Drop any timer from a previous attempt first: otherwise the
                // stale source stays alive and its callback nulls the new id,
                // leaving destroy() unable to remove the live timer.
                if (this._safetyTimeoutId) {
                    GLib.Source.remove(this._safetyTimeoutId);
                    this._safetyTimeoutId = null;
                }
                this._safetyTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAFETY_TIMEOUT_MS, () => {
                    this._safetyTimeoutId = null;
                    try {
                        if (win._currentTarget === placeholder && this._floatingWindow === win) {
                            win.setErrorState(_('Request timed out. Please check your connection and try again.'));
                        }
                    } catch (_e) {}
                    return GLib.SOURCE_REMOVE;
                });
            } catch (_e) {}
        }

        // Describe the outgoing request for the configured provider as plain
        // data so the Soup wiring in _translateTextIndependent stays
        // provider-independent. Google and DeepL produce byte-identical output
        // to the previous inline branches; test/unit.test.js pins their exact
        // URLs, content types and bodies.
        // Returns null after calling fail() when no request should be sent.
        _buildRequestSpec(fromText, fail) {
            const provider = getProvider(this._translation_service);
            if (!provider) {
                fail(_('Unknown translation service selected in settings.'));
                return null;
            }
            try {
                switch (provider.id) {
                case 'google': {
                    const { url, body, contentType } = buildGoogleRequest(this._source_lang, this._target_lang, fromText);
                    return {
                        url, method: 'POST', contentType, body,
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    };
                }
                case 'deepl': {
                    if (!this._isSafeDeepLUrl(this._url)) {
                        throw new Error(_("DeepL URL must use HTTPS"));
                    }
                    const body = JSON.stringify(buildDeepLRequestBody({
                        fromText,
                        sourceLang: this._source_lang,
                        targetLang: this._target_lang,
                        splitSentences: this._split_sentences,
                        preserveFormatting: this._preserve_formatting,
                        formality: this._formality,
                    }));
                    return {
                        url: this._url, method: 'POST', contentType: 'application/json', body,
                        headers: { 'Authorization': `DeepL-Auth-Key ${this._apikey}` },
                    };
                }
                case 'baidu': {
                    if (!this._baiduAppid || !this._baiduSecret) {
                        throw new Error(_('Baidu Translate needs an APP ID and a secret key.'));
                    }
                    const built = buildBaiduRequest({
                        appid: this._baiduAppid, secretKey: this._baiduSecret,
                        fromText, sourceLang: this._source_lang, targetLang: this._target_lang,
                        salt: String(Date.now()), hash: hashBundle,
                    });
                    if (built.error) {
                        fail(this._providerErrorText(built.error));
                        return null;
                    }
                    return built;
                }
                case 'youdao': {
                    if (!this._youdaoAppid || !this._youdaoSecret) {
                        throw new Error(_('Youdao Translate needs an app key and an app secret.'));
                    }
                    const built = buildYoudaoRequest({
                        appid: this._youdaoAppid, secretKey: this._youdaoSecret,
                        fromText, sourceLang: this._source_lang, targetLang: this._target_lang,
                        salt: String(Date.now()), curtime: String(Math.floor(Date.now() / 1000)),
                        hash: hashBundle,
                    });
                    if (built.error) {
                        fail(this._providerErrorText(built.error));
                        return null;
                    }
                    return built;
                }
                default:
                    fail(_('Unknown translation service selected in settings.'));
                    return null;
                }
            } catch (e) {
                fail(`${_("Error")}: ${e.message || e}`);
                return null;
            }
        }

        // translation-helper.js must stay gettext-free (test/unit.test.js
        // imports it under plain Node), so it reports failures as stable codes
        // and the user-facing sentence is built here where _() is available.
        _providerErrorText(err) {
            const provider = getProvider(this._translation_service);
            // Translators: fallback provider name used in error messages.
            const label = provider ? provider.label : _('the translation service');
            switch (err?.code) {
            case 'unsupported-language':
                // Translators: %s is the provider label (e.g. "Baidu Translate").
                return _('The selected language pair is not supported by %s.').replace('%s', label);
            case 'empty-translation':
                // Translators: %s is the provider label.
                return _('%s returned an empty translation.').replace('%s', label);
            case 'provider-error':
                // Translators: first %s is the provider label, second %s the
                // untranslated error text the provider itself sent back.
                return _('%s rejected the request: %s')
                    .replace('%s', label)
                    .replace('%s', err.detail || _('unknown error'));
            case 'malformed-response':
                return _('The translation service returned a malformed response.');
            default:
                return _('Translation failed — please try again.');
            }
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

            const provider = getProvider(this._translation_service);
            const providerId = provider ? provider.id : null;
            // DeepL-affecting options must be part of the key so a formality or
            // endpoint change never reads back a stale translation. The other
            // providers take no such options.
            const indepCacheExtra = providerId === 'deepl'
                ? `${this._split_sentences}|${!!this._preserve_formatting}|${this._formality}|${this._url}`
                : '';
            const indepCacheKey = this._makeCacheKey(
                this._translation_service, this._source_lang, this._target_lang, fromText, indepCacheExtra);
            const indepCached = this._cacheGet(indepCacheKey);
            if (indepCached !== undefined) {
                try { callback(indepCached); } catch (_e) {}
                return;
            }

            const spec = this._buildRequestSpec(fromText, fail);
            if (!spec) return;

            let message;
            try {
                message = Soup.Message.new(spec.method, spec.url);
                if (!message) throw new Error(_("Invalid URL"));
            } catch (e) {
                fail(`${_("Error")}: ${e.message}`);
                return;
            }
            message.set_request_body_from_bytes(spec.contentType, new GLib.Bytes(spec.body));
            for (const name in spec.headers) {
                message.request_headers.replace(name, spec.headers[name]);
            }
            
            if (this._destroyed || !this._httpSession) return;

            // Pre-empt any older floating request (rapid re-trigger, swap
            // re-translate): its quota is saved, and its failure paths below
            // stay silent via the generation check so they cannot overwrite
            // the newer request's UI with "Cancelled" or a stale error.
            // Success callbacks are deliberately left alone (existing
            // auto-copy-on-close semantics).
            if (this._floatingCancellable) {
                try { this._floatingCancellable.cancel(); } catch (_e) {}
                this._floatingCancellable = null;
            }
            this._floatingReqSeq = (this._floatingReqSeq || 0) + 1;
            const myFloatingSeq = this._floatingReqSeq;
            // Failures of a superseded request carry no value: the newer
            // request owns the UI and will report its own outcome.
            const failIfCurrent = (msg) => {
                if (myFloatingSeq !== this._floatingReqSeq) return;
                fail(msg);
            };
            // Per-request cancellable so the watchdog below can cancel a hung
            // request without aborting the shared session (which would also
            // kill a concurrent panel request).
            const myFloatingCancellable = new Gio.Cancellable();
            this._floatingCancellable = myFloatingCancellable;
            // Tracks this request's lifecycle for the watchdog. Once timedOut
            // is set, the late callback stays silent so it cannot overwrite
            // the timeout message with "Cancelled".
            const floatState = { settled: false, timedOut: false };
            const floatWatchdogId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAFETY_TIMEOUT_MS, () => {
                if (floatState.settled || floatState.timedOut) return GLib.SOURCE_REMOVE;
                floatState.timedOut = true;
                try { myFloatingCancellable.cancel(); } catch (_e) {}
                if (this._floatingCancellable === myFloatingCancellable) {
                    this._floatingCancellable = null;
                }
                return GLib.SOURCE_REMOVE;
            });

            this._httpSession.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                myFloatingCancellable,
                (session, result) => {
                    floatState.settled = true;
                    // A watchdog that already fired returned SOURCE_REMOVE, so
                    // its id is dead; removing it again logs
                    // "Source ID n was not found when attempting to remove it".
                    if (!floatState.timedOut) {
                        try { GLib.Source.remove(floatWatchdogId); } catch (_e) {}
                    }
                    if (this._floatingCancellable === myFloatingCancellable) {
                        this._floatingCancellable = null;
                    }
                    // Watchdog already reported a timeout for this request:
                    // stay silent instead of overwriting it with "Cancelled".
                    if (floatState.timedOut) return;
                    let resBytes;
                    try {
                        resBytes = session.send_and_read_finish(result);
                    } catch (e) {
                        if (this._destroyed) return;
                        failIfCurrent(this._friendlyTransportError(e) || `Error: ${e.message || e}`);
                        return;
                    }

                    if (this._destroyed) return;
                    try {
                        if (message.status_code === 200) {
                            let decoder = new TextDecoder("utf-8");
                            let response = decoder.decode(resBytes.get_data());
                            let json = JSON.parse(response);
                            
                            // Providers report their own failures inside a 200
                            // body (Baidu error_code, Youdao errorCode), so the
                            // envelope is parsed per provider instead of being
                            // assumed to be a success.
                            const parsed = parseProviderResponse(providerId, json);
                            if (parsed.text && parsed.text.trim() !== "") {
                                this._cacheSet(indepCacheKey, parsed.text);
                                callback(parsed.text);
                            } else {
                                failIfCurrent(this._providerErrorText(parsed.error));
                            }
                        } else if (providerId === 'google' && (message.status_code === 403 || message.status_code === 429)) {
                            failIfCurrent(_("Rate-limited or blocked by Google Translate. Please try again later."));
                        } else {
                            let bodyMsg = "";
                            try {
                                bodyMsg = this._extractBodyMessage(resBytes);
                            } catch (_e) {}
                            failIfCurrent(this._httpStatusMessage(message.status_code, bodyMsg));
                        }
                    } catch (e) {
                        failIfCurrent(`Error: ${e.message || e}`);
                    }
                }
            );
        }

        _extractBodyMessage(resBytes) {
            let decoder = new TextDecoder("utf-8");
            let body = JSON.parse(decoder.decode(resBytes.get_data()));
            return (body && body.message) ? body.message : "";
        }

        _httpStatusMessage(statusCode, bodyMessage) {
            const extra = bodyMessage ? `\n${bodyMessage}` : "";
            const provider = getProvider(this._translation_service);
            if (provider && provider.id === 'google' && (statusCode === 403 || statusCode === 429)) {
                return _("Rate-limited or blocked by Google Translate. Please try again later.");
            }
            if (statusCode === 429) {
                return _("Rate-limited (429): too many requests. Please wait a moment and try again.") + extra;
            }
            if (statusCode === 401) {
                return _("Auth failed (401): check API key and URL in settings") + extra;
            }
            if (statusCode === 403) {
                return _("Auth failed (403): check API key and URL in settings") + extra;
            }
            if (statusCode === 400) {
                let msg = _("Bad request (400).") + extra;
                if ((bodyMessage || "").toLowerCase().includes("source_lang")) {
                    msg += " " + _("Hint: DeepL does not accept regional codes (e.g. EN-US) as the source language.");
                }
                return msg;
            }
            if (statusCode === 408) {
                return _("Request timed out (408). Please check your connection and try again.") + extra;
            }
            if (statusCode >= 500 && statusCode < 600) {
                return _("Translation service unavailable. Please try again later.") + ` (${statusCode})` + extra;
            }
            return `Error: ${statusCode}` + extra;
        }

        _friendlyTransportError(e) {
            // Map Soup/Gio transport failures to actionable messages.
            // Returns null when unrecognized (caller falls back to generic text).
            try {
                if (e && typeof e.matches === "function" && typeof Gio !== "undefined" && Gio.IOErrorEnum) {
                    const IO = Gio.IOErrorEnum;
                    try {
                        if (IO.TIMED_OUT !== undefined && e.matches(IO, IO.TIMED_OUT)) {
                            return _("Request timed out. Please check your connection and try again.");
                        }
                    } catch (_e) {}
                    const unreachable = [IO.HOST_NOT_FOUND, IO.HOST_UNREACHABLE,
                        IO.NETWORK_UNREACHABLE, IO.CONNECTION_REFUSED];
                    for (const code of unreachable) {
                        if (code === undefined) continue;
                        try {
                            if (e.matches(IO, code)) {
                                return _("Network error: cannot reach the translation service. Please check your connection.");
                            }
                        } catch (_e) {}
                    }
                    const proxyCodes = [IO.PROXY_FAILED, IO.PROXY_AUTH_FAILED,
                        IO.PROXY_NEED_AUTH, IO.PROXY_NOT_ALLOWED];
                    for (const code of proxyCodes) {
                        if (code === undefined) continue;
                        try {
                            if (e.matches(IO, code)) {
                                return _("Proxy error: cannot reach the translation service through the configured proxy.");
                            }
                        } catch (_e) {}
                    }
                    try {
                        if (IO.TLS_FAILED !== undefined && e.matches(IO, IO.TLS_FAILED)) {
                            return _("Secure connection failed (TLS/certificate). Please check your network or proxy settings.");
                        }
                    } catch (_e) {}
                }
            } catch (_e) {}
            const raw = (e && (e.message || e)) || "";
            const m = String(raw).toLowerCase();
            if (!m) return null;
            if (m.includes("cancel")) return _("Cancelled");
            if (m.includes("timed out") || m.includes("timeout")) {
                return _("Request timed out. Please check your connection and try again.");
            }
            if (m.includes("proxy")) {
                return _("Proxy error: cannot reach the translation service through the configured proxy.");
            }
            if (m.includes("ssl") || m.includes("tls") || m.includes("certificate")) {
                return _("Secure connection failed (TLS/certificate). Please check your network or proxy settings.");
            }
            if (m.includes("resolve") || m.includes("dns") || m.includes("host_not_found")
                || m.includes("network is unreachable") || m.includes("network unreachable")
                || m.includes("unreachable") || m.includes("connection refused")
                || m.includes("no route to host") || m.includes("offline")) {
                return _("Network error: cannot reach the translation service. Please check your connection.");
            }
            return null;
        }

        _showError(messageText) {
            Main.notify("Fast Translate", messageText);
        }

        _get_country_code(description) {
            return parseCountryCode(description);
        }

        _copyToClipboard(inText) {
            this._isInternalCopy = true;
            this._lastInternalCopyText = inText;
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

        _getValue(keyName) {
            return this._settings.get_value(keyName).deep_unpack();
        }

        _isSafeDeepLUrl(url) {
            if (typeof url !== 'string') return false;
            return url.startsWith('https://');
        }

        _set_icon_indicator() {
            let themeString = (this._darktheme ? 'dark' : 'light');
            let iconString = `fast-translate-active-${themeString}`;
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

        _settingsChanged() {
            this._loadPreferences();
        }

        destroy() {
            this._destroyed = true;
            // Teardown must be total. disable() swallows any throw and drops the
            // only reference to this indicator, so a failure part-way through
            // would strand the actor in the panel, the settings and selection
            // signal handlers, and the pending timers with nothing left able to
            // release them. GObject.disconnect and GLib.Source.remove both raise
            // when the handler or source is already gone, which is reachable
            // during logout teardown, so every step is guarded on its own and
            // super.destroy() is reached unconditionally.
            if (this._floatingWindow) {
                try { this._floatingWindow.destroy(); } catch (_e) {}
                this._floatingWindow = null;
            }
            try { this._disconnectSettings(); } catch (_e) {}
            try { this._disconnectSelectionListener(); } catch (_e) {}
            this._unbindEsc();
            if (this._floatingCancellable) {
                try { this._floatingCancellable.cancel(); } catch (_e) {}
                this._floatingCancellable = null;
            }
            if (this._translationCache) {
                this._translationCache.clear();
                this._translationCache = null;
            }
            if (this._safetyTimeoutId) {
                try { GLib.Source.remove(this._safetyTimeoutId); } catch (_e) {}
                this._safetyTimeoutId = null;
            }
            if (this._internalCopyTimeoutId) {
                try { GLib.Source.remove(this._internalCopyTimeoutId); } catch (_e) {}
                this._internalCopyTimeoutId = null;
            }
            if (this._httpSession) {
                try { this._httpSession.abort(); } catch (_e) {}
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
        // Guard against re-entrant enable without disable: never leak a
        // previously scheduled idle source.
        try {
            if (this._deferredEnableId) {
                GLib.Source.remove(this._deferredEnableId);
                this._deferredEnableId = null;
            }
        } catch (_e) {}
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

class FloatingTranslationWindow {
    constructor(sourceText, targetText, sourceLang, targetLang, onDestroy, onCopyClicked, settings, opts) {
        this._onDestroy = onDestroy;
        this._settings = settings;
        this._onSwap = opts?.onSwap ?? null;
        this._onRetry = opts?.onRetry ?? null;
        this._srcLang = sourceLang;
        this._tgtLang = targetLang;
        // Pick ONE monitor for this popup and derive every geometry decision
        // from it: backdrop, card centering and height caps. Previously the
        // backdrop spanned the whole stage while the card was centered on the
        // primary monitor, so with more than one screen the backdrop swallowed
        // clicks on EVERY monitor while the card lived on only one of them.
        this._monitorIndex = this._resolveMonitorIndex();
        this._area = this._resolveWorkArea(this._monitorIndex);
        this.overlay = new St.Widget({
            style_class: 'translate-floating-overlay',
            reactive: true,
            x: this._area.x,
            y: this._area.y,
            width: this._area.width,
            height: this._area.height
        });

        this._overlayPressHandler = () => {
            this._dismiss();
            return Clutter.EVENT_STOP;
        };
        this.overlay.connect('button-press-event', this._overlayPressHandler);

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

        // Native activity indicator for the loading state. Guarded: on a
        // Shell without St.Spinner this stays null and the window degrades
        // to the placeholder text alone.
        this._spinner = null;
        try {
            if (typeof St.Spinner === 'function') {
                this._spinner = new St.Spinner({ width: 16, height: 16 });
                header.add_child(this._spinner);
            }
        } catch (_e) {
            this._spinner = null;
        }

        let closeBtn = new St.Button({
            style_class: 'translate-floating-close-btn',
            reactive: true
        });
        closeBtn.set_child(new St.Icon({
            icon_name: 'window-close-symbolic',
            style_class: 'translate-btn-icon'
        }));
        closeBtn.connect('clicked', () => this._dismiss());
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
                // Translators: %s is the translation service name (Google / DeepL).
                // The counts stay outside the msgid — they are locale-neutral.
                text: `${srcLength} / ${charLimit} · ` +
                    _('Text exceeds the %s single-request limit and was truncated').replace('%s', serviceName),
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

        // Per-region scroll viewport heights are driven by _computeCaps() /
        // _applyHeightCaps() using set_height(). CSS max-height must NOT be set
        // on the individual scroll views — it causes a silent clip with the
        // AUTOMATIC scrollbar policy, breaking scroll detection. (It is also
        // inert on the outer card; see _computeCaps().)
        try {
            // Pin both scroll viewports to their caps from the very first frame
            // so layout is stable and never sustains a tall pre-measure window.
            // Label heights are then set to force overflow (or fit) in
            // _applyHeightCaps().
            const caps = this._computeCaps();
            this._srcScroll?.set_height(caps.src);
            this._destScroll?.set_height(caps.dest);
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
            if (this._loading) return; // belt and braces: button is non-reactive while loading
            const cur = this._currentTarget;
            if (onCopyClicked) {
                onCopyClicked(cur);
            } else {
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, cur);
            }
            this._dismiss();
        });
        actions.add_child(copyBtn);
        this._copyBtn = copyBtn;

        if (this._onSwap) {
            this._swapBtn = new St.Button({
                label: '⇄',
                style_class: 'translate-floating-swap-btn',
                reactive: true
            });
            this._swapBtn.connect('clicked', () => this._onSwap());
            this._swapTip = new Tooltip(this._swapBtn, _('Swap source and target languages'));
            actions.add_child(this._swapBtn);
        }

        // Retry, revealed only by setErrorState(). Reuses the copy button's
        // style classes so it needs no CSS of its own. Must stay after copyBtn:
        // eval-test locates the copy button at actions.get_children()[0].
        this._retryBtn = null;
        if (this._onRetry) {
            this._retryBtn = new St.Button({
                style_class: 'translate-action-btn',
                reactive: true,
                visible: false
            });
            this._retryBtn.set_child(new St.Icon({
                icon_name: 'view-refresh-symbolic',
                style_class: 'translate-btn-icon'
            }));
            this._retryBtn.connect('clicked', () => {
                if (this._winDestroyed || !this._onRetry) return;
                try { this._onRetry(); } catch (_e) {}
            });
            actions.add_child(this._retryBtn);
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
        // _copyBtn must stay reachable: setLoading() is its only consumer and
        // runs immediately below. Nulling it here left the button looking
        // enabled while its click handler silently swallowed every press.
        this._loading = false;

        // Enter the loading state only when the caller says so (the live
        // trigger opens with a placeholder; tests may pass real text).
        if (opts?.loading === true) {
            this.setLoading(true);
        }

        // Center on this popup's monitor work area (same rect as the backdrop,
        // so the card can never end up outside the dismissable area).
        let allocationId = this.actor.connect('notify::allocation', () => {
            this.actor.disconnect(allocationId);
            let width = this.actor.get_width();
            let height = this.actor.get_height();
            const area = this._area;
            let x = area.x + (area.width - width) / 2;
            let y = area.y + (area.height - height) / 2;
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
        // The popup is dismissed with Esc, or with the mouse: click the
        // backdrop, the close button, or the copy button.
        try {
            Main.uiGroup.add_child(this.overlay);
            Main.uiGroup.add_child(this.actor);
        } catch (e) {
            this.destroy();
            throw e;
        }

        // Esc-to-close without focus or modal grab (see NOTE above).
        // Bubble-phase 'key-press-event' on the stage never fires for Esc
        // (verified in production logs: the listener attaches fine, but the
        // key is consumed before it bubbles up). So hook the capture phase
        // instead: 'captured-event' runs before delivery to any actor.
        // Always PROPAGATE so the focused app still receives the key.
        // Stored as a field so tests can invoke it without emitting forged
        // events through Shell's own stage handlers.
        this._keyPressId = null;
        this._keyPressHandler = (_stage, event) => {
            try {
                if (!this._winDestroyed && event && typeof event.type === 'function'
                    && event.type() === Clutter.EventType.KEY_PRESS
                    && typeof event.get_key_symbol === 'function'
                    && event.get_key_symbol() === Clutter.KEY_Escape) {
                    this._dismiss();
                }
            } catch (_e) {}
            return Clutter.EVENT_PROPAGATE;
        };
        try {
            this._keyPressId = global.stage.connect('captured-event', this._keyPressHandler);
        } catch (_e) {
            this._keyPressId = null;
        }

        // Gentle open animation (transform-only: layout/centering/measure
        // paths are unaffected).
        try {
            this.actor.set_pivot_point(0.5, 0.5);
            this.actor.set_scale(0.96, 0.96);
            this.actor.opacity = 0;
            this.actor.ease({
                opacity: 255,
                scale_x: 1.0,
                scale_y: 1.0,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } catch (_e) {
            try { this.actor.opacity = 255; } catch (_e2) {}
        }
    }

    // Monitor this popup belongs to. The trigger is a keyboard gesture
    // (double Ctrl+C), so the focus owner wins over the pointer: the user is
    // looking at the screen they were typing on. Pointers parked on another
    // screen are the normal case, not the exception.
    // Verified on GNOME 50: LayoutManager.focusIndex prefers the key-focus
    // actor and falls back to global.display.focus_window.get_monitor(), and
    // returns primaryIndex when neither exists.
    _resolveMonitorIndex() {
        const layoutManager = Main.layoutManager;
        const count = layoutManager?.monitors?.length ?? 0;
        if (count <= 0) return 0;
        const candidates = [
            () => layoutManager.focusIndex,
            () => global.display.get_current_monitor(),
            () => layoutManager.primaryIndex,
        ];
        for (const get of candidates) {
            try {
                const index = get();
                if (Number.isInteger(index) && index >= 0 && index < count) return index;
            } catch (_e) {}
        }
        return 0;
    }

    // Work area of that monitor (panel / dock struts excluded), in stage
    // coordinates. Verified on GNOME 50: MonitorConstraint({workArea: true})
    // consumes this very same rect, so x/y are safe to pass to set_position().
    _resolveWorkArea(monitorIndex) {
        const layoutManager = Main.layoutManager;
        const monitor = layoutManager?.monitors?.[monitorIndex] ?? layoutManager?.primaryMonitor;
        try {
            const area = layoutManager.getWorkAreaForMonitor(monitorIndex);
            // A zero-sized rect means monitors[] and the workspace struts are
            // momentarily out of sync (hotplug); prefer the monitor rectangle.
            if (area && area.width > 0 && area.height > 0) {
                return { x: area.x, y: area.y, width: area.width, height: area.height };
            }
        } catch (_e) {}
        return {
            x: monitor?.x ?? 0,
            y: monitor?.y ?? 0,
            width: monitor?.width ?? global.stage.width,
            height: monitor?.height ?? global.stage.height,
        };
    }

    _dismiss() {
        // Animated dismissal for user-initiated closes. Internal paths
        // (trigger rebuild, indicator disable) keep using instant destroy().
        try {
            if (this._winDestroyed || this._dismissing) return;
            this._dismissing = true;
            if (!this.actor) {
                this.destroy();
                return;
            }
            this.actor.ease({
                opacity: 0,
                duration: 120,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => this.destroy(),
            });
        } catch (_e) {
            this.destroy();
        }
    }

    setLoading(isLoading) {
        this._loading = !!isLoading;
        try {
            if (this._winDestroyed) return;
            if (this._spinner) {
                this._spinner.visible = this._loading;
                try {
                    if (this._loading) this._spinner.start();
                    else this._spinner.stop();
                } catch (_e) {}
            }
            // While loading, _currentTarget is still the placeholder: copying
            // it would put "Translating…" on the clipboard, so disarm the
            // button (plus a handler-level guard for good measure).
            if (this._copyBtn) {
                this._copyBtn.reactive = !this._loading;
                this._copyBtn.opacity = this._loading ? 110 : 255;
            }
        } catch (_e) {}
    }

    setTargetText(text) {
        this._currentTarget = text;
        // Any explicit target text (result or placeholder) ends the loading
        // state and clears a previous error's styling plus its retry button.
        this.setLoading(false);
        this._setErrorUi(false);
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

    // Failure text in the destination region, styled as an error with the
    // retry button revealed. Routed through setTargetText so height
    // re-measurement and the loading teardown stay in one place.
    setErrorState(message) {
        this.setTargetText(message);
        this._setErrorUi(true);
    }

    _setErrorUi(on) {
        if (this._winDestroyed) return;
        try {
            if (this._destLabel) {
                if (on) this._destLabel.add_style_class_name('error');
                else this._destLabel.remove_style_class_name('error');
            }
            if (this._retryBtn) this._retryBtn.visible = !!on;
        } catch (_e) {}
    }

    _recenter() {
        try {
            if (this._winDestroyed || !this.actor) return;
            const area = this._area;
            if (!area) return;
            const width = this.actor.get_width();
            const height = this.actor.get_height();
            if (!width || !height) return;
            this.actor.set_position(
                area.x + (area.width - width) / 2,
                area.y + (area.height - height) / 2
            );
        } catch (_e) {}
    }

    // Height budget for the two scroll regions.
    //
    // There is no CSS backstop: St ignores max-height on this actor. Measured
    // on GNOME Shell 50.1 / Yaru with a 736px work area — the card carried an
    // inline "max-height: 441px", rendered at 710px, and re-setting the style
    // to "max-height: 200px" left both the allocation and
    // get_preferred_height() at 710. So these caps are the ONLY thing bounding
    // the card and they must leave room for the chrome.
    //
    // Chrome, measured at card width 650px: 1px border + 24px padding x2 +
    // header 48 + two 1px dividers + five 16px gaps + actions 44 + 8px
    // actions margin-top = 232px. The truncation warning is measured rather
    // than guessed because its text wraps at card width.
    //
    // 60% of the work area is the ceiling the old max-height was aiming at;
    // what is left after chrome is split between src and dest in the original
    // 25:40 ratio. Re-measure CHROME if the card padding/spacing changes.
    _computeCaps() {
        const h = this._area?.height ?? 800;
        const CHROME = 232;
        let warn = 0;
        if (this._warnLabel) {
            try {
                // 600px = card width 650 - 2x24 padding - 2x1 border.
                warn = Math.round(this._warnLabel.get_preferred_height(600)[1]) + 16;
            } catch (_e) {
                warn = 40;
            }
        }
        const budget = Math.max(120, Math.floor(h * 0.60) - CHROME - warn);
        const src = Math.floor(budget * 25 / 65);
        return { src, dest: budget - src };
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
        const { src: srcCap, dest: destCap } = this._computeCaps();
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
            if (natHFull <= srcCap) {
                // Source cap is the smaller of the two; if it fits there, no
                // scrollbar will appear, so full-width measurement is correct.
                return { width: fullW, height: natHFull };
            }
            // Overflow expected: scrollbar will reduce available width. Add a
            // safety margin so padding / rounding never clips the last line.
            const narrowW = Math.max(200, fullW - SCROLLBAR_ESTIMATE);
            return { width: narrowW, height: label.get_preferred_height(narrowW)[1] + HEIGHT_SAFETY };
        };
        // Clear any height a previous round pinned BEFORE measuring. Clutter
        // reports an explicitly-set height as the actor's preferred height, so
        // measuring a label we already pinned returns that pinned value and the
        // +HEIGHT_SAFETY above ratchets it up by 16px on every round. Measured
        // on GNOME Shell 50.1: srcNatH ran 1168 -> 1184 -> ... -> 1264 across
        // all 9 rounds and never converged, leaving ~112px of blank scrollable
        // space below the text; and because setTargetText() resets _settleCount,
        // every retry ratcheted a further 128px on top. Clearing first makes the
        // measurement idempotent, so the fingerprint is stable from round 1 and
        // the loop stops on its own (measured: 9 rounds -> 3).
        try {
            this._srcLabel?.set_height(-1);
            this._destLabel?.set_height(-1);
        } catch (_e) {}
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
        // Disconnect the Esc listener: the stage outlives the window, so a
        // leaked connection would keep this instance alive and react to Esc
        // presses long after dismissal.
        try {
            if (this._keyPressId !== null && this._keyPressId !== undefined) {
                global.stage.disconnect(this._keyPressId);
            }
        } catch (_e) {}
        this._keyPressId = null;
        this._keyPressHandler = null;
        this._overlayPressHandler = null;
        // Stop the spinner timeline so it cannot outlive the actors.
        try { if (this._spinner) this._spinner.stop(); } catch (_e) {}
        this._spinner = null;
        this._copyBtn = null;
        this._destLabel = null;
        this._srcLabel = null;
        this._srcScroll = null;
        this._destScroll = null;
        this._srcBox = null;
        this._destBox = null;
        this._title = null;
        this._swapBtn = null;
        this._swapTip = null;
        this._retryBtn = null;
        this._onRetry = null;
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

