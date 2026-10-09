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
