const { setupDom, teardownDom } = require('./helpers/domSetup');

describe('initialization and URL monitoring', () => {
    let storage;

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
    });

    function flushPromises() {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

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

    test('showOverlay opens readiness shell when Endowus data is not loaded yet', () => {
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay).toBeTruthy();
        expect(overlay.textContent).toContain('Status');
        expect(overlay.textContent).toContain('Not ready yet');
        expect(overlay.textContent).toContain('Waiting for Endowus data');
        expect(overlay.textContent).toContain('Endowus data is still loading. The viewer will refresh automatically once the portfolio requests complete.');
        expect(overlay.querySelectorAll('.gpv-select option')).toHaveLength(1);
    });

    test('showOverlay refreshes automatically when Endowus data arrives after opening in readiness mode', async () => {
        global.alert = jest.fn();

        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1,
            totalInvestmentValue: { amount: 1000 }
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

        const responseFactory = body => ({
            clone: () => responseFactory(body),
            json: () => Promise.resolve(body),
            ok: true,
            status: 200
        });
        global.fetch = jest.fn(url => {
            if (url.includes('/v1/goals/performance')) {
                return Promise.resolve(responseFactory(performanceData));
            }
            if (url.includes('/v2/goals/investible')) {
                return Promise.resolve(responseFactory(investibleData));
            }
            if (url.match(/\/v1\/goals(?:[?#]|$)/)) {
                return Promise.resolve(responseFactory(summaryData));
            }
            return Promise.resolve(responseFactory({}));
        });
        window.fetch = global.fetch;

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        expect(overlay?.textContent).toContain('Not ready yet');
        expect(overlay?.textContent).toContain('Waiting for Endowus data');

        await window.fetch('https://app.sg.endowus.com/v1/goals/performance');
        await flushPromises();
        await window.fetch('https://app.sg.endowus.com/v2/goals/investible');
        await flushPromises();
        await window.fetch('https://app.sg.endowus.com/v1/goals');
        await flushPromises();

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay?.textContent).toContain('Ready');
        expect(overlay?.textContent).toContain('Endowus data loaded');
        expect(overlay?.textContent).toContain('Retirement');
        expect(overlay?.querySelectorAll('.gpv-select option')).toHaveLength(2);
        expect(overlay?.textContent).not.toContain('Not ready yet');
        expect(overlay?.textContent).not.toContain('Waiting for Endowus data');
    });

    test('showOverlay opens readiness shell on FSM route before holdings snapshot exists', () => {
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
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay).toBeTruthy();
        expect(overlay.textContent).toContain('Portfolio Viewer (FSM)');
        expect(overlay.textContent).toContain('Status');
        expect(overlay.textContent).toContain('Not ready yet');
        expect(overlay.textContent).toContain('Waiting for holdings data');
        expect(overlay.textContent).toContain('No FSM holdings found yet. Once holdings load, assign them to portfolios here.');
    });

    test('showOverlay refreshes automatically when FSM holdings arrive after opening in readiness mode', async () => {
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

        const holdingsPayload = {
            data: [
                {
                    holdings: [
                        { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 },
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
        global.fetch = jest.fn(url => {
            if (url.includes('/fsmone/rest/holding/client/protected/find-holdings-with-pnl')) {
                return Promise.resolve(responseFactory(holdingsPayload));
            }
            return Promise.resolve(responseFactory({}));
        });
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

        let overlay = document.querySelector('#gpv-overlay');
        expect(overlay?.textContent).toContain('Not ready yet');
        expect(overlay?.textContent).toContain('Waiting for holdings data');

        await window.fetch('https://secure.fundsupermart.com/fsmone/rest/holding/client/protected/find-holdings-with-pnl');
        await flushPromises();

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay?.textContent).toContain('Ready');
        expect(overlay?.textContent).toContain('Holdings loaded');
        expect(overlay?.textContent).toContain('Fund A');
        expect(overlay?.textContent).toContain('AAPL');
        expect(overlay?.textContent).not.toContain('Waiting for holdings data');
        expect(overlay?.textContent).not.toContain('No FSM holdings found yet');
    });

    test('showOverlay renders FSM workspace with product type and bulk assignment controls', () => {
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

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay).toBeTruthy();
        expect(overlay.textContent).toContain('Product Type');
        expect(overlay.textContent).toContain('AAPL');
        expect(overlay.textContent).toContain('Manage portfolios');
        expect(overlay.textContent).not.toContain('New portfolio');
        expect(overlay.textContent).toContain('Target %');
        expect(overlay.textContent).toContain('Apply to 1 filtered holdings');
        expect(overlay.querySelector('input[aria-label="Select all holdings"]')).toBeTruthy();

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

    test('shell is compact and does not render shell tabs', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1,
            totalInvestmentValue: { amount: 1000 }
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

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay.querySelector('.gpv-shell-tabs')).toBeNull();
        expect(overlay.querySelectorAll('[data-tab]').length).toBe(0);
        expect(overlay.querySelector('[data-shell-section="status"]')).toBeTruthy();
        expect(overlay.querySelector('[data-shell-section="sync"]')).toBeTruthy();
        expect(overlay.querySelector('[data-shell-section="find"]')).toBeTruthy();
        expect(overlay.querySelectorAll('.gpv-shell-results .gpv-shell-result').length).toBeLessThanOrEqual(6);
    });

    test('discovery search preserves input node and opens Endowus bucket/goal in the main workspace', () => {
        const performanceData = [
            {
                goalId: 'g1',
                totalInvestmentValue: { amount: 1200 },
                totalCumulativeReturn: { amount: 120 },
                simpleRateOfReturnPercent: 0.1
            },
            {
                goalId: 'g2',
                totalInvestmentValue: { amount: 800 },
                totalCumulativeReturn: { amount: 80 },
                simpleRateOfReturnPercent: 0.1
            }
        ];
        const investibleData = [
            {
                goalId: 'g1',
                goalName: 'Retirement - Core',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 1200 } }
            },
            {
                goalId: 'g2',
                goalName: 'Education - Growth',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 800 } }
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

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const inputBefore = overlay.querySelector('#gpv-shell-search-input');
        inputBefore.value = 'Education';
        inputBefore.dispatchEvent(new window.Event('input', { bubbles: true }));
        const inputAfter = overlay.querySelector('#gpv-shell-search-input');
        expect(inputAfter).toBe(inputBefore);
        expect(overlay.querySelector('[data-compare-add="true"]')).toBeNull();

        const educationBucketResult = overlay.querySelector('.gpv-shell-result[data-kind="bucket"][data-id="Education"][data-source="endowus"]');
        expect(educationBucketResult).toBeTruthy();
        educationBucketResult.querySelector('[data-discovery-open="true"]').click();

        const bucketSelect = overlay.querySelector('.gpv-select');
        expect(bucketSelect?.value).toBe('Education');

        inputAfter.value = 'Retirement - Core';
        inputAfter.dispatchEvent(new window.Event('input', { bubbles: true }));
        const goalResult = overlay.querySelector('.gpv-shell-result[data-kind="goal"][data-id="g1"][data-source="endowus"]');
        expect(goalResult).toBeTruthy();
        goalResult.querySelector('[data-discovery-open="true"]').click();

        expect(bucketSelect?.value).toBe('Retirement');
        const goalRow = overlay.querySelector('tr.gpv-goal-row[data-goal-id="g1"]');
        expect(goalRow).toBeTruthy();
        expect(goalRow?.classList.contains('gpv-shell-reveal')).toBe(true);
    });

    test('FSM discovery panel updates immediately after workspace assignment edits', () => {
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
        expect(overlay.querySelector('.gpv-shell-results').textContent).toContain('Unassigned');

        const manageBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Manage portfolios'));
        manageBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const createInput = overlay.querySelector('#gpv-fsm-create-portfolio');
        const createBtn = overlay.querySelector('#gpv-fsm-create-portfolio-btn');
        createInput.value = 'Core';
        createBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const rowSelect = overlay.querySelector('table tbody select.gpv-select');
        rowSelect.value = 'core';
        rowSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.querySelector('.gpv-shell-results').textContent).toContain('Core (core)');
    });

    test('FSM overview drift status card refreshes after assignment and target edits', () => {
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
            { code: 'AAA', subcode: 'AAA', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 },
            { code: 'BBB', subcode: 'BBB', name: 'Fund B', productType: 'UNIT_TRUST', currentValueLcy: 800 }
        ]));
        storage.set('fsm_portfolios', JSON.stringify([{ id: 'core', name: 'Core', archived: false }]));
        storage.set('fsm_assignment_by_code', JSON.stringify({ AAA: 'core', BBB: 'unassigned' }));
        storage.set('fsm_target_pct_AAA', 100);
        storage.set('fsm_drift_setting_warningPct', 10);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const getDriftCard = () => document.querySelector('#gpv-overlay [data-shell-card="fsm-drift-status"]');
        const getRowByTicker = ticker => Array.from(document.querySelectorAll('#gpv-overlay table tbody tr'))
            .find(row => row.textContent.includes(ticker));

        expect(getDriftCard()?.textContent).toContain('1 missing target');

        const bbbRow = getRowByTicker('BBB');
        const bbbPortfolioSelect = bbbRow?.querySelector('td:nth-child(8) select.gpv-select');
        expect(bbbPortfolioSelect).toBeTruthy();
        bbbPortfolioSelect.value = 'core';
        bbbPortfolioSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        expect(getDriftCard()?.textContent).toContain('1 warning');

        const aaaRow = getRowByTicker('AAA');
        const aaaTargetInput = aaaRow?.querySelector('td:nth-child(6) input.gpv-target-input');
        expect(aaaTargetInput).toBeTruthy();
        aaaTargetInput.value = '60';
        aaaTargetInput.dispatchEvent(new window.Event('change', { bubbles: true }));

        expect(getDriftCard()?.textContent).toContain('1 in range');
    });

    test('FSM search open action reveals the holding in the main workspace table', () => {
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

        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ]));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const searchInput = overlay.querySelector('#gpv-shell-search-input');
        searchInput.value = 'AAA';
        searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));

        const holdingCard = overlay.querySelector('.gpv-shell-result[data-kind="holding"][data-id="AAA"][data-source="fsm"]');
        expect(holdingCard).toBeTruthy();
        holdingCard.querySelector('[data-discovery-open="true"]').click();

        const holdingRow = overlay.querySelector('tr[data-holding-code="AAA"]');
        expect(holdingRow).toBeTruthy();
        expect(holdingRow?.classList.contains('gpv-shell-reveal')).toBe(true);
    });

    test('shell overview uses normalized shell typography and compact sections', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1,
            totalInvestmentValue: { amount: 1000 }
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

        const styles = document.querySelector('#gpv-styles');
        const overlay = document.querySelector('#gpv-overlay');

        expect(styles.textContent).toContain('.gpv-shell {');
        expect(styles.textContent).toContain('font-size: 14px;');
        expect(styles.textContent).toContain('.gpv-shell-overview {');
        expect(styles.textContent).toContain('.gpv-shell-search-row {');
        expect(overlay.querySelector('[data-shell-section="status"]')).toBeTruthy();
        expect(overlay.querySelector('[data-shell-section="find"]')).toBeTruthy();
        expect(overlay.textContent).toContain('Last sync');
    });

    test('FSM route renders overlay for empty holdings snapshot and shows an empty-state workspace', () => {
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
        expect(overlay.textContent).toContain('No FSM holdings found yet');
        expect(document.querySelector('.gpv-notification')?.textContent || '').not.toContain('still loading');
    });

    test('FSM assignment saves keep assignments for codes outside the current holdings snapshot', () => {
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

        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ]));
        storage.set('fsm_portfolios', JSON.stringify([{ id: 'core', name: 'Core', archived: false }]));
        storage.set('fsm_assignment_by_code', JSON.stringify({ AAA: 'unassigned', LEGACY: 'core' }));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const rowSelect = overlay.querySelector('table tbody select.gpv-select');
        rowSelect.value = 'core';
        rowSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const assignments = JSON.parse(storage.get('fsm_assignment_by_code'));
        expect(assignments.AAA).toBe('core');
        expect(assignments.LEGACY).toBe('core');
    });

    test('discovery helpers are declared only once after shell unification cleanup', () => {
        const fs = require('fs');
        const source = fs.readFileSync(require.resolve('../goal_portfolio_viewer.user.js'), 'utf8');

        const countMatches = pattern => (source.match(pattern) || []).length;

        expect(countMatches(/function buildEndowusDiscoveryItems\(/g)).toBe(1);
        expect(countMatches(/function buildFsmDiscoveryItems\(/g)).toBe(1);
        expect(countMatches(/function filterDiscoveryItems\(/g)).toBe(1);
        expect(countMatches(/dropMissing/g)).toBe(0);
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
        expect(overlay.querySelectorAll('[data-tab]').length).toBe(0);
        expect(overlay.querySelector('[data-shell-section="find"]')).toBeTruthy();
        expect(overlay.textContent).toContain('Fund A');
        expect(overlay.textContent).toContain('AAPL');
        expect(overlay.textContent).not.toContain('Endowus Only Goal');
        expect(overlay.querySelector('.gpv-shell')).toBeTruthy();
        expect(overlay.textContent).toContain('Product Type');
    });

    test('showOverlay on FSM route opens readiness shell when FSM holdings are unavailable', () => {
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
        expect(overlay.textContent).toContain('Status');
        expect(overlay.textContent).toContain('Waiting for holdings data');
        expect(overlay.textContent).toContain('No FSM holdings found yet. Once holdings load, assign them to portfolios here.');
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
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 },
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'UNIT_TRUST', currentValueLcy: 800 }
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

        const portfolios = JSON.parse(storage.get('fsm_portfolios'));
        const corePortfolio = portfolios.find(item => item.id === 'core');
        expect(corePortfolio.name).toBe('Core Growth');

        overlay = document.querySelector('#gpv-overlay');
        const rowSelect = overlay.querySelector('table tbody select.gpv-select');
        rowSelect.value = 'core';
        rowSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        let assignments = JSON.parse(storage.get('fsm_assignment_by_code'));
        expect(assignments.AAA).toBe('core');

        overlay = document.querySelector('#gpv-overlay');
        const archiveSelect = overlay.querySelector('.gpv-fsm-portfolio-list select');
        archiveSelect.value = 'archive';
        archiveSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const archivedPortfolios = JSON.parse(storage.get('fsm_portfolios'));
        const archived = archivedPortfolios.find(item => item.id === 'core');
        expect(archived.archived).toBe(true);

        assignments = JSON.parse(storage.get('fsm_assignment_by_code'));
        expect(assignments.AAA).toBe('unassigned');
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
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 },
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'UNIT_TRUST', currentValueLcy: 800 }
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
        const selectAll = overlay.querySelector('input[aria-label="Select all filtered holdings"]');
        selectAll.checked = true;
        selectAll.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        const applyBulkBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Apply to'));
        const bulkRow = applyBulkBtn.parentElement;
        const bulkSelect = bulkRow.querySelector('select.gpv-select');
        bulkSelect.value = 'core';
        bulkSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
        applyBulkBtn.click();

        const assignments = JSON.parse(storage.get('fsm_assignment_by_code'));
        expect(assignments.AAA).toBe('core');
        expect(assignments.BBB).toBe('core');
    });

    test('FSM bulk assignment only mutates selected holdings still in the active filtered set', () => {
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
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'UNIT_TRUST', currentValueLcy: 800 }
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
        const aaplCheckbox = overlay.querySelector('tbody tr input[aria-label="Select holding AAPL"]');
        aaplCheckbox.checked = true;
        aaplCheckbox.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        const filterInput = Array.from(overlay.querySelectorAll('input.gpv-target-input'))
            .find(input => input.placeholder === 'Filter holdings');
        filterInput.value = 'BOND';
        filterInput.dispatchEvent(new window.Event('input', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        const bondCheckbox = overlay.querySelector('tbody tr input[aria-label="Select holding BOND"]');
        bondCheckbox.checked = true;
        bondCheckbox.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        const applyBulkBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('Apply to'));
        const bulkSelect = applyBulkBtn.parentElement.querySelector('select.gpv-select');
        bulkSelect.value = 'core';
        bulkSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
        applyBulkBtn.click();

        const assignments = JSON.parse(storage.get('fsm_assignment_by_code'));
        expect(assignments.BBB).toBe('core');
        expect(assignments.AAA).not.toBe('core');
    });

    test('FSM row selection survives rerenders until explicitly cleared', () => {
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
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'UNIT_TRUST', currentValueLcy: 800 }
        ]));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const firstRowCheckbox = overlay.querySelector('tbody tr input[aria-label="Select holding AAPL"]');
        firstRowCheckbox.checked = true;
        firstRowCheckbox.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        const searchInput = Array.from(overlay.querySelectorAll('input.gpv-target-input'))
            .find(input => input.placeholder === 'Filter holdings');
        searchInput.value = 'AAPL';
        searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.querySelector('tbody tr input[aria-label="Select holding AAPL"]').checked).toBe(true);

        const filterInput = Array.from(overlay.querySelectorAll('input.gpv-target-input'))
            .find(input => input.placeholder === 'Filter holdings');
        filterInput.value = '';
        filterInput.dispatchEvent(new window.Event('input', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.querySelector('tbody tr input[aria-label="Select holding AAPL"]').checked).toBe(true);
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
        storage.set('fsm_target_pct_AAA', 35);

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const fixedCheckbox = overlay.querySelector('input[aria-label^="Fixed allocation"]');
        fixedCheckbox.checked = true;
        fixedCheckbox.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        const targetInput = overlay.querySelector('table tbody tr input.gpv-target-input');
        expect(storage.has('fsm_target_pct_AAA')).toBe(false);
        expect(storage.get('fsm_fixed_AAA')).toBe(true);
        expect(targetInput.disabled).toBe(true);
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
        const targetInput = overlay.querySelector('table tbody tr input.gpv-target-input');
        targetInput.value = '150';
        targetInput.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Enter target between 0 and 100');
        expect(storage.has('fsm_target_pct_AAA')).toBe(false);
    });

});
