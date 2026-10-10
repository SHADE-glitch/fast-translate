<p align="right"><a href="STATE.md"><b>English</b></a> · <a href="PROFILE.md">Profile</a> · <a href="AUDIT.md">Audit</a> · <a href="PLAN.md">Plan</a> · <a href="VERIFY.md">Verify</a> · <a href="REVIEW.md">Review pack</a></p>

# STATE — cross-session handoff

**Read this first in any new session.** It carries what a fresh context cannot see:
what is settled, what is committed but unpushed, and what the next step is.

Last updated 2026-10-10, after the gettext round: the packaging path was run for real and its
artifact unpacked and inspected, a catalog defect that broke both `pack --podir` and `msgmerge` was
fixed and is now guarded, the "this machine has no gettext" prose was swept, and `origin` was moved
to SSH *(maintainer's instruction)*. Earlier in the same day: the first pass that read the live
session (D-048…D-050), the two `St` measurements, and the `scripts/pack.sh` fix (D-051, D-052).
PLAN.md describes the batches.

## Where the repo stands

| Thing | Value | How to re-check |
|---|---|---|
| Shipped version | 16 — bumped for the schema defaults and the settings-window behaviour (was 15 at the start of this pass) | `jq -r .version metadata.json` |
| Branch state | `master`, **level with `origin/master`** since 2026-10-10; `origin` is the SSH URL (`git@github.com:SHADE-glitch/fast-translate.git`) at the maintainer's instruction, and `ssh -T git@github.com` answers before the push | `git remote -v`, `git status -sb` |
| Unpushed | **nothing** — nine commits went up on 2026-10-10 under his authorization (`da52508` catalog fix, `e636e9e` its guard, `b1db09f` the stale-prose sweep, `196fd72`+`27ec203` the reports and record, `65401f5`+`eecf2a1` the schema backfill and its record, `f57c253`+`1678340` the new `AGENTS.md` rule and its entry). The remote was read back with `git ls-remote` and answers `1678340…`; CI run `38025846410` = success. The next push needs a fresh authorization — the last one is spent | `git log --oneline origin/master..HEAD`, `git ls-remote origin refs/heads/master` |
| Working tree | clean | `git status --porcelain \| wc -l` |
| Record gate | green; `npm run check:log -- --invariants` prints the recorded fixes from the record | `npm run check:log` |
| Test suite | green: unit, teardown guard, repo guards, the docs link/anchor gate, signing cross-check, prefs layout rendered for all 4 providers | `npm test`, and the counts print themselves: `node test/repo.test.js 2>&1 \| grep -E '^# (pass\|fail\|suites)'` and `node test/docs-lint.mjs` |

## Settled — do not re-open

- Reports and state live **inside the repo** (`docs/reports/`), not in `$HOME` or `/tmp`.
- `MAINTENANCE.md` is a router; the prose lives in bilingual topic files under
  `docs/maintenance/`. `test/repo.test.js` enforces the pairing across every
  directory, so a topic pair that drifts goes red.
- `INVARIANTS.md` is a pointer file. The recorded behaviour fixes are printed from the
  record with `npm run check:log -- --invariants`; never copy them into the file.
- The C round's code scope was **stability + structure**; the following round took the
  **privacy and settings** group (D-036…D-043). Google-routing disclosure is
  **disclose-only** — no new switch, no narrowing — and that decision is now implemented,
  not just recorded.
- The **aesthetics** group was examined and closed for lack of a provable win: native
  style-class/palette rewrite, symbolic icons for `⇄`/`➜`/flags, `St.ScrollView`→`St.Clip`,
  `Adw.ActionRow:activatable-uri` and a key editor all live in
  `docs/maintenance/open-items.md` §6 with the reason each was refused.
- `AUDIT.md` is a snapshot as of its commit. Unfixed work exists in exactly one place:
  `docs/maintenance/open-items.md`.
- `docs/maintenance/*` are bilingual pairs, English first. `docs/reports/*` are
  English-only by exception — the pairing guard fires only where a `.zh-CN.md` exists,
  and a one-off report is not a second copy to keep in step.
- `AGENTS.md` was rewritten for this brief: stale aggregate counts replaced by the
  commands that print them, the prefix list corrected to what `git log` actually shows,
  the `reload.sh` limitation stated, and new sections for the session entry point, the
  gated working method, evidence discipline, structural rules and the compatibility
  floor. Old rules that were simply wrong were deleted, not annotated.

## C1 landed, and it found a dead feature

The queued teardown fix (D-030) was written red-first, and the new L1 assertion then
failed for a *different* reason: the dictionary enrich had never sent a request at all
(D-029) because its spec omitted `method`, `Soup.Message.new` threw, and the caller's
`catch` made a dead feature look like the documented best-effort fallback. D-031 came out
of the same run (the harness verdict could be overwritten by its own cleanup), and
`GLib.source_exists` turned out **not to be bound in GJS**, so timer liveness is proven
behaviourally — Test 3i asks whether the 6 s callback fires.

## C2–C5 landed, and what each one bought

| Record | Change | What it actually proved |
|---|---|---|
| D-032 | `onSwap` delegates to `swapLanguages`; `test/repo.test.js` lists every decision an L0 test pins and asserts `extension.js` calls it | The old L0 row was decorative — it passed while production ran an inline copy. The guard now covers the class, not the instance |
| D-033 | `PROVIDERS` declares `credentialGroup` / `supportsFormatting`; `prefs.js` reads them through `getProvider` | prefs held the same mapping twice, as enum integers; reordering the table would have shown another provider's key fields |
| D-034 | Both `Gio.File.query_exists()` calls removed from the panel-icon path; existence became a repo invariant | ≈5.8 µs per theme refresh with a warm cache, so it is recorded as `chore` — the honest size. Its guard first matched its own explanatory comment, so "this call is gone" assertions now strip whole-line comments (`srcCode()`) and match a call shape |
| D-035 | Every JS pixel constant names the CSS declaration it mirrors, and three assertions recompute the card's content width from the stylesheet | `St` ignores `max-height` on this actor, so those literals *are* the layout contract while living in two files. All three were provoked red by CSS-only edits; a `min-width` control proves the reader cannot confuse it with `width` |

Two findings that are not code defects:

- **A docs anchor decays on every commit that moves lines.** 138 anchors walked after
  C1–C5: 14 rows in `shell-internals` relocated, 3 `prefs.js` ranges corrected. The
  re-derivation procedure is written into `docs/maintenance/verification.md` §3.
- **`test/prefs-validator.js` could not load a prefs that imports siblings** — it writes
  its runner outside the source tree, so a relative specifier resolves under `/tmp` and
  the failure reads like a prefs defect. Fixed by rebinding relative imports to absolute
  `file://` URLs (D-033).

## P — privacy and settings landed

| Record | Change | What it actually proved |
|---|---|---|
| D-036 | `notifications` default false→true | With the old default a background-mode failure produced **nothing at all**: the inline error branch needs `!isBackground` (`extension.js:721`) and `fail()` gates on `_notifications` (`extension.js:1014`). The gate was right; the shipped default was wrong. Now pinned by a repo guard that reads the schema |
| D-037 | `floating-background-toast` default true→false, and both rows' copy made honest | The toast body is `requestText + " → " + toText`, i.e. the user's own text, and notification bodies show on the lock screen (`extension.js:687`). The row that promises *silently* no longer contradicts a default that toasts |
| D-038 | `PROVIDERS` declares `host`; `updatePrivacyDisclosure()` composes the service row's subtitle per provider | The settings window now names the machine the copied text goes to, whether that provider needs a key, and that single words additionally go to `clients5.google.com`. Each declared host is cross-checked against the URL its own builder emits, because a privacy line naming the wrong party is worse than none |
| D-039 | Four `Restore this section’s defaults` rows + three two-click `Clear the keys` rows | Credential values cannot be re-derived from a default, so they get an armed row instead of a silent reset. Proven by click-count, not by reading the code |
| D-040 | About reads `this.metadata.url`; separate upstream row; License row | The packaged settings window no longer contradicts its own `metadata.json`, and attribution to upstream survives as its own row. `LICENSE` untouched, no legal conclusion drawn |
| D-041 | Escape binding exposed as an on/off switch that stores and restores the binding it removes | The keybinding was live (`extension.js:49`, `extension.js:384`) and unreachable from prefs. Deliberately **not** a key editor — see open-items §6 |
| D-042 | Catalog-coverage guard + 91 msgid entries backfilled into `po/messages.pot` | On a machine without gettext a `_()` string can ship and never enter the catalog. The guard makes that a red test, and carries an anti-vacuity floor so a broken matcher cannot pass silently. My "71 missing" figure from earlier in the session was an undercount — the appended total is what `git show b4e4c77 -- po/messages.pot \| grep -c '^+msgid "'` prints |
| D-043 | `test/prefs-validator.js` upgraded from "does not throw" to behaviour over all four providers | Two of its reds were **my** wrong assumptions, not implementation bugs (`get_css_classes()` vs `get_name()`, one-click-per-row counting). It also produced the measurement that killed one requested item: `AdwEntryRow` has no `subtitle` property |

## D-051…D-055 — the packaging path, run for real

| Record | Change | What it actually proved |
|---|---|---|
| D-051 | `pack.sh` checks for `msgfmt` before touching anything, and clears the staging tree **before** filling it | Its first failure was destructive: `rm -f *.zip` ran before the step that could fail, and a reused staging tree kept carrying files the repo had dropped |
| D-052 | `test/repo.test.js` pins the packaging list's shape and order against `gnome-extensions pack`'s own auto-include set | The tool ships only four filenames and **exits 0** for an `--extra-source` that does not exist — so "listed it" was never "shipped it" |
| D-053 | The obsolete `#~ msgid "License"` pairs were deleted from de/es/nl | `msgfmt` counts an obsolete entry against a live one and exits 1, which fails `pack --podir` *and* `msgmerge` at once. Established with three minimal `.po` control experiments, not by reading docs. No upstream translation was revived into a live entry — that is translation work |
| D-054 | A guard that refuses any catalog defining one msgid twice, obsolete included, with a ≥180-per-file parse floor | It was written red-first on the real defect, then went green on the fix and stayed green with the 125 non-conflicting obsolete rows (47/31/47) still in place |
| D-055 | The "this machine has no gettext" prose swept across `AGENTS.md`, `MAINTENANCE.md` §10, `docs/maintenance/open-items.md` §3/§4 and `verification.md` §3 | Those sentences were measurements of an **environment**. Several aggregates in them were also `grep` undercounts — the correction is in the record, the old entries were left alone |

After gettext arrived, the artifact was finally produced and read back: 39 entries, the eight root
files byte-identical to the repo, all 18 `icons/` files present, the three compiled `.mo` files
re-decodable with `msgunfmt`, and `docs/`/`test/`/`scripts/`/root `*.md` genuinely absent. Two things
that round made visible are **not** code defects and are recorded rather than fixed: `gschemas.compiled`
never enters a zip even when it sits in the staging tree (the tool's behaviour; the installed copies on
this machine have a compiled file whose mtime is months after their `.xml`, so it is generated locally),
and `shexli` segfaults with exit 139 *after* the zip is written.

## Same day, after the gettext round: the schema as a second translatable source

The gettext round's `xgettext` diff turned up something the packaging guards could not see: the
catalog coverage list was three JS files, while `schemas/*.gschema.xml` declares a `gettext-domain`
and therefore asks gettext for 48 more strings — **15 of which were in no catalog**, the template
still holding their pre-Baidu/Youdao wording. Closed in one change: the 15 backfilled as gettext
emits them (empty `msgstr`, so the compiled `.mo` files are byte-identical and `version` stays 16),
and three new assertions — schema-string coverage across all four catalogs, the `<schemalist>` domain
equaling `metadata.json`'s, and a tag-count self-check that refuses a reader which silently sees
fewer elements. Coverage re-measured to zero missing; the guard was run red on the real 15 first and
then provoked three more ways in `tar` copies against a green control (`verification.md` §3 has the
table). The question it left — whether a translated schema `description` is ever rendered — is now
measured rather than assumed: **glib 2.88.0's `glib-compile-schemas` has no gettext option at all**
(`--gettext-package=foo` → `Unknown option`, exit 1) and the installed `gschemas.compiled` is
sha256-identical to a plain untranslated compile; and separately, **our own code never reads those
strings** (`grep -cE "get_description|describe|summary"` → 0 in both `prefs.js` and `extension.js`),
while the live extension dir has no `locale/` at all, so nothing in this domain is even loadable here.
Whether some *external* consumer would translate at read time stays unobservable on this box, and the
three void controls are printed in [VERIFY.md](VERIFY.md).

## Open decisions for the maintainer

1. **`po/` — what is left of it.** Ordered and done on 2026-10-09: each locale now carries every
   string the sources request (86 entries appended per file, empty `msgstr` — **no translation
   text was invented**, and gettext falls back to the English msgid anyway, which was then *measured*
   once gettext existed rather than assumed), the 5 dead template entries this fork had itself
   created were deleted, all 13 `// Translators:` hints reach the four files as `#. ` comments, and
   every `#:` reference on a live template entry was recomputed (119 tokens, 0 stale). Since then the
   catalogs have gained a duplicate-definition refusal (`da52508`, `e636e9e` — obsolete `#~` included,
   because that combination is what made `pack --podir` fail) and coverage over the schema as a second
   translatable source (see the third bullet below). `node test/repo.test.js | grep '^# tests'` prints
   how many of these assertions there are now; a future string added without its four catalog edits
   goes red either way.
   **Still yours to decide, and the numbers are now gettext's rather than mine** — print them with
   `msgfmt --statistics -c -o /dev/null po/de.po` and the `xgettext`/`msgcomm` pair written out in
   [open-items.md §3](../maintenance/open-items.md):
   - what a regeneration would retire is **43** template entries the sources no longer request, not
     the 74 recorded here for a month — that older figure counted `schemas/*.gschema.xml`'s own
     translatable strings as dead, and the "translations present" figures it was paired with
     (17/56/17) were `grep` undercounts; the real `.mo` yield is **7/34/7 translated**, plus
     10/29/10 `#, fuzzy` rows that do not reach the user at all until a translator clears the flag.
   - the actual German/Spanish/Dutch text for the remaining 187/141/187 untranslated rows, which is
     not derivable from anything in this repo, so the UI stays English.
   - **closed the same day it was found:** the catalog guard's file list
     was the three JS modules, so the schema's `<summary>`/`<description>` strings were requested by
     gettext yet asserted by nothing: **15 of them were in no catalog**, and the template still carried
     their *pre-Baidu/Youdao* wording. Backfilled as gettext emits them (empty `msgstr`, so nothing was
     invented and the compiled `.mo` files are **byte-identical** before and after — hence no version
     bump), and now gated by three assertions: coverage over all four catalogs, `<schemalist
     gettext-domain>` equals `metadata.json`'s, and the XML reader must see every opening tag.
     [open-items.md §3](../maintenance/open-items.md) keeps the re-measure commands. What is owed here is
     now only the translation text itself — and note the measured priority: these 48 schema entries
     cannot change what this fork's user sees (the three-part answer is in
     [open-items.md §3](../maintenance/open-items.md): no gettext option in glib 2.88.0, no `locale/` in
     the live extension dir, and our code never reads
     schema summaries), so translator effort belongs on the 187/141/187 JS strings that do render.
   `scripts/update-po.sh` runs since 2026-10-10; `scripts/update-pot.sh` **must not** be used — it
   rewrites the template into a shape that puts five repository guards red.
2. **Push.** Done for this batch: nine commits went up on 2026-10-10 under your authorization, the
   remote was read back with `git ls-remote` (`1678340…`) and CI (`38025846410`) is green on that
   head. Nothing is queued to push. The next change will need its own authorization — the rule in
   `AGENTS.md` is per action, and this one is spent.
3. **Are `docs/reports/` tracked or ignored?** Currently **tracked**, because
   `AGENTS.md` and `MAINTENANCE.md` link `STATE.md` as the session entry point and a
   gitignored target breaks that link in a fresh clone. A sibling fork in this workspace
   gitignores its in-repo `reports/`. Flipping it is your call and costs one line in
   `.gitignore`.
4. **README's `🤝 Contributing` section** still describes fork → branch → pull-request,
   which the brief explicitly disclaims ("不需要团队流程"). Flagged, not removed —
   it is user-facing prose in a file another session just edited.
5. **A sibling project's harness is what leaves the safe-mode marker in `/run/user/1000`.**
   Cause established this pass (journal + `copyous@local/test/headless/up.sh:121`, which exports
   `WAYLAND_DISPLAY` but not a private `XDG_RUNTIME_DIR`). Fixing it means editing another
   project's test scripts, which this brief's boundary forbids acting on unasked — so it is
   reported here and nowhere else. Your call whether to fix it there.

## Next step

Nothing is queued in code. The gettext round landed `da52508` (the duplicate-msgid fix that had been
failing `pack --podir`), `e636e9e` (the guard that refuses a catalog defining one msgid twice) and
`b1db09f` (the stale-prose sweep); the schema batch landed `65401f5` plus its record `eecf2a1`, and
`f57c253`/`1678340` put the lesson into `AGENTS.md`. All of it is **pushed** — `origin/master` answers
`1678340…` and CI is green on that head — so what remains is only the human half: the list at the top
of this section.

The live-session pass began 2026-10-10 07:47. **It got further than the plan assumed**: the shell's
own D-Bus API reported the extension ACTIVE at `version 16.0` with an empty error list, and once a
sibling project's prefs dialog closed, **our own settings window was opened and read off the a11y bus
in the real session** (256 nodes — the disclosure sentence, the four restore rows with their own
counts, the clear row, the five group titles, the `Formality (DeepL only)` row and the Escape row all
rendered as the L1 validator claims). The full readout is in [VERIFY.md](VERIFY.md).

Two things are still **blocked on the maintainer**, and they are physical rather than analytical:
1. Visual legibility. Screenshots are denied to an agent on GNOME 50 (`AccessDenied`), so whether the
   long disclosure sentence wraps well, whether the panel icon looks right in light and dark, and
   where the card lands on a multi-monitor layout are his eyes' job. (The window I opened is still on
   his desktop — closing it means killing a prefs host shared with other extensions, which the
   permission layer rightly refused.)
2. The double-copy trigger: faking it with `wl-copy` would destroy clipboard types this session
   actually holds (`chromium/x-internal-source-rfh-token`, `text/html`) and cannot restore.

**No longer blocked** (done this pass under his standing "有选择就用你的判断"): the other three
providers' groups were read by setting `translation-service` in turn and restoring it — Google renders
no API group, no Formatting section and no clear row, Baidu and Youdao render their own group with
the secret field masked, and each disclosure sentence names its own host plus `clients5.google.com`
for the dictionary. `GetExtensionErrors` stayed empty through all four states, and the final read
back is `'DeepL'`. The walk also found a privacy gap in my own instrument, since fixed (D-050).
Also still his call, unchanged: the `po/` decisions above, flipping the global theme for the
light/dark live switch (a system setting this brief must not touch), task #8's older deferred
items, and **what to do about the analyzer `pack.sh` runs last**: `shexli` segfaults (exit 139, twice
reproduced) *after* the zip has already been written, so a non-zero exit there is not a broken
artifact — installing or pinning it is a dependency decision, not a code one. The gettext question is
**settled**: it was installed 2026-10-10, `pack.sh` now produces a zip on this machine, and that zip
was unpacked and read file by file. What is **no longer** his call: the docs
link sweep — it became a gate (`test/docs-lint.mjs`, D-048, in `npm test` and in CI),
the L2 reader exists too (D-049), and the packaging list is now a guard rather than a hand-copy
(`test/repo.test.js`, D-052), joined by the duplicate-msgid gate (D-054).

## What this pass did not verify

- `npm run integration` was re-run with C2, C3 and C4 all in the tree: `success:true` and
  exit 0. `npm run perf cost` was re-run too, and `~/.config/dconf/user` kept the same
  sha256 immediately before and after it — the zero-write property holds for this round.
- **L2, needs a real session** (logout/login — `scripts/reload.sh` cannot re-import
  edited ES modules): the dictionary card on a live ZH→EN word (its reverse lookup only
  reached the network for the first time as of D-029); the active panel icon in light and dark
  after D-034; live light/dark switch, Esc, multi-monitor, latency. Settings-window group
  visibility for each of the four providers is **no longer** in this list — all four were read off
  the a11y bus in the live session (D-049/D-050), see [VERIFY.md](VERIFY.md).
- **The settings window's structure and copy have been read from the live session; its legibility
  has not, and it has never been seen by a human.** What the a11y readout cannot carry: geometry
  (does the composed disclosure sentence wrap acceptably at a narrow width), whether a reset row
  *looks* right while armed, whether the notification on a background failure reads well. What the
  L1 validator still cannot carry: it runs against a **mocked** `Gio.Settings`, so it accepts key
  names the real schema may not have, and three of its assertion groups (hostname
  disclosure, the two-pass reset counts, the `strv` round trip) have been *written, never
  provoked red* — see `docs/maintenance/verification.md` §3.
- GNOME 45–49 remain unrun here; the declared range is inherited from the upstream, and
  `Adw-1.typelib` being versionless means this machine cannot prove a symbol's
  introduction version. Marked *(needs manual confirmation)* wherever it bites. That floor is
  exactly why `Adw.ActionRow:activatable-uri` and a key-capture widget were refused.
- Baidu and Youdao are still never exercised end to end (no credentials).
- `St`'s real scrollbar width is **measured now: 8 px** (policy-off control; 300→292 synthetic,
  650→642 on the card through `_applyHeightCaps()`). `SCROLLBAR_ESTIMATE = 16` stays as the
  deliberate over-cover and `test/eval-test.js` Test 5 asserts the real figure stays inside it,
  so a wider scrollbar on an unrun theme trips a red suite instead of clipping the last line.
  The header/actions heights stay outside the geometry guard because only a live shell can
  re-derive those.
- **RTL alignment is measured too, and the answer is "not expressible in CSS"**: `start` and
  `end` both read back LEFT (0) under LTR *and* RTL, identical to an unknown keyword, while
  `center`/`right` read back 1/2. Changing the popup's alignment therefore means choosing
  `left`/`right` from JS by language pair — a behaviour change, not a fact, so it waits for the
  maintainer. Test 5 pins the values so a future St that honours them goes red rather than
  making the fix silently possible.
- **Two machine observations, neither caused by this batch**, both timestamped in
  [VERIFY.md](VERIFY.md): `/run/user/1000/gnome-shell-disable-extensions` exists, and
  `~/.config/dconf/user` moves on its own. Evidence that neither is ours: this round's runs
  leave the dconf hash unchanged *within* the run (before/after pair, `1478d718…` at
  18:06–18:12, `f0a24a19…` around the integration re-run after D-036…D-043, and `291c5f98…`
  around the run that verified the `SCROLLBAR_ESTIMATE` comment edit), yet it had changed again by
  18:18 with no harness involved. The marker **now has a cause, and it is a sibling project's
  harness**: the journal records a nested `gnome-shell --headless --wayland-display=wayland-c…`
  starting at 18:47:03 and again at 20:46:24 (16 such boots between 18:40 and 21:00), and the
  marker's mtime is **20:46:23.650** — that prefix is `wayland-copyous-harness`, and
  `copyous@local/test/headless/up.sh:121` exports `WAYLAND_DISPLAY` but never isolates
  `XDG_RUNTIME_DIR`, so its nested shell writes into the shared runtime dir. The earlier line here
  claimed "no user process started in that minute": that was a `ps` snapshot taken after the shell
  had already exited, and it was wrong — the journal answers it. This project's two harnesses do
  isolate the dir, and the proof is negative and measured: the marker's mtime did not move across
  the 22:35 and 22:44 integration runs. The file sits in another project's boundary, so it was left
  in place rather than deleted. What matters for the next session: **do not treat any recorded hash
  or timestamp as a live baseline — re-measure in the same command that asserts it.**
  **Closed by the 2026-10-10 restart**: the marker is gone (logout tore down that tmpfs), and the
  dconf drift now has a *witnessed* mechanism — a concurrent session on this machine was running
  `dconf write` / `dconf reset -f` against another extension's schema path (pid 387264, seen 07:54).
  Sibling sessions move the same file, so a baseline is only good for the seconds around it.
