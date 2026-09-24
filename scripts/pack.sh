#!/usr/bin/env bash
# pack.sh: Safe extension packaging script.
set -euo pipefail

echo "🧹 Cleaning previous packages..."
rm -f *.zip

echo "📦 Copying files to temporary directory..."
mkdir -p /tmp/fast-translate-pack
cp -r extension.js prefs.js translation-helper.js metadata.json stylesheet-base.css stylesheet-light.css stylesheet-dark.css icons/ po/ schemas/ /tmp/fast-translate-pack/

echo "⚡ Compiling GSettings schemas..."
glib-compile-schemas /tmp/fast-translate-pack/schemas/

echo "🎁 Packing extension via gnome-extensions pack..."
# There is no plain stylesheet.css: the shell picks stylesheet-<variant>.css
# from Main.getStyleVariant(). gnome-extensions pack only auto-includes
# stylesheet.css, so all three CSS files must be passed via --extra-source.
(cd /tmp/fast-translate-pack && gnome-extensions pack --force --podir=po \
    --extra-source=translation-helper.js \
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
