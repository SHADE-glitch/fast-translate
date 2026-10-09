<p align="right"><a href="compatibility-matrix.md"><b>English</b></a> | <a href="compatibility-matrix.zh-CN.md">简体中文</a> · <a href="../../MAINTENANCE.md">Handbook</a></p>

# Compatibility matrix

What this extension needs from the platform, and exactly how far that has been
verified. Split out of `MAINTENANCE.md` §3 and §8; the pointer table lives there.

## 1. Runtime dependencies

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

## 2. The libadwaita floor is 1.4, not 1.9

`shell-version` declares 45–50, and GNOME 45 ships libadwaita **1.4**. The values
in the table above are this machine's, measured with
`gnome-shell --version` and the typelib files — they are not the floor.

Any `prefs.js` widget or API added here must exist in Adw 1.4. `Adw.PasswordEntryRow`
(1.5+), `AdwPreferencesPage`/`AdwPreferencesGroup.header-suffix` (1.5) and anything
built on `AdwToolbarView` load fine on 1.9.1 and **fail to construct on 45**, which
is inside the declared range.

## 3. Version-gate mechanics

GNOME's version gate compares **majors only** — `extensionSystem.js`
`_isOutOfDate()` does `shell-version.some(v => v.startsWith(PACKAGE_VERSION.split('.')[0]))`.
So `50.2`, `50.3`… load this extension with **no warning**, and a real
incompatibility there appears only as a runtime JS error. On Ubuntu most
"minor updates" are actually the same upstream version with a new Ubuntu
revision carrying downstream patches (`extensionSystem.js` itself branches on
`Desktop.is('ubuntu')`).

Crossing to **GNOME 51** is different: `OUT_OF_DATE` and the extension stops
loading entirely until `"51"` is added to `shell-version`.

What breaks on which version, ranked by likelihood with the symptom you would
see, is in [shell-internals.md](shell-internals.md).

## 4. Declared range vs. what has actually been run

`metadata.json` declares `"45"…"50"`. That range is inherited from the frozen
upstream and is **not** re-verified per major on this fork:

| Shell | Actually run here | Evidence tier |
|---|---|---|
| 50.1 | yes | every number in [cost-measurement.md](cost-measurement.md), plus a live session |
| 45–49 | **never** | static inference only — nothing in `test/` boots an older shell |

So the declared range is a claim about intent, not a measured matrix. Do not
widen or narrow `shell-version` to make that table honest: adding or removing a
major changes what the shell loads, and AGENTS.md freezes the field. When a
compatibility question comes up, answer it from the API inventory instead.
