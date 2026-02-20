const { JSDOM } = require('jsdom');

function setupDom(options = {}) {
    const url = options.url || 'https://app.sg.endowus.com/dashboard';
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url });
    global.window = dom.window;
    global.document = dom.window.document;
    global.MutationObserver = dom.window.MutationObserver;
    global.HTMLElement = dom.window.HTMLElement;
    global.Node = dom.window.Node;
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

}

module.exports = {
    setupDom,
    teardownDom
};
