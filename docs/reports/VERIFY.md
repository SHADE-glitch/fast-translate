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

## Not verified

- **L2 / needs you**: the dictionary card on a real ZH→EN word — this is the first time
  the reverse lookup can actually reach the network, so its *visible* effect has never
  been seen by anyone. Logout/login is required (`scripts/reload.sh` cannot re-import
  edited ES modules).
- `npm run perf` not re-run: nothing in this batch changes steady-state cost; the enrich
  now costs one extra Google round trip per Chinese word lookup, which is network-bound
  and invisible headless.
- Baidu and Youdao are still never exercised end to end (no credentials).
