<p align="right"><a href="README.md"><b>English</b></a> | <a href="README.zh-CN.md">简体中文</a></p>

# Fast Translate — Local Maintenance Fork

Instant translation from a double copy — Google Translate and DeepL in your GNOME Shell.

![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-45--50-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Based on: translate-assistant](https://img.shields.io/badge/based%20on-translate--assistant-orange)
[![Repository](https://img.shields.io/badge/repository-GitHub-black?logo=github)](https://github.com/SHADE-glitch/fast-translate)

## 📖 About

This repository is a **personal maintenance fork** of **Fast Translate**, which is itself a modernized fork of the original [**translate-assistant**](https://github.com/atareao/translate-assistant) by [Lorenzo Carbonell (atareao)](https://github.com/atareao).

Fork lineage:

```
atareao/translate-assistant  →  tazztone/fast-translate  →  this fork (fast-translate@local)
```

It is **not** affiliated with or endorsed by either upstream author. This fork narrows the extension to a single, focused workflow — **translate the text you just copied** — and hardens it: an LRU cache, a request watchdog, precise self-echo suppression, and a fix for DeepL regional source codes.

## ✨ Features

- **Double-copy instant translation** — copy text normally, then press `Ctrl+C` again within ~500 ms to translate it. No menus, no window switching.
- **Floating translation window** — a draggable, re-centering popup showing the source and target languages, with **swap** and **copy** buttons and optional auto-copy.
- **Dictionary card** — double-copy a single word and the popup shows a structured dictionary entry instead of a bare translation: a translation headline, phonetic, part-of-speech-grouped meanings, example sentences, synonyms and English definitions, each rendered as its own styled element. A single word is looked up on Google — the only backend that returns dictionary data — even when another service is selected; sentences and paragraphs still use the selected service. When a word's language matches the target, the direction flips automatically — an Auto source included — and the popup header follows that direction (an English word while set to ZH→EN yields EN→ZH; with an Auto source the header switches to the language Google actually detected). A Chinese word translated into English, where Google returns only the bilingual term list, is enriched by a reverse lookup so synonyms and English definitions still appear. (D-021, D-022, D-023, D-024, D-025, D-026, D-027, D-028)
- **Background mode** — translate silently and write the result straight to the clipboard, ready to paste, with an optional desktop toast notification.
- **Four backends** — **Google Translate** (no API key, works out of the box), **DeepL** (Free and Pro tiers), and **Baidu** / **Youdao** (each with its own credentials).
- **Inline language selection** — source and target pickers in the preferences; the card header labels both languages with their flag emoji.
- **Robustness** — an LRU translation cache (50 entries), a 12-second request watchdog, a native `St.Spinner` loading state, friendly network-error messages, and precise self-echo suppression so your own copies are never mistaken for new input.

## 🖌️ Screenshots

![Floating translation window triggered by the double-copy shortcut](screenshots/CTRLCC.webp)

## 🧰 Prerequisites

| Requirement | Details |
|---|---|
| OS | Ubuntu (verified on Ubuntu 26.04) — other distributions are **unverified** |
| GNOME Shell | 45 – 50 |
| Build tools | `glib-compile-schemas` (from `libglib2.0-bin`) and `msgfmt` (from `gettext`) — needed once, to compile the GSettings schema and the translations after cloning |
| API keys | Optional — **Google Translate** needs none; **DeepL**, **Baidu** and **Youdao** each need their own credentials |

## 📥 Installation

The repository *is* the extension: clone it into your extensions directory and compile the two build artifacts that are not committed — the GSettings schema and the translations.

```bash
# Ubuntu build dependencies
sudo apt install libglib2.0-bin gettext

git clone https://github.com/SHADE-glitch/fast-translate.git ~/.local/share/gnome-shell/extensions/fast-translate@local
cd ~/.local/share/gnome-shell/extensions/fast-translate@local

glib-compile-schemas schemas/
for f in po/*.po; do
    lang=$(basename "$f" .po)
    mkdir -p "locale/$lang/LC_MESSAGES"
    msgfmt "$f" -o "locale/$lang/LC_MESSAGES/fast-translate@tazztone.github.io.mo"
done

gnome-extensions enable fast-translate@local
```

On Wayland you must log out and back in for GNOME Shell to load the extension.

To produce a distributable zip instead, run `bash scripts/pack.sh` — it compiles the schema and translations and packs through a temporary directory.

> [!WARNING]
> Never run `gnome-extensions install` or `gnome-extensions pack` from inside the repository directory — the installer follows symlinks and can wipe the source tree. Use `scripts/pack.sh`, which packs via a temporary directory.

### Uninstall

```bash
gnome-extensions disable fast-translate@local
rm -rf ~/.local/share/gnome-shell/extensions/fast-translate@local
```

## 🖱️ Usage

Copy any text, then press `Ctrl+C` a second time within ~500 ms.

- **Floating window mode (default):** a popup appears with the translation — it does not steal focus or dim the screen.
- **Background mode:** the translation runs silently and replaces your clipboard contents; paste with `Ctrl+V`. An optional toast confirms completion.

The panel icon exposes a single **Settings** entry.

## ⚙️ Preferences

Open **GNOME Settings → Extensions → Fast Translate → Settings** to configure:

- Active service (Google Translate, DeepL, Baidu or Youdao)
- Provider credentials (DeepL API key and URL, Baidu APP ID and secret, Youdao app key and secret) — shown only for the selected service
- Default source and target languages
- Double-copy behavior, including background mode and the completion toast
- Formatting and theme options

## 🆚 Changes vs upstream

This fork removes the original panel-menu translator and the configurable global keybinding, keeping only the double-copy workflow, and adds reliability work. The count is deliberately not stated — `git rev-list --count 420251c..HEAD` is authoritative (`420251c` is the frozen-upstream import this fork's history starts from).

Every change below is also recorded in [CHANGELOG.md](CHANGELOG.md) with its kind
(`fix` / `taste` / `guard` / `revert`), its evidence tier and its commit — `D-###` ids point at
that record. `taste` entries carry zero obligation: they may be discarded wholesale on an upgrade.


Every change below is also recorded in [CHANGELOG.md](CHANGELOG.md) with its kind (`fix` / `taste` / `guard` / `revert`), its evidence tier and its commit — `D-###` ids point at that record. `taste` entries carry zero obligation: they may be discarded wholesale on an upgrade.
- **Removed:** the panel-menu translation UI (input/output fields, translate button, error label, language-selector popover), the global keybinding (`shortcut-enabled`), and the auto-paste / auto-translate / auto-copy panel automation. (D-002)
- **Four translation providers:** a provider registry in `translation-helper.js` (DeepL, Google, Baidu, Youdao), each with its own language-code map, character limit and request spec, plus a pure `signing.js` that computes the Baidu MD5 and Youdao v3 signatures identically under GJS and Node. (D-010)
- **Dictionary card:** a double-copied word renders as a structured card — a translation headline, phonetic, part-of-speech-grouped meanings, examples, synonyms and English definitions — each element its own actor with its own style class. A single word is routed to Google even when another service is selected (only Google returns dictionary data); prose keeps the selected service. Word lookups auto-flip direction when the input's language matches the target (Auto included), the header plus the ⇄ button follow that displayed direction, and an Auto source switches the header to the language Google detected. A Chinese→English lookup is enriched by a reverse EN→ZH request so the card still shows synonyms and English definitions. Google requests use the `clients5.google.com` `dict-chrome-ex` endpoint (the one that returns the dictionary sections) and are no longer cached. (D-021, D-022, D-023, D-024, D-025, D-026, D-027, D-028)
- **Reliability:** an LRU translation cache (max 50 entries), a 12-second request watchdog with a re-entrant-enable guard and request-generation cancellation, precise self-echo suppression via the last internal copy text, a native `St.Spinner` loading state (copy button disarmed while loading), friendly transport/HTTP error messages, and per-handler `destroy()` guards so a mid-way throw can no longer leak the indicator permanently. (D-011, D-016)
- **Popup:** `Esc` to close, a loading state and open/close animation; honest state (copy button greyed while loading, in-place retry after a failure, a `Source ID` critical fixed); overlay and card positioned by the monitor work area, so multi-monitor setups no longer swallow clicks; follows the light/dark theme and system accent colour through two variant stylesheets. (D-003, D-004, D-005, D-006)
- **Performance:** long-text card height reduced from 710 px to 441 px (96 % → 60 % of the work area); reveal settle rounds reduced from 9 to 3, removing a height ratchet. (D-007, D-008)
- **Cleanup / i18n:** removed the global `.popup-menu-content` shadow override and 259 lines of dead CSS (457 → 198 lines, classes now 1:1 with the JS); removed hardcoded Chinese strings; pinned the `Gtk` imports to `?version=4.0`. (D-009)
- **Fixed:** DeepL rejects regional source codes such as `EN-US` / `PT-BR` with a 400 — they are now normalized (`EN-US` → `EN`, `PT-BR` → `PT`) after a language swap.
- **Preferences:** the "Panel Menu Automation" group was removed, provider-credential groups were added, and the remaining groups reorganized. (D-010, D-019)
- **Tests:** unit tests cover the new pure helpers (including a GJS/Node signing cross-check); the evaluation test asserts the panel UI and shortcut are gone.

## 🤝 Contributing

1. Fork this repository.
2. Create a branch: `git checkout -b <branch_name>`.
3. Commit your changes: `git commit -m '<commit_message>'`.
4. Push the branch and open a pull request.

Run the test suite with `npm test` (unit tests via Node, plus a GJS preferences-layout validator).
Maintainers: read [MAINTENANCE.md](MAINTENANCE.md) first — it records the harness
isolation rules, the measured cost baseline and the update risks.

## 🙏 Credits & Attribution

This extension is a fork of the original **Translate Assistant** by **Lorenzo Carbonell Cerezo (atareao)**, later modernized as **Fast Translate** by **tazztone**.

- **Original upstream:** [atareao/translate-assistant](https://github.com/atareao/translate-assistant) by Lorenzo Carbonell Cerezo — license **MIT**
- **Modernized upstream:** [tazztone/fast-translate](https://github.com/tazztone/fast-translate) — license **MIT**
- **Original contributors:** Philipp Kiemle (daPhipz), Fabrício Müller (fabricio8800), Heimen Stoffels (Vistaus), Lorenzo Carbonell (atareao)
- **Features introduced upstream (before this fork):** Google Translate default backend, the `Ctrl+C` `Ctrl+C` double-copy instant translation, background mode, flag emoji in the language labels, high-DPI scaling and integration tests.

## ⚖️ License

Licensed under the **MIT License** — see [LICENSE](LICENSE).

© Lorenzo Carbonell Cerezo (atareao), tazztone, and contributors; fork modifications © SHADE-glitch.
