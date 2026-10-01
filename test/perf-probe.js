// test/perf-probe.js — headless cost/idle probe for fast-translate@local.
//
// Run it through test/perf-probe.sh, not by hand: it needs a nested
// org.gnome.Shell served by Eval, and it writes its result to the file named by
// FT_PERF_OUT (the Eval *reply* is ASCII-escaped by gdbus and cannot be parsed,
// which is why the answer travels by file).
//
// FT_PERF_PHASES: "cost" | "idle" | "all" (default "all").
//
//   cost — the things a session pays per event: module import, stylesheet load,
//          enable()/disable(), floating-window construction, the translation
//          LRU at its budget, and the clipboard handler.
//   idle — CPU attributable to the extension while nothing happens.
//
// Sampling rules, each of which cost a wrong number earlier:
//   - System.gc() burns main-thread CPU, so it belongs to the MEMORY sampler
//     only. gc-ing in a tick window invented load (a 21 ms window once read as
//     "1454% of one core").
//   - 1 tick = 10 ms (USER_HZ is 100 on Linux).
//   - /proc/self/stat fields 14+15 must be split after the LAST ')' — the comm
//     field is parenthesised and can contain spaces.
//   - VmRSS from /proc/self/status is the primary memory read; /proc/self/statm
//     needs an assumed page size, so it is a fallback only.
//   - Never conclude from one before/after pair: shell startup work overlaps the
//     first window and the trend gets mistaken for a delta. idle therefore
//     alternates disabled/enabled/disabled/enabled over 30 s windows so startup
//     drift shows up as noise instead of as a result.
//   - Headless is software-rendered on a virtual monitor. Absolute values are
//     NOT comparable to the real session; only the relative claims (no leak,
//     delta below the noise floor) carry over.
//
// Eval runs this as a *classic* script, so `imports.*` is legal here even though
// extension code itself must use ESM `gi://` imports.
(async () => {
    const Main = await import("resource:///org/gnome/shell/ui/main.js");
    const {GLib, Meta} = imports.gi;
    const System = imports.system;

    const UUID = "fast-translate@local";
    const OUT = GLib.getenv("FT_PERF_OUT") || "/tmp/ft-perf-result.json";
    const PHASES = GLib.getenv("FT_PERF_PHASES") || "all";
    const doCost = PHASES === "all" || PHASES === "cost";
    const doIdle = PHASES === "all" || PHASES === "idle";

    // ExtensionState values from misc/extensionUtils.js, which is ESM and
    // therefore unreachable from a classic script.
    const ACTIVE = 1;
    const INACTIVE = 2;
    const INITIALIZED = 6;

    const R = {meta: {}, cost: {timings: [], samples: []},
        idle: {windows: []}, errors: []};

    function save() {
        R.meta.finishedUs = GLib.get_monotonic_time();
        GLib.file_set_contents(OUT, JSON.stringify(R, null, 2));
        global.__ftPerfDone = R.meta;
    }

    // Where the probe is right now. Without this a stalled or timed-out run
    // leaves no evidence at all, because the harness deletes its temp tree on
    // exit — and a timeout that only says "timed out" costs a whole re-run.
    function mark(phase) {
        R.meta.phase = phase;
        try {
            GLib.file_set_contents(OUT + ".phase", phase + "\n");
        } catch (e) {
            // Diagnostics must never be the reason a run fails.
        }
    }
    mark("start");

    // GLib.usleep blocks the main loop, so waiting must be a timeout: only
    // between tasks do deferred idles, clipboard replies and style reloads run.
    function loopIter(ms) {
        return new Promise(resolve => {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
                resolve();
                return GLib.SOURCE_REMOVE;
            });
        });
    }
    async function settle(ms) {
        let left = ms;
        while (left > 0) {
            await loopIter(Math.min(left, 1000));   // eslint-disable-line no-await-in-loop
            left -= 1000;
        }
    }

    function readProc(path) {
        try {
            const res = GLib.file_get_contents(path);
            let d = Array.isArray(res) ? res[1] : res;
            if (d && typeof d.get_data === "function")
                d = d.get_data();
            if (typeof d === "string")
                return d;
            if (d && d.length !== undefined)
                return new TextDecoder().decode(
                    d instanceof Uint8Array ? d : new Uint8Array(d));
            R.errors.push(`readProc ${path}: unreadable shape`);
            return "";
        } catch (e) {
            R.errors.push(`readProc ${path}: ${e.message}`);
            return "";
        }
    }
    function ticks() {
        const t = readProc("/proc/self/stat");
        const i = t.lastIndexOf(")");
        if (i < 0)
            return -1;
        const f = t.slice(i + 2).split(" ");
        const u = parseInt(f[11], 10);
        const s = parseInt(f[12], 10);
        return isNaN(u) || isNaN(s) ? -1 : u + s;
    }
    function rssKB() {
        const m = /VmRSS:\s+(\d+) kB/.exec(readProc("/proc/self/status"));
        if (m)
            return parseInt(m[1], 10);
        const sm = readProc("/proc/self/statm").trim().split(/\s+/);
        return sm.length >= 2 ? parseInt(sm[1], 10) * 4 : -1;   // assumes 4 KiB
    }
    // Memory sampler: gc first so the number means "still reachable".
    function memSample(tag) {
        System.gc();
        R.cost.samples.push({tag, rssKB: rssKB()});
        return R.cost.samples[R.cost.samples.length - 1];
    }
    function timeIt(label, fn) {
        const t0 = GLib.get_monotonic_time();
        const c0 = ticks();
        const r = fn();
        R.cost.timings.push({label, us: GLib.get_monotonic_time() - t0,
            ticks: c0 < 0 ? -1 : ticks() - c0});
        return r;
    }
    async function timeAsync(label, fn) {
        const t0 = GLib.get_monotonic_time();
        const c0 = ticks();
        const r = await fn();
        R.cost.timings.push({label, us: GLib.get_monotonic_time() - t0,
            ticks: c0 < 0 ? -1 : ticks() - c0});
        return r;
    }

    const em = Main.extensionManager;

    // Wait until the shell has actually assigned a state. lookup() returning an
    // object means nothing on its own: createExtensionObject() does not set
    // `state` at all, and INITIALIZED additionally means extension.js has not
    // been imported, so stateObj is still undefined.
    async function awaitEnumerated() {
        for (let i = 0; i < 240; i++) {
            const ext = em.lookup(UUID);
            if (ext && ext.state !== undefined)
                return ext;
            await loopIter(500);     // eslint-disable-line no-await-in-loop
        }
        return null;
    }
    async function ensureActive() {
        const ext = await awaitEnumerated();
        if (!ext)
            throw new Error("extension never enumerated");
        // These two are the costs a real session pays exactly once: the ESM
        // import plus subclass construction, then stylesheet load plus enable().
        // Wall time is unreliable during startup here (portal and D-Bus timeouts
        // run for minutes and land in the same window), so the tick count is
        // what carries the claim.
        if (ext.state === INITIALIZED)
            await timeAsync("boot#import+construct", () => em._callExtensionInit(UUID));
        if (ext.state !== ACTIVE)
            await timeAsync("boot#stylesheet+enable", () => em._callExtensionEnable(UUID));
        return ext;
    }

    // enable() defers the indicator to a PRIORITY_LOW idle callback (so a slow
    // GDM autologin is not blocked), so ACTIVE does NOT mean the button exists
    // yet — reading statusArea right after enable() returns is what made an
    // earlier run of this probe bail with "no panel button after enable".
    // The same applies in reverse to disable(). Every state transition in this
    // probe waits for the button, so an A/B window measures the state it claims.
    async function awaitButton(present) {
        for (let i = 0; i < 200; i++) {
            if (!!Main.panel.statusArea[UUID] === present)
                return true;
            await loopIter(50);     // eslint-disable-line no-await-in-loop
        }
        return !!Main.panel.statusArea[UUID] === present;
    }
    async function setEnabled(want) {
        const has = !!Main.panel.statusArea[UUID];
        if (want === has)
            return true;
        if (want)
            await em._callExtensionEnable(UUID);       // eslint-disable-line no-await-in-loop
        else
            await em._callExtensionDisable(UUID);      // eslint-disable-line no-await-in-loop
        return awaitButton(want);
    }

    mark("boot:enable");
    const boot = await ensureActive();
    R.meta.state = boot.state;
    R.meta.phases = PHASES;
    if (boot.state !== ACTIVE) {
        R.errors.push(`extension not ACTIVE (state=${boot.state})`);
        save();
        return;
    }

    // ---------------------------------------------------------------- cost ----
    if (doCost) {
        // The two boot costs a real session pays once, measured here in-process.
        // Wall time is meaningless during startup (portal timeouts run for
        // minutes in this environment), so ticks carry the claim.
        if (!await awaitButton(true)) {
            R.errors.push("no panel button after enable");
            save();
            return;
        }
        const indicator = Main.panel.statusArea[UUID];

        mark("cost:idle-sample");
        // Same settle on both sides of the cycle loop. An asymmetric wait makes
        // ordinary heap ramp-up after boot look like a leak across cycles, which
        // is the single easiest way to fake a leak in this kind of probe.
        const SETTLE_MS = 6000;
        await settle(SETTLE_MS);
        const beforeCycles = memSample("idle-with-extension").rssKB;

        mark("cost:cycles");
        // Start the loop from a known disabled state: right after boot the
        // extension is already enabled, so a first setEnabled(true) would be a
        // no-op and its 0.7 ms would be reported as an enable cost.
        await setEnabled(false);       // eslint-disable-line no-await-in-loop
        await settle(SETTLE_MS);       // eslint-disable-line no-await-in-loop
        const cyclesBaseline = memSample("cycles-baseline-disabled").rssKB;
        // 20 cycles, sampled every 5. One RSS delta after N cycles cannot tell a
        // leak from ordinary allocator arena growth (freed memory is not
        // necessarily returned to the OS, even after a gc), but a *linear* rise
        // versus a saturating one can.
        const CYCLES = 20;
        for (let cycle = 0; cycle < CYCLES; cycle++) {
            // eslint-disable-next-line no-await-in-loop
            await timeAsync(`cycle${cycle}#enable`, () => setEnabled(true));
            // eslint-disable-next-line no-await-in-loop
            await settle(1200);
            // eslint-disable-next-line no-await-in-loop
            await timeAsync(`cycle${cycle}#disable`, () => setEnabled(false));
            // eslint-disable-next-line no-await-in-loop
            await settle(800);
            if ((cycle + 1) % 5 === 0) {
                // eslint-disable-next-line no-await-in-loop
                await setEnabled(true);
                // eslint-disable-next-line no-await-in-loop
                await settle(SETTLE_MS);
                const rss = memSample(`after-${cycle + 1}-cycles`).rssKB;
                R.cost.timings.push({label: `cycles${cycle + 1}#rssDeltaKB`,
                    deltaKB: rss - cyclesBaseline});
            }
        }
        // eslint-disable-next-line no-await-in-loop
        await timeAsync("final-enable", () => setEnabled(true));
        await settle(SETTLE_MS);   // eslint-disable-line no-await-in-loop
        const afterCycles = memSample(`after-${CYCLES}-enable-disable-cycles`).rssKB;
        R.cost.timings.push({label: `cycles${CYCLES}#rssDeltaKB`,
            deltaKB: afterCycles - cyclesBaseline});
        // Growth across the whole loop, for the leak-vs-arena question above.
        R.cost.idleRssKB = beforeCycles;

        const ind = Main.panel.statusArea[UUID];
        if (!ind) {
            R.errors.push("panel button vanished after the enable/disable cycles");
            save();
            return;
        }

        const WinClass = ind.FloatingTranslationWindow;
        if (typeof WinClass !== "function") {
            mark("cost:windows");
            R.errors.push("indicator has no FloatingTranslationWindow");
        } else {
            mark("cost:windows");
            const text = "The quick brown fox jumps over the lazy dog. ".repeat(6);
            const trans = "Le renard brun rapide saute par-dessus le chien paresseux. ".repeat(6);
            let totalUs = 0;
            const held = [];
            for (let i = 0; i < 20; i++) {
                const t0 = GLib.get_monotonic_time();
                held.push(new WinClass(text, trans, "EN", "FR"));
                totalUs += GLib.get_monotonic_time() - t0;
            }
            R.cost.timings.push({label: "window#20built", totalUs,
                perInstanceUs: Math.round(totalUs / 20), liveRssKB: rssKB()});
            for (const w of held)
                w.destroy();
            held.length = 0;
            await settle(4000);   // eslint-disable-line no-await-in-loop
            memSample("after-20-windows-built-and-destroyed");
        }

        {
            mark("cost:cache");
            const before = rssKB();
            const t0 = GLib.get_monotonic_time();
            for (let i = 0; i < 200; i++)
                ind._cacheSet("key" + i + "-" + "x".repeat(500), "译".repeat(2000));
            let chars = 0;
            for (const [k, v] of ind._translationCache)
                chars += k.length + v.length;
            R.cost.timings.push({label: "cache#200inserts-x-2000chars",
                us: GLib.get_monotonic_time() - t0,
                mapSize: ind._translationCache.size, totalChars: chars,
                deltaKB: rssKB() - before});
            memSample("cache-at-budget");
        }

        {
            // Every clipboard write in the session reaches this handler, so this
            // is the only always-on cost the extension has. Called directly, it
            // covers the synchronous part only: Clipboard.get_text() is async and
            // its round trip does not exist headless (no clipboard owner).
            mark("cost:clipboard");
            const c0 = ticks();
            const t0 = GLib.get_monotonic_time();
            for (let i = 0; i < 500; i++)
                ind._onSelectionChange(null, Meta.SelectionType.SELECTION_CLIPBOARD, null);
            R.cost.timings.push({label: "clipboard#500events-syncpart",
                us: GLib.get_monotonic_time() - t0, ticks: ticks() - c0});
            await settle(3000);   // eslint-disable-line no-await-in-loop
            memSample("after-500-clipboard-events");
        }

        {
            // _lastClipboardText keeps the last copied string for the
            // double-copy comparison, so the shell retains one clipboard payload.
            mark("cost:5mb-clipboard");
            ind._lastClipboardText = "A".repeat(5 * 1024 * 1024);
            await settle(2000);   // eslint-disable-line no-await-in-loop
            const heldRss = memSample("holding-5MB-clipboard-text").rssKB;
            ind._lastClipboardText = null;
            await settle(2000);   // eslint-disable-line no-await-in-loop
            R.cost.timings.push({label: "clipboard#5MBtext-held", heldRss,
                afterReleaseRssKB: memSample("released-5MB-clipboard-text").rssKB});
        }
    }

    // ---------------------------------------------------------------- idle ----
    if (doIdle) {
        // Portal timeouts and service activation dominate the floor for minutes,
        // so let the shell finish starting before measuring anything.
        mark("idle:settle-75s");
        await settle(75000);
        const baseRss = rssKB();
        System.gc();
        const baseGcRss = rssKB();

        const WINDOW_MS = 30000;
        let winIdx = 0;
        for (const wantEnabled of [false, true, false, true]) {
            mark("idle:window-" + winIdx + "-" + wantEnabled);
            winIdx++;
            // setEnabled waits for the panel button to actually appear or go, so
            // each window really is the state it is labelled as.
            const reached = await setEnabled(wantEnabled);   // eslint-disable-line no-await-in-loop
            // Transition work (stylesheet load/unload, indicator build) must not
            // land inside a measurement window.
            await settle(3000);   // eslint-disable-line no-await-in-loop
            const t0 = ticks();
            const w0 = GLib.get_monotonic_time();
            await settle(WINDOW_MS);   // eslint-disable-line no-await-in-loop
            const t1 = ticks();
            const w1 = GLib.get_monotonic_time();
            R.idle.windows.push({
                state: wantEnabled ? "enabled" : "disabled",
                stateReached: reached,
                panelButton: !!Main.panel.statusArea[UUID],
                wallMs: Math.round((w1 - w0) / 1000),
                cpuTicks: t1 - t0,
                // 1 tick = 10 ms of CPU.
                cpuPctOfOneCore: +(((t1 - t0) * 10 * 1e6) / (w1 - w0)).toFixed(2),
            });
        }
        R.idle.baseRssKB = baseRss;
        R.idle.baseRssAfterGcKB = baseGcRss;
        R.idle.enabledRssAfterGcKB = Main.panel.statusArea[UUID]
            ? (System.gc(), rssKB()) : null;
    }

    mark("done");
    save();
})().catch(e => {
    const out = GLib.getenv("FT_PERF_OUT") || "/tmp/ft-perf-result.json";
    GLib.file_set_contents(out, JSON.stringify(
        {errors: ["fatal: " + (e && e.stack ? e.stack : String(e))]}, null, 2));
    global.__ftPerfDone = {fatal: true};
});
