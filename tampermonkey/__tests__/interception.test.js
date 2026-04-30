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
                this._listeners = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader() {}
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
                        {
                            code: 'AAA',
                            productType: 'STOCK',
                            currentValueLcy: 1200,
                            profitValueLcy: 120,
                            profitPercentLcy: 10
                        },
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
            JSON.stringify([
                {
                    code: 'AAA',
                    productType: 'STOCK',
                    currentValueLcy: 1200,
                    profitValueLcy: 120,
                    profitPercentLcy: 10
                }
            ])
        );
    });

    test('fetch interception stores normalized OCBC assets and liabilities separately', async () => {
        const holdingsPayload = {
            data: [
                {
                    portfolioNo: 'P-001',
                    assets: [
                        {
                            assetClassDesc: 'Equities',
                            subAssets: [
                                {
                                    subAssetClassDesc: 'Global Equity',
                                    holdings: [
                                        {
                                            holdingGuid: 'asset-guid-1',
                                            fundName: 'OCBC Asset Fund',
                                            marketValueReferenceCcy: { source: '1234.56', parsedValue: 1234.56 },
                                            totalUnrealisedPLRefCcy: { source: '12.34', parsedValue: 12.34 },
                                            unrealisedPLPercent: '1.23'
                                        }
                                    ]
                                }
                            ]
                        }
                    ],
                    liabilities: [
                        {
                            assetClassDesc: 'Liability',
                            subAssets: [
                                {
                                    subAssetClassDesc: 'Margin Liability',
                                    holdings: [
                                        {
                                            positionId: 'liab-1',
                                            description: 'Margin Liability',
                                            marketValueReferenceCcy: { source: '-250.5', parsedValue: -250.5 },
                                            totalPl: '0E-9'
                                        }
                                    ]
                                }
                            ]
                        }
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

        const RequestCtor = (typeof globalThis !== 'undefined' && globalThis.Request)
            || (typeof window !== 'undefined' && window.Request)
            || null;
        if (RequestCtor) {
            const request = new RequestCtor(
                'https://internet.ocbc.com/digital/api/sg/ms-investment-accounts/v1/portfolio-holdings/inquiry',
                { method: 'POST' }
            );
            await window.fetch(request);
        } else {
            await window.fetch(
                'https://internet.ocbc.com/digital/api/sg/ms-investment-accounts/v1/portfolio-holdings/inquiry',
                { method: 'POST' }
            );
        }
        await flushPromises();

        expect(global.GM_setValue).toHaveBeenCalledWith(
            'api_ocbc_holdings',
            JSON.stringify({
                assets: [
                    {
                        code: 'P-001:asset-guid-1',
                        portfolioNo: 'P-001',
                        subcode: '',
                        displayTicker: 'asset-guid-1',
                        name: 'OCBC Asset Fund',
                        assetClassDesc: 'Equities',
                        subAssetClassDesc: 'Global Equity',
                        productType: 'Global Equity',
                        currentValueLcy: 1234.56,
                        profitValueLcy: 12.34,
                        profitPercentLcy: 1.23
                    }
                ],
                liabilities: [
                    {
                        code: 'P-001:liab-1',
                        portfolioNo: 'P-001',
                        subcode: '',
                        displayTicker: 'liab-1',
                        name: 'Margin Liability',
                        assetClassDesc: 'Liability',
                        subAssetClassDesc: 'Margin Liability',
                        productType: 'Margin Liability',
                        currentValueLcy: -250.5,
                        profitValueLcy: 0,
                        profitPercentLcy: null
                    }
                ]
            })
        );
    });

    test('fetch interception ignores OCBC holdings endpoint when method is GET', async () => {
        const holdingsPayload = {
            data: [
                {
                    portfolioNo: 'P-001',
                    assets: [],
                    liabilities: []
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
        global.GM_setValue.mockClear();

        await window.fetch(
            'https://internet.ocbc.com/digital/api/sg/ms-investment-accounts/v1/portfolio-holdings/inquiry',
            { method: 'GET' }
        );
        await flushPromises();

        expect(global.GM_setValue).not.toHaveBeenCalledWith(
            'api_ocbc_holdings',
            expect.any(String)
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

    test('fetch interception ignores non-2xx responses', async () => {
        const performanceData = [{ goalId: 'goal1' }];
        const responseFactory = body => ({
            clone: () => responseFactory(body),
            json: () => Promise.resolve(body),
            ok: false,
            status: 500
        });
        baseFetchMock.mockResolvedValueOnce(responseFactory(performanceData));
        global.GM_setValue.mockClear();

        await window.fetch('https://app.sg.endowus.com/v1/goals/performance');
        await flushPromises();

        expect(global.GM_setValue).not.toHaveBeenCalled();
    });

    test('fetch interception tolerates JSON parse errors', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
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
        console.error.mockRestore();
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

    test('XMLHttpRequest interception ignores non-2xx responses', async () => {
        const xhr = new global.XMLHttpRequest();
        xhr.open('GET', 'https://app.sg.endowus.com/v1/goals');
        xhr.status = 401;
        xhr.responseText = JSON.stringify([{ goalId: 'goal1' }]);
        global.GM_setValue.mockClear();

        xhr.send();
        await flushPromises();

        expect(global.GM_setValue).not.toHaveBeenCalled();
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

    test('XMLHttpRequest interception ignores OCBC holdings endpoint when method is GET', async () => {
        const xhr = new global.XMLHttpRequest();
        xhr.open('GET', 'https://internet.ocbc.com/digital/api/sg/ms-investment-accounts/v1/portfolio-holdings/inquiry');
        xhr.responseText = JSON.stringify({
            data: [
                {
                    portfolioNo: 'P-001',
                    assets: [],
                    liabilities: []
                }
            ]
        });
        global.GM_setValue.mockClear();

        xhr.send();
        await flushPromises();

        expect(global.GM_setValue).not.toHaveBeenCalledWith(
            'api_ocbc_holdings',
            expect.any(String)
        );
    });
});
