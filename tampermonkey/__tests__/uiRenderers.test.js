const { setupDom, teardownDom } = require('./helpers/domSetup');

describe('UI renderers', () => {
    let exportsModule;

    beforeAll(() => {
        jest.resetModules();
        setupDom();

        global.GM_setValue = jest.fn();
        global.GM_getValue = jest.fn();
        global.GM_deleteValue = jest.fn();
        global.GM_cookie = { list: jest.fn() };

        const responseFactory = body => ({
            clone: () => responseFactory(body),
            json: () => Promise.resolve(body),
            ok: true,
            status: 200
        });

        window.fetch = jest.fn(() => Promise.resolve(responseFactory({})));

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

        exportsModule = require('../goal_portfolio_viewer.user.js');
    });

    afterAll(() => {
        if (exportsModule?.SyncManager?.stopAutoSync) {
            exportsModule.SyncManager.stopAutoSync();
        }
        jest.useRealTimers();
        teardownDom();
        delete global.GM_setValue;
        delete global.GM_getValue;
        delete global.GM_deleteValue;
        delete global.GM_cookie;
        delete global.XMLHttpRequest;
    });

    test('renderSummaryView renders cards and wires selection', () => {
        const { renderSummaryView } = exportsModule;
        if (typeof renderSummaryView !== 'function') {
            return;
        }
        const contentDiv = document.createElement('div');
        const onSelect = jest.fn();
        const viewModel = {
            buckets: [
                {
                    bucketName: 'Alpha',
                    endingBalanceDisplay: '$1,000.00',
                    returnDisplay: '$50.00',
                    growthDisplay: '5.00%',
                    returnClass: 'positive',
                    goalTypes: [
                        {
                            goalType: 'GENERAL_WEALTH_ACCUMULATION',
                            displayName: 'Investment',
                            endingBalanceDisplay: '$1,000.00',
                            returnDisplay: '$50.00',
                            growthDisplay: '5.00%',
                            returnClass: 'positive'
                        }
                    ]
                },
                {
                    bucketName: 'Beta',
                    endingBalanceDisplay: '$500.00',
                    returnDisplay: '$-10.00',
                    growthDisplay: '-2.00%',
                    returnClass: 'negative',
                    goalTypes: []
                }
            ]
        };

        renderSummaryView(contentDiv, viewModel, onSelect);

        const cards = contentDiv.querySelectorAll('.gpv-bucket-card');
        expect(cards).toHaveLength(2);
        expect(cards[0].querySelector('.gpv-bucket-title').textContent).toBe('Alpha');
        cards[0].click();
        expect(onSelect).toHaveBeenCalledWith('Alpha');
    });

    test('createLineChartSvg renders chart elements', () => {
        const { createLineChartSvg } = exportsModule;
        if (typeof createLineChartSvg !== 'function') {
            return;
        }
        const series = [
            { date: '2024-01-01', amount: 100 },
            { date: '2024-01-02', amount: 120 },
            { date: '2024-01-03', amount: 110 }
        ];

        const svg = createLineChartSvg(series, 400, 140);
        expect(svg.tagName.toLowerCase()).toBe('svg');
        expect(svg.querySelectorAll('path').length).toBeGreaterThan(0);
        expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
    });

    test('createLineChartSvg renders empty state for insufficient data', () => {
        const { createLineChartSvg } = exportsModule;
        if (typeof createLineChartSvg !== 'function') {
            return;
        }
        const svgEmpty = createLineChartSvg([], 400, 140);
        const emptyLabel = svgEmpty.querySelector('.gpv-performance-chart-empty');
        expect(emptyLabel).toBeTruthy();
        expect(emptyLabel.textContent).toBe('No chart data');

        const svgSingle = createLineChartSvg([{ date: '2024-01-01', amount: 100 }], 400, 140);
        const singleLabel = svgSingle.querySelector('.gpv-performance-chart-empty');
        expect(singleLabel).toBeTruthy();
    });

    test('chart dimension helpers clamp sizes', () => {
        const { getChartHeightForWidth, getChartDimensions } = exportsModule;
        if (typeof getChartHeightForWidth !== 'function' || typeof getChartDimensions !== 'function') {
            return;
        }
        expect(getChartHeightForWidth(50)).toBeGreaterThanOrEqual(90);
        expect(getChartHeightForWidth(1200)).toBeLessThanOrEqual(180);

        const dims = getChartDimensions({
            getBoundingClientRect: () => ({ width: 320, height: 140 })
        });
        expect(dims.width).toBe(320);
        expect(dims.height).toBeGreaterThanOrEqual(90);
    });

    test('buildPerformanceWindowGrid formats values and classes', () => {
        const { buildPerformanceWindowGrid } = exportsModule;
        const grid = buildPerformanceWindowGrid({
            oneMonth: 0.1,
            sixMonth: -0.02,
            ytd: 0,
            oneYear: null,
            threeYear: undefined
        });

        const tiles = grid.querySelectorAll('.gpv-performance-window-tile');
        expect(tiles).toHaveLength(5);

        const values = grid.querySelectorAll('.gpv-performance-window-value');
        expect(values[0].textContent).toContain('10.00%');
        expect(values[1].classList.contains('negative')).toBe(true);
    });

    test('buildPerformanceWindowGrid shows fallback for missing values', () => {
        const { buildPerformanceWindowGrid } = exportsModule;
        const grid = buildPerformanceWindowGrid({
            oneMonth: null,
            sixMonth: undefined,
            ytd: 0,
            oneYear: null,
            threeYear: undefined
        });

        const values = grid.querySelectorAll('.gpv-performance-window-value');
        expect(values[0].textContent).toBe('-');
        expect(values[0].classList.contains('positive')).toBe(false);
        expect(values[0].classList.contains('negative')).toBe(false);
        expect(values[2].textContent).toContain('0.00%');
        expect(values[2].classList.contains('positive')).toBe(true);
    });
});
