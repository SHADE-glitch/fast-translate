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
| Session state: version, unpushed work, pending decisions | `docs/reports/STATE.md` — **a local draft, not committed** (a clone cannot see it) |
| What was actually run to prove the current batch | `docs/reports/VERIFY.md` — **a local draft, not committed** (a clone cannot see it) |

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
  creates `venv/` and needs network, and it passes `--podir=po`. Two measured defects
  are now fixed there and pinned by a repository guard: a failed run used to leave
  `/tmp/fast-translate-pack` half-full, and `cp -r` over it kept files the repo had
  dropped; and the list itself is not discovered — a root-level module with no
  `--extra-source=` line is simply absent from the zip. See
  [docs/maintenance/verification.md](docs/maintenance/verification.md) §3, row
  "the packaging list ships exactly what the repo has".
- `pack.sh` copies an **explicit list** of paths, so `docs/`, `test/`, `scripts/`
  and the root `*.md` never enter the zip. Adding maintenance documentation to the
  repo has no effect on what ships.
- **gettext was installed on 2026-10-10** (`msgfmt`/`xgettext` 0.23.2), so `pack.sh` now
  reaches `gnome-extensions pack` and produces a zip, and `scripts/update-po.sh` runs.
  What that made visible for the first time: a `.mo` carries **only** entries with a
  non-empty, non-fuzzy `msgstr` — so the catalogs' real yield is `msgfmt --statistics`'
  "translated" line (read it there, not from a `grep`), the rest of the UI falls back to the
  English msgid, and the `#, fuzzy` rows are invisible to the user until a translator clears
  the flag. `locale/` is built from `po/` by the pack step, so the repo still has no `locale/`
  of its own.
- **One catalog defect can be invisible to every other guard and still break both paths.**
  `msgfmt` counts an obsolete `#~ msgid` against a live one and exits 1, which fails
  `pack --podir` *and* `msgmerge`. When a string upstream obsoleted comes back in this fork's
  sources, one of the two definitions has to go, and the safe one is the `#~` pair: reviving
  upstream's translation into the live entry is a **translation decision**, and `msguniq`
  does it silently — which is why the fix here deleted the pair and left `msgstr ""` for a
  translator to fill. `test/repo.test.js` ("no catalog defines the same msgid twice, obsolete
  entries included") is the gate. The catalogs remain hand-edited and kept honest by `test/repo.test.js`: every
  `_()` literal **and every schema `<summary>`/`<description>`** (the `<schemalist gettext-domain>`
  makes that a second translatable source — see `docs/maintenance/open-items.md` §3) must appear in
  `messages.pot` and in de/es/nl, no catalog may carry a msgid
  the template lost, and every `// Translators:` comment must reach all four as a `#.` hint.
  Adding a user-visible string still means four `.po`-side edits before `npm test` goes green.
  Do **not** reach for `scripts/update-pot.sh`: measured on this fork it rewrites the template
  into a shape that puts five repository guards red. See
  [docs/maintenance/open-items.md](docs/maintenance/open-items.md) §3 for what is still owed.
- `schemas/gschemas.compiled` is gitignored. A fresh clone is **broken until**
  `glib-compile-schemas schemas/`. Nothing needs installing system-wide: the
  shell builds a private schema source from the extension's own `schemas/` dir.
- After editing `schemas/*.xml`, recompile before running any test.

## 11. Privacy boundary

- Whatever text is double-copied is sent over HTTPS to the selected provider.
  The hosts are the `host` field of each `PROVIDERS` row in
  `translation-helper.js`, derived from the same endpoint constants the request
  builders use: `clients5.google.com/translate_a/single?client=dict-chrome-ex`,
  `api-free.deepl.com/v2/translate` (the full URL is the `url` gsetting, so DeepL
  has no fixed host in the table), `fanyi-api.baidu.com/api/trans/vip/translate`,
  `openapi.youdao.com/api`. That is the product, not a leak — but it must never be
  widened silently. `test/unit.test.js` compares each declared `host` against the
  URL its own builder emits, so the table cannot drift from the request.
- API keys and app secrets live in **dconf only**. Nothing credential-bearing is
  in git, and the test vectors in `test/unit.test.js` / `test/signing-crosscheck.js`
  are synthetic (`appid 20200101000000001`, `secretKey abcdefghijklmnop`,
  `testkey/testsecret`) so a `git grep` for `appid|secret|token` will look scary
  and be clean. Check this before every push.
- The extension writes no files and keeps no clipboard history; the cache is
  memory-only and cleared on `disable()`.
- Some error branches interpolate provider detail text into messages that reach
  the journal. Assume clipboard content can appear there.
- This section is the **maintainer's** boundary. The *user* is now told the same
  thing in the settings window: `updatePrivacyDisclosure()` in `prefs.js` writes
  the selected provider's host into the service row's subtitle, names
  `clients5.google.com` for single-word dictionary lookups, and `test/repo.test.js`
  guards that the shipped gsettings defaults match what that copy promises.
  What the user is *not* told is still worth checking against this list before
  a new outward-facing call is added.

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
  `get_text_align()` is bound too, and its values are `Pango.Alignment`
  (LEFT=0, CENTER=1, RIGHT=2): `start` and `end` both read back **0**, identical to an
  unrecognised keyword and unchanged under `text-direction = RTL` — St accepts the words but
  maps them to LEFT, so direction-relative alignment is not expressible in shell CSS here.
- **A vertical `St.ScrollView` scrollbar withholds 8 px**, measured against the same box with
  the policy off (300→292). `St.ScrollView` exposes **no** `get_vscrollbar()` /
  `get_hscrollbar()` / `get_allocation()` in this binding — only `add_child`, `set_child`,
  `get_child`, `get_width`, `get_height`, `get_children`, `get_theme_node` — so the width can
  only be taken from what the layout leaves the child. `SCROLLBAR_ESTIMATE` in `extension.js`
  is 16 on purpose; `test/eval-test.js` Test 5 asserts the real figure stays inside it.
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
