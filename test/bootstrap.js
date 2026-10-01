// Arm fast-translate@local inside a headless shell that cannot be enabled the
// usual way, and publish the outcome on global.__ftBoot.
//
// Why this is needed: test/integration.sh runs the nested shell with
// GSETTINGS_BACKEND=memory so that nothing it does can reach the developer's
// real ~/.config/dconf/user. The cost is that `gnome-extensions enable` — a
// gsettings write made from *outside* that process — is invisible to this shell,
// whose own enabled-extensions is the schema default (empty). So the extension
// gets enumerated but never loaded or enabled, and the only way in is the shell's
// own private entry points, which is exactly what a real session startup calls:
//
//   _callExtensionInit    import extension.js + construct the Extension subclass
//   _callExtensionEnable  load the extension stylesheet, then enable()
//
// Going through those and not straight at stateObj.enable() matters: the
// stylesheet step is what eval-test.js's `padTop === 24` assertion is really
// testing (it proves stylesheet-light/dark.css @imports stylesheet-base.css).
//
// Eval runs this as a *classic* script, so `imports.*` is legal here even though
// the extension code itself must use ESM `gi://` imports.
global.__ftBoot = null;

(async () => {
    const UUID = "fast-translate@local";
    // ExtensionState values from misc/extensionUtils.js. That module is ESM in
    // GNOME 50 and therefore unreachable from a classic script.
    const ACTIVE = 1;
    const INACTIVE = 2;
    const INITIALIZED = 6;

    const {GLib} = imports.gi;
    const wait = ms => new Promise(resolve => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        });
    });

    const Main = await import("resource:///org/gnome/shell/ui/main.js");
    const em = Main.extensionManager;

    // The extension scan is async and there is no "scan finished" signal, and
    // INITIALIZED in particular means the object exists but extension.js has
    // *not* been imported yet, so stateObj is still undefined. Poll the object.
    let ext = null;
    for (let i = 0; i < 240 && !ext; i++) {
        ext = em.lookup(UUID);
        if (!ext)
            await wait(500);
    }
    if (!ext) {
        global.__ftBoot = "ERROR:extension-not-enumerated";
        return;
    }

    if (ext.state === INITIALIZED)
        await em._callExtensionInit(UUID);
    if (ext.state === INACTIVE)
        await em._callExtensionEnable(UUID);

    global.__ftBoot = ext.state === ACTIVE
        ? "ACTIVE"
        : `ERROR:state=${ext.state}${ext.error ? " " + ext.error : ""}`;
})().catch(e => {
    global.__ftBoot = "ERROR:" + (e && e.message ? e.message : String(e));
});
