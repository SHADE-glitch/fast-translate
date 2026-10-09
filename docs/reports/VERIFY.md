<p align="right"><a href="VERIFY.md"><b>English</b></a> · <a href="PLAN.md">Plan</a> · <a href="STATE.md">State</a></p>

# Verification log

Evidence per change, in the order the work happened. Every "ran it" line below was
executed on this machine on 2026-10-09; the command is printed with the result so an
independent reviewer can repeat it instead of trusting the wording.

Tiers: **L0** `npm test` · **L1** `npm run integration` / `npm run perf` (throwaway
headless shell) · **L2** real session (needs logout) · **static** read from source.

## C1 — dictionary enrich: sent at all, and reachable from teardown

### Red states, in the order they appeared

| # | Command | Output | What it proved |
|---|---|---|---|
| 1 | `node test/teardown-guard.test.js` (after adding two steps to `MUST_BE_GUARDED`, before implementing) | `exit=1`, `AssertionError: step not found in destroy(): GLib.Source.remove(this._enrichWatchdogId)` | the new guard can fail; the leak was real |
| 2 | `npm run integration` | `Test response: (true, …"Enrich teardown: watchdog id is not recorded on the indicator")` | the enrich never reached the point of arming a watchdog — i.e. **the feature never sent a request** |
| 3 | `node test/unit.test.js` (spec-completeness assertion added first) | `exit=1`, `Google spec must carry its own HTTP method: … got undefined` | the root cause, pinned at L0 |

### Root-cause measurement, outside then inside the chain

```bash
gjs -m /tmp/ft-enrich-probe.mjs
# spec keys : url,body,contentType        (before the fix)
# spec.method : undefined
# throw : Expected type string for argument 'method' but got type undefined
# → Soup.Message.new throws, the caller's catch swallows it, nothing is sent

gjs -m /tmp/ft-enrich-probe.mjs
# spec keys : url,method,body,contentType,headers   (after the fix)
# spec.method : "POST"
# message : built
```

Why the feature was believed to work: D-028's `Evidence` measured a standalone
`Soup.Session` probe that supplied its own method. The shipped path never got there.
Per `CHANGELOG.md` convention that entry is left as written — it was true of the probe
as of its commit — and the correction is recorded as D-029.

### Green states

| Command | Result |
|---|---|
| `npm test` | exit 0; `destroy() totality tests passed (9 guarded, 2 intentionally bare, body at extension.js:1338)`; signing known-answers match; prefs layout validates |
| `npm run integration` | exit 0, `Test response: (true, "{"success":true}")`, `✅ Programmatic integration tests passed successfully!` |
| `npm run check:log` | exit 0 — `31 entries, 27 distinct commit(s) cited`, PASS |
| `sha256sum ~/.config/dconf/user` before and after all three integration runs | identical (`05a22fed…`) — the zero-write property held |

Test 3i is behavioural, because **`GLib.source_exists` is not bound in GJS** (measured:
`typeof GLib.source_exists === 'undefined'`, and `MainContext.has_source_by_id` is not
available either). It therefore proves liveness by whether the 6 s watchdog callback
fires: control enrich → `fired === 1`; enrich then `destroy()` → `fired === 0` and the
recorded handle cleared. Both halves run in the same pass, so a vacuous pass is not
possible.

## C1 side effect — the harness verdict was wrong (D-031)

| Step | Result |
|---|---|
| `npm run integration` with a fully passing suite | **exit 1**, while printing `success:true` and the pass banner |
| Minimal repro: `set -euo pipefail` + EXIT trap whose first command is `false` | `status=1`; with `false || true` → `status=0` |
| `command -v rm` vs `/bin/rm --version` | PATH `rm` is a gio trash wrapper — `rm -rf /tmp/ft-rmtest` printed `Trashing on system internal mounts is not supported` and left the directory (`STILL-THERE`); `/bin/rm -rf` removed it (`gone`) |
| After the fix, same integration run | exit 0, and no new `/tmp/ft-integration.*` tree |

Seven scratch trees remain under `/tmp` from earlier runs today (timestamps 11:57–13:40,
all predating this change). They are not mine to delete and were left in place; they cost
disk only, and `/tmp` clears at the next boot.

## C2–C5 — swap delegation, provider registry, no main-thread stat, JS↔CSS contract

| # | Step | Result | What it proved |
|---|---|---|---|
| 1 | `npm test` after the call-site list was written, before delegating | `# pass 6 / # fail 1` — only `swapLanguages` unsatisfied | the guard enters the branch it claims to guard (D-032) |
| 2 | `node --test test/unit.test.js` after asserting PROVIDERS declares `credentialGroup` / `supportsFormatting` | red against the old table shape, then green once all four rows declared them | prefs could not have read metadata that did not exist (D-033) |
| 3 | `gjs -m test/prefs-validator.js` right after `prefs.js` gained its sibling import | `Unable to load file from: file:///tmp/translation-helper.js` | a *validator* defect, not a prefs defect: it writes the runner outside the source tree, so relative specifiers must be rebound to absolute `file://` URLs |
| 4 | `node --test test/repo.test.js` with a real `probe.query_exists(null)` injected into `_get_icon()` | `# pass 10 / # fail 1` | the stat guard measures code (D-034) |
| 5 | Same guard, same sentence inside a `//` comment line | `# pass 11 / # fail 0` | and does not mistake the fix for the defect — the reason `srcCode()` exists |
| 6 | Geometry guard, three separate CSS-only mutations: `width: 650px`→`700px`, dark `border: 1px`→`2px`, `spacing: 16px`→`12px` | one `not ok` each: `the width the warning is measured at…`, `both variants give the card the same border`, `CHROME is the sum of the declarations it cites` | each assertion fails for the reason it names, and the message carries both arithmetic sides (D-035) |
| 7 | Control: `min-width: 600px` added to the same card rule | green | the declaration reader does not let `min-width` answer for `width` |
| 8 | `npm run check:log` between the C2 commit and its record | **FAIL** — `1 commit(s) touched production code but no entry cites them: 1d44c07` | the record gate bites, unprompted; writing D-032 made it PASS |
| 9 | `gjs -c` micro-benchmark of the removed call (warm cache) | single `query_exists` ≈ 2.9 µs; the pair per theme refresh ≈ 5.8 µs | the honest size of C4 — `chore`, not `perf` |

### Green states for this batch

| Command | Result |
|---|---|
| `npm test` | exit 0 — `# pass 14 / # fail 0` across 5 describes, signing known-answers match, `✅ Preferences layout validation successful!` |
| `npm run integration` | exit 0, `Test response: (true, "{"success":true}")` — run with C2, C3 and C4 all in the tree, so the panel-icon path, `onSwap` and the enrich teardown were all exercised in a real shell |
| `npm run perf cost` | exit 0; `window#20built` 7830 µs/window, `cache#200inserts-x-2000chars` 4.8 ms wall (+236 KB), `clipboard#500events-syncpart` 1 tick / 6.4 ms; RSS after 20 enable/disable cycles 239640 KB against 237988 KB idle-with-extension |
| `npm run check:log` | exit 0 — `35 entries, 30 distinct commit(s) cited` over 29 code-touching commits |
| `sha256sum ~/.config/dconf/user` immediately before and after `npm run perf cost` | identical (`1478d718…`, measured 18:06–18:12) — zero-write holds for this round's runs |

`~/.config/dconf/user` is written by the live session continuously, so **`1478d718…` is a
timestamped observation, not a baseline**: it had already moved to `c6e4261…` by 18:18 with
no harness run in between. The claim that survives is the *pair* — same value immediately
before and immediately after one of our runs — so always capture both sides in the same
command, and never compare against a hash recorded in an earlier hour.

### Two environment observations, both pre-dating this batch's runs

- `/run/user/1000/gnome-shell-disable-extensions` exists with mtime **17:53:46**, while
  this batch's nested shell started at 18:04:59 and gets a private `XDG_RUNTIME_DIR`.
  The tripwire printed its warning because the marker is in the *shared* runtime dir;
  this harness cannot have written it there, and at that point nothing in the journal
  accounted for it either. **That last clause is now corrected**: re-read the journal for
  the window (`journalctl --since 18:40 --until 21:00`) and 16 nested shells
  `gnome-shell --headless --wayland-display=wayland-c…` appear, at 18:47:03 and 20:46:24
  among them, and the marker's mtime has moved to **20:46:23.650** — the prefix is
  `wayland-copyous-harness`, whose `test/headless/up.sh:121` exports `WAYLAND_DISPLAY` but
  never isolates `XDG_RUNTIME_DIR`. This harness was re-checked the same way: the marker's
  mtime did not move across the 22:35 and 22:44 runs. The file lives in a tmpfs torn down at
  logout, and it is another project's boundary, so it stays in place.
- `~/.config/dconf/user` moved from the `05a22fed…` baseline recorded under C1 to
  `1478d718…` (mtime 17:57:21), also before this batch's harness runs. Attribution
  unknown; what is proven is that *these* runs do not write it, by immediate
  before/after equality.

## P — privacy and settings batch (D-036…D-043)

Two code commits: `b4e4c77` (schema defaults, the two new repo guards, the `messages.pot`
backfill) and `d2a2266` (per-provider disclosure, restore/clear rows, the Escape switch,
About rows, the helper's `host` field, the rewritten prefs validator).

### Red states, in the order they appeared

| # | Command | Output | What it proved |
|---|---|---|---|
| 1 | `node test/repo.test.js` with the defaults guard written before the schema was flipped | `expected: true / actual: false` (`notifications`) | the copy in `prefs.js` really did contradict the shipped default (D-036) |
| 2 | Same guard, `floating-background-toast` still true | `expected: false / actual: true` | the background row promised silence while the default toasted (D-037) |
| 3 | `gjs -m test/prefs-validator.js` after adding an `AdwEntryRow` subtitle | `TypeError: No property subtitle on AdwEntryRow` | the "six key rows need plain-language subtitles" item is **impossible** on this binding, not merely declined — prose moved to group `description` |
| 4 | Same validator, rows collected via `get_css_classes().includes('row')` | `expected 7 restore/clear rows, got 0` | the collection was wrong, not the UI: rows are found by `get_name()` |
| 5 | Same validator, one activation pass over all seven rows | `11 reset(s) recorded, expected 7` | **my assumption was wrong, the implementation was right** — section rows reset per click, credential rows arm once. Rewritten as two passes |
| 6 | `node test/unit.test.js` once the `host` cross-check was written but `PROVIDERS` had no such field | red at the declared-host assertion | the disclosure would have been trusting a string nobody produced (D-038) |
| 7 | The catalog guard's first version, which also asserted locale completeness and stale-msgid removal | red demanding bulk edits to `po/de.po` / `es.po` / `nl.po` | a guard that demands someone else's translations be rewritten is scoped wrong; re-scoped to pot⊇sources + locale orphans |

### Re-provoked today, after both commits landed

| Mutation (all reverted) | Result |
|---|---|
| schema `notifications` true→false, run alone | RED `expected: true / actual: false`, then restored byte-identically |
| schema `floating-background-toast` false→true | RED `expected: false / actual: true` |
| CDATA default `[['Escape']]`→`[['']]` | RED, `actual: "<![CDATA[['']]]>"` |
| no mutation (control) | GREEN |
| one msgid renamed inside `po/messages.pot` | RED (catalog coverage), then restored |
| the **unmodified** shipped `test/repo.test.js` run in a scratch tree whose three sources were empty | RED `only 0 msgid(s) extracted — the _() matcher stopped working, so this guard is checking nothing` — the anti-vacuity floor, `# pass 3 / # fail 13` (12 of those are the empty sources themselves, not defects) |
| `test/unit.test.js` run against a scratch copy of `translation-helper.js` with all four `host:` fields stripped | RED `every provider must declare a host, even if only to say it has none` (`test/unit.test.js:228`); the real helper back in that slot → GREEN |

After the first two attempts the schema and `po/messages.pot` were verified unchanged:
`git status --porcelain` lists only the five markdown files this batch edits.

One method trap, found by a **false green**: the scratch provocation was first built with
`ln -s` for the test file. Node resolves the entry module's symlink to its real path, so
`../translation-helper.js` pointed back at the production file and the "stripped" helper was
never read — the run reported `exit=0`. Rebuilt with a real copy of the test file, it goes
red as intended.

### Green states for this batch

| Command | Result |
|---|---|
| `npm test` | exit 0 — unit, teardown guard, `test/repo.test.js` across **7** describes, signing cross-check, and `✅ Preferences layout validation successful! (4 providers rendered)` |
| `npm run integration` | exit 0, `Test response: (true, "{"success":true}")`, `✅ Programmatic integration tests passed successfully!` — re-run after both commits, because `translation-helper.js` is imported by `extension.js` |
| `sha256sum ~/.config/dconf/user` immediately before and after that run | identical (`f0a24a19…`) — zero-write holds for this batch too |
| `npm run check:log` | exit 0 — `43 entries, 32 distinct commit(s) cited` over 30 code-touching commits, PASS |
| `npm run perf cost` | exit 0, re-run earlier in this batch (before the record edits): no degradation attributable, and nothing in it moved a hot path |

## po — locale sync, dead entries, translator hints (after the P batch)

Maintainer's instruction: "补 de/es/nl 的 91 条新串". Measured first, because the 91 was not
one kind: **86** strings the sources still request, and **5** dead template entries this fork
had created itself (`git show b4e4c77^:po/messages.pot | grep -cF …` = 0 for all five, i.e. they
came in with that commit and were orphaned by the next one). The 86 went in with empty
`msgstr`; the 5 were deleted from the template. No translation text was authored.

### Red states, in the order they appeared

| # | Step | Result | What it proved |
|---|---|---|---|
| 1 | First transform, then an independent re-measure | references pointing at comment lines (`Cancelled` → `extension.js:1072`, a sentence in a comment, not the call at `:1262`); all live refs shifted by a constant-ish amount | line numbers had been taken from the **comment-stripped** source, so stripping itself moved them. Reverted with `git checkout -- po/` (proved: `git diff --stat po/` empty) and re-run against original line numbers |
| 2 | Same script, wrapping a long msgid by hand | 16 msgids per locale decoded to text with the spaces eaten ("the translation service" style concatenation) | gettext joins adjacent string literals **without** inserting a space; a hand-rolled split at word boundaries destroys the text. Reverted, and the locales now copy the template's msgid lines verbatim |
| 3 | Hint guard written before the hints were copied (`node test/repo.test.js`) | `# pass 27 / # fail 4` — `13 "Translators:" comment(s) never reached po/messages.pot` plus one per locale | the new assertions enter the branch they claim: the catalogs genuinely had no `#.` lines (`grep -cE '^#\.' po/*.po` = 0) |
| 4 | Hints written with prefix `#.` instead of `#. ` | guard still red, and the file showed `#.fallback provider name…` | `#. ` requires the space; the guard refused to accept its own output. Reverted from the pre-hint backup, wrapper fixed, re-run |
| 5 | Coverage guards, run after the locale sync but before the hints | `ok - po/de.po carries every string the sources translate` (and es, nl) | today's sync is what makes them green; had the sync been wrong they would have gone red with a named msgid list |

### Green states

| Command / measure | Result |
|---|---|
| `node test/repo.test.js` | exit 0, `# pass 31 / # fail 0` (was 22 — +3 locale coverage, +4 hint assertions) |
| `npm test` | exit 0, prefs validator still `✅ … (4 providers rendered)` |
| `npm run check:log` | exit 0 — 43 entries, 32 commits cited (`po/` and `test/` are not in `CODE_PATHS`, so no new entry is forced yet; the record for this work waits on its commit) |
| Independent coverage measure | pot: 115 live strings, 0 missing; each locale: 189 entries, `live-missing=0`, `orphans=0` |
| Independent reference measure | pot live-entry refs: 119 exact / 0 stale. Locales: the 89 tokens on appended entries exact; 38 tokens on 27 upstream-era entries still stale **by deliberate non-edit** — recorded in open-items §3 |
| `diff` against the pre-hint backup | 0 removed lines in each locale: 17/56/17 translations byte-preserved, `msgid`/`msgstr` counts unchanged at 190 each |
| `#.` accounting | 13 hint lines + 12 wrapped continuations in each of the four files |

One measurement trap worth keeping: `grep -c '^#. '` with an **unescaped** dot matches every
`#: ` line too, so a correct catalog briefly read as carrying 317 hints. Escape the dot
(`grep -cE '^#\. '`) before concluding anything from a count.

## St facts measured — `text-align` values and the scrollbar width

`test/eval-test.js` Test 5 is the instrument. It reports the raw readings into the result JSON
and asserts only what has been seen.

| Measurement | Reading | How it is known to be a measurement |
|---|---|---|
| `StThemeNode.get_text_align()` exists | bound, returns `Pango.Alignment` | capability probed first: `['get_text_align','get_length','get_color']` |
| keyword → value | `left` 0, `center` 1, `right` 2, **`start` 0**, **`end` 0** | `center`/`right` are the controls proving the reader separates values |
| unknown keyword | `banana` → 0 | so `start`→0 is "mapped to LEFT / not honoured", not a distinct semantic |
| under `text-direction = RTL` | `left` 0, `start` 0, `end` 0 | direction changes nothing → **not direction-relative** |
| scrollbar withheld width | synthetic 300 → **292** = 8 px | control: same box, `vscrollbar_policy: NEVER` → 300 (nothing withheld) |
| same on the production card | dest label 650 → **642** = 8 px | the pair is asserted equal (`cardStolen === synthStolen`), so the two paths share the number |
| `St.ScrollView` API in this binding | only `add_child`, `set_child`, `get_child`, `get_width`, `get_height`, `get_children`, `get_theme_node` | an earlier run proved `get_vscrollbar()` and `get_allocation()` are absent (`missing:true`, then `w._destScroll.get_allocation is not a function`) — which is why the width is measured as an *effect* |

### Red states, each provoked deliberately

| Provocation | Result |
|---|---|
| bound tightened `synthStolen > 16` → `> 4` | exit 1 — `a vertical scrollbar withholds 8px, more than SCROLLBAR_ESTIMATE (16) covers: _measureActor would predict the wrap too wide and the pinned height would clip the last line` |
| alignment comparison flipped to `===` | exit 1 — `text-align start/end changed behaviour: start gives 0 under LTR and 0 under RTL, an unrecognised keyword gives 0, right gives 2…` |
| both restored, final run | exit 0, `✅ Programmatic integration tests passed successfully!`, dconf identical before/after (`291c5f98…`), numbers reproduced unchanged |

Two instrument failures worth keeping, because each produced a wrong first answer:

- `synth.add_actor is not a function` — the probe assumed the old `St.ScrollView` API; production
  only ever calls `add_child`/`set_height`, and that is what works.
- `St.Label` has **no** first child (`firstChild: null`), so the alignment reading had to come
  from `get_clutter_text()` — the handle production already uses at `extension.js:1562`.

A file-correction during this work: while repositioning the probe, a `node -e` script wrote
`[head, ...tail].join("\n")` (a nested array), which comma-joined `test/eval-test.js` into a
single line. Recovered with `git checkout -- test/eval-test.js` (1538 lines, `node --check`
clean) and the probe was re-applied as one edit. Nothing else in the repo was touched — and the
file contained no uncommitted work of the maintainer's.

## Post-comment verification, and one forensic method retired

The St batch left one claim unverified: `extension.js` had gained a comment-only edit (the block
above `SCROLLBAR_ESTIMATE`), and a comment in the live extension file is not something `npm test`
can judge — only a real shell loading it settles that.

| Command | Output | Reading |
|---|---|---|
| `npm run integration` at 22:35 | `📊 Test response: (true, "{\"success\":true,…` then `✅ Programmatic integration tests passed successfully!` | the edited file loads in a nested shell and the suite, Test 5 included, is green |
| `npm run integration` at 22:44, with both digests taken **inside the same command** | `exit=0`; `sha256sum ~/.config/dconf/user` → `291c5f98…` before and after; `sha256sum extension.js` → `8773f1ed…` before and after | zero-write holds for this tree, and the harness did not rewrite the file it was testing |
| `grep -cE 'apikey\|secret\|appid'` over that run's log | 3, all of them `org.freedesktop.secrets` D-Bus chatter; no settings value present | the run log is fit to sit on disk |

**The method that run nearly used is now forbidden.** A before/after pair can be taken two ways:
hash the store, or print it. One ad-hoc pair this round was taken by printing, which for this
schema means printing `apikey`, `baidu-appid`/`baidu-secret`, `youdao-appid`/`youdao-secret` and
`url` into whatever file the run is redirected to. Whether a value actually landed on disk is
**no longer checkable** — the scratch files of the round were deleted, and reading the key back in
order to search for it would break the very rule at issue — so nothing is claimed here in either
direction about a leak. What is claimed is the instrument rule: an *unchanged* property is proven
by a digest, never by contents. It ships as a guard, not as advice.

| Guard | Red, provoked | Green control |
|---|---|---|
| `no script prints a settings value` | scratch copy of the repo (`tar`, no `.git`, entry module a real file): one executable `dconf dump /org/gnome/shell/extensions/fast-translate/` in `test/integration.sh` → `not ok 4 — a probe reads the settings store only as a hash`, message naming the file; separately one `gsettings get … apikey` in `test/perf-probe.sh` → the same, naming that file | the *same two lines* prefixed with `#` → 33 pass / 0 fail (the guard reads code, not prose); tree restored → green |
| `the scan covers the harness scripts it is about` | same method, deleting `test/perf-probe.sh` from the copy → `the scan saw 20 executable file(s) and covers integration.sh=true, perf-probe.sh=false` (32 pass / 1 fail) | tree restored → 33 pass / 0 fail |

## Not verified

- **L2 / needs you**: the dictionary card on a real ZH→EN word — this is the first time
  the reverse lookup can actually reach the network, so its *visible* effect has never
  been seen by anyone. Logout/login is required (`scripts/reload.sh` cannot re-import
  edited ES modules).
- `npm run perf cost` **was** re-run this batch (row 4 above): C4 changes when a stat
  happens, not steady-state cost, and the measured 5.8 µs per theme refresh is inside the
  noise floor of every probe in that table — which is precisely why it is recorded as
  `chore`.
- **The settings window has never been seen by a human since C3, and still hasn't.** What
  covers it now is stronger than "does not throw" — the validator renders all four providers
  and asserts the disclosed hostname, the seven restore/clear rows and the Escape transitions,
  under a mocked `Gio.Settings` — but three of those assertion groups have not been provoked
  red (see the table above and `docs/maintenance/verification.md` §3), and a mock accepts key
  names the real schema may not have. Which group is visible for each of the four enum values
  is L2, and so is whether the DeepL-only formatting rows appear exactly for DeepL, whether a
  reset row looks right, and whether the notification on a background failure reads well.
- **New in this batch, L2 only:** that `notifications` defaulting to true actually reaches the
  user as a failure notice rather than a stray toast, and that the disclosure line is legible
  on a narrow window (it is a long composed sentence).
- **The panel icon's appearance after C4 is L2.** Integration constructs the indicator and
  sets the gicon in a real shell, so a missing file or a bad path would fail there — but
  "the active icon looks right in light and dark" is only checkable by eye.
- Baidu and Youdao are still never exercised end to end (no credentials).
