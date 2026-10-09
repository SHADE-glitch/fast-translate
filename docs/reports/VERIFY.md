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
| `sha256sum ~/.config/dconf/user` immediately before and after `npm run perf cost` | identical (`1478d718…`) — zero-write holds for this round's runs |

### Two environment observations, both pre-dating this batch's runs

- `/run/user/1000/gnome-shell-disable-extensions` exists with mtime **17:53:46**, while
  this batch's nested shell started at 18:04:59 and gets a private `XDG_RUNTIME_DIR`.
  The tripwire printed its warning because the marker is in the *shared* runtime dir;
  this harness cannot have written it there, and nothing in the journal accounts for it.
  The file lives in a tmpfs that is torn down at logout, so the exposure is a shell
  restart inside this login session. Left in place — removing files outside the repo is
  not this project's to do unasked.
- `~/.config/dconf/user` moved from the `05a22fed…` baseline recorded under C1 to
  `1478d718…` (mtime 17:57:21), also before this batch's harness runs. Attribution
  unknown; what is proven is that *these* runs do not write it, by immediate
  before/after equality.

## Not verified

- **L2 / needs you**: the dictionary card on a real ZH→EN word — this is the first time
  the reverse lookup can actually reach the network, so its *visible* effect has never
  been seen by anyone. Logout/login is required (`scripts/reload.sh` cannot re-import
  edited ES modules).
- `npm run perf cost` **was** re-run this batch (row 4 above): C4 changes when a stat
  happens, not steady-state cost, and the measured 5.8 µs per theme refresh is inside the
  noise floor of every probe in that table — which is precisely why it is recorded as
  `chore`.
- **The settings window has never been seen by a human since C3.** `prefs.js` now derives
  group visibility from `PROVIDERS` instead of `service === 0/2/3`; what proves that is
  the layout validator (`fillPreferencesWindow()` does not throw, under a mocked
  `Gio.Settings`) plus the L0 registry assertions. Which group is visible for each of the
  four enum values is L2, and so is whether the DeepL-only formatting rows appear exactly
  for DeepL.
- **The panel icon's appearance after C4 is L2.** Integration constructs the indicator and
  sets the gicon in a real shell, so a missing file or a bad path would fail there — but
  "the active icon looks right in light and dark" is only checkable by eye.
- Baidu and Youdao are still never exercised end to end (no credentials).
