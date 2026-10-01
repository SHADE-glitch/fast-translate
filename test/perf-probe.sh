#!/usr/bin/env bash
# test/perf-probe.sh — measure what fast-translate@local actually costs.
#
# NOT part of `npm test`. It boots a throwaway headless GNOME Shell and takes
# several minutes (`all` is roughly 5), so it is a `npm run perf` entry instead.
# It runs on the same isolation recipe as test/integration.sh, and that is not
# an accident to be tidied away: if the recipe changes, change it in BOTH files
# (see MAINTENANCE.md).
#
#   bash test/perf-probe.sh [cost|idle|all]     # default: all
#
# What you get: a JSON artifact under ~/.cache/fast-translate-perf/ and a table
# on stdout. Read the header of test/perf-probe.js before believing any number —
# headless is software-rendered, so absolute values do not transfer to your real
# session; only the relative claims (idle delta under the noise floor, no leak
# across enable/disable cycles, cache bounded) do.
set -euo pipefail

PHASES="${1:-all}"
case "$PHASES" in
    cost|idle|all) ;;
    *) echo "usage: $0 [cost|idle|all]" >&2; exit 2 ;;
esac

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$(mktemp -d "${TMPDIR:-/tmp}/ft-perf.XXXXXX")"
WL="wayland-ftperf$$"
ARTIFACT_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/fast-translate-perf"
export PHASES RUN WL REPO ARTIFACT_DIR

mkdir -p "$RUN/data/gnome-shell/extensions" "$RUN/cache" "$RUN/runtime" "$ARTIFACT_DIR"
chmod 700 "$RUN/runtime"
# The repo IS the extension directory, so expose it to the nested shell through a
# symlink in a private XDG_DATA_HOME instead of copying anything or touching the
# real one. Only this extension is then discoverable, which keeps the other
# extensions of this session out of the measurement.
ln -s "$REPO" "$RUN/data/gnome-shell/extensions/fast-translate@local"

# Unlink by name before removing the tree: `rm -rf` unlinks symlinks rather than
# following them, but this repo is live user data, so leave no path by which a
# cleanup could ever reach it (see AGENTS.md). Errors are swallowed and cleanup
# returns 0 so a leftover can never change the script's verdict.
cleanup() {
    rm -f "$RUN/data/gnome-shell/extensions/fast-translate@local"
    rm -rf "$RUN" 2>/dev/null
    if [ -e "$RUN" ]; then
        sleep 2
        rm -rf "$RUN" 2>/dev/null
    fi
    # The nested shell gets a private XDG_RUNTIME_DIR, so it can no longer leave
    # gnome-shell-disable-extensions in the shared one. This check stays as a
    # tripwire: if the marker ever appears here, something bypassed that
    # isolation, and its presence is the condition under which a gnome-shell
    # crash disables every extension at the next login. Warn, never delete — a
    # real session legitimately holds this file for its first 60 seconds.
    local marker="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/gnome-shell-disable-extensions"
    if [ -e "$marker" ]; then
        echo "⚠️  $marker exists. If a nested shell left it, remove it."
    fi
    return 0
}
trap cleanup EXIT INT TERM

glib-compile-schemas "$REPO/schemas" 2>/dev/null || true

dbus-run-session bash -c '
    # Isolation, each item load-bearing:
    #   GSETTINGS_BACKEND=memory — nothing here may reach ~/.config/dconf/user.
    #     A dbus-run-session does NOT redirect dconf writes; they are served
    #     against the real XDG_CONFIG_HOME.
    #   --wayland-display with a unique name — otherwise mutter fails on
    #     wayland-0.lock and the cascading log looks like a shell bug.
    #   --unsafe-mode — this, not --devkit, is what serves org.gnome.Shell.Eval
    #     on GNOME 50 (the unsafe-mode gsettings key is gone).
    #   GIO_USE_VFS=local — the GVFS stack otherwise writes a metadata store into
    #     the redirected XDG_DATA_HOME and holds it open.
    export GSETTINGS_BACKEND=memory
    export GSETTINGS_SCHEMA_DIR="$REPO/schemas"
    export XDG_DATA_HOME="$RUN/data"
    export XDG_CACHE_HOME="$RUN/cache"
    # A private runtime dir keeps the nested shell from creating
    # $XDG_RUNTIME_DIR/gnome-shell-disable-extensions in the REAL one. The shell
    # makes that marker at startup and deletes it 60 s later; killing a nested
    # shell inside that window would otherwise leave behind the very file whose
    # presence makes the systemd unit disable all extensions after a crash.
    export XDG_RUNTIME_DIR="$RUN/runtime"
    export WAYLAND_DISPLAY="$WL"
    export NO_AT_BRIDGE=1
    export GIO_USE_VFS=local
    export FT_PERF_OUT="$RUN/result.json"
    # The probe reads FT_PERF_PHASES. The PHASES variable alone is only input
    # for naming and logging in this outer script, so exporting just that one
    # made every run silently execute all phases and overrun the cost budget.
    # WARNING: no unescaped apostrophe may appear anywhere inside this
    # single-quoted body. An unpaired one terminates the string and everything
    # after it runs in the OUTER shell — that is precisely how a stray apostrophe
    # in a comment here once produced a bogus "trap: usage" error.
    export FT_PERF_PHASES="$PHASES"

    EV() {
        gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
            --method org.gnome.Shell.Eval "$1" 2>&1
    }

    gnome-shell --headless --wayland-display="$WL" --virtual-monitor 1280x800 \
        --unsafe-mode >"$RUN/shell.log" 2>&1 &
    SHELL_PID=$!
    trap '\''kill $SHELL_PID 2>/dev/null || true'\'' EXIT INT TERM

    echo "🚀 Booting isolated headless shell (this takes ~30s)..."
    BOOTED=0
    for _ in $(seq 1 240); do
        if ! kill -0 "$SHELL_PID" 2>/dev/null; then
            echo "❌ Nested shell exited during boot:"
            tail -20 "$RUN/shell.log"
            exit 1
        fi
        # A shell without Eval answers the call with exit status 0 and replies
        # "(false, ...)", so only the reply text is a usable readiness signal.
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

    # The probe is ~10 KB of JavaScript containing quotes; passing it inline
    # through gdbus quoting is how an earlier attempt lost its result. Have the
    # shell read the file instead, and let the probe write its own answer to
    # FT_PERF_OUT, because the Eval reply comes back ASCII-escaped.
    echo "🔬 Running ${PHASES} probe..."
    EV "eval(imports.byteArray.toString(imports.gi.GLib.file_get_contents(\"$REPO/test/perf-probe.js\")[1]))" \
        >/dev/null

    # Budgets are for the probe itself; boot is already paid for above.
    # cost ~50s (6 + 10 cycles x ~2s + windows/cache/clipboard/5MB),
    # idle ~210s (75s settle + 4 windows x 33s), all is the sum.
    case "$PHASES" in
        cost) LIMIT=240 ;;
        idle) LIMIT=420 ;;
        *) LIMIT=660 ;;
    esac
    for _ in $(seq 1 "$LIMIT"); do
        [ -s "$RUN/result.json" ] && break
        kill -0 "$SHELL_PID" 2>/dev/null || { echo "❌ shell died mid-probe"; tail -20 "$RUN/shell.log"; exit 1; }
        sleep 1
    done
    if [ ! -s "$RUN/result.json" ]; then
        echo "❌ probe timed out after ${LIMIT}s"
        # The temp tree is deleted by the EXIT trap, so keep the evidence.
        # result.json.phase is written at every stage boundary by the probe.
        if [ -f "$RUN/result.json.phase" ]; then
            echo "   last phase reached: $(cat "$RUN/result.json.phase")"
            cp "$RUN/result.json.phase" "$ARTIFACT_DIR/last-phase.txt" 2>/dev/null
        fi
        cp "$RUN/shell.log" "$ARTIFACT_DIR/failed-shell.log" 2>/dev/null
        echo "   shell log kept at $ARTIFACT_DIR/failed-shell.log"
        grep -E "JS ERROR|Gjs-CRITICAL" "$RUN/shell.log" | head -10
        exit 1
    fi
    STAMP=$(date +%Y%m%d-%H%M%S)
    cp "$RUN/result.json" "$ARTIFACT_DIR/result-$STAMP-$PHASES.json"
    cp "$RUN/result.json" "$ARTIFACT_DIR/latest-$PHASES.json"
    echo "📈 artifact: $ARTIFACT_DIR/latest-$PHASES.json (also result-$STAMP-$PHASES.json)"
    echo "🧾 shell error lines: $(grep -cE "JS ERROR|Gjs-CRITICAL" "$RUN/shell.log")"
    # Formatting lives in test/perf-summary.js: an inline `node -e` here would
    # break on its first single quote, because this whole body is single-quoted
    # to survive dbus-run-session.
    node "$REPO/test/perf-summary.js" "$RUN/result.json"
'
