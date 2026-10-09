<p align="right"><a href="REVIEW.md"><b>English</b></a> · <a href="STATE.md">State</a> · <a href="AUDIT.md">Audit</a></p>

# Review package — phase A+B pass, 2026-10-09

One page for an independent reviewer. Nothing here asks you to trust a claim: each
row names the command or file:line that shows it.

## Scope

Documentation, test-guard and rules changes only. **No shipped code was touched**:
`extension.js`, `prefs.js`, `translation-helper.js`, `signing.js`, the three
stylesheets, `schemas/` and `metadata.json` are unmodified, so `version` stays as-is
and no `D-###` entry is owed (`npm run check:log` enforces exactly that and passes).

## Changes

| File(s) | What and why |
|---|---|
| `docs/maintenance/*` — 5 topics × 2 languages | The three manuals the maintenance brief names (compatibility matrix, shell-internals inventory + upgrade playbook, fixed power/leak method) plus verification and open-items, split out of the root handbook. Prose migrated, not rewritten; new content is the file:line API inventory, the libadwaita-1.4 floor, the sampling rules, and the queued/deferred/won't status labels |
| `MAINTENANCE.md`, `MAINTENANCE.zh-CN.md` | Rewritten as routers: all 14 numbered sections kept so the existing `§` references resolve, 5 inline, 9 replaced by a pointer. No fact now has two owners |
| `INVARIANTS.md`, `INVARIANTS.zh-CN.md` | New thin pointer: things that look wrong and must stay, designs measured and rejected, what the extension never does. It holds no list that `CHANGELOG.md` already owns |
| `scripts/check-log.mjs` | `--invariants` print mode, so `INVARIANTS.md` can stay thin without going vague. Refuses (exit 1) rather than printing an empty list; bare mode unchanged |
| `test/repo.test.js` | Bilingual pairing widened from repo root to **every** directory — required, because `docs/maintenance/` is bilingual. `venv` added to the skip set: `scripts/pack.sh` creates it inside the repo and its third-party markdown would otherwise be scanned |
| `AGENTS.md` | Stale aggregate count deleted and replaced by the command that prints it; commit-prefix list corrected against `git log`; `reload.sh` annotated with the measured fact that it cannot re-import ES modules; `§` pointers retargeted; new sections — session entry point, four-phase gated working method, evidence discipline (L0/L1/L2, provoke every guard red first, no commit without instruction), structural rules (enable/disable symmetry, no main-thread IO, no defensive noise, no architecture theatre), compatibility floor, push-needs-per-action-authorization |
| `docs/reports/{PROFILE,AUDIT,PLAN,STATE,REVIEW}.md` | Phase A/B artifacts and the cross-session handoff |
| `README.md` | One defect fixed: the CHANGELOG-pointer paragraph was present twice (wrapped and unwrapped copy). Now once, matching `README.zh-CN.md` |

## Invariants respected

- `metadata.json` untouched: `uuid`, `shell-version`, `version`, `gettext-domain` all
  as before. The domain mismatch with the uuid is load-bearing and is now recorded in
  `INVARIANTS.md` §1 rather than only in prose.
- The two-variant stylesheet naming, the rejected `pushModal` / `set_key_focus`
  designs, and the no-un-prefixed-CSS rule are carried forward unchanged.
- No dependency, no build step, no new private-API use, no feature removed.
- Nothing outside the repo was written. `~/.config/dconf/user` mtime is unchanged by
  this pass; no nested shell was started; `docs/`, `test/`, `scripts/` and root `*.md`
  are not in `scripts/pack.sh`'s explicit copy list, so nothing ships differently.

## Self-check results

| Command | Result |
|---|---|
| `npm test` | exit 0 — unit, teardown guard, repo guards, GLib/node signing known answers, prefs layout |
| `npm run check:log` | exit 0 — PASS |
| `npm run check:log -- --invariants` | exit 0 — prints the recorded fixes |
| `node test/repo.test.js` + twinless `docs/maintenance/probe.zh-CN.md` | exit 1 — proves the widened pairing guard bites; scratch removed |
| `node test/repo.test.js` + one `## ` added to a docs pair | exit 1 — "keep the pair in step"; file restored byte-identical, then green |
| `check-log.mjs --invariants` against a no-fix fixture | exit 1 — refuses an empty list |
| relative-link check over every `*.md` in the tree | 107 links, 0 broken |
| `gjs -m test/prefs-validator.js` run twice, `/tmp` counted before and after | count unchanged — the harness leaks no temp file (the two `/tmp` leftovers are dated 2026-10-08, before this pass, and were left alone) |
| `grep -nE '\.send\(\|send_message\|Gio\.Subprocess\|spawn' extension.js prefs.js translation-helper.js signing.js` | no matches — no blocking IO on the compositor thread |
| `grep -n 'console\.\|logError\|^\s*log(' ` across production files | one call site, carrying no text, key or URL |

`npm run integration` / `npm run perf` were **not** re-run: no production code changed,
so every cost figure quoted in these docs is explicitly inherited from the recorded L1
baseline and labelled as such.

## The findings a reviewer should challenge first

1. `test/unit.test.js` asserts the `swapLanguages` AUTO guard, and `extension.js` does
   not call `swapLanguages` — the live `onSwap` branch has an inline copy. Behaviour is
   correct; the L0 guard protects nothing. This is queued as C2.
2. A background-mode failure with default settings produces no user-visible output
   (`extension.js:716` requires `!isBackground`; `fail()` gates on `notifications`,
   default false).
3. `_enrichZhToEnDict` holds its cancellable and watchdog in function locals, so
   `destroy()` cannot reach a 6 s timer past `disable()`.
4. The shipped settings window contradicts `metadata.json` on the project homepage and
   says nothing about the text leaving the machine.
