const { setupDom, teardownDom } = require('./helpers/domSetup');

describe('API interception', () => {
    let storage;
    let baseFetchMock;

    beforeEach(() => {
        jest.resetModules();
        setupDom();

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };

        const responseFactory = body => ({
            clone: () => responseFactory(body),
            json: () => Promise.resolve(body),
            ok: true,
            status: 200
        });

        baseFetchMock = jest.fn(() => Promise.resolve(responseFactory({})));
        global.fetch = baseFetchMock;
        window.fetch = baseFetchMock;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this._listeners = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener(eventName, callback) {
                if (!this._listeners[eventName]) {
                    this._listeners[eventName] = [];
                }
                this._listeners[eventName].push(callback);
            }
            send() {
                if (this._listeners.load) {
                    this._listeners.load.forEach(callback => callback.call(this));
                }
            }
        }
        global.XMLHttpRequest = FakeXHR;

        require('../goal_portfolio_viewer.user.js');
    });

    afterEach(() => {
        teardownDom();
        delete global.GM_setValue;
        delete global.GM_getValue;
        delete global.GM_deleteValue;
        delete global.GM_cookie;
        delete global.XMLHttpRequest;
    });

    function flushPromises() {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    test('fetch interception stores performance data', async () => {
        const performanceData = [{ goalId: 'goal1' }];
        const responseFactory = body => ({
            clone: () => responseFactory(body),
            json: () => Promise.resolve(body),
            ok: true,
            status: 200
        });
        baseFetchMock.mockResolvedValueOnce(responseFactory(performanceData));

        await window.fetch('https://app.sg.endowus.com/v1/goals/performance');
        await flushPromises();

        expect(global.GM_setValue).toHaveBeenCalledWith(
            'api_performance',
            JSON.stringify(performanceData)
        );
    });


    test('fetch interception stores FSM holdings and filters DPMS_HEADER rows', async () => {
        const holdingsPayload = {
            data: [
                {
                    refno: 'ref-1',
                    holdings: [
                        { code: 'AAA', productType: 'STOCK' },
                        { code: 'HEADER', productType: 'DPMS_HEADER' }
                    ]
                }
            ]
        };
        const responseFactory = body => ({
            clone: () => responseFactory(body),
            json: () => Promise.resolve(body),
            ok: true,
            status: 200
        });
        baseFetchMock.mockResolvedValueOnce(responseFactory(holdingsPayload));

        await window.fetch('https://secure.fundsupermart.com/fsmone/rest/holding/client/protected/find-holdings-with-pnl');
        await flushPromises();

        expect(global.GM_setValue).toHaveBeenCalledWith(
            'api_fsm_holdings',
            JSON.stringify([{ code: 'AAA', productType: 'STOCK' }])
        );
    });

    test('fetch interception ignores non-matching endpoints', async () => {
        const responseFactory = body => ({
            clone: () => responseFactory(body),
            json: () => Promise.resolve(body),
            ok: true,
            status: 200
        });
        baseFetchMock.mockResolvedValueOnce(responseFactory({ ok: true }));
        global.GM_setValue.mockClear();

        await window.fetch('https://app.sg.endowus.com/v1/other');
        await flushPromises();

        expect(global.GM_setValue).not.toHaveBeenCalled();
    });

    test('fetch interception tolerates JSON parse errors', async () => {
        const responseFactory = () => ({
            clone: () => responseFactory(),
            json: () => Promise.reject(new Error('Bad JSON')),
            ok: true,
            status: 200
        });
        baseFetchMock.mockResolvedValueOnce(responseFactory());
        global.GM_setValue.mockClear();

        await window.fetch('https://app.sg.endowus.com/v1/goals/performance');
        await flushPromises();

        expect(global.GM_setValue).not.toHaveBeenCalled();
    });

    test('XMLHttpRequest interception stores summary data', async () => {
        const summaryData = [{ goalId: 'goal1' }];
        const xhr = new global.XMLHttpRequest();
        xhr.open('GET', 'https://app.sg.endowus.com/v1/goals');
        xhr.responseText = JSON.stringify(summaryData);
        global.GM_setValue.mockClear();

        xhr.send();
        await flushPromises();

        expect(global.GM_setValue).toHaveBeenCalledWith(
            'api_summary',
            JSON.stringify(summaryData)
        );
    });

    test('XMLHttpRequest interception ignores invalid JSON', async () => {
        const xhr = new global.XMLHttpRequest();
        xhr.open('GET', 'https://app.sg.endowus.com/v1/goals');
        xhr.responseText = 'not-json';
        global.GM_setValue.mockClear();

        xhr.send();
        await flushPromises();

        expect(global.GM_setValue).not.toHaveBeenCalled();
    });
});
