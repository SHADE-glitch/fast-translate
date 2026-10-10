#!/usr/bin/env bash
# pack.sh: Safe extension packaging script.
set -euo pipefail

# `--podir=po` makes gnome-extensions shell out to msgfmt, and without gettext that
# fails with `Failed to execute child process "msgfmt"` plus a GLib-CRITICAL, after
# this script has already copied files and compiled schemas, and with no zip at all.
# Checked first so the run stops before it touches anything.
if ! command -v msgfmt >/dev/null 2>&1; then
    echo "❌ msgfmt not found — the po/ step cannot run, and no zip would be produced."
    echo "   Translations here are maintained by hand (docs/maintenance/open-items.md); install"
    echo "   gettext only if you want a zip that carries .mo files, then re-run this script."
    exit 1
fi

echo "🧹 Cleaning previous packages..."
rm -f *.zip

# Remove before mkdir, deliberately: a previous run that failed left this tree behind,
# and `cp -r` only overwrites names that still exist — a helper the repo has since dropped
# would still be copied into the zip. Measured: a stale file survived two consecutive
# staging copies into the same directory.
echo "📦 Copying files to temporary directory..."
rm -rf /tmp/fast-translate-pack
mkdir -p /tmp/fast-translate-pack
cp -r extension.js prefs.js translation-helper.js signing.js metadata.json stylesheet-base.css stylesheet-light.css stylesheet-dark.css icons/ po/ schemas/ /tmp/fast-translate-pack/

echo "⚡ Compiling GSettings schemas..."
glib-compile-schemas /tmp/fast-translate-pack/schemas/

echo "🎁 Packing extension via gnome-extensions pack..."
# There is no plain stylesheet.css: the shell picks stylesheet-<variant>.css
# from Main.getStyleVariant(). gnome-extensions pack only auto-includes
# stylesheet.css and extension.js, so every other source file needs
# --extra-source or it is silently left out of the zip.
(cd /tmp/fast-translate-pack && gnome-extensions pack --force --podir=po \
    --extra-source=translation-helper.js \
    --extra-source=signing.js \
    --extra-source=icons \
    --extra-source=stylesheet-base.css \
    --extra-source=stylesheet-light.css \
    --extra-source=stylesheet-dark.css)

echo "💾 Moving package back to project root..."
cp /tmp/fast-translate-pack/*.zip .
rm -rf /tmp/fast-translate-pack

echo "✅ Packaging complete: $(ls *.zip)"

if [ -x "venv/bin/shexli" ]; then
    echo "🔍 Running shexli static analyzer..."
    venv/bin/shexli *.zip
else
    echo "⚙️ Setting up virtualenv to install shexli analyzer..."
    python3 -m venv venv
    venv/bin/pip install -U shexli --quiet
    echo "🔍 Running shexli static analyzer..."
    venv/bin/shexli *.zip
fi
