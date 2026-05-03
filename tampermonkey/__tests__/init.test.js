const { setupDom, teardownDom } = require('./helpers/domSetup');

describe('initialization and URL monitoring', () => {
    let storage;

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
        if (window.__gpvUrlMonitorCleanup) {
            window.__gpvUrlMonitorCleanup();
        }
        jest.useRealTimers();
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


    test('startUrlMonitoring shows button on FSM investments route', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

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

        global.GM_setValue('api_performance', JSON.stringify(performanceData));
        global.GM_setValue('api_investible', JSON.stringify(investibleData));
        global.GM_setValue('api_summary', JSON.stringify(summaryData));
        global.alert = jest.fn();

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

        global.GM_setValue('api_performance', JSON.stringify(performanceData));
        global.GM_setValue('api_investible', JSON.stringify(investibleData));
        global.GM_setValue('api_summary', JSON.stringify(summaryData));
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const bucketManageBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Buckets'));
        expect(bucketManageBtn).toBeTruthy();
        expect(bucketManageBtn.className).toContain('gpv-bucket-manage-btn');
        bucketManageBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const bucketInput = overlay.querySelector('.gpv-bucket-manager-input');
        expect(bucketInput).toBeTruthy();
        bucketInput.value = 'Wealth Builder';
        bucketInput.dispatchEvent(new window.Event('blur', { bubbles: true }));

        expect(JSON.parse(storage.get('endowus')).goalBuckets.goal1).toBe('Wealth Builder');
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

        global.GM_setValue('api_performance', JSON.stringify(performanceData));
        global.GM_setValue('api_investible', JSON.stringify(investibleData));
        global.GM_setValue('api_summary', JSON.stringify(summaryData));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        expect(JSON.parse(storage.get('endowus')).goalBuckets.goal1).toBe('Retirement');
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

        global.GM_setValue('api_performance', JSON.stringify(performanceData));
        global.GM_setValue('api_investible', JSON.stringify(investibleData));
        global.GM_setValue('api_summary', JSON.stringify(summaryData));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const bucketManageBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Buckets'));
        bucketManageBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const bucketInput = overlay.querySelector('.gpv-bucket-manager-input');
        expect(bucketInput.value).toBe('Retirement');
        bucketInput.dispatchEvent(new window.Event('blur', { bubbles: true }));

        expect(JSON.parse(storage.get('endowus')).goalBuckets.goal1).toBe('Retirement');
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

        global.GM_setValue('api_performance', JSON.stringify(performanceData));
        global.GM_setValue('api_investible', JSON.stringify(investibleData));
        global.GM_setValue('api_summary', JSON.stringify(summaryData));
        global.GM_setValue('goal_bucket_name_goal1', 'Legacy Override');
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const bucketManageBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Buckets'));
        bucketManageBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const bucketInput = overlay.querySelector('.gpv-bucket-manager-input');
        expect(bucketInput).toBeTruthy();
        bucketInput.value = '';
        bucketInput.dispatchEvent(new window.Event('blur', { bubbles: true }));

        expect(JSON.parse(storage.get('endowus')).goalBuckets.goal1).toBeUndefined();
        expect(JSON.parse(storage.get('endowus')).clearedGoalBuckets.goal1).toBe(true);
        expect(bucketInput.value).toBe('Retirement');

        exportsModule.showOverlay();
        overlay = document.querySelector('#gpv-overlay');
        const reopenedBucketManageBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Buckets'));
        reopenedBucketManageBtn.click();
        overlay = document.querySelector('#gpv-overlay');
        const reopenedInput = overlay.querySelector('.gpv-bucket-manager-input');
        expect(JSON.parse(storage.get('endowus')).goalBuckets.goal1).toBeUndefined();
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

        global.GM_setValue('api_performance', JSON.stringify(performanceData));
        global.GM_setValue('api_investible', JSON.stringify(investibleData));
        global.GM_setValue('api_summary', JSON.stringify(summaryData));
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

    test('shared modal focus trap keeps in-modal .gpv-select focused on outside focusin', () => {
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

        global.GM_setValue('api_performance', JSON.stringify(performanceData));
        global.GM_setValue('api_investible', JSON.stringify(investibleData));
        global.GM_setValue('api_summary', JSON.stringify(summaryData));
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const select = overlay?.querySelector('.gpv-select');
        expect(select).toBeTruthy();

        select.focus();
        expect(document.activeElement).toBe(select);

        document.body.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
        expect(document.activeElement).toBe(select);
    });

    test('showOverlay renders FSM portfolio overview on FSM route', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();

        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Alpha', productType: 'UNIT_TRUST', currentValueLcy: 1000 }
        ]));
        storage.set('fsm_target_pct_AAA|sub:AAPL', 50);

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
        expect(overviewCard.textContent).toContain('100.00%');

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

        global.GM_setValue('api_performance', JSON.stringify(performanceData));
        global.GM_setValue('api_investible', JSON.stringify(investibleData));
        global.GM_setValue('api_summary', JSON.stringify(summaryData));
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const content = overlay?.querySelector('.gpv-content');
        const select = overlay?.querySelector('.gpv-select');
        const bucketValue = Array.from(select?.options || []).find(option => option.value !== 'SUMMARY')?.value;
        expect(content).toBeTruthy();
        expect(select).toBeTruthy();
        expect(bucketValue).toBeTruthy();

        content.scrollTo = jest.fn();
        select.value = bucketValue;
        select.dispatchEvent(new window.Event('change', { bubbles: true }));

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

        global.GM_setValue('api_performance', JSON.stringify(performanceData));
        global.GM_setValue('api_investible', JSON.stringify(investibleData));
        global.GM_setValue('api_summary', JSON.stringify(summaryData));
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

        global.GM_setValue('api_performance', JSON.stringify(performanceData));
        global.GM_setValue('api_investible', JSON.stringify(investibleData));
        global.GM_setValue('api_summary', JSON.stringify(summaryData));
        global.GM_setValue('goal_target_pct_goal1', 10);
        global.GM_setValue('goal_target_pct_goal2', 90);
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

        global.fetch.mockImplementation(() => new Promise(() => {}));
        global.GM_setValue('api_performance', JSON.stringify(performanceData));
        global.GM_setValue('api_investible', JSON.stringify(investibleData));
        global.GM_setValue('api_summary', JSON.stringify(summaryData));
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const select = overlay?.querySelector('.gpv-select');
        const bucketValue = Array.from(select?.options || []).find(option => option.value !== 'SUMMARY')?.value;
        select.value = bucketValue;
        select.dispatchEvent(new window.Event('change', { bubbles: true }));

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

        global.GM_setValue('api_performance', JSON.stringify(performanceData));
        global.GM_setValue('api_investible', JSON.stringify(investibleData));
        global.GM_setValue('api_summary', JSON.stringify(summaryData));
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
            global.GM_setValue('api_performance', JSON.stringify([{ goalId: 'goal1', totalCumulativeReturn: { amount: 100 }, simpleRateOfReturnPercent: 0.1 }]));
            global.GM_setValue('api_investible', JSON.stringify([{ goalId: 'goal1', goalName: 'Goal One', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 1000 } } }]));
            global.GM_setValue('api_summary', JSON.stringify([{ goalId: 'goal1', goalName: 'Goal One', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' }]));
        };
        const mountFsmData = () => {
            global.GM_setValue('api_fsm_holdings', JSON.stringify([{ code: 'AAA', subcode: 'AAPL', name: 'Fund A', currentValueLcy: 1234.56 }]));
        };
        const mountOcbcData = () => {
            global.GM_setValue('api_ocbc_holdings', JSON.stringify({
                assets: [{ code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 }],
                liabilities: []
            }));
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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', currentValueLcy: 1234.56 }
        ]));
        global.GM_setValue('api_summary', JSON.stringify([
            { goalId: 'end-1', goalName: 'Endowus Only Goal', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' }
        ]));
        global.GM_setValue('api_investible', JSON.stringify([
            {
                goalId: 'end-1',
                goalName: 'Endowus Only Goal',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 1000 } }
            }
        ]));
        global.GM_setValue('api_performance', JSON.stringify([
            { goalId: 'end-1', totalCumulativeReturn: { amount: 100 }, simpleRateOfReturnPercent: 0.1 }
        ]));

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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

    test('showOverlay renders OCBC overlay with separate assets and liabilities views', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
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
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay).toBeTruthy();
        expect(overlay.textContent).toContain('Portfolio Viewer (OCBC)');
        expect(overlay.textContent).toContain('Portfolio P-1');
        expect(overlay.textContent).toContain('Equity');
        expect(overlay.textContent).toContain('Bond');
        expect(overlay.querySelectorAll('.gpv-summary-row')).toHaveLength(0);
        expect(overlay.querySelectorAll('.gpv-detail-header')).toHaveLength(1);
        expect(overlay.querySelectorAll('.gpv-detail-title')).toHaveLength(1);
        expect(overlay.querySelectorAll('.gpv-detail-title')[0].textContent).toBe('Portfolio P-1');
        expect(overlay.querySelectorAll('.gpv-type-section')).toHaveLength(2);
        expect(overlay.querySelectorAll('.gpv-type-header')).toHaveLength(2);
        expect(Array.from(overlay.querySelectorAll('.gpv-type-header h3')).map(node => node.textContent.trim())).toEqual(['Equity', 'Bond']);
        expect(overlay.textContent).toContain('Identifier');
        expect(overlay.textContent).toContain('SG00AAA111');
        expect(Array.from(overlay.querySelectorAll('th')).map(cell => cell.textContent.trim())).not.toContain('Ticker');
        expect(overlay.textContent).toContain('OCBC Asset');
        expect(overlay.textContent).toContain('+3.70% (+SGD 50.00) · partial (1 missing)');
        expect(overlay.textContent).toContain('partial (1 missing)');
        expect(overlay.textContent).not.toContain('OCBC Liability');
        const firstIdentifierCell = overlay.querySelector('table tbody tr td');
        expect(firstIdentifierCell.textContent.trim()).toBe('SG00AAA111');
        expect(firstIdentifierCell.textContent.trim()).not.toBe('P-1');

        const viewSelect = overlay.querySelector('#gpv-ocbc-view-select');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        const viewLabel = Array.from(overlay.querySelectorAll('label')).find(label => label.textContent.includes('View:'));
        const modeLabel = Array.from(overlay.querySelectorAll('label')).find(label => label.textContent.includes('Mode:'));
        expect(viewLabel).toBeTruthy();
        expect(modeLabel).toBeTruthy();
        expect(viewSelect.id).toBe('gpv-ocbc-view-select');
        expect(modeSelect.id).toBe('gpv-ocbc-mode-select');
        expect(viewLabel.getAttribute('for')).toBe('gpv-ocbc-view-select');
        expect(modeLabel.getAttribute('for')).toBe('gpv-ocbc-mode-select');
        viewSelect.value = 'liabilities';
        viewSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        expect(overlay.textContent).toContain('OCBC Liability');
        expect(overlay.textContent).toContain('-SGD');
        expect(overlay.textContent).not.toContain('OCBC Asset');
    });

    test('OCBC allocation mode groups by portfolio first and keeps product type on rows', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Bond 1', productType: 'Bond', currentValueLcy: 250 },
                { code: 'P-2:EQ2', portfolioNo: 'P-2', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        expect(overlay.textContent).toContain('Portfolio P-1');
        expect(overlay.textContent).toContain('Portfolio P-2');
        expect(overlay.textContent).toContain('Global Equity');
        expect(overlay.textContent).toContain('Bond');
        const headers = Array.from(overlay.querySelectorAll('th')).map(cell => cell.textContent.trim());
        expect(headers).toContain('Product Type');
    });

    test('OCBC allocation mode shows renamed columns and target assignment indicators', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 100 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 300 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Asset 3', productType: 'Bond', currentValueLcy: 600 }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: {
                'P-1': [
                    { id: 'core', name: 'Core', archived: false },
                    { id: 'satellite', name: 'Satellite', archived: false }
                ]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P-1:EQ1': 'core',
            'P-1:EQ2': 'core'
        }));
        global.GM_setValue('ocbc_target_pct_assets|P-1|core|', 110);
        global.GM_setValue('ocbc_target_pct_assets|P-1|satellite|', 0);
        global.GM_setValue('ocbc_target_pct_assets|P-1|core|P-1%3AEQ1', 50);
        global.GM_setValue('ocbc_target_pct_assets|P-1|core|P-1%3AEQ2', 70);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const allocationText = overlay.textContent;
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
        expect(headers).toContain('Current % of sub-portfolio');
        expect(headers).toContain('Target % of sub-portfolio');

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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Bond 1', productType: 'Bond', currentValueLcy: 500 }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: {
                'P-1': [{ id: 'core', name: 'Core', archived: false }]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P-1:EQ1': 'core'
        }));
        global.GM_setValue('ocbc_target_pct_assets|P-1|core|P-1%3AEQ1', 60);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 100 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 300 }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: {
                'P-1': [{ id: 'core', name: 'Core', archived: false }]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P-1:EQ1': 'core',
            'P-1:EQ2': 'core'
        }));
        global.GM_setValue('ocbc_target_pct_assets|P-1|core|P-1%3AEQ1', 50);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:FI1', portfolioNo: 'P-1', displayTicker: 'FI1', name: 'Asset 2', productType: 'Fixed Income', currentValueLcy: 500 }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P-1:EQ1': 'legacy-core',
            'P-9:MISSING': { subPortfolioId: 'other', bucketId: 'x' }
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const subPortfolioInput = overlay.querySelector('input[placeholder="Sub-portfolio name"]');
        subPortfolioInput.value = 'Core';
        const createSubPortfolioBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Create');
        createSubPortfolioBtn.dispatchEvent(new window.Event('click', { bubbles: true }));

        const savedSubPortfolios = JSON.parse(storage.get('ocbc')).subPortfolios;
        expect(savedSubPortfolios.assets['P-1'][0].id).toBe('core');

        const subPortfolioSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for EQ1');
        subPortfolioSelect.value = 'core';
        subPortfolioSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const savedAssignments = JSON.parse(storage.get('ocbc')).assignmentByCode;
        expect(savedAssignments['P-1:EQ1']).toBe('core');
        expect(savedAssignments['P-9:MISSING']).toBe('other');
    });

    test('OCBC allocation mode honors legacy bucket assignments and target fallback while writing new target keys', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:FI1', portfolioNo: 'P-1', displayTicker: 'FI1', name: 'Asset 2', productType: 'Fixed Income', currentValueLcy: 500 }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_allocation_buckets', JSON.stringify({
            assets: {
                'Global Equity': [{ id: 'core-equity', name: 'Core Equity' }]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P-1:EQ1': 'core-equity'
        }));
        global.GM_setValue(legacyTargetKey, 70);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        expect(overlay.textContent).toContain('Core Equity');
        expect(overlay.textContent).not.toContain('Core Equity buckets');

        const subPortfolioSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for EQ1');
        expect(subPortfolioSelect.value).toBe('core-equity');

        const targetInput = overlay.querySelector('input[aria-label="Target percentage for portfolio P-1 sub-portfolio Core Equity"]');
        expect(targetInput).toBeTruthy();
        expect(targetInput.value).toBe('70.00');

        const newTargetKey = 'ocbc_target_pct_assets|P-1|core-equity|';
        expect(storage.has(newTargetKey)).toBe(false);

        targetInput.value = '65';
        targetInput.dispatchEvent(new window.Event('change', { bubbles: true }));

        expect(JSON.parse(storage.get('ocbc')).targetsByScope['assets|P-1|core-equity|']).toBe(65);
        expect(storage.get(legacyTargetKey)).toBe(70);
    });

    test('OCBC allocation mode writes separator-safe scoped target keys and avoids collisions', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P|1:EQ1', portfolioNo: 'P|1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P:EQ2', portfolioNo: 'P', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: {
                'P|1': [
                    { id: 'core', name: 'Core Pipe Portfolio', archived: false, buckets: [] }
                ],
                P: [
                    { id: '1|core', name: 'Core Pipe Sub', archived: false, buckets: [] }
                ]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P|1:EQ1': { subPortfolioId: 'core', bucketId: '' },
            'P:EQ2': { subPortfolioId: '1|core', bucketId: '' }
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const portfolioPipeInput = overlay.querySelector('input[aria-label="Target percentage for portfolio P|1 sub-portfolio Core Pipe Portfolio"]');
        const subPipeInput = overlay.querySelector('input[aria-label="Target percentage for portfolio P sub-portfolio Core Pipe Sub"]');
        expect(portfolioPipeInput).toBeTruthy();
        expect(subPipeInput).toBeTruthy();

        portfolioPipeInput.value = '60';
        portfolioPipeInput.dispatchEvent(new window.Event('change', { bubbles: true }));
        subPipeInput.value = '40';
        subPipeInput.dispatchEvent(new window.Event('change', { bubbles: true }));

        const ocbcTargets = JSON.parse(storage.get('ocbc')).targetsByScope;
        expect(ocbcTargets['assets|P%7C1|core|']).toBe(60);
        expect(ocbcTargets['assets|P|1%7Ccore|']).toBe(40);
        expect(ocbcTargets['assets|P%7C1|core|']).not.toBe(ocbcTargets['assets|P|1%7Ccore|']);
    });

    test('OCBC allocation mode reads separator-safe legacy target fallback keys', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global|Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_allocation_buckets', JSON.stringify({
            assets: {
                'Global|Equity': [{ id: 'core|equity', name: 'Core Equity' }]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P-1:EQ1': 'core|equity'
        }));
        global.GM_setValue('ocbc_target_pct_assets|Global%7CEquity|core%7Cequity', 72);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const targetInput = overlay.querySelector('input[aria-label="Target percentage for portfolio P-1 sub-portfolio Core Equity"]');
        expect(targetInput).toBeTruthy();
        expect(targetInput.value).toBe('72.00');
    });

    test('OCBC allocation mode resolves duplicate legacy bucket ids by row product type and keeps product-scoped legacy targets', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Equity Asset', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Bond Asset', productType: 'Bond', currentValueLcy: 500 },
                { code: 'P-1:UNK1', portfolioNo: 'P-1', displayTicker: 'UNK1', name: 'Unknown Asset', currentValueLcy: 200 }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: {
                'P-1': [
                    { id: 'all-weather', name: 'All Weather', archived: false, buckets: [] }
                ]
            }
        }));
        global.GM_setValue('ocbc_allocation_buckets', JSON.stringify({
            assets: {
                'Global Equity': [{ id: 'core', name: 'Core' }],
                Bond: [{ id: 'core', name: 'Core' }]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P-1:EQ1': 'core',
            'P-1:BD1': 'core',
            'P-1:UNK1': 'core'
        }));
        global.GM_setValue('ocbc_target_pct_assets|Global%20Equity|core', 70);
        global.GM_setValue('ocbc_target_pct_assets|Bond|core', 30);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const equitySubPortfolioSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for EQ1');
        const bondSubPortfolioSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for BD1');
        const unknownSubPortfolioSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for UNK1');

        expect(equitySubPortfolioSelect.value).toBe('legacy-global-equity-core');
        expect(bondSubPortfolioSelect.value).toBe('legacy-bond-core');
        expect(unknownSubPortfolioSelect.value).toBe('');

        const equityOptionValues = Array.from(equitySubPortfolioSelect.options).map(option => option.value);
        const bondOptionValues = Array.from(bondSubPortfolioSelect.options).map(option => option.value);
        expect(equityOptionValues).toContain('all-weather');
        expect(bondOptionValues).toContain('all-weather');
        expect(equityOptionValues).toContain('legacy-global-equity-core');
        expect(equityOptionValues).not.toContain('legacy-bond-core');
        expect(bondOptionValues).toContain('legacy-bond-core');
        expect(bondOptionValues).not.toContain('legacy-global-equity-core');

        const equityTargetInput = overlay.querySelector('input[aria-label="Target percentage for portfolio P-1 sub-portfolio Core"]');
        const duplicateLegacyTargetInput = Array.from(overlay.querySelectorAll('input.gpv-target-input'))
            .find(input => input !== equityTargetInput && input.getAttribute('aria-label') === 'Target percentage for portfolio P-1 sub-portfolio Core');

        expect(equityTargetInput).toBeTruthy();
        expect(duplicateLegacyTargetInput).toBeTruthy();

        const duplicateTargetValues = [equityTargetInput.value, duplicateLegacyTargetInput.value].sort();
        expect(duplicateTargetValues).toEqual(['30.00', '70.00']);
    });

    test('OCBC allocation mode lets explicit scoped sub-portfolio win on legacy id collision without legacy fallback metadata', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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
        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Asset 2', productType: 'Bond', currentValueLcy: 600 }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: {
                'P-1': [
                    { id: 'legacy-global-equity-core', name: 'Scoped Core', archived: false, buckets: [] }
                ]
            }
        }));
        global.GM_setValue('ocbc_allocation_buckets', JSON.stringify({
            assets: {
                'Global Equity': [{ id: 'core', name: 'Core' }],
                Bond: [{ id: 'core', name: 'Core' }]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P-1:EQ1': 'core'
        }));
        global.GM_setValue(legacyTargetKey, 55);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Equity Asset', productType: 'Global Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: {
                'P-1': [
                    { id: 'core', name: 'Scoped Core (Bond)', archived: false, buckets: [], legacyProductType: 'Bond' }
                ]
            }
        }));
        global.GM_setValue('ocbc_allocation_buckets', JSON.stringify({
            assets: {
                'Global Equity': [{ id: 'core', name: 'Core' }],
                Bond: [{ id: 'core', name: 'Core' }]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P-1:EQ1': 'core'
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const equitySubPortfolioSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for EQ1');
        const equityOptionValues = Array.from(equitySubPortfolioSelect.options).map(option => option.value);

        expect(equitySubPortfolioSelect.value).toBe('legacy-global-equity-core');
        expect(equityOptionValues).not.toContain('core');
        expect(equityOptionValues).toContain('legacy-global-equity-core');
    });

    test('OCBC allocation mode treats mismatched legacy-derived assignment as unassigned', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:BD1', portfolioNo: 'P-1', displayTicker: 'BD1', name: 'Bond Asset', productType: 'Bond', currentValueLcy: 1000 },
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Equity Asset', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: {
                'P-1': [
                    {
                        id: 'core',
                        name: 'Core',
                        archived: false
                    }
                ]
            }
        }));
        global.GM_setValue('ocbc_allocation_buckets', JSON.stringify({
            assets: {
                'Global Equity': [{ id: 'legacy-core', name: 'Legacy Core' }]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P-1:BD1': { subPortfolioId: 'legacy-global-equity-legacy-core', bucketId: 'stale-bucket' },
            'P-1:EQ1': { subPortfolioId: 'core', bucketId: 'missing-bucket' }
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_allocation_buckets', JSON.stringify({
            assets: {
                'Global Equity': [{ id: 'core', name: 'Core' }]
            }
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: {
                'P-1': [
                    {
                        id: 'core',
                        name: 'Core',
                        archived: false
                    }
                ]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P-1:EQ1': { subPortfolioId: 'core', bucketId: 'growth' }
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const targetInput = overlay.querySelector('input[aria-label="Target percentage for instrument EQ1 in sub-portfolio Core"]');
        expect(targetInput).toBeTruthy();
    });

    test('OCBC allocation mode stores instrument scoped target key and shows copy values near sub-portfolio heading', async () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000.5 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 700.25 }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: {
                'P-1': [{ id: 'core', name: 'Core', archived: false }]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P-1:EQ1': 'core',
            'P-1:EQ2': 'core'
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const targetInput = overlay.querySelector('input[aria-label="Target percentage for instrument EQ1 in sub-portfolio Core"]');
        targetInput.value = '60';
        targetInput.dispatchEvent(new window.Event('change', { bubbles: true }));

        expect(JSON.parse(storage.get('ocbc')).targetsByScope['assets|P-1|core|P-1%3AEQ1']).toBe(60);
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
        expect(copyButton.textContent).toContain('Copy Values');
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

    test('OCBC Copy Values keeps row order and emits blank TSV fields for missing current values', async () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000.5 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: null },
                { code: 'P-1:EQ3', portfolioNo: 'P-1', displayTicker: 'EQ3', name: 'Asset 3', productType: 'Global Equity', currentValueLcy: 700.25 },
                { code: 'P-1:EQ4', portfolioNo: 'P-1', displayTicker: 'EQ4', name: 'Asset 4', productType: 'Global Equity' }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: {
                'P-1': [{ id: 'core', name: 'Core', archived: false }]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P-1:EQ1': 'core',
            'P-1:EQ2': 'core',
            'P-1:EQ3': 'core',
            'P-1:EQ4': 'core'
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 700 },
                { code: 'P-1:EQ3', portfolioNo: 'P-1', displayTicker: 'EQ3', name: 'Asset 3', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: { 'P-1': [{ id: 'core', name: 'Core', archived: false }] }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P-1:EQ1': 'core',
            'P-1:EQ2': 'core',
            'P-1:EQ3': 'core'
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

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

        const savedOrder = JSON.parse(storage.get('ocbc')).orderByScope;
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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 900 }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: {
                'P-1': [
                    { id: 'core', name: 'Core', archived: false },
                    { id: 'satellite', name: 'Satellite', archived: false }
                ]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P-1:EQ1': 'core',
            'P-1:EQ2': 'core'
        }));
        global.GM_setValue('ocbc_allocation_order_by_scope', JSON.stringify({
            'assets|P-1|core': ['P-1:EQ2', 'P-1:EQ1']
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const eq2Select = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for EQ2');
        eq2Select.value = 'satellite';
        eq2Select.dispatchEvent(new window.Event('change', { bubbles: true }));

        const savedOrder = JSON.parse(storage.get('ocbc')).orderByScope;
        expect(savedOrder['assets|P-1|core']).toEqual(['P-1:EQ1']);
        expect(savedOrder['assets|P-1|satellite']).toEqual(['P-1:EQ2']);
    });

    test('OCBC allocation mode reassignment removes instrument from legacy unassigned order scope and appends to target scope', () => {
        teardownDom();
        setupDom({
            url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=123'
        });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 900 },
                { code: 'P-1:EQ9', portfolioNo: 'P-1', displayTicker: 'EQ9', name: 'Asset 9', productType: 'Global Equity', currentValueLcy: 600 }
            ],
            liabilities: []
        }));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: {
                'P-1': [
                    { id: 'core', name: 'Core', archived: false },
                    { id: 'satellite', name: 'Satellite', archived: false }
                ]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P-1:EQ1': 'core',
            'P-1:EQ2': '',
            'P-1:EQ9': 'satellite'
        }));
        global.GM_setValue('ocbc_allocation_order_by_scope', JSON.stringify({
            'assets|P-1|-': ['P-1:EQ2', 'P-1:EQ1'],
            'assets|P-1|satellite': ['P-1:EQ9']
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const eq2Select = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for EQ2');
        eq2Select.value = 'satellite';
        eq2Select.dispatchEvent(new window.Event('change', { bubbles: true }));

        const savedOrder = JSON.parse(storage.get('ocbc')).orderByScope;
        expect(savedOrder['assets|P-1|-']).toEqual(['P-1:EQ1']);
        expect(savedOrder['assets|P-1|satellite']).toEqual(['P-1:EQ9', 'P-1:EQ2']);
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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify(normalized));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: {
                'P-LEGACY': [
                    { id: 'core', name: 'Core', archived: false },
                    { id: 'satellite', name: 'Satellite', archived: false }
                ]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            'P-LEGACY:ISIN-LEGACY-1': 'core'
        }));
        global.GM_setValue('ocbc_allocation_order_by_scope', JSON.stringify({
            'assets|P-LEGACY|core': ['P-LEGACY:ISIN-LEGACY-1']
        }));

        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const legacySelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for ISIN-LEGACY-1');
        expect(legacySelect.value).toBe('core');

        const savedAssignments = JSON.parse(storage.get('ocbc')).assignmentByCode;
        expect(savedAssignments['P-LEGACY:ISIN-LEGACY-1']).toBe('core');
        expect(savedAssignments[stableCode]).toBe('core');

        modeSelect.value = 'portfolio';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const ocbcWrites = global.GM_setValue.mock.calls
            .filter(([key]) => key === 'ocbc');
        expect(ocbcWrites.length).toBeGreaterThan(0);
    });

    test('OCBC allocation restores legacy hashed assignment/target/order after row gains positionId', () => {
        teardownDom();
        setupDom({ url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=111' });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify(withPosition));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: {
                'P-POS': [
                    { id: 'core', name: 'Core', archived: false }
                ]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            [initialCodeA]: 'core',
            [initialCodeB]: 'core'
        }));
        global.GM_setValue(`ocbc_target_pct_assets|P-POS|core|${encodeURIComponent(initialCodeA)}`, 55);
        global.GM_setValue('ocbc_allocation_order_by_scope', JSON.stringify({
            'assets|P-POS|core': [initialCodeA, initialCodeB]
        }));

        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

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

        const savedAssignments = JSON.parse(storage.get('ocbc')).assignmentByCode;
        expect(savedAssignments[positionCodeA]).toBe('core');
    });

    test('OCBC assignment stays resolved across rename and reorder with stable identifiers', () => {
        teardownDom();
        setupDom({ url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=111' });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify(renamedReordered));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: {
                'P-STABLE': [
                    { id: 'core', name: 'Core', archived: false },
                    { id: 'satellite', name: 'Satellite', archived: false }
                ]
            }
        }));
        global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
            [initialCode]: 'core'
        }));

        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const stableSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for ISIN-A');
        expect(stableSelect.value).toBe('core');
    });

    test('OCBC allocation assignment persists across logout/login-style payload replacement with no positionId', () => {
        teardownDom();
        setupDom({ url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=111' });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_ocbc_holdings', JSON.stringify(initialPayload));
        global.GM_setValue('ocbc_sub_portfolios', JSON.stringify({
            assets: {
                'P-LIFECYCLE': [
                    { id: 'core', name: 'Core', archived: false },
                    { id: 'satellite', name: 'Satellite', archived: false }
                ]
            }
        }));
        if (initialStableCode) {
            global.GM_setValue('ocbc_allocation_assignment_by_code', JSON.stringify({
                [initialStableCode]: 'core'
            }));
        }

        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        let modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const firstSessionSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for ISIN-LIFE-A');
        expect(firstSessionSelect.value).toBe('core');

        firstSessionSelect.value = 'satellite';
        firstSessionSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const savedAssignments = JSON.parse(storage.get('ocbc')).assignmentByCode;
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
        global.GM_setValue('api_ocbc_holdings', JSON.stringify(postLoginPayload));

        overlay.remove();
        exportsModule.showOverlay();

        overlay = document.querySelector('#gpv-overlay');
        modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const secondSessionSelect = Array.from(overlay.querySelectorAll('select.gpv-select'))
            .find(select => select.getAttribute('aria-label') === 'Sub-portfolio for ISIN-LIFE-A');
        expect(secondSessionSelect.value).toBe('satellite');
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
        expect(overlay.textContent).toContain('Summary View');

        const select = overlay.querySelector('.gpv-select');
        const bucketValue = Array.from(select.options).find(option => option.value !== 'SUMMARY')?.value;
        select.value = bucketValue;
        select.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Retirement');
        expect(select.value).toBe(bucketValue);

        global.fetch.mockResolvedValueOnce(responseFactory([]));
        await window.fetch('/v1/goals/performance');

        global.fetch.mockResolvedValueOnce(responseFactory([]));
        await window.fetch('/v2/goals/investible');

        global.fetch.mockResolvedValueOnce(responseFactory([]));
        await window.fetch('/v1/goals');

        await new Promise(resolve => setTimeout(resolve, 0));

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Summary View');
        expect(overlay.textContent).not.toContain('Retirement');
        expect(overlay.querySelector('.gpv-select').value).toBe('SUMMARY');

        global.fetch.mockResolvedValueOnce(responseFactory({ stale: true }));
        await window.fetch('/v1/goals/performance');

        await new Promise(resolve => setTimeout(resolve, 0));

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Summary View');
        expect(overlay.textContent).not.toContain('Fetching Endowus portfolio data');
        expect(document.body.textContent).toContain('Latest Endowus refresh failed validation. Showing last synced portfolio data.');
    });

    test('showOverlay opens Endowus view when intercepted datasets are empty arrays', () => {
        global.GM_setValue('api_performance', JSON.stringify([]));
        global.GM_setValue('api_investible', JSON.stringify([]));
        global.GM_setValue('api_summary', JSON.stringify([]));
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay).toBeTruthy();
        expect(overlay.textContent).toContain('Portfolio Viewer');
        expect(overlay.textContent).toContain('Summary View');
        expect(overlay.textContent).not.toContain('Preparing data');
    });

    test('showOverlay opens FSM view when holdings response is empty', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        global.GM_setValue('api_fsm_holdings', JSON.stringify([]));

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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
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
        ]));

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

        const portfolios = JSON.parse(storage.get('fsm')).portfolios;
        const corePortfolio = portfolios.find(item => item.id === 'core');
        expect(corePortfolio.name).toBe('Core Growth');

        overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const rowSelect = overlay.querySelector('table tbody select.gpv-select');
        rowSelect.value = 'core';
        rowSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        let assignments = JSON.parse(storage.get('fsm')).assignmentByCode;
        expect(assignments['AAA|sub:AAPL']).toBe('core');

        overlay = document.querySelector('#gpv-overlay');
        const archiveSelect = overlay.querySelector('.gpv-fsm-portfolio-list select');
        archiveSelect.value = 'archive';
        archiveSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const archivedPortfolios = JSON.parse(storage.get('fsm')).portfolios;
        const archived = archivedPortfolios.find(item => item.id === 'core');
        expect(archived.archived).toBe(true);

        assignments = JSON.parse(storage.get('fsm')).assignmentByCode;
        expect(assignments['AAA|sub:AAPL']).toBe('unassigned');
    });

    test('FSM bulk assignment applies to all filtered holdings', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
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
        ]));

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

        const assignments = JSON.parse(storage.get('fsm')).assignmentByCode;
        expect(assignments['AAA|sub:AAPL']).toBe('core');
        expect(assignments['AAA|sub:BOND']).toBe('core');
    });

    test('FSM fixed clears target value and disables input', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ]));
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
        expect(JSON.parse(storage.get('fsm')).targetsByCode['AAA|sub:AAPL']).toBeUndefined();
        expect(JSON.parse(storage.get('fsm')).fixedByCode['AAA|sub:AAPL']).toBe(true);
        expect(targetInput.disabled).toBe(true);
    });

    test('FSM migrated legacy target can be cleared without falling back', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ]));
        storage.set('fsm_target_pct_AAA', 35);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings')).click();

        overlay = document.querySelector('#gpv-overlay');
        let targetInput = overlay.querySelector('table tbody tr input.gpv-target-input');
        expect(targetInput.value).toBe('35.00');

        targetInput.value = '';
        targetInput.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        targetInput = overlay.querySelector('table tbody tr input.gpv-target-input');
        expect(JSON.parse(storage.get('fsm')).targetsByCode.AAA).toBeUndefined();
        expect(JSON.parse(storage.get('fsm')).targetsByCode['AAA|sub:AAPL']).toBeUndefined();
        expect(targetInput.value).toBe('');
    });

    test('FSM migration preserves legacy target entries when normalized target map exists', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'ESG003', subcode: 'ESG3', name: 'Growth Fund', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ]));
        storage.set('fsm', JSON.stringify({
            targetsByCode: {},
            fixedByCode: {},
            portfolios: [],
            assignmentByCode: {}
        }));
        storage.set('fsm_target_pct_ESG003|sub:ESG3', 35);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings')).click();

        overlay = document.querySelector('#gpv-overlay');
        const targetInput = overlay.querySelector('table tbody tr input.gpv-target-input');
        expect(targetInput.value).toBe('35.00');

        const storedFsm = JSON.parse(storage.get('fsm'));
        expect(storedFsm?.targetsByCode?.['ESG003|sub:ESG3']).toBe(35);
        expect(storage.has('fsm_target_pct_ESG003|sub:ESG3')).toBe(false);
    });

    test('FSM migrated legacy fixed flag can be unchecked without falling back', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ]));
        storage.set('fsm_fixed_AAA', true);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings')).click();

        overlay = document.querySelector('#gpv-overlay');
        let fixedCheckbox = overlay.querySelector('input[aria-label^="Fixed allocation"]');
        expect(fixedCheckbox.checked).toBe(true);

        fixedCheckbox.checked = false;
        fixedCheckbox.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        fixedCheckbox = overlay.querySelector('input[aria-label^="Fixed allocation"]');
        expect(JSON.parse(storage.get('fsm')).fixedByCode.AAA).toBeUndefined();
        expect(JSON.parse(storage.get('fsm')).fixedByCode['AAA|sub:AAPL']).toBe(false);
        expect(fixedCheckbox.checked).toBe(false);
    });

    test('FSM target input rejects invalid values without persisting', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ]));

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
        expect(overlay.textContent).toContain('Enter target between 0 and 100');
        expect(storage.has('fsm_target_pct_AAA|sub:AAPL')).toBe(false);
    });

    test('FSM inline edits schedule sync updates', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ]));

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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_ocbc_holdings', JSON.stringify({
            assets: [
                { code: 'P-1:EQ1', portfolioNo: 'P-1', displayTicker: 'EQ1', name: 'Asset 1', productType: 'Global Equity', currentValueLcy: 1000 },
                { code: 'P-1:EQ2', portfolioNo: 'P-1', displayTicker: 'EQ2', name: 'Asset 2', productType: 'Global Equity', currentValueLcy: 500 }
            ],
            liabilities: []
        }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        const scheduleSpy = jest.spyOn(exportsModule.SyncManager, 'scheduleSyncOnChange').mockImplementation(() => {});
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const modeSelect = overlay.querySelector('#gpv-ocbc-mode-select');
        modeSelect.value = 'allocation';
        modeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_summary', JSON.stringify([
            { goalId: 'f1', goalName: 'Investment - Fixed One', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' },
            { goalId: 'f2', goalName: 'Investment - Fixed Two', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' },
            { goalId: 'f3', goalName: 'Investment - Fixed Three', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' },
            { goalId: 't1', goalName: 'Investment - Target One', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' },
            { goalId: 't2', goalName: 'Investment - Target Two', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' },
            { goalId: 't3', goalName: 'Investment - Target Three', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' },
            { goalId: 'blank', goalName: 'Investment - Blank', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' }
        ]));
        storage.set('api_investible', JSON.stringify([
            { goalId: 'f1', goalName: 'Investment - Fixed One', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 100 } } },
            { goalId: 'f2', goalName: 'Investment - Fixed Two', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 150 } } },
            { goalId: 'f3', goalName: 'Investment - Fixed Three', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 150 } } },
            { goalId: 't1', goalName: 'Investment - Target One', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 150 } } },
            { goalId: 't2', goalName: 'Investment - Target Two', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 150 } } },
            { goalId: 't3', goalName: 'Investment - Target Three', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 100 } } },
            { goalId: 'blank', goalName: 'Investment - Blank', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 200 } } }
        ]));
        storage.set('api_performance', JSON.stringify([
            { goalId: 'f1', totalCumulativeReturn: { amount: 0 }, simpleRateOfReturnPercent: 0 },
            { goalId: 'f2', totalCumulativeReturn: { amount: 0 }, simpleRateOfReturnPercent: 0 },
            { goalId: 'f3', totalCumulativeReturn: { amount: 0 }, simpleRateOfReturnPercent: 0 },
            { goalId: 't1', totalCumulativeReturn: { amount: 0 }, simpleRateOfReturnPercent: 0 },
            { goalId: 't2', totalCumulativeReturn: { amount: 0 }, simpleRateOfReturnPercent: 0 },
            { goalId: 't3', totalCumulativeReturn: { amount: 0 }, simpleRateOfReturnPercent: 0 },
            { goalId: 'blank', totalCumulativeReturn: { amount: 0 }, simpleRateOfReturnPercent: 0 }
        ]));
        storage.set('goal_fixed_f1', true);
        storage.set('goal_fixed_f2', true);
        storage.set('goal_fixed_f3', true);
        storage.set('goal_target_pct_t1', 10);
        storage.set('goal_target_pct_t2', 10);

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

    test('FSM row allocation and drift use selected scope totals', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
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
        ]));
        storage.set('fsm_target_pct_AAA|sub:AAPL', 60);
        storage.set('fsm_portfolios', JSON.stringify([
            { id: 'core', name: 'Core', archived: false }
        ]));
        storage.set('fsm_assignment_by_code', JSON.stringify({ 'AAA|sub:AAPL': 'core', 'BBB|sub:BOND': 'unassigned' }));

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

        const scopeToolbar = Array.from(overlay.querySelectorAll('.gpv-fsm-toolbar')).find(toolbar =>
            toolbar.querySelector('input.gpv-target-input.gpv-fsm-filter-input')
        );
        const scopeSelect = scopeToolbar.querySelector('select.gpv-select');
        scopeSelect.value = 'all';
        scopeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
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
        ]));
        storage.set('fsm_target_pct_AAA|sub:AAPL', 10);
        storage.set('fsm_target_pct_BBB|sub:BOND', 90);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Trigger sells: AAPL SGD\u00A0900.00');
        expect(overlay.textContent).toContain('Suggested buys: BOND SGD\u00A0900.00');

        const filterInput = overlay.querySelector('input.gpv-fsm-filter-input');
        filterInput.value = 'BO';
        filterInput.dispatchEvent(new window.Event('input', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Trigger sells: AAPL SGD\u00A0900.00');
        expect(overlay.textContent).toContain('Suggested buys: BOND SGD\u00A0900.00');
    });

    test('FSM overview and detail display profit metrics', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
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
        ]));

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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ]));
        storage.set('fsm_fixed_AAA|sub:AAPL', true);

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
        expect(unassignedCard.textContent).toContain('100.00%');
        expect(unassignedCard.textContent).not.toContain('Target total is');
    });

    test('FSM all-zero targets stay unflagged until allocation setup starts', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 600 },
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'UNIT_TRUST', currentValueLcy: 400 }
        ]));
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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 800 },
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'UNIT_TRUST', currentValueLcy: 1700 }
        ]));
        storage.set('fsm_target_pct_AAA|sub:AAPL', 40);
        storage.set('fsm_target_pct_BBB|sub:BOND', 60);

        let exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).not.toContain('Large allocation drift across this portfolio scope');

        teardownDom();
        jest.resetModules();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.alert = jest.fn();
        global.fetch = jest.fn(() => Promise.resolve({ clone: () => ({}), json: () => Promise.resolve({}), ok: true, status: 200 }));
        window.fetch = global.fetch;
        global.history = window.history;
        global.XMLHttpRequest = FakeXHR;
        window.__GPV_DISABLE_AUTO_INIT = true;

        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 800 },
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'UNIT_TRUST', currentValueLcy: 1700 }
        ]));
        storage.delete('fsm');
        storage.set('fsm_target_pct_AAA|sub:AAPL', 80);
        storage.set('fsm_target_pct_BBB|sub:BOND', 20);

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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
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
        ]));

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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 },
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'BOND', currentValueLcy: 800 }
        ]));

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

    test('FSM detail view can return to portfolio overview', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ]));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.querySelector('table')).toBeTruthy();
        const backBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Back to portfolios'));
        backBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.querySelector('.gpv-fsm-overview-grid')).toBeTruthy();
        expect(overlay.querySelector('table')).toBeNull();
    });

    test('FSM overview keeps hidden detail toolbar out of tab order and restores visible focus', () => {
        teardownDom();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });

        storage = new Map();
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ]));

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

        const backBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Back to portfolios'));
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
        global.GM_setValue = jest.fn((key, value) => storage.set(key, value));
        global.GM_getValue = jest.fn((key, fallback = null) => (
            storage.has(key) ? storage.get(key) : fallback
        ));
        global.GM_deleteValue = jest.fn(key => storage.delete(key));
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

        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ]));

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
