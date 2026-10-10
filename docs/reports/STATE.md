<p align="right"><a href="STATE.md"><b>English</b></a> · <a href="PROFILE.md">Profile</a> · <a href="AUDIT.md">Audit</a> · <a href="PLAN.md">Plan</a> · <a href="VERIFY.md">Verify</a> · <a href="REVIEW.md">Review pack</a></p>

# STATE — cross-session handoff

**Read this first in any new session.** It carries what a fresh context cannot see:
what is settled, what is committed but unpushed, and what the next step is.

Last updated 2026-10-09, after the privacy-and-settings batch (D-036…D-043), the `po/` locale
sync, the two `St` measurements, and a final pass that turned one of my own forensic habits into a
repository guard. PLAN.md describes the batches.

## Where the repo stands

| Thing | Value | How to re-check |
|---|---|---|
| Shipped version | 16 — bumped for the schema defaults and the settings-window behaviour (was 15 at the start of this pass) | `jq -r .version metadata.json` |
| Branch state | `master`, ahead of `origin/master` | `git status -sb` |
| Unpushed | everything since `b4eefd7`: the phase-A+B docs batch, C1 (D-029/D-030/D-031), C2–C5 (D-032…D-035), the privacy batch (`b4e4c77`, `d2a2266`), and this pass — `9bffcbc` (po), `cffa892` (the two guard batches), `440f56a` (the `St` measurements), `13d40b0` (the record batch), `8b8ae82` (the docs gate + the L2 instrument) and this docs pass. **Nothing was pushed**: no push authorization was given, and "提交完成" does not imply it | `git log --oneline origin/master..HEAD \| wc -l` |
| Working tree | clean — po, guards, measurement, the version-16 debt, the record batch and the two new tools are all committed | `git status --porcelain \| wc -l` |
| Record gate | green; `npm run check:log -- --invariants` prints the recorded fixes from the record | `npm run check:log` |
| Test suite | green: unit, teardown guard, repo guards, the docs link/anchor gate, signing cross-check, prefs layout rendered for all 4 providers | `npm test`, and the counts print themselves: `node test/repo.test.js 2>&1 \| grep -E '^# (pass\|fail)'` and `node test/docs-lint.mjs` |

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

## Open decisions for the maintainer

1. **`po/` — what is left of it.** Ordered and done on 2026-10-09: each locale now carries every
   string the sources request (86 entries appended per file, empty `msgstr` — **no translation
   text was invented**, and gettext falls back to the English msgid anyway), the 5 dead template
   entries this fork had itself created were deleted, all 13 `// Translators:` hints reach the
   four files as `#. ` comments, and every `#:` reference on a live template entry was
   recomputed (119 tokens, 0 stale). Two new guards hold that state in place, so a future string
   added without its four catalog edits goes red. **Still yours to decide:** the **74 msgids the
   sources no longer request**, inherited with the frozen upstream's template — deleting them
   means editing what three named translators wrote. Their stale `#:` references go with them
   (measured per locale: 38 tokens on 27 still-live entries point somewhere other than the call).
   And the actual German/Spanish/Dutch text, which is not derivable from anything in this repo:
   de/es/nl still carry only 17/56/17 translations out of 189, so the UI stays English — no
   `.mo` is built here either (`MAINTENANCE.md` §10), and `scripts/update-po*.sh` still cannot
   run (gettext absent).
2. **Push.** `2a4dad1` and `b4eefd7` were already local, and every pass since has added more on
   top. Pushing needs your authorization for that specific action — none was given, and
   none is implied by "按计划推进".
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

Nothing is queued in code. The four commits landed (`9bffcbc` po, `cffa892` guards, `440f56a` the
`St` measurements, `13d40b0` this record pass) and the working tree is clean; **pushing is still
unauthorized**, so `origin/master` remains behind.

The live-session pass began 2026-10-10 07:47. **It got further than the plan assumed**: the shell's
own D-Bus API reported the extension ACTIVE at `version 16.0` with an empty error list, and once a
sibling project's prefs dialog closed, **our own settings window was opened and read off the a11y bus
in the real session** (256 nodes — the disclosure sentence, the four restore rows with their own
counts, the clear row, the five group titles, the `Formality (DeepL only)` row and the Escape row all
rendered as the L1 validator claims). The full readout is in [VERIFY.md](VERIFY.md).

Three things are still **blocked on the maintainer**, and they are physical rather than analytical:
1. Visual legibility. Screenshots are denied to an agent on GNOME 50 (`AccessDenied`), so whether the
   long disclosure sentence wraps well, whether the panel icon looks right in light and dark, and
   where the card lands on a multi-monitor layout are his eyes' job. (The window I opened is still on
   his desktop — closing it means killing a prefs host shared with other extensions, which the
   permission layer rightly refused.)
2. The other three providers' groups. Reading them means writing `translation-service` into his live
   profile, which needs his word; for DeepL the visibility gating is now confirmed on the real window.
3. The double-copy trigger: faking it with `wl-copy` would destroy clipboard types this session
   actually holds (`chromium/x-internal-source-rfh-token`, `text/html`) and cannot restore.
Also still his call, unchanged: the `po/` decisions above, flipping the global theme for the
light/dark live switch (a system setting this brief must not touch), and task #8's older deferred
items. What is **no longer** his call: the docs link sweep — it became a gate this pass
(`test/docs-lint.mjs`, D-048, in `npm test` and in CI), and the L2 reader exists too (D-049).

## What this pass did not verify

- `npm run integration` was re-run with C2, C3 and C4 all in the tree: `success:true` and
  exit 0. `npm run perf cost` was re-run too, and `~/.config/dconf/user` kept the same
  sha256 immediately before and after it — the zero-write property holds for this round.
- **L2, needs a real session** (logout/login — `scripts/reload.sh` cannot re-import
  edited ES modules): the dictionary card on a live ZH→EN word (its reverse lookup only
  reached the network for the first time as of D-029); settings-window group visibility
  for each of the four providers after D-033; the active panel icon in light and dark
  after D-034; live light/dark switch, Esc, multi-monitor, latency.
- **Nothing in the settings window has been seen by a human since C3, and this batch made it
  bigger, not smaller.** The disclosure sentence, the seven restore/clear rows and the Escape
  switch are covered by a validator that runs against a **mocked** `Gio.Settings`: it accepts
  key names the real schema may not have, and three of its assertion groups (hostname
  disclosure, the two-pass reset counts, the `strv` round trip) have been *written, never
  provoked red* — see `docs/maintenance/verification.md` §3. Whether the composed disclosure
  reads well at a narrow window width, whether a reset row looks right, and whether a
  background failure now actually arrives as a notification are all L2.
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
