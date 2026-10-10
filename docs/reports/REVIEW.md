<p align="right"><a href="REVIEW.md"><b>English</b></a> · <a href="STATE.md">State</a> · <a href="AUDIT.md">Audit</a> · <a href="VERIFY.md">Verify</a></p>

# Review package — this round end to end, 2026-10-09 → 2026-10-10

One page for an independent reviewer. Nothing here asks you to trust a claim: each row
names the command or `file:line` that shows it. Red→green evidence for every guard is in
[VERIFY.md](VERIFY.md).

## Scope

Docs and rules first (phase A+B, no shipped code), then the queued stability/structure
batch (phase C1–C5, production code), then the privacy and settings batch (D-036…D-043), then the
live-session pass (D-048…D-050) and the packaging + gettext round (D-051…D-055, which is the first
time this repo's artifact was built and read back).
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
| `po/{de,es,nl}.po`, `test/repo.test.js` (D-053/D-054) | Deleted the obsolete `#~ msgid "License"` pair from each catalog — `msgfmt` counts an obsolete entry against a live one and exits 1, which is what made `pack --podir` and `msgmerge` both fail. Three lines of deletions, no translation text added or revived. The new guard refuses any catalog defining one msgid twice, obsolete included, and was written red on that real defect before it was fixed |
| `po/{messages.pot,de,es,nl}` + `test/repo.test.js` (D-057/D-058) | The schema proved to be a **second translatable source that nothing guarded**: 15 of the 48 `<summary>`/`<description>` strings it asks gettext for were in no catalog, and the template's own schema rows still carried pre-Baidu/Youdao wording. 15 entries appended in gettext's own formatting (empty `msgstr`, 75 added / 0 removed lines per file), plus three assertions written first and run red: coverage over all four catalogs, `<schemalist gettext-domain>` equal to `metadata.json`'s, and an opening-tag count that refuses a silently blind reader. Compiled `.mo` files verified **byte-identical** before and after, so `version` stays 16 |
| `scripts/pack.sh`, `AGENTS.md`, `MAINTENANCE.md` §10, `docs/maintenance/{open-items,verification}` ×2 (D-051/D-052/D-055) | The pre-flight `msgfmt` check and staging-before-clear ordering, the packaging-list guard, and a sweep of every sentence that described the **environment** rather than the code ("this machine has no gettext", "`update-po*.sh` cannot run", "no zip has ever been produced here"). `scripts/update-pot.sh` is now explicitly retired, with the five reds it causes listed |

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
  list — and since the gettext round that is **read off the artifact**, not inferred from the
  script: `unzip -l` over the built zip shows them absent, with the 8 root members, all 18
  `icons/` files and the three compiled `.mo` files present.

## Self-check results

| Command | Result |
|---|---|
| `npm test` | exit 0 across six steps — unit, teardown guard, `test/repo.test.js` (`# tests 43 / # suites 9 / # pass 43 / # fail 0`, as printed; it was 40 before the schema batch), `test/docs-lint.mjs`, signing known answers, and `✅ Preferences layout validation successful! (4 providers rendered)` |
| `npm run integration` | exit 0, `success:true` — re-run after the privacy batch, after the catalog work, and again with Test 5 in place; each time the dconf hash measured immediately before and after the run was identical (last pair: `291c5f98…`) |
| `test/eval-test.js` Test 5 (new) | measures, then asserts: a vertical scrollbar withholds **8 px** (300→292 synthetic, 650→642 on the real card, control with the policy off shows 0 withheld), and `text-align: start`/`end` read back **LEFT (0)** under LTR *and* RTL while `center`/`right` read 1/2. Both assertions provoked red first — see VERIFY.md's table |
| `npm run perf cost` | exit 0 — 7830 µs/window build, 1 tick per 500 clipboard events |
| `npm run check:log` | exit 0 — 56 entries, 43 distinct commits cited as of the gettext round's record batch (the command prints its own counts; the number grows on every recorded change, so re-run it instead of quoting this row); **and it went red on its own** for `1d44c07` before D-032 existed, which is the gate proven rather than described. It also went red a second time this round, for a reason of mine: the D-051/D-052 append ran twice, and `2. id D-051 reuses number 51` / `ids must increase` is exactly the duplicate this checker exists to catch. The same class of defect on the *other* side of the toolchain — one msgid defined twice in a catalog — is what D-053/D-054 are about |
| Guard provocations | each new assertion seen failing for the reason it names — see the C2–C5 table, the P table and the packaging table in VERIFY.md, including the controls (a comment must not redden the stat guard; `min-width` must not answer for `width`; an unmutated schema must stay green; an unmutated copy of the repo must stay green). Three prefs-validator assertion groups are **explicitly listed as provoked-not-yet-seen-failing**, not glossed over |
| Docs link/anchor gate | now a committed gate, not a remembered number: `node test/docs-lint.mjs` prints its own counts (`113 relative link(s) and anchor(s) resolve over 24 markdown files` as of the schema batch — it has moved three times this session, so re-run it rather than trusting this row), exit 0, wired into `npm test` and CI |
| `bash scripts/pack.sh` | **completes, and its output was unpacked and read file by file.** Two stages of one story, both measured: before the msgfmt pre-flight it exited 2 *after* deleting the previous `*.zip` and *after* staging into a reusable tree (so a file the repo had dropped kept riding along — reproduced with two consecutive copies), and with gettext installed the run instead exited 1 inside `gnome-extensions pack`, because a catalog defined `License` twice — once live, once obsolete. Now: `✅ Packaging complete`, `120343` bytes, 39 members. Its last step, `venv/bin/shexli`, still segfaults (exit 139, twice) *after* the zip is written, which is a dependency question, not an artifact question |
| Packaging and catalog guards | "the packaging list ships exactly what the repo has" (`test/repo.test.js`, D-052) provoked over eight one-mutation `tar` copies plus an unmutated control that stayed green — the run worth remembering is `cp -a`, where two characters of rewording emptied the parsed list and **two content guards reported green while measuring nothing** until the anti-vacuity floor caught it. The duplicate-msgid guard (D-054) was written red on the real `License` defect first, then went green on the fix and stayed green with the 125 non-conflicting obsolete rows (47/31/47) still in the files |
| Live session after the 2026-10-10 restart | `GetExtensionInfo(fast-translate@local)` → `version 16.0`, `state=1`, `error ''`; `GetExtensionErrors` → `[]`; `UserExtensionsEnabled=true`; journal for pid 367241 = 111 lines, 0 errors. `state` was **calibrated**, not assumed: 9 enabled uuids → `1`, 5 installed-but-disabled → `6`. `GetExtensionErrors` stayed `[]` while `translation-service` was set to each of the four values in turn and restored (final read-back `'DeepL'`), and the settings window was opened and read off the a11y bus — 256 nodes: five group titles, the four disclosure sentences each naming their own host, the restore rows counting 4/2/3/3 vs 3, the masked secret field. An a11y tree carries text and states, **not geometry**, so legibility stays L2. See VERIFY.md's L2 table |
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
4. **`/run/user/1000/gnome-shell-disable-extensions` had a cause, and it is not ours.** It
   reappeared at 18:48:12 with nothing of ours running; the earlier note here blamed "no user
   process started in that minute", which was a `ps` snapshot taken *after* the nested shell had
   already exited. The journal answers it: a sibling project's harness boots
   `gnome-shell --headless --wayland-display=wayland-copyous-harness` while exporting
   `WAYLAND_DISPLAY` but never a private `XDG_RUNTIME_DIR`, so its nested shell writes into the
   shared runtime dir (`copyous@local/test/headless/up.sh:121`). This project's two harnesses do
   isolate it — proven negatively, the marker's mtime did not move across our 22:35 and 22:44 runs.
   It is gone since the 2026-10-10 logout, which tore that tmpfs down. Fixing the cause means
   editing another project's test scripts, which is outside this brief's boundary, so it is
   reported rather than acted on.
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
10. **D-053 deleted three obsolete pairs and revived nothing.** `License` therefore renders in
    English even though `po/de.po` contains "Lizenz" — it sits on the entry that was obsolete, and
    copying it into the live entry is a translation decision, not a repair. If you think the
    shipped UI should not regress-looking-English, the argument is about who owns the translators'
    text, and the measurement is the `.mo` lookup in VERIFY.md's gettext table.
11. **The catalog guard used to be blind to the schema, and now it is the other way round.** The
    hole was measured rather than assumed — 15 of the 48 strings
    `schemas/*.gschema.xml` asks gettext for were in no catalog, while the template carried their
    pre-Baidu/Youdao wording — and the reason no guard caught it was that the coverage list held only
    the three JS modules. Closed on request in one change (backfill + three assertions), because a
    gate alone would have been red. And the follow-up measurement closed the visibility question:
    `glib-compile-schemas` **2.88.0 has no gettext option** (`--gettext-package=foo` → `Unknown option`,
    exit 1) and the installed `gschemas.compiled` is sha256-identical to a plain compile with no German
    and no recorded domain, while our own code never asks for a schema summary or description at all. So
    these 48 rows cannot change what this fork renders — they are completeness for translators and
    external readers, bought with an empty `msgstr`. Whether a *runtime* consumer translates them is not
    observable here, and that is now a printed limitation: three positive controls all came back void
    (no `de` locale, glibc's `gettext` ignores `TEXTDOMAINDIR`/`LOCPATH`, no
    `gsettings-desktop-schemas.mo` installed) — see VERIFY.md's GSchema section. If you want the 15 rows
    translated too, that is translation work with no visible effect on this platform.
