# AGENTS.md

## Critical Rules
- **NEVER run `gnome-extensions install` or `gnome-extensions pack` from within this repo directory.** The install tool follows symlinks and will wipe the source directory contents.
- **Do not load ESModules via legacy `imports`** (e.g. `imports.ui.main` throws SyntaxError in GNOME 45+). Use static `import` or dynamic `await import()`.
- **Do not reassign ESModule exports directly** (e.g. `Main.notify = ...`). Monkeypatch mutable prototypes (e.g. `MessageTray.Source.prototype.addNotification`).
- **GJS constraint**: No `fetch`/`URLSearchParams` inside the shell process (use `Soup.Session` + `GLib.Bytes` as done in `extension.js`).

## Dev & Packaging Scripts
- **Safe Packaging**: Run `bash scripts/pack.sh` (compiles schemas, compiles translations, and packs via temporary directory safely).
- **Extension Reload**: Run `bash scripts/reload.sh` (executes disable/enable cycle).
- **Watch Logs**: Run `journalctl -f -o cat /usr/bin/gnome-shell`
- **Record check**: Run `npm run check:log` (bare `node scripts/check-log.mjs` also works). It
  fails on any commit inside the declared coverage window that touched production code without
  being cited by a `CHANGELOG.md` entry.

## Tests
- **Run the suite**: `npm test`. It chains five checks in order, each failing the run on its own:
  - `node test/unit.test.js` — pure helpers in `translation-helper.js` under plain Node.
  - `node test/teardown-guard.test.js` — source-level gate that `destroy()` is total.
  - `node test/repo.test.js` — repository invariants: every `*.zh-CN.md` has an English twin
    with the same `##` count and the same language-switcher opener, and no doc uses task boxes.
  - `gjs -m test/signing-crosscheck.js` — GLib signing primitives vs the `node:crypto` vectors.
  - `gjs -m test/prefs-validator.js` — `prefs.js` layout under Gtk/Adw.
- The last two steps need `gjs`; `prefs-validator.js` additionally needs a display and the GTK4
  and libadwaita typelibs, so it only runs on a desktop session, not headless.
- **Integration / perf probes**: `npm run integration` and `npm run perf` drive a live shell;
  they are not part of `npm test`.

## CI
- `.github/workflows/ci.yml` runs on every push and pull request (`ubuntu-latest`, Node 20):
  `node test/unit.test.js`, `node test/teardown-guard.test.js`, `node test/repo.test.js`, then
  `npm run check:log`.
- CI is **desktop-free on purpose**: it does not install `gjs`, so the two `gjs -m` steps of
  `npm test` are excluded. `prefs-validator.js` calls `Gtk.init()` and fails without a display,
  so the full `npm test` is a local/desktop gate, not a CI one.
- `checkout` uses `fetch-depth: 0` because `check:log` walks `git log` back to the coverage
  anchor in `CHANGELOG.md`; a shallow clone cannot resolve that window.

## Release / version
- The released version is the integer `version` in `metadata.json` — nothing else carries it.
  Bump it by one in the same commit that changes the shipped extension (code, schema or
  `shell-version`), and only for a change intended to reach users.
- Docs-only, test-only and CI-only changes do not bump it.

## Docs & Commits
- `README.md` and `README.zh-CN.md` are one document in two languages; keep both in sync with
  code changes, including the `D-###` references in the upstream-diff section.
- Commit code first, docs in a separate commit; Chinese subjects with English
  conventional-commit prefixes (`fix:` / `perf:` / `test:` / `docs:` / `chore:`). Measured: 35 of
  36 commits since the upstream import obey this. The one exception (`aba4c8b`) is legitimate —
  the wrong wording *is* the defect, so text and code cannot be separated there.
- Never state an aggregate count in a document; print it from the command instead (README already
  does this for commit counts).

## Recording conventions
- Behaviour changes land in `CHANGELOG.md` as `D-###` entries; ids are monotonic and **never
  reused**, so a gap means an entry was deleted — `check:log` treats that as a failure.
- `kind` ∈ `fix` | `perf` | `taste` | `guard` | `revert` | `chore`, cut by **who may demand a revert**: dropping it
  makes a bug → `fix`; dropping it only re-introduces measurable degradation → `perf`; dropping it
  only annoys me → `taste` (zero obligation; on an upgrade it may
  be discarded wholesale). A change that is both splits into two entries — done so here: `5843765`
  is recorded as `D-007` (the height ratchet, a defect) and `D-008` (the 60 % cap, a preference).
  Withdrawals are recorded too. Cleanup owed nothing either way (dead code, wrong comments,
  naming) is `chore`; none is recorded here yet, but the checker accepts the value so all five
  extensions share one vocabulary.
- An entry is an assertion **as of its commit**, not current state: never re-verify an old entry,
  never hand-copy an aggregate count into the file (`check:log` prints both counts).
- Known-but-not-fixed issues do **not** go in `CHANGELOG.md` — they have no commit. They live in
  `MAINTENANCE.md` §13 (Open items).
- `Symptom` names the mechanism, never the session: no window titles, no clipboard contents, no
  translated text, no provider credentials. This repo sends user text to third-party providers;
  the record must not quote any of it (privacy boundary: `MAINTENANCE.md` §11).
- A window containing zero entries is a failure, not a pass: either the window starts where real
  deviations exist, or the header says there are none.


