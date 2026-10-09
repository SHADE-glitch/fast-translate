<p align="right"><a href="REVIEW.md"><b>English</b></a> · <a href="STATE.md">State</a> · <a href="AUDIT.md">Audit</a> · <a href="VERIFY.md">Verify</a></p>

# Review package — this round end to end, 2026-10-09

One page for an independent reviewer. Nothing here asks you to trust a claim: each row
names the command or `file:line` that shows it. Red→green evidence for every guard is in
[VERIFY.md](VERIFY.md).

## Scope

Docs and rules first (phase A+B, no shipped code), then the queued stability/structure
batch (phase C1–C5, production code). `version` **15**, one bump covering C2…C5. Frozen
fields untouched: `uuid`, `extension-id`, `shell-version`, `gettext-domain` — re-read with
`jq -e` in the bump commit.

## Changes

| File(s) | What and why |
|---|---|
| `AGENTS.md` | Stale aggregate count replaced by the command that prints it; prefix list corrected against `git log`; new sections — session entry point, gated working method, evidence discipline (L0/L1/L2, provoke every guard), structural rules, compatibility floor (Adw 1.4), push-needs-per-action authorization |
| `MAINTENANCE.md` + `.zh-CN.md` | Routers. All 14 numbered sections kept so existing `§` refs resolve; prose moved to `docs/maintenance/{compatibility-matrix,shell-internals,cost-measurement,open-items,verification}` × 2 languages |
| `INVARIANTS.md` + `.zh-CN.md`, `scripts/check-log.mjs` | Thin pointer plus `--invariants` print mode, so the recorded fixes keep one owner (`CHANGELOG.md`) |
| `extension.js` | D-029/D-030 enrich actually sends, and its cancellable + watchdog are reachable from `destroy()`; D-032 `onSwap` delegates to `swapLanguages`; D-034 both main-thread `query_exists()` stats removed; D-035 pixel constants annotated with the CSS they mirror |
| `translation-helper.js`, `prefs.js` | `buildGoogleRequest` owns `method` + UA (the missing `method` is what killed the enrich silently); `PROVIDERS` declares `credentialGroup` / `supportsFormatting` and prefs reads them instead of `service === 0/2/3` |
| `test/*` | Call-site list (an L0-pinned decision must be called from `extension.js`), provider-registry assertions, no-stat guard on comment-stripped source, JS↔CSS geometry recomputation, Test 3i behavioural watchdog proof, harness cleanup can no longer overwrite the verdict, `prefs-validator` rebinds relative imports |

## Invariants respected

- The two measured-rejected designs stay rejected: `global.stage.set_key_focus()`
  (steals focus, so the double Ctrl+C that triggers us loses its key-release and the app
  below auto-repeats) and `Main.pushModal(SYSTEM_MODAL)` (kills Super / Alt+Tab globally).
- Stylesheet filename contract unchanged; no `stylesheet.css` added; no un-prefixed CSS.
- No new dependency, build step, private-API use or feature removal. Nothing outside the repo
  was written **by our runs**: `~/.config/dconf/user` is byte-identical immediately before and
  immediately after this round's `npm run perf cost` (a within-run pair — the live session
  writes that file on its own, so no hash in these docs is a usable baseline), and both
  nested-shell harnesses run on a private `XDG_RUNTIME_DIR` with the memory settings backend.
- `docs/`, `test/`, `scripts/` and root `*.md` are not in `scripts/pack.sh`'s explicit copy
  list, so nothing ships differently.

## Self-check results

| Command | Result |
|---|---|
| `npm test` | exit 0 — `# pass 14 / # fail 0` (5 repo describes, unit, teardown guard, signing known answers, prefs layout) |
| `npm run integration` | exit 0, `success:true` — run with C2+C3+C4 in the tree |
| `npm run perf cost` | exit 0 — 7830 µs/window build, 1 tick per 500 clipboard events |
| `npm run check:log` | exit 0 — 35 entries, 30 commits cited; **and it went red on its own** for `1d44c07` before D-032 existed, which is the gate proven rather than described |
| Guard provocations | each new assertion seen failing for the reason it names — see the C2–C5 table in VERIFY.md, including the two controls (a comment must not redden the stat guard; `min-width` must not answer for `width`) |
| Relative-link check over every `*.md` | 0 broken |
| `file:line` anchor sweep | 138 anchors walked against current source, all re-verified; 14 `shell-internals` rows relocated, 3 `prefs.js` ranges corrected |

## Challenge these first

1. **C4 is filed as `chore`, not `perf`.** Measured ≈5.8 µs per theme refresh with a warm
   cache. If you think a main-thread `stat()` deserves a `perf` label regardless, the
   record and the open-item wording are the place to argue.
2. **The geometry guard asserts three of six CHROME terms.** Header (48 px) and actions
   (44 px) heights are live-shell measurements; including them would put an unmeasurable
   number behind a false assertion.
3. **`parseLanguageName` / `detectLang` are still tested but unreferenced** by production,
   and deliberately absent from the call-site list. Deferred with a reason in open-items §4.
4. **`/run/user/1000/gnome-shell-disable-extensions` keeps existing on this machine**, and it
   reappeared at 18:48:12 when nothing of ours was running (no user process started in that
   minute) — our nested shell boots inside a private `XDG_RUNTIME_DIR`, so it cannot write
   there. Unattributed and outside the repo, so deliberately not deleted. While it exists, a
   shell restart in this login session starts with every extension disabled — worth knowing
   before you debug "the extension disappeared".
