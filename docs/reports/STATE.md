<p align="right"><a href="STATE.md"><b>English</b></a> · <a href="PROFILE.md">Profile</a> · <a href="AUDIT.md">Audit</a> · <a href="PLAN.md">Plan</a></p>

# STATE — cross-session handoff

**Read this first in any new session.** It carries what a fresh context cannot see:
what is settled, what is committed but unpushed, and what the next step is.

Last updated 2026-10-09, during the phase-A+B pass described in
[PLAN.md](PLAN.md).

## Where the repo stands

| Thing | Value | How to re-check |
|---|---|---|
| Shipped version | the integer in `metadata.json` | `jq -r .version metadata.json` |
| Branch state | `master`, ahead of `origin/master` by the commits listed below | `git status -sb` |
| Unpushed | `2a4dad1` (AUTO title + reverse lookup) and `b4eefd7` (its docs) — **nothing was pushed by this pass** | `git log --oneline origin/master..HEAD` |
| Working tree at session start | clean; the current edits are this pass's output, **uncommitted by design** | `git status --short` |
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

## Open decisions for the maintainer

1. **Commit or not, and in what split.** This pass touched no shipped code, so no
   version bump and no `D-###` entry is required; the natural split is one commit for
   the `docs/maintenance/` split + router, one for `INVARIANTS.md` + `check-log
   --invariants`, one for the `repo.test.js` scope widening, one for `AGENTS.md`, one
   for `docs/reports/`. Say the word and I stage explicit paths.
2. **Push.** Two commits are still local from an earlier session and this pass adds
   untracked work. Pushing needs your authorization for that specific action.
3. **Are `docs/reports/` tracked or ignored?** A sibling fork in this workspace
   gitignores its in-repo `reports/`; this one is currently **tracked** because
   `AGENTS.md` and `MAINTENANCE.md` link `STATE.md` as the session entry point, and a
   gitignored target breaks that link in a fresh clone. Flipping it is your call and
   costs one line in `.gitignore`.
4. **README's `🤝 Contributing` section** still describes fork → branch → pull-request,
   which the brief explicitly disclaims ("不需要团队流程"). Flagged, not removed —
   it is user-facing prose in a file another session just edited.

## Next step

Phase C, one item at a time, in the order in
[PLAN.md](PLAN.md): **C1** — hoist the dictionary-enrichment `cancellable` and
`watchdogId` onto `this` so `destroy()` can reach them. Write it into
`test/teardown-guard.test.js`'s `MUST_BE_GUARDED` first and watch that file fail
before touching `extension.js`.

## What this pass did not verify

- `npm run integration` and `npm run perf` were not re-run: no production JS changed.
  Any cost statement in these files is inherited from the recorded L1 baseline in
  [docs/maintenance/cost-measurement.md](../maintenance/cost-measurement.md).
- GNOME 45–49 remain unrun here; the declared range is inherited from the upstream,
  and `Adw-1.typelib` being versionless means this machine cannot prove a symbol's
  introduction version. Marked *(needs manual confirmation)* wherever it bites.
- Baidu and Youdao are still never exercised end to end (no credentials).
- The four L2 items (live light/dark switch, Esc, multi-monitor, latency) still need a
  real session, and `scripts/reload.sh` cannot substitute for one.
