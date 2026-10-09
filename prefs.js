/*
 * fast-translate@tazztone.github.io
 *
 * Copyright (c) 2022 Lorenzo Carbonell Cerezo <a.k.a. atareao>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation documentation files (the "Software"), to
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

import Gtk from "gi://Gtk?version=4.0";
import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gdk from "gi://Gdk?version=4.0";
import GObject from "gi://GObject";
import { ExtensionPreferences, gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import { getProvider, getProviderById } from "./translation-helper.js";

export default class FastTranslatePreferences extends ExtensionPreferences {
    constructor(metadata) {
        super(metadata);
        this.initTranslations(this.metadata['gettext-domain']);
    }

    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // ----------------- PREFERENCES PAGE -----------------
        const preferencesPage = new Adw.PreferencesPage({
            title: _('Preferences'),
            icon_name: 'preferences-other-symbolic',
        });
        window.add(preferencesPage);

        // Group 1: Language Settings
        const langGroup = new Adw.PreferencesGroup({
            title: _('Language Settings'),
        });
        preferencesPage.add(langGroup);

        // Translation Service Combo
        const serviceKey = settings.settings_schema.get_key('translation-service');
        const serviceEnums = serviceKey.get_range().deep_unpack()[1].deep_unpack();
        const serviceRow = new Adw.ComboRow({
            title: _('Translation Service'),
            // Set by updatePrivacyDisclosure() before the window is shown; this is the
            // value only if that function ever stops running.
            subtitle: _('The text you copy is sent to a translation service on the internet.'),
            model: Gtk.StringList.new(serviceEnums),
        });
        serviceRow.selected = settings.get_enum('translation-service');
        serviceRow.connect('notify::selected', () => {
            settings.set_enum('translation-service', serviceRow.selected);
            updateServiceVisibility();
        });
        settings.connect('changed::translation-service', () => {
            serviceRow.selected = settings.get_enum('translation-service');
            updateServiceVisibility();
        });
        langGroup.add(serviceRow);

        // Source Language Combo
        const sourceKey = settings.settings_schema.get_key('source-lang');
        const sourceEnums = sourceKey.get_range().deep_unpack()[1].deep_unpack();
        const sourceLangRow = new Adw.ComboRow({
            title: _('Source Language'),
            subtitle: _('Default source language for new translations'),
            model: Gtk.StringList.new(sourceEnums),
        });
        sourceLangRow.selected = settings.get_enum('source-lang');
        sourceLangRow.connect('notify::selected', () => {
            settings.set_enum('source-lang', sourceLangRow.selected);
        });
        settings.connect('changed::source-lang', () => {
            sourceLangRow.selected = settings.get_enum('source-lang');
        });
        langGroup.add(sourceLangRow);

        // Target Language Combo
        const targetKey = settings.settings_schema.get_key('target-lang');
        const targetEnums = targetKey.get_range().deep_unpack()[1].deep_unpack();
        const targetLangRow = new Adw.ComboRow({
            title: _('Target Language'),
            subtitle: _('Default target language for new translations'),
            model: Gtk.StringList.new(targetEnums),
        });
        targetLangRow.selected = settings.get_enum('target-lang');
        targetLangRow.connect('notify::selected', () => {
            settings.set_enum('target-lang', targetLangRow.selected);
        });
        settings.connect('changed::target-lang', () => {
            targetLangRow.selected = settings.get_enum('target-lang');
        });
        langGroup.add(targetLangRow);

        // Formality Combo
        const formalityKey = settings.settings_schema.get_key('formality');
        const formalityEnums = formalityKey.get_range().deep_unpack()[1].deep_unpack();
        const formalityRow = new Adw.ComboRow({
            title: _('Formality'),
            subtitle: _('Lean towards formal or informal language structure (DeepL only)'),
            model: Gtk.StringList.new(formalityEnums),
        });
        formalityRow.selected = settings.get_enum('formality');
        formalityRow.connect('notify::selected', () => {
            settings.set_enum('formality', formalityRow.selected);
        });
        settings.connect('changed::formality', () => {
            formalityRow.selected = settings.get_enum('formality');
        });
        langGroup.add(formalityRow);

        // Group 2: API Configuration
        const apiGroup = new Adw.PreferencesGroup({
            title: _('DeepL Translation API Configuration'),
            description: _('The API key below is secret; the URL above is not. Both are stored on this machine in plain text.'),
        });
        preferencesPage.add(apiGroup);

        // URL Entry
        const urlRow = new Adw.EntryRow({
            title: _('DeepL API URL'),
        });
        settings.bind('url', urlRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        apiGroup.add(urlRow);

        // API Key Entry
        const apikeyRow = new Adw.EntryRow({
            title: _('API Key'),
            use_markup: false,
            input_purpose: Gtk.InputPurpose.PASSWORD,
        });
        settings.bind('apikey', apikeyRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        apiGroup.add(apikeyRow);

        // Baidu credentials. Shown only while Baidu is the active service.
        const baiduGroup = new Adw.PreferencesGroup({
            title: _('Baidu Translate API Configuration'),
            description: _('Both values come from the same page of the Baidu console. The Secret Key is the one that must stay private: it signs every request on this machine and is stored in plain text.'),
        });
        preferencesPage.add(baiduGroup);

        const baiduAppidRow = new Adw.EntryRow({
            title: _('APP ID'),
        });
        settings.bind('baidu-appid', baiduAppidRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        baiduGroup.add(baiduAppidRow);

        const baiduSecretRow = new Adw.EntryRow({
            title: _('Secret Key'),
            use_markup: false,
            input_purpose: Gtk.InputPurpose.PASSWORD,
        });
        settings.bind('baidu-secret', baiduSecretRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        baiduGroup.add(baiduSecretRow);

        // Youdao credentials. Shown only while Youdao is the active service.
        const youdaoGroup = new Adw.PreferencesGroup({
            title: _('Youdao Translate API Configuration'),
            description: _('Both values come from the same page of the Youdao console. The App Secret is the one that must stay private: it signs every request on this machine and is stored in plain text.'),
        });
        preferencesPage.add(youdaoGroup);

        const youdaoAppidRow = new Adw.EntryRow({
            title: _('App Key'),
        });
        settings.bind('youdao-appid', youdaoAppidRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        youdaoGroup.add(youdaoAppidRow);

        const youdaoSecretRow = new Adw.EntryRow({
            title: _('App Secret'),
            use_markup: false,
            input_purpose: Gtk.InputPurpose.PASSWORD,
        });
        settings.bind('youdao-secret', youdaoSecretRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        youdaoGroup.add(youdaoSecretRow);

        // Group 3: Formatting Options
        const formattingGroup = new Adw.PreferencesGroup({
            title: _('Formatting Options'),
        });
        preferencesPage.add(formattingGroup);

        const splitRow = new Adw.SwitchRow({
            title: _('Split Sentences'),
            subtitle: _('Split the input text into sentences to improve translation context and quality'),
        });
        settings.bind('split-sentences', splitRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        formattingGroup.add(splitRow);

        const preserveRow = new Adw.SwitchRow({
            title: _('Preserve Formatting'),
            subtitle: _('Retain original formatting details like capitalization, spacing, and newlines'),
        });
        settings.bind('preserve-formatting', preserveRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        formattingGroup.add(preserveRow);

        // Group 4: Double-Copy Instant Translation
        const doubleCopyGroup = new Adw.PreferencesGroup({
            title: _('Double-Copy Instant Translation'),
        });
        preferencesPage.add(doubleCopyGroup);

        const floatingAutoCopyRow = new Adw.SwitchRow({
            title: _('Auto Copy (Floating)'),
            subtitle: _('Automatically copy the translated text to the clipboard when using the floating window'),
        });
        settings.bind('floating-auto-copy', floatingAutoCopyRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        doubleCopyGroup.add(floatingAutoCopyRow);

        const backgroundModeRow = new Adw.SwitchRow({
            title: _('Double-copy Background Mode'),
            subtitle: _('Translate silently in the background on double-copy (Ctrl+C Ctrl+C) without showing the floating UI'),
        });
        settings.bind('floating-background-mode', backgroundModeRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        doubleCopyGroup.add(backgroundModeRow);

        const backgroundToastRow = new Adw.SwitchRow({
            title: _('Show Notification in Background Mode'),
            // Names both halves of the body, because it is the copied text and its
            // translation — and a notification body is readable from the lock screen.
            subtitle: _('Show a notification with the copied text and its translation. The text is visible on the lock screen.'),
        });
        settings.bind('floating-background-toast', backgroundToastRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        doubleCopyGroup.add(backgroundToastRow);

        backgroundModeRow.bind_property('active', backgroundToastRow, 'sensitive', GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE);

        // Group 5: System Integration
        const systemGroup = new Adw.PreferencesGroup({
            title: _('System Integration'),
        });
        preferencesPage.add(systemGroup);

        const notificationsRow = new Adw.SwitchRow({
            title: _('Show Notifications'),
            // This switch gates the failure notices only. A successful background
            // translation is announced by floating-background-toast instead, so
            // saying "when a translation completes" here would be untrue.
            subtitle: _('Show a system notification when a translation fails'),
        });
        settings.bind('notifications', notificationsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        systemGroup.add(notificationsRow);

        const showIconRow = new Adw.SwitchRow({
            title: _('Show Panel Icon'),
            subtitle: _('Show the extension icon in the top panel (double-copy translation still works when hidden)'),
        });
        settings.bind('show-panel-icon', showIconRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        systemGroup.add(showIconRow);

        const darkthemeRow = new Adw.SwitchRow({
            title: _('Dark Theme Indicator'),
            subtitle: _('Use dark theme friendly status icons in the top panel'),
        });
        settings.bind('darktheme', darkthemeRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        systemGroup.add(darkthemeRow);

        // The Escape binding is live in the shell (Main.wm.addKeybinding in
        // extension.js) but was never reachable from here, so a user who wanted it gone
        // had no way to ask. It is a switch, not an editor: libadwaita has no key-capture
        // widget that this extension's declared range provably ships, and hand-rolling
        // one is not worth a private-API dependency.
        //
        // The key is an array of accelerator strings, and `bind()` cannot bridge an array
        // to `active`, so the two directions are wired by hand. Disabling remembers what
        // was bound; re-enabling restores exactly that, falling back to the schema's own
        // default rather than a literal invented here.
        const CLOSE_KEY = 'keybinding-close-floating-window';
        const defaultBinding = () =>
            settings.settings_schema.get_key(CLOSE_KEY).get_default_value().deep_unpack();
        const escapeRow = new Adw.SwitchRow({
            title: _('Close the popup with Escape'),
            subtitle: _('Escape dismisses the translation popup. Turning this off frees the key for the app behind it.'),
        });
        let savedBinding = null;
        escapeRow.active = settings.get_strv(CLOSE_KEY).length > 0;
        escapeRow.connect('notify::active', () => {
            if (escapeRow.active) {
                settings.set_strv(CLOSE_KEY, savedBinding ?? defaultBinding());
                savedBinding = null;
            } else {
                savedBinding = settings.get_strv(CLOSE_KEY);
                settings.set_strv(CLOSE_KEY, []);
            }
        });
        systemGroup.add(escapeRow);


        // ----------------- ABOUT PAGE -----------------
        const aboutPage = new Adw.PreferencesPage({
            title: _('About'),
            icon_name: 'help-about-symbolic',
        });
        window.add(aboutPage);

        const aboutGroup = new Adw.PreferencesGroup({
            title: _('Extension Details'),
        });
        aboutPage.add(aboutGroup);

        const versionRow = new Adw.ActionRow({
            title: _('Version'),
            subtitle: this.metadata.version ? this.metadata.version.toString() : 'Unknown',
        });
        aboutGroup.add(versionRow);

        const authorRow = new Adw.ActionRow({
            title: _('Author'),
            subtitle: 'tazztone (Original by Lorenzo Carbonell / atareao)',
        });
        aboutGroup.add(authorRow);

        // The copyright lines in LICENSE name three holders (the original author, the
        // upstream maintainer and this fork), so the About page says who rather than
        // implying one. Statement of fact from the file, not a legal conclusion.
        const licenseRow = new Adw.ActionRow({
            title: _('License'),
            subtitle: _('MIT License — Copyright © the authors and contributors named in LICENSE'),
        });
        aboutGroup.add(licenseRow);

        const descRow = new Adw.ActionRow({
            title: _('Description'),
            subtitle: this.metadata.description,
        });
        aboutGroup.add(descRow);

        // Links Group
        const linksGroup = new Adw.PreferencesGroup({
            title: _('Links and Support'),
        });
        aboutPage.add(linksGroup);

        // This fork's own address comes from metadata.json, so the window cannot disagree
        // with what `metadata.url` says. It used to hardcode the upstream project, which
        // made the shipped settings window contradict the package it lives in.
        const forkUrl = this.metadata.url ?? '';
        const homepageRow = new Adw.ActionRow({
            title: _('This fork'),
            subtitle: forkUrl,
        });
        const homepageBtn = new Gtk.Button({
            icon_name: 'web-browser-symbolic',
            valign: Gtk.Align.CENTER,
            has_frame: false,
        });
        homepageBtn.connect('clicked', () => {
            Gio.AppInfo.launch_default_for_uri(forkUrl, null);
        });
        homepageRow.add_suffix(homepageBtn);
        linksGroup.add(homepageRow);

        // Attribution stays clickable: the dictionary card, the word handling and the
        // original design are the upstream's, and this fork carries its copyright lines.
        const upstreamUrl = 'https://github.com/tazztone/translate-assistant';
        const upstreamRow = new Adw.ActionRow({
            title: _('Upstream project'),
            subtitle: upstreamUrl,
        });
        const upstreamBtn = new Gtk.Button({
            icon_name: 'web-browser-symbolic',
            valign: Gtk.Align.CENTER,
            has_frame: false,
        });
        upstreamBtn.connect('clicked', () => {
            Gio.AppInfo.launch_default_for_uri(upstreamUrl, null);
        });
        upstreamRow.add_suffix(upstreamBtn);
        linksGroup.add(upstreamRow);

        const coffeeRow = new Adw.ActionRow({
            title: _('Buy me a coffee'),
            subtitle: 'https://buymeacoffee.com/tazztone',
        });
        const coffeeBtn = new Gtk.Button({
            icon_name: 'heart-symbolic',
            valign: Gtk.Align.CENTER,
            has_frame: false,
        });
        coffeeBtn.connect('clicked', () => {
            Gio.AppInfo.launch_default_for_uri('https://buymeacoffee.com/tazztone', null);
        });
        coffeeRow.add_suffix(coffeeBtn);
        linksGroup.add(coffeeRow);

        // Restore-to-defaults. There was no way back from any setting at all, which is the
        // one thing a settings window has to offer: a user who changed several dropdowns
        // could only find the values again by memory. Every reset is scoped to the group
        // its rows live in, so "reset this" never means "lose your keys".
        //
        // Credential groups are deliberately not given a reset: their values are issued by
        // DeepL/Baidu/Youdao and cannot be re-derived from defaults, so clearing them is a
        // destructive act and gets its own armed row instead of a reset button.
        //
        // Bound widgets (bind()) and the manual `changed::` handlers refresh themselves
        // when the keys reset, so no widget state is tracked here.
        function addResetRow(group, keys) {
            const row = new Adw.ActionRow({
                // Translators: an action that returns this group's settings to their
                // factory values. It never touches credentials.
                title: _('Restore this section’s defaults'),
                // Translators: %d is the number of settings the row will reset.
                subtitle: _('Resets %d settings in this section. Keys are never touched.').replace('%d', String(keys.length)),
                activatable: true,
            });
            row.connect('activated', () => settings.reset_keys(keys));
            group.add(row);
            return row;
        }

        // A row that deletes a stored credential. One click arms it, the second performs
        // the act, because a reset that cannot be undone is not a setting but a loss.
        function addClearKeysRow(group, keys) {
            const row = new Adw.ActionRow({
                title: _('Clear the keys in this section'),
                subtitle: _('Empties %d stored fields. This cannot be undone.').replace('%d', String(keys.length)),
                activatable: true,
            });
            const idle = row.subtitle;
            let armed = false;
            row.connect('activated', () => {
                if (!armed) {
                    armed = true;
                    // Translators: shown after the first click; the second click deletes.
                    row.subtitle = _('Click again to confirm — the stored key will be erased.');
                    return;
                }
                armed = false;
                settings.reset_keys(keys);
                row.subtitle = idle;
            });
            group.add(row);
            return row;
        }

        addResetRow(langGroup, ['translation-service', 'source-lang', 'target-lang', 'formality']);
        addResetRow(formattingGroup, ['split-sentences', 'preserve-formatting']);
        addResetRow(doubleCopyGroup, ['floating-auto-copy', 'floating-background-mode', 'floating-background-toast']);
        addResetRow(systemGroup, ['notifications', 'show-panel-icon', 'darktheme']);
        addClearKeysRow(apiGroup, ['url', 'apikey']);
        addClearKeysRow(baiduGroup, ['baidu-appid', 'baidu-secret']);
        addClearKeysRow(youdaoGroup, ['youdao-appid', 'youdao-secret']);

        // credentials live in, and whether it has the DeepL-only formatting options,
        // are declared in PROVIDERS — so appending a provider there is enough and
        // this window cannot fall out of step with the enum order.
        const credentialGroups = {
            'deepl-credentials': apiGroup,
            'baidu-credentials': baiduGroup,
            'youdao-credentials': youdaoGroup,
        };

        function updateServiceVisibility() {
            const provider = getProvider(settings.get_enum('translation-service'));
            for (const [groupId, group] of Object.entries(credentialGroups))
                group.visible = provider ? provider.credentialGroup === groupId : false;
            const formatting = provider ? provider.supportsFormatting : false;
            formattingGroup.visible = formatting;
            formalityRow.visible = formatting;
            updatePrivacyDisclosure();
        }

        // Privacy disclosure. Whatever the user double-copies leaves this machine, and the
        // settings window said nothing about that. Three facts are named here: which host
        // the selected provider sends it to, whether that provider needs a key, and that a
        // single word goes to Google for the dictionary whatever the selection says
        // (extension.js `_effectiveProvider`). Only hostnames appear — never the text,
        // never a key.
        const googleHost = getProviderById('google').host;
        function updatePrivacyDisclosure() {
            const provider = getProvider(settings.get_enum('translation-service'));
            // DeepL has no fixed host in the table: its endpoint is this very setting.
            const host = provider.host
                ?? settings.get_string('url').replace(/^https?:\/\//, '').split('/')[0];
            // Translators: %s is a hostname such as "clients5.google.com". The sentence
            // tells the user where the copied text is sent.
            let text = _('The text you copy is sent to %s for translation.').replace('%s', host);
            text += provider.credentialGroup
                // Translators: points at the key fields in the group below this row.
                ? _(' Its key is entered below.')
                // Translators: this provider needs no account and no key.
                : _(' It needs no key.');
            if (provider.id !== 'google') {
                // Translators: %s is Google's hostname. A single word also goes there
                // because only Google returns the dictionary card.
                text += ' ' + _('Single words are also sent to %s for the dictionary.').replace('%s', googleHost);
            }
            serviceRow.subtitle = text;
        }

        settings.connect('changed::url', () => updatePrivacyDisclosure());
        updateServiceVisibility();
    }
}
