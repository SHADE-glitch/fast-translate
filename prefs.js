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
            subtitle: _('Google Translate needs no key; DeepL, Baidu and Youdao each need their own credentials below'),
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
            description: _('Configure the DeepL API endpoint URL and your private authentication key'),
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
            description: _('APP ID and secret key from the Baidu Translate open platform. The secret is used locally to sign each request and is stored in plaintext in dconf.'),
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
            description: _('Application key and secret from the Youdao open platform. The secret is used locally to compute the v3 signature and is stored in plaintext in dconf.'),
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
            subtitle: _('Show a desktop notification with the translation result when running in background mode'),
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

        const homepageRow = new Adw.ActionRow({
            title: _('Project Homepage'),
            subtitle: 'https://github.com/tazztone/translate-assistant',
        });
        const homepageBtn = new Gtk.Button({
            icon_name: 'web-browser-symbolic',
            valign: Gtk.Align.CENTER,
            has_frame: false,
        });
        homepageBtn.connect('clicked', () => {
            Gio.AppInfo.launch_default_for_uri('https://github.com/tazztone/translate-assistant', null);
        });
        homepageRow.add_suffix(homepageBtn);
        linksGroup.add(homepageRow);

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

        // Helper function for service-specific visibility. The enum values are
        // the indices into PROVIDERS in translation-helper.js.
        function updateServiceVisibility() {
            const service = settings.get_enum('translation-service');
            const isDeepL = (service === 0);
            apiGroup.visible = isDeepL;
            formattingGroup.visible = isDeepL;
            formalityRow.visible = isDeepL;
            baiduGroup.visible = (service === 2);
            youdaoGroup.visible = (service === 3);
        }
        updateServiceVisibility();
    }
}
