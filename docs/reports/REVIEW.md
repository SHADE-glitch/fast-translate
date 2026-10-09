<p align="right"><a href="REVIEW.md"><b>English</b></a> · <a href="STATE.md">State</a> · <a href="AUDIT.md">Audit</a> · <a href="VERIFY.md">Verify</a></p>

# Review package — this round end to end, 2026-10-09

One page for an independent reviewer. Nothing here asks you to trust a claim: each row
names the command or `file:line` that shows it. Red→green evidence for every guard is in
[VERIFY.md](VERIFY.md).

## Scope

Docs and rules first (phase A+B, no shipped code), then the queued stability/structure
batch (phase C1–C5, production code), then the privacy and settings batch (D-036…D-043).
`version` **16** — 15 covered C2…C5, and this bump covers the two schema defaults plus the
settings-window behaviour, both of which reach a user on first run. Frozen fields untouched:
`uuid`, `extension-id`, `shell-version`, `gettext-domain` — re-read with `jq -e` in the bump commit.

## Changes

| File(s) | What and why |
|---|---|
| `AGENTS.md` | Stale aggregate count replaced by the command that prints it; prefix list corrected against `git log`; new sections — session entry point, gated working method, evidence discipline (L0/L1/L2, provoke every guard), structural rules, compatibility floor (Adw 1.4), push-needs-per-action authorization |
| `MAINTENANCE.md` + `.zh-CN.md` | Routers. All 14 numbered sections kept so existing `§` refs resolve; prose moved to `docs/maintenance/{compatibility-matrix,shell-internals,cost-measurement,open-items,verification}` × 2 languages |
| `INVARIANTS.md` + `.zh-CN.md`, `scripts/check-log.mjs` | Thin pointer plus `--invariants` print mode, so the recorded fixes keep one owner (`CHANGELOG.md`) |
| `extension.js` | D-029/D-030 enrich actually sends, and its cancellable + watchdog are reachable from `destroy()`; D-032 `onSwap` delegates to `swapLanguages`; D-034 both main-thread `query_exists()` stats removed; D-035 pixel constants annotated with the CSS they mirror |
| `translation-helper.js`, `prefs.js` | `buildGoogleRequest` owns `method` + UA (the missing `method` is what killed the enrich silently); `PROVIDERS` declares `credentialGroup` / `supportsFormatting` and prefs reads them instead of `service === 0/2/3`. Then in the privacy batch: `PROVIDERS` also declares `host` (derived from the builders' own endpoint constants through `hostOf()`), and `updatePrivacyDisclosure()` composes the service row's subtitle from it — host, whether a key is needed, and the single-word detour to `clients5.google.com` |
| `prefs.js` (settings behaviour) | Four `Restore this section’s defaults` rows calling `reset_keys` with exactly their own keys, three two-click `Clear the keys` rows for credentials, the Escape binding as an on/off switch that stores and restores what it removed, About reading `this.metadata.url` with a separate upstream row and a License row, and honest copy on the two rows whose defaults were wrong |
| `schemas/…gschema.xml`, `po/messages.pot` | `notifications` default false→**true**, `floating-background-toast` true→**false**; 91 msgid entries backfilled with empty `msgstr` so the template covers every string the sources ask to translate (`git show b4e4c77 -- po/messages.pot | grep -c '^+msgid "') |
| `test/*` | Call-site list (an L0-pinned decision must be called from `extension.js`), provider-registry assertions, no-stat guard on comment-stripped source, JS↔CSS geometry recomputation, Test 3i behavioural watchdog proof, harness cleanup can no longer overwrite the verdict, `prefs-validator` rebinds relative imports. Then: two more repo guards (shipped defaults vs the copy that describes them; catalog coverage with an anti-vacuity floor), a `host`↔builder-URL cross-check, and `prefs-validator` rewritten from "does not throw" into behaviour over all four providers — subtitles, seven reset/clear rows driven by click counts, Escape `strv` transitions |

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
| `npm test` | exit 0 — `# pass 33 / # fail 0` in `test/repo.test.js` (8 describes), unit, teardown guard, signing known answers, and `✅ Preferences layout validation successful! (4 providers rendered)` |
| `npm run integration` | exit 0, `success:true` — re-run after the privacy batch, after the catalog work, and again with Test 5 in place; each time the dconf hash measured immediately before and after the run was identical (last pair: `291c5f98…`) |
| `test/eval-test.js` Test 5 (new) | measures, then asserts: a vertical scrollbar withholds **8 px** (300→292 synthetic, 650→642 on the real card, control with the policy off shows 0 withheld), and `text-align: start`/`end` read back **LEFT (0)** under LTR *and* RTL while `center`/`right` read 1/2. Both assertions provoked red first — see VERIFY.md's table |
| `npm run perf cost` | exit 0 — 7830 µs/window build, 1 tick per 500 clipboard events |
| `npm run check:log` | exit 0 — 43 entries, 32 commits cited over 30 code-touching commits; **and it went red on its own** for `1d44c07` before D-032 existed, which is the gate proven rather than described |
| Guard provocations | each new assertion seen failing for the reason it names — see the C2–C5 table and the P table in VERIFY.md, including the controls (a comment must not redden the stat guard; `min-width` must not answer for `width`; an unmutated schema must stay green). Three prefs-validator assertion groups are **explicitly listed as provoked-not-yet-seen-failing**, not glossed over |
| Relative-link check over every `*.md` | 106 links across 24 markdown files, **0 broken** (re-run this pass with a fresh checker, not a remembered number) |
| `file:line` anchor sweep | the earlier round re-walked all 138; this batch added ~25 new anchors (schema defaults, disclosure, reset/clear rows, Escape switch, `test/unit.test.js:228`) and all of them were printed and re-read. Current machine check: 85 `path:name.ext:NNN` anchors resolve, 0 out of range, 0 pointing at a blank line |

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
5. **The disclosure tells the user the truth and changes nothing else.** Single words still go
   to Google whatever the selector says (D-038's decision line: disclose-only, no narrowing),
   because narrowing would take the dictionary card away from every non-Google provider. If
   you consider a disclosure that admits a silent detour to be the wrong fix, the argument is
   about the product, not the code.
6. **Two defaults were changed, and a default is behaviour you cannot un-ship.** Anyone who
   never touched `notifications` now gets failure notices; anyone who relied on the background
   toast has to turn it on. Both flips are pinned by a guard that reads the schema, so the next
   person who "restores the old default" sees a red test rather than a silent regression.
7. **The credential rows deliberately do not have a reset button** (D-039) — an issued API key
   has no factory value, so the row that would "restore" it would really delete it. They get a
   two-click clear instead. If that reads as over-engineering, note that the validator proves
   the first click erases nothing.
8. **`SCROLLBAR_ESTIMATE` stays 16 even though the scrollbar measures 8 px.** The over-cover is
   the safety property: under-covering clips the last line, over-covering costs a few px of
   slack, and 45–49 have never been run here, so a wider theme is not excludable. If you would
   rather match the measured number, that is a behaviour change with a clipping failure mode —
   and Test 5's upper-bound assertion is what tells you the day it stops being safe.
9. **RTL was measured, not fixed.** `start`/`end` are accepted but map to LEFT, so the only way
   to align the warning label by direction is to pick `left`/`right` from JS. The repo now says
   this in three places (open-items §2, MAINTENANCE §12, Test 5). If you expect CSS to solve it,
   the measurement above is the counter-evidence.
