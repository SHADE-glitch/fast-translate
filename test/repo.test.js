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
