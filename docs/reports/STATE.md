<p align="right"><a href="STATE.md"><b>English</b></a> · <a href="PROFILE.md">Profile</a> · <a href="AUDIT.md">Audit</a> · <a href="PLAN.md">Plan</a></p>

# STATE — cross-session handoff

**Read this first in any new session.** It carries what a fresh context cannot see:
what is settled, what is committed but unpushed, and what the next step is.

Last updated 2026-10-09, during the phase-A+B pass described in
[PLAN.md](PLAN.md).

## Where the repo stands

| Thing | Value | How to re-check |
|---|---|---|
| Shipped version | 14, bumped for D-029/D-030 (was 13 at the start of this pass) | `jq -r .version metadata.json` |
| Branch state | `master`, ahead of `origin/master` | `git status -sb` |
| Unpushed | everything since `b4eefd7`: the phase-A+B docs batch **and** the C1 batch (D-029/D-030/D-031). Nothing was pushed — no authorization was given for it | `git log --oneline origin/master..HEAD` |
| Working tree | clean after each commit; `npm test` and `npm run check:log` green at every step | `git status --short` |
| Record gate | green, window `420251c..HEAD` | `npm run check:log` |
| Test suite | green: unit, teardown guard, repo guards, signing cross-check, prefs layout | `npm test` |

## Settled — do not re-open

- Reports and state live **inside the repo** (`docs/reports/`), not in `$HOME` or `/tmp`.
- `MAINTENANCE.md` is a router; the prose lives in bilingual topic files under
  `docs/maintenance/`. `test/repo.test.js` now enforces the pairing across every
  directory, so a topic pair that drifts goes red.
- `INVARIANTS.md` is a pointer file. The recorded behaviour fixes are printed from the
  record with `npm run check:log -- --invariants`; never copy them into the file.
- This round's code scope is **stability + structure**. Privacy/settings and
  aesthetics are the next gate, and Google-routing disclosure is **disclose-only** —
  no new switch, no narrowing.
- `AGENTS.md` was rewritten for this brief: stale aggregate counts replaced by the
  commands that print them, the prefix list corrected to what `git log` actually
  shows, the `reload.sh` limitation stated, and new sections for the session entry
  point, the gated working method, evidence discipline, structural rules and the
  compatibility floor. Old rules that were simply wrong were deleted, not annotated.

## C1 landed, and it found a dead feature

The queued teardown fix (D-030) was written red-first, and the new L1 assertion then
failed for a *different* reason: the dictionary enrich had never sent a request at all
(D-029) because its spec omitted `method`, `Soup.Message.new` threw, and the caller's
`catch` made a dead feature look like the documented best-effort fallback. Two more
records came out of the same run:

- **D-031 (guard)** — the integration harness could report exit 1 while its whole suite
  passed: `rm` on this PATH is a gio trash wrapper that refuses to delete under `/tmp`,
  and under `set -e` the EXIT trap's status replaced the verdict. Cleanup is now
  `/bin/rm … || true` in both harness scripts.
- `GLib.source_exists` is **not bound in GJS**, so "is the timer still alive" can only
  be proven behaviourally: does the 6 s callback fire or not. Test 3i does exactly that.

## Open decisions for the maintainer

1. **Next code step.** C2 is queued: make `onSwap` delegate to `swapLanguages`, so the
   L0 guard that exists today actually covers the branch production runs.
2. **Push.** `2a4dad1` and `b4eefd7` were already local, and this pass added ten more
   commits on top. Pushing needs your authorization for that specific action — none was
   given, and none is implied by "按计划推进".
3. **Are `docs/reports/` tracked or ignored?** A sibling fork in this workspace
   gitignores its in-repo `reports/`; this one is currently **tracked** because
   `AGENTS.md` and `MAINTENANCE.md` link `STATE.md` as the session entry point, and a
   gitignored target breaks that link in a fresh clone. Flipping it is your call and
   costs one line in `.gitignore`.
4. **README's `🤝 Contributing` section** still describes fork → branch → pull-request,
   which the brief explicitly disclaims ("不需要团队流程"). Flagged, not removed —
   it is user-facing prose in a file another session just edited.

## Next step

Phase C continues in the order in [PLAN.md](PLAN.md): **C2** (single source of truth for
the swap guard), **C3** (`PROVIDERS` metadata instead of prefs magic ints), **C4** (drop
the synchronous icon `stat()`), **C5** (pixel-constant cross-references). Each one: guard
red first, then implement, then report.

## What this pass did not verify

- `npm run integration` **was** re-run three times — red on the guard, red on the new
  assertion, then green with `success:true` **and exit 0** — and `~/.config/dconf/user`
  kept the same sha256 across all of them, so the zero-write property held.
- `npm run perf` was not re-run: C1 changes when the enrich timer is removed, not the
  steady-state cost, and the enrich now genuinely sends a request only for ZH→EN words.
  Any cost statement in these files is inherited from the recorded L1 baseline in
  [docs/maintenance/cost-measurement.md](../maintenance/cost-measurement.md).
- GNOME 45–49 remain unrun here; the declared range is inherited from the upstream,
  and `Adw-1.typelib` being versionless means this machine cannot prove a symbol's
  introduction version. Marked *(needs manual confirmation)* wherever it bites.
- Baidu and Youdao are still never exercised end to end (no credentials).
- The four L2 items (live light/dark switch, Esc, multi-monitor, latency) still need a
  real session, and `scripts/reload.sh` cannot substitute for one.
