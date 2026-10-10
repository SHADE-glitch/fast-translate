<p align="right"><a href="verification.md"><b>English</b></a> | <a href="verification.zh-CN.md">简体中文</a> · <a href="../../MAINTENANCE.md">Handbook</a></p>

# Verification: what to run, and what it does not prove

Split out of `MAINTENANCE.md` §4, §6, §9 and §14. The isolation recipe the L1
tiers depend on lives in [cost-measurement.md](cost-measurement.md).

## 1. Test matrix

| Command | Time | Reaches | Writes |
|---|---|---|---|
| `npm test` | seconds | `translation-helper.js` exports, `destroy()` totality, GLib-vs-node crypto known answers, `prefs.js` layout, repository guards (`test/repo.test.js`: bilingual pairing, call-site list, provider registry, no main-thread stat, JS↔CSS geometry contract, shipped defaults vs the settings copy, catalog coverage across the template **and** all three locales, translator-hint propagation, no script prints a settings value), and the docs gate (`test/docs-lint.mjs`: every relative link and `#anchor` in every `*.md` resolves, with floors so an empty scan cannot pass) | nothing |
| `npm run integration` | ~2–4 min | a real headless shell: ACTIVE, panel button, popup structure, double-copy behaviour, the `St` measurements of D-047 | nothing (memory backend) |
| `npm run perf [cost\|idle\|all]` | 2 / 4 / 5 min | cost per event and idle CPU/RSS | nothing; writes JSON to `~/.cache/fast-translate-perf/` |
| `npm run check:log` | seconds | the record: `D-###` ids unique and gapless, code commits cited and resolvable, every `D-###` cited by a tracked doc resolves, five fields per entry, `kind` in the allowed set | nothing |
| `gjs -m test/l2-prefs-dump.mjs apps\|tree <name>` | seconds | a **live** session's rendered windows through the a11y bus — frames, labels, switches with `VISIBLE`/`SHOWING`/`SENSITIVE` (screenshots are denied to an agent on GNOME 50). Never prints an editable field's value. Needs a desktop: not in `npm test`, not in CI | nothing |

`npm test` deliberately does **not** cover `extension.js` at runtime (≈2400
lines): it never loads under plain Node, because `gi://` is unavailable there.
Runtime paths are only exercised by `npm run integration`.

`test/prefs-validator.js` renders `fillPreferencesWindow()` once per provider and
asserts what the window *shows and does*: that a row's subtitle names the endpoint
that provider actually sends text to (and, for every non-Google provider, also names
`clients5.google.com` for the single-word dictionary path); that all seven
restore/clear rows exist; that a first click resets exactly the four sections' own
key sets and erases no key, and the confirming click clears exactly the three
credential sets once each; and that the Escape switch writes an empty `strv` off,
restores the binding it removed on, and survives an off/on round trip with a custom
`<Primary>Escape`. It still needs a display plus the GTK4 and libadwaita typelibs,
which is why it is a local desktop gate and is kept out of CI. Its limits are the
mock's limits: `Gio.Settings` is faked, so a key name that does not exist in the real
schema passes here, and the widget tree is walked by `get_first_child()` because this
binding exposes no page list.

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
| Test 5 `synthStolen >= 1`, `cardStolen === synthStolen`, `synthStolen <= 16` | a vertical scrollbar really withholds width (8 px measured), the production card and a plain `St.ScrollView` agree on that number, and `SCROLLBAR_ESTIMATE` still over-covers it. Provoked red by tightening the bound to 4: `a vertical scrollbar withholds 8px, more than SCROLLBAR_ESTIMATE (16) covers` |
| Test 5 `center === 1 && right === 2`, then `start(LTR) === banana` and `start(RTL) !== right` | the alignment reader can distinguish values, and `start`/`end` are still not direction-relative — the fact that keeps the RTL decision in JS rather than CSS. Provoked red by flipping one comparison: `text-align start/end changed behaviour: start gives 0 under LTR and 0 under RTL, an unrecognised keyword gives 0, right gives 2` |

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

**`swapLanguages` reaches production through `onSwap`** (D-032). It used to be an
inline copy inside `onSwap` while the Node row tested the helper — the assertion was
decorative, which is why `test/repo.test.js` now lists every decision in this table
and asserts `extension.js` contains a call site for each. Add an inline re-implementation
and that list goes red; drop the helper without moving its test to L1 and it goes red too.

### Repository guards in `test/repo.test.js` (L0, no display)

These check things no runtime test can see, because the failure mode is a *document or a
constant going stale*, not a behaviour breaking:

| Describe | Fails when | Provoked by |
|---|---|---|
| a guard's test runs in the branch production actually takes | a helper an L0 test pins is no longer called from `extension.js` | deleting the `swapLanguages` call site (red: 1 of 5) |
| the settings window reads the provider registry, not enum integers | `prefs.js` hardcodes `service === 0/2/3` again, or stops importing `getProvider` | writing a decoy `service === 2` back into `prefs.js` |
| the main thread never touches the disk | an active icon stops shipping, or `extension.js` gains a `.query_exists(` call | injecting a real `probe.query_exists(null)` into `_get_icon()` (red: 10 pass / 1 fail) — and, as a control, the same text in a comment line stays green |
| the card's geometry constants still match the CSS they mirror | card width / padding / border / spacing / divider / actions margin change without the JS arithmetic following | `width: 650px`→`700px`; dark `border: 1px`→`2px`; `spacing: 16px`→`12px`. Control: adding `min-width: 600px` to the same rule must NOT redden it |
| the shipped defaults keep the promises the settings copy makes | `notifications` defaults back to false (a background failure then produces no card *and* no notification), `floating-background-toast` defaults back to true (its row says silent), or the Escape key's default loses `Escape` (the prefs switch then writes the wrong binding) | each one alone, in the working-tree schema: `notifications` true→false (`expected: true / actual: false`), `floating-background-toast` false→true, CDATA `[['Escape']]`→`[['']]`. Control: no mutation → green. Each was restored byte-identically and `git status` showed the schema clean |
| the translation catalogs cover the strings the code asks to translate | a `_()` literal in `extension.js` / `prefs.js` / `translation-helper.js` is absent from `po/messages.pot` **or** from any of de/es/nl; a catalog carries a msgid the template no longer knows; a `// Translators:` comment never reached an entry as `#.`; the hint in the catalog says something else than the source; or the extraction stops matching (floors: > 50 msgids, ≥ 10 hints) | pot coverage: one msgid renamed in `po/messages.pot` → red, restored. Locale coverage and hints: written **before** the catalogs were synced, so they went red on their own (`13 "Translators:" comment(s) never reached po/messages.pot`, plus one per locale) and turned green when the entries and hints landed. Vacuity: the *same unmodified* guard file run against a scratch tree whose three sources were empty → red with `only 0 msgid(s) extracted — the _() matcher stopped working, so this guard is checking nothing` |
| documentation conventions hold | a bilingual pair drifts in section count or order, or a tracked doc uses task checkboxes | — (established when the pair rule was widened to every directory) |
| a probe reads the settings store only as a hash | any `.sh`/`.js`/`.mjs`/`.cjs` file in the repo runs `dconf dump`/`dconf read` or `gsettings get`/`list`, i.e. prints a settings **value** — all six string keys of this schema can hold a provider credential — or the scan stops covering `test/integration.sh` and `test/perf-probe.sh` (floors: those two files, ≥ 10 executables) | in a scratch copy of the repo (`tar`, no `.git`, entry module a real file): an executable `dconf dump /org/gnome/shell/extensions/fast-translate/` appended to `test/integration.sh` → `not ok — test/integration.sh reads a settings value…`; a separate `gsettings get … apikey` in `test/perf-probe.sh` → same message naming that file. Controls: the *same two lines* prefixed with `#` stay green (33 pass / 0 fail), and the tree restored stays green |

Provoked this round, and what is still only "written, never seen failing":

- The `PROVIDERS.host` cross-check in `test/unit.test.js` was reddened by stripping all four
  `host:` fields from a **copy** of `translation-helper.js` and running the unmodified shipped
  test against it → `exit=1`, `every provider must declare a host, even if only to say it has
  none` (`test/unit.test.js:228`); putting the real helper back in that position is the green
  control. The scratch copy has to be a real file: Node resolves the entry module's **symlink**
  to its repository path, so `../translation-helper.js` then points back at production and the
  experiment proves nothing — the first attempt did exactly that and came back green.
- **Not provoked:** the prefs validator's hostname-disclosure assertion, its two-pass
  reset/clear counts, and the Escape `strv` round trip. They were written against code that
  already shipped, so they have been *seen passing* only. A scratch attempt to hard-code
  `serviceRow.subtitle` and re-run the validator was blocked, so this stays open:
  *(needs manual confirmation — provoke each before trusting it as a guard.)*

The rules these provocations earned:

- **A guard must measure code, not prose.** The `query_exists` guard first matched the
  comment explaining that the call was removed, so it reported the fix as the defect.
  Assertions of the "this call is gone" form now run on `srcCode()` — whole-line
  comments stripped — and match a call shape (`.query_exists(`), not a bare name.
  `min-width` must not answer for `width`: read a declaration with a leading boundary.
- **Every `file:line` anchor in the docs is a claim that decays.** After any edit that
  adds or removes lines in `extension.js`, re-derive them: walk `docs/` plus the root
  `*.md`, pull every `name.js:NNN` and continuation `` `:NNN` ``, print that line, and
  check it still holds the cited construct. This round: 138 anchors walked, 14 rows in
  `shell-internals` relocated (C1–C5 had shifted everything past `extension.js:1316`),
  3 stale `prefs.js` ranges corrected. `docs/reports/AUDIT.md` is a snapshot as of its
  commit and is deliberately not renumbered.
- **Hand-writing what a generator owns means re-implementing the generator's rules, so every
  one of them needs its own measurement.** Editing `po/` without gettext produced three defects
  in a row, each caught by checking the output rather than trusting the script: line numbers
  taken from the **comment-stripped** source were shifted (one reference landed on a comment
  that merely quotes `"Cancelled"` instead of the call at `extension.js:1262`); a hand-rolled
  continuation split of a long msgid **ate the spaces**, because gettext concatenates adjacent
  strings without inserting any (16 corrupted msgids per locale); and a hint emitted as
  `#.text` instead of `#. text` is not a hint at all — the guard's own `^#\.\s` did not match
  it. Copy a generated file's lines verbatim whenever the template already has them, and after
  any such edit re-measure counts (`msgid`, `msgstr`, `#:`, `#.`) with **escaped** patterns —
  an unescaped `^#. ` in grep matches every `#: ` line too, which is how a correct file briefly
  looked like it had 317 hints.
- **A proof method can itself be the wrong instrument.** The zero-write property is proven by
  `sha256sum ~/.config/dconf/user` before and after, in the same command that asserts it. One
  ad-hoc before/after pair this round printed the settings store's *contents* instead of its
  digest, which is a method that would put all six string keys of this schema (`apikey`,
  `baidu-appid`/`baidu-secret`, `youdao-appid`/`youdao-secret`, `url`) into whatever log the run
  is redirected to. Whether any of it reached disk is **no longer checkable**: every scratch file
  of the round was deleted, and reading the key back in order to search for it would itself break
  the rule. So neither "a key leaked" nor "nothing leaked" is claimed here — what is claimed is
  that a value-printing read is never the right取证 tool for an *unchanged* property. The run's
  own log was checked and holds no credential value (its three `apikey|secret|appid` matches are
  all `org.freedesktop.secrets` D-Bus noise), the pair was re-proven by digest, and no repo script
  may now run `dconf dump`/`read` or `gsettings get`/`list` — that is a guard.

## 4. Live session verification

- `scripts/reload.sh` only does disable+enable. On GNOME 50 that **does not
  re-import edited `extension.js`** (the ESM module cache is per shell process),
  so it can never verify a code change. Restart the shell — on Wayland that means
  logging out and in again.
- Journal: `journalctl -f -o cat /usr/bin/gnome-shell`, or with the `_PID=` filter
  from [shell-internals.md](shell-internals.md). Always print the PID's total line count
  alongside it: `0` error lines is only evidence if the window actually held lines
  (measured 2026-10-10: 111 lines, 0 errors — the anti-vacuity floor for this check).
- **The shell's own extension API answers L2 questions without unsafe-mode or Eval.**
  `org.gnome.Shell.Extensions` on the session bus exposes `GetExtensionInfo(uuid)`
  (→ `state`, `version`, `error`), `GetExtensionErrors(uuid)` (→ string array) and the
  `UserExtensionsEnabled` property. Calibrated against this machine's own extensions:
  every uuid in `enabled-extensions` reports **`state=1`**, an installed-but-disabled one
  reports **`state=6`**, and an unknown uuid errors out — so `1` = ACTIVATED was read from
  the machine, not assumed. `version` is the live proof that the running code is the
  committed code (`16.0` after the 07:47 restart), and `GetExtensionErrors` returning `[]`
  is the shell's own error collector agreeing that the load did not throw.
  `UserExtensionsEnabled=true` is the live counterpart of the
  `/run/user/1000/gnome-shell-disable-extensions` marker concern — safe mode off.
- **Screenshots are not available to an agent.** `org.gnome.Shell.Screenshot.Screenshot`
  answers `AccessDenied: Screenshot is not allowed` on GNOME 50, and `gnome-screenshot`,
  `grim`, `wf-recorder`, `spectacle` are all absent here. So every *visual* verdict (does
  the row wrap, does the icon look right, is the card on the intended monitor) stays with
  the maintainer; writing one as "verified" off a D-Bus reply would be a false claim.
- **A pixel-free instrument for real GTK windows: the a11y tree.** It is committed as
  `gjs -m test/l2-prefs-dump.mjs apps` / `… tree <app-name-substring>`: it walks
  `Atspi.get_desktop(0)` and prints frames, groupings, labels and switches with
  `VISIBLE`/`SHOWING`/`SENSITIVE`. **Read `SENSITIVE`, never `ENABLED`** — GTK4's AT-SPI bridge
  leaves `ENABLED` unset, so a healthy window reports `ENABLED=false SENSITIVE=true` for every
  node, and an agent that trusts `ENABLED` will "discover" that the whole settings window is
  disabled. Proven on this session — it dumped another extension's
  prefs window completely (`[frame] "Burn-My-Windows 48"`, 402 nodes). Two hard rules, both
  encoded in the script: **it never reads the text of an `entry`/`password-text` node** (this
  extension's fields hold provider keys — labels only), and the prefs host
  `org.gnome.Shell.Extensions` is **single-window** — while any extension's dialog is open,
  `LaunchExtensionPrefs`/`OpenExtensionPrefs` fail with `Already showing a prefs dialog`, so the
  other window must be closed first (the script prints that reminder). Whether our floating card
  appears on the a11y bus at all is **unobserved**: the shell's tree exposed only window/surface
  panels. It needs a desktop session, so it is not part of `npm test` and not in CI.
- **The double-copy trigger destroys clipboard data, so the maintainer runs it.** The path
  is `selection 'owner-changed'` plus the same text copied twice inside 50 ms–2 s
  (`extension.js:299-360`), which an agent *can* fake with two `wl-copy` calls — but
  `wl-copy` restores `text/plain` only. A real clipboard in this session carried
  `chromium/x-source-url`, `chromium/x-internal-source-rfh-token` and `text/html`, none of
  which a restore brings back. The trigger is a human step, not an automated one.
- Reading this extension's own keys needs the schema dir:
  `GSETTINGS_SCHEMA_DIR=$PWD/schemas gsettings get org.gnome.shell.extensions.fast-translate <key>`.
  **Name the key** — never `gsettings list` or `dconf dump` this schema (§3). Opening the
  prefs window writes nothing; walking the four provider groups would mean setting
  `translation-service`, which is a write to the maintainer's live profile and needs his
  word first.
- What still needs a hand in a real session: the popup in light and dark after a live
  theme switch (a theme switch is a **global** GNOME setting, so an agent must not flip
  it), Esc, multi-monitor placement, translation latency, whether each provider's prefs
  group is visible for its enum value, and whether the disclosure sentence is legible.

## 5. Rollback and commit discipline

One concern per commit, `type: 中文摘要`. Every step above is a separate commit,
so `git revert <sha>` undoes exactly one. `git push` requires an explicit
decision each time; history is never rebased or rewritten.
