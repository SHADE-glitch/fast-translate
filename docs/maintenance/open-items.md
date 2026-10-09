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

- **RTL is unverified, not fixed.** No `text-align` value table could be read out
  of `libst`, and Yaru's CSS offers no precedent, so whether St accepts
  `text-align: start` is unknown. The warning label is left `left`-aligned and the
  header arrow still points `➜` for RTL pairs. Do not change this without proving
  the value is accepted.
- **Dest-pane whitespace after the per-region cap fix is unmeasured.** The bug was
  a few px of slack rather than a functional failure, and asserting it in the shell
  would mean duplicating private layout maths, so no dedicated test was added.
  Existing suites prove no regression only; whether the destination pane still
  shows stray blank space needs a human look in a real session.
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
- New `_()` part-of-speech msgids (D-021) are not in `po/` (gettext absent) —
  inert today, like the rest of the catalog (no `.mo` files exist).
- `po/` cannot be regenerated on this machine (gettext absent).

## 4. A guard that does not guard the branch production runs

- **`swapLanguages` is unit-tested but not called by `extension.js`.**
  `test/unit.test.js` asserts its `AUTO` guard (section "swapLanguages guard"), and
  the decision is genuinely in force at runtime — but `onSwap` carries an **inline
  copy** of it (`grep -c swapLanguages extension.js` → 0). So that L0 row passes
  whether or not production behaves, and a future edit can break the inline branch
  while Node stays green. **queued**: make `onSwap` call the helper, or delete the
  helper and move the assertion to L1 — one source of truth either way.
- `parseLanguageName` and `detectLang` are exported from `translation-helper.js`
  and referenced only by `test/unit.test.js`. **deferred**: they are not dead
  weight to be deleted on sight — a test that pins request/signing behaviour is
  worth more than a clean export list, especially for the two providers that have
  no credentials to probe. What is owed is a statement of which exports production
  actually references, so "probably dead" becomes a checked fact.
- `test/prefs-validator.js` asserts only that `fillPreferencesWindow()` does not
  throw. Its settings mock implements `get_key`, `get_range`, `get_enum`,
  `set_enum`, `connect`, `bind`, `get_strv` and nothing else, so a `prefs.js` that
  calls any other `Gio.Settings` method fails *here* first — which is the point,
  but it means no row, subtitle, default or reset behaviour is covered at L0.

## 5. Deferred defects and their current status

Decided on 2026-10-09: that round covered stability and structure only, so the
privacy and settings group was recorded rather than fixed. Each item below is
verified by reading the code, not inferred; two stability items that lived in the
same list have since been fixed and are kept here with their record, so the
discovery path is not lost.

- **A failed translation in background mode is invisible.** `extension.js:716`
  requires `!isBackground` for the inline error path, and `fail()` only calls
  `Main.notify` when `notifications` is true, whose schema default is **false**.
  With defaults, nothing at all happens on failure.
- **The background success toast quotes the user's own text.**
  `extension.js:682` calls `Main.notify` with the title "Translated" and a body
  built as `requestText + " → " + toText` — the source and the translation in one
  notification body, which also shows on the lock screen. This sits against the
  repo's own privacy stance.
- **prefs says nothing about where the text goes.** No user-visible statement that
  the copied text leaves the machine, per provider. Single words additionally go to
  Google regardless of the selected service (§3 above), undisclosed. *Decided: disclose
  only — no new switch, no narrowing (narrowing would regress the dictionary card).*
- **No restore-to-defaults affordance exists at all** (`grep reset prefs.js` → nothing).
- `prefs.js:305-318` "Project Homepage" points at `github.com/tazztone/translate-assistant`
  while `metadata.json url` points at this fork — a contradiction inside the shipped
  settings window. The About page has no license row.
- The six `Adw.EntryRow`s (DeepL URL, DeepL key, Baidu appid/secret, Youdao
  appid/secret) carry no plain-language subtitle, while 14 of the 23 rows do.
- `keybinding-close-floating-window` is live (`extension.js:49`, `:379`) but is not
  exposed in prefs; a key-editor row is what it would actually need.
- `updateServiceVisibility()` (`prefs.js:337-346`) hardcodes `service === 0/2/3`,
  duplicating the `PROVIDERS` table. **queued** as the enabler for the disclosure
  above.
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
- Two synchronous `Gio.File.query_exists()` calls on the shell main thread per
  icon refresh (`extension.js:1286`, `:1289`). **queued**, low priority: the path
  runs only when the theme or `darktheme` changes.

## 6. Examined and judged not worth the cost (reopen only with new evidence)

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
- **Undoing the JS↔CSS pixel coupling** (`CHROME = 232`, `budget*0.60`,
  `SCROLLBAR_ESTIMATE = 16`, `width: 650px`): won't. The brittle-anchor table in
  [verification.md](verification.md) already pins what they must agree with;
  only cross-reference comments are owed.
