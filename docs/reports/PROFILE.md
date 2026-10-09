<p align="right"><a href="PROFILE.md"><b>English</b></a> · <a href="../../MAINTENANCE.md">Handbook</a> · <a href="STATE.md">State</a></p>

# Project profile

Phase-A artifact: what this repo actually is, as read from the code on 2026-10-09.
Not a user guide ([README.md](../../README.md)) and not a rule list
([AGENTS.md](../../AGENTS.md)). Refresh by re-reading the code, not by editing the
numbers below — print them with the commands given.

## What it does

One feature: copy twice within 50 ms–2 s (`extension.js:333`, same text) and the
selection is translated by an online provider into a floating card over the current
monitor. Two delivery modes — the card, or background mode, which never shows a card
and puts the result on the clipboard.

- Trigger: `Meta.SelectionOwner::owner-changed`, not a keybinding. There is no
  "translate" shortcut; the clipboard *is* the trigger.
- Providers (`translation-helper.js` `PROVIDERS`): DeepL, Google Translate, Baidu,
  Youdao. All four build **POST** requests; the DeepL key goes in an
  `Authorization` header, Baidu/Youdao credentials in the form body, so nothing
  credential-bearing is ever in a URL.
- Single-word requests are routed to Google regardless of the selected provider
  (`_effectiveProvider`) because only Google returns dictionary data; sentences stay
  on the selected service. This is deliberate (D-022) and not yet disclosed to the
  user (open item).
- Transport: Soup 3, `Soup.Session({ timeout: 10 })`, `send_and_read_async` only —
  **no synchronous network IO on the compositor thread anywhere**. Per-request
  `Gio.Cancellable`, a generation counter so a late reply cannot paint a newer card,
  a 12 s watchdog that both kills the request and un-sticks the UI, and a 500 ms
  dismiss fallback.
- Cache: in-memory LRU, budgets `TRANSLATION_CACHE_MAX = 50` entries and
  `TRANSLATION_CACHE_MAX_CHARS = 200000`, key includes service, both languages and
  the DeepL-affecting options. Cleared on `disable()`. Google replies bypass it
  because the response shape varies.

## Modules and scale

```bash
wc -l extension.js prefs.js translation-helper.js signing.js stylesheet-*.css
```

| File | Role |
|---|---|
| `extension.js` | everything that runs inside the shell: panel indicator, clipboard trigger, settings load, LRU cache, request orchestration and dispatch, HTTP, error copy, notifications, teardown, **and** the whole floating window as a hand-built actor tree (`FloatingTranslationWindow`) plus a dictionary card and a hand-rolled tooltip |
| `translation-helper.js` | pure, `gi://`-free and gettext-free: provider table, language code tables, request builders for all four providers, response parsers, and the request-sanity decisions (`safeTruncate`, `isSameLanguage`, `hasVisibleText`, `codePointLength`) |
| `signing.js` | the GLib-backed HMAC/checksum bundle injected into the helper so the same signing function can be cross-checked against `node:crypto` |
| `prefs.js` | libadwaita-only settings window: two pages, nine groups, rows for 18 of the 24 schema keys |
| `stylesheet-base.css` | geometry only, `@import`ed by the two variant files |
| `stylesheet-light.css` / `stylesheet-dark.css` | the two palettes; the file *names* are the contract that makes the live dark/light reload work (`INVARIANTS.md` §1) |

Module boundary today: `extension.js:36` imports names from `translation-helper.js`
and `:37` from `signing.js`. `prefs.js:31` imports exactly one name, `getProvider`, and
reads `credentialGroup` / `supportsFormatting` from the provider table (D-033) — it used
to re-spell those as `service === 0/2/3`, which put the same mapping in two files.

## Settings model

24 keys in
`schemas/org.gnome.shell.extensions.fast-translate.gschema.xml`, including four that
are read only by the provider builders (`split-sentences`, `preserve-formatting`,
`formality`, `url`) and five annotated legacy keys that nothing reads any more but
which are kept so stored values are not discarded. API credentials live in dconf, in
plaintext, which the UI states in its group description.

## User-visible surfaces

| Surface | Implementation | Native? |
|---|---|---|
| Panel entry | `PanelMenu.Button` subclass, one `Settings` menu item | yes |
| Panel icon | `Gio.Icon.new_for_string()` on a file path in `icons/` | theme-independent by design |
| Floating card | raw `St.Widget` overlay + `St.BoxLayout` added to `Main.uiGroup`, plus a stage-level `captured-event` handler for Escape | deliberately **not** a `PopupMenu`, deliberately **not** modal — see `INVARIANTS.md` §2 |
| Dictionary card | a fixed pool of rows toggled by `.visible`, inside the destination pane | hand-built |
| Toasts / notifications | `Main.notify()` | the only output channel in background mode |
| Tooltip | hand-rolled `St.Label` on `Main.uiGroup` with its own hover timer | `St.Tooltip` is not used |

## Where the knowledge lives

[MAINTENANCE.md](../../MAINTENANCE.md) is the router; the prose is in
`docs/maintenance/` (compatibility matrix, shell internals, cost measurement,
verification, open items), prohibitions are in
[INVARIANTS.md](../../INVARIANTS.md), per-change history is in
[CHANGELOG.md](../../CHANGELOG.md), and working rules are in
[AGENTS.md](../../AGENTS.md).
