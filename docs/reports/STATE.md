<p align="right"><a href="STATE.md"><b>English</b></a> · <a href="PROFILE.md">Profile</a> · <a href="AUDIT.md">Audit</a> · <a href="PLAN.md">Plan</a> · <a href="VERIFY.md">Verify</a> · <a href="REVIEW.md">Review pack</a></p>

# STATE — cross-session handoff

**Read this first in any new session.** It carries what a fresh context cannot see:
what is settled, what is committed but unpushed, and what the next step is.

Last updated 2026-10-09, at the end of the C queue described in
[PLAN.md](PLAN.md).

## Where the repo stands

| Thing | Value | How to re-check |
|---|---|---|
| Shipped version | 15 — the one bump covering C2…C5 (was 14 at the start of this pass) | `jq -r .version metadata.json` |
| Branch state | `master`, ahead of `origin/master` | `git status -sb` |
| Unpushed | everything since `b4eefd7`: the phase-A+B docs batch, C1 (D-029/D-030/D-031) and C2–C5 (D-032…D-035). Nothing was pushed — no authorization was given for it | `git log --oneline origin/master..HEAD \| wc -l` |
| Working tree | clean after each commit; `npm test` and `npm run check:log` green at every step | `git status --short` |
| Record gate | green; `npm run check:log -- --invariants` prints the recorded fixes from the record | `npm run check:log` |
| Test suite | green: unit, teardown guard, repo guards (5 describes), signing cross-check, prefs layout | `npm test` |

## Settled — do not re-open

- Reports and state live **inside the repo** (`docs/reports/`), not in `$HOME` or `/tmp`.
- `MAINTENANCE.md` is a router; the prose lives in bilingual topic files under
  `docs/maintenance/`. `test/repo.test.js` enforces the pairing across every
  directory, so a topic pair that drifts goes red.
- `INVARIANTS.md` is a pointer file. The recorded behaviour fixes are printed from the
  record with `npm run check:log -- --invariants`; never copy them into the file.
- This round's code scope was **stability + structure**. Privacy/settings and
  aesthetics are the next gate, and Google-routing disclosure is **disclose-only** —
  no new switch, no narrowing.
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

## Open decisions for the maintainer

1. **The next gate.** The C queue is empty. What remains inside the brief is the deferred
   **privacy and settings** group (background-mode failure is silent with defaults, the
   success toast quotes the user's own text, no statement of where text goes, no
   restore-to-defaults, the About page has no license row, six key rows have no
   plain-language subtitle, the Escape keybinding is not exposed) and the **aesthetics**
   group. Both need your go-ahead before code, per the working method.
2. **Push.** `2a4dad1` and `b4eefd7` were already local, and both passes added commits on
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

## Next step

Nothing is queued. Which gate opens is yours: privacy/settings, aesthetics, or a
live-session pass over the L2 list first. If code starts again, one small change at a
time with its diff and verification method, guard red first.

## What this pass did not verify

- `npm run integration` was re-run with C2, C3 and C4 all in the tree: `success:true` and
  exit 0. `npm run perf cost` was re-run too, and `~/.config/dconf/user` kept the same
  sha256 immediately before and after it — the zero-write property holds for this round.
- **L2, needs a real session** (logout/login — `scripts/reload.sh` cannot re-import
  edited ES modules): the dictionary card on a live ZH→EN word (its reverse lookup only
  reached the network for the first time as of D-029); settings-window group visibility
  for each of the four providers after D-033; the active panel icon in light and dark
  after D-034; live light/dark switch, Esc, multi-monitor, latency.
- GNOME 45–49 remain unrun here; the declared range is inherited from the upstream, and
  `Adw-1.typelib` being versionless means this machine cannot prove a symbol's
  introduction version. Marked *(needs manual confirmation)* wherever it bites.
- Baidu and Youdao are still never exercised end to end (no credentials).
- `St`'s real scrollbar width vs `SCROLLBAR_ESTIMATE = 16` has never been measured; the
  constant sits on the safe side of that unknown, and the header/actions heights stay
  outside the geometry guard precisely because only a live shell can re-derive them.
- **Two machine observations, neither caused by this batch**, both timestamped in
  [VERIFY.md](VERIFY.md): `/run/user/1000/gnome-shell-disable-extensions` exists, and
  `~/.config/dconf/user` moves on its own. Evidence that neither is ours: this round's runs
  leave the dconf hash unchanged *within* the run (before/after pair, `1478d718…` at
  18:06–18:12), yet it had changed again by 18:18 with no harness involved; and the marker
  reappeared at **18:48:12** while no user process started in that minute (`ps --sort=start_time`
  shows only kernel workers) and no shell of ours was running — the harness boots its shell
  inside a private `XDG_RUNTIME_DIR`, so it cannot write there at all. Cause unknown, and the
  file is outside this project's boundary, so it was left in place rather than deleted. What
  matters for the next session: **do not treat any recorded hash or timestamp as a live
  baseline — re-measure in the same command that asserts it.**
