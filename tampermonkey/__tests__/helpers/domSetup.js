const { JSDOM } = require('jsdom');

function setupDom(options = {}) {
    const url = options.url || 'https://app.sg.endowus.com/dashboard';
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url });
    global.window = dom.window;
    global.document = dom.window.document;
    global.MutationObserver = dom.window.MutationObserver;
    global.HTMLElement = dom.window.HTMLElement;
    global.Node = dom.window.Node;
    if (typeof global.XMLHttpRequest === 'undefined') {
        global.XMLHttpRequest = dom.window.XMLHttpRequest;
    }
    if (typeof global.fetch === 'undefined') {
        global.fetch = dom.window.fetch;
    }
    if (typeof global.setTimeout === 'undefined') {
        global.setTimeout = dom.window.setTimeout.bind(dom.window);
    }
    if (typeof global.clearTimeout === 'undefined') {
        global.clearTimeout = dom.window.clearTimeout.bind(dom.window);
    }
    if (typeof global.setInterval === 'undefined') {
        global.setInterval = dom.window.setInterval.bind(dom.window);
    }
    if (typeof global.clearInterval === 'undefined') {
        global.clearInterval = dom.window.clearInterval.bind(dom.window);
    }
    window.__GPV_DISABLE_AUTO_INIT = true;
    return dom;
}

function teardownDom() {
    if (global.window && typeof global.window.close === 'function') {
        global.window.close();
    }
    delete global.window;
    delete global.document;
    delete global.MutationObserver;
    delete global.HTMLElement;
    delete global.Node;

    delete global.GM_setValue;
    delete global.GM_getValue;
    delete global.GM_deleteValue;
    delete global.GM_listValues;
    delete global.GM_cookie;
    delete global.GM_xmlhttpRequest;
    delete global.XMLHttpRequest;
    delete global.fetch;

}

module.exports = {
    setupDom,
    teardownDom
};
