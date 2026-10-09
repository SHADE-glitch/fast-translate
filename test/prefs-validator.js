#!/usr/bin/env gjs
// test/prefs-validator.js: Standalone headless verification of prefs.js syntax and widget properties.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw';

// The generated runner is written outside the source tree: this directory *is*
// the live extension directory, so a leftover from a throw between writing and
// deleting is both repo litter and an extra file the shell could pick up. The
// pid keeps two concurrent runs from clobbering each other.
let tempFile = null;
const cleanup = () => {
    if (!tempFile)
        return;
    try {
        tempFile.delete(null);
    } catch (e) {
        // Already gone, or owned by a run that crashed. Nothing to do.
    }
    tempFile = null;
};

try {
    // 1. Read prefs.js content
    const file = Gio.File.new_for_path('prefs.js');
    const [, content] = file.load_contents(null);
    let code = new TextDecoder().decode(content);

    // prefs.js may import siblings by relative path (it reads PROVIDERS from
    // translation-helper.js). This runner is deliberately written OUTSIDE the
    // source tree, where "./translation-helper.js" no longer exists — left
    // untouched it fails with "Unable to load file from:
    // file:///tmp/translation-helper.js", which looks like a prefs.js defect but
    // is this file's own relocation. Rebind relative specifiers to absolute URLs
    // of the real sources.
    const SRC_DIR = file.get_parent().get_path();
    code = code.replace(/from\s+["']\.\/([^"']+?)["']/g,
        (_m, name) => `from "file://${GLib.build_filenamev([SRC_DIR, name])}"`);

    // 2. Rewrite imports to use a mock base class that runs standalone
    code = code.replace(
        /import\s+\{\s*ExtensionPreferences,\s*gettext\s+as\s+_\s*\}\s+from\s+["']resource:\/\/\/org\/gnome\/Shell\/Extensions\/js\/extensions\/prefs.js["'];/,
        `
        class ExtensionPreferences {
            constructor(metadata) {
                this.metadata = metadata;
            }
            initTranslations() {}
            getSettings() {
                // get_enum answers for the real key so the driver below can render the
                // window once per provider: with a constant 0 the layout of the other
                // three providers — and the disclosure text each one builds — was never
                // constructed by this check at all.
                return {
                    settings_schema: {
                        get_key: (name) => ({
                            get_range: () => ({
                                deep_unpack: () => [null, {
                                    deep_unpack: () => ['Option1', 'Option2']
                                }]
                            }),
                            // Hardcoded to match the schema's own default so prefs.js can
                            // re-enable a binding without inventing one. The defaults guard
                            // in test/repo.test.js is what ties this to the real file.
                            get_default_value: () => ({
                                deep_unpack: () => (name === 'keybinding-close-floating-window'
                                    ? ['Escape'] : [])
                            })
                        })
                    },
                    get_enum: (k) => (k === 'translation-service' ? SERVICE : 0),
                    set_enum: () => {},
                    connect: () => {},
                    bind: () => {},
                    get_strv: (k) => (k === 'keybinding-close-floating-window' ? STRV_BOUND : []),
                    set_strv: (k, v) => { STRV.push([k, Array.from(v)]); },
                    // Mirrors the schema default of the url key, which is the endpoint
                    // DeepL discloses: prefs.js reads its host from here.
                    get_string: (k) => (k === 'url' ? 'https://api-free.deepl.com/v2/translate' : ''),
                    reset: () => {},
                    // Recorded so the driver can prove the restore/clear rows are wired to
                    // the right key sets, not merely constructed.
                    reset_keys: (keys) => { RESETS.push(Array.from(keys)); }
                };
            }
        }
        const _ = (s) => s;
        let SERVICE = 0;
        const RESETS = [];
        // What the Escape key is bound to right now, and every write the window performs.
        let STRV_BOUND = ['Escape'];
        const STRV = [];
        export function __setBinding(v) { STRV_BOUND = v; }
        export function __strvLog() { return STRV; }
        export function __clearStrv() { STRV.length = 0; }
        export function __setServiceEnum(v) { SERVICE = v; }
        export function __resetLog() { return RESETS; }
        export function __clearResets() { RESETS.length = 0; }
        `
    );

    // 3. Write mock prefs to a temp file outside the source tree
    tempFile = Gio.File.new_for_path(GLib.build_filenamev([
        GLib.get_tmp_dir(),
        `fast-translate-mock-prefs-runner-${GLib.get_monotonic_time()}.js`,
    ]));
    tempFile.replace_contents(
        new TextEncoder().encode(code),
        null,
        false,
        Gio.FileCreateFlags.REPLACE_DESTINATION,
        null
    );

    // 4. Initialize Gtk and Adw in headless mode
    Gtk.init();
    Adw.init();

    // 5. Import the mock prefs class
    const mockModule = await import('file://' + tempFile.get_path());
    const FastTranslatePreferences = mockModule.default;
    const prefsInstance = new FastTranslatePreferences({
        version: 1,
        description: 'Test'
    });

    // 6. Build the window once per provider. Each one shows a different set of groups,
    // and the disclosure subtitle is assembled per provider, so a single render only
    // ever proves one branch of that code runs.
    const { PROVIDERS } = await import('file://' + GLib.build_filenamev([SRC_DIR, 'translation-helper.js']));
    for (const provider of PROVIDERS) {
        mockModule.__setServiceEnum(provider.value);
        const mockWindow = new Adw.PreferencesWindow();
        prefsInstance.fillPreferencesWindow(mockWindow);

        // The disclosure is the user-facing privacy statement, so assert it actually
        // names the provider in play rather than only checking that nothing threw.
        // AdwPreferencesWindow exposes no page list in this binding, so the window is
        // walked as a widget tree and every subtitle it carries is collected.
        const subtitles = [];
        const walk = (w) => {
            for (let c = w.get_first_child(); c; c = c.get_next_sibling()) {
                if (typeof c.subtitle === 'string' && c.subtitle)
                    subtitles.push(c.subtitle);
                walk(c);
            }
        };
        walk(mockWindow);
        const expected = provider.host ?? 'api-free.deepl.com';
        const hit = subtitles.find((t) => t.includes(expected));
        if (!hit) {
            throw new Error(`${provider.id}: no row discloses the endpoint ${expected}. ` +
                `Subtitles built: ${JSON.stringify(subtitles)}`);
        }
        if (provider.id !== 'google' && !hit.includes('clients5.google.com')) {
            throw new Error(`${provider.id}: the disclosure must also name the host a single ` +
                `word goes to for the dictionary — got: ${hit}`);
        }
        // Restore-to-defaults wiring. Every section must carry exactly one affordance, and
        // activating it must reset exactly the keys of that section — a row that resets the
        // wrong group, or nothing at all, is the failure worth catching here.
        mockModule.__clearResets();
        const affordances = [];
        const collect = (w) => {
            for (let c = w.get_first_child(); c; c = c.get_next_sibling()) {
                if (c.get_name?.() === 'AdwActionRow' &&
                    /^(Restore this section|Clear the keys)/.test(c.title || ''))
                    affordances.push(c);
                collect(c);
            }
        };
        collect(mockWindow);
        if (affordances.length !== 7)
            throw new Error(`${provider.id}: expected 7 restore/clear rows (4 sections + 3 credential groups), got ${affordances.length}`);
        const sectionSets = [
            ['translation-service', 'source-lang', 'target-lang', 'formality'],
            ['split-sentences', 'preserve-formatting'],
            ['floating-auto-copy', 'floating-background-mode', 'floating-background-toast'],
            ['notifications', 'show-panel-icon', 'darktheme'],
        ];
        const keySets = [['url', 'apikey'], ['baidu-appid', 'baidu-secret'], ['youdao-appid', 'youdao-secret']];
        const same = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);
        const countOf = (log, set) => log.filter((got) => same(got, set)).length;

        // First pass: a plain click. The four section rows reset; the three credential
        // rows must only arm, because erasing an issued key on the first click is a loss
        // the user did not agree to.
        for (const row of affordances) row.activate();
        let log = mockModule.__resetLog();
        for (const set of sectionSets)
            if (countOf(log, set) !== 1)
                throw new Error(`${provider.id}: section ${JSON.stringify(set)} should reset exactly once per click, got ${countOf(log, set)}`);
        for (const set of keySets)
            if (countOf(log, set) !== 0)
                throw new Error(`${provider.id}: the credential row ${JSON.stringify(set)} erased a key on the FIRST click — it must arm first`);

        // Second pass: the armed credential rows now act, and only once each.
        mockModule.__clearResets();
        for (const row of affordances) row.activate();
        log = mockModule.__resetLog();
        for (const set of keySets)
            if (countOf(log, set) !== 1)
                throw new Error(`${provider.id}: credential row ${JSON.stringify(set)} did not clear exactly once after the confirming click (got ${countOf(log, set)})`);
        if (log.length !== sectionSets.length + keySets.length)
            throw new Error(`${provider.id}: second pass recorded ${log.length} resets, expected ${sectionSets.length + keySets.length} — a row acted more than once: ${JSON.stringify(log)}`);

        // The Escape switch is wired by hand (an array of accelerators cannot bind() to a
        // boolean), so both transitions have to be driven: constructed-but-never-toggled
        // would leave the whole feature unexercised.
        const escapeRow = (() => {
            let found = null;
            const seek = (w) => {
                for (let c = w.get_first_child(); c && !found; c = c.get_next_sibling()) {
                    if (c.get_name?.() === 'AdwSwitchRow' && c.title === 'Close the popup with Escape')
                        found = c;
                    else seek(c);
                }
            };
            seek(mockWindow);
            return found;
        })();
        if (!escapeRow)
            throw new Error(`${provider.id}: no row exposes the Escape binding — the switch is not in the window`);
        mockModule.__setBinding(['Escape']);
        mockModule.__clearStrv();
        escapeRow.active = false;
        let writes = mockModule.__strvLog();
        if (writes.length !== 1 || writes[0][0] !== 'keybinding-close-floating-window' || writes[0][1].length !== 0)
            throw new Error(`${provider.id}: turning Escape off must write an empty accelerator array, got ${JSON.stringify(writes)}`);
        mockModule.__clearStrv();
        escapeRow.active = true;
        writes = mockModule.__strvLog();
        if (writes.length !== 1 || writes[0][1].join() !== 'Escape')
            throw new Error(`${provider.id}: turning Escape back on must restore the binding it removed, got ${JSON.stringify(writes)}`);
        // A custom binding that existed when the window opened must survive the round trip.
        mockModule.__setBinding(['<Primary>Escape']);
        mockModule.__clearStrv();
        escapeRow.active = false;
        escapeRow.active = true;
        writes = mockModule.__strvLog();
        if (writes.length !== 2 || writes[1][1].join() !== '<Primary>Escape')
            throw new Error(`${provider.id}: the off/on cycle lost a custom binding, got ${JSON.stringify(writes)}`);
        mockModule.__setBinding(['Escape']);

        mockWindow.destroy();
    }

    console.log(`✅ Preferences layout validation successful! (${PROVIDERS.length} providers rendered)`);
} catch (e) {
    console.error('❌ Preferences validation failed:', e);
    // imports.system.exit() terminates the process and skips a finally
    // clause, so the failure path has to clean up before it leaves.
    cleanup();
    // Exit with failure code
    imports.system.exit(1);
} finally {
    cleanup();
}
