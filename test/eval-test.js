global.testRunnerResult = null;
global.testRunnerPromise = (async () => {
    // Declared outside the try so the finally clause can reach it.
    let settingsRestore = null;
    try {
        const Main = await import("resource:///org/gnome/shell/ui/main.js");
        const ext = Main.extensionManager.lookup("fast-translate@local");
        if (!ext) {
            return { success: false, error: "Extension not found" };
        }
        const indicator = ext.stateObj ? ext.stateObj._indicator : null;
        if (!indicator) {
            return { success: false, error: "Indicator not found" };
        }

        // Test 1: Panel menu UI and shortcut removed — only the
        // double-copy floating path remains
        if (indicator.inputEntry) return { success: false, error: "inputEntry should not exist (menu UI removed)" };
        if (indicator.outputEntry) return { success: false, error: "outputEntry should not exist (menu UI removed)" };
        if (indicator.translateBtn) return { success: false, error: "translateBtn should not exist (menu UI removed)" };
        if (typeof indicator._translateText === 'function') return { success: false, error: "_translateText should not exist (panel path removed)" };
        if (typeof indicator._bindShortcut === 'function' || typeof indicator._unbindShortcut === 'function') {
            return { success: false, error: "shortcut methods should not exist" };
        }
        if (typeof indicator._translateTextIndependent !== 'function') {
            return { success: false, error: "_translateTextIndependent missing" };
        }
        // Menu keeps exactly the Settings entry
        const menuItems = indicator.menu._getMenuItems();
        if (!menuItems || menuItems.length !== 1) {
            return { success: false, error: "menu should contain exactly the Settings item, got: " + (menuItems ? menuItems.length : "none") };
        }
        // Live originals for the double-copy suite below (it restores mocks)
        const originalSendReadAsync = indicator._httpSession.send_and_read_async;
        const originalSendReadFinish = indicator._httpSession.send_and_read_finish;

        // Test 2: Instantiate FloatingTranslationWindow
        try {
            let FloatingTranslationWindow = indicator.FloatingTranslationWindow;
            let win = new FloatingTranslationWindow("Hello World", "Bonjour le monde", "EN", "FR");
            if (!win.actor || !win.overlay) {
                indicator._httpSession.send_and_read_async = originalSendReadAsync;
                indicator._httpSession.send_and_read_finish = originalSendReadFinish;
                return { success: false, error: "FloatingTranslationWindow missing overlay or actor" };
            }
            win.destroy();
        } catch (e) {
            indicator._httpSession.send_and_read_async = originalSendReadAsync;
            indicator._httpSession.send_and_read_finish = originalSendReadFinish;
            return { success: false, error: "Failed to instantiate FloatingTranslationWindow: " + e.message };
        }

        // Test 3: Double-copy shortcut simulation
        const St = imports.gi.St;
        const Meta = imports.gi.Meta;
        const GLib = imports.gi.GLib;
        const Clipboard = St.Clipboard.get_default();

        const originalGetMonotonicTime = GLib.get_monotonic_time;
        let mockTime = 1000000;
        GLib.get_monotonic_time = function() {
            return mockTime;
        };

        const originalClipboardGetText = Clipboard.get_text;
        const originalClipboardSetText = Clipboard.set_text;
        let mockClipboardText = "";

        // Mock clipboard get_text to return our mock text
        Clipboard.get_text = function(type, callback) {
            callback(Clipboard, mockClipboardText);
        };

        // Mock _translateTextIndependent to avoid real HTTP requests
        const originalTranslateTextIndependent = indicator._translateTextIndependent;
        let independentTranslationText = "";
        let independentTranslationCallback = null;
        let independentCallCount = 0;
        indicator._translateTextIndependent = function(fromText, callback) {
            independentCallCount++;
            independentTranslationText = fromText;
            independentTranslationCallback = callback;
        };

        try {
            // Reset state so startup events don't bleed into this test
            indicator._lastClipboardTime = null;
            indicator._lastClipboardText = null;
            indicator._lastTriggeredText = null;
            indicator._lastTriggeredTime = null;
            if (indicator._internalCopyTimeoutId) {
                GLib.Source.remove(indicator._internalCopyTimeoutId);
                indicator._internalCopyTimeoutId = null;
            }
            indicator._isInternalCopy = false;
            // Capture the developer's real values BEFORE the three writes
            // below. Every snapshot/restore pair further down (the
            // originalAutoCopyState, originalBgMode/originalBgToast and
            // originalBgModeD/originalBgToastD stages) re-reads these keys
            // after this point has already overwritten them, so those pairs
            // can only put test values back — they are kept because each stage
            // asserts on the value it just set. The finally clause on the outer
            // try uses this snapshot to restore the truth on every exit path.
            const settingsOriginals = {
                autoCopy: indicator._settings.get_boolean('floating-auto-copy'),
                backgroundMode: indicator._settings.get_boolean('floating-background-mode'),
                backgroundToast: indicator._settings.get_boolean('floating-background-toast'),
            };
            settingsRestore = () => {
                indicator._settings.set_boolean('floating-auto-copy', settingsOriginals.autoCopy);
                indicator._settings.set_boolean('floating-background-mode', settingsOriginals.backgroundMode);
                indicator._settings.set_boolean('floating-background-toast', settingsOriginals.backgroundToast);
            };
            indicator._settings.set_boolean('floating-auto-copy', false);
            indicator._settings.set_boolean('floating-background-mode', false);
            indicator._settings.set_boolean('floating-background-toast', true);
            if (indicator._floatingWindow) {
                indicator._floatingWindow.destroy();
                indicator._floatingWindow = null;
            }

            // First copy
            mockTime = 1000000;
            mockClipboardText = "Double Copy Test input text";
            indicator._onSelectionChange(null, Meta.SelectionType.SELECTION_CLIPBOARD, null);

            // Check that the floating window is NOT created yet
            if (indicator._floatingWindow) {
                GLib.get_monotonic_time = originalGetMonotonicTime;
                Clipboard.get_text = originalClipboardGetText;
                Clipboard.set_text = originalClipboardSetText;
                indicator._translateTextIndependent = originalTranslateTextIndependent;
                return { success: false, error: "Floating window was created on a single copy!" };
            }

            // Simulate spurious duplicate signal <50ms — same content, must NOT trigger
            mockTime = 1010000;
            indicator._onSelectionChange(null, Meta.SelectionType.SELECTION_CLIPBOARD, null);

            if (independentTranslationCallback) {
                GLib.get_monotonic_time = originalGetMonotonicTime;
                Clipboard.get_text = originalClipboardGetText;
                Clipboard.set_text = originalClipboardSetText;
                indicator._translateTextIndependent = originalTranslateTextIndependent;
                return { success: false, error: "Spurious duplicate (<50ms) triggered translation!" };
            }

            // Second intentional copy — same content, 200ms later — must trigger
            mockTime = 1200000;
            indicator._onSelectionChange(null, Meta.SelectionType.SELECTION_CLIPBOARD, null);

            // Verify that _translateTextIndependent was triggered
            if (independentTranslationText !== "Double Copy Test input text" || !independentTranslationCallback) {
                GLib.get_monotonic_time = originalGetMonotonicTime;
                Clipboard.get_text = originalClipboardGetText;
                Clipboard.set_text = originalClipboardSetText;
                indicator._translateTextIndependent = originalTranslateTextIndependent;
                return { success: false, error: "Double-copy did not trigger independent translation!" };
            }

            // Loading state: window opens with spinner + disarmed copy button
            {
                const w = indicator._floatingWindow;
                if (!w) {
                    GLib.get_monotonic_time = originalGetMonotonicTime;
                    Clipboard.get_text = originalClipboardGetText;
                    Clipboard.set_text = originalClipboardSetText;
                    indicator._translateTextIndependent = originalTranslateTextIndependent;
                    return { success: false, error: "Floating window was not created immediately on double-copy!" };
                }
                if (w._loading !== true) {
                    GLib.get_monotonic_time = originalGetMonotonicTime;
                    Clipboard.get_text = originalClipboardGetText;
                    Clipboard.set_text = originalClipboardSetText;
                    indicator._translateTextIndependent = originalTranslateTextIndependent;
                    return { success: false, error: "Floating window did not enter loading state!" };
                }
                // Strict: a null _copyBtn must FAIL, not silently pass. That
                // guard is exactly what let the "button looks enabled but does
                // nothing while loading" bug hide.
                if (!w._copyBtn) {
                    GLib.get_monotonic_time = originalGetMonotonicTime;
                    Clipboard.get_text = originalClipboardGetText;
                    Clipboard.set_text = originalClipboardSetText;
                    indicator._translateTextIndependent = originalTranslateTextIndependent;
                    return { success: false, error: "Copy button reference was dropped — setLoading() can never disarm it!" };
                }
                if (w._copyBtn.reactive !== false) {
                    GLib.get_monotonic_time = originalGetMonotonicTime;
                    Clipboard.get_text = originalClipboardGetText;
                    Clipboard.set_text = originalClipboardSetText;
                    indicator._translateTextIndependent = originalTranslateTextIndependent;
                    return { success: false, error: "Copy button must be disarmed while loading!" };
                }
                if (w._copyBtn.opacity !== 110) {
                    GLib.get_monotonic_time = originalGetMonotonicTime;
                    Clipboard.get_text = originalClipboardGetText;
                    Clipboard.set_text = originalClipboardSetText;
                    indicator._translateTextIndependent = originalTranslateTextIndependent;
                    return { success: false, error: "Copy button was not visibly dimmed while loading! opacity=" + w._copyBtn.opacity };
                }
            }

            // Error state must be honest: the failure surfaces in place AND
            // offers a retry, instead of only overwriting the translation
            // region with prose the user cannot act on.
            // (No manual mock cleanup on these returns: the finally block at
            // the end of this test restores all four mocks.)
            {
                const w = indicator._floatingWindow;
                independentTranslationCallback("", "Simulated network failure");

                if (w._loading !== false) {
                    return { success: false, error: "Error reply did not end the loading state!" };
                }
                if (w._currentTarget !== "Simulated network failure") {
                    return { success: false, error: "Error text was not written into the window! Got: " + w._currentTarget };
                }
                if (w._destLabel.style_class.indexOf('error') === -1) {
                    return { success: false, error: "Destination label was not marked as error! class=" + w._destLabel.style_class };
                }
                if (!w._retryBtn) {
                    return { success: false, error: "No retry button exists for the error state!" };
                }
                if (w._retryBtn.visible !== true) {
                    return { success: false, error: "Retry button was not revealed on error!" };
                }
                if (w._copyBtn.reactive !== true || w._copyBtn.opacity !== 255) {
                    return { success: false, error: "Copy button must be re-armed and undimmed once loading ends! reactive=" + w._copyBtn.reactive + " opacity=" + w._copyBtn.opacity };
                }

                // Clicking retry re-issues the request, re-enters loading and
                // withdraws the error affordances.
                const callsBefore = independentCallCount;
                w._retryBtn.emit('clicked', 0);
                if (independentCallCount !== callsBefore + 1) {
                    return { success: false, error: "Retry did not re-issue the translation (calls " + callsBefore + " -> " + independentCallCount + ")" };
                }
                if (w._loading !== true) {
                    return { success: false, error: "Retry did not re-enter the loading state!" };
                }
                if (w._retryBtn.visible !== false) {
                    return { success: false, error: "Retry button stayed visible after being clicked!" };
                }
                if (w._destLabel.style_class.indexOf('error') !== -1) {
                    return { success: false, error: "Error styling was not cleared on retry! class=" + w._destLabel.style_class };
                }
                if (w._copyBtn.reactive !== false || w._copyBtn.opacity !== 110) {
                    return { success: false, error: "Copy button must be disarmed and dimmed again while the retry loads! reactive=" + w._copyBtn.reactive + " opacity=" + w._copyBtn.opacity };
                }
            }

            // Call the callback to simulate translation completing
            independentTranslationCallback("Double Copy Test translated text");

            // Verify floating window is created
            if (!indicator._floatingWindow) {
                Clipboard.get_text = originalClipboardGetText;
                Clipboard.set_text = originalClipboardSetText;
                indicator._translateTextIndependent = originalTranslateTextIndependent;
                return { success: false, error: "Floating window was not created after double copy translation completed!" };
            }

            // Transient Esc binding must be live exactly while the window is open
            if (indicator._escBound !== true) {
                Clipboard.get_text = originalClipboardGetText;
                Clipboard.set_text = originalClipboardSetText;
                indicator._translateTextIndependent = originalTranslateTextIndependent;
                return { success: false, error: "Transient Esc binding was not registered while window open!" };
            }

            // Verify contents of the floating window
            let floatWin = indicator._floatingWindow;
            if (!floatWin.actor || !floatWin.overlay) {
                Clipboard.get_text = originalClipboardGetText;
                Clipboard.set_text = originalClipboardSetText;
                indicator._translateTextIndependent = originalTranslateTextIndependent;
                return { success: false, error: "Floating window structure is invalid!" };
            }

            // Loading ended: copy re-armed
            if (floatWin._loading !== false) {
                Clipboard.get_text = originalClipboardGetText;
                Clipboard.set_text = originalClipboardSetText;
                indicator._translateTextIndependent = originalTranslateTextIndependent;
                return { success: false, error: "Floating window did not leave loading state after reply!" };
            }

            // Verify children layout and close button click
            let children = floatWin.actor.get_children();
            if (children.length < 6) {
                Clipboard.get_text = originalClipboardGetText;
                Clipboard.set_text = originalClipboardSetText;
                indicator._translateTextIndependent = originalTranslateTextIndependent;
                return { success: false, error: "Floating window actor has insufficient children: " + children.length };
            }

            // Close button is the last child of the header (a spinner may sit before it)
            let headerKids = children[0].get_children();
            let closeBtn = headerKids[headerKids.length - 1];
            if (!(closeBtn instanceof St.Button)) {
                Clipboard.get_text = originalClipboardGetText;
                Clipboard.set_text = originalClipboardSetText;
                indicator._translateTextIndependent = originalTranslateTextIndependent;
                return { success: false, error: "Close button not found at expected layout position" };
            }

            // Verify copy button copies the text and destroys the window
            let copyBtn = children[5].get_children()[0];
            if (!(copyBtn instanceof St.Button)) {
                Clipboard.get_text = originalClipboardGetText;
                Clipboard.set_text = originalClipboardSetText;
                indicator._translateTextIndependent = originalTranslateTextIndependent;
                return { success: false, error: "Copy button not found at expected layout position" };
            }

            let copiedText = "";
            Clipboard.set_text = function(type, text) {
                copiedText = text;
            };

            copyBtn.emit('clicked', 0);
            if (copiedText !== "Double Copy Test translated text") {
                Clipboard.get_text = originalClipboardGetText;
                Clipboard.set_text = originalClipboardSetText;
                indicator._translateTextIndependent = originalTranslateTextIndependent;
                return { success: false, error: "Copy button did not copy targetText! Got: " + copiedText };
            }

            // Copy-button dismissal is animated: wait out the fade
            await new Promise(resolve => {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
                    resolve();
                    return GLib.SOURCE_REMOVE;
                });
            });
            if (indicator._floatingWindow) {
                Clipboard.get_text = originalClipboardGetText;
                Clipboard.set_text = originalClipboardSetText;
                indicator._translateTextIndependent = originalTranslateTextIndependent;
                return { success: false, error: "Floating window was not destroyed after clicking Copy button!" };
            }
            if (indicator._escBound !== false) {
                Clipboard.get_text = originalClipboardGetText;
                Clipboard.set_text = originalClipboardSetText;
                indicator._translateTextIndependent = originalTranslateTextIndependent;
                return { success: false, error: "Transient Esc binding was not removed after window closed!" };
            }

            // Test 8b: Auto Copy functionality for Double-copy
            const originalAutoCopyState = indicator._settings.get_boolean('floating-auto-copy');
            indicator._settings.set_boolean('floating-auto-copy', true);
            try {
                let autoCopiedText = "";
                Clipboard.set_text = function(type, text) {
                    autoCopiedText = text;
                };

                // Reset state for clean double-copy sequence
                indicator._lastClipboardTime = null;
                indicator._lastClipboardText = null;
                indicator._lastTriggeredText = null;
                indicator._lastTriggeredTime = null;
                if (indicator._internalCopyTimeoutId) {
                    GLib.Source.remove(indicator._internalCopyTimeoutId);
                    indicator._internalCopyTimeoutId = null;
                }
                indicator._isInternalCopy = false;
                independentTranslationCallback = null;
                independentTranslationText = "";

                // Trigger double copy flow
                mockClipboardText = "Auto Copy Test input text";
                mockTime = 2000000;
                indicator._onSelectionChange(null, Meta.SelectionType.SELECTION_CLIPBOARD, null); // 1st
                mockTime = 2200000;
                indicator._onSelectionChange(null, Meta.SelectionType.SELECTION_CLIPBOARD, null); // 2nd (same text → triggers)

                if (!independentTranslationCallback) {
                    Clipboard.get_text = originalClipboardGetText;
                    Clipboard.set_text = originalClipboardSetText;
                    indicator._translateTextIndependent = originalTranslateTextIndependent;
                    return { success: false, error: "Auto-copy test did not trigger independent translation callback!" };
                }

                // Simulate translation completing
                independentTranslationCallback("Auto Copy Test translated text");

                // Verify that it auto-copied to clipboard immediately without clicking the copy button
                if (autoCopiedText !== "Auto Copy Test translated text") {
                    Clipboard.get_text = originalClipboardGetText;
                    Clipboard.set_text = originalClipboardSetText;
                    indicator._translateTextIndependent = originalTranslateTextIndependent;
                    return { success: false, error: "Auto-copy failed to automatically copy translated text! Got: " + autoCopiedText };
                }

                // Clean up the spawned window
                if (indicator._floatingWindow) {
                    indicator._floatingWindow.destroy();
                    indicator._floatingWindow = null;
                }
            } finally {
                indicator._settings.set_boolean('floating-auto-copy', originalAutoCopyState);
            }

            // Test 8c: Double-copy in background mode with toast enabled
            const originalBgMode = indicator._settings.get_boolean('floating-background-mode');
            const originalBgToast = indicator._settings.get_boolean('floating-background-toast');
            indicator._settings.set_boolean('floating-background-mode', true);
            indicator._settings.set_boolean('floating-background-toast', true);

            const MessageTray = await import("resource:///org/gnome/shell/ui/messageTray.js");
            const originalAddNotification = MessageTray.Source.prototype.addNotification;
            let notifyTitle = null;
            let notifyBody = null;
            let notifyCalled = false;
            MessageTray.Source.prototype.addNotification = function(notification) {
                notifyCalled = true;
                notifyTitle = notification.title;
                notifyBody = notification.body;
            };

            try {
                let bgCopiedText = "";
                Clipboard.set_text = function(type, text) {
                    bgCopiedText = text;
                };

                // Reset state
                indicator._lastClipboardTime = null;
                indicator._lastClipboardText = null;
                indicator._lastTriggeredText = null;
                indicator._lastTriggeredTime = null;
                if (indicator._internalCopyTimeoutId) {
                    GLib.Source.remove(indicator._internalCopyTimeoutId);
                    indicator._internalCopyTimeoutId = null;
                }
                indicator._isInternalCopy = false;
                independentTranslationCallback = null;
                independentTranslationText = "";

                // Trigger double copy
                mockClipboardText = "Bg Mode Toast input text";
                mockTime = 3000000;
                indicator._onSelectionChange(null, Meta.SelectionType.SELECTION_CLIPBOARD, null); // 1st
                mockTime = 3200000;
                indicator._onSelectionChange(null, Meta.SelectionType.SELECTION_CLIPBOARD, null); // 2nd

                if (!independentTranslationCallback) {
                    Clipboard.get_text = originalClipboardGetText;
                    Clipboard.set_text = originalClipboardSetText;
                    indicator._translateTextIndependent = originalTranslateTextIndependent;
                    MessageTray.Source.prototype.addNotification = originalAddNotification;
                    return { success: false, error: "Bg Mode Toast test did not trigger translation callback!" };
                }

                // Simulate translation completing
                independentTranslationCallback("Bg Mode Toast translated text");

                // Verify that:
                // 1. Floating window was NOT created
                if (indicator._floatingWindow) {
                    Clipboard.get_text = originalClipboardGetText;
                    Clipboard.set_text = originalClipboardSetText;
                    indicator._translateTextIndependent = originalTranslateTextIndependent;
                    MessageTray.Source.prototype.addNotification = originalAddNotification;
                    return { success: false, error: "Floating window was created in background mode!" };
                }

                // 2. Translated text was copied to clipboard
                if (bgCopiedText !== "Bg Mode Toast translated text") {
                    Clipboard.get_text = originalClipboardGetText;
                    Clipboard.set_text = originalClipboardSetText;
                    indicator._translateTextIndependent = originalTranslateTextIndependent;
                    MessageTray.Source.prototype.addNotification = originalAddNotification;
                    return { success: false, error: "Bg Mode Toast test failed to copy translation to clipboard! Got: " + bgCopiedText };
                }

                // 3. Notification was shown
                if (!notifyCalled || !notifyTitle || notifyBody !== "Bg Mode Toast input text → Bg Mode Toast translated text") {
                    Clipboard.get_text = originalClipboardGetText;
                    Clipboard.set_text = originalClipboardSetText;
                    indicator._translateTextIndependent = originalTranslateTextIndependent;
                    MessageTray.Source.prototype.addNotification = originalAddNotification;
                    return { success: false, error: "Bg Mode Toast notification not shown or content incorrect! Got: " + notifyBody };
                }
            } finally {
                MessageTray.Source.prototype.addNotification = originalAddNotification;
                indicator._settings.set_boolean('floating-background-mode', originalBgMode);
                indicator._settings.set_boolean('floating-background-toast', originalBgToast);
            }

            // Test 8d: Double-copy in background mode with toast disabled
            const originalBgModeD = indicator._settings.get_boolean('floating-background-mode');
            const originalBgToastD = indicator._settings.get_boolean('floating-background-toast');
            indicator._settings.set_boolean('floating-background-mode', true);
            indicator._settings.set_boolean('floating-background-toast', false);

            let notifyCalledD = false;
            MessageTray.Source.prototype.addNotification = function(notification) {
                notifyCalledD = true;
            };

            try {
                let bgCopiedText = "";
                Clipboard.set_text = function(type, text) {
                    bgCopiedText = text;
                };

                // Reset state
                indicator._lastClipboardTime = null;
                indicator._lastClipboardText = null;
                indicator._lastTriggeredText = null;
                indicator._lastTriggeredTime = null;
                if (indicator._internalCopyTimeoutId) {
                    GLib.Source.remove(indicator._internalCopyTimeoutId);
                    indicator._internalCopyTimeoutId = null;
                }
                indicator._isInternalCopy = false;
                independentTranslationCallback = null;
                independentTranslationText = "";

                // Trigger double copy
                mockClipboardText = "Bg Mode No Toast input text";
                mockTime = 4000000;
                indicator._onSelectionChange(null, Meta.SelectionType.SELECTION_CLIPBOARD, null); // 1st
                mockTime = 4200000;
                indicator._onSelectionChange(null, Meta.SelectionType.SELECTION_CLIPBOARD, null); // 2nd

                if (!independentTranslationCallback) {
                    Clipboard.get_text = originalClipboardGetText;
                    Clipboard.set_text = originalClipboardSetText;
                    indicator._translateTextIndependent = originalTranslateTextIndependent;
                    MessageTray.Source.prototype.addNotification = originalAddNotification;
                    return { success: false, error: "Bg Mode No Toast test did not trigger translation callback!" };
                }

                // Simulate translation completing
                independentTranslationCallback("Bg Mode No Toast translated text");

                // Verify that:
                // 1. Floating window was NOT created
                if (indicator._floatingWindow) {
                    Clipboard.get_text = originalClipboardGetText;
                    Clipboard.set_text = originalClipboardSetText;
                    indicator._translateTextIndependent = originalTranslateTextIndependent;
                    MessageTray.Source.prototype.addNotification = originalAddNotification;
                    return { success: false, error: "Floating window was created in background mode (no toast)!" };
                }

                // 2. Translated text was copied to clipboard
                if (bgCopiedText !== "Bg Mode No Toast translated text") {
                    Clipboard.get_text = originalClipboardGetText;
                    Clipboard.set_text = originalClipboardSetText;
                    indicator._translateTextIndependent = originalTranslateTextIndependent;
                    MessageTray.Source.prototype.addNotification = originalAddNotification;
                    return { success: false, error: "Bg Mode No Toast test failed to copy translation! Got: " + bgCopiedText };
                }

                // 3. Notification was NOT shown
                if (notifyCalledD) {
                    Clipboard.get_text = originalClipboardGetText;
                    Clipboard.set_text = originalClipboardSetText;
                    indicator._translateTextIndependent = originalTranslateTextIndependent;
                    MessageTray.Source.prototype.addNotification = originalAddNotification;
                    return { success: false, error: "Bg Mode notification was shown even though toast option is disabled!" };
                }
            } finally {
                MessageTray.Source.prototype.addNotification = originalAddNotification;
                indicator._settings.set_boolean('floating-background-mode', originalBgModeD);
                indicator._settings.set_boolean('floating-background-toast', originalBgToastD);
            }

            // Test 8e: Spamming Ctrl+C on the SAME text must trigger only ONCE
            {
                // Reset state
                indicator._lastClipboardTime = null;
                indicator._lastClipboardText = null;
                indicator._lastTriggeredText = null;
                indicator._lastTriggeredTime = null;
                if (indicator._internalCopyTimeoutId) {
                    GLib.Source.remove(indicator._internalCopyTimeoutId);
                    indicator._internalCopyTimeoutId = null;
                }
                indicator._isInternalCopy = false;
                independentTranslationCallback = null;
                independentTranslationText = "";
                independentCallCount = 0;
                if (indicator._floatingWindow) {
                    indicator._floatingWindow.destroy();
                    indicator._floatingWindow = null;
                }

                // 8 rapid copies, 100ms apart, of the SAME text. Every copy after
                // the first double-copy is inside the 2.5s cooldown and must be
                // suppressed, so exactly one translation may fire.
                const spamText = "Spam Test input text";
                mockClipboardText = spamText;
                let spamTime = 5000000;
                for (let i = 0; i < 8; i++) {
                    mockTime = spamTime;
                    indicator._onSelectionChange(null, Meta.SelectionType.SELECTION_CLIPBOARD, null);
                    spamTime += 100000;
                }

                if (independentCallCount !== 1) {
                    if (indicator._floatingWindow) {
                        indicator._floatingWindow.destroy();
                        indicator._floatingWindow = null;
                    }
                    return { success: false, error: "Ctrl+C spam triggered " + independentCallCount + " translations, expected exactly 1" };
                }

                // Per-text dedup: a DIFFERENT text must still trigger immediately.
                mockClipboardText = "Different Spam Test input text";
                mockTime = spamTime + 100000;
                indicator._onSelectionChange(null, Meta.SelectionType.SELECTION_CLIPBOARD, null); // baseline
                mockTime = spamTime + 200000;
                indicator._onSelectionChange(null, Meta.SelectionType.SELECTION_CLIPBOARD, null); // double-copy → trigger

                if (independentCallCount !== 2) {
                    if (indicator._floatingWindow) {
                        indicator._floatingWindow.destroy();
                        indicator._floatingWindow = null;
                    }
                    return { success: false, error: "Different-text double-copy was suppressed (count=" + independentCallCount + ")" };
                }

                // Clean up the spawned window
                if (indicator._floatingWindow) {
                    indicator._floatingWindow.destroy();
                    indicator._floatingWindow = null;
                }
            }

        } catch (e) {
            GLib.get_monotonic_time = originalGetMonotonicTime;
            Clipboard.get_text = originalClipboardGetText;
            Clipboard.set_text = originalClipboardSetText;
            indicator._translateTextIndependent = originalTranslateTextIndependent;
            if (indicator._floatingWindow) {
                indicator._floatingWindow.destroy();
                indicator._floatingWindow = null;
            }
            return { success: false, error: "Double-copy shortcut test failed: " + e.message };
        } finally {
            GLib.get_monotonic_time = originalGetMonotonicTime;
            Clipboard.get_text = originalClipboardGetText;
            Clipboard.set_text = originalClipboardSetText;
            indicator._translateTextIndependent = originalTranslateTextIndependent;
        }

        // Test 3b: the '⇄' guard, driven through the real onSwap closure.
        // Before the guard existed, swapping while the source was "Auto detect"
        // wrote AUTO into _target_lang and — because the pair is only re-derived
        // from settings — every later double-copy failed. The unit test covers the
        // pure decision; this covers the wiring, and provokes the guard rather
        // than trusting it.
        {
            const savedSource = indicator._source_lang;
            const savedTarget = indicator._target_lang;
            const savedTranslate = indicator._translateTextIndependent;
            try {
                indicator._source_lang = 'AUTO';
                indicator._target_lang = 'EN-US';
                indicator._translateTextIndependent = function (text, cb) {
                    cb("translated: " + text);
                };
                indicator._triggerFloatingTranslation("hello");
                const w = indicator._floatingWindow;
                if (!w) {
                    return { success: false, error: "Swap guard: no floating window was built" };
                }
                if (typeof w._onSwap !== 'function') {
                    w.destroy();
                    return { success: false, error: "Swap guard: window exposes no _onSwap" };
                }
                w._onSwap();
                if (indicator._target_lang === 'AUTO') {
                    w.destroy();
                    return { success: false, error: "Swap guard: AUTO reached the target slot" };
                }
                if (indicator._source_lang !== 'AUTO' || indicator._target_lang !== 'EN-US') {
                    w.destroy();
                    return { success: false, error: "Swap guard: refused swap still mutated the pair " +
                        indicator._source_lang + "->" + indicator._target_lang };
                }
                w.destroy();
                if (indicator._floatingWindow === w) {
                    indicator._floatingWindow = null;
                }
            } finally {
                indicator._translateTextIndependent = savedTranslate;
                indicator._source_lang = savedSource;
                indicator._target_lang = savedTarget;
            }
        }

        // Test 3c: dismissing the card must not let a late reply overwrite the
        // clipboard. The reply path called _copyToClipboard unconditionally, so
        // "Esc, copy something else, paste" silently pasted a translation the
        // user had already thrown away.
        {
            const savedAutoCopy = indicator._settings.get_boolean('floating-auto-copy');
            const savedSource = indicator._source_lang;
            const savedTarget = indicator._target_lang;
            const savedTranslate = indicator._translateTextIndependent;
            const savedCopy = indicator._copyToClipboard;
            let copiedAfterDismiss = 0;
            let capturedReply = null;
            try {
                // The branch under test only exists with auto-copy on; leaving
                // the schema default (off) would make this assertion vacuous.
                indicator._settings.set_boolean('floating-auto-copy', true);
                indicator._source_lang = 'ZH';
                indicator._target_lang = 'EN-US';
                indicator._translateTextIndependent = function (text, cb) {
                    capturedReply = cb;   // reply deferred until after dismissal
                };
                indicator._copyToClipboard = function (t) {
                    if (this === indicator && t === "late result")
                        copiedAfterDismiss++;
                };
                indicator._triggerFloatingTranslation("hello");
                const w = indicator._floatingWindow;
                if (!w) {
                    return { success: false, error: "Dismiss clipboard guard: no window built" };
                }
                if (typeof capturedReply !== 'function') {
                    w.destroy();
                    return { success: false, error: "Dismiss clipboard guard: request never issued" };
                }
                // Sanity: the flag the fix keys on must actually be set by the
                // user-facing dismissal path, not assumed.
                w._dismiss();
                if (w._userDismissed !== true) {
                    w.destroy();
                    return { success: false, error: "Dismiss clipboard guard: _dismiss did not record a user dismissal" };
                }
                capturedReply("late result", null);
                if (copiedAfterDismiss !== 0) {
                    w.destroy();
                    return { success: false, error: "Dismiss clipboard guard: a dismissed card still wrote the clipboard" };
                }
                w.destroy();
                if (indicator._floatingWindow === w)
                    indicator._floatingWindow = null;
            } finally {
                indicator._translateTextIndependent = savedTranslate;
                indicator._copyToClipboard = savedCopy;
                indicator._settings.set_boolean('floating-auto-copy', savedAutoCopy);
                indicator._source_lang = savedSource;
                indicator._target_lang = savedTarget;
            }
        }

        // Test 3d: a dismissed card must stop eating input at once, and must not
        // rely on the fade callback to actually go away. The backdrop spans the
        // whole work area and is reactive, so any click landing during the 120 ms
        // fade is swallowed; and if the frame clock never completes the tween
        // (screen off, suspend) the backdrop and the stage-level Esc listener
        // would stay alive indefinitely.
        {
            const savedTranslate = indicator._translateTextIndependent;
            const wait = (ms) => new Promise(resolve => {
                imports.gi.GLib.timeout_add(imports.gi.GLib.PRIORITY_DEFAULT, ms, () => {
                    resolve();
                    return imports.gi.GLib.SOURCE_REMOVE;
                });
            });
            try {
                indicator._translateTextIndependent = function () { /* never replies */ };
                indicator._triggerFloatingTranslation("hello");
                const w = indicator._floatingWindow;
                if (!w) {
                    return { success: false, error: "Dismiss input guard: no window built" };
                }
                if (w.overlay.reactive !== true) {
                    w.destroy();
                    return { success: false, error: "Dismiss input guard: precondition, backdrop should start reactive" };
                }
                w._dismiss();
                if (w.overlay.reactive !== false) {
                    w.destroy();
                    return { success: false, error: "Dismiss input guard: dismissed backdrop still swallows clicks" };
                }
                // Headless never completes the tween, so surviving this wait can
                // only be the fallback timer doing the teardown.
                await wait(800);
                if (w._winDestroyed !== true) {
                    w.destroy();
                    return { success: false, error: "Dismiss input guard: destroy() depends on the animation callback" };
                }
            } finally {
                indicator._translateTextIndependent = savedTranslate;
                if (indicator._floatingWindow && indicator._floatingWindow._winDestroyed)
                    indicator._floatingWindow = null;
            }
        }

        // Test 3e: pressing '⇄' before any result arrives must re-arm the 12 s
        // safety net. onRetry arms it and the fresh trigger path arms it, but the
        // swap path did not, so a card already past its watchdog would sit on
        // "Translating…" with a dimmed copy button and no retry, forever.
        {
            const savedTranslate = indicator._translateTextIndependent;
            const savedArm = indicator._armSafetyTimeout;
            const savedSource = indicator._source_lang;
            const savedTarget = indicator._target_lang;
            let w = null;
            let armCalls = 0;
            try {
                indicator._source_lang = 'ZH';
                indicator._target_lang = 'EN-US';
                indicator._translateTextIndependent = function () { /* never replies */ };
                indicator._armSafetyTimeout = function (win, ph) {
                    armCalls++;
                    return savedArm.call(this, win, ph);
                };
                indicator._triggerFloatingTranslation("hello");
                w = indicator._floatingWindow;
                if (!w) {
                    return { success: false, error: "Swap safety net: no window built" };
                }
                if (armCalls !== 1) {
                    return { success: false, error: "Swap safety net: expected the trigger path to arm once, got " + armCalls };
                }
                armCalls = 0;   // only the swap's own arming counts from here
                w._onSwap();
                if (armCalls === 0) {
                    return { success: false, error: "Swap safety net: ⇄ re-translated without re-arming the watchdog" };
                }
            } finally {
                indicator._translateTextIndependent = savedTranslate;
                indicator._armSafetyTimeout = savedArm;
                indicator._source_lang = savedSource;
                indicator._target_lang = savedTarget;
                if (indicator._safetyTimeoutId) {
                    try { imports.gi.GLib.Source.remove(indicator._safetyTimeoutId); } catch (_e) {}
                    indicator._safetyTimeoutId = null;
                }
                if (w) {
                    try { w.destroy(); } catch (_e) {}
                    if (indicator._floatingWindow === w)
                        indicator._floatingWindow = null;
                }
            }
        }

        // Test 3f/3g: prove the two new request-sanity guards are actually wired
        // into the shell, not just correct as pure functions. Both assertions are
        // built so that an unwired guard fails them: the same-language case must
        // show its message in the card, and the zero-width case must reach the
        // request builder if (and only if) the guard is missing.
        {
            const savedTranslate = indicator._translateTextIndependent;
            const savedBuild = indicator._buildRequestSpec;
            const savedSource = indicator._source_lang;
            const savedTarget = indicator._target_lang;
            let w = null;
            try {
                // --- same-language pair: no request, and the card says why ---
                indicator._source_lang = 'ZH';
                indicator._target_lang = 'ZH';
                indicator._buildRequestSpec = function (...a) {
                    return savedBuild.apply(this, a);
                };
                let issued = 0;
                indicator._translateTextIndependent = function () { issued++; };
                indicator._triggerFloatingTranslation("hello");
                w = indicator._floatingWindow;
                if (!w) {
                    return { success: false, error: "Same-language guard: no card shown at all" };
                }
                if (issued !== 0) {
                    return { success: false, error: "Same-language guard: a request was still issued" };
                }
                // Translations are inert on this machine (no .mo), so the msgid
                // itself is what the label holds; match on that, not on a _()
                // call which does not exist in a classic Eval script.
                if (!w._currentTarget || w._currentTarget.indexOf('same') === -1) {
                    return { success: false, error: "Same-language guard: card shows no explanation, got " + w._currentTarget };
                }
                if (w._retryBtn && w._retryBtn.visible !== true) {
                    return { success: false, error: "Same-language guard: error surface is not the one the reply path uses" };
                }
                w.destroy();
                if (indicator._floatingWindow === w)
                    indicator._floatingWindow = null;
                w = null;

                // --- zero-width-only clipboard: never reaches the builder ---
                // Restore the real entry point: the stub above would make the
                // positive control vacuous (it counted a different function).
                indicator._translateTextIndependent = savedTranslate;
                indicator._source_lang = 'ZH';
                indicator._target_lang = 'EN-US';
                let built = 0;
                indicator._buildRequestSpec = function (...a) {
                    built++;
                    // null short-circuits right after the call, so no Soup
                    // message is ever built and no request can leave the process.
                    return null;
                };
                indicator._translateTextIndependent("\u200B\u200E\u200F", () => {});
                if (built !== 0) {
                    return { success: false, error: "Zero-width guard: invisible-only text still reached the request builder" };
                }
                // Positive control: real text must still get through, or the
                // guard would be a blanket "never translate" bug.
                indicator._translateTextIndependent("\u4f60\u597d", () => {});
                if (built !== 1) {
                    return { success: false, error: "Zero-width guard also swallowed real text (built=" + built + ")" };
                }
            } finally {
                indicator._translateTextIndependent = savedTranslate;
                indicator._buildRequestSpec = savedBuild;
                indicator._source_lang = savedSource;
                indicator._target_lang = savedTarget;
                if (w) {
                    try { w.destroy(); } catch (_e) {}
                    if (indicator._floatingWindow === w)
                        indicator._floatingWindow = null;
                }
            }
        }

        // Test 3h: the message for an unsupported language has to name it. The
        // builder already reports `detail: "ID->ZH"` and the old sentence threw it
        // away, so a user who picks Indonesian on Baidu is told the pair is
        // unsupported without being told which one they chose.
        {
            const msg = indicator._providerErrorText({
                code: 'unsupported-language', detail: 'ID->ZH',
            });
            if (typeof msg !== 'string' || msg.indexOf('ID->ZH') === -1) {
                return { success: false, error: "Unsupported-language message names no language, got: " + msg };
            }
            // The provider label must survive too, or the hint is unattributed.
            if (!/Baidu|Google|DeepL|Youdao|translation service/i.test(msg)) {
                return { success: false, error: "Unsupported-language message lost the provider, got: " + msg };
            }
        }

        // Test 3i: a word renders as a dictionary card in the destination
        // region. The card is Pango markup set on the SAME label the plain
        // translation uses, so the height/scroll machinery is unchanged; the
        // copy button must still copy the plain translation, not the markup.
        {
            let w = null;
            try {
                let FloatingTranslationWindow = indicator.FloatingTranslationWindow;
                w = new FloatingTranslationWindow("bank", "银行", "EN", "ZH");
                const dict = {
                    translation: "银行",
                    phonetic: "bæŋk",
                    detectedLang: "en",
                    // The '&' and '<' exercise escapeMarkup: a raw '<' would make
                    // set_markup throw and land in this block's catch.
                    entries: [
                        { pos: "noun", terms: ["银行", "岸", "a<b&c"] },
                        { pos: "verb", terms: ["存款"] },
                    ],
                    examples: ["the bank of the river"],
                    isDictionary: true,
                };
                w.setDictionary(dict);
                // get_text() returns the parsed text (markup stripped), so a
                // literal "<b>" here would prove set_markup was never applied.
                const shown = w._destLabel.get_text();
                if (shown.indexOf("<b>") !== -1 || shown.indexOf("</b>") !== -1) {
                    w.destroy();
                    return { success: false, error: "Dict card rendered raw markup: " + shown };
                }
                if (shown.indexOf("bæŋk") === -1) {
                    w.destroy();
                    return { success: false, error: "Dict card lost the phonetic: " + shown };
                }
                if (shown.indexOf("noun") === -1 || shown.indexOf("银行") === -1 || shown.indexOf("岸") === -1) {
                    w.destroy();
                    return { success: false, error: "Dict card lost POS/terms: " + shown };
                }
                if (shown.indexOf("a<b&c") === -1) {
                    w.destroy();
                    return { success: false, error: "Dict card mangled an escaped term: " + shown };
                }
                if (shown.indexOf("the bank of the river") === -1) {
                    w.destroy();
                    return { success: false, error: "Dict card lost the example: " + shown };
                }
                if (w._currentTarget !== "银行") {
                    w.destroy();
                    return { success: false, error: "Dict card copy target should be the plain translation, got: " + w._currentTarget };
                }
                if (w._loading !== false) {
                    w.destroy();
                    return { success: false, error: "Dict card must not be in the loading state" };
                }
                if (w._destLabel.style_class.indexOf('dict') === -1) {
                    w.destroy();
                    return { success: false, error: "Dict card did not add the 'dict' class: " + w._destLabel.style_class };
                }
                // Switching back to a plain translation must clear the class,
                // or a later sentence would keep the dictionary's weight.
                w.setTargetText("plain sentence");
                if (w._destLabel.style_class.indexOf('dict') !== -1) {
                    w.destroy();
                    return { success: false, error: "Plain text did not clear the 'dict' class: " + w._destLabel.style_class };
                }
                w.destroy();
                if (indicator._floatingWindow === w)
                    indicator._floatingWindow = null;
            } catch (e) {
                if (w) { try { w.destroy(); } catch (_e) {} }
                return { success: false, error: "Dict card test failed: " + e.message };
            }
        }

        // Test 3j: a single word is routed to Google (the only provider with
        // dictionary data) while prose stays on the selected provider. Set on
        // the cached service value directly so the assertion does not depend on
        // a settings round-trip; restored in the finally.
        {
            const savedService = indicator._translation_service;
            try {
                indicator._translation_service = 0; // DeepL selected
                if (indicator._effectiveProvider("bank").id !== "google") {
                    return { success: false, error: "A word must route to Google for the dictionary card" };
                }
                if (indicator._effectiveProvider("hello world").id !== "deepl") {
                    return { success: false, error: "Prose must stay on the selected provider" };
                }
                indicator._translation_service = 1; // Google selected
                if (indicator._effectiveProvider("hello world").id !== "google") {
                    return { success: false, error: "With Google selected, prose must stay on Google" };
                }
            } finally {
                indicator._translation_service = savedService;
            }
        }

        // Test 4: FloatingTranslationWindow layout, centering, overlay click-to-close, Esc-to-close
        try {
            const GLib = imports.gi.GLib;
            const sleep = (ms) => new Promise(resolve => {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
                    resolve();
                    return GLib.SOURCE_REMOVE;
                });
            });
            let FloatingTranslationWindow = indicator.FloatingTranslationWindow;
            let win = new FloatingTranslationWindow("Input text", "Output text", "EN", "FR", () => {
                indicator._floatingWindow = null;
            });

            // Verify initial overlay and actor properties
            if (win.overlay.style_class !== 'translate-floating-overlay') {
                win.destroy();
                return { success: false, error: "Overlay style class is incorrect" };
            }
            if (win.actor.style_class !== 'translate-floating-window') {
                win.destroy();
                return { success: false, error: "Actor style class is incorrect" };
            }

            // The card must be painted from the variant stylesheet the shell
            // picked for Main.getStyleVariant(). The padding assertion is what
            // actually proves the @import resolved: padding/border-radius live
            // in stylesheet-base.css, so a failed import leaves it at 0 while
            // the background colour (from the variant file) still looks right.
            {
                let variant = Main.getStyleVariant();
                let node = win.actor.get_theme_node();
                let bg = node.get_background_color();
                let wantBg = (variant === 'dark') ? [0x36, 0x36, 0x3a] : [0xff, 0xff, 0xff];
                if (bg.red !== wantBg[0] || bg.green !== wantBg[1] || bg.blue !== wantBg[2] || bg.alpha !== 255) {
                    let got = [bg.red, bg.green, bg.blue, bg.alpha].join(',');
                    win.destroy();
                    return { success: false, error: "Card background does not match the '" + variant + "' variant stylesheet! Got rgba(" + got + ") want rgba(" + wantBg.join(',') + ",255)" };
                }
                let padTop = node.get_padding(St.Side.TOP);
                if (padTop !== 24) {
                    win.destroy();
                    return { success: false, error: "stylesheet-base.css did not load via @import! padding-top=" + padTop + " want 24 (variant='" + variant + "')" };
                }
            }

            // Geometry baseline: the popup's OWN monitor work area. Not the raw
            // monitor rectangle — the top panel's strut must not push the card
            // off-center. Headless --virtual-monitor still has a 32px panel
            // strut, so monitor != work area even here.
            let area = Main.layoutManager.getWorkAreaForMonitor(win._monitorIndex);
            let areaStr = [area.x, area.y, area.width, area.height].join('x');

            // The dismiss backdrop must cover ONLY that work area, never the
            // whole stage: a stage-sized reactive overlay swallows clicks on
            // every other monitor as dismiss gestures.
            if (win.overlay.x !== area.x || win.overlay.y !== area.y ||
                win.overlay.width !== area.width || win.overlay.height !== area.height) {
                let got = [win.overlay.x, win.overlay.y, win.overlay.width, win.overlay.height].join('x');
                win.destroy();
                return { success: false, error: "Overlay does not match monitor work area! Expected: " + areaStr + " Got: " + got + " stage: " + global.stage.width + "x" + global.stage.height };
            }

            // Simulate allocation event to trigger centering logic, then wait
            // for the settle chain (height caps + recenter run on idle).
            win.actor.notify('allocation');
            await sleep(600);

            let expectedX = area.x + (area.width - win.actor.get_width()) / 2;
            let expectedY = area.y + (area.height - win.actor.get_height()) / 2;
            // Capture geometry BEFORE destroy: the mismatch branch destroys
            // first, which nulls actor and would mask Expected vs Got.
            let gotX = win.actor.x;
            let gotY = win.actor.y;
            if (Math.abs(gotX - expectedX) > 2 || Math.abs(gotY - expectedY) > 2) {
                win.destroy();
                return { success: false, error: "FloatingTranslationWindow was not centered correctly! Expected: " + expectedX + "," + expectedY + " Got: " + gotX + "," + gotY + " workArea: " + areaStr };
            }

            // A6/B1 regression guard. With long text the src/dest caps are the
            // ONLY bound on the card: St ignores max-height on this actor
            // (measured — "max-height: 200px" left a 441px card at 441px), so a
            // budget that forgets the chrome silently fills the screen. The
            // round count catches the measurement ratchet, where re-reading a
            // pinned label height added HEIGHT_SAFETY on every settle pass and
            // never converged.
            {
                let longSrc = "";
                for (let i = 0; i < 120; i++) longSrc += "Source sentence number " + i + " that is reasonably long. ";
                let longDst = "";
                for (let i = 0; i < 120; i++) longDst += "Translated sentence number " + i + " of similar length. ";
                let big = new FloatingTranslationWindow(longSrc, longDst, "EN", "FR", () => {});
                big.actor.notify('allocation');
                await sleep(1500);
                let ceiling = Math.floor(area.height * 0.60) + 2;
                let gotH = Math.round(big.actor.get_height());
                let rounds = big._settleCount;
                big.destroy();
                if (gotH > ceiling) {
                    win.destroy();
                    return { success: false, error: "Long-text card exceeded the 60% work-area budget! height=" + gotH + " ceiling=" + ceiling + " workAreaHeight=" + area.height + " srcLen=" + longSrc.length };
                }
                if (rounds > 5) {
                    win.destroy();
                    return { success: false, error: "Height settle loop did not converge (label height ratcheting?) _settleCount=" + rounds };
                }
            }

            // Verify click on backdrop overlay destroys the window
            // (the popup intentionally has no keypress/modal handler; see
            // FloatingTranslationWindow constructor note about focus theft)
            // Set win to a property so we can track it or destroy it
            indicator._floatingWindow = win;

            // Trigger the overlay's press handler directly (emitting a forged
            // ClutterEvent is rejected by the type system; the handler itself
            // ignores its arguments).
            // (dismissal is animated: wait out the fade before asserting)
            win._overlayPressHandler(win.overlay, null);
            await sleep(400);

            if (indicator._floatingWindow) {
                indicator._floatingWindow.destroy();
                indicator._floatingWindow = null;
                return { success: false, error: "Overlay click did not destroy FloatingTranslationWindow!" };
            }

            // Verify Esc on the stage destroys the window (no focus/modal needed)
            let win2 = new FloatingTranslationWindow("Input text", "Output text", "EN", "FR", () => {
                indicator._floatingWindow = null;
            });
            indicator._floatingWindow = win2;
            if (win2._keyPressId === null || win2._keyPressId === undefined) {
                win2.destroy();
                indicator._floatingWindow = null;
                return { success: false, error: "Stage Esc listener was not installed!" };
            }
            const Clutter = imports.gi.Clutter;
            const escEvent = {
                type: () => Clutter.EventType.KEY_PRESS,
                get_key_symbol: () => Clutter.KEY_Escape,
            };
            // A non-key event must be ignored
            win2._keyPressHandler(global.stage, {
                type: () => Clutter.EventType.BUTTON_PRESS,
                get_key_symbol: () => 0,
            });
            if (!indicator._floatingWindow) {
                return { success: false, error: "Non-key captured-event wrongly dismissed the window!" };
            }
            // Invoke the window's stage handler directly: emitting a forged
            // event through global.stage would also hit Shell's own handlers.
            const ret = win2._keyPressHandler(global.stage, escEvent);
            if (ret !== Clutter.EVENT_PROPAGATE) {
                win2.destroy();
                indicator._floatingWindow = null;
                return { success: false, error: "Esc handler must propagate the event to the focused app!" };
            }
            await sleep(400);
            if (indicator._floatingWindow) {
                indicator._floatingWindow.destroy();
                indicator._floatingWindow = null;
                return { success: false, error: "Esc did not destroy FloatingTranslationWindow!" };
            }
            // Listener must have been disconnected in destroy(): the id is
            // cleared, so a later Esc can no longer reach this instance.
            // (Calling the nulled field itself would throw by design.)
            if (win2._keyPressId !== null) {
                return { success: false, error: "Stage Esc listener was not disconnected on destroy!" };
            }
        } catch (e) {
            if (indicator._floatingWindow) {
                indicator._floatingWindow.destroy();
                indicator._floatingWindow = null;
            }
            return { success: false, error: "FloatingTranslationWindow centering/overlay test failed: " + e.message };
        }

        // Restore mock functions
        indicator._httpSession.send_and_read_async = originalSendReadAsync;
        indicator._httpSession.send_and_read_finish = originalSendReadFinish;

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message || String(e) };
    } finally {
        // One clause covers every exit: the ~70 early
        // `return { success: false }` branches, the success branch, and a
        // throw escaping the try. Without it, failing anywhere between the
        // first set_boolean and the end of the suite would leave the
        // developer's own settings at test values. A finally must not return,
        // or it would discard the result the caller reads back.
        try {
            if (settingsRestore)
                settingsRestore();
        } catch (restoreError) {
            // Nothing useful can be done from a finally clause; the suite
            // result has already been decided.
        }
    }
})();

global.testRunnerPromise.then(res => {
    global.testRunnerResult = JSON.stringify(res);
}).catch(err => {
    global.testRunnerResult = JSON.stringify({ success: false, error: err.message || String(err) });
});
