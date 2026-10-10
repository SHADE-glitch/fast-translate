// Documentation link and anchor gate for fast-translate@local.
//
// Every session that edits docs/ used to re-write this check in /tmp, run it, and delete it —
// which made the result real but unrepeatable: the next session could not re-run the check that
// certified the previous one. It lives here now, so a broken relative link or a heading that no
// longer has the anchor docs point at goes red in `npm test` and in CI.
//
//   node test/docs-lint.mjs
//
// Desktop-free: `fs` only, no gjs, no network. GitHub slug rules are reimplemented loosely on
// purpose (see slug()); what this guards is *existence*, not exact-site semantics.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set([".git", "node_modules", "venv", "__pycache__"]);

const files = [];
const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(REPO, rel), { withFileTypes: true })) {
        if (SKIP.has(e.name)) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(r);
        else if (e.isFile() && r.endsWith(".md")) files.push(r);
    }
};
walk("");
files.sort();

// Heading text -> anchor, the way GitHub does it: lowercase, backticks and punctuation gone,
// spaces to hyphens. Unicode letters and digits are kept, which is what matters for the
// Chinese twin files.
const slug = (t) => t.trim().toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\p{L}\p{N} \-_]/gu, "")
    .replace(/ /g, "-");

const headingSet = new Map();
const anchorsOf = (rel) => {
    if (headingSet.has(rel)) return headingSet.get(rel);
    const set = new Set();
    for (const line of fs.readFileSync(path.join(REPO, rel), "utf8").split("\n")) {
        const m = line.match(/^(#{1,6})\s+(.*)$/);
        if (m) set.add(slug(m[2]));
    }
    headingSet.set(rel, set);
    return set;
};

const failures = [];
let checked = 0;

for (const file of files) {
    const text = fs.readFileSync(path.join(REPO, file), "utf8");
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
        const target = m[1];
        if (/^(https?:|mailto:)/.test(target)) continue;
        checked++;
        const [filePart, hash] = target.split("#");
        if (target.startsWith("#")) {
            if (!anchorsOf(file).has(slug(decodeURIComponent(target.slice(1)))))
                failures.push(`${file}: anchor ${target} has no heading in this file`);
            continue;
        }
        const abs = path.resolve(REPO, path.dirname(file), filePart);
        if (!fs.existsSync(abs)) {
            failures.push(`${file}: target file ${filePart} does not exist`);
            continue;
        }
        if (hash && abs.endsWith(".md")) {
            const rel = path.relative(REPO, abs).split(path.sep).join("/");
            if (!anchorsOf(rel).has(slug(decodeURIComponent(hash))))
                failures.push(`${file}: anchor ${target} — no such heading in ${rel}`);
        }
    }
}

// Anti-vacuity: this gate exists because a hand-edited doc can silently point nowhere. If the
// scan sees almost nothing it is measuring a broken matcher, not a healthy tree — the same floor
// that made the catalog guard honest.
if (files.length < 10)
    failures.push(`only ${files.length} markdown file(s) walked — the tree walk is broken, so this gate proves nothing`);
if (checked < 40)
    failures.push(`only ${checked} relative link(s) checked across ${files.length} files — the link matcher stopped working, so a real broken link would pass`);

if (failures.length > 0) {
    console.error(`docs-lint FAILED (${failures.length} problem(s), ${checked} links over ${files.length} files):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`✅ docs-lint passed — ${checked} relative link(s) and anchor(s) resolve over ${files.length} markdown files`);
