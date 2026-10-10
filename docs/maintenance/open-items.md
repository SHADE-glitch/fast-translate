<p align="right"><a href="open-items.md"><b>English</b></a> | <a href="open-items.zh-CN.md">简体中文</a> · <a href="../../MAINTENANCE.md">Handbook</a></p>

# Open items

The single place for "known but not fixed". `CHANGELOG.md` records what was done
and cannot hold an unfixed thing (it has no commit), and `docs/reports/AUDIT.md`
is a snapshot as of its own commit — so if it is not here, it was forgotten on
purpose. Split out of `MAINTENANCE.md` §13.

Status words used below: **queued** = agreed, waiting on the next code approval;
**deferred** = known, explicitly not this round; **won't** = examined and judged
not worth its cost, reopen only with new evidence.

## 1. Providers and credentials

- Baidu's and Youdao's language tables are **deliberately incomplete**: their
  official docs render the tables client-side and there are no credentials to
  probe. Omitted codes return a clear local message; a wrong code would return an
  opaque HTTP 200 error body. Needs re-verification with real credentials.
- Baidu / Youdao are architecture-complete but **never exercised end to end** —
  no credentials. Tencent (TC3-HMAC-SHA256), Aliyun (HMAC-SHA1 RPC) and Huawei
  (SDK-HMAC-SHA256) need no new dependency: GLib covers them natively.
- **A Google 429 from `curl` is a curl artifact, not an extension bug.**
  `translate.googleapis.com…client=gtx` answers 429 to curl but 200 to Soup (the
  extension's client). Reproduce Google failures with a `Soup`/`gjs` probe, never
  curl. The extension now uses `clients5.google.com…client=dict-chrome-ex` — the
  endpoint that returns the dictionary sections.

## 2. Behaviour that is unverified, not fixed

- **RTL: measured, and CSS cannot express it.** `StThemeNode.get_text_align()` is bound in this
  stack, so the value table was read directly on 50.1: `left`→0, `center`→1, `right`→2, but
  `start`→0 and `end`→0 — identical to an unrecognised keyword (`banana`→0) and unchanged when
  the actor's `text-direction` is set to RTL. So St parses the keywords and maps them to LEFT;
  `text-align: start` is **not** direction-relative here and cannot fix the warning label. The
  only lever is choosing `left`/`right` from JS by language pair, which is a behaviour change
  waiting for the maintainer; the header arrow still points `➜` for RTL pairs.
  `test/eval-test.js` Test 5 pins these values, so if a future St becomes direction-aware the
  suite goes red instead of the fix quietly becoming possible by accident.
- **Dest-pane whitespace: the mechanism is now measured, the look is not.** A vertical scrollbar
  withholds **8 px** (asserted at L1: a 300 px `St.ScrollView` lays its child out at 292, and
  the card's destination label goes 650→642 through `_applyHeightCaps()`), while
  `SCROLLBAR_ESTIMATE` is deliberately 16 — so the wrap is measured 8 px narrower than it will
  be, which makes the pinned height a little too tall. That is the slack. Whether any of it is
  visible on a real card still needs a human look in a live session; the number itself is no
  longer an unknown.
- The popup's real-session behaviours and the ~40 ms/30 s idle delta source
  (if it resolves at all with more windows) remain unattributed.
- **`shell-version` declares 45–50, but 45–49 have never been run.** Every number
  in this repo comes from 50.1. See
  [compatibility-matrix.md](compatibility-matrix.md).

## 3. Deliberately partial features — do not "complete" these unilaterally

- **The dictionary card (D-021, D-023, D-025, D-028) is Google-only and partial.** Only
  Google returns dictionary data; DeepL/Baidu return none (Youdao would, but needs
  a key). A single word is routed to Google even when another service is selected
  (D-022, `looksLikeWord`); prose keeps the selected service. The card is a
  structured set of actors — a translation headline, phonetic, POS-grouped terms,
  examples, then synonyms (`d[11]`) and monolingual definitions (`d[12]`), each
  with its own style class. The display is capped (6 POS, 20 terms, 5 examples,
  2 synonym/definition blocks) even though Google returns more. Synonyms and
  definitions are English-only: a ZH→EN headword gets neither in the forward
  reply, so it is looked up back EN→ZH and merged (D-028, `_enrichZhToEnDict` /
  `mergeEnrichedDict`) — the card shows first and is completed in the background;
  a failed or slow (6 s) enrich silently keeps the forward card. The copy button
  copies the translation, not the card. Google replies **bypass the LRU cache**
  because the response shape varies (word vs sentence); the 2.5 s same-text
  cooldown still absorbs rapid re-triggers.
- **Auto-direction (D-024, D-026, D-027) covers only the ZH/EN pair and only words.** A
  word whose detected language equals the configured target flips the pair
  (`resolveDirection`); the detector recognises Han → ZH and Latin → EN, nothing
  else. Prose keeps the configured direction. An `AUTO` source has its own branch:
  when the detected language equals the target's base code it is flipped to the
  ZH<->EN counterpart (D-027), which removes the echo when the default AUTO→EN
  copies an English word. The card header shows the effective direction (D-026)
  and, for an AUTO source, is refreshed with the `detectedLang` from the Google
  reply (D-027, `applyDetectedSource`); ⇄ swaps that displayed pair, so the title
  can no longer disagree with the card; a swap is transient and never rewrites the
  configured `source-lang`/`target-lang`.
- **`looksLikeWord` is a conservative heuristic.** A token with no whitespace,
  ≤ 40 code points and no sentence punctuation counts as a word. A CJK fragment
  with no spaces and no punctuation is therefore indistinguishable from a CJK
  word and is sent to Google; the cost is only that Google, not the selected
  provider, translates that fragment.
- **prefs does not filter the language dropdowns per provider.** Baidu still
  accepts six selections its table rejects (ID, LT, LV, SK, SL, TR); the fix was
  to name the offending pair in the error instead of hiding choices, because
  filtering a shared enum would have made the preference row depend on provider
  state and could hide a language the user had already saved.
- The five legacy schema keys (`auto-copy`, `auto-paste`, `auto-translate`,
  `keybinding-translate-clipboard`, `shortcut-enabled`) are annotated in the
  schema but deliberately **not removed** — deleting them would discard stored
  values and constitutes feature removal.
- **`po/` is hand-maintained and the guards are the coverage check.** gettext has been
  installed here since 2026-10-10, so `scripts/update-po.sh` runs — but `scripts/update-pot.sh`
  must **not** be used: measured on this fork it rewrites the template so that one
  `// Translators:` hint disappears (`extension.js:1534`, the `%s` single-request-limit
  sentence) and 43 entries per locale become orphans, which puts five repository guards red.
  `test/repo.test.js` therefore still asserts that every `_()` literal appears in
  `messages.pot` **and** in each of de/es/nl, that no catalog carries a msgid the template has
  lost, that no catalog defines one msgid twice (obsolete `#~` included — see the packaging
  bullet in `MAINTENANCE.md` §10), and that every `// Translators:` hint reaches all four files
  as a `#.` comment. The D-021 part-of-speech msgids are live strings
  (`extension.js:102-103`); they used to be inert because no `.mo` existed at all, and now they
  are compiled but still untranslated, so they render as the English source either way.
- What is still owed on `po/`: **entries the sources no longer request** — and the honest count
  is smaller than the 74 recorded here for a month, because `schemas/*.gschema.xml` is a second
  translatable source (`<summary>`/`<description>`, same gettext-domain) that the earlier tally
  counted as dead. Print both sets instead of trusting either number:
  `xgettext --from-code=UTF-8 --add-comments=Translators -o - -- *.js schemas/*.xml | grep -c '^msgid '`
  is what gettext says the sources ask for, and diffing that template against `po/messages.pot`
  with `msgcomm` lists exactly what a regeneration would retire. Deleting those entries means
  editing what three named translators wrote, so it waits for the maintainer. Their `#:`
  references are also upstream-era line numbers: measured per locale on 2026-10-10, 38 of the
  reference tokens on *live* JS strings point somewhere other than the actual `_()` call, across
  27 entries, and 28 more sit on the gschema entries. The template itself is clean (119 tokens on
  live entries, 0 stale), because the fork recomputed refs wherever it added or changed an entry
  and left the translator's lines alone.
- **The catalog guard's scope is JS, so the schema's own translatable strings can drift with every
  guard green.** `test/repo.test.js` reads `TRANSLATED = ["extension.js", "prefs.js",
  "translation-helper.js"]`; `schemas/*.gschema.xml` declares `gettext-domain` on its `<schemalist>`
  and so asks gettext for `<summary>`/`<description>` strings too, but nothing asserts they arrive.
  Measured 2026-10-10: the sources request 161 content msgids, the template holds 189, 146 are
  common — so **15 requested by the schema are absent from `po/messages.pot`** (and from de/es/nl:
  sampled `Baidu Translate APP ID`, `Show panel icon`, `Close floating window` — 0 hits in each),
  while 43 template entries are no longer requested. The 15 are not a missing-generator artifact: the
  schema rows in the template still carry the *pre-Baidu/Youdao* wording, e.g. msgid
  `"The translation service to use (DeepL or Google Translate)"` against the schema's now
  `(Google Translate, DeepL, Baidu or Youdao)`. So a fork that renames a service or adds a key
  silently de-translates its own settings schema. **Owed, and it cannot simply be gated:** a guard
  asserting "every msgid the schema requests is in the template" is red right now, so it needs the
  15 backfilled (empty `msgstr` — no invented text) in the same change, and the 43 deletions are the
  maintainer's call. Print it rather than trusting this sentence:
  `xgettext --from-code=UTF-8 --add-comments=Translators -o - -- *.js schemas/*.xml` vs
  `po/messages.pot`, and `msgcomm` for the intersection. Whether a schema `description` is *rendered*
  translated also depends on whoever compiles the schema passing `--gettext-package`, which this
  machine has never observed *(needs manual confirmation)*.
- **The `.mo` ships less than the catalog appears to hold.** `msgfmt` writes only entries whose
  `msgstr` is non-empty *and* not `#, fuzzy`, so the translated rows each locale really ships is
  the `translated` figure of
  `msgfmt --statistics -c -o /dev/null po/de.po` — and the fuzzy ones (10 in de/nl, 29 in es) stay
  invisible until a translator clears the flag. Nothing here decides that; it is translation work.

## 4. A guard that does not guard the branch production runs

- **`swapLanguages` was unit-tested but not called by `extension.js`.**
  `test/unit.test.js` asserted its `AUTO` guard (section "swapLanguages guard"), and
  the decision was genuinely in force at runtime — but `onSwap` carried an **inline
  copy** of it, so that L0 row passed whether or not production behaved, and a future
  edit could break the inline branch while Node stayed green. Fixed (D-032): `onSwap`
  delegates to the helper, and `test/repo.test.js` now lists every pure decision an
  L0 test pins and asserts `extension.js` actually calls it — the class of defect, not
  just this instance.
- `parseLanguageName` and `detectLang` are exported from `translation-helper.js`
  and referenced only by `test/unit.test.js`. **deferred**: they are not dead
  weight to be deleted on sight — a test that pins request/signing behaviour is
  worth more than a clean export list, especially for the two providers that have
  no credentials to probe. They are deliberately absent from the call-site list in
  `test/repo.test.js`, which currently covers the five decisions whose behaviour a
  user can hit; adding them there is the cheap half of what is still owed.
- `test/prefs-validator.js` no longer just checks that `fillPreferencesWindow()` does not
  throw: it renders all four providers, asserts the disclosed hostname in each, counts the
  seven restore/clear rows and drives them in two clicks, and toggles the Escape switch
  both ways. What it still cannot do is validate key *names* — `Gio.Settings` is a mock that
  records calls, so a reset list containing a key the schema does not have passes here and
  only shows up on a live shell. Three of its assertion groups (hostname disclosure, the
  two-pass reset counts, the `strv` round trip) were written against code that already
  existed and have not each been provoked red; see `verification.md` §3.
- **What the docs gate still does not check.** The link/anchor sweep is now a real gate
  (`test/docs-lint.mjs`, recorded as D-048), so the two residual gaps are these, and neither is
  cheap: (1) the bilingual *pairing* guard only compares `##` counts and the language-switcher
  opener — nothing notices if a zh paragraph loses a sentence its English twin keeps, so a topic
  pair can go semantically out of step while every gate stays green; (2) nothing proves a stated
  *number* in prose still matches the machine (the rule is "print it from the command", but prose
  written earlier can rot). **Deferred**: (1) needs a paragraph-level alignment check, which is a
  real algorithm rather than a regex, and would flag deliberate rewordings; (2) has no ground
  truth to compare against unless every count is generated from the file it describes.
- **What the packaging guard still cannot answer.** `test/repo.test.js` ("the packaging list ships
  exactly what the repo has", D-052) pins the *shape and order* of `scripts/pack.sh`'s list. Since
  2026-10-10 a zip has actually been built from this repo and unpacked, and that closed three of
  the four questions it used to leave open: `--extra-source=icons` does carry every file under
  `icons/` (18 in, 18 out, byte-identical), the shipped root files are byte-identical to the repo,
  and `docs/`, `test/`, `scripts/` and the root `*.md` really are absent from the artifact. It also
  settled `schemas/gschemas.compiled`: the tool **never** packs it, even when it sits in the staging
  tree (measured with a control), and the installed extensions on this machine each have a compiled
  file whose mtime is far later than their `.xml` — so it is generated locally, not shipped. Still
  unproven, and none of it is code: that a built zip **installs and loads** (`gnome-extensions
  install` is forbidden from this directory because this repo *is* the live extension dir), and that
  the compiled `.mo` actually renders translated text in a real session — no `de`/`es`/`nl` locale is
  generated here (`locale -a` answers zero of them), so a German UI cannot be observed on this box
  *(maintainer's call: generate a locale, or leave the claim open)*.
- **`scripts/pack.sh` cannot exit 0 on this machine.** Its last step installs `shexli` (0.2.1) in a
  repo-local `venv/` and runs it under Python 3.14.4, which **segfaults** (`Segmentation fault (core
  dumped)`, exit 139) on a zip that unpacks perfectly — reproduced twice, once inside the script and
  once standalone. So a non-zero exit from `pack.sh` currently means nothing about the artifact; read
  the `✅ Packaging complete:` line and inspect the zip. Untouched so far because changing it is a
  dependency decision, not a bug fix.
- **What the L2 reader still cannot answer.** Our own prefs window has been read off a live session
  for **all four** providers (`gjs -m test/l2-prefs-dump.mjs`, D-049/D-050 — group titles, the four
  disclosure sentences, restore rows counting 4/2/3/3 vs 3, the masked secret field), so the old
  "never seen by a human since C3" gap is closed for structure and copy. What remains is not an
  instrument problem: (1) the a11y tree carries text and states but no geometry, so whether the long
  disclosure sentence *wraps legibly* in a narrow window is still a human verdict; (2) the floating
  card has never appeared on the a11y bus at all — the shell exposes only window and surface panels —
  so the popup, its light/dark variants and its monitor placement have no agent-side instrument, and
  the double-copy trigger cannot be faked without destroying the clipboard's non-text types.

## 5. Deferred defects and their current status

Decided on 2026-10-09: that round covered stability and structure only, so the
privacy and settings group was recorded rather than fixed. Each item below is
verified by reading the code, not inferred; the items fixed since are kept here with
their record rather than deleted, so the discovery path is not lost.

- **A failed translation in background mode was invisible.** `extension.js:721`
  requires `!isBackground` for the inline error path, and `fail()` only calls
  `Main.notify` when `notifications` is true, whose schema default was **false**, so
  with defaults nothing at all happened on failure. `_showError()` (`extension.js:1282`)
  notifies unconditionally but is reached only from the exception path at `:649`, never
  from a provider failure. Fixed (D-036): the default is now true, and
  `test/repo.test.js` pins the default against the copy that describes it.
- **The background success toast quoted the user's own text.**
  `extension.js:687` calls `Main.notify` with the title "Translated" and a body built as
  `requestText + " → " + toText` — source and translation in one notification body, which
  is also readable from the lock screen. It also contradicted the row above it: the
  background-mode switch says *silent* while `floating-background-toast` defaulted to true.
  Fixed (D-037): the default is now false and that row's subtitle names both halves of the
  body, so the choice is made with the leak described rather than hidden.
- **prefs said nothing about where the text goes.** There was no user-visible statement
  that the copied text leaves the machine, and single words additionally went to Google
  regardless of the selected service (§3 above) undisclosed. Fixed (D-038): the service
  row's subtitle is now built per provider from `PROVIDERS.host` and names the endpoint the
  `url` setting holds for DeepL, plus the single-word routing. *Decided and still in force:
  disclose only — no new switch, no narrowing (narrowing would regress the dictionary
  card).* The disclosed host is cross-checked against the URL each builder actually
  produces (`test/unit.test.js`), because a privacy line that names the wrong party is
  worse than none.
- **No restore-to-defaults affordance existed at all.** Fixed (D-039): every
  non-credential section carries a row that calls `reset_keys` with exactly its own keys,
  and the three credential sections carry a two-click row (first arms, second erases)
  instead — a reset that silently discards an issued key is not a restore.
- **The shipped settings window contradicted its own package**: `prefs.js` "Project
  Homepage" pointed at `github.com/tazztone/translate-assistant` while `metadata.json`'s
  `url` names this fork, and the About page had no license row. Fixed (D-040): the fork row
  reads `this.metadata.url` so the two cannot disagree, the upstream keeps its own
  clickable row for attribution, and a License row states MIT plus the holders named in
  `LICENSE`. `LICENSE` itself is untouched and no legal conclusion is drawn here.
- The six `Adw.EntryRow`s (DeepL URL, DeepL key, Baidu appid/secret, Youdao
  appid/secret) carry no plain-language help **because they cannot**: `AdwEntryRow` has no
  `subtitle` property, and adding one to the constructor failed with
  `TypeError: No property subtitle on AdwEntryRow` under `gjs -m test/prefs-validator.js`.
  The explanation therefore lives in each group's `description`, which now names which of
  the two fields is the secret one (§6).
- `keybinding-close-floating-window` is live (`extension.js:49`, `:384`) and is now
  reachable from prefs as an on/off switch (D-041): disabling stores the binding it
  removed and re-enabling restores that, falling back to the schema's own default. It is
  deliberately **not** a key editor — see §6.
- **`updateServiceVisibility()` hardcoded `service === 0/2/3`** (`prefs.js:468-476`
  today), duplicating the `PROVIDERS` table in a second file: reorder or append a
  provider and the settings window shows another provider's key fields. Fixed (D-033)
  — `PROVIDERS` now declares `credentialGroup` and `supportsFormatting` and prefs reads
  them, which is also the landing point the disclosure item above was waiting for.
- **`_enrichZhToEnDict` leaked a source past `disable()`** — its `cancellable` and
  `watchdogId` were function-locals, so `destroy()` could not reach a 6 s timer and an
  in-flight request. Fixed (D-030) and now pinned twice: at L0 by
  `test/teardown-guard.test.js` and at L1 by `eval-test.js` Test 3i.
- **Fixing that leak is what exposed a bigger one**: the enrich request had *never been
  sent at all* (D-029). Its spec came from a builder that omitted `method`, so
  `Soup.Message.new` threw and the caller's `catch` turned a dead feature into the
  documented "best-effort, silently keeps the forward card" appearance. The standing
  lesson is in `verification.md`: **a measurement taken outside the production call
  chain proves nothing about the feature.**
- **Two synchronous `Gio.File.query_exists()` calls ran on the shell main thread**
  per icon refresh, probing `.svg` then `.png`. Fixed (D-034): the icon path names the
  shipped file directly and `test/repo.test.js` asserts those files exist, so existence
  became a repository property instead of a runtime probe. Measured cost of what was
  removed: ≈5.8 µs per refresh with a warm cache — recorded as `chore`, not `perf`.
  The guard that proves it also had to be fixed, because it first matched the comment
  describing the removal: whole-line comments are now stripped before any "this call is
  gone" assertion (`srcCode()` in `test/repo.test.js`).

## 6. Examined: not worth the cost, or not achievable from this machine (reopen only with new evidence)

- **`St.ScrollView` → `St.Clip`**: won't. `St.Clip` has no scrollbars or kinetic
  scrolling, and the two call sites are entangled with the measured height/cap
  fixes; the churn risks those for zero user-visible gain.
- **Rewriting the popup onto native style classes and named colors**: won't for now.
  The surfaces are hand-copied Yaru constants across `stylesheet-light.css` /
  `stylesheet-dark.css`; a full theme pass collides with the shell-wide-CSS hazard
  in `INVARIANTS.md` and re-opens every popup measurement.
- **Replacing `⇄`, `➜` and the flag-emoji language labels with symbolic icons**:
  won't yet. `➜` is also the unresolved RTL question in §2; flag emoji live in 27+28
  schema enum nicknames, so changing them is a schema change for an aesthetic gain.
- **A per-field subtitle on the credential rows**: cannot, not merely declined.
  `AdwEntryRow` exposes no `subtitle` property (measured: the validator raises
  `TypeError: No property subtitle on AdwEntryRow`), so group `description` is the only
  slot that renders explanatory prose for those rows.
- **Replacing the link rows' hand-made buttons with `Adw.ActionRow:activatable-uri`**:
  won't from this machine. It would drop two `Gtk.Button` suffixes and a
  `launch_default_for_uri` call, but `shell-version` declares 45 and `Adw-1.typelib` is a
  versionless namespace, so the property's introduction version cannot be proven here —
  shipping an unprovable symbol trades a cosmetic win for a crash on the oldest declared
  release. *(needs manual confirmation against GNOME 45 before it can be reconsidered.)*
- **A key editor for the Escape binding**: won't. libadwaita's key-capture widget carries
  the same unprovability problem, and hand-rolling one means a new fragile dependency on
  private keybinding plumbing to change a single accelerator. The on/off switch (D-041)
  covers the case a user can actually state: "I do not want Escape taken".
- **Undoing the JS↔CSS pixel coupling** (`CHROME = 232`, `budget*0.60`,
  `SCROLLBAR_ESTIMATE = 16`, `width: 650px`): won't. Unifying the two sides means
  reading geometry out of CSS at runtime, which is the main-thread IO this file lists
  as a defect elsewhere. What was owed is done instead (D-035): every constant now
  names the declaration it mirrors, and `test/repo.test.js` recomputes the card's
  content width from the stylesheet and compares it with the literal in `extension.js`,
  so the two can no longer drift in silence.
