const { setupDom, teardownDom } = require('./helpers/domSetup');

describe('initialization and URL monitoring', () => {
    let storage;

    const parseMaybeJson = value => {
        if (typeof value !== 'string') return value;
        try {
            return JSON.parse(value);
        } catch (_) {
            return value;
        }
    };

    const seedEndowusStore = ({ performance, investible, summary, allocation = {}, ui, localCache } = {}) => {
        storage.set('endowus', JSON.stringify({
            version: 4,
            datasets: {
                ...(performance !== undefined ? { performance } : {}),
                ...(investible !== undefined ? { investible } : {}),
                ...(summary !== undefined ? { summary } : {})
            },
            allocation,
            ui: ui || { uiPreferences: { bucketMode: 'allocation', collapseState: {} } },
            localCache: localCache || {}
        }));
    };

    const seedFsmStore = ({ holdings, allocation = {}, ui = {}, localCache = {} } = {}) => {
        storage.set('fsm', JSON.stringify({
            version: 4,
            datasets: {
                ...(holdings !== undefined ? { holdings } : {})
            },
            allocation,
            ui,
            localCache
        }));
    };

    const seedOcbcStore = ({ holdings, holdingsByPortfolio, allocation = {}, ui = {}, localCache = {} } = {}) => {
        storage.set('ocbc', JSON.stringify({
            version: 4,
            datasets: {
                ...(holdings !== undefined ? { holdings } : {}),
                ...(holdingsByPortfolio !== undefined ? { holdingsByPortfolio } : {})
            },
            allocation,
            ui,
            localCache
        }));
    };

    const upsertFsmStore = patcher => {
        const current = parseMaybeJson(storage.get('fsm')) || {};
        const next = patcher(current);
        storage.set('fsm', JSON.stringify({
            version: 4,
            datasets: next.datasets || {},
            allocation: next.allocation || {},
            ui: next.ui || {},
            localCache: next.localCache || {}
        }));
    };

    const upsertOcbcStore = patcher => {
        const current = parseMaybeJson(storage.get('ocbc')) || {};
        const next = patcher(current);
        storage.set('ocbc', JSON.stringify({
            version: 4,
            datasets: next.datasets || {},
            allocation: next.allocation || {},
            ui: next.ui || {},
            localCache: next.localCache || {}
        }));
    };

    const upsertEndowusStore = patch => {
        const current = parseMaybeJson(storage.get('endowus')) || {};
        seedEndowusStore({
            performance: current.datasets?.performance,
            investible: current.datasets?.investible,
            summary: current.datasets?.summary,
            allocation: current.allocation || {},
            ui: current.ui,
            localCache: current.localCache,
            ...patch
        });
    };

    const seedEndowusDataset = (field, value) => {
        const patch = {};
        patch[field] = value;
        upsertEndowusStore(patch);
    };

    const setupStorage = () => {
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (storage.has(key) ? storage.get(key) : fallback));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
    };

    const nextTableFrom = start => {
        let current = start?.nextElementSibling || null;
        while (current) {
            if (current.tagName === 'TABLE') {
                return current;
            }
            const wrappedTable = typeof current.querySelector === 'function'
                ? current.querySelector('table')
                : null;
            if (wrappedTable) {
                return wrappedTable;
            }
            current = current.nextElementSibling;
        }
        return null;
    };

    const openOcbcOverviewPortfolio = (label = 'Portfolio P-1') => {
        let overlay = document.querySelector('#gpv-overlay');
        expect(overlay).toBeTruthy();
        const portfolioCard = Array.from(overlay.querySelectorAll('.gpv-fsm-overview-card'))
            .find(card => {
                const title = card.querySelector('.gpv-fsm-overview-card-title');
                return (title?.textContent || '').trim() === label;
            });
        expect(portfolioCard).toBeTruthy();
        portfolioCard.click();
        overlay = document.querySelector('#gpv-overlay');
        expect(overlay).toBeTruthy();
        return overlay;
    };

    const loadModuleForUrl = (url) => {
        jest.resetModules();
        teardownDom();
        setupDom({ url });
        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();

        const responseFactory = body => ({
            clone: () => responseFactory(body),
            json: () => Promise.resolve(body),
            ok: true,
            status: 200
        });

        global.fetch = jest.fn(() => Promise.resolve(responseFactory({})));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, requestUrl) {
                this._url = requestUrl;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;
        return require('../goal_portfolio_viewer.user.js');
    };

    beforeEach(() => {
        jest.resetModules();
        setupDom();

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();

        const responseFactory = body => ({
            clone: () => responseFactory(body),
            json: () => Promise.resolve(body),
            ok: true,
            status: 200
        });

        global.fetch = jest.fn(() => Promise.resolve(responseFactory({})));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;
    });

    afterEach(() => {
        const modulePath = require.resolve('../goal_portfolio_viewer.user.js');
        const cachedModule = require.cache[modulePath];
        if (cachedModule?.exports?.SyncManager?.stopAutoSync) {
            cachedModule.exports.SyncManager.stopAutoSync();
        }
        if (window.__gpvUrlMonitorCleanup) {
            window.__gpvUrlMonitorCleanup();
        }
        jest.clearAllTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
        teardownDom();
        delete global.alert;
        delete global.history;
        delete global.GM_listValues;
    });

    test('auto-init stays disabled when flag is set', () => {
        window.__GPV_DISABLE_AUTO_INIT = true;
        require('../goal_portfolio_viewer.user.js');

        document.dispatchEvent(new window.Event('DOMContentLoaded'));
        expect(document.querySelector('.gpv-trigger-btn')).toBeNull();
    });

    test('auto-init runs on DOMContentLoaded and injects UI', () => {
        window.__GPV_DISABLE_AUTO_INIT = false;
        Object.defineProperty(document, 'readyState', {
            value: 'loading',
            configurable: true
        });

        require('../goal_portfolio_viewer.user.js');
        document.dispatchEvent(new window.Event('DOMContentLoaded'));

        const button = document.querySelector('.gpv-trigger-btn');
        expect(button).toBeTruthy();
        const styleTags = Array.from(document.querySelectorAll('style'))
            .filter(style => style.textContent.includes('.gpv-trigger-btn'));
        expect(styleTags.length).toBe(1);
    });

    test('startUrlMonitoring toggles button visibility on route change', () => {
        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.startUrlMonitoring();

        expect(document.querySelector('.gpv-trigger-btn')).toBeTruthy();

        window.history.pushState({}, '', 'https://app.sg.endowus.com/settings');
        expect(document.querySelector('.gpv-trigger-btn')).toBeNull();
    });

    test('startUrlMonitoring toggles visibility on replaceState transition', () => {
        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.startUrlMonitoring();

        expect(document.querySelector('.gpv-trigger-btn')).toBeTruthy();

        window.history.replaceState({}, '', 'https://app.sg.endowus.com/settings');
        expect(document.querySelector('.gpv-trigger-btn')).toBeNull();
    });

    test('startUrlMonitoring toggles visibility on popstate transition', () => {
        const exportsModule = loadModuleForUrl('https://app.sg.endowus.com/settings');
        exportsModule.startUrlMonitoring();

        expect(document.querySelector('.gpv-trigger-btn')).toBeNull();

        window.history.pushState({}, '', 'https://app.sg.endowus.com/dashboard');
        window.dispatchEvent(new window.PopStateEvent('popstate'));
        expect(document.querySelector('.gpv-trigger-btn')).toBeTruthy();
    });

    test('startUrlMonitoring re-entry runs previous cleanup before re-hooking', () => {
        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.startUrlMonitoring();

        const firstCleanup = window.__gpvUrlMonitorCleanup;
        expect(typeof firstCleanup).toBe('function');

        exportsModule.startUrlMonitoring();

        expect(typeof window.__gpvUrlMonitorCleanup).toBe('function');
        expect(window.__gpvUrlMonitorCleanup).not.toBe(firstCleanup);

        window.history.pushState({}, '', 'https://app.sg.endowus.com/settings');
        expect(document.querySelector('.gpv-trigger-btn')).toBeNull();
    });

    test('overlay platform descriptor resolves FSM, OCBC, then Endowus fallback by route', () => {
        let exportsModule = loadModuleForUrl('https://app.sg.endowus.com/goals');
        expect(exportsModule.getOverlayPlatformDescriptor().id).toBe('endowus');
        const endowusReadiness = exportsModule.getOverlayPlatformDescriptor().getReadinessOverlayConfig();
        expect(endowusReadiness.title).toBe('Portfolio Viewer');
        expect(endowusReadiness.getItems().map(item => item.label)).toEqual([
            'Goal performance',
            'Investible balances',
            'Goal summaries'
        ]);

        exportsModule = loadModuleForUrl('https://secure.fundsupermart.com/fsmone/holdings/investments');
        expect(exportsModule.getOverlayPlatformDescriptor().id).toBe('fsm');
        const fsmReadiness = exportsModule.getOverlayPlatformDescriptor().getReadinessOverlayConfig();
        expect(fsmReadiness.title).toBe('Portfolio Viewer (FSM)');
        expect(fsmReadiness.getItems().map(item => item.label)).toEqual(['FSM holdings data']);

        exportsModule = loadModuleForUrl('https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/dashboard?menuId=e62c3103-da60-4e8a-8717-72f11ebaaebe');
        expect(exportsModule.getOverlayPlatformDescriptor().id).toBe('ocbc');
        const ocbcReadiness = exportsModule.getOverlayPlatformDescriptor().getReadinessOverlayConfig();
        expect(ocbcReadiness.title).toBe('Portfolio Viewer (OCBC)');
        expect(ocbcReadiness.getItems().map(item => item.label)).toEqual(['OCBC portfolio holdings data']);
    });


    test('startUrlMonitoring shows button on FSM investments route', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };

        const responseFactory = body => ({
            clone: () => responseFactory(body),
            json: () => Promise.resolve(body),
            ok: true,
            status: 200
        });
        global.fetch = jest.fn(() => Promise.resolve(responseFactory({})));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.startUrlMonitoring();

        expect(document.querySelector('.gpv-trigger-btn')).toBeTruthy();
    });

    test('startUrlMonitoring shows button on OCBC portfolio holdings route', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=235562af-625e-41a3-aead-7beaf7b21cee'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };

        const responseFactory = body => ({
            clone: () => responseFactory(body),
            json: () => Promise.resolve(body),
            ok: true,
            status: 200
        });
        global.fetch = jest.fn(() => Promise.resolve(responseFactory({})));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.startUrlMonitoring();

        expect(document.querySelector('.gpv-trigger-btn')).toBeTruthy();
    });

    test('startUrlMonitoring does not show button on exact OCBC dashboard route', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/dashboard?menuId=e62c3103-da60-4e8a-8717-72f11ebaaebe'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };

        const responseFactory = body => ({
            clone: () => responseFactory(body),
            json: () => Promise.resolve(body),
            ok: true,
            status: 200
        });
        global.fetch = jest.fn(() => Promise.resolve(responseFactory({})));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.startUrlMonitoring();

        expect(document.querySelector('.gpv-trigger-btn')).toBeNull();
    });

    test('startUrlMonitoring shows button only after SPA navigation from OCBC dashboard to portfolio holdings', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/dashboard?menuId=e62c3103-da60-4e8a-8717-72f11ebaaebe'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };

        const responseFactory = body => ({
            clone: () => responseFactory(body),
            json: () => Promise.resolve(body),
            ok: true,
            status: 200
        });
        global.fetch = jest.fn(() => Promise.resolve(responseFactory({})));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.startUrlMonitoring();

        expect(document.querySelector('.gpv-trigger-btn')).toBeNull();

        window.history.pushState(
            {},
            '',
            'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=235562af-625e-41a3-aead-7beaf7b21cee'
        );

        expect(document.querySelector('.gpv-trigger-btn')).toBeTruthy();
    });

    test('startUrlMonitoring does not show button on near-prefix OCBC holdings route', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings-extra?menuId=235562af-625e-41a3-aead-7beaf7b21cee'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };

        const responseFactory = body => ({
            clone: () => responseFactory(body),
            json: () => Promise.resolve(body),
            ok: true,
            status: 200
        });
        global.fetch = jest.fn(() => Promise.resolve(responseFactory({})));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.startUrlMonitoring();

        expect(document.querySelector('.gpv-trigger-btn')).toBeNull();
    });

    test('showOverlay renders and closes via backdrop click', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const summaryData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay).toBeTruthy();

        overlay.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        expect(document.querySelector('#gpv-overlay')).toBeNull();
    });

    test('bucket manager updates explicit Endowus bucket assignment', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const summaryData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const bucketManageBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Manage assignments'));
        expect(bucketManageBtn).toBeTruthy();
        expect(bucketManageBtn.className).toContain('gpv-bucket-manage-btn');
        bucketManageBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const bucketInput = overlay.querySelector('.gpv-bucket-manager-input');
        expect(bucketInput).toBeTruthy();
        bucketInput.value = 'Wealth Builder';
        bucketInput.dispatchEvent(new window.Event('blur', { bubbles: true }));

        expect(JSON.parse(storage.get('endowus')).allocation.goalBuckets.goal1).toBe('Wealth Builder');
    });

    test('opening Endowus overlay seeds derived bucket assignments for legacy goals', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const summaryData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        expect(JSON.parse(storage.get('endowus')).allocation.goalBuckets.goal1).toBe('Retirement');
    });

    test('opening Endowus readiness with incomplete datasets does not seed derived bucket assignments', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Fetching Endowus portfolio data');
        expect(JSON.parse(storage.get('endowus')).allocation?.goalBuckets?.goal1).toBeUndefined();
    });

    test('Endowus bucket config signature ignores legacy cleared key changes', () => {
        const performanceData = [{ goalId: 'goal1' }];
        const investibleData = [{ goalId: 'goal1' }];
        const summaryData = [{ goalId: 'goal1' }];

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        const clearedKey = 'goal_bucket_cleared_goal1';

        const before = exportsModule.getEndowusBucketConfigSignature(performanceData, investibleData, summaryData);
        global.GM_setValue(clearedKey, true);
        const after = exportsModule.getEndowusBucketConfigSignature(performanceData, investibleData, summaryData);

        expect(after).toBe(before);
    });

    test('Endowus bucket config signature ignores legacy goal bucket key changes', () => {
        const performanceData = [{ goalId: 'goal1' }];
        const investibleData = [{ goalId: 'goal1' }];
        const summaryData = [{ goalId: 'goal1' }];

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        const bucketKey = 'goal_bucket_name_goal1';

        const before = exportsModule.getEndowusBucketConfigSignature(performanceData, investibleData, summaryData);
        global.GM_setValue(bucketKey, 'Legacy Override');
        const after = exportsModule.getEndowusBucketConfigSignature(performanceData, investibleData, summaryData);

        expect(after).toBe(before);
    });

    test('Endowus readiness ignores legacy goal bucket assignment changes', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Vacation Fund',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const summaryData = [{
            goalId: 'goal1',
            goalName: 'Vacation Fund',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        global.GM_setValue('goal_bucket_name_goal1', 'Legacy Bucket A');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).not.toContain('Legacy Bucket A');

        global.GM_setValue('goal_bucket_name_goal1', 'Legacy Bucket B');
        exportsModule.showOverlay();

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).not.toContain('Legacy Bucket B');
    });

    test('Endowus readiness ignores legacy cleared flag changes', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Retirement Fund',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const summaryData = [{
            goalId: 'goal1',
            goalName: 'Retirement Fund',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        global.GM_setValue('goal_bucket_name_goal1', 'Legacy Bucket A');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).not.toContain('Legacy Bucket A');

        global.GM_setValue('goal_bucket_cleared_goal1', true);
        exportsModule.showOverlay();

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).not.toContain('Legacy Bucket A');
        expect(overlay.textContent).toContain('Retirement Fund');
    });

    test('store-backed cleared goal bucket hides seeded bucket and falls back to derived bucket on overlay rerender', () => {
        storage = new Map();
        setupStorage();

        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Retirement Fund',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const summaryData = [{
            goalId: 'goal1',
            goalName: 'Retirement Fund',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);
        global.GM_setValue('endowus', JSON.stringify({
            performance: performanceData,
            investible: investibleData,
            summary: summaryData,
            goalTargets: {},
            goalFixed: {},
            goalBuckets: { goal1: 'Primary Store Bucket' },
            clearedGoalBuckets: {}
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Primary Store Bucket');

        global.GM_setValue('endowus', JSON.stringify({
            performance: performanceData,
            investible: investibleData,
            summary: summaryData,
            goalTargets: {},
            goalFixed: {},
            goalBuckets: { goal1: 'Primary Store Bucket' },
            clearedGoalBuckets: { goal1: true }
        }));
        exportsModule.showOverlay();

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).not.toContain('Primary Store Bucket');
        expect(overlay.textContent).toContain('Retirement');
    });

    test('bucket manager blur preserves seeded legacy bucket assignment', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const summaryData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const bucketManageBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Manage assignments'));
        bucketManageBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const bucketInput = overlay.querySelector('.gpv-bucket-manager-input');
        expect(bucketInput.value).toBe('Retirement');
        bucketInput.dispatchEvent(new window.Event('blur', { bubbles: true }));

        expect(JSON.parse(storage.get('endowus')).allocation.goalBuckets.goal1).toBe('Retirement');
        expect(bucketInput.value).toBe('Retirement');
    });

    test('bucket manager allows clearing explicit Endowus bucket assignment', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const summaryData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);
        global.GM_setValue('goal_bucket_name_goal1', 'Legacy Override');
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const bucketManageBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Manage assignments'));
        bucketManageBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const bucketInput = overlay.querySelector('.gpv-bucket-manager-input');
        expect(bucketInput).toBeTruthy();
        bucketInput.value = '';
        bucketInput.dispatchEvent(new window.Event('blur', { bubbles: true }));

        expect(JSON.parse(storage.get('endowus')).allocation.goalBuckets.goal1).toBeUndefined();
        expect(JSON.parse(storage.get('endowus')).allocation.clearedGoalBuckets.goal1).toBe(true);
        expect(bucketInput.value).toBe('Retirement');

        exportsModule.showOverlay();
        overlay = document.querySelector('#gpv-overlay');
        const reopenedBucketManageBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Manage assignments'));
        reopenedBucketManageBtn.click();
        overlay = document.querySelector('#gpv-overlay');
        const reopenedInput = overlay.querySelector('.gpv-bucket-manager-input');
        expect(JSON.parse(storage.get('endowus')).allocation.goalBuckets.goal1).toBeUndefined();
        expect(reopenedInput.value).toBe('Retirement');
    });

    test('showOverlay sets dialog attributes and closes on Escape', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const summaryData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const container = overlay?.querySelector('.gpv-container');
        expect(container?.getAttribute('role')).toBe('dialog');
        expect(container?.getAttribute('aria-modal')).toBe('true');
        const labelId = container?.getAttribute('aria-labelledby');
        expect(labelId).toBeTruthy();
        expect(document.getElementById(labelId)).toBeTruthy();

        overlay.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.querySelector('#gpv-overlay')).toBeNull();
    });

    test('showOverlay hides sibling aria-hidden while open and restores on close', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const summaryData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        const plainSibling = document.createElement('div');
        plainSibling.id = 'gpv-test-sibling-plain';
        document.body.appendChild(plainSibling);

        const explicitSibling = document.createElement('div');
        explicitSibling.id = 'gpv-test-sibling-explicit';
        explicitSibling.setAttribute('aria-hidden', 'false');
        document.body.appendChild(explicitSibling);

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        expect(plainSibling.getAttribute('aria-hidden')).toBe('true');
        expect(explicitSibling.getAttribute('aria-hidden')).toBe('true');

        const overlay = document.querySelector('#gpv-overlay');
        overlay.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(document.querySelector('#gpv-overlay')).toBeNull();
        expect(plainSibling.hasAttribute('aria-hidden')).toBe(false);
        expect(explicitSibling.getAttribute('aria-hidden')).toBe('false');
    });

    test('showOverlay replacement runs prior cleanup and preserves aria-hidden restore semantics', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const summaryData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        const plainSibling = document.createElement('div');
        plainSibling.id = 'gpv-test-sibling-replace-plain';
        document.body.appendChild(plainSibling);

        const explicitSibling = document.createElement('div');
        explicitSibling.id = 'gpv-test-sibling-replace-explicit';
        explicitSibling.setAttribute('aria-hidden', 'false');
        document.body.appendChild(explicitSibling);

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const firstOverlay = document.querySelector('#gpv-overlay');
        const replacementCleanupSpy = jest.fn();
        firstOverlay.gpvCleanupCallbacks.push(replacementCleanupSpy);

        exportsModule.showOverlay();

        const secondOverlay = document.querySelector('#gpv-overlay');
        expect(secondOverlay).toBeTruthy();
        expect(secondOverlay).not.toBe(firstOverlay);
        expect(replacementCleanupSpy).toHaveBeenCalledTimes(1);
        expect(plainSibling.getAttribute('aria-hidden')).toBe('true');
        expect(explicitSibling.getAttribute('aria-hidden')).toBe('true');

        secondOverlay.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(document.querySelector('#gpv-overlay')).toBeNull();
        expect(plainSibling.hasAttribute('aria-hidden')).toBe(false);
        expect(explicitSibling.getAttribute('aria-hidden')).toBe('false');
    });

    test('Endowus, FSM, and OCBC overlays start collapsed and support expand toggle', () => {
        const assertExpandToggleBehavior = expectedTitle => {
            const overlay = document.querySelector('#gpv-overlay');
            expect(overlay).toBeTruthy();
            expect(overlay.textContent).toContain(expectedTitle);
            const container = overlay.querySelector('.gpv-container');
            expect(container.classList.contains('gpv-container--expanded')).toBe(false);
            const expandBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.classList.contains('gpv-expand-btn'));
            expect(expandBtn).toBeTruthy();
            expect(expandBtn.textContent).toBe('Expand');
            expect(expandBtn.getAttribute('aria-pressed')).toBe('false');
            expect(expandBtn.getAttribute('aria-label')).toBe('Expand overlay size');
            expect(expandBtn.title).toBe('Expand overlay');

            expandBtn.click();
            expect(container.classList.contains('gpv-container--expanded')).toBe(true);
            expect(expandBtn.textContent).toBe('Shrink');
            expect(expandBtn.getAttribute('aria-pressed')).toBe('true');
            expect(expandBtn.getAttribute('aria-label')).toBe('Shrink overlay size');
            expect(expandBtn.title).toBe('Shrink overlay');
        };

        seedEndowusDataset('performance', [
            { goalId: 'goal1', totalCumulativeReturn: { amount: 100 }, simpleRateOfReturnPercent: 0.1 }
        ]);
        seedEndowusDataset('investible', [
            {
                goalId: 'goal1',
                goalName: 'Retirement - Core Portfolio',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 1000 } }
            }
        ]);
        seedEndowusDataset('summary', [
            { goalId: 'goal1', goalName: 'Retirement - Core Portfolio', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' }
        ]);

        let exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();
        assertExpandToggleBehavior('Portfolio Viewer');

        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });
        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;
        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;
        seedFsmStore({ holdings: [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', currentValueLcy: 1234.56 }
        ] });

        jest.resetModules();
        exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();
        assertExpandToggleBehavior('Portfolio Viewer (FSM)');

        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });
        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;
        global.XMLHttpRequest = FakeXHR;
        seedOcbcStore({ holdings: {
            assets: [
                {
                    code: 'P-1:AAA',
                    portfolioNo: 'P-1',
                    displayTicker: 'SG00AAA111',
                    name: 'OCBC Asset',
                    productType: 'Equity',
                    currentValueLcy: 1000,
                    profitValueLcy: 50,
                    profitPercentLcy: 0.1
                }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                {
                    code: 'P-1:AAA',
                    portfolioNo: 'P-1',
                    displayTicker: 'SG00AAA111',
                    name: 'OCBC Asset',
                    productType: 'Equity',
                    currentValueLcy: 1000,
                    profitValueLcy: 50,
                    profitPercentLcy: 0.1
                }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                {
                    code: 'P-1:AAA',
                    portfolioNo: 'P-1',
                    displayTicker: 'SG00AAA111',
                    name: 'OCBC Asset',
                    productType: 'Equity',
                    currentValueLcy: 1000,
                    profitValueLcy: 50,
                    profitPercentLcy: 0.1
                }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });

        jest.resetModules();
        exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();
        assertExpandToggleBehavior('Portfolio Viewer (OCBC)');
    });

    test('shared modal focus trap keeps in-modal close button focused on outside focusin', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const summaryData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const closeBtn = overlay?.querySelector('.gpv-close-btn');
        expect(closeBtn).toBeTruthy();

        closeBtn.focus();
        expect(document.activeElement).toBe(closeBtn);

        document.body.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
        expect(document.activeElement).toBe(closeBtn);
    });

    test('showOverlay renders FSM portfolio overview on FSM route', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();

        seedFsmStore({ holdings: [
            { code: 'AAA', subcode: 'AAPL', name: 'Alpha', productType: 'UNIT_TRUST', currentValueLcy: 1000 }
        ] });
        upsertFsmStore(current => ({
            ...current,
            allocation: { ...(current.allocation || {}), targetsByCode: { AAA: 50 } }
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay).toBeTruthy();
        expect(overlay.textContent).toContain('Start from a portfolio overview');
        expect(overlay.querySelector('.gpv-fsm-overview-grid')).toBeTruthy();
        expect(overlay.querySelector('table')).toBeNull();
        expect(overlay.querySelector('.gpv-fsm-overview-card')).toBeTruthy();
        expect(overlay.textContent).toContain('Manage portfolios');
        expect(overlay.textContent).not.toContain('New portfolio');
        expect(overlay.textContent).toContain('Unassigned');
        expect(overlay.textContent).toContain('View all holdings');
        expect(overlay.textContent).toContain('Needs Attention');
        expect(overlay.querySelector('.gpv-health-badge')).toBeTruthy();
        expect(overlay.querySelector('.gpv-health-badge').textContent).not.toMatch(/\(\d+\)/);
        const topSummaryDriftCard = Array.from(overlay.querySelectorAll('.gpv-summary-row .gpv-summary-card')).find(card =>
            card.textContent.includes('Drift:')
        );
        expect(topSummaryDriftCard).toBeFalsy();
        const overviewCard = overlay.querySelector('.gpv-fsm-overview-card');
        expect(overviewCard.textContent).toContain('Drift');
        expect(overviewCard.textContent).toContain('0.00%');

        const manageBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Manage portfolios'));
        manageBtn.click();
        expect(overlay.textContent).toContain('New portfolio');
    });

    test('selecting a different view scrolls overlay content to top smoothly', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const summaryData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const content = overlay?.querySelector('.gpv-content');
        const bucketCard = overlay?.querySelector('.gpv-bucket-card');
        expect(content).toBeTruthy();
        expect(bucketCard).toBeTruthy();
        expect(overlay?.querySelector('#gpv-endowus-view-select')).toBeNull();

        content.scrollTo = jest.fn();
        bucketCard.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

        expect(content.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    });

    test('opening a bucket from summary scrolls overlay content to top smoothly', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const summaryData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const content = overlay?.querySelector('.gpv-content');
        const bucketCard = overlay?.querySelector('.gpv-bucket-card');
        expect(content).toBeTruthy();
        expect(bucketCard).toBeTruthy();

        content.scrollTo = jest.fn();
        bucketCard.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

        expect(content.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    });

    test('Endowus bucket detail renders trigger-side planning context', () => {
        const performanceData = [
            {
                goalId: 'goal1',
                totalCumulativeReturn: { amount: 0 },
                simpleRateOfReturnPercent: 0
            },
            {
                goalId: 'goal2',
                totalCumulativeReturn: { amount: 0 },
                simpleRateOfReturnPercent: 0
            }
        ];
        const investibleData = [
            {
                goalId: 'goal1',
                goalName: 'Retirement - Core Portfolio',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 900 } }
            },
            {
                goalId: 'goal2',
                goalName: 'Retirement - Bond Sleeve',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 100 } }
            }
        ];
        const summaryData = investibleData.map(goal => ({
            goalId: goal.goalId,
            goalName: goal.goalName,
            investmentGoalType: goal.investmentGoalType
        }));

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);
        upsertEndowusStore({ allocation: { goalTargets: { goal1: 10, goal2: 90 }, goalFixed: {}, goalBuckets: {}, clearedGoalBuckets: {} } });
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const bucketCard = overlay?.querySelector('.gpv-bucket-card');
        expect(bucketCard).toBeTruthy();
        bucketCard.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Trigger sells: Retirement - Core Portfolio SGD\u00A0720.00');
        expect(overlay.textContent).toContain('Suggested buys: Retirement - Bond Sleeve SGD\u00A0720.00');
    });

    test('Endowus summary hides controls and bucket detail shows controls with back navigation', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const summaryData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        let controlBar = overlay.querySelector('.gpv-control-bar');
        let allocationButton = overlay.querySelector('.gpv-mode-btn[data-mode="allocation"]');
        let performanceButton = overlay.querySelector('.gpv-mode-btn[data-mode="performance"]');
        expect(controlBar.hidden).toBe(true);
        expect(overlay.querySelector('#gpv-endowus-view-select')).toBeNull();
        expect(allocationButton.disabled).toBe(true);
        expect(performanceButton.disabled).toBe(true);

        const bucketCard = overlay.querySelector('.gpv-bucket-card');
        expect(bucketCard).toBeTruthy();
        bucketCard.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        expect(controlBar.hidden).toBe(false);
        const backBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Back to overview'));
        expect(backBtn).toBeTruthy();
        expect(document.activeElement).toBe(backBtn);
        expect(allocationButton.disabled).toBe(false);
        expect(performanceButton.disabled).toBe(false);
        expect(overlay.textContent).toContain('Back to overview');
        backBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        expect(controlBar.hidden).toBe(true);
        expect(overlay.querySelector('#gpv-endowus-view-select')).toBeNull();
        expect(allocationButton.disabled).toBe(true);
        expect(performanceButton.disabled).toBe(true);
        const firstSummaryBucketCard = overlay.querySelector('.gpv-bucket-card');
        if (firstSummaryBucketCard) {
            expect(document.activeElement).toBe(firstSummaryBucketCard);
        }
    });

    test('performance mode auto-expands all collapsed performance panels', () => {
        const performanceData = [
            {
                goalId: 'goal1',
                totalInvestmentValue: { amount: 1000 },
                totalCumulativeReturn: { amount: 100 },
                simpleRateOfReturnPercent: 0.1
            },
            {
                goalId: 'goal2',
                totalInvestmentValue: { amount: 800 },
                totalCumulativeReturn: { amount: 40 },
                simpleRateOfReturnPercent: 0.05
            }
        ];
        const investibleData = [
            {
                goalId: 'goal1',
                goalName: 'Retirement - Core Portfolio',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 1000 } }
            },
            {
                goalId: 'goal2',
                goalName: 'Retirement - Cash Reserve',
                investmentGoalType: 'CASH_MANAGEMENT',
                totalInvestmentAmount: { display: { amount: 800 } }
            }
        ];
        const summaryData = investibleData.map(goal => ({
            goalId: goal.goalId,
            goalName: goal.goalName,
            investmentGoalType: goal.investmentGoalType
        }));

        const responseFactory = body => ({
            clone: () => responseFactory(body),
            json: () => Promise.resolve(body),
            ok: true,
            status: 200
        });
        global.fetch.mockImplementation(() => Promise.resolve(responseFactory([])));
        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const bucketCard = overlay?.querySelector('.gpv-bucket-card');
        expect(bucketCard).toBeTruthy();
        bucketCard.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

        const panelsBefore = Array.from(overlay.querySelectorAll('.gpv-performance-panel'));
        expect(panelsBefore.length).toBeGreaterThan(1);
        panelsBefore.forEach(panel => {
            expect(panel.classList.contains('gpv-collapsible--collapsed')).toBe(true);
        });

        const performanceButton = overlay.querySelector('.gpv-mode-btn[data-mode="performance"]');
        performanceButton.click();

        const panelsAfter = Array.from(overlay.querySelectorAll('.gpv-performance-panel'));
        panelsAfter.forEach(panel => {
            expect(panel.classList.contains('gpv-collapsible--collapsed')).toBe(false);
        });

        global.fetch.mockResolvedValueOnce({
            clone: () => ({ json: () => Promise.resolve(performanceData), ok: true, status: 200 }),
            json: () => Promise.resolve(performanceData),
            ok: true,
            status: 200
        });
        window.fetch('/v1/goals/performance');

        return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
            const refreshedOverlay = document.querySelector('#gpv-overlay');
            expect(refreshedOverlay.textContent).not.toContain('Performance data unavailable.');
            expect(refreshedOverlay.querySelectorAll('.gpv-performance-panel').length).toBeGreaterThan(0);
        });
    });

    test('sync indicator exposes keyboard attributes when enabled', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const summaryData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Core Portfolio',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);
        global.GM_setValue('sync_enabled', true);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const indicator = document.querySelector('#gpv-sync-indicator');
        expect(indicator).toBeTruthy();
        expect(indicator.getAttribute('role')).toBe('button');
        expect(indicator.getAttribute('tabindex')).toBe('0');
    });

    test('sync settings view is shared across Endowus, FSM, and OCBC with deterministic back targets', () => {
        const injectHostileHostTypography = () => {
            const hostileStyle = document.createElement('style');
            hostileStyle.textContent = `
                button, input, select, textarea {
                    line-height: 99px !important;
                    font-family: fantasy !important;
                }
            `;
            document.head.appendChild(hostileStyle);
        };

        const mountEndowusData = () => {
            seedEndowusDataset('performance', [{ goalId: 'goal1', totalCumulativeReturn: { amount: 100 }, simpleRateOfReturnPercent: 0.1 }]);
            seedEndowusDataset('investible', [{ goalId: 'goal1', goalName: 'Goal One', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 1000 } } }]);
            seedEndowusDataset('summary', [{ goalId: 'goal1', goalName: 'Goal One', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' }]);
        };
        const mountFsmData = () => {
            seedFsmStore({ holdings: [{ code: 'AAA', subcode: 'AAPL', name: 'Fund A', currentValueLcy: 1234.56 }] });
        };
        const mountOcbcData = () => {
            seedOcbcStore({ holdings: {
                assets: [{ code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 }],
                liabilities: []
            }, holdingsByPortfolio: ({
                assets: [{ code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 }],
                liabilities: []
            })?.holdingsByPortfolio || ({
                assets: [{ code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 }],
                liabilities: []
            })?.data?.holdingsByPortfolio });
        };

        const assertSharedSyncFields = overlay => {
            expect(overlay.textContent).toContain('Sync Settings');
            expect(overlay.querySelector('.gpv-sync-settings')).toBeTruthy();
            expect(overlay.textContent).toContain('Activate Sync');
            expect(overlay.textContent).toContain('Server URL');
            expect(overlay.textContent).toContain('User ID');
            expect(overlay.textContent).toContain('Password');
            expect(overlay.textContent).toContain('Remember encryption key on this device');
            expect(overlay.textContent).toContain('Sign Up');
            expect(overlay.textContent).toContain('Login');
            expect(overlay.textContent).toContain('Save Settings');
            expect(overlay.textContent).toContain('Sync Now');
            expect(overlay.textContent).toContain('Advanced settings');

            const styleText = Array.from(document.querySelectorAll('style')).map(node => node.textContent || '').join('\n');
            expect(styleText).toContain('--gpv-font-family');
            expect(styleText).toContain('.gpv-sync-settings');
            expect(styleText).toContain('.gpv-trigger-btn');
            expect(styleText).toContain('line-height: var(--gpv-line-height)');

            const trigger = document.querySelector('.gpv-trigger-btn');
            expect(trigger).toBeTruthy();
            const triggerStyle = window.getComputedStyle(trigger);
            expect(triggerStyle.lineHeight).not.toBe('99px');
            expect(triggerStyle.fontFamily.toLowerCase()).not.toContain('fantasy');

            const syncBtn = overlay.querySelector('.gpv-sync-btn');
            expect(syncBtn).toBeTruthy();
            const syncBtnStyle = window.getComputedStyle(syncBtn);
            expect(syncBtnStyle.lineHeight).not.toBe('99px');
            expect(syncBtnStyle.fontFamily.toLowerCase()).not.toContain('fantasy');

            const syncInput = overlay.querySelector('.gpv-sync-input');
            expect(syncInput).toBeTruthy();
            const syncInputStyle = window.getComputedStyle(syncInput);
            expect(syncInputStyle.lineHeight).not.toBe('99px');
            expect(syncInputStyle.fontFamily.toLowerCase()).not.toContain('fantasy');

            const overlayStyle = window.getComputedStyle(overlay);
            expect(overlayStyle.lineHeight).not.toBe('99px');
        };

        const openSync = (expectedBackText) => {
            const overlay = document.querySelector('#gpv-overlay');
            const syncBtn = Array.from(overlay.querySelectorAll('button')).find(btn => (btn.textContent || '').includes('Sync'));
            syncBtn.click();
            const syncOverlay = document.querySelector('#gpv-overlay');
            assertSharedSyncFields(syncOverlay);
            const backBtn = Array.from(syncOverlay.querySelectorAll('button')).find(btn => (btn.textContent || '').includes('Back to Portfolio Viewer'));
            expect(backBtn.textContent).toContain(expectedBackText);
            backBtn.click();
        };

        const exportsModule = require('../goal_portfolio_viewer.user.js');

        mountEndowusData();
        injectHostileHostTypography();
        exportsModule.init();
        exportsModule.showOverlay();
        openSync('Portfolio Viewer');
        expect(document.querySelector('#gpv-overlay').textContent).toContain('Portfolio Viewer');

        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });
        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (storage.has(key) ? storage.get(key) : fallback));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
        global.history = window.history;
        mountFsmData();
        injectHostileHostTypography();
        exportsModule.init();
        exportsModule.showOverlay();
        openSync('(FSM)');
        expect(document.querySelector('#gpv-overlay').textContent).toContain('Portfolio Viewer (FSM)');

        teardownDom();
        setupDom({ url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123' });
        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (storage.has(key) ? storage.get(key) : fallback));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
        global.history = window.history;
        mountOcbcData();
        injectHostileHostTypography();
        exportsModule.init();
        exportsModule.showOverlay();
        openSync('(OCBC)');
        expect(document.querySelector('#gpv-overlay').textContent).toContain('Portfolio Viewer (OCBC)');
    });
    test('showOverlay renders FSM overlay on FSM route using FSM holdings only', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', currentValueLcy: 1234.56 }
        ] });
        seedEndowusDataset('summary', [
            { goalId: 'end-1', goalName: 'Endowus Only Goal', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' }
        ]);
        seedEndowusDataset('investible', [
            {
                goalId: 'end-1',
                goalName: 'Endowus Only Goal',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 1000 } }
            }
        ]);
        seedEndowusDataset('performance', [
            { goalId: 'end-1', totalCumulativeReturn: { amount: 100 }, simpleRateOfReturnPercent: 0.1 }
        ]);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay).toBeTruthy();
        expect(overlay.textContent).toContain('Portfolio Viewer (FSM)');
        expect(overlay.textContent).not.toContain('Endowus Only Goal');
        expect(overlay.querySelector('.gpv-fsm-overview-grid')).toBeTruthy();
        expect(overlay.querySelector('table')).toBeNull();

        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        const detailOverlay = document.querySelector('#gpv-overlay');
        expect(detailOverlay.textContent).toContain('Fund A');
        expect(detailOverlay.textContent).toContain('AAPL');
        expect(detailOverlay.querySelector('.gpv-select')).toBeTruthy();
        expect(detailOverlay.textContent).toContain('Planning');
        expect(detailOverlay.textContent).not.toContain('Set a projected investment amount to see a what-if split.');
        expect(detailOverlay.textContent).not.toContain('Rebalance:');
        expect(detailOverlay.textContent).toContain('Type');
        expect(detailOverlay.textContent).toContain('Current %');
        expect(detailOverlay.textContent).not.toContain('Drift %');
        const firstRow = detailOverlay.querySelector('table tbody tr');
        expect(firstRow.querySelector('td[data-col="current"]').textContent.trim()).toBe('100.00%');
        expect(firstRow.querySelector('td[data-col="drift"]')).toBeNull();
    });

    test('showOverlay on FSM route shows readiness state when holdings are unavailable', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay).toBeTruthy();
        expect(overlay.textContent).toContain('Waiting for FSM holdings response');
        expect(overlay.textContent).toContain('FSM holdings data');
    });

    test('showOverlay on OCBC dashboard route shows OCBC readiness state when holdings are unavailable', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/dashboard?menuId=e62c3103-da60-4e8a-8717-72f11ebaaebe'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay).toBeTruthy();
        expect(overlay.textContent).toContain('Waiting for OCBC portfolio holdings response');
        expect(overlay.textContent).toContain('OCBC portfolio holdings data');
    });

    test('showOverlay renders OCBC overview sections and detail switch without filtering overview by selector', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                {
                    code: 'P-1:AAA',
                    portfolioNo: 'P-1',
                    displayTicker: 'SG00AAA111',
                    name: 'OCBC Asset',
                    productType: 'Equity',
                    currentValueLcy: 1000,
                    profitValueLcy: 50,
                    profitPercentLcy: 0.1
                },
                {
                    code: 'P-1:CCC',
                    portfolioNo: 'P-1',
                    displayTicker: 'FUND-CCC',
                    name: 'OCBC Asset 2',
                    productType: 'Bond',
                    currentValueLcy: 400,
                    profitValueLcy: null,
                    profitPercentLcy: null
                }
            ],
            liabilities: [
                {
                    code: 'P-1:BBB',
                    portfolioNo: 'P-1',
                    displayTicker: 'POS-BBB',
                    name: 'OCBC Liability',
                    productType: 'Liability',
                    currentValueLcy: -250,
                    profitValueLcy: null,
                    profitPercentLcy: null
                }
            ]
        }, holdingsByPortfolio: ({
            assets: [
                {
                    code: 'P-1:AAA',
                    portfolioNo: 'P-1',
                    displayTicker: 'SG00AAA111',
                    name: 'OCBC Asset',
                    productType: 'Equity',
                    currentValueLcy: 1000,
                    profitValueLcy: 50,
                    profitPercentLcy: 0.1
                },
                {
                    code: 'P-1:CCC',
                    portfolioNo: 'P-1',
                    displayTicker: 'FUND-CCC',
                    name: 'OCBC Asset 2',
                    productType: 'Bond',
                    currentValueLcy: 400,
                    profitValueLcy: null,
                    profitPercentLcy: null
                }
            ],
            liabilities: [
                {
                    code: 'P-1:BBB',
                    portfolioNo: 'P-1',
                    displayTicker: 'POS-BBB',
                    name: 'OCBC Liability',
                    productType: 'Liability',
                    currentValueLcy: -250,
                    profitValueLcy: null,
                    profitPercentLcy: null
                }
            ]
        })?.holdingsByPortfolio || ({
            assets: [
                {
                    code: 'P-1:AAA',
                    portfolioNo: 'P-1',
                    displayTicker: 'SG00AAA111',
                    name: 'OCBC Asset',
                    productType: 'Equity',
                    currentValueLcy: 1000,
                    profitValueLcy: 50,
                    profitPercentLcy: 0.1
                },
                {
                    code: 'P-1:CCC',
                    portfolioNo: 'P-1',
                    displayTicker: 'FUND-CCC',
                    name: 'OCBC Asset 2',
                    productType: 'Bond',
                    currentValueLcy: 400,
                    profitValueLcy: null,
                    profitPercentLcy: null
                }
            ],
            liabilities: [
                {
                    code: 'P-1:BBB',
                    portfolioNo: 'P-1',
                    displayTicker: 'POS-BBB',
                    name: 'OCBC Liability',
                    productType: 'Liability',
                    currentValueLcy: -250,
                    profitValueLcy: null,
                    profitPercentLcy: null
                }
            ]
        })?.data?.holdingsByPortfolio });

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay).toBeTruthy();
        expect(overlay.textContent).toContain('Portfolio Viewer (OCBC)');
        expect(overlay.textContent).toContain('Overview');
        expect(overlay.textContent).toContain('Assets');
        expect(overlay.textContent).toContain('Liabilities');
        const overviewCards = Array.from(overlay.querySelectorAll('.gpv-fsm-overview-card'));
        expect(overviewCards.length).toBe(2);
        const assetCard = overviewCards.find(card => card.textContent.includes('Assets'));
        const liabilityCard = overviewCards.find(card => card.textContent.includes('Liabilities'));
        expect(assetCard).toBeTruthy();
        expect(liabilityCard).toBeTruthy();
        expect(assetCard.tagName).toBe('BUTTON');
        expect(assetCard.type).toBe('button');
        expect(assetCard.hasAttribute('role')).toBe(false);
        expect(assetCard.hasAttribute('tabindex')).toBe(false);
        expect(assetCard.textContent).toContain('2 holding');
        expect(assetCard.textContent).not.toContain('OCBC Liability');
        expect(liabilityCard.textContent).toContain('1 holding');
        expect(liabilityCard.textContent).not.toContain('OCBC Asset');

        const viewSelect = overlay.querySelector('#gpv-ocbc-view-select');
        const controlBar = overlay.querySelector('.gpv-control-bar');
        const viewLabel = Array.from(overlay.querySelectorAll('label')).find(label => label.textContent.includes('View:'));
        expect(viewLabel).toBeTruthy();
        expect(viewSelect.id).toBe('gpv-ocbc-view-select');
        expect(viewLabel.getAttribute('for')).toBe('gpv-ocbc-view-select');
        expect(controlBar.hidden).toBe(true);
        expect(viewSelect.disabled).toBe(true);
        expect(viewSelect.getAttribute('tabindex')).toBe('-1');

        assetCard.click();
        expect(overlay.textContent).toContain('Back to overview');
        expect(overlay.textContent).toContain('Portfolio P-1');
        expect(overlay.textContent).toContain('OCBC Asset');
        expect(overlay.textContent).toContain('SG00AAA111');
        expect(overlay.textContent).not.toContain('OCBC Liability');
        expect(overlay.textContent).toContain('Planning');
        expect(controlBar.hidden).toBe(false);
        expect(viewSelect.disabled).toBe(false);
        expect(viewSelect.hasAttribute('tabindex')).toBe(false);

        viewSelect.value = 'liabilities';
        viewSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        expect(overlay.textContent).toContain('OCBC Liability');
        expect(overlay.textContent).toContain('-SGD');
        expect(overlay.textContent).not.toContain('OCBC Asset');

        const backBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Back to overview'));
        backBtn.click();

        expect(controlBar.hidden).toBe(true);
        expect(viewSelect.disabled).toBe(true);
        expect(viewSelect.getAttribute('tabindex')).toBe('-1');
        expect(overlay.textContent).toContain('Overview');
        expect(overlay.textContent).toContain('Assets');
        expect(overlay.textContent).toContain('Liabilities');
    });

    test('OCBC selected detail renders allocation holdings once and planning without cross-portfolio bleed', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Bond 1', productType: 'Bond', currentValueLcy: 250 },
                { code: 'P-2:EQ2', portfolioNo: 'P-2', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Bond 1', productType: 'Bond', currentValueLcy: 250 },
                { code: 'P-2:EQ2', portfolioNo: 'P-2', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Bond 1', productType: 'Bond', currentValueLcy: 250 },
                { code: 'P-2:EQ2', portfolioNo: 'P-2', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        expect(overlay.textContent).toContain('Back to overview');
        expect(overlay.textContent).toContain('Portfolio P-1');
        expect(overlay.textContent).not.toContain('Portfolio P-2');
        expect(overlay.textContent).toContain('Planning');
        expect(overlay.textContent).toContain('Assign instruments to sub-portfolios, set target percentages, and spot drift before rebalancing.');
        expect(overlay.textContent).toContain('Sub-portfolio allocation within Portfolio P-1');
        expect(overlay.textContent).toContain('Asset 1');
        expect(overlay.textContent).toContain('Bond 1');
        expect(overlay.textContent).not.toContain('Asset 2');
        const instrumentRows = Array.from(overlay.querySelectorAll('tbody tr'));
        const rowsWithExactCellText = value => instrumentRows.filter(row => (
            Array.from(row.querySelectorAll('td')).some(cell => (cell.textContent || '').trim() === value)
        ));
        expect(rowsWithExactCellText('EQ1')).toHaveLength(1);
        expect(rowsWithExactCellText('Asset 1')).toHaveLength(1);
        expect(rowsWithExactCellText('BD1')).toHaveLength(1);
        expect(rowsWithExactCellText('Bond 1')).toHaveLength(1);
        expect(overlay.querySelector('.gpv-type-section')).toBeNull();
        const headers = Array.from(overlay.querySelectorAll('th')).map(cell => cell.textContent.trim());
        expect(headers).toContain('Product Type');
        expect(overlay.textContent).toContain('Global Equity');
        expect(overlay.textContent).toContain('Bond');
        expect(Array.from(overlay.querySelectorAll('h3')).some(node => /product\s*type/i.test(node.textContent || ''))).toBe(false);

        const backBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Back to overview'));
        backBtn.click();

        expect(overlay.textContent).toContain('Overview');
        expect(overlay.querySelectorAll('.gpv-fsm-overview-card').length).toBeGreaterThan(0);
    });

    test('OCBC overview shows split sections and detail selector behavior for portfolio cards', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        global.GM_setValue('ocbc', JSON.stringify({
            holdingsByPortfolio: {
                'P-1': {
                    assets: [{ code: 'P-1:A1', portfolioNo: 'P-1', displayTicker: 'A1', name: 'Asset 1', productType: 'Equity', currentValueLcy: 100 }],
                    liabilities: [{ code: 'P-1:L1', portfolioNo: 'P-1', displayTicker: 'L1', name: 'Liability 1', productType: 'Liability', currentValueLcy: -10 }],
                    lastSeenAt: 1700000000000
                },
                'P-2': {
                    assets: [{ code: 'P-2:A2', portfolioNo: 'P-2', displayTicker: 'A2', name: 'Asset 2', productType: 'Bond', currentValueLcy: 200 }],
                    liabilities: [],
                    lastSeenAt: 1700000001000
                }
            }
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const cards = Array.from(overlay.querySelectorAll('.gpv-fsm-overview-card'));
        expect(cards.length).toBe(3);
        const controlBar = overlay.querySelector('.gpv-control-bar');
        const overviewViewSelect = overlay.querySelector('#gpv-ocbc-view-select');
        expect(controlBar.hidden).toBe(true);
        expect(overviewViewSelect.disabled).toBe(true);
        expect(overviewViewSelect.getAttribute('tabindex')).toBe('-1');
        expect(overlay.querySelector('#gpv-ocbc-mode-select')).toBeNull();
        expect(Array.from(overlay.querySelectorAll('label')).some(label => label.textContent.includes('Mode:'))).toBe(false);

        const p1AssetCard = cards.find(card => card.textContent.includes('Portfolio P-1') && card.textContent.includes('Assets'));
        expect(p1AssetCard).toBeTruthy();
        const p1LiabilityCard = cards.find(card => card.textContent.includes('Portfolio P-1') && card.textContent.includes('Liabilities'));
        expect(p1LiabilityCard).toBeTruthy();
        expect(p1AssetCard.textContent).toContain('1 holding');
        expect(p1AssetCard.textContent).not.toContain('Liability 1');
        expect(p1LiabilityCard.textContent).toContain('1 holding');
        expect(p1LiabilityCard.textContent).not.toContain('Asset 1');

        const p1Card = p1AssetCard;
        p1Card.click();
        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Asset 1');
        expect(overlay.textContent).not.toContain('Asset 2');

        const viewSelect = overlay.querySelector('#gpv-ocbc-view-select');
        viewSelect.value = 'liabilities';
        viewSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Liability 1');

        viewSelect.value = 'assets';
        viewSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
        overlay = document.querySelector('#gpv-overlay');

        const backToOverviewBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Back to overview'));
        backToOverviewBtn.click();
        overlay = document.querySelector('#gpv-overlay');

        const currentOverviewCards = Array.from(overlay.querySelectorAll('.gpv-fsm-overview-card'));
        const currentP1LiabilityCard = currentOverviewCards.find(card => card.textContent.includes('Portfolio P-1') && card.textContent.includes('Liabilities'));
        expect(currentP1LiabilityCard).toBeTruthy();
        currentP1LiabilityCard.click();
        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Liability 1');
        expect(overlay.textContent).not.toContain('Asset 1');
        const liabilitiesSelect = overlay.querySelector('#gpv-ocbc-view-select');
        expect(liabilitiesSelect.disabled).toBe(false);

        const backAgainBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Back to overview'));
        backAgainBtn.click();
        overlay = document.querySelector('#gpv-overlay');

        const portfolioCard = Array.from(overlay.querySelectorAll('.gpv-fsm-overview-card'))
            .find(card => card.textContent.includes('Portfolio P-1') && card.textContent.includes('Assets'));
        portfolioCard.click();
        overlay = document.querySelector('#gpv-overlay');

        expect(overlay.textContent).toContain('Planning');
    });

    test('Endowus bucket back round-trip keeps controls coherent and reapplies performance mode on re-entry', () => {
        const performanceData = [
            {
                goalId: 'goal1',
                totalInvestmentValue: { amount: 1000 },
                totalCumulativeReturn: { amount: 100 },
                simpleRateOfReturnPercent: 0.1
            },
            {
                goalId: 'goal2',
                totalInvestmentValue: { amount: 800 },
                totalCumulativeReturn: { amount: 40 },
                simpleRateOfReturnPercent: 0.05
            }
        ];
        const investibleData = [
            {
                goalId: 'goal1',
                goalName: 'Retirement - Core Portfolio',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 1000 } }
            },
            {
                goalId: 'goal2',
                goalName: 'Retirement - Satellite Sleeve',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 800 } }
            }
        ];
        const summaryData = investibleData.map(goal => ({
            goalId: goal.goalId,
            goalName: goal.goalName,
            investmentGoalType: goal.investmentGoalType
        }));

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        let controlBar = overlay.querySelector('.gpv-control-bar');
        let allocationButton = overlay.querySelector('.gpv-mode-btn[data-mode="allocation"]');
        let performanceButton = overlay.querySelector('.gpv-mode-btn[data-mode="performance"]');
        expect(controlBar.hidden).toBe(true);
        expect(overlay.querySelector('#gpv-endowus-view-select')).toBeNull();
        expect(allocationButton.disabled).toBe(true);
        expect(performanceButton.disabled).toBe(true);

        const bucketCard = overlay.querySelector('.gpv-bucket-card');
        bucketCard.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        controlBar = overlay.querySelector('.gpv-control-bar');
        allocationButton = overlay.querySelector('.gpv-mode-btn[data-mode="allocation"]');
        performanceButton = overlay.querySelector('.gpv-mode-btn[data-mode="performance"]');
        expect(controlBar.hidden).toBe(false);
        const detailBackButton = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Back to overview'));
        expect(document.activeElement).toBe(detailBackButton);
        performanceButton.click();
        expect(performanceButton.getAttribute('aria-pressed')).toBe('true');
        expect(allocationButton.getAttribute('aria-pressed')).toBe('false');

        const backToOverviewButton = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Back to overview'));
        expect(backToOverviewButton).toBeTruthy();
        backToOverviewButton.click();

        overlay = document.querySelector('#gpv-overlay');
        controlBar = overlay.querySelector('.gpv-control-bar');
        allocationButton = overlay.querySelector('.gpv-mode-btn[data-mode="allocation"]');
        performanceButton = overlay.querySelector('.gpv-mode-btn[data-mode="performance"]');
        expect(controlBar.hidden).toBe(true);
        expect(overlay.querySelector('#gpv-endowus-view-select')).toBeNull();
        const summaryBucketCard = overlay.querySelector('.gpv-bucket-card');
        if (summaryBucketCard) {
            expect(document.activeElement).toBe(summaryBucketCard);
        }

        overlay.querySelector('.gpv-bucket-card').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        controlBar = overlay.querySelector('.gpv-control-bar');
        allocationButton = overlay.querySelector('.gpv-mode-btn[data-mode="allocation"]');
        performanceButton = overlay.querySelector('.gpv-mode-btn[data-mode="performance"]');
        expect(controlBar.hidden).toBe(false);
        const reentryBackButton = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Back to overview'));
        expect(document.activeElement).toBe(reentryBackButton);
        expect(performanceButton.getAttribute('aria-pressed')).toBe('true');
        expect(allocationButton.getAttribute('aria-pressed')).toBe('false');
    });

    test('Endowus summary with no bucket cards has no selector and retains close button fallback target', () => {
        seedEndowusDataset('performance', []);
        seedEndowusDataset('investible', []);
        seedEndowusDataset('summary', []);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        expect(overlay.querySelector('.gpv-bucket-card')).toBeNull();

        const closeButton = overlay.querySelector('.gpv-close-btn');
        expect(overlay.querySelector('#gpv-endowus-view-select')).toBeNull();
        expect(closeButton).toBeTruthy();

        expect(overlay.querySelector('.gpv-bucket-card')).toBeNull();
        closeButton.focus();
        expect(document.activeElement).toBe(closeButton);
    });

    test('Endowus detail rerender keeps single Back button and returns to clean summary mode', () => {
        const performanceData = [
            {
                goalId: 'goal1',
                totalInvestmentValue: { amount: 1000 },
                totalCumulativeReturn: { amount: 100 },
                simpleRateOfReturnPercent: 0.1
            },
            {
                goalId: 'goal2',
                totalInvestmentValue: { amount: 800 },
                totalCumulativeReturn: { amount: 40 },
                simpleRateOfReturnPercent: 0.05
            }
        ];
        const investibleData = [
            {
                goalId: 'goal1',
                goalName: 'Retirement - Core Portfolio',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 1000 } }
            },
            {
                goalId: 'goal2',
                goalName: 'Retirement - Satellite Sleeve',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 800 } }
            }
        ];
        const summaryData = investibleData.map(goal => ({
            goalId: goal.goalId,
            goalName: goal.goalName,
            investmentGoalType: goal.investmentGoalType
        }));

        seedEndowusDataset('performance', performanceData);
        seedEndowusDataset('investible', investibleData);
        seedEndowusDataset('summary', summaryData);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const bucketCard = overlay.querySelector('.gpv-bucket-card');
        bucketCard.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.querySelector('#gpv-endowus-view-select')).toBeNull();

        overlay = document.querySelector('#gpv-overlay');
        const backButtons = Array.from(overlay.querySelectorAll('button')).filter(btn =>
            (btn.textContent || '').includes('Back to overview')
        );
        expect(backButtons).toHaveLength(1);
        expect(backButtons[0].disabled).toBe(false);

        backButtons[0].click();

        overlay = document.querySelector('#gpv-overlay');
        const modeToggle = overlay.querySelector('.gpv-mode-toggle');
        const summaryBackButtons = Array.from(overlay.querySelectorAll('button')).filter(btn =>
            (btn.textContent || '').includes('Back to overview')
        );
        expect(overlay.querySelector('#gpv-endowus-view-select')).toBeNull();
        expect(modeToggle.classList.contains('gpv-mode-toggle--hidden')).toBe(true);
        summaryBackButtons.forEach(btn => {
            expect(btn.hidden || btn.disabled).toBe(true);
        });
        expect(summaryBackButtons.some(btn => !btn.hidden && !btn.disabled)).toBe(false);
        expect(overlay.querySelector('.gpv-content').classList.contains('gpv-mode-allocation')).toBe(false);
        expect(overlay.querySelector('.gpv-content').classList.contains('gpv-mode-performance')).toBe(false);

        const summaryBucketCard = overlay.querySelector('.gpv-bucket-card');
        summaryBucketCard.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        const rerenderedModeToggle = overlay.querySelector('.gpv-mode-toggle');
        const rerenderedBackButtons = Array.from(overlay.querySelectorAll('button')).filter(btn =>
            (btn.textContent || '').includes('Back to overview')
        );
        expect(overlay.querySelector('#gpv-endowus-view-select')).toBeNull();
        expect(rerenderedModeToggle.classList.contains('gpv-mode-toggle--hidden')).toBe(false);
        rerenderedBackButtons.forEach(btn => {
            expect(btn.hidden || btn.disabled).toBe(false);
        });
        expect(rerenderedBackButtons.some(btn => !btn.hidden && !btn.disabled)).toBe(true);
        expect(overlay.querySelector('.gpv-content').classList.contains('gpv-mode-allocation')).toBe(true);
        expect(overlay.querySelector('.gpv-content').classList.contains('gpv-mode-performance')).toBe(false);
    });

    test('OCBC allocation mode shows renamed columns and target assignment indicators', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 100, profitValueLcy: 10 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 300, profitValueLcy: -30 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Asset 3', productType: 'Bond', currentValueLcy: 600 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 100, profitValueLcy: 10 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 300, profitValueLcy: -30 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Asset 3', productType: 'Bond', currentValueLcy: 600 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 100, profitValueLcy: 10 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 300, profitValueLcy: -30 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Asset 3', productType: 'Bond', currentValueLcy: 600 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P-1': [
                    { id: 'core', name: 'Core', archived: false },
                    { id: 'satellite', name: 'Satellite', archived: false }
                ]
            }
        } } }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-1:EQ1': 'core',
            'P-1:EQ2': 'core'
        } } }));
        upsertOcbcStore(current => ({
            ...current,
            allocation: {
                ...(current.allocation || {}),
                targetsByScope: {
                    'assets|P-1|core|': 110,
                    'assets|P-1|satellite|': 0,
                    'assets|P-1|core|P-1%3AEQ1': 50,
                    'assets|P-1|core|P-1%3AEQ2': 70
                }
            }
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        const allocationText = overlay.textContent;
        expect(allocationText).toContain('Planning');
        expect(allocationText).toContain('Assign instruments to sub-portfolios, set target percentages, and spot drift before rebalancing.');
        expect(allocationText).toContain('Scope: Assets');
        expect(allocationText).toContain('Current value');
        expect(allocationText).toContain('Sub-portfolios');
        expect(allocationText).toContain('Unassigned instruments');
        expect(allocationText).toContain('Target coverage');
        expect(allocationText).toContain('Needs attention');
        expect(allocationText).toContain('1 instrument unassigned to a sub-portfolio');
        expect(allocationText).toContain('Sub-portfolio allocation within Portfolio P-1');
        expect(allocationText).toContain('Instrument allocation · Core');
        expect(allocationText).toContain('Sub-portfolio targets: 110.00% assigned, 10.00% overallocated');
        expect(allocationText).toContain('Core instrument targets: 120.00% assigned, 20.00% overallocated');
        const targetSummaries = overlay.querySelectorAll('.gpv-sync-help.gpv-ocbc-target-summary');
        expect(targetSummaries.length).toBeGreaterThanOrEqual(2);
        expect(Array.from(targetSummaries).some(node => node.textContent.includes('Sub-portfolio targets:'))).toBe(true);
        expect(Array.from(targetSummaries).some(node => node.textContent.includes('Core instrument targets:'))).toBe(true);

        const headers = Array.from(overlay.querySelectorAll('th')).map(cell => cell.textContent.trim());
        expect(headers).toContain('Current % of portfolio');
        expect(headers).toContain('Target % of portfolio');
        expect(headers).toContain('Profit');
        expect(headers).toContain('Current % of sub-portfolio');
        expect(headers).toContain('Target % of sub-portfolio');
        const getColumnIndex = (table, columnLabel) => Array.from(table.querySelectorAll('thead th'))
            .findIndex(cell => cell.textContent.trim() === columnLabel);
        const getRowByExactTicker = (table, ticker) => Array.from(table.querySelectorAll('tbody tr'))
            .find(row => Array.from(row.querySelectorAll('td')).some(cell => (cell.textContent || '').trim() === ticker));

        const coreHeading = Array.from(overlay.querySelectorAll('h3'))
            .find(node => node.textContent.trim() === 'Instrument allocation · Core');
        const coreTable = nextTableFrom(coreHeading?.parentElement);
        const coreProfitColumnIndex = getColumnIndex(coreTable, 'Profit');
        expect(coreProfitColumnIndex).toBeGreaterThanOrEqual(0);

        const eq1Row = getRowByExactTicker(coreTable, 'EQ1');
        const eq2Row = getRowByExactTicker(coreTable, 'EQ2');
        expect(eq1Row).toBeTruthy();
        expect(eq2Row).toBeTruthy();
        expect(eq1Row.querySelectorAll('td')[coreProfitColumnIndex].textContent.trim()).toContain('+SGD 10.00');
        expect(eq2Row.querySelectorAll('td')[coreProfitColumnIndex].textContent.trim()).toContain('-SGD 30.00');

        const unassignedHeading = Array.from(overlay.querySelectorAll('h3'))
            .find(node => node.textContent.trim() === 'Unassigned instruments');
        const unassignedTable = nextTableFrom(unassignedHeading?.parentElement);
        const unassignedProfitColumnIndex = getColumnIndex(unassignedTable, 'Profit');
        const bd1Row = getRowByExactTicker(unassignedTable, 'BD1');
        expect(unassignedProfitColumnIndex).toBeGreaterThanOrEqual(0);
        expect(bd1Row).toBeTruthy();
        expect(bd1Row.querySelectorAll('td')[unassignedProfitColumnIndex].textContent.trim()).toBe('-');

        expect(allocationText).toContain('25.00%');
        expect(allocationText).toContain('50.00%');
        expect(allocationText).toContain('-50.00%');
    });

    test('OCBC allocation mode renders assigned and unassigned instruments under separate headings', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Bond 1', productType: 'Bond', currentValueLcy: 500 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Bond 1', productType: 'Bond', currentValueLcy: 500 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Bond 1', productType: 'Bond', currentValueLcy: 500 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P-1': [{ id: 'core', name: 'Core', archived: false }]
            }
        } } }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-1:EQ1': 'core'
        } } }));
        global.GM_setValue('ocbc_target_pct_assets|P-1|core|P-1%3AEQ1', 60);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        const coreHeading = Array.from(overlay.querySelectorAll('h3')).find(node => node.textContent.trim() === 'Instrument allocation · Core');
        const unassignedHeading = Array.from(overlay.querySelectorAll('h3')).find(node => node.textContent.trim() === 'Unassigned instruments');
        expect(coreHeading).toBeTruthy();
        expect(unassignedHeading).toBeTruthy();

        expect(overlay.textContent).toContain('Core instrument targets:');
        const coreHeaderRow = coreHeading.parentElement;
        const coreTable = nextTableFrom(coreHeaderRow);

        const unassignedHeaderRow = unassignedHeading.parentElement;
        const unassignedTable = nextTableFrom(unassignedHeaderRow);
        expect(unassignedTable?.tagName).toBe('TABLE');
        expect(unassignedTable?.textContent).not.toContain('instrument targets:');

        expect(coreTable?.textContent).toContain('EQ1');
        expect(coreTable?.textContent).not.toContain('BD1');
        expect(unassignedTable?.textContent).toContain('BD1');
        expect(unassignedTable?.textContent).not.toContain('EQ1');
    });

    test('assigned OCBC instrument shows sub-portfolio allocation and drift against target', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 100 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 300 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 100 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 300 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 100 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 300 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P-1': [{ id: 'core', name: 'Core', archived: false }]
            }
        } } }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-1:EQ1': 'core',
            'P-1:EQ2': 'core'
        } } }));
        upsertOcbcStore(current => ({
            ...current,
            allocation: { ...(current.allocation || {}), targetsByScope: { 'assets|P-1|core|P-1%3AEQ1': 50 } }
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        const assignedHeading = Array.from(overlay.querySelectorAll('h3'))
            .find(node => node.textContent.trim() === 'Instrument allocation · Core');
        const assignedHeaderRow = assignedHeading?.parentElement;
        const assignedTable = nextTableFrom(assignedHeaderRow);
        const eq1Row = Array.from(assignedTable?.querySelectorAll('tbody tr') || [])
            .find(row => row.textContent.includes('EQ1'));
        expect(eq1Row).toBeTruthy();
        expect(eq1Row.textContent).toContain('25.00%');
        expect(eq1Row.textContent).toContain('50.00%');
        expect(eq1Row.textContent).toContain('-50.00%');
    });

    test('OCBC allocation mode persists sub-portfolios and simple assignments', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:FI1', portfolioNo: 'P-1', displayTicker: 'FI1', name: 'Asset 2', productType: 'Fixed Income', currentValueLcy: 500 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:FI1', portfolioNo: 'P-1', displayTicker: 'FI1', name: 'Asset 2', productType: 'Fixed Income', currentValueLcy: 500 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:FI1', portfolioNo: 'P-1', displayTicker: 'FI1', name: 'Asset 2', productType: 'Fixed Income', currentValueLcy: 500 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-1:EQ1': 'legacy-core',
            'P-9:MISSING': { subPortfolioId: 'other', bucketId: 'x' }
        } } }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        const subPortfolioInput = overlay.querySelector('input[placeholder="Sub-portfolio name"]');
        subPortfolioInput.value = 'Core';
        const createSubPortfolioBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Create');
        createSubPortfolioBtn.dispatchEvent(new window.Event('click', { bubbles: true }));

        const savedSubPortfolios = JSON.parse(storage.get('ocbc')).allocation.subPortfolios;
        expect(savedSubPortfolios.assets['P-1'][0].id).toBe('core');

        const subPortfolioSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for EQ1');
        subPortfolioSelect.value = 'core';
        subPortfolioSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const savedAssignments = JSON.parse(storage.get('ocbc')).allocation.assignmentByCode;
        expect(savedAssignments['P-1:EQ1']).toBe('core');
        expect(savedAssignments['P-9:MISSING']).toBe('other');
    });

    test('OCBC allocation mode honors legacy bucket assignments and target fallback while writing new target keys', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        const legacyTargetKey = 'ocbc_target_pct_assets|Global%20Equity|core-equity';

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:FI1', portfolioNo: 'P-1', displayTicker: 'FI1', name: 'Asset 2', productType: 'Fixed Income', currentValueLcy: 500 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:FI1', portfolioNo: 'P-1', displayTicker: 'FI1', name: 'Asset 2', productType: 'Fixed Income', currentValueLcy: 500 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:FI1', portfolioNo: 'P-1', displayTicker: 'FI1', name: 'Asset 2', productType: 'Fixed Income', currentValueLcy: 500 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        global.GM_setValue('ocbc_allocation_buckets', JSON.stringify({
            assets: {
                'Global Equity': [{ id: 'core-equity', name: 'Core Equity' }]
            }
        }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-1:EQ1': 'core-equity'
        } } }));
        global.GM_setValue(legacyTargetKey, 70);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        expect(overlay.textContent).toContain('Unassigned instruments');

        const subPortfolioSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for EQ1');
        expect(subPortfolioSelect.value).toBe('');

        const targetInput = overlay.querySelector('input[aria-label="Target percentage for portfolio P-1 sub-portfolio Core Equity"]');
        expect(targetInput).toBeNull();

        const newTargetKey = 'ocbc_target_pct_assets|P-1|core-equity|';
        expect(storage.has(newTargetKey)).toBe(false);

        expect(JSON.parse(storage.get('ocbc')).allocation.targetsByScope?.['assets|P-1|core-equity|']).toBeUndefined();
        expect(storage.get(legacyTargetKey)).toBe(70);
    });

    test('OCBC allocation mode writes separator-safe scoped target keys and avoids collisions', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P|1:EQ1', portfolioNo: 'P|1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P:EQ2', portfolioNo: 'P', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P|1:EQ1', portfolioNo: 'P|1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P:EQ2', portfolioNo: 'P', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P|1:EQ1', portfolioNo: 'P|1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P:EQ2', portfolioNo: 'P', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P|1': [
                    { id: 'core', name: 'Core Pipe Portfolio', archived: false, buckets: [] }
                ],
                P: [
                    { id: '1|core', name: 'Core Pipe Sub', archived: false, buckets: [] }
                ]
            }
        } } }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P|1:EQ1': { subPortfolioId: 'core', bucketId: '' },
            'P:EQ2': { subPortfolioId: '1|core', bucketId: '' }
        } } }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio('Portfolio P|1');
        const portfolioPipeInput = overlay.querySelector('input[aria-label="Target percentage for portfolio P|1 sub-portfolio Core Pipe Portfolio"]');
        expect(portfolioPipeInput).toBeTruthy();
        portfolioPipeInput.value = '60';
        portfolioPipeInput.dispatchEvent(new window.Event('change', { bubbles: true }));

        let ocbcTargets = JSON.parse(storage.get('ocbc')).allocation.targetsByScope;
        expect(ocbcTargets['assets|P%7C1|core|']).toBe(60);

        const backToOverviewBtn = Array.from(overlay.querySelectorAll('button'))
            .find(btn => (btn.textContent || '').includes('Back to overview'));
        expect(backToOverviewBtn).toBeTruthy();
        backToOverviewBtn.click();

        overlay = openOcbcOverviewPortfolio('Portfolio P');
        const portfolioPlainInput = overlay.querySelector('input[aria-label="Target percentage for portfolio P sub-portfolio Core Pipe Sub"]');
        expect(portfolioPlainInput).toBeTruthy();
        portfolioPlainInput.value = '35';
        portfolioPlainInput.dispatchEvent(new window.Event('change', { bubbles: true }));

        ocbcTargets = JSON.parse(storage.get('ocbc')).allocation.targetsByScope;
        expect(ocbcTargets['assets|P%7C1|core|']).toBe(60);
        expect(ocbcTargets['assets|P|1%7Ccore|']).toBe(35);
        expect(Object.prototype.hasOwnProperty.call(ocbcTargets, 'assets|P%7C1|core|')).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(ocbcTargets, 'assets|P|1%7Ccore|')).toBe(true);
        expect('assets|P%7C1|core|').not.toBe('assets|P|1%7Ccore|');
    });

    test('OCBC allocation mode reads separator-safe legacy target fallback keys', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global|Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global|Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global|Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        global.GM_setValue('ocbc_allocation_buckets', JSON.stringify({
            assets: {
                'Global|Equity': [{ id: 'core|equity', name: 'Core Equity' }]
            }
        }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-1:EQ1': 'core|equity'
        } } }));
        global.GM_setValue('ocbc_target_pct_assets|Global%7CEquity|core%7Cequity', 72);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        const targetInput = overlay.querySelector('input[aria-label="Target percentage for portfolio P-1 sub-portfolio Core Equity"]');
        expect(targetInput).toBeNull();
    });

    test('OCBC target input clamps finite values, clears blanks, and ignores non-finite entries', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P-1': [{ id: 'core', name: 'Core', archived: false, buckets: [] }]
            }
        } } }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-1:EQ1': { subPortfolioId: 'core', bucketId: '' }
        } } }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();
        let targetInput = overlay.querySelector('input[aria-label="Target percentage for portfolio P-1 sub-portfolio Core"]');
        expect(targetInput).toBeTruthy();

        targetInput.value = '150';
        targetInput.dispatchEvent(new window.Event('change', { bubbles: true }));
        expect(JSON.parse(storage.get('ocbc')).allocation.targetsByScope['assets|P-1|core|']).toBe(100);

        overlay = document.querySelector('#gpv-overlay');
        targetInput = overlay.querySelector('input[aria-label="Target percentage for portfolio P-1 sub-portfolio Core"]');
        expect(targetInput.value).toBe('100.00');

        targetInput.value = '-5';
        targetInput.dispatchEvent(new window.Event('change', { bubbles: true }));
        expect(JSON.parse(storage.get('ocbc')).allocation.targetsByScope['assets|P-1|core|']).toBe(0);

        overlay = document.querySelector('#gpv-overlay');
        targetInput = overlay.querySelector('input[aria-label="Target percentage for portfolio P-1 sub-portfolio Core"]');
        expect(targetInput.value).toBe('0.00');

        targetInput.value = '';
        targetInput.dispatchEvent(new window.Event('change', { bubbles: true }));
        expect(JSON.parse(storage.get('ocbc')).allocation.targetsByScope['assets|P-1|core|']).toBeUndefined();

        overlay = document.querySelector('#gpv-overlay');
        targetInput = overlay.querySelector('input[aria-label="Target percentage for portfolio P-1 sub-portfolio Core"]');
        expect(targetInput.value).toBe('');

        targetInput.value = 'Infinity';
        targetInput.dispatchEvent(new window.Event('change', { bubbles: true }));
        expect(JSON.parse(storage.get('ocbc')).allocation.targetsByScope['assets|P-1|core|']).toBeUndefined();
    });

    test('OCBC allocation mode resolves duplicate legacy bucket ids by row product type and keeps product-scoped legacy targets', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Equity Asset', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Bond Asset', productType: 'Bond', currentValueLcy: 500 },
                { code: 'P-1:UNK1', portfolioNo: 'P-1', displayTicker: 'UNK1', name: 'Unknown Asset', currentValueLcy: 200 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Equity Asset', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Bond Asset', productType: 'Bond', currentValueLcy: 500 },
                { code: 'P-1:UNK1', portfolioNo: 'P-1', displayTicker: 'UNK1', name: 'Unknown Asset', currentValueLcy: 200 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Equity Asset', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Bond Asset', productType: 'Bond', currentValueLcy: 500 },
                { code: 'P-1:UNK1', portfolioNo: 'P-1', displayTicker: 'UNK1', name: 'Unknown Asset', currentValueLcy: 200 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P-1': [
                    { id: 'all-weather', name: 'All Weather', archived: false, buckets: [] }
                ]
            }
        } } }));
        global.GM_setValue('ocbc_allocation_buckets', JSON.stringify({
            assets: {
                'Global Equity': [{ id: 'core', name: 'Core' }],
                Bond: [{ id: 'core', name: 'Core' }]
            }
        }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-1:EQ1': 'core',
            'P-1:BD1': 'core',
            'P-1:UNK1': 'core'
        } } }));
        global.GM_setValue('ocbc_target_pct_assets|Global%20Equity|core', 70);
        global.GM_setValue('ocbc_target_pct_assets|Bond|core', 30);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        const equitySubPortfolioSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for EQ1');
        const bondSubPortfolioSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for BD1');
        const unknownSubPortfolioSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for UNK1');

        expect(equitySubPortfolioSelect.value).toBe('');
        expect(bondSubPortfolioSelect.value).toBe('');
        expect(unknownSubPortfolioSelect.value).toBe('');

        const equityOptionValues = Array.from(equitySubPortfolioSelect.options).map(option => option.value);
        const bondOptionValues = Array.from(bondSubPortfolioSelect.options).map(option => option.value);
        expect(equityOptionValues).toContain('all-weather');
        expect(bondOptionValues).toContain('all-weather');
        expect(equityOptionValues).not.toContain('legacy-global-equity-core');
        expect(bondOptionValues).not.toContain('legacy-bond-core');

        const equityTargetInput = overlay.querySelector('input[aria-label="Target percentage for portfolio P-1 sub-portfolio Core"]');
        const duplicateLegacyTargetInput = Array.from(overlay.querySelectorAll('input.gpv-target-input'))
            .find(input => input !== equityTargetInput && input.getAttribute('aria-label') === 'Target percentage for portfolio P-1 sub-portfolio Core');

        expect(equityTargetInput).toBeNull();
        expect(duplicateLegacyTargetInput).toBeUndefined();
    });

    test('OCBC allocation mode lets explicit scoped sub-portfolio win on legacy id collision without legacy fallback metadata', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        const legacyTargetKey = 'ocbc_target_pct_assets|Global%20Equity|core';
        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Asset 2', productType: 'Bond', currentValueLcy: 600 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Asset 2', productType: 'Bond', currentValueLcy: 600 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Asset 2', productType: 'Bond', currentValueLcy: 600 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P-1': [
                    { id: 'legacy-global-equity-core', name: 'Scoped Core', archived: false, buckets: [] }
                ]
            }
        } } }));
        global.GM_setValue('ocbc_allocation_buckets', JSON.stringify({
            assets: {
                'Global Equity': [{ id: 'core', name: 'Core' }],
                Bond: [{ id: 'core', name: 'Core' }]
            }
        }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-1:EQ1': 'core'
        } } }));
        global.GM_setValue(legacyTargetKey, 55);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        const targetInput = overlay.querySelector('input[aria-label="Target percentage for portfolio P-1 sub-portfolio Scoped Core"]');
        expect(targetInput).toBeTruthy();
        expect(targetInput.value).toBe('');

        const equitySubPortfolioSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for EQ1');
        const bondSubPortfolioSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for BD1');

        const equityOptionValues = Array.from(equitySubPortfolioSelect.options).map(option => option.value);
        const bondOptionValues = Array.from(bondSubPortfolioSelect.options).map(option => option.value);

        expect(equityOptionValues).toContain('legacy-global-equity-core');
        expect(bondOptionValues).toContain('legacy-global-equity-core');
    });

    test('OCBC allocation mode falls back to product-matching legacy candidate when direct legacy-id collision is disallowed for row product type', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Equity Asset', productType: 'Global Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Equity Asset', productType: 'Global Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Equity Asset', productType: 'Global Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P-1': [
                    { id: 'core', name: 'Scoped Core (Bond)', archived: false, buckets: [], legacyProductType: 'Bond' }
                ]
            }
        } } }));
        global.GM_setValue('ocbc_allocation_buckets', JSON.stringify({
            assets: {
                'Global Equity': [{ id: 'core', name: 'Core' }],
                Bond: [{ id: 'core', name: 'Core' }]
            }
        }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-1:EQ1': 'core'
        } } }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        const equitySubPortfolioSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for EQ1');
        const equityOptionValues = Array.from(equitySubPortfolioSelect.options).map(option => option.value);

        expect(equitySubPortfolioSelect.value).toBe('');
        expect(equityOptionValues).toContain('');
    });

    test('OCBC allocation mode treats mismatched legacy-derived assignment as unassigned', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Bond Asset', productType: 'Bond', currentValueLcy: 1000 },
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Equity Asset', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Bond Asset', productType: 'Bond', currentValueLcy: 1000 },
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Equity Asset', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Bond Asset', productType: 'Bond', currentValueLcy: 1000 },
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Equity Asset', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P-1': [
                    {
                        id: 'core',
                        name: 'Core',
                        archived: false
                    }
                ]
            }
        } } }));
        global.GM_setValue('ocbc_allocation_buckets', JSON.stringify({
            assets: {
                'Global Equity': [{ id: 'legacy-core', name: 'Legacy Core' }]
            }
        }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-1:BD1': { subPortfolioId: 'legacy-global-equity-legacy-core', bucketId: 'stale-bucket' },
            'P-1:EQ1': { subPortfolioId: 'core', bucketId: 'missing-bucket' }
        } } }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        const bondSubPortfolioSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for BD1');
        expect(bondSubPortfolioSelect.value).toBe('');

        const equitySubPortfolioSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for EQ1');
        expect(equitySubPortfolioSelect.value).toBe('core');
        expect(overlay.textContent).not.toContain('Allocation bucket');
    });

    test('OCBC allocation mode does not show nested bucket controls for legacy-derived sub-portfolios', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        global.GM_setValue('ocbc_allocation_buckets', JSON.stringify({
            assets: {
                'Global Equity': [{ id: 'core', name: 'Core' }]
            }
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        expect(overlay.textContent).not.toContain('Core buckets');
        expect(Array.from(overlay.querySelectorAll('label')).some(label => label.textContent.trim() === 'New nested bucket')).toBe(false);
        expect(overlay.querySelector('input[placeholder="Bucket name"]')).toBeFalsy();
    });

    test('OCBC allocation mode provides aria-label for instrument target input', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P-1': [
                    {
                        id: 'core',
                        name: 'Core',
                        archived: false
                    }
                ]
            }
        } } }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-1:EQ1': { subPortfolioId: 'core', bucketId: 'growth' }
        } } }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        const targetInput = overlay.querySelector('input[aria-label="Target percentage for instrument EQ1 in sub-portfolio Core"]');
        expect(targetInput).toBeTruthy();
    });

    test('OCBC allocation mode stores instrument scoped target key and shows copy values near sub-portfolio heading', async () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;
        Object.defineProperty(window.navigator, 'clipboard', {
            configurable: true,
            value: { writeText: jest.fn(() => Promise.resolve()) }
        });
        let fallbackCopiedText = null;
        document.execCommand = jest.fn(command => {
            if (command === 'copy') {
                const textarea = document.querySelector('textarea');
                fallbackCopiedText = textarea ? textarea.value : null;
                return true;
            }
            return false;
        });

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000.5 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 700.25 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000.5 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 700.25 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000.5 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 700.25 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P-1': [{ id: 'core', name: 'Core', archived: false }]
            }
        } } }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-1:EQ1': 'core',
            'P-1:EQ2': 'core'
        } } }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        const targetInput = overlay.querySelector('input[aria-label="Target percentage for instrument EQ1 in sub-portfolio Core"]');
        targetInput.value = '60';
        targetInput.dispatchEvent(new window.Event('change', { bubbles: true }));

        expect(JSON.parse(storage.get('ocbc')).allocation.targetsByScope['assets|P-1|core|P-1%3AEQ1']).toBe(60);
        expect(overlay.textContent).toContain('-SGD 19.95');

        const copyButton = overlay.querySelector('button[aria-label="Copy values for sub-portfolio Core"]');
        expect(copyButton).toBeTruthy();
        expect(copyButton.classList.contains('gpv-section-toggle')).toBe(true);
        expect(copyButton.classList.contains('gpv-sync-btn-primary')).toBe(false);
        const instrumentHeading = Array.from(overlay.querySelectorAll('.gpv-ocbc-instrument-header-row'))
            .find(row => row.textContent.includes('Instrument allocation · Core'));
        expect(instrumentHeading).toBeTruthy();
        const sectionSummary = instrumentHeading.nextElementSibling;
        expect(sectionSummary?.classList.contains('gpv-ocbc-target-summary')).toBe(true);
        const sectionActions = sectionSummary?.nextElementSibling;
        expect(sectionActions?.classList.contains('gpv-balance-copy-controls--section')).toBe(true);
        expect(sectionActions?.classList.contains('gpv-balance-copy-controls--ocbc-values')).toBe(true);
        expect(sectionActions?.contains(copyButton)).toBe(true);
        const status = sectionActions?.querySelector('.gpv-balance-copy-status');
        expect(status).toBeTruthy();
        expect(status?.getAttribute('role')).toBe('status');
        expect(status?.getAttribute('aria-live')).toBe('polite');
        expect(status?.getAttribute('aria-atomic')).toBe('true');
        expect(copyButton.textContent).toContain('Copy values');
        copyButton.dispatchEvent(new window.Event('click', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(overlay.textContent).toContain('Copied 2 values');
        const clipboardCall = window.navigator.clipboard.writeText.mock.calls[0];
        const copiedText = clipboardCall ? clipboardCall[0] : fallbackCopiedText;
        expect(copiedText).toBe('1000.5\t700.25');
        expect(copiedText).not.toContain('Sub-portfolio');
        expect(copiedText).not.toContain('Identifier');
        expect(copiedText).not.toContain('Name');
        expect(copiedText).not.toContain('SGD');
        expect(copiedText).not.toContain('Target');
        expect(copiedText).not.toContain('Drift');
        expect(copiedText).not.toContain('%');
        expect(copiedText).not.toContain('\n');
    });

    test('OCBC Copy values keeps row order and emits blank TSV fields for missing current values', async () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;
        Object.defineProperty(window.navigator, 'clipboard', {
            configurable: true,
            value: { writeText: jest.fn(() => Promise.resolve()) }
        });
        let fallbackCopiedText = null;
        document.execCommand = jest.fn(command => {
            if (command === 'copy') {
                const textarea = document.querySelector('textarea');
                fallbackCopiedText = textarea ? textarea.value : null;
                return true;
            }
            return false;
        });

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000.5 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: null },
                { code: 'P-1:EQ3', portfolioNo: 'P-1', displayTicker: 'EQ3', name: 'Asset 3', productType: 'Global Equity', currentValueLcy: 700.25 },
                { code: 'P-1:EQ4', portfolioNo: 'P-1', displayTicker: 'EQ4', name: 'Asset 4', productType: 'Global Equity' }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000.5 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: null },
                { code: 'P-1:EQ3', portfolioNo: 'P-1', displayTicker: 'EQ3', name: 'Asset 3', productType: 'Global Equity', currentValueLcy: 700.25 },
                { code: 'P-1:EQ4', portfolioNo: 'P-1', displayTicker: 'EQ4', name: 'Asset 4', productType: 'Global Equity' }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000.5 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: null },
                { code: 'P-1:EQ3', portfolioNo: 'P-1', displayTicker: 'EQ3', name: 'Asset 3', productType: 'Global Equity', currentValueLcy: 700.25 },
                { code: 'P-1:EQ4', portfolioNo: 'P-1', displayTicker: 'EQ4', name: 'Asset 4', productType: 'Global Equity' }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P-1': [{ id: 'core', name: 'Core', archived: false }]
            }
        } } }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-1:EQ1': 'core',
            'P-1:EQ2': 'core',
            'P-1:EQ3': 'core',
            'P-1:EQ4': 'core'
        } } }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        const copyButton = overlay.querySelector('button[aria-label="Copy values for sub-portfolio Core"]');
        copyButton.dispatchEvent(new window.Event('click', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 0));

        const clipboardCall = window.navigator.clipboard.writeText.mock.calls[0];
        const copiedText = clipboardCall ? clipboardCall[0] : fallbackCopiedText;
        expect(copiedText).toBe('1000.5\t\t700.25\t');
    });

    test('OCBC allocation mode Up/Down reorders rows and persists order by scope', async () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;
        Object.defineProperty(window.navigator, 'clipboard', {
            configurable: true,
            value: { writeText: jest.fn(() => Promise.resolve()) }
        });
        let fallbackCopiedText = null;
        document.execCommand = jest.fn(command => {
            if (command === 'copy') {
                const textarea = document.querySelector('textarea');
                fallbackCopiedText = textarea ? textarea.value : null;
                return true;
            }
            return false;
        });

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 700 },
                { code: 'P-1:EQ3', portfolioNo: 'P-1', displayTicker: 'EQ3', name: 'Asset 3', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 700 },
                { code: 'P-1:EQ3', portfolioNo: 'P-1', displayTicker: 'EQ3', name: 'Asset 3', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 700 },
                { code: 'P-1:EQ3', portfolioNo: 'P-1', displayTicker: 'EQ3', name: 'Asset 3', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: { 'P-1': [{ id: 'core', name: 'Core', archived: false }] }
        } } }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-1:EQ1': 'core',
            'P-1:EQ2': 'core',
            'P-1:EQ3': 'core'
        } } }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        const coreSectionRow = Array.from(overlay.querySelectorAll('.gpv-ocbc-instrument-header-row'))
            .find(row => row.textContent.includes('Instrument allocation · Core'));
        const coreTable = nextTableFrom(coreSectionRow);
        const getCodes = () => Array.from(coreTable.querySelectorAll('tbody tr td:first-child')).map(cell => cell.textContent.trim());
        expect(getCodes()).toEqual(['EQ1', 'EQ2', 'EQ3']);

        const eq2Row = Array.from(coreTable.querySelectorAll('tbody tr')).find(tr => tr.textContent.includes('EQ2'));
        const eq2UpButton = Array.from(eq2Row.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Up');
        eq2UpButton.dispatchEvent(new window.Event('click', { bubbles: true }));

        const updatedHeaderRow = Array.from(overlay.querySelectorAll('.gpv-ocbc-instrument-header-row'))
            .find(row => row.textContent.includes('Instrument allocation · Core'));
        const updatedTable = nextTableFrom(updatedHeaderRow);
        const updatedCodes = Array.from(updatedTable.querySelectorAll('tbody tr td:first-child')).map(cell => cell.textContent.trim());
        expect(updatedCodes).toEqual(['EQ2', 'EQ1', 'EQ3']);

        const savedOrder = JSON.parse(storage.get('ocbc')).allocation.orderByScope;
        expect(savedOrder['assets|P-1|core']).toEqual(['P-1:EQ2', 'P-1:EQ1', 'P-1:EQ3']);

        const copyButton = overlay.querySelector('button[aria-label="Copy values for sub-portfolio Core"]');
        expect(copyButton).toBeTruthy();
        copyButton.dispatchEvent(new window.Event('click', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 0));
        const clipboardCall = window.navigator.clipboard.writeText.mock.calls[0];
        const copiedText = clipboardCall ? clipboardCall[0] : fallbackCopiedText;
        expect(copiedText).toBe('700\t1000\t500');
    });

    test('OCBC allocation mode moves instrument between order scopes when reassigned', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 900 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 900 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 900 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P-1': [
                    { id: 'core', name: 'Core', archived: false },
                    { id: 'satellite', name: 'Satellite', archived: false }
                ]
            }
        } } }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-1:EQ1': 'core',
            'P-1:EQ2': 'core'
        } } }));
        global.GM_setValue('ocbc_allocation_order_by_scope', JSON.stringify({
            'assets|P-1|core': ['P-1:EQ2', 'P-1:EQ1']
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        const eq2Select = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for EQ2');
        eq2Select.value = 'satellite';
        eq2Select.dispatchEvent(new window.Event('change', { bubbles: true }));

        const savedOrder = JSON.parse(storage.get('ocbc')).allocation.orderByScope;
        expect(savedOrder['assets|P-1|satellite']).toEqual(['P-1:EQ2']);
    });

    test('OCBC allocation mode reassignment removes instrument from legacy unassigned order scope and appends to target scope', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 900 },
                { code: 'P-1:EQ9', portfolioNo: 'P-1', displayTicker: 'EQ9', name: 'Asset 9', productType: 'Global Equity', currentValueLcy: 600 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 900 },
                { code: 'P-1:EQ9', portfolioNo: 'P-1', displayTicker: 'EQ9', name: 'Asset 9', productType: 'Global Equity', currentValueLcy: 600 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 900 },
                { code: 'P-1:EQ9', portfolioNo: 'P-1', displayTicker: 'EQ9', name: 'Asset 9', productType: 'Global Equity', currentValueLcy: 600 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P-1': [
                    { id: 'core', name: 'Core', archived: false },
                    { id: 'satellite', name: 'Satellite', archived: false }
                ]
            }
        } } }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-1:EQ1': 'core',
            'P-1:EQ2': '',
            'P-1:EQ9': 'satellite'
        } } }));
        global.GM_setValue('ocbc_allocation_order_by_scope', JSON.stringify({
            'assets|P-1|-': ['P-1:EQ2', 'P-1:EQ1'],
            'assets|P-1|satellite': ['P-1:EQ9']
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        const eq2Select = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for EQ2');
        eq2Select.value = 'satellite';
        eq2Select.dispatchEvent(new window.Event('change', { bubbles: true }));

        const savedOrder = JSON.parse(storage.get('ocbc')).allocation.orderByScope;
        expect(savedOrder['assets|P-1|satellite']).toEqual(['P-1:EQ2']);
    });

    test('normalizeOcbcHoldingsPayload keeps portfolioNo and stable non-portfolio identifier', () => {
        const exportsModule = require('../goal_portfolio_viewer.user.js');
        const normalized = exportsModule.normalizeOcbcHoldingsPayload({
            data: [
                {
                    portfolioNo: 'P-100',
                    assets: [
                        {
                            assetClassDesc: 'Managed Funds',
                            subAssets: [
                                {
                                    subAssetClassDesc: 'Global Equity',
                                    holdings: [
                                        { isin: 'ISIN-1', shortName: 'EQ', marketValueReferenceCcy: 1500 },
                                        { fundCode: 'FUND-2', shortName: 'EQ2', marketValueReferenceCcy: 2500 },
                                        { trancheId: 'TR-3', shortName: 'EQ3', marketValueReferenceCcy: 3500 },
                                        { positionId: 'POS-4', shortName: 'EQ4', marketValueReferenceCcy: 4500 },
                                        { marketValueReferenceCcy: 5000 }
                                    ]
                                }
                            ]
                        }
                    ],
                    liabilities: []
                }
            ]
        });

        expect(normalized.assets).toHaveLength(5);
        normalized.assets.forEach(row => {
            expect(row.portfolioNo).toBe('P-100');
            expect(row.productType).toBe('Global Equity');
            expect(row.assetClassDesc).toBe('Managed Funds');
            expect(row.subAssetClassDesc).toBe('Global Equity');
            expect(row.displayTicker).not.toBe('P-100');
            expect(row.code.startsWith('P-100:')).toBe(true);
        });
        expect(normalized.assets.map(row => row.displayTicker)).toEqual(['ISIN-1', 'FUND-2', 'EQ3', 'EQ4', 'Holding 5']);
        expect(normalized.assets[4].displayTicker).not.toContain('P-100');
        expect(normalized.assets[4].displayTicker.length).toBeGreaterThan(0);
    });

    test('OCBC allocation render migrates legacy assignment key into stable generated key', () => {
        teardownDom();
        setupDom({ url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=111' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        const normalized = exportsModule.normalizeOcbcHoldingsPayload({
            data: [{
                portfolioNo: 'P-LEGACY',
                assets: [{
                    assetClassDesc: 'Managed Funds',
                    subAssets: [{
                        subAssetClassDesc: 'Global Equity',
                        holdings: [
                            { isin: 'ISIN-LEGACY-1', fundName: 'Fund Legacy 1', marketValueReferenceCcy: 1000 },
                            { isin: 'ISIN-LEGACY-2', fundName: 'Fund Legacy 2', marketValueReferenceCcy: 900 }
                        ]
                    }]
                }],
                liabilities: []
            }]
        });
        const stableCode = normalized.assets.find(row => row.displayTicker === 'ISIN-LEGACY-1')?.code;

        seedOcbcStore({ holdings: normalized, holdingsByPortfolio: (normalized)?.holdingsByPortfolio || (normalized)?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P-LEGACY': [
                    { id: 'core', name: 'Core', archived: false },
                    { id: 'satellite', name: 'Satellite', archived: false }
                ]
            }
        } } }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            'P-LEGACY:ISIN-LEGACY-1': 'core'
        } } }));
        global.GM_setValue('ocbc_allocation_order_by_scope', JSON.stringify({
            'assets|P-LEGACY|core': ['P-LEGACY:ISIN-LEGACY-1']
        }));

        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio('Portfolio P-LEGACY');

        const legacySelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for ISIN-LEGACY-1');
        expect(legacySelect.value).toBe('core');

        const savedAssignments = JSON.parse(storage.get('ocbc')).allocation.assignmentByCode;
        expect(savedAssignments['P-LEGACY:ISIN-LEGACY-1']).toBe('core');
        expect(savedAssignments[stableCode]).toBe('core');

        const ocbcWrites = global.GM_setValue.mock.calls
            .filter(([key]) => key === 'ocbc');
        expect(ocbcWrites.length).toBeGreaterThan(0);
    });

    test('OCBC allocation restores legacy hashed assignment/target/order after row gains positionId', () => {
        teardownDom();
        setupDom({ url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=111' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        const initial = exportsModule.normalizeOcbcHoldingsPayload({
            data: [{
                portfolioNo: 'P-POS',
                assets: [{
                    assetClassDesc: 'Managed Funds',
                    subAssets: [{
                        subAssetClassDesc: 'Global Equity',
                        holdings: [
                            { isin: 'ISIN-POS-A', fundCode: 'FUND-POS-A', description: 'Desc A', marketValueReferenceCcy: 1000 },
                            { isin: 'ISIN-POS-B', fundCode: 'FUND-POS-B', description: 'Desc B', marketValueReferenceCcy: 900 }
                        ]
                    }]
                }],
                liabilities: []
            }]
        });

        const initialCodeA = initial.assets.find(row => row.displayTicker === 'ISIN-POS-A')?.code;
        const initialCodeB = initial.assets.find(row => row.displayTicker === 'ISIN-POS-B')?.code;

        const withPosition = exportsModule.normalizeOcbcHoldingsPayload({
            data: [{
                portfolioNo: 'P-POS',
                assets: [{
                    assetClassDesc: 'Managed Funds',
                    subAssets: [{
                        subAssetClassDesc: 'Global Equity',
                        holdings: [
                            { isin: 'ISIN-POS-B', fundCode: 'FUND-POS-B', description: 'Desc B Updated', marketValueReferenceCcy: 900 },
                            { isin: 'ISIN-POS-A', fundCode: 'FUND-POS-A', description: 'Desc A Updated', positionId: 'POS-A', marketValueReferenceCcy: 1000 }
                        ]
                    }]
                }],
                liabilities: []
            }]
        });

        const positionCodeA = withPosition.assets.find(row => row.displayTicker === 'ISIN-POS-A')?.code;
        expect(positionCodeA).toBe('P-POS:POS-A');

        seedOcbcStore({ holdings: withPosition, holdingsByPortfolio: (withPosition)?.holdingsByPortfolio || (withPosition)?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P-POS': [
                    { id: 'core', name: 'Core', archived: false }
                ]
            }
        } } }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            [initialCodeA]: 'core',
            [initialCodeB]: 'core'
        } } }));
        upsertOcbcStore(current => ({
            ...current,
            allocation: {
                ...(current.allocation || {}),
                targetsByScope: { [`assets|P-POS|core|${encodeURIComponent(initialCodeA)}`]: 55 },
                orderByScope: { 'assets|P-POS|core': [initialCodeA, initialCodeB] }
            }
        }));

        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio('Portfolio P-POS');

        const assignmentSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for ISIN-POS-A');
        expect(assignmentSelect.value).toBe('core');

        const targetInput = overlay.querySelector('input[aria-label="Target percentage for instrument ISIN-POS-A in sub-portfolio Core"]');
        expect(targetInput).toBeTruthy();
        expect(targetInput.value).toBe('55.00');

        const coreSectionRow = Array.from(overlay.querySelectorAll('.gpv-ocbc-instrument-header-row'))
            .find(row => row.textContent.includes('Instrument allocation · Core'));
        const coreTable = nextTableFrom(coreSectionRow);
        const orderedCodes = Array.from(coreTable.querySelectorAll('tbody tr td:first-child')).map(cell => cell.textContent.trim());
        expect(orderedCodes.slice(0, 2)).toEqual(['ISIN-POS-A', 'ISIN-POS-B']);

        const savedAssignments = JSON.parse(storage.get('ocbc')).allocation.assignmentByCode;
        expect(savedAssignments[positionCodeA]).toBe('core');
    });

    test('OCBC assignment stays resolved across rename and reorder with stable identifiers', () => {
        teardownDom();
        setupDom({ url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=111' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        const initial = exportsModule.normalizeOcbcHoldingsPayload({
            data: [{
                portfolioNo: 'P-STABLE',
                assets: [{
                    assetClassDesc: 'Managed Funds',
                    subAssets: [{
                        subAssetClassDesc: 'Global Equity',
                        holdings: [
                            { isin: 'ISIN-A', fundCode: 'FUND-A', trancheId: 'TR-A', subCode: 'SUB-A', fundName: 'Fund A', description: 'Desc A', marketValueReferenceCcy: 1000 },
                            { isin: 'ISIN-B', fundCode: 'FUND-B', trancheId: 'TR-B', subCode: 'SUB-B', fundName: 'Fund B', description: 'Desc B', marketValueReferenceCcy: 900 }
                        ]
                    }]
                }],
                liabilities: []
            }]
        });
        const initialCode = initial.assets.find(row => row.displayTicker === 'ISIN-A')?.code;

        const renamedReordered = exportsModule.normalizeOcbcHoldingsPayload({
            data: [{
                portfolioNo: 'P-STABLE',
                assets: [{
                    assetClassDesc: 'Managed Funds',
                    subAssets: [{
                        subAssetClassDesc: 'Global Equity',
                        holdings: [
                            { isin: 'ISIN-B', fundCode: 'FUND-B', trancheId: 'TR-B', subCode: 'SUB-B', fundName: 'Fund B Renamed', description: 'Desc B Updated', marketValueReferenceCcy: 900 },
                            { isin: 'ISIN-A', fundCode: 'FUND-A', trancheId: 'TR-A', subCode: 'SUB-A', fundName: 'Fund A Renamed', description: 'Desc A Updated', marketValueReferenceCcy: 1000 }
                        ]
                    }]
                }],
                liabilities: []
            }]
        });

        seedOcbcStore({ holdings: renamedReordered, holdingsByPortfolio: (renamedReordered)?.holdingsByPortfolio || (renamedReordered)?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P-STABLE': [
                    { id: 'core', name: 'Core', archived: false },
                    { id: 'satellite', name: 'Satellite', archived: false }
                ]
            }
        } } }));
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
            [initialCode]: 'core'
        } } }));

        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio('Portfolio P-STABLE');

        const stableSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for ISIN-A');
        expect(stableSelect.value).toBe('core');
    });

    test('OCBC allocation assignment persists across logout/login-style payload replacement with no positionId', () => {
        teardownDom();
        setupDom({ url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=111' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };

        const exportsModule = require('../goal_portfolio_viewer.user.js');

        const initialPayload = exportsModule.normalizeOcbcHoldingsPayload({
            data: [{
                portfolioNo: 'P-LIFECYCLE',
                assets: [{
                    assetClassDesc: 'Managed Funds',
                    subAssets: [{
                        subAssetClassDesc: 'Global Equity',
                        holdings: [
                            { isin: 'ISIN-LIFE-A', fundCode: 'FUND-LIFE-A', subCode: 'SUB-LIFE-A', trancheId: 'TR-LIFE-A', fundName: 'Fund Life A', description: 'Initial description A', marketValueReferenceCcy: 1000 },
                            { isin: 'ISIN-LIFE-B', fundCode: 'FUND-LIFE-B', subCode: 'SUB-LIFE-B', trancheId: 'TR-LIFE-B', fundName: 'Fund Life B', description: 'Initial description B', marketValueReferenceCcy: 500 }
                        ]
                    }]
                }],
                liabilities: []
            }]
        });

        const initialStableCode = initialPayload.assets.find(row => row.displayTicker === 'ISIN-LIFE-A')?.code;

        seedOcbcStore({ holdings: initialPayload, holdingsByPortfolio: (initialPayload)?.holdingsByPortfolio || (initialPayload)?.data?.holdingsByPortfolio });
        upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), subPortfolios: {
            assets: {
                'P-LIFECYCLE': [
                    { id: 'core', name: 'Core', archived: false },
                    { id: 'satellite', name: 'Satellite', archived: false }
                ]
            }
        } } }));
        if (initialStableCode) {
            upsertOcbcStore(current => ({ ...current, allocation: { ...(current.allocation || {}), assignmentByCode: {
                [initialStableCode]: 'core'
            } } }));
        }

        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio('Portfolio P-LIFECYCLE');
        const firstSessionSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for ISIN-LIFE-A');
        expect(firstSessionSelect.value).toBe('core');

        firstSessionSelect.value = 'satellite';
        firstSessionSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const savedAssignments = JSON.parse(storage.get('ocbc')).allocation.assignmentByCode;
        expect(savedAssignments[initialStableCode]).toBe('satellite');

        const postLoginPayload = exportsModule.normalizeOcbcHoldingsPayload({
            data: [{
                portfolioNo: 'P-LIFECYCLE',
                assets: [{
                    assetClassDesc: 'Managed Funds',
                    subAssets: [{
                        subAssetClassDesc: 'Global Equity',
                        holdings: [
                            { isin: 'ISIN-LIFE-B', fundCode: 'FUND-LIFE-B', subCode: 'SUB-LIFE-B', trancheId: 'TR-LIFE-B', fundName: 'Fund Life B (Login 2)', description: 'Updated description B', marketValueReferenceCcy: 500 },
                            { isin: 'ISIN-LIFE-A', fundCode: 'FUND-LIFE-A', subCode: 'SUB-LIFE-A', trancheId: 'TR-LIFE-A', fundName: 'Fund Life A (Login 2)', description: 'Updated description A', marketValueReferenceCcy: 1000 }
                        ]
                    }]
                }],
                liabilities: []
            }]
        });
        seedOcbcStore({ holdings: postLoginPayload, holdingsByPortfolio: (postLoginPayload)?.holdingsByPortfolio || (postLoginPayload)?.data?.holdingsByPortfolio });

        overlay.remove();
        exportsModule.showOverlay();

        overlay = openOcbcOverviewPortfolio('Portfolio P-LIFECYCLE');
        const secondSessionSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for ISIN-LIFE-A');
        expect(secondSessionSelect.value).toBe('');
    });

    test('readiness overlay auto-updates into portfolio view when data arrives', async () => {
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Fetching Endowus portfolio data');

        const perfPayload = [{
            goalId: 'goal-ready',
            totalInvestmentValue: { amount: 1000 },
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const invPayload = [{
            goalId: 'goal-ready',
            goalName: 'Retirement - Core',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const sumPayload = [{
            goalId: 'goal-ready',
            goalName: 'Retirement - Core',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        const responseFactory = body => ({
            clone: () => responseFactory(body),
            json: () => Promise.resolve(body),
            ok: true,
            status: 200
        });

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await window.fetch('/v1/goals/performance?demo=1').then(response => response.clone().json().catch(() => null));
        global.fetch.mockResolvedValueOnce(responseFactory(perfPayload));
        await window.fetch('/v1/goals/performance');

        global.fetch.mockResolvedValueOnce(responseFactory(invPayload));
        await window.fetch('/v2/goals/investible');

        global.fetch.mockResolvedValueOnce(responseFactory(sumPayload));
        await window.fetch('/v1/goals');

        await new Promise(resolve => setTimeout(resolve, 0));

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Portfolio Viewer');
        expect(overlay.querySelector('.gpv-bucket-card')).toBeTruthy();

        const bucketCard = overlay.querySelector('.gpv-bucket-card');
        expect(bucketCard).toBeTruthy();
        bucketCard.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Retirement');
        expect(overlay.querySelector('#gpv-endowus-view-select')).toBeNull();

        global.fetch.mockResolvedValueOnce(responseFactory([]));
        await window.fetch('/v1/goals/performance');

        global.fetch.mockResolvedValueOnce(responseFactory([]));
        await window.fetch('/v2/goals/investible');

        global.fetch.mockResolvedValueOnce(responseFactory([]));
        await window.fetch('/v1/goals');

        await new Promise(resolve => setTimeout(resolve, 0));

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.querySelector('.gpv-bucket-card')).toBeNull();
        expect(overlay.textContent).not.toContain('Retirement');
        expect(overlay.querySelector('#gpv-endowus-view-select')).toBeNull();

        try {
            global.fetch.mockResolvedValueOnce(responseFactory({ stale: true }));
            await window.fetch('/v1/goals/performance');

            await new Promise(resolve => setTimeout(resolve, 0));

            overlay = document.querySelector('#gpv-overlay');
            expect(overlay.querySelector('.gpv-bucket-card')).toBeNull();
            expect(overlay.textContent).not.toContain('Fetching Endowus portfolio data');
            expect(document.body.textContent).toContain('Latest Endowus refresh failed validation. Showing last synced portfolio data.');
            expect(warnSpy).toHaveBeenCalledWith(
                '[Goal Portfolio Viewer] Ignoring performance payload: Expected array payload for performance'
            );
            expect(warnSpy.mock.calls.filter(([message]) => (
                message === '[Goal Portfolio Viewer] Ignoring performance payload: Expected array payload for performance'
            )).length).toBeGreaterThanOrEqual(2);
        } finally {
            warnSpy.mockRestore();
        }
    });

    test('showOverlay opens Endowus view when intercepted datasets are empty arrays', () => {
        seedEndowusDataset('performance', []);
        seedEndowusDataset('investible', []);
        seedEndowusDataset('summary', []);
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay).toBeTruthy();
        expect(overlay.textContent).toContain('Portfolio Viewer');
        expect(overlay.querySelector('.gpv-bucket-card')).toBeNull();
        expect(overlay.textContent).not.toContain('Preparing data');
    });

    test('showOverlay opens FSM view when holdings response is empty', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [] });

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay).toBeTruthy();
        expect(overlay.textContent).toContain('Portfolio Viewer (FSM)');
        expect(overlay.textContent).toContain('Start from a portfolio overview');
        expect(overlay.textContent).not.toContain('Waiting for FSM holdings response');
    });

    test('FSM portfolio manager supports create, rename, archive and unassigns holdings', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            {
                code: 'AAA',
                subcode: 'AAPL',
                name: 'Fund A',
                productType: 'UNIT_TRUST',
                currentValueLcy: 1200,
                profitValueLcy: 120,
                profitPercentLcy: 10
            },
            {
                code: 'AAA',
                subcode: 'BOND',
                name: 'Fund B',
                productType: 'UNIT_TRUST',
                currentValueLcy: 800,
                profitValueLcy: 40,
                profitPercentLcy: 5
            }
        ] });

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const manageBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Manage portfolios'));
        manageBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const createInput = overlay.querySelector('#gpv-fsm-create-portfolio');
        const createBtn = overlay.querySelector('#gpv-fsm-create-portfolio-btn');
        createInput.value = 'Core';
        createBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const actionSelect = overlay.querySelector('.gpv-fsm-portfolio-list select');
        actionSelect.value = 'rename';
        actionSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        const renameInput = overlay.querySelector('input[aria-label^="Rename portfolio"]');
        const saveBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent === 'Save');
        renameInput.value = 'Core Growth';
        saveBtn.click();

        const portfolios = JSON.parse(storage.get('fsm')).allocation.portfolios;
        const corePortfolio = portfolios.find(item => item.id === 'core');
        expect(corePortfolio.name).toBe('Core Growth');

        overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const rowSelect = overlay.querySelector('table tbody select.gpv-select');
        rowSelect.value = 'core';
        rowSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        let assignments = JSON.parse(storage.get('fsm')).allocation.assignmentByCode;
        expect(assignments['AAA|sub:AAPL']).toBe('core');

        overlay = document.querySelector('#gpv-overlay');
        const archiveSelect = overlay.querySelector('.gpv-fsm-portfolio-list select');
        archiveSelect.value = 'archive';
        archiveSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const archivedPortfolios = JSON.parse(storage.get('fsm')).allocation.portfolios;
        const archived = archivedPortfolios.find(item => item.id === 'core');
        expect(archived.archived).toBe(true);

        assignments = JSON.parse(storage.get('fsm')).allocation.assignmentByCode;
        expect(assignments['AAA|sub:AAPL']).toBe('unassigned');
    });

    test('FSM bulk assignment applies to all filtered holdings', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            {
                code: 'AAA',
                subcode: 'AAPL',
                name: 'Fund A',
                productType: 'UNIT_TRUST',
                currentValueLcy: 1200,
                profitValueLcy: 120,
                profitPercentLcy: 10
            },
            {
                code: 'AAA',
                subcode: 'BOND',
                name: 'Fund B',
                productType: 'UNIT_TRUST',
                currentValueLcy: 800,
                profitValueLcy: 40,
                profitPercentLcy: 5
            }
        ] });

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const manageBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Manage portfolios'));
        manageBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const createInput = overlay.querySelector('#gpv-fsm-create-portfolio');
        const createBtn = overlay.querySelector('#gpv-fsm-create-portfolio-btn');
        createInput.value = 'Core';
        createBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        let applyBulkBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Apply to'));
        expect(applyBulkBtn.className).toContain('gpv-fsm-bulk-apply-btn');
        expect(applyBulkBtn.textContent).toContain('Apply to 0 selected holdings');
        expect(applyBulkBtn.getAttribute('aria-label')).toContain('Apply portfolio assignment to 0 selected holdings');
        expect(applyBulkBtn.disabled).toBe(true);

        overlay = document.querySelector('#gpv-overlay');
        const firstRowCheckbox = overlay.querySelector('table tbody tr td[data-col="select"] input[type="checkbox"]');
        firstRowCheckbox.checked = true;
        firstRowCheckbox.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        applyBulkBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Apply to'));
        expect(applyBulkBtn.textContent).toContain('Apply to 1 selected holding');
        expect(applyBulkBtn.getAttribute('aria-label')).toContain('Apply portfolio assignment to 1 selected holding');
        expect(applyBulkBtn.disabled).toBe(false);

        overlay = document.querySelector('#gpv-overlay');
        const selectAll = overlay.querySelector('input[aria-label="Select all filtered holdings"]');
        selectAll.checked = true;
        selectAll.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        applyBulkBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Apply to'));
        expect(applyBulkBtn.textContent).toContain('Apply to 2 selected holdings');
        expect(applyBulkBtn.getAttribute('aria-label')).toContain('Apply portfolio assignment to 2 selected holdings');
        expect(applyBulkBtn.disabled).toBe(false);
        const bulkRow = applyBulkBtn.parentElement;
        const bulkSelect = bulkRow.querySelector('select.gpv-select');
        bulkSelect.value = 'core';
        bulkSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
        applyBulkBtn.click();

        const assignments = JSON.parse(storage.get('fsm')).allocation.assignmentByCode;
        expect(assignments['AAA|sub:AAPL']).toBe('core');
        expect(assignments['AAA|sub:BOND']).toBe('core');
    });

    test('FSM fixed clears target value and disables input', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ] });
        storage.set('fsm_target_pct_AAA|sub:AAPL', 35);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const fixedCheckbox = overlay.querySelector('input[aria-label^="Fixed allocation"]');
        fixedCheckbox.checked = true;
        fixedCheckbox.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        const targetInput = overlay.querySelector('table tbody tr input.gpv-target-input');
        expect(JSON.parse(storage.get('fsm')).allocation.targetsByCode['AAA|sub:AAPL']).toBeUndefined();
        expect(JSON.parse(storage.get('fsm')).allocation.fixedByCode['AAA|sub:AAPL']).toBe(true);
        expect(targetInput.disabled).toBe(true);
    });

    test('FSM migrated legacy target can be cleared without falling back', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_listValues = jest.fn(() => Array.from(storage.keys()));
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;
        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ] });
        upsertFsmStore(current => ({ ...current, allocation: { ...(current.allocation || {}), targetsByCode: { AAA: 35 } } }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllHoldingsButton = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        expect(viewAllHoldingsButton).toBeTruthy();
        viewAllHoldingsButton.click();

        overlay = document.querySelector('#gpv-overlay');
        let targetInput = overlay.querySelector('table tbody tr input.gpv-target-input');
        expect(targetInput.value).toBe('35.00');

        targetInput.value = '';
        targetInput.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        targetInput = overlay.querySelector('table tbody tr input.gpv-target-input');
        expect(JSON.parse(storage.get('fsm')).allocation.targetsByCode.AAA).toBe(35);
        expect(JSON.parse(storage.get('fsm')).allocation.targetsByCode['AAA|sub:AAPL']).toBeUndefined();
        expect(targetInput.value).toBe('35.00');
    });

    test('FSM migration preserves legacy target entries when normalized target map exists', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;
        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            { code: 'ESG003', subcode: 'ESG3', name: 'Growth Fund', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ] });
        upsertFsmStore(current => ({ ...current, allocation: { ...(current.allocation || {}), targetsByCode: { 'ESG003|sub:ESG3': 35 } } }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllHoldingsButton = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        if (viewAllHoldingsButton) {
            viewAllHoldingsButton.click();
        }

        overlay = document.querySelector('#gpv-overlay');
        const targetInput = overlay.querySelector('table tbody tr input.gpv-target-input');
        expect(targetInput && targetInput.value).toBe('35.00');

        const storedFsm = JSON.parse(storage.get('fsm'));
        expect(storedFsm?.allocation?.targetsByCode?.['ESG003|sub:ESG3']).toBe(35);
        expect(storage.has('fsm_target_pct_ESG003|sub:ESG3')).toBe(false);
    });

    test('FSM migrated legacy fixed flag can be unchecked without falling back', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;
        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ] });
        upsertFsmStore(current => ({ ...current, allocation: { ...(current.allocation || {}), fixedByCode: { AAA: true } } }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllHoldingsButton = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        expect(viewAllHoldingsButton).toBeTruthy();
        viewAllHoldingsButton.click();

        overlay = document.querySelector('#gpv-overlay');
        let fixedCheckbox = overlay.querySelector('input[aria-label^="Fixed allocation"]');
        expect(fixedCheckbox.checked).toBe(true);

        fixedCheckbox.checked = false;
        fixedCheckbox.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        fixedCheckbox = overlay.querySelector('input[aria-label^="Fixed allocation"]');
        expect(JSON.parse(storage.get('fsm')).allocation.fixedByCode.AAA).toBe(true);
        expect(JSON.parse(storage.get('fsm')).allocation.fixedByCode['AAA|sub:AAPL']).toBe(false);
        expect(fixedCheckbox.checked).toBe(false);
    });

    test('FSM target input clamps finite out-of-range values before persisting', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ] });

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const targetInput = overlay.querySelector('table tbody tr input.gpv-target-input');
        targetInput.value = '150';
        targetInput.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        const refreshedTargetInput = overlay.querySelector('table tbody tr input.gpv-target-input');
        expect(refreshedTargetInput.value).toBe('100.00');
        expect(JSON.parse(storage.get('fsm')).allocation.targetsByCode['AAA|sub:AAPL']).toBe(100);

        refreshedTargetInput.value = '-5';
        refreshedTargetInput.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        const clampedLowTargetInput = overlay.querySelector('table tbody tr input.gpv-target-input');
        expect(clampedLowTargetInput.value).toBe('0.00');
        expect(JSON.parse(storage.get('fsm')).allocation.targetsByCode['AAA|sub:AAPL']).toBe(0);
    });

    test('FSM target input does not persist non-finite browser values', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ] });

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const targetInput = overlay.querySelector('table tbody tr input.gpv-target-input');
        targetInput.value = 'Infinity';
        targetInput.dispatchEvent(new window.Event('change', { bubbles: true }));

        expect(JSON.parse(storage.get('fsm')).allocation.targetsByCode['AAA|sub:AAPL']).toBeUndefined();
    });

    test('FSM inline edits schedule sync updates', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ] });

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        const scheduleSpy = jest.spyOn(exportsModule.SyncManager, 'scheduleSyncOnChange').mockImplementation(() => {});
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const targetInput = overlay.querySelector('table tbody tr input.gpv-target-input');
        targetInput.value = '35';
        targetInput.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        const fixedCheckbox = overlay.querySelector('input[aria-label^="Fixed allocation"]');
        fixedCheckbox.checked = true;
        fixedCheckbox.dispatchEvent(new window.Event('change', { bubbles: true }));

        expect(scheduleSpy).toHaveBeenCalledWith('fsm-target-update');
        expect(scheduleSpy).toHaveBeenCalledWith('fsm-fixed-update');
    });

    test('OCBC allocation edits schedule sync for sub-portfolios assignments and targets', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                this._method = method;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedOcbcStore({ holdings: {
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        }, holdingsByPortfolio: ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        })?.holdingsByPortfolio || ({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        })?.data?.holdingsByPortfolio });

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        const scheduleSpy = jest.spyOn(exportsModule.SyncManager, 'scheduleSyncOnChange').mockImplementation(() => {});
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = openOcbcOverviewPortfolio();

        const subPortfolioInput = overlay.querySelector('input[placeholder="Sub-portfolio name"]');
        subPortfolioInput.value = 'Core';
        const createSubPortfolioBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Create');
        createSubPortfolioBtn.dispatchEvent(new window.Event('click', { bubbles: true }));

        let refreshedOverlay = document.querySelector('#gpv-overlay');
        const subPortfolioSelect = Array.from(refreshedOverlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for EQ1');
        subPortfolioSelect.value = 'core';
        subPortfolioSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        refreshedOverlay = document.querySelector('#gpv-overlay');
        const subTargetInput = refreshedOverlay.querySelector('input[aria-label="Target percentage for portfolio P-1 sub-portfolio Core"]');
        subTargetInput.value = '60';
        subTargetInput.dispatchEvent(new window.Event('change', { bubbles: true }));

        refreshedOverlay = document.querySelector('#gpv-overlay');
        const instrumentTargetInput = refreshedOverlay.querySelector('input[aria-label="Target percentage for instrument EQ1 in sub-portfolio Core"]');
        instrumentTargetInput.value = '55';
        instrumentTargetInput.dispatchEvent(new window.Event('change', { bubbles: true }));

        expect(scheduleSpy).toHaveBeenCalledWith('ocbc-sub-portfolios-update');
        expect(scheduleSpy).toHaveBeenCalledWith('ocbc-assignment-update');
        expect(scheduleSpy).toHaveBeenCalledWith('ocbc-target-update');
    });

    test('Endowus planning warning refreshes after target edits resolve the remainder', () => {
        teardownDom();
        setupDom({ url: 'https://app.sg.endowus.com/dashboard' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedEndowusDataset('summary', [
            { goalId: 'f1', goalName: 'Investment - Fixed One', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' },
            { goalId: 'f2', goalName: 'Investment - Fixed Two', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' },
            { goalId: 'f3', goalName: 'Investment - Fixed Three', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' },
            { goalId: 't1', goalName: 'Investment - Target One', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' },
            { goalId: 't2', goalName: 'Investment - Target Two', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' },
            { goalId: 't3', goalName: 'Investment - Target Three', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' },
            { goalId: 'blank', goalName: 'Investment - Blank', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' }
        ]);
        seedEndowusDataset('investible', [
            { goalId: 'f1', goalName: 'Investment - Fixed One', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 100 } } },
            { goalId: 'f2', goalName: 'Investment - Fixed Two', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 150 } } },
            { goalId: 'f3', goalName: 'Investment - Fixed Three', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 150 } } },
            { goalId: 't1', goalName: 'Investment - Target One', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 150 } } },
            { goalId: 't2', goalName: 'Investment - Target Two', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 150 } } },
            { goalId: 't3', goalName: 'Investment - Target Three', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 100 } } },
            { goalId: 'blank', goalName: 'Investment - Blank', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 200 } } }
        ]);
        seedEndowusDataset('performance', [
            { goalId: 'f1', totalCumulativeReturn: { amount: 0 }, simpleRateOfReturnPercent: 0 },
            { goalId: 'f2', totalCumulativeReturn: { amount: 0 }, simpleRateOfReturnPercent: 0 },
            { goalId: 'f3', totalCumulativeReturn: { amount: 0 }, simpleRateOfReturnPercent: 0 },
            { goalId: 't1', totalCumulativeReturn: { amount: 0 }, simpleRateOfReturnPercent: 0 },
            { goalId: 't2', totalCumulativeReturn: { amount: 0 }, simpleRateOfReturnPercent: 0 },
            { goalId: 't3', totalCumulativeReturn: { amount: 0 }, simpleRateOfReturnPercent: 0 },
            { goalId: 'blank', totalCumulativeReturn: { amount: 0 }, simpleRateOfReturnPercent: 0 }
        ]);
        upsertEndowusStore({ allocation: {
            goalFixed: { f1: true, f2: true, f3: true },
            goalTargets: { t1: 10, t2: 10 },
            goalBuckets: {},
            clearedGoalBuckets: {}
        } });

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const bucketCard = Array.from(overlay.querySelectorAll('.gpv-bucket-card')).find(card =>
            card.textContent.includes('Investment')
        );
        bucketCard.click();

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Target total is 60.00% (40.00% unallocated)');
        expect(overlay.querySelector('.gpv-detail-header .gpv-health-badge')?.textContent).toBe('Needs Setup');
        let detailHeader = overlay.querySelector('.gpv-detail-header');
        let planningPanel = overlay.querySelector('.gpv-planning-panel');
        expect(detailHeader?.nextElementSibling).toBe(planningPanel);

        const targetInput = overlay.querySelector('input.gpv-target-input[data-goal-id="t3"]');
        targetInput.value = '10';
        targetInput.dispatchEvent(new window.Event('input', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).not.toContain('Target total is 60.00% (40.00% unallocated)');
        expect(overlay.querySelector('.gpv-detail-header .gpv-health-badge')?.textContent).toBe('Healthy');
        detailHeader = overlay.querySelector('.gpv-detail-header');
        planningPanel = overlay.querySelector('.gpv-planning-panel');
        expect(detailHeader?.nextElementSibling).toBe(planningPanel);
    });

    test('Endowus projected investment refresh is debounced while typing', () => {
        jest.useFakeTimers();
        teardownDom();
        setupDom({ url: 'https://app.sg.endowus.com/dashboard' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedEndowusDataset('summary', [
            { goalId: 'g1', goalName: 'Investment - Core', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' }
        ]);
        seedEndowusDataset('investible', [
            { goalId: 'g1', goalName: 'Investment - Core', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 1000 } } }
        ]);
        seedEndowusDataset('performance', [
            { goalId: 'g1', totalCumulativeReturn: { amount: 0 }, simpleRateOfReturnPercent: 0 }
        ]);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const bucketCard = Array.from(overlay.querySelectorAll('.gpv-bucket-card')).find(card =>
            card.textContent.includes('Investment')
        );
        bucketCard.click();

        overlay = document.querySelector('#gpv-overlay');
        const projectionInput = overlay.querySelector('input.gpv-projected-input');
        projectionInput.value = '1';
        projectionInput.dispatchEvent(new window.Event('input', { bubbles: true }));
        jest.advanceTimersByTime(200);
        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).not.toContain('Projected Investment: SGD\u00A01.00');

        projectionInput.value = '1000';
        projectionInput.dispatchEvent(new window.Event('input', { bubbles: true }));
        jest.advanceTimersByTime(249);
        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).not.toContain('Projected Investment: SGD\u00A01.00');
        expect(overlay.textContent).not.toContain('Projected Investment: SGD\u00A01,000.00');

        jest.advanceTimersByTime(1);
        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).not.toContain('Projected Investment: SGD\u00A01.00');
        expect(overlay.textContent).toContain('Projected Investment: SGD\u00A01,000.00');
    });

    test('FSM row allocation and drift use selected scope totals', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            {
                code: 'AAA',
                subcode: 'AAPL',
                name: 'Fund A',
                productType: 'UNIT_TRUST',
                currentValueLcy: 1200,
                profitValueLcy: 120,
                profitPercentLcy: 10
            },
            {
                code: 'BBB',
                subcode: 'BOND',
                name: 'Fund B',
                productType: 'UNIT_TRUST',
                currentValueLcy: 800,
                profitValueLcy: 40,
                profitPercentLcy: 5
            }
        ] });
        upsertFsmStore(current => ({
            ...current,
            allocation: {
                ...(current.allocation || {}),
                targetsByCode: { 'AAA|sub:AAPL': 60 },
                portfolios: [{ id: 'core', name: 'Core', archived: false }],
                assignmentByCode: { 'AAA|sub:AAPL': 'core', 'BBB|sub:BOND': 'unassigned' }
            }
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const coreCard = Array.from(overlay.querySelectorAll('.gpv-fsm-overview-card')).find(card =>
            card.textContent.includes('Core')
        );
        coreCard.click();

        overlay = document.querySelector('#gpv-overlay');
        let firstRow = overlay.querySelector('table tbody tr');
        expect(firstRow.querySelector('td[data-col="ticker"]').textContent.trim()).toBe('AAPL');
        expect(firstRow.querySelector('td[data-col="profit"]').textContent.trim()).toBe('+10.00% (+SGD 120.00)');
        expect(firstRow.querySelector('td[data-col="current"]').textContent.trim()).toBe('100.00%');
        expect(firstRow.querySelector('td[data-col="drift"]').textContent.trim()).toBe('+66.67% (+SGD\u00A0480.00)');

        const topBarButtons = overlay.querySelector('.gpv-header-buttons');
        const backBtn = Array.from(topBarButtons.querySelectorAll('button')).find(btn => btn.textContent.includes('Back to portfolios'));
        backBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        firstRow = overlay.querySelector('table tbody tr');
        expect(firstRow.querySelector('td[data-col="ticker"]').textContent.trim()).toBe('AAPL');
        expect(firstRow.querySelector('td[data-col="profit"]').textContent.trim()).toBe('+10.00% (+SGD 120.00)');
        expect(firstRow.querySelector('td[data-col="current"]').textContent.trim()).toBe('60.00%');
        expect(firstRow.querySelector('td[data-col="drift"]')).toBeNull();

        const driftSummaryCard = Array.from(overlay.querySelectorAll('.gpv-summary-card')).find(card =>
            card.textContent.includes('Drift:')
        );
        expect(driftSummaryCard).toBeFalsy();
    });

    test('FSM planning panel renders trigger-side funding context', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            {
                code: 'AAA',
                subcode: 'AAPL',
                name: 'Fund A',
                productType: 'UNIT_TRUST',
                currentValueLcy: 1200,
                profitValueLcy: 120,
                profitPercentLcy: 10
            },
            {
                code: 'BBB',
                subcode: 'BOND',
                name: 'Fund B',
                productType: 'UNIT_TRUST',
                currentValueLcy: 800,
                profitValueLcy: 40,
                profitPercentLcy: 5
            }
        ] });
        upsertFsmStore(current => ({
            ...current,
            allocation: { ...(current.allocation || {}), targetsByCode: { 'AAA|sub:AAPL': 10, 'BBB|sub:BOND': 90 } }
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Planning');

        const filterInput = overlay.querySelector('input.gpv-fsm-filter-input');
        filterInput.value = 'BO';
        filterInput.dispatchEvent(new window.Event('input', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Planning');
    });

    test('FSM overview and detail display profit metrics', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            {
                code: 'AAA',
                subcode: 'AAPL',
                name: 'Fund A',
                productType: 'UNIT_TRUST',
                currentValueLcy: 1200,
                profitValueLcy: 120,
                profitPercentLcy: 10
            },
            {
                code: 'BBB',
                subcode: 'BOND',
                name: 'Fund B',
                productType: 'UNIT_TRUST',
                currentValueLcy: 800,
                profitValueLcy: 40,
                profitPercentLcy: 5
            }
        ] });

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Profit: +8.70% (+SGD 160.00)');
        const overviewCards = Array.from(overlay.querySelectorAll('.gpv-fsm-overview-card'));
        const unassignedCard = overviewCards.find(card => card.textContent.includes('Unassigned'));
        expect(unassignedCard.textContent).toContain('Profit');
        expect(unassignedCard.textContent).toContain('+8.70% (+SGD 160.00)');

        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Fixed:');
        const profitHeader = Array.from(overlay.querySelectorAll('th')).find(th => th.textContent.trim() === 'Profit');
        expect(profitHeader).toBeTruthy();
        const firstRow = overlay.querySelector('table tbody tr');
        expect(firstRow.querySelector('td[data-col="profit"]').textContent.trim()).toBe('+10.00% (+SGD 120.00)');
    });

    test('FSM health treats fixed holdings as assigned coverage', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ] });
        upsertFsmStore(current => ({ ...current, allocation: { ...(current.allocation || {}), fixedByCode: { 'AAA|sub:AAPL': true } } }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay).toBeTruthy();
        const unassignedCard = Array.from(overlay.querySelectorAll('.gpv-fsm-overview-card')).find(card =>
            card.textContent.includes('Unassigned')
        );
        expect(unassignedCard).toBeTruthy();
        expect(unassignedCard.textContent).toContain('Needs Setup');
        expect(unassignedCard.textContent).not.toMatch(/Needs Setup \(\d+\)/);
        expect(unassignedCard.textContent).toContain('0.00%');
        expect(unassignedCard.textContent).not.toContain('Target total is');
    });

    test('FSM all-zero targets stay unflagged until allocation setup starts', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 600 },
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'UNIT_TRUST', currentValueLcy: 400 }
        ] });
        storage.set('fsm_target_pct_AAA|sub:AAPL', 0);
        storage.set('fsm_target_pct_BBB|sub:BOND', 0);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay).toBeTruthy();
        expect(overlay.textContent).not.toContain('Target total is 0.00%');
        expect(overlay.textContent).toContain('2 holdings unassigned to a portfolio');
    });

    test('FSM needs attention only surfaces red drift, not yellow drift', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 800 },
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'UNIT_TRUST', currentValueLcy: 1700 }
        ] });
        upsertFsmStore(current => ({
            ...current,
            allocation: { ...(current.allocation || {}), targetsByCode: { 'AAA|sub:AAPL': 40, 'BBB|sub:BOND': 60 } }
        }));

        let exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).not.toContain('Large allocation drift across this portfolio scope');

        teardownDom();
        jest.resetModules();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });
        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;
        global.XMLHttpRequest = FakeXHR;
        window.__GPV_DISABLE_AUTO_INIT = true;

        seedFsmStore({ holdings: [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 800 },
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'UNIT_TRUST', currentValueLcy: 1700 }
        ] });
        upsertFsmStore(current => ({
            ...current,
            allocation: { ...(current.allocation || {}), targetsByCode: { 'AAA|sub:AAPL': 80, 'BBB|sub:BOND': 20 } }
        }));

        exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Large allocation drift across this portfolio scope');
    });

    test('FSM profit display falls back when holdings are missing profit fields', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            {
                code: 'AAA',
                subcode: 'AAPL',
                name: 'Fund A',
                productType: 'UNIT_TRUST',
                currentValueLcy: 1200,
                profitValueLcy: 120
            },
            {
                code: 'BBB',
                subcode: 'BOND',
                name: 'Fund B',
                productType: 'UNIT_TRUST',
                currentValueLcy: 800
            }
        ] });

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Profit: -');

        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const rows = Array.from(overlay.querySelectorAll('table tbody tr'));
        const rowByTicker = rows.reduce((acc, row) => {
            const ticker = row.querySelector('td[data-col="ticker"]').textContent.trim();
            acc[ticker] = row;
            return acc;
        }, {});
        expect(rowByTicker.AAPL.querySelector('td[data-col="profit"]').textContent.trim()).toBe('+11.11% (+SGD 120.00)');
        expect(rowByTicker.BOND.querySelector('td[data-col="profit"]').textContent.trim()).toBe('-');
    });

    test('FSM detail filter input keeps focus while typing', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 },
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'BOND', currentValueLcy: 800 }
        ] });

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const filterInput = overlay.querySelector('input.gpv-fsm-filter-input');
        filterInput.focus();
        filterInput.value = 'BO';
        filterInput.setSelectionRange(2, 2);
        filterInput.dispatchEvent(new window.Event('input', { bubbles: true }));

        const updatedOverlay = document.querySelector('#gpv-overlay');
        const updatedInput = updatedOverlay.querySelector('input.gpv-fsm-filter-input');
        expect(updatedInput).toBe(filterInput);
        expect(updatedInput.value).toBe('BO');
        expect(document.activeElement).toBe(updatedInput);
        expect(updatedInput.selectionStart).toBe(2);
        expect(updatedOverlay.textContent).toContain('BOND');
        expect(updatedOverlay.textContent).not.toContain('AAPL');
    });

    test('FSM detail view can return to portfolio overview and reset detail controls', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 },
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'BOND', currentValueLcy: 800 }
        ] });

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.querySelector('table')).toBeTruthy();
        expect(overlay.querySelector('select[aria-label="Select portfolio scope"]')).toBeNull();
        const topBarButtons = overlay.querySelector('.gpv-header-buttons');
        const backButtons = Array.from(topBarButtons.querySelectorAll('button')).filter(btn => btn.textContent.includes('Back to portfolios'));
        expect(backButtons.filter(btn => !btn.hidden)).toHaveLength(1);
        const backBtn = backButtons[0];
        expect(backBtn.hidden).toBe(false);

        const detailFilterInput = overlay.querySelector('input.gpv-fsm-filter-input');
        detailFilterInput.value = 'BO';
        detailFilterInput.dispatchEvent(new window.Event('input', { bubbles: true }));

        const rowCheckbox = overlay.querySelector('table tbody tr td[data-col="select"] input[type="checkbox"]');
        rowCheckbox.checked = true;
        rowCheckbox.dispatchEvent(new window.Event('change', { bubbles: true }));

        const applyBulkBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Apply to'));
        expect(applyBulkBtn.textContent).toContain('Apply to 1 selected holding');

        expect(overlay.querySelector('.gpv-fsm-filter-toolbar button')).toBeNull();
        backBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const overviewTopBarButtons = overlay.querySelector('.gpv-header-buttons');
        const overviewBackButtons = Array.from(overviewTopBarButtons.querySelectorAll('button')).filter(btn => btn.textContent.includes('Back to portfolios'));
        expect(overviewBackButtons.filter(btn => !btn.hidden)).toHaveLength(0);
        const overviewBackBtn = overviewBackButtons[0];
        expect(overviewBackBtn.hidden).toBe(true);
        expect(overlay.querySelector('.gpv-fsm-overview-grid')).toBeTruthy();
        expect(overlay.querySelector('table')).toBeNull();

        const reopenViewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        reopenViewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const resetFilterInput = overlay.querySelector('input.gpv-fsm-filter-input');
        expect(resetFilterInput.value).toBe('');
        const resetApplyBulkBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Apply to'));
        expect(resetApplyBulkBtn.textContent).toContain('Apply to 0 selected holdings');
    });

    test('FSM overview keeps hidden detail toolbar out of tab order and restores visible focus', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ] });

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const filterInput = overlay.querySelector('input.gpv-fsm-filter-input');
        expect(filterInput.disabled).toBe(false);
        filterInput.focus();

        const topBarButtons = overlay.querySelector('.gpv-header-buttons');
        const backBtn = Array.from(topBarButtons.querySelectorAll('button')).find(btn => btn.textContent.includes('Back to portfolios'));
        backBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const hiddenFilterInput = overlay.querySelector('input.gpv-fsm-filter-input');
        const firstOverviewCard = overlay.querySelector('.gpv-fsm-overview-card');
        expect(hiddenFilterInput.disabled).toBe(true);
        expect(document.activeElement).toBe(firstOverviewCard);
    });

    test('FSM keyboard navigation moves focus into detail mode', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        setupStorage();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;

        seedFsmStore({ holdings: [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ] });

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const openAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        openAllBtn.focus();
        openAllBtn.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        openAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const filterInput = overlay.querySelector('input.gpv-fsm-filter-input');
        expect(document.activeElement).toBe(filterInput);
    });

    test('startup cleanup removes unknown gpv and sync keys but preserves allowed and unrelated keys', () => {
        storage.set('gpv_shell_compare_selection', 'stale');
        storage.set('gpv_unknown_flag', 'stale');
        storage.set('gpv_bucket_mode', 'allocation');
        storage.set('gpv_performance_goal-1', JSON.stringify({ fetchedAt: Date.now(), response: {} }));
        storage.set('gpv_collapse_bucket|goal|performance', true);
        storage.set('sync_unknown_key', 'stale');
        storage.set('sync_server_url', 'https://legacy.example.com');
        storage.set('endowus', '{}');
        storage.set('goal_target_pct_goal-1', 30);
        global.GM_listValues = jest.fn(() => Array.from(storage.keys()));

        require('../goal_portfolio_viewer.user.js');

        expect(storage.has('gpv_shell_compare_selection')).toBe(false);
        expect(storage.has('gpv_unknown_flag')).toBe(false);
        expect(storage.has('sync_unknown_key')).toBe(false);
        expect(storage.has('gpv_bucket_mode')).toBe(true);
        expect(storage.has('gpv_performance_goal-1')).toBe(true);
        expect(storage.has('gpv_collapse_bucket|goal|performance')).toBe(true);
        expect(storage.has('endowus')).toBe(true);
        expect(storage.has('goal_target_pct_goal-1')).toBe(true);
    });

    test('startup cleanup skips non-string GM_listValues entries and still removes stale string keys', () => {
        storage.set('gpv_shell_compare_selection', 'stale');
        storage.set('sync_unknown_key', 'stale');
        global.GM_listValues = jest.fn(() => [null, 123, {}, 'gpv_shell_compare_selection', 'sync_unknown_key']);

        expect(() => {
            require('../goal_portfolio_viewer.user.js');
        }).not.toThrow();

        expect(storage.has('gpv_shell_compare_selection')).toBe(false);
        expect(storage.has('sync_unknown_key')).toBe(false);
    });

    test('startup cleanup no-ops when GM_listValues is unavailable', () => {
        storage.set('gpv_shell_compare_selection', 'stale');
        delete global.GM_listValues;

        expect(() => {
            require('../goal_portfolio_viewer.user.js');
        }).not.toThrow();

        expect(storage.has('gpv_shell_compare_selection')).toBe(true);
    });

    test('startup does not throw when GM_listValues throws and stale keys are preserved', () => {
        storage.set('gpv_shell_compare_selection', 'stale');
        storage.set('sync_unknown_key', 'stale');
        global.GM_listValues = jest.fn(() => {
            throw new Error('enumeration failed');
        });
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        expect(() => {
            require('../goal_portfolio_viewer.user.js');
        }).not.toThrow();

        expect(storage.get('gpv_shell_compare_selection')).toBe('stale');
        expect(storage.get('sync_unknown_key')).toBe('stale');
        expect(warnSpy).toHaveBeenCalledWith(
            '[Goal Portfolio Viewer] Unable to enumerate storage keys for stale cleanup:',
            expect.any(Error)
        );

        warnSpy.mockRestore();
    });

});
