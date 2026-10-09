<p align="right"><a href="README.md">README</a> · <a href="MAINTENANCE.md"><b>English</b></a> | <a href="MAINTENANCE.zh-CN.md">简体中文</a></p>

# Maintenance handbook

Operational knowledge for this fork. It is not a user guide — read
[README.md](README.md) for that. Everything below was measured or read out of the
shell on the machine this fork runs on; anything that was not is marked
*(unverified)*.

## 1. Read this first

- **This directory IS the live extension directory**
  (`~/.local/share/gnome-shell/extensions/fast-translate@local`). There is no
  build step and no separate install target: editing a file edits the running
  extension, and a stray file left here can be loaded by the shell. Never run
  `gnome-extensions install` or `gnome-extensions pack` in this directory
  (see [AGENTS.md](AGENTS.md)).
- Priority order for every decision here: **stability > performance > code
  aesthetics.**
- Only target: **Ubuntu 26.04 + GNOME Shell 50.1 + Wayland.** Verified with
  `gnome-shell --version` and `/etc/os-release`, not assumed.

## 2. Invariants — do not "fix" these

| Looks wrong | Why it stays |
|---|---|
| `gettext-domain` is `fast-translate@tazztone.github.io` while `uuid` is `fast-translate@local` | The compiled `.mo` filename must match the domain. Renaming it breaks translations silently. |
| There is no `stylesheet.css`, only `stylesheet-light.css` + `stylesheet-dark.css` | `_loadExtensionStylesheet` tries `${sessionMode}-${variant}.css`, `stylesheet-${variant}.css`, `${sessionMode}.css`, `stylesheet.css` and loads the **first hit**. Only the `-light`/`-dark` names are wired to the live `notify::color-scheme` reload. |
| `shell-version` lists `"45"`…`"50"` | Majors only; see §8. Do not add a major without checking compatibility first. |
| `metadata.json` `url` points at this fork | Deliberate: it is a carried fork of a frozen upstream. |

No prototype monkey-patching, no `imports.ui.*` in extension code, no injected
shell functions, no background timers, no private D-Bus service. That is why the
blast radius of any breakage is this extension alone, never the shell or a
sibling fork.

## 3. Dependencies

Everything is already installed by GNOME; there is nothing to add.

| Dependency | Installed | Used by | If missing |
|---|---|---|---|
| `gjs` | 1.88.0 | host | cannot load |
| `gnome-shell` | 50.1-0ubuntu1.2 | `ui/main.js`, `panelMenu`, `popupMenu`, St/Shell | cannot load |
| mutter 18 (`Clutter-18`, `Meta-18`) | via shell | `Meta.SelectionOwner::owner-changed`, Clutter events/animation | double-copy stops working |
| **`libsoup3`** (`gi://Soup?version=3.0`) | 3.6.6 | every HTTP request | **whole feature dead** |
| GLib/Gio/GObject | 2.x | incl. `compute_checksum_for_string`, `compute_hmac_for_data`, `base64_encode` | Baidu/Youdao signing dies |
| Pango | 1.57.0 | `Pango.WrapMode` only | wrapping breaks |
| GTK4 + libadwaita | 4.22.4 / 1.9.1 | **`prefs.js` only** | settings window dead, **translation unaffected** |
| icon theme (Yaru/Adwaita) | — | 9 `*-symbolic` names in the popup and prefs | buttons render broken |

- `libsoup3` is the only explicitly version-pinned import, and the highest
  single-point-of-failure dependency.
- The panel icon is loaded by **file path** from `icons/`
  (`Gio.Icon.new_for_string`), so it is theme-independent. Only the popup/prefs
  button icons come from the theme.
- No CSS declares `font-family`; text inherits Cantarell/Yaru.
- Not depended on: any Python or external binary (no `Gio.Subprocess`/`spawn`),
  `node_modules` at runtime, any D-Bus service, and **any file persistence** —
  the translation cache is memory-only and cleared on `disable()`.

## 4. Test matrix

| Command | Time | Reaches | Writes |
|---|---|---|---|
| `npm test` | seconds | `translation-helper.js` exports, `destroy()` totality, GLib-vs-node crypto known answers, `prefs.js` layout | nothing |
| `npm run integration` | ~2–4 min | a real headless shell: ACTIVE, panel button, popup structure, double-copy behaviour | nothing (memory backend) |
| `npm run perf [cost\|idle\|all]` | 2 / 4 / 5 min | cost per event and idle CPU/RSS | nothing; writes JSON to `~/.cache/fast-translate-perf/` |

**Tier names used by `CHANGELOG.md`**, defined by what a claim needs rather than by the tool:
**L0** = `npm test` (no shell at all), **L1** = `npm run integration` / `npm run perf` (a
throwaway headless shell on a private bus), **L2** = §9 live session, which nothing here automates.

`npm test` deliberately does **not** cover `extension.js` at runtime (≈1900
lines): it never loads under plain Node, because `gi://` is unavailable there.
Runtime paths are only exercised by `npm run integration`.

`test/prefs-validator.js` smoke-tests that `fillPreferencesWindow()` does not
throw. It asserts nothing about widget bindings or the credential groups.

## 5. Headless harness

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
- Under a memory backend `enabled-extensions` is the schema default (empty), so
  `gnome-extensions enable` cannot reach the nested shell. `test/bootstrap.js`
  drives the shell's own `_callExtensionInit` → `_callExtensionEnable` instead,
  which also loads the stylesheet for real.
- `--unsafe-mode` (not `--devkit`) serves `org.gnome.Shell.Eval` on GNOME 50; it
  is hidden from `--help-all`.
- A shell **without** Eval answers `(false, ...)` with **exit status 0**. Poll
  the reply for `(true,`; testing the exit code reports success immediately and
  then silently drives a different process.
- `ExtensionState`: `ACTIVE 1, INACTIVE 2, ERROR 3, OUT_OF_DATE 4, INITIALIZED 6`.
  `INITIALIZED` means the object exists but `extension.js` has **not** been
  imported, so `stateObj` is undefined. `createExtensionObject` does not set
  `state` at all, so polling `lookup(uuid)` for truthiness is not enough — poll
  `state !== undefined`.
- Never write an unescaped apostrophe inside the `bash -c '...'` body: it ends
  the string and the remainder runs in the outer shell. That happened once and
  surfaced as a nonsense `trap: usage`.
- After a run, check for leaked nested shells: `pgrep -af 'gnome-shell --headless'`.
  Each holds ~230 MB and a few percent of a core, which will also distort your own
  measurements.

## 6. Brittle assertions in `test/eval-test.js`

Grep for the anchor before restructuring the popup; line numbers drift.

| Anchor | Pins |
|---|---|
| `menuItems.length !== 1` | the panel menu holds exactly the Settings entry |
| `w._copyBtn.opacity !== 110` / `!== 255` | the copy button's disabled/enabled look |
| `_destLabel.style_class.indexOf('error')` | error styling applied **and** cleared on retry |
| `children.length < 6` | the window actor's child count |
| `children[0]` / `children[5].get_children()[0]` | header is first child; actions row is 6th, copy button first inside it |
| `style_class !== 'translate-floating-overlay'` / `'...-window'` | **exact** class-string equality — appending a second class fails the test |
| `wantBg` dark `0x36363a` / light `0xffffff` | the variant stylesheet actually applied |
| `padTop !== 24` | proof that `stylesheet-base.css` loaded through `@import` |
| overlay vs work area | the popup covers its own monitor's work area, not the stage |
| `_currentTarget.indexOf('same')` | the same-language card must carry an explanation — couples to the **English msgid**, so translating that string breaks this assertion |
| `armCalls === 0` after ⇄ | the swap path must re-arm the 12 s watchdog |
| `w.overlay.reactive !== false` after `_dismiss()` | a dismissed backdrop must stop swallowing clicks |
| `w._winDestroyed` after an 800 ms wait | teardown must not depend on the tween's `onComplete` (headless never completes it) |

### Request-sanity guards now in force

Each is a pure decision in `translation-helper.js`, unit-tested in Node and also
provoked from inside the shell (`test/eval-test.js` Test 3b–3h):

| Helper | Prevents |
|---|---|
| `swapLanguages` | '⇄' moving `AUTO` into the target slot, where no provider accepts it and the corruption persists until a setting is touched |
| `safeTruncate`, `codePointLength` | `slice(0, limit)` splitting a surrogate pair → `URIError` shown verbatim as "Error: URI malformed"; emoji counted twice |
| `isSameLanguage` | a paid round trip that returns the input unchanged (exact-match only: `EN-GB → EN-US` is still a real request) |
| `hasVisibleText` | `trim()` missing U+200B–U+200F / U+2060, so invisible-only selections fired a request |

`_dismiss()` additionally sets `_userDismissed`, which stops a late reply from
overwriting the clipboard after the user closed the card; background mode is
unaffected because it never shows a card.

## 7. Measured cost baseline

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
  That is allocator arena saturation, not a linear leak. An earlier run of this
  probe reported a suspicious `+3 MB` purely because the settle time before and
  after the loop was asymmetric — keep both sides equal when you touch this.
- **Idle CPU is at the resolution limit.** Two runs of the alternating 4 × 30 s
  A/B/A/B windows: one gave `enabled - disabled = +4.0 ticks` (in-group spread 1),
  the other `+0.5` (spread 2). Honest statement: **0 – 0.13 % of one core**, not
  consistently separable from the shell's own floor. Earlier wording of
  "measured as zero" overstated it.
- **Idle RSS is not separable** either: after gc, enabled vs unloaded was
  `+1792 KB` in one run and `-28 KB` in the other.
- Not measurable headless, and they dominate what you actually feel: the
  `Clipboard.get_text()` Wayland round trip per copy, and the provider's network
  RTT.

## 8. Minor-version update exposure

GNOME's version gate compares **majors only** — `extensionSystem.js`
`_isOutOfDate()` does `shell-version.some(v => v.startsWith(PACKAGE_VERSION.split('.')[0]))`.
So `50.2`, `50.3`… load this extension with **no warning**, and a real
incompatibility there appears only as a runtime JS error. On Ubuntu most
"minor updates" are actually the same upstream version with a new Ubuntu
revision carrying downstream patches (`extensionSystem.js` itself branches on
`Desktop.is('ubuntu')`).

Ranked by likelihood, with the symptom you would see:

1. **Clipboard chain** — `global.display.get_selection()`,
   `Meta.SelectionOwner::owner-changed`, `St.Clipboard.get_text()`, plus the
   50 ms–2 s same-text double-copy heuristic. Wayland clipboard offer/owner
   semantics are among the most churned parts of mutter. Feature-detected, so the
   worst case is a *silent* loss of the trigger, not a crash.
   *Symptom: panel icon present, double Ctrl+C does nothing.*
2. **`global.stage.connect('captured-event')`** for Esc — Clutter input routing.
   Attached only while the popup is open. *Symptom: Esc stops working.*
3. **`PanelMenu.Button` / `PopupMenu.PopupMenuItem` / `Main.panel.statusArea`**
   and the variant-stylesheet filename contract. *Symptom: `enable()` throws and
   the panel icon disappears (this extension only). A Yaru/Adwaita class change
   is cosmetic instead.*
4. **GI binding shapes**, e.g. `GLib.compute_hmac_for_data` taking 3 arguments
   (measured, documented in `signing.js`). *Would break Baidu/Youdao signing
   only; DeepL and Google sign nothing.*
5. **libadwaita widgets in `prefs.js`** — Ubuntu bumps libadwaita independently.
   *Symptom: settings window fails; translation keeps working; `dconf write` is
   the workaround.*
6. **Provider API/domain changes** are more likely than any of the above, and the
   Baidu and Youdao language tables are still *(unverified)* — see §13.

Crossing to **GNOME 51** is different: `OUT_OF_DATE` and the extension stops
loading entirely until `"51"` is added to `shell-version`.

Triage, in order:

```bash
gnome-extensions info fast-translate@local          # expect State: ACTIVE
journalctl --user -b --no-pager -o cat _PID=$(pgrep -x gnome-shell) \
  | grep -iE 'fast-translate|JS ERROR' | tail -40
```

Filter by `_PID=` — a previous login's shell writes into the same boot stream.
Then read the symptom: icon present but no trigger ⇒ item 1/2; no icon ⇒ item 3.

## 9. Live session verification

- `scripts/reload.sh` only does disable+enable. On GNOME 50 that **does not
  re-import edited `extension.js`** (the ESM module cache is per shell process),
  so it can never verify a code change. Restart the shell — on Wayland that means
  logging out and in again.
- Journal: `journalctl -f -o cat /usr/bin/gnome-shell`, or with the `_PID=` filter
  as above.
- Reading this extension's own keys needs the schema dir:
  `GSETTINGS_SCHEMA_DIR=$PWD/schemas gsettings get org.gnome.shell.extensions.fast-translate <key>`.
- Four things can only be verified by hand in a real session: the popup in light
  and dark after a live switch, Esc, multi-monitor placement, and translation
  latency (it is network-bound).

## 10. Packaging and translations

- `scripts/pack.sh` builds in a temporary directory (the only safe way) but also
  creates `venv/` and needs network, and it passes `--podir=po`.
- **`msgfmt`/`xgettext` are not installed on this machine**, so `gnome-extensions
  pack` hard-fails while `po/` exists. There is no `locale/` and no `.mo`, so no
  translation has ever loaded: every `_()` returns its msgid. Fixing msgids is
  still worthwhile for a future packed build, but `scripts/update-po*.sh` cannot
  run here.
- `schemas/gschemas.compiled` is gitignored. A fresh clone is **broken until**
  `glib-compile-schemas schemas/`. Nothing needs installing system-wide: the
  shell builds a private schema source from the extension's own `schemas/` dir.
- After editing `schemas/*.xml`, recompile before running any test.

## 11. Privacy boundary

- Whatever text is double-copied is sent over HTTPS to the selected provider:
  `translate.googleapis.com/translate_a/single`,
  `api-free.deepl.com/v2/translate` (host configurable in gsettings),
  `fanyi-api.baidu.com/api/trans/vip/translate`, `openapi.youdao.com/api`.
  That is the product, not a leak — but it must never be widened silently.
- API keys and app secrets live in **dconf only**. Nothing credential-bearing is
  in git, and the test vectors in `test/unit.test.js` / `test/signing-crosscheck.js`
  are synthetic (`appid 20200101000000001`, `secretKey abcdefghijklmnop`,
  `testkey/testsecret`) so a `git grep` for `appid|secret|token` will look scary
  and be clean. Check this before every push.
- The extension writes no files and keeps no clipboard history; the cache is
  memory-only and cleared on `disable()`.
- Some error branches interpolate provider detail text into messages that reach
  the journal. Assume clipboard content can appear there.

## 12. Platform facts, each verified on 50.1

- An extension stylesheet loads into the **shell-wide** `St.Theme`. One un-prefixed
  shell class name restyles the whole desktop: this fork once shipped
  `.popup-menu-content { box-shadow: none }` and stripped the shadow from every
  menu on the machine. Never add un-prefixed selectors.
- `@import url("relative.css")` works in extension CSS (libcroco parser).
- **St ignores `max-height`** on these actors — measured: inline `max-height: 441px`
  still allocated 710 px and `get_preferred_height()` agreed. Height ceilings are
  enforced in JS (`FloatingTranslationWindow._computeCaps()`).
- Runtime CSS colour helpers that exist: `-st-accent-color`, `-st-accent-fg-color`,
  `st-mix()`, `st-lighten()`, `st-darken()`, `st-transparentize()`. There is no
  `@define-color` in shell CSS, so SCSS-style compile-time names are unusable.
- Read computed style for assertions with
  `actor.get_theme_node().get_background_color()` / `.get_padding(St.Side.TOP)`.
- **Synthetic input events are impossible from JS** on GNOME 50: `Clutter.Event`
  exposes only `get_*` accessors, cannot be constructed, and has no setters. Do
  not attempt to inject a click or keypress in a test.
- `Main.pushModal(..., SYSTEM_MODAL)` and `global.stage.set_key_focus()` were both
  measured and **rejected**: the first kills Super/Alt+Tab for the whole session,
  the second steals focus so the triggering Ctrl+C loses its key-release and the
  app behind it auto-repeats. Do not revive either design.

## 13. Open items

- Baidu's and Youdao's language tables are **deliberately incomplete**: their
  official docs render the tables client-side and there are no credentials to
  probe. Omitted codes return a clear local message; a wrong code would return an
  opaque HTTP 200 error body. Needs re-verification with real credentials.
- Baidu / Youdao are architecture-complete but **never exercised end to end** —
  no credentials. Tencent (TC3-HMAC-SHA256), Aliyun (HMAC-SHA1 RPC) and Huawei
  (SDK-HMAC-SHA256) need no new dependency: GLib covers them natively.
- The popup's real-session behaviours (§9) and the ~40 ms/30 s idle delta source
  (if it resolves at all with more windows) remain unattributed.
- **RTL is unverified, not fixed.** No `text-align` value table could be read out
  of `libst`, and Yaru's CSS offers no precedent, so whether St accepts
  `text-align: start` is unknown. The warning label is left `left`-aligned and the
  header arrow still points `➜` for RTL pairs. Do not change this without proving
  the value is accepted.
- **Dest-pane whitespace after the per-region cap fix is unmeasured.** The bug was
  a few px of slack rather than a functional failure, and asserting it in the shell
  would mean duplicating private layout maths, so no dedicated test was added.
  Existing suites prove no regression only; whether the destination pane still
  shows stray blank space needs a human look in a real session.
- **prefs does not filter the language dropdowns per provider.** Baidu still
  accepts six selections its table rejects (ID, LT, LV, SK, SL, TR); the fix was
  to name the offending pair in the error instead of hiding choices, because
  filtering a shared enum would have made the preference row depend on provider
  state and could hide a language the user had already saved.
- The five legacy schema keys (`auto-copy`, `auto-paste`, `auto-translate`,
  `keybinding-translate-clipboard`, `shortcut-enabled`) are annotated in the
  schema but deliberately **not removed** — deleting them would discard stored
  values and constitutes feature removal.
- **The dictionary card (D-021) is Google-only and partial.** Only Google returns
  dictionary data; DeepL/Baidu return none (Youdao would, but needs a key). The
  card renders phonetic + POS-grouped terms + examples; synonyms (`d[11]`) and
  monolingual definitions (`d[12]`) are fetched but not rendered yet. The copy
  button copies the translation, not the card. Google replies **bypass the LRU
  cache** because the response shape varies (word vs sentence); the 2.5 s
  same-text cooldown still absorbs rapid re-triggers.
- **A Google 429 from `curl` is a curl artifact, not an extension bug.**
  `translate.googleapis.com…client=gtx` answers 429 to curl but 200 to Soup (the
  extension's client). Reproduce Google failures with a `Soup`/`gjs` probe, never
  curl. The extension now uses `clients5.google.com…client=dict-chrome-ex` — the
  endpoint that returns the dictionary sections.
- New `_()` part-of-speech msgids (D-021) are not in `po/` (gettext absent) —
  inert today, like the rest of the catalog (no `.mo` files exist).
- `po/` cannot be regenerated on this machine (gettext absent).

## 14. Rollback

One concern per commit, `type: 中文摘要`. Every step above is a separate commit,
so `git revert <sha>` undoes exactly one. `git push` requires an explicit
decision each time; history is never rebased or rewritten.
