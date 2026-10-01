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
                return {
                    settings_schema: {
                        get_key: (name) => ({
                            get_range: () => ({
                                deep_unpack: () => [null, {
                                    deep_unpack: () => ['Option1', 'Option2']
                                }]
                            })
                        })
                    },
                    get_enum: () => 0,
                    set_enum: () => {},
                    connect: () => {},
                    bind: () => {},
                    get_strv: () => ['<Super>t']
                };
            }
        }
        const _ = (s) => s;
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

    // 6. Test fillPreferencesWindow
    const mockWindow = new Adw.PreferencesWindow();
    prefsInstance.fillPreferencesWindow(mockWindow);

    console.log('✅ Preferences layout validation successful!');
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
