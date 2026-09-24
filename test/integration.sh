#!/usr/bin/env bash
set -euo pipefail

echo "🔨 Compiling GSettings schemas..."
glib-compile-schemas schemas/

echo "📦 Deploying extension to local GNOME directory..."
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/fast-translate@local"
mkdir -p "$EXT_DIR"
if [ "$(realpath "$EXT_DIR")" != "$(realpath .)" ]; then
    cp -rf extension.js prefs.js translation-helper.js signing.js metadata.json stylesheet-base.css stylesheet-light.css stylesheet-dark.css icons schemas "$EXT_DIR/"
else
    echo "ℹ️  Extension directory is already linked to project directory."
fi

# Read JS code from file
JS_CODE=$(cat test/eval-test.js)
export JS_CODE
READY_CODE=$(cat test/ready-check.js)
export READY_CODE
QUERY_CODE="global.testRunnerResult || JSON.stringify({ success: false, error: 'Asynchronous test run timed out or failed to resolve' })"
export QUERY_CODE

echo "⚡ Starting isolated DBus session for integration tests..."
dbus-run-session bash -c '
    # Eval is available because of --devkit below: GNOME 50 dropped the
    # org.gnome.desktop.interface unsafe-mode key, so setting it here was a
    # silent no-op that only added a confusing "No such key" line.
    export GSETTINGS_SCHEMA_DIR="$(pwd)/schemas"

    echo "🚀 Starting headless GNOME Shell session..."
    gnome-shell --headless --virtual-monitor 1024x768 --devkit --unsafe-mode &
    SHELL_PID=$!

    # Ensure cleanup
    trap '\''echo "🧹 Cleaning up nested GNOME Shell process..."; kill $SHELL_PID 2>/dev/null || true'\'' EXIT INT TERM

    echo "⚡ Enabling fast-translate..."
    gnome-extensions enable fast-translate@local

    # A cold headless boot needs ~27s to reach "GNOME Shell started", so any
    # fixed sleep races it. ACTIVE is only published by the shell itself after
    # enable() returns, which makes it the real readiness signal.
    echo "⏳ Waiting for the shell to activate the extension..."
    INFO=""
    for _ in $(seq 1 120); do
        INFO=$(gnome-extensions info fast-translate@local 2>/dev/null || true)
        case "$INFO" in
            *"State: ACTIVE"*|*"State: ERROR"*) break ;;
        esac
        sleep 1
    done

    echo "🔍 Fetching extension details..."
    echo "-----------------------------------"
    echo "${INFO:-Command failed}"
    echo "-----------------------------------"

    if echo "$INFO" | grep -iq "error"; then
        echo "❌ Integration test failed: Extension loaded with ERROR status!"
        exit 1
    fi

    if ! echo "$INFO" | grep -q "fast-translate@local"; then
        echo "❌ Integration test failed: Extension could not be found or registered!"
        exit 1
    fi

    # enable() defers the indicator to a low-priority idle callback, so wait
    # for the statusArea entry rather than assuming ACTIVE means constructed.
    echo "⏳ Waiting for the deferred indicator..."
    for _ in $(seq 1 60); do
        case "$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "$READY_CODE" 2>/dev/null)" in
            *READY*) break ;;
        esac
        sleep 1
    done

    echo "🧪 Triggering programmatic JS tests via DBus Eval..."
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "$JS_CODE" > /dev/null

    echo "⏳ Waiting for asynchronous assertions to complete..."
    RESULT=""
    for _ in $(seq 1 120); do
        RESULT=$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "$QUERY_CODE" 2>/dev/null || true)
        case "$RESULT" in
            ""|*timed\ out\ or\ failed*) sleep 1 ;;
            *) break ;;
        esac
    done

    echo "🔍 Fetching test suite result..."
    echo "📊 Test response: $RESULT"

    if [[ "$RESULT" == *success*true* ]]; then
        echo "✅ Programmatic integration tests passed successfully!"
        exit 0
    else
        echo "❌ Programmatic integration tests failed!"
        exit 1
    fi
'
