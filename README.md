<p align="right"><a href="README.md"><b>English</b></a> | <a href="README.zh-CN.md">简体中文</a></p>

# Fast Translate — Local Maintenance Fork

Instant translation from a double copy — Google Translate and DeepL in your GNOME Shell.

![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-45--50-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Based on: translate-assistant](https://img.shields.io/badge/based%20on-translate--assistant-orange)

## About

This repository is a **personal maintenance fork** of **Fast Translate**, which is itself a modernized fork of the original [**translate-assistant**](https://github.com/atareao/translate-assistant) by [Lorenzo Carbonell (atareao)](https://github.com/atareao).

Fork lineage:

```
atareao/translate-assistant  →  tazztone/fast-translate  →  this fork (fast-translate@local)
```

It is **not** affiliated with or endorsed by either upstream author. This fork narrows the extension to a single, focused workflow — **translate the text you just copied** — and hardens it: an LRU cache, a request watchdog, precise self-echo suppression, and a fix for DeepL regional source codes.

## Features

- **Double-copy instant translation** — copy text normally, then press `Ctrl+C` again within ~500 ms to translate it. No menus, no window switching.
- **Floating translation window** — a draggable, re-centering popup showing the source and target languages, with **swap** and **copy** buttons and optional auto-copy.
- **Background mode** — translate silently and write the result straight to the clipboard, ready to paste, with an optional desktop toast notification.
- **Two backends** — **Google Translate** (no API key, works out of the box) and **DeepL** (Free and Pro tiers).
- **Inline language selection** — a flag-emoji grid in the preferences.
- **Robustness** — an LRU translation cache (50 entries), a 12-second request watchdog, a native `St.Spinner` loading state, friendly network-error messages, and precise self-echo suppression so your own copies are never mistaken for new input.

## Screenshots

![Floating translation window triggered by the double-copy shortcut](screenshots/CTRLCC.webp)

## Prerequisites

| Requirement | Details |
|---|---|
| GNOME Shell | 45 – 50 |
| DeepL API key | Optional — only needed if you choose DeepL as your provider ([Free or Pro](https://www.deepl.com/pro-api)) |

## Installation

```bash
git clone <your-fork-url> ~/.local/share/gnome-shell/extensions/fast-translate@local
cd ~/.local/share/gnome-shell/extensions/fast-translate@local
bash scripts/pack.sh      # compile schemas + translations and pack safely
```

Or install in place and enable it:

```bash
gnome-extensions enable fast-translate@local
```

On Wayland you must log out and back in for GNOME Shell to load the extension.

> [!WARNING]
> Never run `gnome-extensions install` or `gnome-extensions pack` from inside the repository directory — the installer follows symlinks and can wipe the source tree. Use `scripts/pack.sh`, which packs via a temporary directory.

## Usage

Copy any text, then press `Ctrl+C` a second time within ~500 ms.

- **Floating window mode (default):** a popup appears with the translation — it does not steal focus or dim the screen.
- **Background mode:** the translation runs silently and replaces your clipboard contents; paste with `Ctrl+V`. An optional toast confirms completion.

The panel icon exposes a single **Settings** entry.

## Preferences

Open **GNOME Settings → Extensions → Fast Translate → Settings** to configure:

- Active service (Google Translate or DeepL)
- DeepL API key and URL (hidden when Google Translate is selected)
- Default source and target languages
- Double-copy behavior, including background mode and the completion toast
- Formatting and theme options

## Changes vs upstream

This fork removes the original panel-menu translator and the configurable global keybinding, keeping only the double-copy workflow, and adds reliability work:

- **Removed:** the panel-menu translation UI (input/output fields, translate button, error label, language-selector popover) and the global keybinding (`shortcut-enabled`) along with the auto-paste / auto-translate / auto-copy panel automation.
- **Added:** an LRU translation cache (max 50 entries), a 12-second request watchdog with re-entrant-enable guard and request-generation cancellation, precise self-echo suppression via the last internal copy text, a native `St.Spinner` loading indicator (copy button disarmed while loading), and friendly transport/HTTP error messages.
- **Refactor:** the Google and DeepL request builders were extracted into the pure, testable `translation-helper.js`.
- **Fixed:** DeepL rejects regional source codes such as `EN-US` / `PT-BR` with a 400 — they are now normalized (`EN-US` → `EN`, `PT-BR` → `PT`) after a language swap.
- **Preferences:** the "Panel Menu Automation" group was removed and the remaining groups reorganized.
- **Tests:** unit tests cover the new pure helpers; the evaluation test now asserts the panel UI and shortcut are gone.

## Contributing

1. Fork this repository.
2. Create a branch: `git checkout -b <branch_name>`.
3. Commit your changes: `git commit -m '<commit_message>'`.
4. Push the branch and open a pull request.

Run the test suite with `npm test` (unit tests via Node, plus a GJS preferences-layout validator).

## Credits & Attribution

This extension is a fork of the original **Translate Assistant** by **Lorenzo Carbonell Cerezo (atareao)**, later modernized as **Fast Translate** by **tazztone**.

- **Original upstream:** [atareao/translate-assistant](https://github.com/atareao/translate-assistant) by Lorenzo Carbonell Cerezo — license **MIT**
- **Modernized upstream:** [tazztone/fast-translate](https://github.com/tazztone/fast-translate) — license **MIT**
- **Original contributors:** Philipp Kiemle (daPhipz), Fabrício Müller (fabricio8800), Heimen Stoffels (Vistaus), Lorenzo Carbonell (atareao)
- **Features introduced upstream (before this fork):** Google Translate default backend, the `Ctrl+C` `Ctrl+C` double-copy instant translation, background mode, the inline flag-emoji grid, high-DPI scaling and integration tests.

## License

Licensed under the **MIT License** — see [LICENSE](LICENSE).

© Lorenzo Carbonell Cerezo (atareao) and contributors.
