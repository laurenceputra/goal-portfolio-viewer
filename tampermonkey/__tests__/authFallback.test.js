const { setupDom, teardownDom } = require('./helpers/domSetup');

function createFetchResponse(body = {}) {
    return {
        clone: () => createFetchResponse(body),
        json: () => Promise.resolve(body),
        ok: true,
        status: 200
    };
}

function installCommonMocks(gmCookieListImpl) {
    const storage = new Map();
    global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
    global.GM_getValue = jest.fn((key, fallback = null) => (
        storage.has(key) ? storage.get(key) : fallback
    ));
    global.GM_deleteValue = jest.fn(key => storage.delete(key));
    global.GM_cookie = {
        list: gmCookieListImpl || jest.fn((_, cb) => cb ? cb([]) : [])
    };

    const fetchMock = jest.fn(() => Promise.resolve(createFetchResponse({})));
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    class FakeXHR {
        open() {
            return true;
        }
        setRequestHeader() {
            return true;
        }
        addEventListener() {
            return true;
        }
        send() {
            return true;
        }
    }
    global.XMLHttpRequest = FakeXHR;
}

function loadUserscript(options = {}) {
    const { url, gmCookieListImpl } = options;
    jest.resetModules();
    setupDom({ url });
    installCommonMocks(gmCookieListImpl);
    return require('../goal_portfolio_viewer.user.js');
}

describe('performance auth header behavior', () => {
    afterEach(() => {
        jest.useRealTimers();
        teardownDom();
    });

    test('listCookieByQuery resolves empty array when GM_cookie.list throws', async () => {
        const list = jest.fn(() => {
            throw new Error('GM_cookie.list failed');
        });
        const { listCookieByQuery } = loadUserscript({ gmCookieListImpl: list });

        await expect(listCookieByQuery({ name: 'webapp-sg-access-token' })).resolves.toEqual([]);
    });

    test('listCookieByQuery resolves empty array when GM_cookie.list rejects', async () => {
        const list = jest.fn(() => Promise.reject(new Error('GM_cookie.list rejected')));
        const { listCookieByQuery } = loadUserscript({ gmCookieListImpl: list });

        await expect(listCookieByQuery({ name: 'webapp-sg-access-token' })).resolves.toEqual([]);
    });

    test('buildPerformanceRequestHeaders uses GM_cookie token for authorization only', async () => {
        const list = jest.fn((query, cb) => {
            const cookies = query?.name === 'webapp-sg-access-token'
                ? [{ name: 'webapp-sg-access-token', value: 'fallback-token' }]
                : [];
            return cb ? cb(cookies) : cookies;
        });
        const { buildPerformanceRequestHeaders } = loadUserscript({ gmCookieListImpl: list });

        document.cookie = 'webapp-sg-access-token=document-cookie-token';
        document.cookie = 'webapp-deviceId=document-cookie-device-id';

        const headers = await buildPerformanceRequestHeaders();

        expect(headers.get('authorization')).toBe('Bearer fallback-token');
        expect(headers.get('client-id')).toBe(null);
        expect(headers.get('device-id')).toBe(null);
        expect(list).toHaveBeenCalled();
    });

    test('buildPerformanceRequestHeaders respects GM_cookie token rotation', async () => {
        let gmToken = 'token-a';
        const list = jest.fn((query, cb) => {
            const cookies = query?.name === 'webapp-sg-access-token'
                ? [{ name: 'webapp-sg-access-token', value: gmToken }]
                : [];
            return cb ? cb(cookies) : cookies;
        });
        const { buildPerformanceRequestHeaders } = loadUserscript({ gmCookieListImpl: list });

        const firstHeaders = await buildPerformanceRequestHeaders();
        gmToken = 'token-b';
        const secondHeaders = await buildPerformanceRequestHeaders();

        expect(firstHeaders.get('authorization')).toBe('Bearer token-a');
        expect(secondHeaders.get('authorization')).toBe('Bearer token-b');
        expect(list).toHaveBeenCalled();
    });

    test('buildPerformanceRequestHeaders ignores document.cookie auth fallback on Endowus host', async () => {
        const list = jest.fn((_, cb) => (cb ? cb([]) : []));
        const { buildPerformanceRequestHeaders } = loadUserscript({ gmCookieListImpl: list });

        document.cookie = 'webapp-sg-access-token=document-cookie-token';
        document.cookie = 'webapp-deviceId=document-cookie-device-id';

        const headers = await buildPerformanceRequestHeaders();

        expect(headers.get('authorization')).toBe(null);
        expect(headers.get('client-id')).toBe(null);
        expect(headers.get('device-id')).toBe(null);
        expect(list).toHaveBeenCalled();
    });

    test('buildPerformanceRequestHeaders is fail-closed when GM_cookie callback never fires', async () => {
        jest.useFakeTimers();
        const list = jest.fn(() => undefined);
        const { buildPerformanceRequestHeaders } = loadUserscript({ gmCookieListImpl: list });

        let settled = false;
        const headersPromise = buildPerformanceRequestHeaders().then(headers => {
            settled = true;
            return headers;
        });

        await Promise.resolve();
        expect(settled).toBe(false);
        jest.advanceTimersByTime(1000);
        const headers = await headersPromise;

        expect(settled).toBe(true);
        expect(list).toHaveBeenCalled();

        expect(headers.get('authorization')).toBe(null);
        expect(headers.get('client-id')).toBe(null);
        expect(headers.get('device-id')).toBe(null);
    });

    test('buildPerformanceRequestHeaders skips GM_cookie outside Endowus host', async () => {
        const list = jest.fn((_, cb) => cb ? cb([{ name: 'webapp-sg-access-token', value: 'token' }]) : []);
        const {
            isEndowusAuthContext,
            buildPerformanceRequestHeaders
        } = loadUserscript({
            url: 'https://secure.fundsupermart.com/fsmone/dashboard',
            gmCookieListImpl: list
        });

        document.cookie = 'webapp-sg-access-token=browser-cookie-token';
        document.cookie = 'webapp-deviceId=device-123';

        expect(isEndowusAuthContext()).toBe(false);
        const headers = await buildPerformanceRequestHeaders();
        expect(headers.get('authorization')).toBe(null);
        expect(headers.get('client-id')).toBe(null);
        expect(headers.get('device-id')).toBe(null);
        expect(list).not.toHaveBeenCalled();
    });
});
