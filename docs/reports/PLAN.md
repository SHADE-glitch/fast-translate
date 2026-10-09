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
| This round's code scope | stability+structure only / add the privacy-and-settings group / add aesthetics / docs only | **stability + structure** — later widened by the maintainer on 2026-10-09 ("全部开始工作") to the privacy-and-settings group, which is the gate recorded below; aesthetics stayed out, and why is in open-items §6 |
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

## The privacy-and-settings gate (D-036…D-043) — landed

Landed as `b4e4c77` (schema defaults, the two new repo guards, the `messages.pot` backfill)
and `d2a2266` (disclosure, restore/clear, Escape switch, About, helper `host`, prefs
validator). `AGENTS.md`/`MAINTENANCE.md` §11 now point at each other instead of at an open item.

The maintainer answered each choice with one token ("全按推荐"), then decided the one item the
recommendation could not cover ("选 A，追加 71 条到 pot"):

| Question put | Chosen | What actually happened |
|---|---|---|
| Background failure is silent with defaults | **1a** — flip `notifications` to true, keep the gate | Landed (D-036). The gate was correct; the shipped default was the defect |
| The toast quotes the user's own text | **2b** — default off, and name both halves of the body in the row's copy | Landed (D-037), and it exposed that the neighbouring row promised silence while defaulting to toast |
| Where does the text go? | **3a** — compose the disclosure per provider from `PROVIDERS`, no new switch | Landed (D-038). DeepL needed a special case: its endpoint *is* the `url` setting, so `host` is `null` there and the row reads the setting |
| Restore-to-defaults | **4b** — one row per section, plus a two-click clear for credentials | Landed (D-039) |
| About page contradiction | **5a** — fork row + upstream row + license row, `LICENSE` untouched | Landed (D-040) |
| Six credential rows need plain-language subtitles | **6b** — only the two appid/secret ID rows | **Could not be done.** `AdwEntryRow` has no `subtitle` property; measured as a `TypeError` under the validator. The prose went into each group's `description` instead (D-043) |
| Escape binding in prefs | **7a** — on/off switch, no key editor | Landed (D-041), storing and restoring the binding it removes |
| Hand-made link buttons | **8a** — native `activatable-uri` rows | **Not shipped.** The property's introduction version cannot be proven here while `Adw-1.typelib` is versionless — a cosmetic win traded for a crash on the oldest declared release |
| `⇄` / `➜` / flag emoji → symbolic icons | **9a** — leave | Left, in open-items §6 |
| Catalog debt | **10b** — a msgid↔template guard, no gettext | Landed (D-042). Its first draft also demanded locale completeness; that version would have rewritten `po/de.po`/`es.po`/`nl.po`, so it was re-scoped to pot-coverage + locale orphans |
| Source strings missing from `po/messages.pot` (I quoted 71 at the time; the real gap was larger) | **A** — append them with empty `msgstr`, by hand, no committed generator | **91 entries appended** (`git show b4e4c77 -- po/messages.pot \| grep -c '^+msgid "'`). Afterwards the same round's own prefs edits made 5 of those 91 dead, and they were dropped again — see the `po/` sync row below |
| Sync `de/es/nl` with the template, and the `#.` translator hints | (both were on my "needs your call" list) | **He said continue.** Measured first: of those 91, **86** are strings the sources still request and **5** are dead pot entries this fork had authored — so 86 went into each locale with an empty `msgstr`, and the 5 were deleted from the template rather than handed to a translator. The 13 `// Translators:` comments were copied into all four files as `#. ` hints, and every `#:` reference on a live template entry was recomputed from the current sources. **Both new guards were written first and seen red** (locale coverage, hint propagation), so the catalogs now stay in step: a new `_()` string has to land in four files before `npm test` is green. Deliberately not done: inventing German/Spanish/Dutch text (an empty `msgstr` already falls back to English), deleting the 74 upstream-era msgids the code no longer requests, and rewriting the 38 stale `#:` tokens that sit inside translator-authored entries |
| Forensic method for the zero-write property: hash the store, or print it | (not asked — it was my own instrument that was wrong) | **Retired the printing form, and made the rule a guard.** A before/after pair can be taken by digest or by contents, and contents here means `apikey`, `baidu-appid`/`baidu-secret`, `youdao-appid`/`youdao-secret` and `url`. No repo script may now run `dconf dump`/`read` or `gsettings get`/`list`; the property is proven with `sha256sum ~/.config/dconf/user` inside the asserting command (`291c5f98…` before and after the run that verified the `SCROLLBAR_ESTIMATE` comment edit). Whether a value ever reached disk under the old method is **not claimed either way** — see VERIFY.md's last section. Both assertions of the new guard were provoked red, with comment-only controls kept green |

## What still has no owner

Nothing in the queue above is open. The remaining deferred list is task #8 (A7/A8/A9/B6/A11,
po regeneration — blocked on gettext being absent here) plus the two `po/` decisions and
`docs/reports/` tracked-vs-ignored, all recorded in [STATE.md](STATE.md). Two more have no
owner as of this pass: codifying the docs link/anchor sweep into `test/repo.test.js` (cost and
refusal reasons in `docs/maintenance/open-items.md` §4), and a **sibling project's** headless
harness that leaves `/run/user/1000/gnome-shell-disable-extensions` behind because it isolates
`WAYLAND_DISPLAY` but not `XDG_RUNTIME_DIR` — fixing that belongs to the other repo, so it is
reported, not touched.

## What still needs a real session (L2)

The popup in light and dark after a live theme switch, Esc, multi-monitor placement,
and perceived latency; plus dest-pane whitespace after the per-region cap fix. Whether St
accepts `text-align: start` is **no longer on this list** — it is measured (Test 5: `start`
and `end` both read back LEFT, under LTR and RTL alike); what stays L2 is only how an RTL
pair *looks*, and that is a decision to change alignment from JS, not a fact to observe.
`scripts/reload.sh` cannot show any of it — logging out and in again is the only way to load
edited ES modules.
