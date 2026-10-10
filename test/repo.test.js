// Repository-level guards for fast-translate@local.
//
// These tests assert nothing about runtime behaviour. They guard *invariants of
// the repository itself* — the ones where a silent violation costs far more than
// a failing test: a bilingual README pair drifting out of step, or a committed
// doc that reads as unfinished work.
//
//   npm test          (desktop-free: no gjs, no GNOME, no network)
//
// Each describe names the rule it protects, and every assertion message says
// what a failure MEANS, so a red run is self-explanatory. Runtime facts that
// cannot be observed from outside the shell live in test/integration.sh instead.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every file in the working tree, skipping VCS and install noise. This is a
 * directory walk rather than `git ls-files` on purpose: the guards must also see
 * a brand-new harness script one second before it is committed.
 */
function listFiles() {
    const out = [];
    // `venv` is here because scripts/pack.sh creates it inside the repo, and any
    // third-party markdown it installs would otherwise be walked by both guards.
    const skip = new Set([".git", "node_modules", ".gitignore", "__pycache__", "venv"]);
    const walk = (rel) => {
        for (const e of fs.readdirSync(path.join(REPO, rel), { withFileTypes: true })) {
            if (skip.has(e.name))
                continue;
            const r = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory())
                walk(r);
            else if (e.isFile())
                out.push(r);
        }
    };
    walk("");
    return out.sort();
}

const FILES = listFiles();
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

// Source with whole-line comments removed, for guards that must measure code and
// not the prose describing it. Deliberately narrow: only lines whose first
// non-space characters are `//`, so a `//` inside a string literal stays.
const srcCode = (src) =>
    src.split("\n").filter((line) => !/^\s*\/\//.test(line)).join("\n");

describe("a guard's test runs in the branch production actually takes", () => {
    // Each of these is a pure decision that exists to stop a specific user-visible
    // defect, and test/unit.test.js asserts its behaviour. That coverage is
    // decorative if extension.js re-implements the decision inline: the suite stays
    // green while the branch users run changes. So the call site is pinned here.
    const GUARDED_DECISIONS = [
        ["swapLanguages", "⇄ must not move AUTO into the target slot"],
        ["safeTruncate", "truncation must not split a surrogate pair"],
        ["codePointLength", "the character limit must count code points, not UTF-16 units"],
        ["isSameLanguage", "a same-language pair must not cost a round trip"],
        ["hasVisibleText", "invisible-only selections must not fire a request"],
    ];
    const EXT = srcCode(read("extension.js"));

    for (const [name, why] of GUARDED_DECISIONS) {
        it(`${name}() is called from extension.js`, () => {
            const calls = (EXT.match(new RegExp(`\\b${name}\\(`, "g")) || []).length;
            assert.ok(calls >= 1,
                `${name} exists because ${why}, but extension.js never calls it — ` +
                `unit.test.js is guarding a branch production does not run. ` +
                `Either delegate to the helper or move the assertion to L1.`);
        });
    }
});

describe("the settings window reads the provider registry, not enum integers", () => {
    // prefs.js used to hardcode `service === 0 / 2 / 3` for which credential group
    // to show, duplicating the table in translation-helper.js. Reordering PROVIDERS
    // would then silently show another provider's keys.
    const PREFS = srcCode(read("prefs.js"));

    it("imports the registry", () => {
        assert.match(PREFS, /from "\.\/translation-helper\.js"/,
            "prefs.js must import the provider registry it depends on");
        assert.match(PREFS, /\bgetProvider\b/,
            "and resolve the current service through it, not through its integer");
    });

    it("contains no enum-index comparison for service visibility", () => {
        const hits = PREFS.match(/\b(service|value)\s*===?\s*[0-3]\b/g) || [];
        assert.deepEqual(hits, [],
            `prefs.js decides which group to show from ${hits.join(", ") || "nothing"} — ` +
            `those are enum integers, and the registry is the only place they belong`);
    });
});

describe("the main thread never touches the disk", () => {
    // AGENTS.md: no synchronous IO on the shell main loop. This one was real —
    // _get_icon() probed `<name>.svg` then `<name>.png` with query_exists(), so
    // every theme or darktheme change ran two synchronous stats inside the
    // compositor. Existence is a repo property, so it is asserted here instead.
    const EXT = srcCode(read("extension.js"));
    const ACTIVE_ICONS = [
        "icons/fast-translate-active-dark.svg",
        "icons/fast-translate-active-light.svg",
    ];

    it("the panel icons the code names by path are actually shipped", () => {
        for (const rel of ACTIVE_ICONS)
            assert.ok(FILES.includes(rel),
                `${rel} is referenced by _set_icon_indicator() by file path; shipping without it renders a broken icon`);
    });

    it("extension.js does not stat at runtime", () => {
        // Measured against CODE, not prose: the comment in _get_icon() names the
        // call that was removed, so a substring test would match the very fix it
        // certifies. EXT already had whole-line comments stripped.
        assert.ok(!/\.query_exists\s*\(/.test(EXT),
            "query_exists() is a synchronous stat on the compositor thread — the two active icons are " +
            "asserted to exist above, so probe nothing at runtime");
    });
});

describe("a probe reads the settings store only as a hash", () => {
    // All six string keys of this schema are credential-shaped — `apikey`,
    // `baidu-appid`/`baidu-secret`, `youdao-appid`/`youdao-secret`, and `url`,
    // which prefs.js clears together with `apikey` — so printing any of them is
    // printing a secret. The zero-write property is therefore proven with
    // `sha256sum ~/.config/dconf/user` (docs/maintenance/cost-measurement.md),
    // which proves the same thing without reading a value. A `dconf dump` of the
    // schema proves it too, and leaves every key this schema holds in plaintext in
    // whatever file the run is redirected to — so the value-printing form is never
    // the right instrument for an "unchanged" claim, and is refused here rather
    // than only written down (docs/maintenance/verification.md §3).
    //
    // Executables only, and with their own line comments stripped: the rule is
    // also stated in prose (AGENTS.md, the harness scripts' isolation notes), and
    // a guard that matched prose would flag the documents that carry it.
    const strip = (rel, src) => {
        const marker = rel.endsWith(".sh") ? /^\s*#/ : /^\s*\/\//;
        return src.split("\n").filter((line) => !marker.test(line)).join("\n");
    };
    const EXEC = FILES.filter((f) => /\.(sh|js|mjs|cjs)$/.test(f));
    const PRINTS_A_VALUE = /\bdconf\s+(dump|read)\b|\bgsettings\s+(get|list|list-recursively)\b/;

    it("the scan covers the harness scripts it is about", () => {
        assert.ok(EXEC.includes("test/integration.sh") && EXEC.includes("test/perf-probe.sh")
            && EXEC.length >= 10,
            `the scan saw ${EXEC.length} executable file(s) and covers integration.sh=${EXEC.includes("test/integration.sh")}, ` +
            `perf-probe.sh=${EXEC.includes("test/perf-probe.sh")}. Both are the scripts that redirect a run into a ` +
            `log file, so a scan that misses them guards nothing`);
    });

    it("no script prints a settings value", () => {
        const hits = EXEC.filter((f) => PRINTS_A_VALUE.test(strip(f, read(f))));
        assert.deepEqual(hits, [],
            `${hits.join(", ") || "nothing"} reads a settings value from the command line. Every string key of ` +
            `this schema can hold a provider credential, so its output lands in the log the run is redirected to — ` +
            `use sha256sum ~/.config/dconf/user for the before/after pair instead`);
    });
});

describe("the card's geometry constants still match the CSS they mirror", () => {
    // The floating card sizes itself with numbers copied out of the stylesheet:
    // _computeCaps() measures the truncation warning at card width minus borders
    // and padding, and CHROME sums padding, spacing and dividers. St ignores
    // max-height, so CSS cannot bound the card and these literals ARE the
    // layout contract — but they live in two files. Change a declaration here
    // without the arithmetic there and the warning is measured at a width the
    // card never renders at, so the budget is off by a line height in silence.
    const EXT = srcCode(read("extension.js"));
    // A declaration's value, or 0 when the block does not carry it. The leading
    // boundary keeps `min-width:` / `padding-top:` from answering for `width:`
    // and `padding:`.
    const px = (block, prop) => {
        const m = block.match(new RegExp(`(?:^|[{\\s])${prop}:\\s*(\\d+)px`, "m"));
        return m ? Number(m[1]) : 0;
    };
    const baseRule = (selector) => {
        const m = read("stylesheet-base.css").match(
            new RegExp(`\\.${selector}\\s*\\{[^}]*\\}`));
        assert.ok(m, `stylesheet-base.css no longer declares .${selector} — the card is unstyled`);
        return m[0];
    };
    const variantRule = (rel) => {
        const m = read(rel).match(/\.translate-floating-window\s*\{[^}]*\}/);
        assert.ok(m, `${rel} no longer styles .translate-floating-window — the card lost its variant`);
        return m[0];
    };
    const card = baseRule("translate-floating-window");
    const border = px(variantRule("stylesheet-light.css"), "border");
    const padding = px(card, "padding");
    const cardWidth = px(card, "width");

    it("both variants give the card the same border", () => {
        assert.equal(border, px(variantRule("stylesheet-dark.css"), "border"),
            "light and dark must agree on the card border: the height budget subtracts it once, " +
            "so a variant-specific border makes the budget wrong in exactly one theme");
    });

    it("the width the warning is measured at is the card's content width", () => {
        const expected = cardWidth - 2 * padding - 2 * border;
        const literals = [...EXT.matchAll(/get_preferred_height\((\d+)\)/g)].map((m) => Number(m[1]));
        assert.deepEqual(literals, [expected],
            `_computeCaps() measures at ${literals.join(", ") || "no literal width"}, but CSS gives the ` +
            `card ${cardWidth}px - 2*${padding}px padding - 2*${border}px border = ${expected}px. ` +
            `Either fix the literal or update the CHROME comment beside it.`);
    });

    it("CHROME is the sum of the declarations it cites", () => {
        // Spacing, divider and the actions margin come straight out of the base
        // stylesheet; the header, the actions row and the warning are measured
        // widget heights that only a live shell can re-derive (L2), so they are
        // deliberately NOT asserted here.
        const spacing = px(card, "spacing");
        const divider = px(baseRule("translate-floating-divider"), "height");
        const actionsMargin = px(baseRule("translate-floating-actions"), "margin-top");
        assert.ok(spacing === 16 && divider === 1 && actionsMargin === 8,
            `CHROME = 232 was added up from 5*${spacing} spacing + 2*${divider} divider + ` +
            `${actionsMargin} actions margin-top; those CSS terms changed, so re-measure the whole ` +
            `budget in a live shell`);
    });
});

describe("the shipped defaults keep the promises the settings copy makes", () => {
    // A default is behaviour, and `prefs.js` describes it in prose. Those two live in
    // different files, so they can contradict each other while every test passes —
    // which is exactly what happened: the background-mode row advertised silent
    // translation while `floating-background-toast` defaulted to true, and
    // `notifications` defaulted to false, which makes a background-mode failure
    // invisible (the inline error branch needs `!isBackground`, extension.js:721, and
    // fail() gates on this._notifications, extension.js:1014).
    const SCHEMA = read("schemas/org.gnome.shell.extensions.fast-translate.gschema.xml");
    const boolDefault = (key) => {
        const m = SCHEMA.match(new RegExp(
            `<key\\s+name="${key}"\\s+type="b">\\s*<default>\\s*(true|false)\\s*</default>`));
        assert.ok(m, `${key}: no boolean <default> in the schema — the copy cannot be checked against it`);
        return m[1] === "true";
    };

    it("a background-mode failure can reach the user by default", () => {
        assert.equal(boolDefault("notifications"), true,
            "notifications must default to true: with false, a translation that fails in " +
            "background mode produces no card (that branch requires !isBackground) and no " +
            "notification, so the user gets silence and a clipboard that never changed");
    });

    it("background mode is silent by default, because that is what its row says", () => {
        assert.equal(boolDefault("floating-background-toast"), false,
            "the Double-copy Background Mode row promises silent translation, so the toast " +
            "that quotes the source text and the result must be off until asked for — " +
            "a notification body also lands on the lock screen");
    });

    it("Escape is bound by default, so the on/off row has something to toggle", () => {
        // The default is wrapped in CDATA (`[['Escape']]' is a JS-array string), so the
        // value is taken between the tags rather than as a plain attribute.
        const m = SCHEMA.match(new RegExp(
            `<key\\s+name="keybinding-close-floating-window"\\s+type="as">\\s*<default>([\\s\\S]*?)</default>`));
        assert.ok(m, "keybinding-close-floating-window must stay an as-type key with a default");
        assert.match(m[1], /Escape/,
            "the prefs row toggles between this default and an empty array; if the default " +
            "changes, the row writes the wrong binding");
    });
});

describe("the translation catalogs cover the strings the code asks to translate", () => {
    // `_()` is the only path to a translated string, and the catalogs are still not
    // generated here: gettext has been installed since 2026-10-10, but
    // `scripts/update-pot.sh` rewrites the template into a shape that puts five of these
    // assertions red (measured — see open-items §3), so coverage stays a repository fact.
    // Otherwise a msgid can be added, shipped and simply never appear in po/: the UI stays
    // English silently and a translator gets an incomplete catalog. This guard makes that loud.
    const TRANSLATED = ["extension.js", "prefs.js", "translation-helper.js"];

    const jsUnescape = (s) => s
        .replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\(["'`\\])/g, "$1");
    const poUnescape = (s) => s
        .replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\(["\\])/g, "$1");

    // Every literal passed to _() in the sources, whole-line comments stripped so a
    // sentence in a comment cannot register as a msgid.
    function sourceMsgids() {
        const out = new Set();
        for (const f of TRANSLATED) {
            const code = srcCode(read(f));
            for (const m of code.matchAll(/_\(\s*(["'`])((?:(?!\1)[^\\]|\\.)*?)\1\s*\)/g))
                out.add(jsUnescape(m[2]));
        }
        return out;
    }

    // msgid strings of a catalog, including C-style continuations on the next lines.
    function catalogMsgids(rel) {
        const lines = read(rel).split("\n");
        const out = new Set();
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^msgid\s+"((?:[^"\\]|\\.)*)"/);
            if (!m) continue;
            let text = m[1];
            while (i + 1 < lines.length && /^"((?:[^"\\]|\\.)*)"$/.test(lines[i + 1]))
                text += lines[++i].slice(1, -1);
            if (text) out.add(poUnescape(text));
        }
        return out;
    }

    // The extracted `#.` comment of every entry, keyed by msgid. `#. ` starts the hint and
    // `# ` continues it, which is how gettext wraps a long one.
    function catalogHints(rel) {
        const lines = read(rel).split("\n");
        const out = new Map();
        let comment = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^#\.\s/.test(line)) comment.push(line.slice(3).trim());
            else if (/^#\s+\S/.test(line) && comment.length) comment.push(line.slice(2).trim());
            else if (/^#/.test(line)) continue;
            else if (/^msgid\s+"/.test(line)) {
                let text = line.match(/^msgid\s+"((?:[^"\\]|\\.)*)"/)[1];
                let k = i;
                while (k + 1 < lines.length && /^"((?:[^"\\]|\\.)*)"$/.test(lines[k + 1]))
                    text += lines[++k].slice(1, -1);
                if (text && comment.length) out.set(poUnescape(text), comment.join(" ").replace(/\s+/g, " "));
                comment = [];
                i = k;
            } else comment = [];
        }
        return out;
    }

    // `// Translators: …` above a `_()` call is the only explanation a translator gets of
    // what each placeholder stands for. Nothing regenerates the catalogs here, so the
    // pairing between that comment and the catalog entry is guarded, not assumed.
    function sourceHints() {
        const hints = [];
        for (const f of TRANSLATED) {
            const lines = read(f).split("\n");
            for (let i = 0; i < lines.length; i++) {
                const m = lines[i].match(/^\s*\/\/\s*Translators:\s*(.*)$/);
                if (!m) continue;
                let hint = m[1].trim();
                let j = i + 1;
                while (j < lines.length && /^\s*\/\/\s+\S/.test(lines[j]) && !/Translators:/.test(lines[j])) {
                    hint += " " + lines[j].replace(/^\s*\/\/\s*/, "").trim();
                    j++;
                }
                let msgid = null;
                for (let k = i; k < lines.length; k++) {
                    const c = lines[k].match(/_\(\s*(["'`])((?:(?!\1)[^\\]|\\.)*?)\1\s*\)/);
                    if (c) { msgid = jsUnescape(c[2]); break; }
                }
                hints.push({ where: `${f}:${i + 1}`, msgid, hint: hint.replace(/\s+/g, " ") });
            }
        }
        return hints;
    }

    const src = sourceMsgids();
    const hints = sourceHints();

    it("the sources carry translator hints at all", () => {
        // Same anti-vacuity argument as above: a matcher that stopped matching would let
        // the hint assertions below pass while checking nothing.
        assert.ok(hints.length >= 10,
            `only ${hints.length} "Translators:" comment(s) found — if the comment form changed, ` +
            `the catalog-hint guard is checking nothing`);
    });

    it("the sources ask for translation at all", () => {
        // A guard over an empty set proves nothing: if the extraction ever matches
        // nothing, the coverage assertions below would pass vacuously.
        assert.ok(src.size > 50,
            `only ${src.size} msgid(s) extracted — the _() matcher stopped working, so this ` +
            `guard is checking nothing`);
    });

    it("messages.pot carries every string the sources translate", () => {
        const pot = catalogMsgids("po/messages.pot");
        const missing = [...src].filter((s) => !pot.has(s)).sort();
        assert.deepEqual(missing, [],
            `po/messages.pot is missing ${missing.length} of ${src.size} msgid(s): ` +
            `${missing.map((s) => JSON.stringify(s)).join(", ")} — a string that is not in the ` +
            `catalog can never be translated, no matter what a translator writes in the .po files`);
    });

    for (const rel of ["po/de.po", "po/es.po", "po/nl.po"]) {
        it(`${rel} carries every string the sources translate`, () => {
            // Decided 2026-10-09: the locale catalogs track the template's live strings,
            // so a new `_()` has to land in all four files. The entries start with an empty
            // msgstr, which gettext resolves to the English msgid — so this costs a maintainer
            // an edit, never a wrong translation, and it is what stops a locale silently
            // falling behind by 91 strings the way it did here.
            const have = catalogMsgids(rel);
            const missing = [...src].filter((s) => !have.has(s)).sort();
            assert.deepEqual(missing, [],
                `${rel} is missing ${missing.length} of ${src.size} msgid(s): ` +
                `${missing.map((s) => JSON.stringify(s)).join(", ")} — an entry that is not in the ` +
                `catalog can never be translated, and the translator never sees it`);
        });

        it(`${rel} carries the same placeholders explained`, () => {
            // A hint in the template that the locale drops leaves that translator guessing
            // what %s is, which is how a placeholder gets translated as a literal "%s".
            const fileHints = catalogHints(rel);
            const lost = hints.filter((h) => h.msgid && src.has(h.msgid) &&
                catalogMsgids(rel).has(h.msgid) && !fileHints.has(h.msgid));
            assert.deepEqual(lost.map((h) => h.where), [],
                `${rel} has no #. hint for ${lost.length} string(s) whose source comment exists: ` +
                `${lost.map((h) => `${h.where} ${JSON.stringify(h.msgid.slice(0, 40))}`).join(", ")}`);
        });
    }

    // The schemas are a **second translatable source** that nothing above can see: glib
    // translates `<summary>`/`<description>` because `<schemalist gettext-domain="…">` declares
    // a domain, and no `_()` call is involved — so renaming a provider or adding a key
    // de-translates the settings schema while every guard stays green. Measured 2026-10-10: 15
    // of the strings the schema asked for were in no catalog, and the template still held the
    // pre-Baidu/Youdao wording for others.
    const xmlUnescape = (s) => s
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");

    function schemaStrings() {
        const entries = [];
        const tags = new Map();
        for (const rel of FILES.filter((f) => f.endsWith(".gschema.xml")).sort()) {
            const lines = read(rel).split("\n");
            let domain = null;
            for (let i = 0; i < lines.length; i++) {
                const d = lines[i].match(/<schemalist\b[^>]*\bgettext-domain="([^"]*)"/);
                if (d) domain = d[1];
                const t = lines[i].match(/<(summary|description)>([^<]*)<\/\1>/);
                if (t && t[2]) entries.push({ text: xmlUnescape(t[2]), where: `${rel}:${i + 1}`, domain });
            }
            tags.set(rel, (read(rel).match(/<(summary|description)>/g) || []).length);
        }
        return { entries, tags };
    }

    const schema = schemaStrings();
    const schemaAsked = schema.entries;

    it("every <summary>/<description> in the schemas is readable one per line", () => {
        // The reader above assumes one element per line, which is how every schema here is
        // written. A wrapped element would make the coverage assertion silently demand less,
        // so the assumption is checked instead of trusted.
        const blind = [...schema.tags].filter(([rel, n]) =>
            n !== schemaAsked.filter((s) => s.where.startsWith(rel)).length)
            .map(([rel, n]) => `${rel} holds ${n} opening tag(s) but the reader collected ` +
                `${schemaAsked.filter((s) => s.where.startsWith(rel)).length}`);
        assert.deepEqual(blind, [],
            `${blind.join("; ")} — one element is split across lines, so this guard is now blind to it. ` +
            `Put it back on one line or teach the reader to join them`);
    });

    it("the schema asks gettext in the domain the extension binds", () => {
        // If these two ever differ, every schema string in the catalog is dead weight: the
        // compiled schema looks the messages up under the domain it declares, and the shell
        // binds the one from metadata.json.
        const meta = JSON.parse(read("metadata.json"));
        const domains = [...new Set(schemaAsked.map((s) => s.domain))];
        assert.deepEqual(domains, [meta["gettext-domain"]],
            `the <schemalist> gettext-domain(s) ${JSON.stringify(domains)} do not match metadata.json's ` +
            `${JSON.stringify(meta["gettext-domain"])}`);
    });

    it("the catalogs carry every string the schemas ask gettext to translate", () => {
        assert.ok(schemaAsked.length > 40,
            `only ${schemaAsked.length} schema string(s) parsed — the <summary>/<description> reader ` +
            `stopped working, so this guard is checking nothing`);
        const want = [...new Set(schemaAsked.map((s) => s.text))];
        for (const rel of ["po/messages.pot", "po/de.po", "po/es.po", "po/nl.po"]) {
            const have = catalogMsgids(rel);
            const missing = want.filter((s) => !have.has(s)).sort();
            assert.deepEqual(missing, [],
                `${rel} is missing ${missing.length} of ${want.length} schema msgid(s): ` +
                `${missing.map((s) => JSON.stringify(s)).join(", ")} — a schema string that is not in ` +
                `the catalog can never be translated, and the translator never sees it`);
        }
    });

    it("the template carries the hints the sources write", () => {
        const potHints = catalogHints("po/messages.pot");
        const missing = hints.filter((h) => h.msgid && src.has(h.msgid) && !potHints.has(h.msgid));
        assert.deepEqual(missing.map((h) => h.where), [],
            `${missing.length} "Translators:" comment(s) never reached po/messages.pot: ` +
            `${missing.map((h) => `${h.where} ${JSON.stringify((h.msgid || "").slice(0, 40))}`).join(", ")} ` +
            `— without it a translator cannot tell what %s / %d stands for, and a wrong placeholder ` +
            `breaks the string at runtime rather than failing a build`);
    });

    it("every hint that reached the template says what the source says", () => {
        const potHints = catalogHints("po/messages.pot");
        const drifted = hints.filter((h) => h.msgid && potHints.has(h.msgid) && potHints.get(h.msgid) !== h.hint);
        assert.deepEqual(drifted.map((h) => h.where), [],
            `${drifted.length} catalog hint(s) disagree with the comment in the source: ` +
            `${drifted.map((h) => `${h.where}: catalog says ${JSON.stringify(potHints.get(h.msgid))}, ` +
                `source says ${JSON.stringify(h.hint)}`).join(" | ")}`);
    });

    // Every msgid in a catalog, obsolete ones included, keyed to the line that defines it.
    // `catalogMsgids()` above deliberately ignores `#~` because coverage is about live
    // strings; this reader exists because msgfmt does not ignore them.
    function everyMsgid(rel) {
        const lines = read(rel).split("\n");
        const out = [];
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^(#~\s+)?msgid\s+"((?:[^"\\]|\\.)*)"/);
            if (!m) continue;
            let text = m[2];
            let k = i + 1;
            while (k < lines.length && /^(#~\s+)?"((?:[^"\\]|\\.)*)"$/.test(lines[k]))
                text += lines[k++].match(/"((?:[^"\\]|\\.)*)"/)[1];
            if (text) out.push({ msgid: poUnescape(text), line: i + 1, obsolete: Boolean(m[1]) });
            i = k - 1;
        }
        return out;
    }

    it("no catalog defines the same msgid twice, obsolete entries included", () => {
        // msgfmt counts an obsolete `#~ msgid` against a live one and exits 1 with
        // `duplicate message definition`, and msgfmt is what both `gnome-extensions pack
        // --podir=po` and `msgmerge` run — so a catalog every other guard here likes can
        // still make the package unbuildable and the maintenance script unusable. This was
        // real: D-044 appended `msgid "License"` while upstream's obsolete twin was still in
        // all three locale files.
        const dups = [];
        for (const rel of ["po/messages.pot", "po/de.po", "po/es.po", "po/nl.po"]) {
            const all = everyMsgid(rel);
            assert.ok(all.length >= 180,
                `${rel}: only ${all.length} msgid(s) parsed — that reader stopped working, so ` +
                `this duplicate check is checking nothing`);
            const first = new Map();
            for (const e of all) {
                if (first.has(e.msgid))
                    dups.push(`${rel}: ${JSON.stringify(e.msgid)} at :${first.get(e.msgid)} and :${e.line}`);
                else first.set(e.msgid, e.line);
            }
        }
        assert.deepEqual(dups, [],
            `${dups.length} duplicate msgid(s) — msgfmt will exit 1 on each of these files:\n  ` +
            dups.join("\n  "));
    });

    for (const rel of ["po/de.po", "po/es.po", "po/nl.po"]) {
        it(`${rel} keeps only strings the template knows about`, () => {
            // A msgid that no longer exists in the sources is an orphan: its translation is
            // of a sentence the extension never shows.
            const pot = catalogMsgids("po/messages.pot");
            const orphans = [...catalogMsgids(rel)].filter((s) => !pot.has(s)).sort();
            assert.deepEqual(orphans, [],
                `${rel} carries ${orphans.length} msgid(s) absent from the template: ` +
                `${orphans.slice(0, 3).map((s) => JSON.stringify(s)).join(", ")}`);
        });
    }
});

describe("the packaging list ships exactly what the repo has", () => {
    // scripts/pack.sh stages an explicit list and then names the extras for
    // `gnome-extensions pack`. Both halves fail silently, measured in a throwaway
    // tree with this extension's own layout (a root module with no --extra-source
    // line is absent from the zip; a --extra-source or cp -r name that no longer
    // exists exits 0 and simply drops it). AUTO is the set that same probe found
    // inside a zip built without naming any of them.
    const LINES = read("scripts/pack.sh").split("\n").filter((line) => !/^\s*#/.test(line));
    const SCRIPT = LINES.join("\n");
    const at = (re) => LINES.findIndex((line) => re.test(line));
    const stage = LINES.find((line) => /^cp -r .*\/tmp\/fast-translate-pack\/$/.test(line)) || "";
    const STAGED = stage.replace(/^cp -r /, "").replace(/ \/tmp\/fast-translate-pack\/$/, "")
        .split(/\s+/).filter(Boolean).map((name) => name.replace(/\/$/, ""));
    const EXTRA = [...SCRIPT.matchAll(/--extra-source=([^\s)]+)/g)].map((m) => m[1]);
    const AUTO = ["extension.js", "metadata.json", "prefs.js", "stylesheet.css"];
    const SHIPS = FILES.filter((f) => !f.includes("/") && /\.(js|css)$/.test(f));
    // A staged directory counts only if it has files under it: `cp -r` of an empty
    // directory succeeds and the zip would carry an empty entry.
    const inTree = (name) =>
        FILES.includes(name) || FILES.some((f) => f.startsWith(`${name}/`));

    it("the packaging list is readable and non-trivial", () => {
        // Anti-vacuity floor: if the staging line is reworded, STAGED becomes empty
        // and every assertion below would pass by measuring nothing.
        assert.ok(STAGED.length >= 10 && EXTRA.length >= 6 && SHIPS.length >= 7,
            `parsed ${STAGED.length} staged name(s), ${EXTRA.length} --extra-source name(s) and ` +
            `${SHIPS.length} root source file(s); the script's shape changed under this guard`);
    });

    it("every root source file is staged into the zip tree", () => {
        for (const f of SHIPS)
            assert.ok(STAGED.includes(f),
                `${f} is loaded by the shell but pack.sh never copies it to the staging tree, ` +
                `so it cannot appear in the zip`);
    });

    it("every staged root source file is named for packing", () => {
        for (const f of SHIPS)
            assert.ok(EXTRA.includes(f) || AUTO.includes(f),
                `${f} is staged but neither auto-included nor passed as --extra-source, so ` +
                `gnome-extensions pack leaves it out of the zip without a word`);
    });

    it("nothing the list names has already left the repo", () => {
        for (const name of [...new Set([...STAGED, ...EXTRA])])
            assert.ok(inTree(name),
                `pack.sh names ${name} but the repo has no such file or directory — the run ` +
                `still exits 0 and the zip ships without it`);
    });

    it("the staging tree is emptied before it is filled", () => {
        // Measured: a helper dropped from the repo survived two consecutive `cp -r`
        // runs into the same directory and went into the zip with them.
        const rm = at(/^rm -rf \/tmp\/fast-translate-pack$/);
        const mkdir = at(/^mkdir -p \/tmp\/fast-translate-pack$/);
        const cp = at(/^cp -r /);
        assert.ok(rm >= 0 && mkdir >= 0 && cp >= 0 && rm < mkdir && mkdir < cp,
            `expected rm -rf < mkdir -p < cp -r for the staging tree, got ${rm} / ${mkdir} / ${cp}`);
    });

    it("the gettext check runs before the previous zip is deleted", () => {
        // Measured with gettext absent: the run exited 2, the old *.zip was already
        // gone, and the half-filled staging tree was left to poison the next run.
        const check = at(/command -v msgfmt/);
        const del = at(/^rm -f \*\.zip$/);
        assert.ok(check >= 0 && del >= 0 && check < del,
            `the msgfmt check (${check}) must precede the zip deletion (${del}) — a run that ` +
            `cannot produce a zip must not destroy the last one`);
    });
});

describe("documentation conventions hold", () => {
    // House convention across every fork in this workspace: a doc that exists in
    // two languages is a two-file bilingual pair with mirrored section order,
    // English first. Heading LINE numbers are reported, not asserted — they cannot
    // survive prose edits. Section COUNT and order can, and that is the enforceable
    // version of the same rule.
    //
    // This walks EVERY directory, not just the repo root. The maintenance handbook
    // used to be one root-level pair; it is now a router plus topic files under
    // docs/maintenance/, and a Chinese topic file with no English twin, or a pair
    // whose sections drifted, is exactly the failure this guard exists to catch.
    const pairs = FILES
        .filter(f => f.endsWith(".md"))
        .filter(f => f.endsWith(".zh-CN.md"))
        .map(zh => [zh.replace(/\.zh-CN\.md$/, ".md"), zh]);

    it("every Chinese doc has an English twin with the same section count", () => {
        assert.ok(pairs.length >= 1, "no bilingual pairs found");
        for (const [en, zh] of pairs) {
            assert.ok(FILES.includes(en), `${zh} has no English twin (${en})`);
            const h2 = (f) => (read(f).match(/^## /gm) || []).length;
            assert.equal(h2(en), h2(zh),
                `${en} has ${h2(en)} sections but ${zh} has ${h2(zh)} — keep the pair in step`);
            for (const f of [en, zh])
                assert.match(read(f), /^<p align="right"><a href=/,
                    `${f} must open with the language switcher so the pair stays navigable`);
        }
    });

    it("no tracked markdown uses task checkboxes", () => {
        // All the sibling forks use bullets, tables or prose. Checkboxes in a
        // committed doc read as unfinished work and never get cleaned up.
        for (const f of FILES.filter(x => x.endsWith(".md")))
            assert.ok(!/^\s*- \[[ xX]\]/m.test(read(f)), `${f} contains a task checkbox`);
    });
});
