<p align="right"><a href="cost-measurement.md"><b>English</b></a> | <a href="cost-measurement.zh-CN.md">简体中文</a> · <a href="../../MAINTENANCE.md">Handbook</a></p>

# Power and leak measurement, fixed method

The procedure and the numbers are kept together deliberately: a cost claim
without the sampling rules that produced it is not re-checkable, and a baseline
nobody can reproduce is decoration. Split out of `MAINTENANCE.md` §5 and §7.

## 1. What `npm run perf` runs

`test/perf-probe.sh` boots a throwaway `gnome-shell` on a private Wayland display
and a private bus, arms the extension in-process, then drives
`test/perf-probe.js`. `test/perf-summary.js` prints the JSON afterwards.

- Phases: `npm run perf cost` (per-event cost, ~2 min), `idle` (CPU/RSS
  attributable while nothing happens, ~4 min), `all` (default, ~5 min).
- The phase selector is the environment variable `FT_PERF_PHASES`. The shell
  variable `PHASES` alone is only input to the wrapper — that mismatch once made
  every run silently execute `all` and overrun the cost budget.
- Artifacts land in `~/.cache/fast-translate-perf/`; `result.json.phase` is
  written at every stage boundary, so an interrupted run tells you the last
  phase it reached (`last-phase.txt` is copied out for that reason).

## 2. The isolation recipe — mandatory, and shared

Both `test/integration.sh` and `test/perf-probe.sh` use the same recipe. **If the
recipe changes, change it in both.**

```
dbus-run-session  +  GSETTINGS_BACKEND=memory  +  XDG_DATA_HOME=<tmp>/data (symlink to this repo)
XDG_RUNTIME_DIR=<tmp>/runtime  +  --headless --wayland-display=wayland-<unique> --unsafe-mode
```

- `dbus-run-session` alone is **not** isolation for writes: dconf writes are
  served against the real `XDG_CONFIG_HOME` and land in `~/.config/dconf/user`.
  `GSETTINGS_BACKEND=memory` is what makes the run write-free. This is a safety
  property, not tidiness — `eval-test.js` force-sets three keys of this
  extension's schema.
- A private `XDG_RUNTIME_DIR` is not cosmetic either. The shell creates
  `$XDG_RUNTIME_DIR/gnome-shell-disable-extensions` at startup; while that file
  exists a shell crash disables **every** user extension. Leaving it in the real
  `/run/user/1000` puts the live session at risk from a nested test process.
- `--unsafe-mode` (not `--devkit`) serves `org.gnome.Shell.Eval` on GNOME 50; it
  is hidden from `--help-all`.
- Under a memory backend `enabled-extensions` is the schema default (empty), so
  `gnome-extensions enable` cannot reach the nested shell. `test/bootstrap.js`
  drives the shell's own `_callExtensionInit` → `_callExtensionEnable` instead,
  which also loads the stylesheet for real.
- `GIO_USE_VFS=local` — without it GVFS writes `gvfs-metadata` into the
  redirected `XDG_DATA_HOME`, the cleanup `rm -rf` fails, and `set -e` turns a
  passing run into exit 1.

## 3. Recipe traps that already bit once

Each of these produced a wrong result that looked like a correct one:

- A shell **without** Eval answers `(false, ...)` with **exit status 0**. Poll
  the reply for `(true,`; testing the exit code reports success immediately and
  then silently drives a different process.
- `ExtensionState`: `ACTIVE 1, INACTIVE 2, ERROR 3, OUT_OF_DATE 4, INITIALIZED 6`.
  `INITIALIZED` means the object exists but `extension.js` has **not** been
  imported, so `stateObj` is undefined. `createExtensionObject` does not set
  `state` at all, so polling `lookup(uuid)` for truthiness is not enough — poll
  `state !== undefined`.
- `enable()` defers the indicator to a `PRIORITY_LOW` idle callback. Reading
  `Main.panel.statusArea[UUID]` straight after `enable()` returns is what made a
  probe report "panel button vanished".
- Never write an unescaped apostrophe inside the `bash -c '...'` body: it ends
  the string and the remainder runs in the outer shell. That happened once and
  surfaced as a nonsense `trap: usage`.
- After a run, check for leaked nested shells: `pgrep -af 'gnome-shell --headless'`.
  Each holds ~230 MB and a few percent of a core, which will also distort your own
  measurements.

## 4. Sampling rules that make a number mean something

- **1 tick = 10 ms** of main-thread CPU (USER_HZ is 100 on Linux). Ticks, not
  wall time, carry the claim in this environment: a deferred idle can be
  scheduled minutes later and land inside the same window.
- `/proc/self/stat` fields 14+15 must be split **after the last `)`** — the comm
  field may itself contain spaces and parentheses.
- `VmRSS` from `/proc/self/status` is the primary memory read;
  `/proc/self/statm` × 4 KiB is the fallback.
- `System.gc()` **burns main-thread CPU**, so it belongs to the memory sampler
  only. gc-ing inside a tick window invented load — a 21 ms window once read as
  a real cost.
- Single before/after windows are biased by startup drift. The idle phase
  therefore alternates disabled/enabled/disabled/enabled over 30 s windows, and
  every state transition waits for the panel button so a window is measured in
  the state it claims.
- Settle must be **symmetric** around a cycle loop (`SETTLE_MS = 6000` on both
  sides). An earlier run reported a suspicious `+3 MB` leak purely because the
  settle was 6 s before and 4 s after.
- A cycle loop must **start from a known disabled state**: right after boot the
  extension is already enabled, so a first `setEnabled(true)` is a no-op and
  measures nothing.

## 5. Measured cost baseline

`npm run perf`, GNOME 50.1, isolated headless shell, 2026-10-01. **Headless is
software-rendered on a virtual monitor: absolute values do not transfer to a real
session.** Only the relative claims survive. 1 tick = 10 ms of main-thread CPU.

| Event | Measured |
|---|---|
| boot: import + construct | 2–3 ticks, ~21 ms wall |
| boot: stylesheet load + `enable()` | 2 ticks, ~22 ms wall |
| warm enable (incl. the deferred idle) | 4–11 ticks, 61–79 ms wall |
| disable | 1–2 ticks, 11–28 ms wall |
| build one `FloatingTranslationWindow` | 4.83–4.86 ms |
| translation LRU at budget (200 inserts × 2 000 chars) | settles at `size=50`, 125 350 chars, **+108…236 KB** |
| one clipboard event (synchronous part) | 10–22 µs |
| idle CPU | see below |

- **No leak across enable/disable.** 20 cycles, sampled every 5: `+4088 KB` at 5,
  then `2660 / 2448 / 2908 KB`, and absolute RSS at 20 cycles is *lower* than at 5.
  That is allocator arena saturation, not a linear leak.
- **Idle CPU is at the resolution limit.** Two runs of the alternating 4 × 30 s
  A/B/A/B windows: one gave `enabled - disabled = +4.0 ticks` (in-group spread 1),
  the other `+0.5` (spread 2). Honest statement: **0 – 0.13 % of one core**, not
  consistently separable from the shell's own floor. Earlier wording of
  "measured as zero" overstated it.
- **Idle RSS is not separable** either: after gc, enabled vs unloaded was
  `+1792 KB` in one run and `-28 KB` in the other.

## 6. What headless cannot measure

Not measurable here, and they dominate what you actually feel: the
`Clipboard.get_text()` Wayland round trip per copy, and the provider's network
RTT. Anything about real rendering cost, animation, or compositor interaction is
also out of scope — headless uses a virtual monitor and software rendering. So a
claim about perceived latency belongs to the live-session checklist, not to this
file.
