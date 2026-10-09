<p align="right"><a href="shell-internals.md"><b>English</b></a> | <a href="shell-internals.zh-CN.md">简体中文</a> · <a href="../../MAINTENANCE.md">Handbook</a></p>

# Shell internals this extension depends on, and how to adapt

Every surface this fork touches that is not plain GJS/GLib, with the exact
line that touches it. Split out of `MAINTENANCE.md` §8. Line numbers drift —
each row is written so you can `grep` the symbol instead of trusting the number.

## 1. The inventory

| Surface | Where | Why it is load-bearing | If it changes |
|---|---|---|---|
| `global.display.get_selection()` + `Meta.SelectionType` | `extension.js:287-288` | reads the clipboard owner to detect the double-copy trigger | feature-detected; trigger dies silently |
| `Meta.SelectionOwner::owner-changed` (connect / disconnect) | `extension.js:299`, `:373` | the trigger itself; disconnect is what makes `disable()` clean | double Ctrl+C stops doing anything |
| `St.Clipboard.get_default().get_text()` / `.set_text()` | `extension.js:42`, `:312`, `:1658` | reads the selection, writes the translation back | the round trip is Wayland-bound and invisible to `npm run perf` |
| `PanelMenu.Button` subclass | `extension.js:221` | the panel actor | `enable()` throws, icon vanishes |
| `Main.panel.addToStatusArea()` | `extension.js:1413`, `:1423`, teardown `:1436` | registration and the teardown path that removes it | duplicate or orphaned panel entry |
| `PopupMenu.PopupMenuItem` | `extension.js:270` | the one Settings entry in the panel menu | cosmetic, one menu item |
| `Main.wm.addKeybinding()` / `removeKeybinding()` + `Shell.ActionMode` | `extension.js:384`, `:388`, `:410` | transient per-window Escape binding; the remove is what keeps it from leaking across windows | Escape stops working, or a binding outlives the popup |
| `Main.notify()` | `extension.js:687`, `:1015`, `:1282` | the only output path in background mode | failures and successes become invisible |
| `Main.uiGroup.add_child()` + actor `destroy()` | `extension.js:157`, `:1792-1793`, `:2462`, `:2466` | the popup is a raw actor tree, not a `PopupMenu` — deliberately, see `INVARIANTS.md` | a popup that survives `disable()` |
| `global.stage.connect('captured-event')` + `Clutter.KEY_Escape` | `extension.js:1820`, `:1813`, `global.stage.disconnect` `:2417` | Escape while the popup is open, without a modal grab | Esc stops closing the card |
| `global.stage.width` / `.height` | `extension.js:181-182`, `:1885-1886` | clamping the tooltip and the popup to the screen | off-screen surfaces |
| `Main.layoutManager` (`focusIndex`, `primaryIndex`, `monitors`, `getWorkAreaForMonitor`) | `extension.js:1851-1857`, `:1872-1875` | multi-monitor placement: the overlay covers its own monitor's work area | popup lands on the wrong screen |
| `St.ScrollView` | `extension.js:1546`, `:1578`; policy at `:1548`, `:1580` | the two text panes; `vscrollbar_policy` is read-only after construction | deprecated in favour of `St.Clip`, which has no scrollbars — see `docs/reports/PLAN.md` for why it is not migrated |
| `Pango.WrapMode` | `extension.js:1563`, `:1595`, `:1999` | text wrapping inside the panes | wrapping breaks |
| `Gio.Icon.new_for_string()` | `extension.js:1326` | panel icon resolved by file path from `icons/`, so it is theme-independent. The two synchronous `query_exists()` stats this path used to run on the compositor thread are gone (D-034); which files ship is a repository property asserted by `test/repo.test.js` | a broken icon; a missing svg is now a red repository test, not a runtime probe |
| `Soup.Session` (`gi://Soup?version=3.0`) + `send_and_read_async()` | import `:33`, session `:228`, calls `:864`, `:1106` | every request, async only | the whole feature; this is the one version-pinned import |
| `GLib.compute_hmac_for_data` / `compute_checksum_for_string` / `base64_encode` | `signing.js:12-19`, `:25-30`, `:44-54`; `translation-helper.js:552`, `:558`, `:581`, `:590` | Baidu and Youdao request signing; `compute_hmac_for_data` takes 3 arguments (measured) | signing only — DeepL and Google sign nothing |
| variant stylesheet filename contract | `stylesheet-light.css` / `stylesheet-dark.css` names | `_loadExtensionStylesheet` picks the first hit and only `-light`/`-dark` follow the live `notify::color-scheme` reload | dark/light stops tracking the system |

**Test-side private API, deliberately excluded from the production rules above**:
`test/bootstrap.js` calls `_callExtensionInit` / `_callExtensionEnable` (a memory
backend leaves `enabled-extensions` empty, so `gnome-extensions enable` cannot
reach a nested shell), and `test/eval-test.js` replaces
`indicator._httpSession.send_and_read_async` and `GLib.get_monotonic_time` and
reads `ext.stateObj`. None of it is imported by extension code.

## 2. Ranked minor-version failure surface

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
   Baidu and Youdao language tables are still *(unverified)* — see
   [open-items.md](open-items.md).

## 3. Triage, in order

```bash
gnome-extensions info fast-translate@local          # expect State: ACTIVE
journalctl --user -b --no-pager -o cat _PID=$(pgrep -x gnome-shell) \
  | grep -iE 'fast-translate|JS ERROR' | tail -40
```

Filter by `_PID=` — a previous login's shell writes into the same boot stream.
Then read the symptom: icon present but no trigger ⇒ item 1/2; no icon ⇒ item 3.

## 4. Upgrade playbook

For a new Ubuntu revision of the same shell major, or a new major once
`shell-version` has been extended:

1. Reproduce the symptom before touching code, with the triage commands above.
2. `npm test` first — it catches a broken pure helper, a signing-binding change,
   and a `prefs.js` that no longer constructs, without a shell at all.
3. `npm run integration` next — a real headless shell, zero writes. It boots the
   extension through the shell's own `_callExtensionInit`/`_callExtensionEnable`,
   so an `enable()` regression shows up as `ERROR:state=N` rather than as a
   missing feature. Read the recipe in
   [cost-measurement.md](cost-measurement.md) before blaming the extension for a
   harness failure.
4. `npm run perf cost` — a regression here is a real signal, but read the
   sampling rules first: idle CPU differences below ~0.1 % of one core are inside
   the resolution limit and mean nothing.
5. Only then the real session. `scripts/reload.sh` cannot verify a code change on
   GNOME 50 — disable/enable does not re-import edited ES modules — so this step
   means logging out and in again. The four things that need it are listed in
   [verification.md](verification.md).
6. Record what you found: a behaviour change is a `D-###` entry in
   `CHANGELOG.md`; something known-but-not-fixed goes in
   [open-items.md](open-items.md) and nowhere else.
7. Never "fix" an invariant to make a step pass — the four in `INVARIANTS.md`
   each look like a bug and each has a measured reason.
