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
BOOT_CODE=$(cat test/bootstrap.js)
export BOOT_CODE
QUERY_CODE="global.testRunnerResult || JSON.stringify({ success: false, error: 'Asynchronous test run timed out or failed to resolve' })"
export QUERY_CODE

# Throwaway tree for the nested shell. Its only user extension is a symlink to
# this directory, which keeps the other ten extensions of this session out of
# the test (faster boot, and none of their log noise).
RUN="$(mktemp -d "${TMPDIR:-/tmp}/ft-integration.XXXXXX")"
REPO="$(pwd)"
WL="wayland-fti$$"
export RUN REPO WL
mkdir -p "$RUN/data/gnome-shell/extensions" "$RUN/cache" "$RUN/runtime"
chmod 700 "$RUN/runtime"
ln -s "$REPO" "$RUN/data/gnome-shell/extensions/fast-translate@local"

# Unlink first, then remove the tree. `rm -rf` unlinks symlinks rather than
# following them, but this repo *is* the live extension directory, so leave no
# path by which a cleanup could ever reach it (see AGENTS.md).
#
# Removal errors are swallowed and retried, and cleanup returns 0, because a
# leftover must never change the script's verdict: under `set -e` an
# undeletable directory once turned a passing run into exit 1. The leftover was
# a gvfs-metadata store that the nested shell's GVFS stack wrote into the
# redirected XDG_DATA_HOME and kept open — GIO_USE_VFS=local below stops that at
# the source, and also removes the volume-monitor and fusermount noise.
cleanup() {
    # Two measured reasons this block may never let a command fail:
    #   1. under `set -e` an EXIT trap aborts at its first failing command, and
    #      the trap's status then REPLACES the verdict — a run whose whole suite
    #      passed exited 1 exactly like that;
    #   2. `rm` on this PATH is a gio trash wrapper that refuses to delete under
    #      /tmp ("Trashing on system internal mounts is not supported"), which is
    #      how a leftover tree used to be produced as well as a false red.
    # So: the absolute coreutils binary, every step tolerated.
    /bin/rm -f "$RUN/data/gnome-shell/extensions/fast-translate@local" || true
    /bin/rm -rf "$RUN" 2>/dev/null || true
    if [ -e "$RUN" ]; then
        sleep 2
        /bin/rm -rf "$RUN" 2>/dev/null || true
    fi
    # Tripwire: the nested shell gets a private XDG_RUNTIME_DIR, so it can no
    # longer leave the marker in the shared one. If it appears here anyway,
    # something bypassed that isolation.
    local marker="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/gnome-shell-disable-extensions"
    if [ -e "$marker" ]; then
        echo "⚠️  $marker exists. If a nested shell left it, remove it."
    fi
    return 0
}
trap cleanup EXIT INT TERM

echo "⚡ Starting isolated DBus session for integration tests..."
dbus-run-session bash -c '
    # Three isolation requirements, each of which cost a real mistake:
    #   GSETTINGS_BACKEND=memory — eval-test.js force-sets three keys of this
    #     extension schema. A dbus-run-session does NOT redirect dconf *writes*:
    #     they are served against the real XDG_CONFIG_HOME and land in
    #     ~/.config/dconf/user, so a mid-suite failure silently overwrites the
    #     developer own settings. With the memory backend every write stays
    #     inside this throwaway process.
    #   --wayland-display with a unique name — otherwise mutter fails on
    #     wayland-0.lock, and the cascading error log looks like a shell bug.
    #   --unsafe-mode — this, not --devkit, is what serves org.gnome.Shell.Eval
    #     on GNOME 50 (the org.gnome.desktop.interface:unsafe-mode key is gone).
    export GSETTINGS_BACKEND=memory
    export GSETTINGS_SCHEMA_DIR="$REPO/schemas"
    export XDG_DATA_HOME="$RUN/data"
    export XDG_CACHE_HOME="$RUN/cache"
    # Private runtime dir: the shell creates gnome-shell-disable-extensions in
    # $XDG_RUNTIME_DIR at startup and deletes it 60 s later. Killing a nested
    # shell inside that window would otherwise leave that marker in the shared
    # /run/user/1000, and its presence is the condition under which a
    # gnome-shell crash disables every extension at the next login.
    export XDG_RUNTIME_DIR="$RUN/runtime"
    export WAYLAND_DISPLAY="$WL"
    export NO_AT_BRIDGE=1
    # The local GVFS backend only. Without it the nested shell activates the
    # whole GVFS stack, which then writes a gvfs-metadata store into the
    # redirected XDG_DATA_HOME and holds it open — that leftover made the
    # cleanup above fail, and a failing cleanup under `set -e` turned a passing
    # run into exit 1. It also removes the volume-monitor and fusermount noise.
    export GIO_USE_VFS=local

    EV() {
        gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
            --method org.gnome.Shell.Eval "$1" 2>&1
    }

    echo "🚀 Starting headless GNOME Shell session..."
    gnome-shell --headless --wayland-display="$WL" --virtual-monitor 1024x768 \
        --unsafe-mode >"$RUN/shell.log" 2>&1 &
    SHELL_PID=$!

    # Ensure cleanup
    trap '\''kill $SHELL_PID 2>/dev/null || true'\'' EXIT INT TERM

    # A cold headless boot needs ~27s to reach "GNOME Shell started", and a
    # shell *without* Eval still answers the call with exit status 0 — it just
    # replies "(false, ...)". So the reply text is the only usable readiness
    # signal; testing the exit code would report success immediately and then
    # every following call would target whatever else owns the bus name.
    echo "⏳ Waiting for the nested shell Eval endpoint..."
    BOOTED=0
    for _ in $(seq 1 240); do
        if ! kill -0 "$SHELL_PID" 2>/dev/null; then
            echo "❌ Nested shell exited during boot:"
            tail -20 "$RUN/shell.log"
            exit 1
        fi
        if EV "1+1" | grep -q "(true,"; then
            BOOTED=1
            break
        fi
        sleep 1
    done
    if [ "$BOOTED" != 1 ]; then
        echo "❌ Eval never became available:"
        tail -20 "$RUN/shell.log"
        exit 1
    fi

    # `gnome-extensions enable` cannot reach a memory-backend shell, so the
    # extension is armed from inside it instead (see test/bootstrap.js).
    echo "🧪 Booting fast-translate@local in-process..."
    EV "$BOOT_CODE" > /dev/null
    BOOT=""
    for _ in $(seq 1 120); do
        BOOT=$(EV "String(global.__ftBoot)")
        case "$BOOT" in
            *ACTIVE*) break ;;
            *ERROR:*)
                echo "❌ Integration test failed: extension did not reach ACTIVE!"
                echo "📊 Boot: $BOOT"
                grep -E "JS ERROR|Gjs-CRITICAL" "$RUN/shell.log" | head -10 || true
                exit 1
                ;;
        esac
        sleep 1
    done
    case "$BOOT" in
        *ACTIVE*) ;;
        *)
            echo "❌ Integration test failed: boot never reported a state ($BOOT)"
            grep -E "JS ERROR|Gjs-CRITICAL" "$RUN/shell.log" | head -10 || true
            exit 1
            ;;
    esac

    # enable() defers the indicator to a low-priority idle callback, so wait
    # for the statusArea entry rather than assuming ACTIVE means constructed.
    echo "⏳ Waiting for the deferred indicator..."
    for _ in $(seq 1 60); do
        case "$(EV "$READY_CODE")" in
            *READY*) break ;;
        esac
        sleep 1
    done

    echo "🧪 Triggering programmatic JS tests via DBus Eval..."
    EV "$JS_CODE" > /dev/null

    echo "⏳ Waiting for asynchronous assertions to complete..."
    RESULT=""
    for _ in $(seq 1 120); do
        RESULT=$(EV "$QUERY_CODE" || true)
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
        grep -E "JS ERROR|Gjs-CRITICAL" "$RUN/shell.log" | head -10 || true
        exit 1
    fi
'
