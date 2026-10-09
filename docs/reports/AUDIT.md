<p align="right"><a href="AUDIT.md"><b>English</b></a> · <a href="PROFILE.md">Profile</a> · <a href="PLAN.md">Plan</a> · <a href="STATE.md">State</a></p>

# Audit

Phase-A artifact, 2026-10-09. Read against the brief's four goals (stability and
resource cost, structure, UI, settings). Every claim carries its evidence tier:
**L0** ran under `npm test`, **L1** ran in a headless shell, **L2** needs a real
session, **static** means read from the source with the command shown.

Unfixed things are **not** left here: they were moved to
[docs/maintenance/open-items.md](../maintenance/open-items.md) during this pass.
This file is a snapshot of the reading, as of its own commit.

## 1. What was actually run this session

| Command | Result |
|---|---|
| `npm test` | exit 0 — unit + teardown-guard + repo guards green, GLib/node signing known answers match, `prefs.js` constructs |
| `npm run check:log` | exit 0 — PASS, window `420251c..HEAD`, 7 declared code paths |
| `npm run check:log -- --invariants` | exit 0 — prints the recorded `kind: fix` entries |
| `node test/repo.test.js` with a twinless `docs/maintenance/probe.zh-CN.md` | exit 1 — "has no English twin" (guard provoked) |
| `node test/repo.test.js` with one `## ` added to a docs pair | exit 1 — "keep the pair in step", then restored byte-identical and green |
| `check-log.mjs --invariants` against a fixture with no `kind: fix` | exit 1 — refuses to print an empty list |
| `dpkg -l 'libadwaita-1*'`, typelib symbol scan | measured: 1.9.1-0ubuntu0.1 locally; `Adw-1.typelib` is versionless |

`npm run integration` and `npm run perf` were **not** re-run this session, so every
cost number below is inherited from the recorded L1 baseline, not re-measured.

## 2. Stability

- **A failed translation in background mode is invisible (static).** The inline
  error branch requires `!isBackground` (`extension.js:716`) and `fail()` notifies
  only when `notifications` is true, whose schema default is **false**. Default
  configuration therefore gives the user no signal at all when a background
  translation fails: the copy stays as it was and nothing is said. Directly against
  goal 1 and against "failures and their messages are surfaced".
- **A dictionary-enrichment timer outlives `disable()` (static).**
  `_enrichZhToEnDict` keeps `cancellable` (`:814`) and `watchdogId` (`:816`) in
  function locals; `destroy()` (`:1299-1336`) has no handle on them, so a 6 s source
  and its in-flight request survive the extension being turned off. Callbacks are
  `_destroyed`-guarded, so it is residue rather than corruption — but it is exactly
  the "disable leaves things behind" class the brief names, and
  `test/teardown-guard.test.js` cannot see it because the guard matches source text
  that does not exist yet. **queued C1.**
- **Two synchronous `stat()` calls on the compositor thread (static).**
  `_get_icon` (`extension.js:1283-1293`) probes `.svg` then `.png` with
  `query_exists(null)`. Only reached when the theme or `darktheme` changes, so the
  measured idle cost does not capture it. **queued C4.**
- **The cancellation and teardown machinery around the main request is genuinely
  good (static, and pinned by tests).** Per-request `Gio.Cancellable`, the previous
  request cancelled before a new one, `_floatingReqSeq` generation counter so a stale
  reply cannot paint a newer window, identity guards on `this._floatingWindow`,
  `_userDismissed` suppressing a late clipboard write, `disable()` cancelling and
  `abort()`ing the session. Nothing here needs "hardening"; adding defensive
  try/catch around it would be noise.

## 3. Structure — what makes an AI edit unsafe here

- **`extension.js` is one file holding every runtime responsibility.** Panel
  indicator, clipboard trigger, keybinding, settings load, LRU cache, orchestration, provider
  dispatch, request building, HTTP, error copy, notifications, teardown, and the
  whole hand-built window class. The pure decision layer is already correctly
  split into `translation-helper.js`; the *UI* half is the part that resists safe
  editing. No split is proposed in this pass — there is no measured pain yet that a
  split pays for, and `scripts/check-log.mjs`'s `CODE_PATHS` plus
  `test/teardown-guard.test.js` both match on paths and text, so moving code is a
  coordinated change, not a free refactor.
- **`FloatingTranslationWindow` is exposed as an instance field (`extension.js:229`)
  only so tests can reach it**, and the indicator reads the window's private fields
  (`_dismiss()`, `_userDismissed`, `_currentTarget`, `_winDestroyed`, `_srcLang`,
  `_tgtLang`) from outside. An agent editing the window has no boundary telling it
  which fields are load-bearing elsewhere.
- **A unit guard that does not cover the production branch (L0 + static).**
  `test/unit.test.js` has a "swapLanguages guard" section asserting the `AUTO`
  refusal, and it passes — while `grep -c swapLanguages extension.js` returns **0**,
  because `onSwap` carries an inline copy of the same decision. Behaviour is correct;
  the *test is decorative*. This is the "green but invisible" class: a future edit
  that breaks the inline branch keeps `npm test` green. **queued C2.**
- **`prefs.js` duplicates the provider table as magic ints** — `service === 0/2/3`
  (`prefs.js:337-346`) against `PROVIDERS` in the helper, and `prefs.js` imports
  nothing from either helper. Reordering the provider enum silently changes which
  credential group appears. **queued C3.**
- `parseLanguageName` and `detectLang` are exported and referenced only by tests.
  Left alone deliberately: deleting them buys a shorter export list and loses the
  only coverage of two providers that cannot be probed live.

## 4. Settings and privacy, against the brief's goals 4 and the network checklist

- **Nothing in `prefs.js` or the schema tells the user that the copied text leaves
  the machine.** The nearest statements are that keys are stored in plaintext in
  dconf, and that a secret is "used locally to compute the signature". Hosts appear
  only in maintainer docs. The brief asks for this explicitly.
- **Single words go to Google whatever the user selected** (`_effectiveProvider`,
  `extension.js:760`) with no disclosure anywhere user-facing. *Decided 2026-10-09:
  disclose, do not add a switch, do not narrow — narrowing regresses the dictionary
  card (D-021/023/025/028).*
- **No restore-to-defaults affordance exists** (`grep -c reset prefs.js` → none).
- **The shipped settings window contradicts the repo**: "Project Homepage" is
  `github.com/tazztone/translate-assistant` (`prefs.js:305-318`) while
  `metadata.json url` points at this fork, and About has no license row — while the
  brief asks for upstream, version, license and deviations to be stated plainly.
- Keys never appear in a URL and nothing credential-bearing is logged (see §7); the
  storage answer to the brief's checklist is "dconf only, plaintext, self-disclosed".
- Six `Adw.EntryRow` credential fields carry no plain-language subtitle, and
  `keybinding-close-floating-window` is live but unexposed — the latter needs a real
  key editor, which is why it is *deferred* rather than half-done.
- Provider visibility hides whole groups, so switching service moves rows around and
  can appear to have lost a saved value.

## 5. UI and aesthetics

- The card is native-adjacent but hand-rolled: one `system-status-icon` class and
  otherwise bespoke `translate-*` classes, with 31 selectors and **hard-coded Yaru
  hex values copied into the two palette files**. Dark/light does invert (that is the
  point of the two-file contract), but on a non-Yaru theme the surfaces are off-theme
  and the contrast is unverified.
- Text symbols stand in for icons: `⇄` as the swap button label, `➜` in the header
  (and wrong direction for RTL pairs — still unresolved), `·` separators, and flag
  emoji in 27+28 language enum nicknames.
- `St.ScrollView` is deprecated in favour of `St.Clip`, which has no scrollbars. Not
  migrated: the two call sites are entangled with the measured height/cap fixes
  (D-007/D-008), so the churn risks working behaviour for no user-visible gain.
- Pixel constants in JS mirror CSS (`CHROME = 232`, `budget * 0.60`,
  `SCROLLBAR_ESTIMATE = 16`, `width: 650px`). The brittle-anchor table pins the
  behaviour; only the cross-reference comments are missing. **queued C5.**

## 6. Resource cost

Inherited from the recorded L1 baseline, not re-measured this session
([docs/maintenance/cost-measurement.md](../maintenance/cost-measurement.md)):
idle CPU is inside the resolution limit (0–0.13 % of one core, not separable from
the shell's floor), idle RSS is not separable either, no leak across enable/disable
cycles, boot import+construct and window construction measured in the 2–5 ms range.

The only *new* resource claim this session is the enrichment timer in §2: one 6 s
source per ZH→EN word lookup, which by design cannot show up in an idle measurement
because it only exists while a card is open.

## 7. Negative results — checked and clear, each with its command

| Claim | Command that proves it |
|---|---|
| No blocking/synchronous network or subprocess IO on the main loop | `grep -nE '\.send\(\|send_message\|Gio\.Subprocess\|spawn' extension.js prefs.js translation-helper.js signing.js` → no matches |
| Only one log statement in all production code, and it carries no text, key or URL | `grep -nE '\blog\(\|logError\|console\.[a-z]+' extension.js prefs.js translation-helper.js signing.js` → `extension.js:1370` only |
| No Gtk/Gdk import in the shell process | `grep -n '^import' extension.js` → Gio, Clutter, St, GObject, GLib, Pango, Meta, Shell, Soup, and the three `resource:///` modules; Gtk/Adw appear only in `prefs.js` |
| No file writes or persistence | `grep -nE 'create_file\|set_contents\|mkdir\|FileWriter' extension.js translation-helper.js` → no matches (the `replace(` hits are string replaces) |
| No monkey-patched shell prototype in production | `grep -n prototype extension.js prefs.js translation-helper.js` → prose comments only |
| No un-prefixed stylesheet selectors | `grep -nE '^[a-z-]+ \{' stylesheet-*.css` filtered of `translate-*` → empty |
| The headless harness writes nothing to the real dconf | `GSETTINGS_BACKEND=memory` is exported by both harness scripts; the recorded before/after `sha256sum ~/.config/dconf/user` check is in `docs/maintenance/cost-measurement.md` |
| Every schema key is accounted for | `grep -o '<key name="[a-z-]*"' schemas/*.xml \| ... \| while read k; do grep -c "'$k'" prefs.js extension.js; done` — the unexposed ones are the five annotated legacy keys plus `keybinding-close-floating-window` |

## 8. Missing maintenance assets — proposed, costed, decided

The brief asks that anything standard-maintenance should have and this repo lacks be
listed with cost and recommendation and *asked*, never added silently. Status column
is the maintainer's answer of 2026-10-09.

| Asset | Why | Cost | Recommendation | Status |
|---|---|---|---|---|
| `docs/maintenance/` topic manuals | The brief names compat matrix, internal-API inventory + upgrade manual, fixed power/leak method; all three existed only as sections of the root handbook | 5 new pairs, one-off split; the ongoing cost is 10 files to keep in step instead of 2 | do it, and widen `test/repo.test.js` pairing to all directories so drift goes red | **done this pass** |
| `INVARIANTS.md` | The brief makes it the "must not regress" carrier and instructs agents to obey it; it did not exist | 1 pair, thin; needs `check-log.mjs --invariants` so it does not become a rotting second copy | do it as a pointer file | **done this pass** |
| `scripts/` smoke/regression script | `reload.sh` provably cannot verify a code change; nothing replaces the manual loop | a script that boots the L1 shell and asserts ACTIVE + a trigger | `npm run integration` already *is* this; a wrapper adds a second way to do one thing | **not added** |
| `docs/reports/` session artifacts (PROFILE / AUDIT / PLAN / STATE / VERIFY) | The brief wants cross-session handoff inside the project | 4–5 files, English-only, no twin required | do it; `STATE.md` is the entry point | **done this pass** |
| CI coverage for the L1 tier | The strongest tier (real shell) is local-only today | runner needs a display + GNOME stack; substantial | keep out of CI, as AGENTS.md already states | **not added** |
| License row + fork identity in About | Brief: upstream, version, license and deviations stated plainly | 3 rows in `prefs.js`, new msgids that cannot be compiled here | do it with the privacy-disclosure change, one commit | **deferred to next gate** |
| Reset-to-defaults | Brief asks for one-click restore | window-wide button over `list_keys()`; the validator mock must grow first, and Adw API floor must be respected | do it, window-wide, excluding the legacy keys | **deferred to next gate** |
| po regeneration | new msgids will accumulate | impossible here (`msgfmt` absent) | keep documenting that translations ship as English | **blocked by environment** |

## 9. Corrections to what the existing docs asserted

- `MAINTENANCE.md` §6 presented `swapLanguages` as an in-force guard. True of the
  behaviour, misleading about the check — §3 above.
- `MAINTENANCE.md` §4 described `extension.js` as ~1900 runtime lines; the file has
  grown past 2400 with the dictionary card and auto-direction work. The moved copy
  says ~2400 and points at `wc -l` instead of being trusted.
- `AGENTS.md` asserted "35 of 36 commits since the upstream import obey this". That
  count was stale (window now has 57) *and* violated the same file's own rule against
  aggregate counts in a document; it now prints the command
  `git log --format='%s' 420251c..HEAD | sed -E 's/^([a-z]+).*/\1/' | sort | uniq -c | sort -rn`
  instead. The prefix set it listed was also narrower than the set actually in use.
- `AGENTS.md` described `scripts/reload.sh` without the fact that it cannot verify a
  code change; that is now stated where an agent will hit it.
