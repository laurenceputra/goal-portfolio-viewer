(() => {
    const storage = {};

    function installGmShim({ includeListValues = true } = {}) {
        window.GM_setValue = function(key, value) {
            storage[key] = value;
        };

        window.GM_getValue = function(key, defaultValue) {
            return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : defaultValue;
        };

        window.GM_deleteValue = function(key) {
            delete storage[key];
        };

        if (includeListValues) {
            window.GM_listValues = function() {
                return Object.keys(storage);
            };
        }

        window.GM_cookie = undefined;
    }

    function loadUserscript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load userscript: ${src}`));
            document.head.appendChild(script);
        });
    }

    function waitForButton(timeoutMs = 10000) {
        return waitForCondition(() => Boolean(document.querySelector('.gpv-trigger-btn')), {
            timeoutMs,
            intervalMs: 100,
            errorMessage: 'Timed out waiting for .gpv-trigger-btn'
        });
    }

    function waitForCondition(check, { timeoutMs = 5000, intervalMs = 50, errorMessage = 'Condition not met' } = {}) {
        return new Promise((resolve, reject) => {
            const started = Date.now();
            const attempt = () => {
                if (check()) {
                    resolve();
                    return;
                }
                if (Date.now() - started >= timeoutMs) {
                    reject(new Error(errorMessage));
                    return;
                }
                setTimeout(attempt, intervalMs);
            };
            attempt();
        });
    }

    function signalReady() {
        window.__GPV_E2E_READY__ = true;
        window.dispatchEvent(new Event('gpv:e2e-ready'));
    }

    window.GpvDemoBootstrap = {
        installGmShim,
        loadUserscript,
        waitForButton,
        waitForCondition,
        signalReady
    };
})();
