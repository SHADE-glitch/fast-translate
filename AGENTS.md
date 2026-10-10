# AGENTS.md

Rules for working in this repo, for AI agents and for me. It is a rule list, not a
handbook: operational knowledge lives behind the router in
[MAINTENANCE.md](MAINTENANCE.md).

> **Shared standard.** Root file names, the process-draft location (`docs/reports/`), the
> `CHANGELOG` entry format, CI version pinning and entry commands, the test entry command, and
> the runtime ignore list are defined once in the machine-wide `STANDARD.md` (outside this
> repository) and are not restated here.
>
> **Push over SSH, never HTTPS.** Verify `git remote get-url --push origin` starts with `git@`
> before pushing; if it starts with `https://`, fix it first — never push over HTTPS.

## 0. Start here

- **Read `docs/reports/STATE.md` first** (a local draft, not committed — a clone cannot see it). It carries the
  current version, what is committed but unpushed, open decisions and the next
  step. A session that skips it will re-decide something already settled.
- Priority order for every decision: **stability > performance > code aesthetics**,
  then readability. Two designs are measured-and-rejected and must not be revived —
  see [INVARIANTS.md](INVARIANTS.md) §2.
- Target environment: **Ubuntu 26.04 + GNOME Shell 50.1 + Wayland.** This repo is a
  carried fork of a frozen upstream; it is not published to extensions.gnome.org,
  so EGO review rules are reference material, not a gate. No PR templates, no
  contributing guide, no team process — there is one maintainer.

## Critical Rules

- **NEVER run `gnome-extensions install` or `gnome-extensions pack` from within this repo directory.** The install tool follows symlinks and will wipe the source directory contents.
- **Do not load ESModules via legacy `imports`** (e.g. `imports.ui.main` throws SyntaxError in GNOME 45+). Use static `import` or dynamic `await import()`.
- **Do not reassign ESModule exports directly** (e.g. `Main.notify = ...`). Monkeypatch mutable prototypes (e.g. `MessageTray.Source.prototype.addNotification`).
- **GJS constraint**: No `fetch`/`URLSearchParams` inside the shell process (use `Soup.Session` + `GLib.Bytes` as done in `extension.js`).
- **No `git push`, rebase, history rewrite, or upstream merge without an explicit decision for that exact action.** Authorizing a push once does not authorize the next one. Never decide this from the local tracking ref — read the remote with `git ls-remote` after.
- **`uuid` and `shell-version` in `metadata.json` are frozen.** Do not widen or narrow the declared range to make a document honest.
- **No new runtime dependency and no build chain.** Nothing here needs `npm install`; the extension runs from source.
- **Do not delete features.** Dead CSS may go, but only item by item after proving nothing references it. A schema key a user may have set is a feature.
- **Do not guess.** If it cannot be measured on this machine, mark it *(needs manual
  confirmation)* in the doc and in `docs/maintenance/open-items.md`.

## Working method

- Four phases, and **stop for confirmation at every phase boundary**: A audit →
  B plan → C implement → D verify and settle the record. Never roll A into C.
- At a real trade-off, present 2–3 options with what each costs and a recommendation.
  The maintainer chooses; do not pick for them and do not proceed on a default.
- Anything a "standard maintained repo" would have that this one lacks is proposed as
  a table (what / why / cost / recommendation) and asked about. Never add it unilaterally.
- **One small change at a time** with its diff and the exact command that verifies it,
  then wait. Split large changes.
- Do not change anything outside this repo directory. Reports, state and progress all
  live in the repo too (`docs/reports/`), not in `$HOME` or `/tmp`.

## Evidence discipline

- **No commit unless the maintainer says to commit** — not even for docs.
- Label every claim: **ran it** (output quoted) / **read it** / **needs a real session**.
  "Verified" without a tier is not a claim.
- Every new check must be **seen failing before it is trusted**: write the assertion
  first, run it red, then implement. A check that cannot fail is decoration.
- A check must run in the branch production actually takes. `test/unit.test.js`
  guarding a helper that `extension.js` does not call guards nothing — that is a
  defect, record it in [docs/maintenance/open-items.md](docs/maintenance/open-items.md).
- Tiers: **L0** `npm test`, **L1** `npm run integration` / `npm run perf` (throwaway
  headless shell), **L2** real session. `CHANGELOG.md` entries name their tier.
- Prefer a verification path that needs no logout. L1 exists for exactly that; go to
  L2 only for what L1 physically cannot observe (the list is in
  [docs/maintenance/verification.md](docs/maintenance/verification.md)).

## Structural rules

- **Touch `enable()` → audit `disable()`, and the reverse.** Every signal, timer,
  actor, keybinding, cancellable and connection added must be reachable from
  `destroy()`. A resource held only in a function-local variable is unreachable:
  `test/teardown-guard.test.js` checks totality against source text, so the fix has to
  name it on `this` for the guard to see it.
- **No Gtk/Gdk import in the shell process.** `prefs.js` runs in its own process and is
  the only place GTK4/libadwaita is allowed.
- **No synchronous IO or heavy computation on the main loop.** That includes local
  `Gio.File.query_exists()` — it is a `stat()` on the compositor's thread.
- **Do not add fragile dependencies on Shell internals.** The current set and their
  file:line are inventoried in
  [docs/maintenance/shell-internals.md](docs/maintenance/shell-internals.md); if a new
  one is unavoidable, isolate it in one place and add it to that inventory.
- **No defensive noise.** No extra `try/catch`, no optional chaining, no fallbacks for
  states that cannot happen. Validate at boundaries (clipboard text, provider replies),
  not between internal functions.
- **No architecture theatre** at this size: no DI container, no event bus, no layered
  abstraction. Split a file when a *measured* pain demands it, not because it is long.
- **Compatibility floor.** `shell-version` declares 45–50, so the floor is whatever the
  *oldest declared major* ships — not what is installed here. `libadwaita` on this
  machine is 1.9.1 (`dpkg -l 'libadwaita-1*'`) and the `Adw-1.typelib` is a versionless
  namespace: **it cannot tell you when a symbol was introduced.** So a new `prefs.js`
  widget (e.g. `Adw.PasswordEntryRow`, `header-suffix`, `AdwToolbarView`) must be
  confirmed against 45 before it ships; if that cannot be proven here, mark it
  *(needs manual confirmation)* rather than assuming the local build proves it.

## Dev & Packaging Scripts

- **Safe Packaging**: Run `bash scripts/pack.sh`. It compiles the GSettings schemas, then
  hands `po/` to `gnome-extensions pack --podir=po`, which shells out to `msgfmt` — gettext
  is **installed on this machine since 2026-10-10** (`msgfmt 0.23.2`), and the script has
  produced a complete zip from the repo directory (unpacked and verified). The
  `command -v msgfmt` check stays at the top of the script and still does real work on any
  other box: without gettext the old run exited 2 *after* deleting the previous zip and
  leaving `/tmp/fast-translate-pack` half-filled. Two things it cannot do yet: the list is
  hand-copied — `test/repo.test.js` ("the packaging list ships exactly what the repo has")
  pins it and both orderings, because a root-level module without a `--extra-source=` line is
  silently missing from the zip — and its last step, `shexli`, **segfaults** here
  (exit 139, core dumped), so the script reports failure even though the zip is fine. It
  copies an **explicit list**, so `docs/`, `test/`, `scripts/` and the root `*.md` never enter
  the zip — adding documentation costs nothing in what ships (confirmed against the built
  artifact, not just the list). It also creates `venv/` **inside the repo**; that name is in
  the same guard's skip set, so do not remove it.
- **A catalog that no other guard likes can still break the build.** `msgfmt` treats an
  obsolete `#~ msgid` as a duplicate of a live one and exits 1, which fails both
  `pack --podir` and `msgmerge`; `test/repo.test.js` ("no catalog defines the same msgid
  twice, obsolete entries included") is the gate. When a string upstream obsoleted comes back
  in this fork's sources, delete the `#~` pair — reviving upstream's translation into the live
  entry is a translation decision, and `msguniq` would make it silently.
- **Every source that declares a `gettext-domain` needs its own coverage guard.** `_()` is not the
  only thing this extension asks gettext to translate: `<schemalist gettext-domain="…">` in
  `schemas/*.gschema.xml` makes its 48 `<summary>`/`<description>` strings translatable too, and the
  `_()`-only guards stayed green while **15 of them were in no catalog** (measured, D-057/D-058).
  The gate is `test/repo.test.js` ("the catalogs carry every string the schemas ask gettext to
  translate", "the schema asks gettext in the domain the extension binds", and the reader's
  tag-count self-check). Another `.gschema.xml` is picked up automatically because the guard globs
  the tree; any *other* translatable source must be added to that guard in the same change — never
  assume the `_()` list covers it. The domain comparison is the second half of the rule: if the
  `<schemalist>` and `metadata.json` ever differ, every schema entry in the catalog is dead weight.
- **Extension Reload**: Run `bash scripts/reload.sh` (executes disable/enable). Measured:
  on GNOME 50 this **does not re-import edited ES modules**, so it can never verify a
  code change — restart the shell, which on Wayland means logging out and in again.
- **Watch Logs**: Run `journalctl -f -o cat /usr/bin/gnome-shell`, and filter with
  `_PID=$(pgrep -x gnome-shell)` — a previous login's shell writes into the same boot stream.
- **Record check**: Run `npm run check:log`. It fails on any commit inside the declared
  coverage window that touched production code without being cited by a `CHANGELOG.md`
  entry. `npm run check:log -- --invariants` prints the recorded `kind: fix` entries so
  `INVARIANTS.md` can stay a pointer file.

## Tests

- **Run the suite**: `npm test`. It chains these checks in order, each failing the run on its own:
  - `node test/unit.test.js` — pure helpers in `translation-helper.js` under plain Node.
  - `node test/teardown-guard.test.js` — source-level gate that `destroy()` is total.
  - `node test/repo.test.js` — repository invariants: every `*.zh-CN.md` in **any**
    directory has an English twin with the same `##` count and the same language-switcher
    opener, and no doc uses task boxes. The pairing scope is all directories on purpose —
    `docs/maintenance/` is bilingual, so a topic pair drifting out of step must go red.
  - `gjs -m test/signing-crosscheck.js` — GLib signing primitives vs the `node:crypto` vectors.
  - `gjs -m test/prefs-validator.js` — `prefs.js` layout under Gtk/Adw. Its settings mock
    implements only `get_key`, `get_range`, `get_enum`, `set_enum`, `connect`, `bind`,
    `get_strv`, so any other `Gio.Settings` method fails here first. It asserts nothing
    about rows, subtitles, defaults or reset.
- The last two steps need `gjs`; `prefs-validator.js` additionally needs a display and the GTK4
  and libadwaita typelibs, so it only runs on a desktop session, not headless.
- `npm run test:coverage` — Node's built-in coverage (`--experimental-test-coverage`) over the three plain-Node suites (`unit`, `teardown-guard`, `repo`). The report also lists the test files; read the `translation-helper.js` row for the product module. A **reading, not a gate** (no threshold); `extension.js`, `prefs.js` and `signing.js` are shell-bound.
- **Integration / perf probes**: `npm run integration` and `npm run perf` drive a live shell;
  they are not part of `npm test`. Both must write **nothing** outside their temp dir —
  `GSETTINGS_BACKEND=memory` is what guarantees that, and `test/integration.sh` and
  `test/perf-probe.sh` share one isolation recipe: if the recipe changes, change both.
- **L2 instrument**: `gjs -m test/l2-prefs-dump.mjs apps|tree <name>` reads a *live* session's
  rendered windows through the a11y bus (screenshots are denied to an agent on GNOME 50). It is
  neither in `npm test` nor in CI — it needs a desktop session — and it deliberately never prints
  the value of an editable field, because those fields hold provider credentials.
- `npm test` never loads `extension.js` — `gi://` does not exist under plain Node.

## CI

- `.github/workflows/ci.yml` runs on every push and pull request (`ubuntu-latest`, Node 20):
  `node test/unit.test.js`, `node test/teardown-guard.test.js`, `node test/repo.test.js`, then
  `npm run check:log`.
- CI is **desktop-free on purpose**: it does not install `gjs`, so the two `gjs -m` steps of
  `npm test` are excluded. `prefs-validator.js` calls `Gtk.init()` and fails without a display,
  so the full `npm test` is a local/desktop gate, not a CI one.
- `checkout` uses `fetch-depth: 0` because `check:log` walks `git log` back to the coverage
  anchor in `CHANGELOG.md`; a shallow clone cannot resolve that window.
- **Keep CI in step with the code.** Update `.github/workflows/ci.yml` in the *same change* that
  makes it stale — never as a later cleanup.
- **Because CI lists the Node test files explicitly** (rather than running `npm test`), adding or
  renaming a Node test file means adding/renaming it in the workflow too. The two `gjs` steps stay
  out of CI on purpose (they need a display + GTK4/libadwaita typelibs) — keep it that way unless a
  headless display is set up.
- **Environment changes** — a new dependency, a Node version bump, or a new system tool — mean
  updating the workflow's setup/install steps.
- **Renamed or moved code**: `check:log` watches a declared list (`CODE_PATHS` in
  `scripts/check-log.mjs`). If a watched file moves, update that list; the check goes red until you do.
- **After a refactor**, confirm CI still exercises the real code and the declared paths still cover
  it. A green CI that no longer touches the changed code is worse than a red one.
- **A new verification tier** (headless / live) — decide explicitly whether CI runs it; do not add it silently.
- If what CI runs changes, update this section too. CI is a signal, not a gate, until branch protection
  is enabled — read the result after every push.

## Release / version

- The released version is the integer `version` in `metadata.json` — nothing else carries it:
  `jq -r .version metadata.json`. Bump it by one in the same commit that changes the shipped
  extension (code, schema or `shell-version`), and only for a change intended to reach users.
- Docs-only, test-only and CI-only changes do not bump it.
- Batching several code changes into one bump is the established practice here. Do not
  remember how many bumps happened; list them: `git log --format='%h %s' -- metadata.json`.

## Docs & Commits

- `README.md`/`README.zh-CN.md`, `MAINTENANCE.md`/`.zh-CN.md`,
  `INVARIANTS.md`/`.zh-CN.md` and every `docs/maintenance/*` pair are one document in two
  languages. `test/repo.test.js` enforces the pairing across all directories; a doc with no
  `*.zh-CN.md` sibling is allowed to be English-only (that is how `docs/reports/` stays), but
  a `*.zh-CN.md` with no English twin is a build failure.
- Operational knowledge has exactly one owner. `MAINTENANCE.md` is a router: it points, and
  keeps inline only what has no other home — the read-first section, packaging/translations,
  the privacy boundary and the platform facts. Never copy a fact from `docs/maintenance/*`
  back into it.
- Commit code first, docs in a separate commit; Chinese subjects with English
  conventional-commit prefixes. The prefixes in use here are wider than the classic set —
  print them instead of trusting this line:
  `git log --format='%s' 420251c..HEAD | sed -E 's/^([a-z]+).*/\1/' | sort | uniq -c | sort -rn`.
- Commit prefixes are **not** the `kind` vocabulary in `CHANGELOG.md`. Two different lists,
  do not merge them.
- One exception is legitimate and named: `aba4c8b`, where the wrong wording *was* the defect,
  so text and code could not be separated.
- **Never state an aggregate count in a document; print it from the command instead.** This
  covers commit counts, entry counts, section counts and dependency counts.
- **Do not record which transport or URL `origin` uses.** That is configuration on one clone of the
  maintainer's machine, and a repo doc is read everywhere: written as a fact it is false for every
  other clone and it silently rots the moment the remote changes. Document the *check* instead —
  `git ls-remote origin refs/heads/master` compared against `git rev-parse HEAD`, which is how
  "is it pushed?" gets answered without trusting a local tracking ref. (Tool availability is
  different and is recorded on purpose where it changes behavior, e.g. gettext in
  `MAINTENANCE.md` §10: that one is a property of the target environment, and docs say what breaks
  without it.)
- **Privacy in prose and in code alike.** No `Symptom`, log line, notification body or doc may
  quote clipboard content or credentials. Whatever is double-copied is sent to a third party —
  the maintainer-facing boundary is `MAINTENANCE.md` §11, and the settings window now says the
  same thing per provider (D-038), so new outward calls must be added to *both*. Keys live in
  dconf only, never in git, logs or a URL query. **Proving** the harness writes nothing to dconf
  is done with `sha256sum ~/.config/dconf/user`; a `dconf dump`/`gsettings get` of this schema
  prints the keys themselves into whatever log the run is redirected to, so no repo script may
  run one — `test/repo.test.js` ("a probe reads the settings store only as a hash") enforces it.

## Recording conventions

- Behaviour changes land in `CHANGELOG.md` as `D-###` entries; ids are monotonic and **never
  reused**, so a gap means an entry was deleted — `check:log` treats that as a failure.
- `kind` ∈ `fix` | `perf` | `taste` | `guard` | `revert` | `chore`, cut by **who may demand a revert**: dropping it
  makes a bug → `fix`; dropping it only re-introduces measurable degradation → `perf`; dropping it
  only annoys me → `taste` (zero obligation; on an upgrade it may
  be discarded wholesale). A change that is both splits into two entries — done so here: `5843765`
  is recorded as `D-007` (the height ratchet, a defect) and `D-008` (the 60 % cap, a preference).
  Withdrawals are recorded too. Cleanup owed nothing either way (dead code, wrong comments,
  naming) is `chore`; none is recorded here yet, but the checker accepts the value so this fork
  and its sibling forks share one vocabulary.
- An entry is an assertion **as of its commit**, not current state: never re-verify an old entry,
  never hand-copy an aggregate count into the file (`check:log` prints both counts).
- Known-but-not-fixed issues do **not** go in `CHANGELOG.md` — they have no commit. They live in
  [docs/maintenance/open-items.md](docs/maintenance/open-items.md), and only there.
- `Symptom` names the mechanism, never the session: no window titles, no clipboard contents, no
  translated text, no provider credentials. This repo sends user text to third-party providers;
  the record must not quote any of it (privacy boundary: `MAINTENANCE.md` §11).
- A window containing zero entries is a failure, not a pass: either the window starts where real
  deviations exist, or the header says there are none.
