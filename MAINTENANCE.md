<p align="right"><a href="README.md">README</a> · <a href="MAINTENANCE.md"><b>English</b></a> | <a href="MAINTENANCE.zh-CN.md">简体中文</a></p>

# Maintenance handbook

Operational knowledge for this fork. It is not a user guide — read
[README.md](README.md) for that. Everything in here and in `docs/maintenance/` was
measured or read out of the shell on the machine this fork runs on; anything that
was not is marked *(unverified)*.

This file is a **router**. The prose lives in one place each, under
`docs/maintenance/`, so a fact has exactly one owner. Come here to find out which
file to read, and stay for the three things that have no other home.

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

Where each thing lives:

| Question | File |
|---|---|
| What must never be "fixed" back? | [INVARIANTS.md](INVARIANTS.md) |
| What does this need from the platform, and how far is that verified? | [docs/maintenance/compatibility-matrix.md](docs/maintenance/compatibility-matrix.md) |
| Which shell internals do we touch, and how do I adapt to an update? | [docs/maintenance/shell-internals.md](docs/maintenance/shell-internals.md) |
| What do I run to prove a change, and in what order? | [docs/maintenance/verification.md](docs/maintenance/verification.md) |
| How is CPU/RSS measured so a number means something? | [docs/maintenance/cost-measurement.md](docs/maintenance/cost-measurement.md) |
| What is known but not fixed? | [docs/maintenance/open-items.md](docs/maintenance/open-items.md) |
| What was changed, and why, commit by commit? | [CHANGELOG.md](CHANGELOG.md) |
| Rules for working in this repo (agents and humans) | [AGENTS.md](AGENTS.md) |
| Session state: version, unpushed work, pending decisions | [docs/reports/STATE.md](docs/reports/STATE.md) |
| What was actually run to prove the current batch | [docs/reports/VERIFY.md](docs/reports/VERIFY.md) |

## 2. Invariants

Moved to [INVARIANTS.md](INVARIANTS.md) — that file is the carrier for "do not fix
these back", and `npm run check:log --invariants` prints the recorded behaviour
fixes from `CHANGELOG.md` straight out of the record, so nothing is hand-copied.

## 3. Dependencies

Moved to [docs/maintenance/compatibility-matrix.md](docs/maintenance/compatibility-matrix.md),
which now also states the libadwaita API floor implied by `shell-version` 45.

## 4. Test matrix

Moved to [docs/maintenance/verification.md](docs/maintenance/verification.md),
together with the L0/L1/L2 evidence tiers and the rule about provoking a guard
before trusting it. The suite is a chain: each check failing fails the run, and
`node test/repo.test.js` now enforces the bilingual pair across every directory,
not just the repo root.

## 5. Headless harness

Moved to [docs/maintenance/cost-measurement.md](docs/maintenance/cost-measurement.md)
— the isolation recipe, and the traps that each produced a wrong result that
looked like a correct one.

## 6. Brittle assertions in `test/eval-test.js`

Moved to [docs/maintenance/verification.md](docs/maintenance/verification.md),
with the request-sanity guard table and the one guard that does not currently
cover the branch production runs.

## 7. Measured cost baseline

Moved to [docs/maintenance/cost-measurement.md](docs/maintenance/cost-measurement.md)
alongside the sampling rules that produced it. Headless absolute values never
transfer to a real session; only the relative claims survive.

## 8. Minor-version update exposure

Moved to [docs/maintenance/shell-internals.md](docs/maintenance/shell-internals.md),
which is now also the per-API inventory with file:line and the upgrade playbook.

## 9. Live session verification

Moved to [docs/maintenance/verification.md](docs/maintenance/verification.md).
The one fact worth repeating: `scripts/reload.sh` cannot verify a code change on
GNOME 50 — edited ES modules are not re-imported by a disable/enable cycle.

## 10. Packaging and translations

- `scripts/pack.sh` builds in a temporary directory (the only safe way) but also
  creates `venv/` and needs network, and it passes `--podir=po`.
- `pack.sh` copies an **explicit list** of paths, so `docs/`, `test/`, `scripts/`
  and the root `*.md` never enter the zip. Adding maintenance documentation to the
  repo has no effect on what ships.
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
- This section is the **maintainer's** boundary. What the *user* is told about it
  is a separate, still-open gap — see
  [docs/maintenance/open-items.md](docs/maintenance/open-items.md) §5.

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

Moved to [docs/maintenance/open-items.md](docs/maintenance/open-items.md). Known
but not fixed lives there and nowhere else — not in `CHANGELOG.md` (an unfixed
thing has no commit) and not in `docs/reports/AUDIT.md` (a snapshot as of its own
commit).

## 14. Rollback

Moved to [docs/maintenance/verification.md](docs/maintenance/verification.md),
under commit discipline. In one line: one concern per commit, `type: 中文摘要`,
and `git push` needs an explicit decision every single time.
