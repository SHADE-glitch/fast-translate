<p align="right"><a href="verification.md"><b>English</b></a> | <a href="verification.zh-CN.md">简体中文</a> · <a href="../../MAINTENANCE.md">Handbook</a></p>

# Verification: what to run, and what it does not prove

Split out of `MAINTENANCE.md` §4, §6, §9 and §14. The isolation recipe the L1
tiers depend on lives in [cost-measurement.md](cost-measurement.md).

## 1. Test matrix

| Command | Time | Reaches | Writes |
|---|---|---|---|
| `npm test` | seconds | `translation-helper.js` exports, `destroy()` totality, GLib-vs-node crypto known answers, `prefs.js` layout | nothing |
| `npm run integration` | ~2–4 min | a real headless shell: ACTIVE, panel button, popup structure, double-copy behaviour | nothing (memory backend) |
| `npm run perf [cost\|idle\|all]` | 2 / 4 / 5 min | cost per event and idle CPU/RSS | nothing; writes JSON to `~/.cache/fast-translate-perf/` |
| `npm run check:log` | seconds | the record: `D-###` ids unique and gapless, code commits cited and resolvable, every `D-###` cited by a tracked doc resolves, five fields per entry, `kind` in the allowed set | nothing |

`npm test` deliberately does **not** cover `extension.js` at runtime (≈2400
lines): it never loads under plain Node, because `gi://` is unavailable there.
Runtime paths are only exercised by `npm run integration`.

`test/prefs-validator.js` smoke-tests that `fillPreferencesWindow()` does not
throw. It asserts nothing about widget bindings or the credential groups. It also
needs a display plus the GTK4 and libadwaita typelibs, which is why it is a local
desktop gate and is kept out of CI.

## 2. Evidence tiers

**Tier names used by `CHANGELOG.md`**, defined by what a claim needs rather than
by the tool:

- **L0** — `npm test`: no shell at all.
- **L1** — `npm run integration` / `npm run perf`: a throwaway headless shell on
  a private bus.
- **L2** — live session (§4 below): nothing in this repo automates it.

State which tier backs every claim. "Verified" without a tier is not a claim.
A check that has not been seen failing has not been shown to check anything:
provoke each new guard once (add the assertion before the code, or break the
thing it guards in a scratch run, then restore).

Two corollaries, each bought with a real mistake:

- **A measurement taken outside the production call chain proves nothing about the
  feature.** D-028's reverse dictionary lookup was "measured" with a standalone
  `Soup.Session` probe that passed a method, while the shipped code path called a
  builder that returned none — so `Soup.Message.new` threw, the caller's `catch`
  swallowed it, and the feature had never sent a request. Verify *through the code
  path users run*, or reproduce exactly the arguments that path passes.
- **A harness must never let its own housekeeping decide the verdict.** Under
  `set -e`, an EXIT trap aborts at its first failing command and the trap's status
  *replaces* the result: a suite that printed `success:true` and the pass banner
  exited 1 because cleanup could not delete its scratch tree. Every cleanup step is
  therefore `|| true` and uses `/bin/rm` explicitly (see the trap list in
  [cost-measurement.md](cost-measurement.md)).

## 3. Brittle assertions in `test/eval-test.js`

Grep for the anchor before restructuring the popup; line numbers drift.

| Anchor | Pins |
|---|---|
| `menuItems.length !== 1` | the panel menu holds exactly the Settings entry |
| `w._copyBtn.opacity !== 110` / `!== 255` | the copy button's disabled/enabled look |
| `_destLabel.style_class.indexOf('error')` | error styling applied **and** cleared on retry |
| `children.length < 6` | the window actor's child count |
| `children[0]` / `children[5].get_children()[0]` | header is first child; actions row is 6th, copy button first inside it |
| `style_class !== 'translate-floating-overlay'` / `'...-window'` | **exact** class-string equality — appending a second class fails the test |
| `wantBg` dark `0x36363a` / light `0xffffff` | the variant stylesheet actually applied |
| `padTop !== 24` | proof that `stylesheet-base.css` loaded through `@import` |
| overlay vs work area | the popup covers its own monitor's work area, not the stage |
| `_currentTarget.indexOf('same')` | the same-language card must carry an explanation — couples to the **English msgid**, so translating that string breaks this assertion |
| `armCalls === 0` after ⇄ | the swap path must re-arm the 12 s watchdog |
| `w.overlay.reactive !== false` after `_dismiss()` | a dismissed backdrop must stop swallowing clicks |
| `w._winDestroyed` after an 800 ms wait | teardown must not depend on the tween's `onComplete` (headless never completes it) |
| Test 3i `fired === 1`, then `fired === 0` after `destroy()` | the dictionary enrich arms a real watchdog, and `destroy()` removes the live source. Behavioural because `GLib.source_exists` is **not bound in GJS** — liveness can only be shown by whether the 6 s callback arrives |

### Request-sanity guards now in force

Each is a pure decision in `translation-helper.js`, unit-tested in Node and also
provoked from inside the shell (`test/eval-test.js` Test 3b–3h):

| Helper | Prevents |
|---|---|
| `swapLanguages` | '⇄' moving `AUTO` into the target slot, where no provider accepts it and the corruption persists until a setting is touched |
| `safeTruncate`, `codePointLength` | `slice(0, limit)` splitting a surrogate pair → `URIError` shown verbatim as "Error: URI malformed"; emoji counted twice |
| `isSameLanguage` | a paid round trip that returns the input unchanged (exact-match only: `EN-GB → EN-US` is still a real request) |
| `hasVisibleText` | `trim()` missing U+200B–U+200F / U+2060, so invisible-only selections fired a request |

`_dismiss()` additionally sets `_userDismissed`, which stops a late reply from
overwriting the clipboard after the user closed the card; background mode is
unaffected because it never shows a card.

**Caveat on `swapLanguages`**: `extension.js` does not call this helper — the
`onSwap` branch carries an inline copy of the same decision (open item, see
[open-items.md](open-items.md)). The behaviour is present, but this Node-level row
does not currently guard the branch production runs.

## 4. Live session verification

- `scripts/reload.sh` only does disable+enable. On GNOME 50 that **does not
  re-import edited `extension.js`** (the ESM module cache is per shell process),
  so it can never verify a code change. Restart the shell — on Wayland that means
  logging out and in again.
- Journal: `journalctl -f -o cat /usr/bin/gnome-shell`, or with the `_PID=` filter
  from [shell-internals.md](shell-internals.md).
- Reading this extension's own keys needs the schema dir:
  `GSETTINGS_SCHEMA_DIR=$PWD/schemas gsettings get org.gnome.shell.extensions.fast-translate <key>`.
- Four things can only be verified by hand in a real session: the popup in light
  and dark after a live switch, Esc, multi-monitor placement, and translation
  latency (it is network-bound).

## 5. Rollback and commit discipline

One concern per commit, `type: 中文摘要`. Every step above is a separate commit,
so `git revert <sha>` undoes exactly one. `git push` requires an explicit
decision each time; history is never rebased or rewritten.
