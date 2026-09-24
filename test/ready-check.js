// Readiness probe polled by test/integration.sh.
//
// gnome-extensions info reports State: ACTIVE as soon as enable() returns, but
// this extension builds its indicator from a deferred GLib.idle_add callback
// (so a slow GDM autologin is not blocked). A fixed sleep therefore races the
// idle callback: on a cold headless boot the shell can take ~27s to reach
// "GNOME Shell started", and the probe then runs against an empty statusArea.
// Poll for the indicator itself instead.
(Main.panel && Main.panel.statusArea && Main.panel.statusArea["fast-translate@local"]) ? "READY" : "WAITING";
