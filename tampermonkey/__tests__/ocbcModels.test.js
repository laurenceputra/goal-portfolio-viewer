const { setupDom, teardownDom } = require('./helpers/domSetup');

describe('OCBC model helpers', () => {
    let exportsModule;
    let previousGet;
    let previousSet;
    let previousDelete;

    beforeAll(() => {
        jest.resetModules();
        setupDom({ url: 'https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/dashboard' });
        global.GM_setValue = jest.fn();
        global.GM_getValue = jest.fn((_, fallback = null) => fallback);
        global.GM_deleteValue = jest.fn();
        global.GM_cookie = { list: jest.fn((_, cb) => (cb ? cb([]) : [])) };
        exportsModule = require('../goal_portfolio_viewer.user.js');
    });

    beforeEach(() => {
        previousGet = global.GM_getValue;
        previousSet = global.GM_setValue;
        previousDelete = global.GM_deleteValue;
    });

    afterEach(() => {
        global.GM_getValue = previousGet;
        global.GM_setValue = previousSet;
        global.GM_deleteValue = previousDelete;
    });

    afterAll(() => {
        teardownDom();
    });

    test('buildOcbcOverviewModel sorts portfolios and resolves status text', () => {
        const { buildOcbcOverviewModel } = exportsModule;
        expect(typeof buildOcbcOverviewModel).toBe('function');

        const model = buildOcbcOverviewModel({
            assets: [
                { portfolioNo: '20', code: 'A', currentValueLcy: 100 },
                { portfolioNo: '3', code: 'B', currentValueLcy: 50 },
                { portfolioNo: '10', code: 'C', currentValueLcy: 75 }
            ],
            liabilities: [],
            holdingsByPortfolio: {
                20: { lastSeenAt: '2026-01-01T00:00:00.000Z' },
                3: { lastSeenAt: '2026-01-02T00:00:00.000Z' }
            },
            latestPortfolioNos: new Set(['10'])
        });
        const assetsSection = model.sections.find(section => section.sectionView === 'assets');
        expect(assetsSection.cards.map(card => card.portfolioNo)).toEqual(['10', '20', '3']);
        expect(assetsSection.cards[0].statusText).toBe('Current session');
        expect(assetsSection.cards[1].statusText).toContain('Cached');
    });

    test('buildOcbcPlanningModel aggregates unassigned/coverage/drift reasons', () => {
        const { buildOcbcPlanningModel } = exportsModule;
        expect(typeof buildOcbcPlanningModel).toBe('function');

        global.GM_getValue = jest.fn((key, fallback = null) => {
            if (key === 'ocbc') {
                return JSON.stringify({
                    allocationBuckets: {},
                    subPortfolios: {},
                    assignmentByCode: {},
                    orderByScope: {},
                    targetsByScope: {
                        'assets|P1|s1|': 80
                    }
                });
            }
            return fallback;
        });

        const model = buildOcbcPlanningModel({
            activeView: 'assets',
            rows: [
                { portfolioNo: 'P1', code: 'A', productType: 'UNIT_TRUST', currentValueLcy: 100 },
                { portfolioNo: 'P1', code: 'B', productType: 'UNIT_TRUST', currentValueLcy: 100 }
            ],
            bucketsByView: { assets: {}, liabilities: {} },
            subPortfoliosByView: {
                assets: {
                    P1: [{ id: 's1', name: 'Sub 1', archived: false }]
                }
            },
            assignmentByCode: { A: 's1' }
        });

        expect(model.unassignedInstruments).toBe(1);
        expect(model.coverageConfiguredCount).toBe(1);
        expect(model.coverageCompleteCount).toBe(0);
        expect(model.health.reasons).toEqual(expect.arrayContaining([
            '1 instrument unassigned to a sub-portfolio',
            'Target coverage incomplete in 1 portfolio scope(s)',
            '1 sub-portfolio scope(s) show high drift'
        ]));
    });

    test('groupOcbcRowsBySubPortfolio assigns rows exactly once', () => {
        const { groupOcbcRowsBySubPortfolio } = exportsModule;
        expect(typeof groupOcbcRowsBySubPortfolio).toBe('function');

        const rows = [
            { portfolioNo: 'P1', code: 'A', productType: 'UNIT_TRUST', currentValueLcy: 100 },
            { portfolioNo: 'P1', code: 'B', productType: 'UNIT_TRUST', currentValueLcy: 250 }
        ];
        const grouped = groupOcbcRowsBySubPortfolio(
            rows,
            [{ id: 's1', name: 'Sub 1', archived: false }],
            { A: 's1' }
        );

        const totalGroupedValue = grouped.reduce((sum, subPortfolio) => (
            sum + subPortfolio.rows.reduce((inner, row) => inner + Number(row.currentValueLcy || 0), 0)
        ), 0);
        const groupedHoldingsCount = grouped.reduce((sum, subPortfolio) => sum + subPortfolio.rows.length, 0);

        expect(totalGroupedValue).toBe(350);
        expect(groupedHoldingsCount).toBe(rows.length);
        expect(grouped.find(item => item.id === 's1')?.rows).toHaveLength(1);
        expect(grouped[0].rows).toHaveLength(1);
    });
});
