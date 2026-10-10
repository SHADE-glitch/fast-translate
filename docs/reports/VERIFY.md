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
| `diff` against the pre-hint backup | 0 removed lines in each locale: 17/56/17 translations byte-preserved, `msgid`/`msgstr` counts unchanged at 190 each — **the 56 was a `grep` undercount**, corrected below: `msgfmt --statistics` reads es as 34 translated + 29 fuzzy = 63, because `grep -c '^msgstr "[^"]'` misses every entry whose `msgstr` wraps |
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

## L2 — the 2026-10-10 restart

The maintainer restarted the session (07:47:18), so the committed code was loaded for the first
time in a real shell. What the live machine answered:

| Probe | Output | Reading |
|---|---|---|
| `pgrep -x gnome-shell` + `ps -o lstart=` | one process, pid 367241, started `Sat Oct 10 07:47:18 2026`, `--mode=ubuntu` | the shell really restarted; a new process means a new module cache |
| `/run/user/1000/gnome-shell-disable-extensions` | `No such file or directory` | the safe-mode marker is gone after logout/login (the tmpfs is torn down) |
| `gsettings get org.gnome.shell enabled-extensions` | contains `'fast-translate@local'` among 11 uuids | the extension is enabled in the live profile |
| `GetExtensionInfo(fast-translate@local)` | `'name': 'Fast Translate'`, `'version': <16.0>`, `'state': <1.0>`, `'error': <''>` | **the running code is the committed code** (version 16 = `13d40b0`'s `metadata.json`), and the shell reports it ACTIVE with no error |
| `GetExtensionErrors(fast-translate@local)` | `(@as [],)` | the shell's own error collector holds nothing for this uuid |
| calibration of `state` | 9 enabled uuids (incl. ours) → `state=1`; 5 installed-but-disabled (`ubuntu-dock@ubuntu.com`, `tiling-assistant@ubuntu.com`, `snapd-*`, `web-search-provider`) → `state=6`; a misspelled uuid → D-Bus error | `1` = ACTIVATED was *read off the machine*, not inferred from the enum's name |
| `journalctl _PID=367241` | 111 lines total, **0** matching `JS ERROR\|Gjs-CRITICAL\|Crash`, 0 mentioning `fast-translate` | error-free load; the 0 is not vacuous because the PID's own log density was printed |
| `UserExtensionsEnabled` property | `true` | live counterpart of the marker concern — safe mode was not entered |

**One instrument failed and one worked, and both outcomes are now documented.**

- `org.gnome.Shell.Screenshot.Screenshot` → `AccessDenied: Screenshot is not allowed` on GNOME 50;
  `gnome-screenshot`, `grim`, `wf-recorder`, `spectacle` are all absent. So an agent cannot see
  pixels here, and every visual verdict stays with the maintainer.
- `Atspi-2.0.typelib` + the a11y bus **does** work as a pixel-free reader: it dumped another
  extension's live prefs window completely (`[frame] "Burn-My-Windows 48"`, 402 nodes, with
  `visible=`/`showing=` per row). Our own window was refused at first — the prefs host
  `org.gnome.Shell.Extensions` allows one dialog, so while that other window was up both
  `LaunchExtensionPrefs` and `OpenExtensionPrefs` answered `Already showing a prefs dialog`.
  The other dialog closed on its own by 08:14 and **our window then opened and was read in full**
  (see below), so this instrument does reach our own UI. Killing the other extension's host
  process was proposed and refused by the permission layer — correctly: that window is the
  maintainer's, and a shared host would take his other dialogs down with it.

**One test was declined on purpose.** The double-copy trigger (`extension.js:299-360`: same text
copied twice inside 50 ms–2 s) is fittable from a shell with two `wl-copy` calls, but this session's
clipboard held `chromium/x-source-url`, `chromium/x-internal-source-rfh-token`, `text/html` and
`text/plain`, and `wl-copy` can restore `text/plain` only. Destroying a browser-internal token to
collect an assertion the maintainer can supply with one keystroke is the wrong trade, so the popup's
visual half stays a human step.

**Also observed, not ours:** a *concurrent* session on this machine was running `dconf write` and
`dconf reset -f` against `/org/gnome/shell/extensions/notification-grouper/` (pid 387264, seen at
07:54). That is a direct, witnessed mechanism for the "`~/.config/dconf/user` moves on its own"
observation recorded above — any baseline taken on this machine can be moved by a sibling session
within seconds.

**Live settings, read by key name** (never `gsettings list` on this schema — §3 of
`docs/maintenance/verification.md`): `notifications=true`, `floating-background-mode=false`,
`floating-background-toast=false`, `show-panel-icon=false`, `shortcut-enabled=false`,
`darktheme=false`, pair `Chinese (ZH)` → `English American (EN-US)`, service `DeepL`. What that
implies for the smoke list: the background-failure leg cannot be exercised at all while
`floating-background-mode` is false (nothing runs in the background to fail), the panel-icon leg is
hidden by his own setting, and the trigger is clipboard-only — which is exactly the path this pass
declined to fake.

**Our own prefs window, read out of the live session (08:14, service = DeepL).** 256 nodes:
52 labels, 18 switches, 4 combo boxes, and every row `visible=true showing=true sensitive=true`.

| What the L1 mock had been asserting | What the real window actually rendered |
|---|---|
| the disclosure sentence per provider | `The text you copy is sent to api-free.deepl.com for translation. Its key is entered below. Single words are also sent to clients5.google.com for the dictionary.` — verbatim, on the `Translation Service` row |
| the credentials-group warning | `The API key below is secret; the URL above is not. Both are stored on this machine in plain text.` |
| four restore rows, counts per section | `Restore this section’s defaults` × 4, each with its own count: `Resets 4 / 2 / 3 / 3 settings in this section. Keys are never touched.` |
| clear rows on the credential groups | `Clear the keys in this section` + `Empties 2 stored fields. This cannot be undone.` — present once, because only DeepL's group is up |
| provider-driven group visibility | the five group titles rendered: `Language Settings`, `DeepL Translation API Configuration`, `Formatting Options`, `Double-Copy Instant Translation`, `System Integration` — i.e. Baidu/Youdao's key groups are genuinely absent for DeepL |
| the Escape switch and its copy | `Close the popup with Escape` + `Escape dismisses the translation popup. Turning this off frees the key for the app behind it.` |
| DeepL-only formatting rows | a `Formality` row labelled `(DeepL only)` is present, matching the live service value |

Two things this readout **cannot** settle: whether the long disclosure sentence *wraps legibly*
(a11y gives text, not geometry), and whether the other three providers' groups appear for their own
enum values — that would mean writing `translation-service` into the maintainer's live profile, which
needs his word. The window was left open on his desktop (closing it means killing a shared prefs
host that also carries other extensions' dialogs, which the permission layer rightly refused).

**All four providers, walked in the live window (08:2x).** `translation-service` was set to each of
the other three enum values in turn, the window re-read, and the value restored and read back
(`'DeepL'`). `GetExtensionErrors` stayed `[]` through every switch, so `_settingsChanged` survived a
live provider change.

| Service | Groups rendered | Disclosure sentence as rendered | Credential fields | Clear row | Restore rows |
|---|---|---|---|---|---|
| DeepL | Language, **DeepL Translation API Configuration**, **Formatting**, Double-Copy, System Integration | `… sent to api-free.deepl.com … Single words are also sent to clients5.google.com for the dictionary.` | URL row + `password text` key row | 1 (`Empties 2 stored fields`) | 4 (`Resets 4 / 2 / 3 / 3`) |
| Google Translate | Language, Double-Copy, System Integration (**no API group, no Formatting**) | `The text you copy is sent to clients5.google.com for translation. It needs no key.` | **none** | **none** | 3 |
| Baidu Translate | Language, **Baidu Translate API Configuration**, Double-Copy, System Integration | `… sent to fanyi-api.baidu.com … Single words are also sent to clients5.google.com …` | `APP ID` + `Secret Key` list items, secret masked | 1 | 3 |
| Youdao Translate | Language, **Youdao Translate API Configuration**, Double-Copy, System Integration | `… sent to openapi.youdao.com … Single words are also sent to clients5.google.com …` | its own two rows | 1 | 3 |

That closes the D-033 L2 question (provider-driven visibility) and the DeepL-only `Formality` row,
for every provider, on the real window — not on the mock.

**A privacy hole the walk found, in my own instrument.** The key row is `[password text]` and was
masked, but one editable node reported the role `text`, and the tool's blacklist was
`entry|password text|password-text` — so that node's accessible *name* was printed. It happened to be
the row title (`"DeepL API URL"`, verified by an exact-match count rather than by printing it), so
nothing leaked. Still, relying on "GTK answers `get_name()` with the label today" is not a control,
so `EDITABLE` now includes `text` and the same window prints two masked nodes and **zero** editable
nodes with quoted content (diff against the earlier dump: exactly one line changed,
`[text]` → `[text] (value not read)`).

**Still open, L2.** Whether the long disclosure sentence *wraps legibly* (a11y carries text and
states, no geometry), the panel icon's look in light and dark (his `show-panel-icon=false`), and the
floating card itself — the shell exposes only window/surface panels on the bus, and the card has
never been observed there. The double-copy trigger stays a human step for the clipboard reason above.

## Packaging — the list, and what a failed run used to leave behind

`pack.sh` had never completed on this machine, and the reason turned out to be two separate
defects rather than one. Both halves are now measured, and both are guarded.

| Probe | Output | Reading |
|---|---|---|
| `bash scripts/pack.sh` **before** the fix | `pack_sh_exit=2`, GLib-GIO-CRITICAL `Failed to execute child process "msgfmt"`, and `/tmp/fast-translate-pack` left holding all 12 staged names | `--podir=po` shells out to `msgfmt`; gettext was absent here **at that time** (installed later the same day — see the gettext round below), so the run died **after** `rm -f *.zip` and **after** staging |
| the same staging into a reused tree, twice, in a `tar` copy | a file removed from the source tree between the two runs was still present in the staging tree (`pack/removed-later.js`) | `cp -r` overwrites same names only — a helper the repo has dropped keeps riding along into the zip |
| `bash scripts/pack.sh` **after** the fix | `pack_sh_exit=1`, the message names `msgfmt`, the temp tree is **not created**, zip count 0→0, `git status` shows only `scripts/pack.sh` | the run now stops before it can destroy or contaminate anything |
| `gnome-extensions pack` in a throwaway tree with this extension's own layout | zip held `metadata.json`, `extension.js`, `prefs.js`, `stylesheet.css` and exactly the two names passed as `--extra-source`; an unlisted root module was absent, and `--extra-source=nope.js` (a name that does not exist) still exited **0** | the auto-include set is four names, not a rule; both silent directions are real, which is what the new guard pins |

The guard (`test/repo.test.js`, "the packaging list ships exactly what the repo has") was provoked
in eight `tar` copies, one mutation each, against an unmutated control copy that stayed green — the
rows are in `docs/maintenance/verification.md` §3. The run worth keeping in mind is `cp -a`: the
staging line reworded by two characters emptied the parsed list, and **two of the content guards
reported green while measuring nothing**. The anti-vacuity floor is what turned that into a red.

## The gettext round — producing the artifact, then reading it back

gettext arrived on this machine 2026-10-10 (`msgfmt (GNU gettext-tools) 0.23.2`), which retired a whole
class of "cannot be run here" statements and let the packaging path be **measured** instead of argued.
Every row below was re-run for this record; the first five were what made D-053 and D-054 necessary.

| Probe | Output | Reading |
|---|---|---|
| `bash scripts/pack.sh` after gettext, before the catalog fix | `gnome-extensions pack` → `Child process exited with code 1`, no zip | The failure moved from "msgfmt missing" to "a catalog msgfmt rejects" — same exit, completely different owner |
| three minimal `.po` files, one variable each (live-only / live+obsolete twin / obsolete revived into the live entry) | `msgfmt -c` exits 0 / **1** / 0 | `msgfmt` counts an **obsolete** `#~ msgid` against a live one as `duplicate message definition`. Not a lint warning, a build failure — and the same one `msgmerge` hits |
| `msgfmt -c -o /dev/null po/{de,es,nl}.po` after `da52508` | `de exit=0`, `es exit=0`, `nl exit=0` | Deleting the `#~` pair (three files, 2 lines + 1 blank each) is the whole repair. Nothing was revived into a live entry, because that is translation work |
| `bash scripts/pack.sh` after the fix | `✅ Packaging complete`, `120343` bytes, `unzip -l` → **39 files** | The first zip this repo ever produced on this machine |
| `unzip -l` + `sha256sum` per member | the 8 root members — `metadata.json`, `extension.js`, `prefs.js`, `signing.js`, `translation-helper.js`, `stylesheet-base.css`, `stylesheet-dark.css`, `stylesheet-light.css` — byte-identical to the repo; `icons/` 18 in → 18 out; `docs/`, `test/`, `scripts/`, root `*.md` and `po/` absent; `schemas/gschemas.compiled` absent while `*.xml` present | D-052's list is what actually ships. Worth naming: there is **no** `stylesheet.css` in this fork, so one of the tool's four auto-included matches nothing and all three stylesheets ride on the explicit list — a fork that renamed a CSS file and forgot the list would ship unstyled and stay green. The compiled schema is **never** packed by the tool even when staged — the installed copies here carry a compiled file whose mtime trails their `.xml` by months, so it is generated locally *(inference from mtimes, not an observation of the compile step)* |
| `msgfmt --statistics -c -o /dev/null po/de.po` (and es, nl) | de 7 translated / 10 fuzzy / 172 untranslated; es 34 / 29 / 126; nl 7 / 10 / 172 — each 189 entries | This is the `.mo`'s real yield, and it replaces every `grep -c '^msgstr "[^"]'` figure previously written down (that read es as 56 because wrapped `msgstr` lines do not start the pattern) |
| extract `locale/` from the built zip, then a real `gettext()` lookup per language | de `About→Info`, `Cancel→Abbrechen`; es `About→Acerca de`, `Cancel→Cancelar`; nl `About→Over`, `Cancel→Annuleren`; `License`, `Translate`, `Preferences` → **unchanged msgid** in all three | The empty-`msgstr` English fallback is no longer an assumption. Note `License` specifically: it is the msgid whose upstream translation sat on the obsolete pair, so the conservative fix leaves it English **by design** until a translator moves the text into the live entry |
| `scripts/update-po.sh -a` | exit 0, but rewrites 417/321/417 lines across the three locales | Usable, not free: the churn is `msgmerge`'s own reflow, so any use of it needs a review of a diff that is mostly noise |
| `scripts/update-pot.sh` | exit 0, and the product turns **five** repository guards red; the `extension.js:1534` `// Translators:` hint disappears; 43 entries per locale become orphans | Regenerating the template is therefore **retired** on this fork, and `test/repo.test.js` remains the thing that keeps the catalogs honest |
| `venv/bin/shexli *.zip` (the last step `pack.sh` runs) | exit **139**, reproduced twice; the zip on disk is complete and valid | A non-zero exit here does not mean a bad artifact. `shexli` 0.2.1 under the venv's Python 3.14.4 is a dependency question, not a code one *(maintainer's call)* |
| `xgettext --from-code=UTF-8 --add-comments=Translators -o - -- *.js schemas/*.xml` vs `po/messages.pot`, `msgcomm` for the intersection | sources request 161, template holds 189, **146 common** → 43 entries nothing requests, **15 requested by the schema and in no catalog** (sample-checked: `Baidu Translate APP ID`, `Show panel icon`, `Close floating window` → 0 hits in de/es/nl each) | The catalog guard's scope is the three JS modules, so the schema's own translatable strings drifted unobserved — and the template still holds their pre-Baidu/Youdao wording. Every guard was green the whole time. Recorded in [open-items.md §3](../maintenance/open-items.md), deliberately not fixed and not gated (a gate would be red until the 15 are backfilled) |
| `git ls-remote origin refs/heads/master` over the new SSH remote | `3f48172…`, exit 0 | The remote was read, not inferred from a local tracking ref. `origin` is now `git@github.com:SHADE-glitch/fast-translate.git` because HTTPS push times out from this host |

Suite state at the end of the round, as printed: `node test/repo.test.js` → `# tests 40 / # suites 9 /
# pass 40 / # fail 0`; `node test/docs-lint.mjs` → 114 links over 24 markdown files; `npm run check:log`
→ 55 entries, 42 distinct commits cited. These three lines are the ones to re-run before quoting them —
they moved within this very pass, because the pass added documents.

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
