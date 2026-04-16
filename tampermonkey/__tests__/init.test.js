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
        expect(overlay.textContent).toContain('Readiness');
        expect(overlay.textContent).toContain('Not ready yet');
        expect(overlay.textContent).toContain('Waiting for Endowus data');
        expect(overlay.textContent).toContain('Endowus data is still loading. Keep the shell open for readiness');
        expect(overlay.querySelectorAll('.gpv-select option')).toHaveLength(1);
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
        expect(overlay.textContent).toContain('Readiness');
        expect(overlay.textContent).toContain('Not ready yet');
        expect(overlay.textContent).toContain('Waiting for holdings data');
        expect(overlay.textContent).toContain('No FSM holdings found yet. Once holdings load, assign them to portfolios here.');
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

    test('changing an Endowus mapping refreshes the summary view without reopening', () => {
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
            },
            {
                goalId: 'g3',
                totalInvestmentValue: { amount: 1000 },
                totalCumulativeReturn: { amount: -50 },
                simpleRateOfReturnPercent: -0.05
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
            },
            {
                goalId: 'g3',
                goalName: 'Retirement - Cash',
                investmentGoalType: 'CASH_MANAGEMENT',
                totalInvestmentAmount: { display: { amount: 1000 } }
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
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const retirementCardBefore = overlay?.querySelector('.gpv-bucket-card[data-bucket="Retirement"]');
        expect(retirementCardBefore?.textContent).toMatch(/2,200\.00/);

        const mappingSelect = overlay?.querySelector('.gpv-shell-mappings select[data-goal-id="g1"]');
        expect(mappingSelect).toBeTruthy();
        mappingSelect.value = 'Education';
        mappingSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const refreshedOverlay = document.querySelector('#gpv-overlay');
        expect(refreshedOverlay?.textContent).toMatch(/2,000\.00/);
        expect(refreshedOverlay?.textContent).toMatch(/1,000\.00/);
        expect(refreshedOverlay?.textContent).not.toMatch(/2,200\.00/);
    });

    test('compare preserves off-route selections instead of pruning them during render', () => {
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
        global.GM_setValue('gpv_shell_compare_selection', JSON.stringify([
            { id: 'dup', kind: 'goal', source: 'endowus', title: 'Endowus Goal', subtitle: 'Endowus', detail: 'A' },
            { id: 'dup', kind: 'goal', source: 'fsm', title: 'FSM Goal', subtitle: 'FSM', detail: 'B' }
        ]));
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        overlay.querySelector('[data-tab="compare"]').click();

        expect(overlay.textContent).toContain('Side-by-side view for 2 selected item(s).');
        expect(JSON.parse(storage.get('gpv_shell_compare_selection'))).toEqual([
            expect.objectContaining({ id: 'dup', kind: 'goal', source: 'endowus' }),
            expect.objectContaining({ id: 'dup', kind: 'goal', source: 'fsm' })
        ]);
    });

    test('compare renders a semantic table and rejects a fifth selection explicitly', () => {
        const performanceData = [
            { goalId: 'g1', totalCumulativeReturn: { amount: 100 }, simpleRateOfReturnPercent: 0.1, totalInvestmentValue: { amount: 1000 } },
            { goalId: 'g2', totalCumulativeReturn: { amount: 200 }, simpleRateOfReturnPercent: 0.2, totalInvestmentValue: { amount: 2000 } },
            { goalId: 'g3', totalCumulativeReturn: { amount: 300 }, simpleRateOfReturnPercent: 0.3, totalInvestmentValue: { amount: 3000 } },
            { goalId: 'g4', totalCumulativeReturn: { amount: 400 }, simpleRateOfReturnPercent: 0.4, totalInvestmentValue: { amount: 4000 } }
        ];
        const investibleData = [
            { goalId: 'g1', goalName: 'Retirement - Alpha', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 1000 } } },
            { goalId: 'g2', goalName: 'Retirement - Beta', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 2000 } } },
            { goalId: 'g3', goalName: 'Retirement - Gamma', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 3000 } } },
            { goalId: 'g4', goalName: 'Retirement - Delta', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION', totalInvestmentAmount: { display: { amount: 4000 } } }
        ];
        const summaryData = [
            { goalId: 'g1', goalName: 'Retirement - Alpha', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' },
            { goalId: 'g2', goalName: 'Retirement - Beta', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' },
            { goalId: 'g3', goalName: 'Retirement - Gamma', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' },
            { goalId: 'g4', goalName: 'Retirement - Delta', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' }
        ];

        global.GM_setValue('api_performance', JSON.stringify(performanceData));
        global.GM_setValue('api_investible', JSON.stringify(investibleData));
        global.GM_setValue('api_summary', JSON.stringify(summaryData));
        global.GM_setValue('gpv_shell_compare_selection', JSON.stringify([
            { id: 'g1', kind: 'goal', source: 'endowus' },
            { id: 'g2', kind: 'goal', source: 'endowus' },
            { id: 'g3', kind: 'goal', source: 'endowus' },
            { id: 'g4', kind: 'goal', source: 'endowus' }
        ]));
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        overlay.querySelector('[data-tab="compare"]').click();

        const compareTable = overlay.querySelector('table.gpv-shell-compare-grid');
        expect(compareTable).toBeTruthy();
        expect(compareTable.querySelector('thead')).toBeTruthy();
        expect(compareTable.querySelector('tbody')).toBeTruthy();
        expect(compareTable.querySelector('th[scope="col"]')?.textContent).toContain('Field');
        expect(compareTable.querySelector('th[scope="row"]')).toBeTruthy();
        expect(overlay.textContent).toContain('Side-by-side view for 4 selected item(s).');
        expect(overlay.textContent).toContain('Target');
        expect(overlay.textContent).toContain('Fixed');

        const addButtons = Array.from(overlay.querySelectorAll('[data-compare-add="true"]'));
        expect(addButtons.length).toBeGreaterThan(0);
        const addAnotherButton = addButtons.find(button => button.textContent.includes('Add to compare'));
        expect(addAnotherButton).toBeTruthy();
        addAnotherButton.click();

        const notification = overlay.querySelector('#gpv-sync-toast');
        expect(notification).toBeTruthy();
        expect(notification.textContent).toContain('Compare supports up to 4 items');
        expect(JSON.parse(storage.get('gpv_shell_compare_selection'))).toHaveLength(4);
    });

    test('discovery search preserves the input node across keystrokes', () => {
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
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        overlay.querySelector('[data-tab="explore"]').click();

        const inputBefore = overlay.querySelector('#gpv-shell-search-input');
        inputBefore.value = 'ret';
        inputBefore.dispatchEvent(new window.Event('input', { bubbles: true }));
        const inputAfter = overlay.querySelector('#gpv-shell-search-input');

        expect(inputAfter).toBe(inputBefore);
        expect(inputAfter.value).toBe('ret');
    });

    test('discovery keyboard Enter on nested action button does not trigger card open handler', () => {
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
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        overlay.querySelector('[data-tab="explore"]').click();

        const addButton = overlay.querySelector('[data-compare-add="true"]');
        expect(addButton).toBeTruthy();
        addButton.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        addButton.click();

        const activeTab = overlay.querySelector('.gpv-shell-tab[data-tab="explore"]');
        expect(activeTab?.getAttribute('aria-selected')).toBe('true');
        const savedSelection = JSON.parse(storage.get('gpv_shell_compare_selection'));
        expect(savedSelection).toHaveLength(1);
        expect(savedSelection[0]).toEqual(expect.objectContaining({ source: 'endowus' }));
    });

    test('mapping refresh keeps expand state and button state aligned', () => {
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
            },
            {
                goalId: 'g3',
                totalInvestmentValue: { amount: 1000 },
                totalCumulativeReturn: { amount: -50 },
                simpleRateOfReturnPercent: -0.05
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
            },
            {
                goalId: 'g3',
                goalName: 'Retirement - Cash',
                investmentGoalType: 'CASH_MANAGEMENT',
                totalInvestmentAmount: { display: { amount: 1000 } }
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
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const expandButton = overlay.querySelector('.gpv-expand-btn');
        expandButton.click();
        expect(expandButton.textContent).toBe('Shrink');
        expect(expandButton.getAttribute('aria-pressed')).toBe('true');
        expect(overlay.querySelector('.gpv-container').classList.contains('gpv-container--expanded')).toBe(true);

        const mappingSelect = overlay.querySelector('.gpv-shell-mappings select[data-goal-id="g1"]');
        mappingSelect.value = 'Education';
        mappingSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const refreshedOverlay = document.querySelector('#gpv-overlay');
        const refreshedExpandButton = refreshedOverlay.querySelector('.gpv-expand-btn');
        expect(refreshedExpandButton.textContent).toBe('Shrink');
        expect(refreshedExpandButton.getAttribute('aria-pressed')).toBe('true');
        expect(refreshedOverlay.querySelector('.gpv-container').classList.contains('gpv-container--expanded')).toBe(true);
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
        overlay.querySelector('[data-tab="explore"]').click();
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

    test('compare uses live item data after Endowus mapping changes', () => {
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
                goalName: 'Alpha - Core',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 1200 } }
            },
            {
                goalId: 'g2',
                goalName: 'Beta - Growth',
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
        global.alert = jest.fn();

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        overlay.querySelector('[data-tab="explore"]').click();
        const goalCard = overlay.querySelector('.gpv-shell-result[data-kind="goal"][data-id="g1"][data-source="endowus"]');
        expect(goalCard).toBeTruthy();
        goalCard.querySelector('[data-compare-add="true"]').click();

        overlay.querySelector('[data-tab="compare"]').click();
        expect(overlay.textContent).toContain('Alpha');

        overlay.querySelector('[data-tab="mappings"]').click();
        const mappingSelect = overlay.querySelector('.gpv-shell-mappings select[data-goal-id="g1"]');
        mappingSelect.value = 'Beta';
        mappingSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        const refreshedOverlay = document.querySelector('#gpv-overlay');
        refreshedOverlay.querySelector('[data-tab="compare"]').click();
        const contextRows = Array.from(refreshedOverlay.querySelectorAll('.gpv-shell-compare-row'));
        const contextRow = contextRows.find(row => row.textContent.includes('Context'));
        expect(contextRow?.textContent).toContain('Beta');
    });

    test('Discovery source filter normalizes when opening on FSM route with persisted Endowus filter', () => {
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

        storage.set('gpv_shell_source_filter', 'endowus');
        storage.set('api_fsm_holdings', JSON.stringify([
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 }
        ]));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        overlay.querySelector('[data-tab="explore"]').click();

        expect(storage.get('gpv_shell_source_filter')).toBe('all');
        expect(overlay.querySelector('.gpv-shell-results').textContent).toContain('Fund A');

        const sourceFilters = Array.from(overlay.querySelectorAll('.gpv-shell-source-filters [data-source-filter]'))
            .map(button => button.dataset.sourceFilter);
        expect(sourceFilters).toEqual(['all', 'fsm']);
    });

    test('Discovery source filter normalizes when opening on Endowus route with persisted FSM filter', () => {
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
        global.GM_setValue('gpv_shell_source_filter', 'fsm');

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        overlay.querySelector('[data-tab="explore"]').click();

        expect(storage.get('gpv_shell_source_filter')).toBe('all');
        expect(overlay.querySelector('.gpv-shell-results').textContent).toContain('Retirement - Core Portfolio');

        const sourceFilters = Array.from(overlay.querySelectorAll('.gpv-shell-source-filters [data-source-filter]'))
            .map(button => button.dataset.sourceFilter);
        expect(sourceFilters).toEqual(['all', 'endowus']);
    });

    test('shell active tab normalizes invalid stored values to overview', () => {
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
        global.GM_setValue('gpv_shell_active_tab', 'legacy-shell-tab');

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        const overviewTab = overlay.querySelector('.gpv-shell-tab[data-tab="overview"]');
        const overviewPanel = overlay.querySelector('#gpv-shell-panel-overview');

        expect(storage.get('gpv_shell_active_tab')).toBe('overview');
        expect(overviewTab.getAttribute('aria-selected')).toBe('true');
        expect(overviewPanel.hidden).toBe(false);
        expect(overviewPanel.style.display).toBe('block');
    });

    test('shell tabs expose aria relationships and support keyboard navigation', () => {
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
        const tablist = overlay.querySelector('.gpv-shell-tabs');
        const overviewTab = overlay.querySelector('.gpv-shell-tab[data-tab="overview"]');
        const overviewPanel = overlay.querySelector('#gpv-shell-panel-overview');

        expect(overviewTab.getAttribute('role')).toBe('tab');
        expect(overviewTab.getAttribute('aria-controls')).toBe('gpv-shell-panel-overview');
        expect(overviewPanel.getAttribute('role')).toBe('tabpanel');
        expect(overviewPanel.getAttribute('aria-labelledby')).toBe(overviewTab.id);

        tablist.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        const exploreTab = overlay.querySelector('.gpv-shell-tab[data-tab="explore"]');
        const explorePanel = overlay.querySelector('#gpv-shell-panel-explore');

        expect(storage.get('gpv_shell_active_tab')).toBe('explore');
        expect(exploreTab.getAttribute('aria-selected')).toBe('true');
        expect(exploreTab.getAttribute('tabindex')).toBe('0');
        expect(overviewTab.getAttribute('tabindex')).toBe('-1');
        expect(explorePanel.hidden).toBe(false);
        expect(overviewPanel.hidden).toBe(true);
    });

    test('compare selection refresh writes latest live fields to storage for off-route durability', () => {
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
        global.GM_setValue('gpv_shell_compare_selection', JSON.stringify([
            {
                id: 'goal1',
                kind: 'goal',
                source: 'endowus',
                title: 'Stale title',
                subtitle: 'Stale subtitle',
                detail: 'Stale detail'
            }
        ]));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const savedSelection = JSON.parse(storage.get('gpv_shell_compare_selection'));
        expect(savedSelection).toHaveLength(1);
        expect(savedSelection[0]).toEqual(expect.objectContaining({
            id: 'goal1',
            kind: 'goal',
            source: 'endowus',
            title: 'Retirement - Core Portfolio'
        }));
        expect(savedSelection[0].subtitle).not.toBe('Stale subtitle');
        expect(savedSelection[0].detail).not.toBe('Stale detail');
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

    test('compare keeps off-route items while showing live FSM portfolio labels', () => {
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
        storage.set('fsm_assignment_by_code', JSON.stringify({ AAA: 'core' }));
        storage.set('gpv_shell_compare_selection', JSON.stringify([
            { id: 'goal-x', kind: 'goal', source: 'endowus', title: 'Legacy Endowus Item', subtitle: 'Old', detail: 'Old' }
        ]));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        overlay.querySelector('[data-tab="explore"]').click();
        const results = overlay.querySelector('.gpv-shell-results');
        expect(results.getAttribute('role')).toBe('list');
        const resultCard = results.querySelector('.gpv-shell-result');
        expect(resultCard.getAttribute('tabindex')).toBe('0');
        expect(resultCard.querySelector('[data-discovery-open="true"]')).toBeTruthy();

        const addToCompare = resultCard.querySelector('[data-compare-add="true"]');
        addToCompare.click();

        overlay.querySelector('[data-tab="compare"]').click();
        const rows = Array.from(overlay.querySelectorAll('.gpv-shell-compare-row'));
        const portfolioRow = rows.find(row => row.querySelector('.gpv-shell-compare-label')?.textContent === 'Portfolio');
        expect(portfolioRow.textContent).toContain('Core (core)');

        const savedSelection = JSON.parse(storage.get('gpv_shell_compare_selection'));
        expect(savedSelection).toEqual([
            expect.objectContaining({ id: 'goal-x', kind: 'goal', source: 'endowus' }),
            expect.objectContaining({ id: 'AAA', kind: 'holding', source: 'fsm' })
        ]);
    });

    test('FSM compare includes saved target and fixed values from storage', () => {
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
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1200 },
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'UNIT_TRUST', currentValueLcy: 800 }
        ]));
        storage.set('fsm_assignment_by_code', JSON.stringify({ AAA: 'unassigned', BBB: 'unassigned' }));
        storage.set('fsm_target_pct_BBB', 22.5);
        storage.set('fsm_fixed_AAA', true);
        storage.set('gpv_shell_compare_selection', JSON.stringify([
            { id: 'AAA', kind: 'holding', source: 'fsm' },
            { id: 'BBB', kind: 'holding', source: 'fsm' }
        ]));

        const exportsModule = require('../goal_portfolio_viewer.user.js');
        exportsModule.init();
        exportsModule.showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        overlay.querySelector('[data-tab="compare"]').click();

        expect(overlay.textContent).toContain('22.50%');
        const compareRows = Array.from(overlay.querySelectorAll('.gpv-shell-compare-row'));
        const fixedRow = compareRows.find(row => row.querySelector('.gpv-shell-compare-label')?.textContent === 'Fixed');
        expect(fixedRow).toBeTruthy();
        expect(fixedRow.textContent).toContain('Yes');
        expect(fixedRow.textContent).toContain('No');
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
        expect(overlay.querySelector('[data-tab="overview"]')).toBeTruthy();
        expect(overlay.querySelector('[data-tab="explore"]')).toBeTruthy();
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
        expect(overlay.textContent).toContain('Readiness');
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
