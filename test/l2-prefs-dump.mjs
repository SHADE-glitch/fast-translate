// L2 instrument: read the *rendered* state of a live GNOME session's windows through the
// a11y bus, with no screenshot (GNOME 50 denies Screenshot to ordinary clients) and no
// org.gnome.Shell.Eval (that needs --unsafe-mode, so it exists only in the nested shell).
//
//   gjs -m test/l2-prefs-dump.mjs apps
//   gjs -m test/l2-prefs-dump.mjs tree <app-name-substring>
//
// Not shipped (scripts/pack.sh copies an explicit list), not in CI, and not part of
// `npm test`: it needs a live desktop session with the a11y bus running.
//
// Privacy: this tool prints *labels* only. An `entry` / `password-text` node's text is
// never read, because this extension's prefs fields hold provider credentials.
// `tree` prints the frame title and every row's accessible name, role and VISIBLE/SHOWING
// state — which is what "does the disclosure row exist in the real window" is actually
// asking. Whether a widget is *legible* is not answerable here; that stays with the
// maintainer (see docs/maintenance/verification.md §4).

import Atspi from "gi://Atspi";

const MODE = ARGV[0] ?? "apps";
const NEEDLE = (ARGV[1] ?? "").toLowerCase();
const MAX_NODES = 600;

const role = (a) => {
    try { return a.get_role_name(); } catch { return "?"; }
};

const EDITABLE = /^(entry|password text|password-text)$/;

function nameOf(a) {
    try { return a.get_name() ?? ""; } catch { return "<unreadable>"; }
}

function stateOf(a) {
    try {
        const s = a.get_state_set();
        // `SENSITIVE`, not `ENABLED`: GTK4's AT-SPI bridge does not populate ENABLED at all,
        // so reading it here would report every real window as disabled. Measured on this
        // session's own prefs window — `ENABLED=false SENSITIVE=true`.
        return `visible=${s.contains(Atspi.StateType.VISIBLE)} ` +
               `showing=${s.contains(Atspi.StateType.SHOWING)} ` +
               `sensitive=${s.contains(Atspi.StateType.SENSITIVE)}`;
    } catch { return "visible=? showing=? sensitive=?"; }
}

function line(a, depth) {
    const r = role(a);
    const n = nameOf(a);
    // The one rule that must not be relaxed: never surface the *value* of a field.
    const text = EDITABLE.test(r) ? '(value not read)' : `"${n}"`;
    return `${"  ".repeat(depth)}[${r}] ${text} ${stateOf(a)}`;
}

function walk(a, depth, out) {
    if (out.length >= MAX_NODES) return;
    out.push(line(a, depth));
    let n = 0;
    try { n = a.get_child_count(); } catch { return; }
    for (let i = 0; i < n; i++) {
        let c = null;
        try { c = a.get_child_at_index(i); } catch { continue; }
        if (c) walk(c, depth + 1, out);
    }
}

const desktop = Atspi.get_desktop(0);
let apps = 0;
try { apps = desktop.get_child_count(); } catch { /* no bus */ }

if (apps === 0) {
    print("0 apps on the a11y bus — the bridge is off (NO_AT_BRIDGE=1?) or this is not a " +
        "desktop session. This instrument cannot run headless; use test/integration.sh for L1.");
}

if (MODE === "apps") {
    print(`apps on the a11y bus: ${apps}`);
    for (let i = 0; i < apps; i++) {
        const app = desktop.get_child_at_index(i);
        let name = "<none>", wins = "?";
        try { name = app.get_name(); } catch { /* ignore */ }
        try { wins = app.get_child_count(); } catch { /* ignore */ }
        print(`  ${i}: ${name} (windows=${wins})`);
    }
} else {
    let matched = 0;
    for (let i = 0; i < apps; i++) {
        const app = desktop.get_child_at_index(i);
        let name = "";
        try { name = app.get_name() ?? ""; } catch { continue; }
        if (NEEDLE && !name.toLowerCase().includes(NEEDLE)) continue;
        matched++;
        print(`=== app ${i}: ${name}`);
        const out = [];
        walk(app, 0, out);
        out.forEach((l) => print(l));
    }
    print(`matched apps: ${matched} of ${apps}`);
    if (matched === 1 && NEEDLE) {
        print("note: extension prefs all host under the app name " +
            "`org.gnome.Shell.Extensions`, and the shell keeps exactly one prefs dialog " +
            "open — `LaunchExtensionPrefs`/`OpenExtensionPrefs` then fail with " +
            "`Already showing a prefs dialog`. Close the other window first.");
    }
}
