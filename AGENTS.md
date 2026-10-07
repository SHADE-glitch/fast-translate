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
- `kind` ∈ `fix` | `perf` | `taste` | `guard` | `revert`, cut by **who may demand a revert**: dropping it
  makes a bug → `fix`; dropping it only re-introduces measurable degradation → `perf`; dropping it
  only annoys me → `taste` (zero obligation; on an upgrade it may
  be discarded wholesale). A change that is both splits into two entries — done so here: `5843765`
  is recorded as `D-007` (the height ratchet, a defect) and `D-008` (the 60 % cap, a preference).
  Withdrawals are recorded too.
- An entry is an assertion **as of its commit**, not current state: never re-verify an old entry,
  never hand-copy an aggregate count into the file (`check:log` prints both counts).
- Known-but-not-fixed issues do **not** go in `CHANGELOG.md` — they have no commit. They live in
  `MAINTENANCE.md` §13 (Open items).
- `Symptom` names the mechanism, never the session: no window titles, no clipboard contents, no
  translated text, no provider credentials. This repo sends user text to third-party providers;
  the record must not quote any of it (privacy boundary: `MAINTENANCE.md` §11).
- A window containing zero entries is a failure, not a pass: either the window starts where real
  deviations exist, or the header says there are none.


