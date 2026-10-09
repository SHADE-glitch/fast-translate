<p align="right"><a href="INVARIANTS.md"><b>English</b></a> | <a href="INVARIANTS.zh-CN.md">简体中文</a> · <a href="README.md">README</a></p>

# Invariants — do not "fix" these back

A pointer file. It lists only what must not regress and where the proof lives; it
deliberately holds no prose that has another owner, because a second copy of a fact
rots. Moved here from `MAINTENANCE.md` §2 when the handbook was split.

The authority for *behaviour* changes is [CHANGELOG.md](CHANGELOG.md), not this file.
Print the recorded fixes out of the record instead of copying them here:

```bash
npm run check:log -- --invariants      # every kind:fix entry, with its commit
```

## 1. Things that look wrong and must stay wrong

| Looks wrong | Why it stays | Where it is checked |
|---|---|---|
| `gettext-domain` is `fast-translate@tazztone.github.io` while `uuid` is `fast-translate@local` | The compiled `.mo` filename must match the domain. Renaming it breaks translations silently. | nothing — do not touch `metadata.json`; see [docs/maintenance/compatibility-matrix.md](docs/maintenance/compatibility-matrix.md) for what that domain costs today |
| There is no `stylesheet.css`, only `stylesheet-light.css` + `stylesheet-dark.css` | `_loadExtensionStylesheet` tries `${sessionMode}-${variant}.css`, `stylesheet-${variant}.css`, `${sessionMode}.css`, `stylesheet.css` and loads the **first hit**. Only the `-light`/`-dark` names are wired to the live `notify::color-scheme` reload. | `test/eval-test.js` `wantBg` + `padTop !== 24` anchors ([docs/maintenance/verification.md](docs/maintenance/verification.md)) |
| `shell-version` lists `"45"`…`"50"` | Majors only; see [docs/maintenance/shell-internals.md](docs/maintenance/shell-internals.md). Do not add a major without checking compatibility first, and do not remove one to make the range honest — 45–49 are declared and simply have never been run here. | `npm run integration` on 50.1 only; nothing automates 45–49 |
| `metadata.json` `url` points at this fork | Deliberate: it is a carried fork of a frozen upstream. | static |

## 2. Designs measured and rejected — do not revive them

- **`Main.pushModal(..., SYSTEM_MODAL)`** for the popup: kills Super and Alt+Tab for
  the whole session while the card is open.
- **`global.stage.set_key_focus()`** to capture Escape: steals focus, so the
  triggering Ctrl+C loses its key-release and the application behind it starts
  auto-repeating.
- **Un-prefixed CSS selectors** in an extension stylesheet: it loads into the
  **shell-wide** `St.Theme`. This fork once shipped
  `.popup-menu-content { box-shadow: none }` and stripped the shadow from every menu
  on the machine.

## 3. What this extension never does

No prototype monkey-patching, no `imports.ui.*` in extension code, no injected shell
functions, no background timers, no private D-Bus service, no file persistence, no
Gtk/Gdk import in the shell process. That is why the blast radius of any breakage is
this extension alone, never the shell or a sibling fork.

The request-sanity guards that *are* in force (`swapLanguages`, `safeTruncate`,
`isSameLanguage`, `hasVisibleText`) are tabled in
[docs/maintenance/verification.md](docs/maintenance/verification.md), together with
the one of them that currently does not cover the branch production runs.

## 4. Rules for keeping an invariant

- Do not "fix" an invariant to make a verification step pass. Each row above looks
  like a bug and each has a measured reason.
- A new invariant belongs here only if it is a standing prohibition. Anything that
  was a one-time repair belongs in `CHANGELOG.md`; anything known-but-unrepaired
  belongs in [docs/maintenance/open-items.md](docs/maintenance/open-items.md).
- This file is a root-level document, so it is guarded as a bilingual pair by
  `test/repo.test.js`: its `## ` section count must match
  [INVARIANTS.zh-CN.md](INVARIANTS.zh-CN.md).
