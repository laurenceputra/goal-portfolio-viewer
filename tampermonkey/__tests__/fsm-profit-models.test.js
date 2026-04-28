const { setupDom, teardownDom } = require('./helpers/domSetup');

describe('FSM profit models', () => {
    function mockStorageWithFsmConfig({ holdings, portfolios = [], assignments = {}, extra = {} }) {
        global.GM_getValue = jest.fn((key, fallback = null) => {
            if (key === 'api_fsm_holdings') {
                return JSON.stringify(holdings || []);
            }
            if (key === 'fsm_portfolios') {
                return JSON.stringify(portfolios);
            }
            if (key === 'fsm_assignment_by_code') {
                return JSON.stringify(assignments);
            }
            if (Object.prototype.hasOwnProperty.call(extra, key)) {
                return extra[key];
            }
            return fallback;
        });
    }

    function getProjectionInput(overlay) {
        return overlay.querySelector('.gpv-projected-input');
    }

    beforeEach(() => {
        jest.resetModules();
        setupDom({ url: 'https://secure.fundsupermart.com/fsmone/holdings/investments' });
        global.GM_setValue = jest.fn();
        global.GM_getValue = jest.fn((_, fallback = null) => fallback);
        global.GM_deleteValue = jest.fn();
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };
        global.history = window.history;
    });

    afterEach(() => {
        teardownDom();
    });

    test('buildFsmScopedSummary aggregates profit from profitValueLcy', () => {
        const { init, showOverlay } = require('../goal_portfolio_viewer.user.js');

        global.GM_getValue = jest.fn((key, fallback = null) => {
            if (key === 'api_fsm_holdings') {
                return JSON.stringify([
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
                ]);
            }
            return fallback;
        });

        init();
        showOverlay();

        const overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).toContain('Profit: +8.70% (+SGD 160.00)');
    });

    test('buildFsmDisplayRows uses provided percent and derives missing percent', () => {
        const { init, showOverlay } = require('../goal_portfolio_viewer.user.js');

        global.GM_getValue = jest.fn((key, fallback = null) => {
            if (key === 'api_fsm_holdings') {
                return JSON.stringify([
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
                        profitValueLcy: 40
                    }
                ]);
            }
            return fallback;
        });

        init();
        showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const rows = Array.from(overlay.querySelectorAll('table tbody tr'));
        const rowByTicker = rows.reduce((acc, row) => {
            const ticker = row.querySelector('td[data-col="ticker"]').textContent.trim();
            acc[ticker] = row;
            return acc;
        }, {});

        expect(rowByTicker.AAPL.querySelector('td[data-col="profit"]').textContent.trim()).toBe('+10.00% (+SGD 120.00)');
        expect(rowByTicker.BOND.querySelector('td[data-col="profit"]').textContent.trim()).toBe('+5.26% (+SGD 40.00)');
    });

    test('formatProfitDisplay normalizes 1 and supports ratio inputs', () => {
        const { formatProfitDisplay } = require('../goal_portfolio_viewer.user.js');
        expect(formatProfitDisplay(120, 0.01)).toBe('+SGD\u00A0120.00 (+1.00%)');
        expect(formatProfitDisplay(-25, -0.01)).toBe('-SGD\u00A025.00 (-1.00%)');
    });

    test('formatFsmProfitDisplay renders percent-first with standard spacing', () => {
        const { formatFsmProfitDisplay } = require('../goal_portfolio_viewer.user.js');
        expect(formatFsmProfitDisplay(120, 0.01)).toBe('+1.00% (+SGD 120.00)');
        expect(formatFsmProfitDisplay(-3334.65, -0.076)).toBe('-7.60% (-SGD 3,334.65)');
    });

    test('getFsmProfitClass applies threshold boundaries', () => {
        const { getFsmProfitClass } = require('../goal_portfolio_viewer.user.js');
        expect(getFsmProfitClass(0.0501)).toBe('positive');
        expect(getFsmProfitClass(0.05)).toBe('');
        expect(getFsmProfitClass(-0.05)).toBe('');
        expect(getFsmProfitClass(-0.0501)).toBe('negative');
    });

    test('detail row resolves 0.5 percent scale using derived value percent', () => {
        const { init, showOverlay } = require('../goal_portfolio_viewer.user.js');

        global.GM_getValue = jest.fn((key, fallback = null) => {
            if (key === 'api_fsm_holdings') {
                return JSON.stringify([
                    {
                        code: 'AAA',
                        subcode: 'AAPL',
                        name: 'Fund A',
                        productType: 'UNIT_TRUST',
                        currentValueLcy: 1000,
                        profitValueLcy: 5,
                        profitPercentLcy: 0.5
                    }
                ]);
            }
            return fallback;
        });

        init();
        showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const firstRow = overlay.querySelector('table tbody tr');
        expect(firstRow.querySelector('td[data-col="profit"]').textContent.trim()).toBe('+0.50% (+SGD 5.00)');
    });

    test('detail row keeps ratio-form percent above 1 when it matches derived value', () => {
        const { init, showOverlay } = require('../goal_portfolio_viewer.user.js');

        global.GM_getValue = jest.fn((key, fallback = null) => {
            if (key === 'api_fsm_holdings') {
                return JSON.stringify([
                    {
                        code: 'AAA',
                        subcode: 'AAPL',
                        name: 'Fund A',
                        productType: 'UNIT_TRUST',
                        currentValueLcy: 250,
                        profitValueLcy: 150,
                        profitPercentLcy: 1.5
                    }
                ]);
            }
            return fallback;
        });

        init();
        showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const firstRow = overlay.querySelector('table tbody tr');
        expect(firstRow.querySelector('td[data-col="profit"]').textContent.trim()).toBe('+150.00% (+SGD 150.00)');
    });

    test('detail row avoids misreporting percent scale when only percent is provided', () => {
        const { init, showOverlay } = require('../goal_portfolio_viewer.user.js');

        global.GM_getValue = jest.fn((key, fallback = null) => {
            if (key === 'api_fsm_holdings') {
                return JSON.stringify([
                    {
                        code: 'AAA',
                        subcode: 'AAPL',
                        name: 'Fund A',
                        productType: 'UNIT_TRUST',
                        currentValueLcy: 1000,
                        profitPercentLcy: 1.5
                    }
                ]);
            }
            return fallback;
        });

        init();
        showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const firstRow = overlay.querySelector('table tbody tr');
        expect(firstRow.querySelector('td[data-col="profit"]').textContent.trim()).toBe('-');
    });

    test('detail row applies FSM profit color classes', () => {
        const { init, showOverlay } = require('../goal_portfolio_viewer.user.js');

        global.GM_getValue = jest.fn((key, fallback = null) => {
            if (key === 'api_fsm_holdings') {
                return JSON.stringify([
                    {
                        code: 'P1',
                        subcode: 'POS',
                        name: 'Positive Fund',
                        productType: 'UNIT_TRUST',
                        currentValueLcy: 1060,
                        profitValueLcy: 60
                    },
                    {
                        code: 'N1',
                        subcode: 'NEU',
                        name: 'Neutral Fund',
                        productType: 'UNIT_TRUST',
                        currentValueLcy: 1050,
                        profitValueLcy: 50
                    },
                    {
                        code: 'R1',
                        subcode: 'RED',
                        name: 'Negative Fund',
                        productType: 'UNIT_TRUST',
                        currentValueLcy: 940,
                        profitValueLcy: -60
                    }
                ]);
            }
            return fallback;
        });

        init();
        showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const rows = Array.from(overlay.querySelectorAll('table tbody tr'));
        const rowByTicker = rows.reduce((acc, row) => {
            const ticker = row.querySelector('td[data-col="ticker"]').textContent.trim();
            acc[ticker] = row;
            return acc;
        }, {});

        expect(rowByTicker.POS.querySelector('td[data-col="profit"]').classList.contains('positive')).toBe(true);
        expect(rowByTicker.NEU.querySelector('td[data-col="profit"]').className.trim()).toBe('');
        expect(rowByTicker.RED.querySelector('td[data-col="profit"]').classList.contains('negative')).toBe(true);
    });

    test('detail row avoids ambiguous percent scale when only sub-1 percent is provided', () => {
        const { init, showOverlay } = require('../goal_portfolio_viewer.user.js');

        global.GM_getValue = jest.fn((key, fallback = null) => {
            if (key === 'api_fsm_holdings') {
                return JSON.stringify([
                    {
                        code: 'AAA',
                        subcode: 'AAPL',
                        name: 'Fund A',
                        productType: 'UNIT_TRUST',
                        currentValueLcy: 1000,
                        profitPercentLcy: 0.5
                    }
                ]);
            }
            return fallback;
        });

        init();
        showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();

        overlay = document.querySelector('#gpv-overlay');
        const firstRow = overlay.querySelector('table tbody tr');
        expect(firstRow.querySelector('td[data-col="profit"]').textContent.trim()).toBe('-');
    });

    test('FSM projection input appears for a user portfolio scope only', () => {
        const { init, showOverlay, getFsmHoldingIdentity } = require('../goal_portfolio_viewer.user.js');
        const holdings = [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1000 },
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'UNIT_TRUST', currentValueLcy: 1000 }
        ];
        const portfolioId = 'income';
        const assignments = {
            [getFsmHoldingIdentity(holdings[0])]: portfolioId,
            [getFsmHoldingIdentity(holdings[1])]: portfolioId
        };
        mockStorageWithFsmConfig({
            holdings,
            portfolios: [{ id: portfolioId, name: 'Income', archived: false }],
            assignments
        });

        init();
        showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        expect(getProjectionInput(overlay)).toBeNull();

        const portfolioCard = Array.from(overlay.querySelectorAll('.gpv-fsm-overview-card')).find(card => (
            card.querySelector('.gpv-fsm-overview-card-title')?.textContent.trim() === 'Income'
        ));
        portfolioCard.click();

        overlay = document.querySelector('#gpv-overlay');
        expect(getProjectionInput(overlay)).toBeTruthy();
        expect(overlay.textContent).toContain('Projected Investment');
    });

    test('FSM projection input does not appear for All and Unassigned scopes', () => {
        const { init, showOverlay, getFsmHoldingIdentity } = require('../goal_portfolio_viewer.user.js');
        const holdings = [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1000 },
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'UNIT_TRUST', currentValueLcy: 1000 }
        ];
        const portfolioId = 'income';
        const assignments = {
            [getFsmHoldingIdentity(holdings[0])]: portfolioId,
            [getFsmHoldingIdentity(holdings[1])]: 'unassigned'
        };
        mockStorageWithFsmConfig({
            holdings,
            portfolios: [{ id: portfolioId, name: 'Income', archived: false }],
            assignments
        });

        init();
        showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const viewAllBtn = Array.from(overlay.querySelectorAll('button')).find(btn => btn.textContent.includes('View all holdings'));
        viewAllBtn.click();
        overlay = document.querySelector('#gpv-overlay');
        expect(getProjectionInput(overlay)).toBeNull();
        expect(overlay.textContent).not.toContain('Set a projected investment amount to see a what-if split.');
        expect(overlay.textContent).not.toContain('Projected Investment:');

        const scopeSelect = overlay.querySelector('.gpv-fsm-filter-toolbar select.gpv-select');
        scopeSelect.value = 'unassigned';
        scopeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
        overlay = document.querySelector('#gpv-overlay');
        expect(getProjectionInput(overlay)).toBeNull();
        expect(overlay.textContent).not.toContain('Set a projected investment amount to see a what-if split.');
        expect(overlay.textContent).not.toContain('Projected Investment:');
    });

    test('FSM projected amount updates planning split and is isolated per portfolio', () => {
        const { init, showOverlay, getFsmHoldingIdentity } = require('../goal_portfolio_viewer.user.js');
        const holdings = [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1000 },
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'UNIT_TRUST', currentValueLcy: 1000 }
        ];
        const p1 = 'income';
        const p2 = 'growth';
        const firstHoldingId = getFsmHoldingIdentity(holdings[0]);
        const secondHoldingId = getFsmHoldingIdentity(holdings[1]);
        mockStorageWithFsmConfig({
            holdings,
            portfolios: [
                { id: p1, name: 'Income', archived: false },
                { id: p2, name: 'Growth', archived: false }
            ],
            assignments: {
                [firstHoldingId]: p1,
                [secondHoldingId]: p1
            },
            extra: {
                [`fsm_target_pct_${firstHoldingId}`]: 50,
                [`fsm_target_pct_${secondHoldingId}`]: 50
            }
        });

        init();
        showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const portfolioCard = Array.from(overlay.querySelectorAll('.gpv-fsm-overview-card')).find(card => (
            card.querySelector('.gpv-fsm-overview-card-title')?.textContent.trim() === 'Income'
        ));
        portfolioCard.click();

        overlay = document.querySelector('#gpv-overlay');
        const projectionInput = getProjectionInput(overlay);
        projectionInput.focus();
        projectionInput.value = '1000';
        projectionInput.dispatchEvent(new window.Event('input', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        expect(document.activeElement).toBe(getProjectionInput(overlay));
        expect(overlay.textContent).toContain('Projected Investment: SGD\u00A01,000.00');
        expect(overlay.textContent).toContain('AAPL: SGD\u00A0500.00');
        expect(overlay.textContent).toContain('BOND: SGD\u00A0500.00');

        const scopeSelect = overlay.querySelector('.gpv-fsm-filter-toolbar select.gpv-select');
        scopeSelect.value = p2;
        scopeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
        overlay = document.querySelector('#gpv-overlay');
        const growthProjectionInput = getProjectionInput(overlay);
        expect(growthProjectionInput).toBeTruthy();
        expect(growthProjectionInput.value).toBe('');

        scopeSelect.value = p1;
        scopeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
        overlay = document.querySelector('#gpv-overlay');
        expect(getProjectionInput(overlay).value).toBe('1000');
    });

    test('FSM negative projected amount is rejected and not persisted', () => {
        const { init, showOverlay, getFsmHoldingIdentity } = require('../goal_portfolio_viewer.user.js');
        const holdings = [
            { code: 'AAA', subcode: 'AAPL', name: 'Fund A', productType: 'UNIT_TRUST', currentValueLcy: 1000 },
            { code: 'BBB', subcode: 'BOND', name: 'Fund B', productType: 'UNIT_TRUST', currentValueLcy: 1000 }
        ];
        const portfolioId = 'income';
        const firstHoldingId = getFsmHoldingIdentity(holdings[0]);
        const secondHoldingId = getFsmHoldingIdentity(holdings[1]);
        mockStorageWithFsmConfig({
            holdings,
            portfolios: [
                { id: portfolioId, name: 'Income', archived: false },
                { id: 'growth', name: 'Growth', archived: false }
            ],
            assignments: {
                [firstHoldingId]: portfolioId,
                [secondHoldingId]: portfolioId
            },
            extra: {
                [`fsm_target_pct_${firstHoldingId}`]: 50,
                [`fsm_target_pct_${secondHoldingId}`]: 50
            }
        });

        init();
        showOverlay();

        let overlay = document.querySelector('#gpv-overlay');
        const portfolioCard = Array.from(overlay.querySelectorAll('.gpv-fsm-overview-card')).find(card => (
            card.querySelector('.gpv-fsm-overview-card-title')?.textContent.trim() === 'Income'
        ));
        portfolioCard.click();

        overlay = document.querySelector('#gpv-overlay');
        const projectionInput = getProjectionInput(overlay);
        projectionInput.value = '-100';
        projectionInput.dispatchEvent(new window.Event('input', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        expect(overlay.textContent).not.toContain('Projected Investment:');
        expect(overlay.textContent).not.toContain('AAPL: SGD\u00A0');
        expect(overlay.textContent).not.toContain('BOND: SGD\u00A0');

        const scopeSelect = overlay.querySelector('.gpv-fsm-filter-toolbar select.gpv-select');
        scopeSelect.value = 'growth';
        scopeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
        scopeSelect.value = portfolioId;
        scopeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        overlay = document.querySelector('#gpv-overlay');
        expect(getProjectionInput(overlay).value).toBe('');
        expect(overlay.textContent).not.toContain('Projected Investment:');
    });
});
