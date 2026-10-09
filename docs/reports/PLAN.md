<p align="right"><a href="PLAN.md"><b>English</b></a> · <a href="AUDIT.md">Audit</a> · <a href="PROFILE.md">Profile</a> · <a href="STATE.md">State</a></p>

# Plan

Phase-B artifact, 2026-10-09. Scope settled with the maintainer; the decisions
below are **his**, recorded so a later session does not re-open them.

## Decisions taken

| Question put | Options offered | Chosen |
|---|---|---|
| Where do reports and progress live | outside the repo (per the original brief) / inside | **inside this repo** — `docs/reports/`. The `{{报告目录}}` placeholder in the brief is therefore unused, and AGENTS.md now says "do not change anything outside this repo directory" |
| `docs/maintenance/` layout | split the three named manuals out and make `MAINTENANCE.md` a router / add only what is genuinely missing / declare the existing handbook already satisfies the brief | **split, router** |
| What happens to the 9 Chinese sections that the split would orphan | make `docs/maintenance/` bilingual and widen `test/repo.test.js` pairing to every directory / keep the Chinese handbook whole and let English split / don't split | **bilingual topic files + widened pairing guard** |
| `INVARIANTS.md` | create as a thin pointer backed by a `check-log.mjs --invariants` print mode / create as a prose copy / do not create | **thin pointer + print mode** |
| This round's code scope | stability+structure only / add the privacy-and-settings group / add aesthetics / docs only | **stability + structure** |
| Single words routed to Google regardless of provider | disclose only / add a `dictionary-lookup` switch / narrow to "Google selected" | **disclose only** — narrowing regresses D-021/023/025/028 |
| AGENTS.md | keep as-is / adapt to the new brief and delete or amend stale rules | **adapt, deleting what is stale** |

## Done in this pass (docs, tests and rules only — no shipped behaviour)

1. `docs/maintenance/{compatibility-matrix,shell-internals,cost-measurement,verification,open-items}`
   as bilingual pairs; prose migrated, not rewritten, with the API inventory
   (file:line) and the upgrade playbook added to `shell-internals`, the libadwaita
   1.4 floor added to `compatibility-matrix`, and the sampling rules added to
   `cost-measurement`.
2. `MAINTENANCE.md` + `.zh-CN.md` rewritten as routers: 14 numbered sections
   preserved so every existing `§` reference keeps resolving; four sections stay
   inline (read-first with the pointer table, packaging/translations, privacy
   boundary, platform facts).
3. `INVARIANTS.md` + `.zh-CN.md` created as pointer files, and
   `scripts/check-log.mjs` given a `--invariants` print mode that refuses to print
   an empty list.
4. `test/repo.test.js`: bilingual pairing widened from the repo root to every
   directory, `venv` added to the skip set (because `scripts/pack.sh` creates it
   inside the repo), and both branches **provoked red** before being trusted.
5. `AGENTS.md` reworked: stale aggregate count deleted and replaced by the command,
   the prefix list corrected against what `git log` actually shows, the
   `reload.sh` "does not re-import ES modules" fact added, and new sections for the
   session entry point, the gated working method, evidence discipline, structural
   rules, and the compatibility floor.
6. `docs/reports/{PROFILE,AUDIT,PLAN,STATE}.md` written.

## Queued for the next approval (the C list)

Each item is one commit, each guard is written red first, and `npm test` stays green
throughout.

**Queue status (2026-10-09): C1–C5 landed.** C1 → D-029/D-030/D-031
(`e88b27d`, `60c6fef`, `61639e9`), C2 → D-032 (`1d44c07`), C3 → D-033 (`d731270`),
C4+C5 → D-034/D-035 (`f8d6fe9`). Two outcomes differed from this table: C4 measured
≈5.8 µs per icon refresh with a warm cache, so it is recorded as `chore`, not `perf`;
and C5 grew from comments into three cross-file assertions, because a comment nobody can
run is how the drift was allowed in the first place. The C6 gate provocation also
happened on its own — `1d44c07` touched `extension.js` before its `D-###` existed and
`npm run check:log` reported exactly that one commit, which is the bite being proven.

| # | Change | Kind | Reaches shipped code (bump?) | How it is proven |
|---|---|---|---|---|
| C1 | Hoist the enrichment `cancellable` and `watchdogId` onto `this`, cancel and remove both in `destroy()`, and drop the previous source when re-arming (the pattern already used by `_armSafetyTimeout`) | `fix` | yes | Add both steps to `MUST_BE_GUARDED` in `test/teardown-guard.test.js`, watch it fail with "step not found in destroy()", then implement; L1 assertion that `GLib.source_exists()` is false after `disable()` |
| C2 | Make `onSwap` delegate to `swapLanguages` — one source of truth — or delete the helper and move the assertion to L1 | `chore` | yes | The L0 section that passes today while `grep -c swapLanguages extension.js` is 0 is the red state; green means the helper is reached from the branch production runs |
| C3 | `prefs.js` visibility driven by per-provider metadata in `PROVIDERS` instead of `0/2/3` | `chore` | yes | Assert in `unit.test.js` that every provider entry declares the fields `prefs.js` consumes — red against the current data shape, then implement; `gjs -m test/prefs-validator.js` after |
| C4 | Drop the two synchronous `query_exists()` calls: icon existence becomes a repo invariant asserted by a test, no runtime `stat()` | `perf` if a number survives, else `chore` | yes | Add the file-existence assertion first, provoke it with a deliberately wrong name, then remove the stat; `npm run perf cost` before and after |
| C5 | Cross-reference comments between the JS pixel constants and the CSS they mirror | `chore` | no | static |
| C6 | One `metadata.json` version bump for the batch, with a `D-###` entry per behaviour change carrying its evidence tier | — | — | prove the record gate bites once: a production-code commit with no citing entry must make `npm run check:log` fail |

Explicitly **not** in this queue, and why: `St.ScrollView` → `St.Clip` (would risk
the measured height fixes for no user gain), the palette/theme rewrite and the icon
symbols (aesthetics, lowest priority, and `➜` waits on the unresolved RTL question),
the keybinding editor row (needs a real key editor), and splitting `extension.js`
(no measured pain yet, and `CODE_PATHS` plus the teardown guard match on paths and
text so it is a coordinated change).

## Deferred to the following gate (privacy and settings)

Background-mode failure silence, the success toast quoting the user's text, the
user-facing disclosure of where text goes, restore-to-defaults, the About page's
wrong homepage and missing license row, and the credential rows' plain-language
subtitles. All recorded with file:line in
[docs/maintenance/open-items.md](../maintenance/open-items.md) §5 so nothing is
lost between sessions. Every one of them needs new `_()` msgids, and `msgfmt` is not
installed here — that is why they move as one group, after the C queue.

## What still needs a real session (L2)

The popup in light and dark after a live theme switch, Esc, multi-monitor placement,
and perceived latency; plus dest-pane whitespace after the per-region cap fix, and
whether `text-align: start` is accepted by St at all. `scripts/reload.sh` cannot show
any of it — logging out and in again is the only way to load edited ES modules.
