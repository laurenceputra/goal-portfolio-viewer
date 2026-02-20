const { webcrypto } = require('crypto');

if (typeof global.crypto === 'undefined') {
    global.crypto = webcrypto;
}

if (typeof global.atob === 'undefined') {
    global.atob = input => Buffer.from(String(input), 'base64').toString('binary');
}

if (typeof global.btoa === 'undefined') {
    global.btoa = input => Buffer.from(String(input), 'binary').toString('base64');
}

if (typeof global.GM_getValue !== 'function') {
    global.GM_getValue = () => null;
}

if (typeof global.GM_setValue !== 'function') {
    global.GM_setValue = () => {};
}

if (typeof global.GM_deleteValue !== 'function') {
    global.GM_deleteValue = () => {};
}

if (typeof global.window === 'undefined') {
    global.window = { location: { href: 'https://app.sg.endowus.com/dashboard' } };
} else if (!global.window.location) {
    global.window.location = { href: 'https://app.sg.endowus.com/dashboard' };
} else if (!global.window.location.href) {
    global.window.location.href = 'https://app.sg.endowus.com/dashboard';
}

if (!global.window.__GPV_DISABLE_AUTO_INIT) {
    global.window.__GPV_DISABLE_AUTO_INIT = true;
}

if (typeof global.afterEach === 'function') {
    global.afterEach(() => {
        if (global.window?.__gpvUrlMonitorCleanup) {
            global.window.__gpvUrlMonitorCleanup();
        }
    });
}
