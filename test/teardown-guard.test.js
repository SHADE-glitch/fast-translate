// Static gate for FastTranslate.destroy().
//
// extension.js is GI-bound (St, Main, Soup, Meta) so it cannot be imported by
// plain Node the way test/unit.test.js imports translation-helper.js. The
// invariant this file protects is still a source-level property, so it is
// asserted on the source text, in the same spirit as test/prefs-validator.js,
// which also validates a file by reading it instead of running it.
//
// The invariant: FastTranslateExtension.disable() discards the only reference
// to the indicator after calling destroy(). Therefore destroy() must be total —
// every release step has to be individually guarded, because GObject.disconnect
// and GLib.Source.remove both raise when the handler or source is already gone.
// If any single step is left unguarded, one throw skips the rest of the body,
// super.destroy() is never reached, and the actor, its signal handlers and its
// pending timers are stranded in the panel with nothing left able to release
// them. This is exactly the "half torn down" failure the guards prevent.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "..", "extension.js"), "utf8");

// Brace matcher that skips string literals, template literals and comments, so
// a brace inside them cannot desynchronise the scan.
function matchBraces(text, openIdx) {
    let depth = 0;
    let i = openIdx;
    let quote = null;
    while (i < text.length) {
        const c = text[i];
        const next = text[i + 1];
        if (quote) {
            if (c === "\\") { i += 2; continue; }
            if (c === quote) { quote = null; }
            i += 1;
            continue;
        }
        if (c === "/" && next === "/") {
            const nl = text.indexOf("\n", i);
            i = nl === -1 ? text.length : nl;
            continue;
        }
        if (c === "/" && next === "*") {
            const end = text.indexOf("*/", i + 2);
            i = end === -1 ? text.length : end + 2;
            continue;
        }
        if (c === '"' || c === "'" || c === "`") { quote = c; i += 1; continue; }
        if (c === "{") depth += 1;
        else if (c === "}") {
            depth -= 1;
            if (depth === 0) return i;
        }
        i += 1;
    }
    return -1;
}

// The file defines three destroy() methods: Tooltip (constructor class),
// FastTranslate (inside GObject.registerClass) and FloatingTranslationWindow.
// Anchor on the registerClass call so the middle one is selected, never the
// first or the last.
const registerIdx = SRC.indexOf("GObject.registerClass(");
assert.notEqual(registerIdx, -1, "GObject.registerClass( anchor not found in extension.js");

const destroyIdx = SRC.indexOf("destroy() {", registerIdx);
assert.notEqual(destroyIdx, -1, "no destroy() found after the registerClass anchor");

const openIdx = SRC.indexOf("{", destroyIdx);
const closeIdx = matchBraces(SRC, openIdx);
assert.notEqual(closeIdx, -1, "unbalanced braces in FastTranslate.destroy()");

const body = SRC.slice(openIdx + 1, closeIdx);
const bodyLine = SRC.slice(0, openIdx).split("\n").length;
const lines = body.split("\n");

// The steps that can raise: GObject.disconnect asserts on an unknown handler id,
// GLib.Source.remove raises on a source that is already gone, and Soup abort may
// fail on a half-built session. Each must sit behind its own try/catch.
const MUST_BE_GUARDED = [
    "this._floatingWindow.destroy()",
    "this._disconnectSettings()",
    "this._disconnectSelectionListener()",
    "this._floatingCancellable.cancel()", // Soup cancellable, pre-existing guard
    "GLib.Source.remove(this._safetyTimeoutId)",
    "GLib.Source.remove(this._internalCopyTimeoutId)",
    "this._httpSession.abort()",
];

// Steps that cannot raise and are therefore left bare, to keep the diff small.
const MAY_STAY_BARE = [
    "this._unbindEsc()",            // try/catch inside the method itself
    "this._translationCache.clear()", // Map.clear cannot throw
];

function lineOf(needle) {
    const idx = lines.findIndex((l) => l.includes(needle));
    assert.notEqual(idx, -1, `step not found in destroy(): ${needle}`);
    return { idx, text: lines[idx] };
}

console.log("⏳ Running destroy() totality tests...");

const firstStatement = lines.find((l) => l.trim().length > 0);
assert.equal(firstStatement.trim(), "this._destroyed = true;",
    "destroy() must set the _destroyed flag first so late callbacks bail out");

for (const step of MUST_BE_GUARDED) {
    const { text } = lineOf(step);
    assert.match(text, /^\s*try\s*\{/,
        `unguarded teardown step would let one throw skip the rest of destroy(): ${step}\n  got: ${text.trim()}`);
}

for (const step of MAY_STAY_BARE) {
    const { text } = lineOf(step);
    assert.doesNotMatch(text, /^\s*try\s*\{/,
        `step cannot raise, wrapping it adds noise: ${step}`);
}

// super.destroy() must be reached: it is the last statement, outside any try,
// so guarding the steps above is what guarantees the actor is released.
const lastNonEmpty = lines.filter((l) => l.trim().length > 0).pop();
assert.equal(lastNonEmpty.trim(), "super.destroy();",
    "super.destroy() must be the final statement of destroy() so it is always reached");

console.log(`✅ destroy() totality tests passed (${MUST_BE_GUARDED.length} guarded, ` +
    `${MAY_STAY_BARE.length} intentionally bare, body at extension.js:${bodyLine})\n`);
