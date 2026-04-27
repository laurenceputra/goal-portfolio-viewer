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

describe('auth fallback behavior', () => {
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

    test('buildPerformanceRequestHeaders uses fallback auth when captured authorization is absent and captured non-auth headers override fallback', async () => {
        const list = jest.fn((query, cb) => {
            const cookies = query?.name === 'webapp-sg-access-token'
                ? [{ name: 'webapp-sg-access-token', value: 'fallback-token' }]
                : [];
            return cb ? cb(cookies) : cookies;
        });
        const {
            extractAuthHeaders,
            buildPerformanceRequestHeaders
        } = loadUserscript({ gmCookieListImpl: list });

        document.cookie = 'webapp-deviceId=fallback-device-id';

        extractAuthHeaders('https://app.sg.endowus.com/v1/goals/performance', {
            headers: {
                'client-id': 'request-client-id',
                'device-id': 'request-device-id'
            }
        });

        const headers = await buildPerformanceRequestHeaders();

        expect(headers.get('authorization')).toBe('Bearer fallback-token');
        expect(headers.get('client-id')).toBe('request-client-id');
        expect(headers.get('device-id')).toBe('request-device-id');
        expect(list).toHaveBeenCalled();
    });

    test('buildPerformanceRequestHeaders returns captured authorization without GM_cookie fallback when callback never fires', async () => {
        jest.useFakeTimers();
        const list = jest.fn(() => undefined);
        const {
            extractAuthHeaders,
            buildPerformanceRequestHeaders
        } = loadUserscript({ gmCookieListImpl: list });

        extractAuthHeaders('https://app.sg.endowus.com/v1/goals/performance', {
            headers: {
                authorization: 'Bearer request-token'
            }
        });

        let settled = false;
        const headersPromise = buildPerformanceRequestHeaders().then(headers => {
            settled = true;
            return headers;
        });

        await Promise.resolve();
        expect(settled).toBe(true);
        expect(list).not.toHaveBeenCalled();

        const headers = await headersPromise;

        expect(headers.get('authorization')).toBe('Bearer request-token');
        expect(headers.get('client-id')).toBe(null);
        expect(headers.get('device-id')).toBe(null);
    });

    test('fallback auth skips Endowus cookie reads outside Endowus host', async () => {
        const list = jest.fn((_, cb) => cb ? cb([{ name: 'webapp-sg-access-token', value: 'token' }]) : []);
        const {
            isEndowusAuthContext,
            getFallbackAuthHeaders
        } = loadUserscript({
            url: 'https://secure.fundsupermart.com/fsmone/dashboard',
            gmCookieListImpl: list
        });

        document.cookie = 'webapp-sg-access-token=browser-cookie-token';
        document.cookie = 'webapp-deviceId=device-123';

        expect(isEndowusAuthContext()).toBe(false);
        await expect(getFallbackAuthHeaders()).resolves.toEqual({
            authorization: null,
            'client-id': null,
            'device-id': null
        });
        expect(list).not.toHaveBeenCalled();
    });
});
