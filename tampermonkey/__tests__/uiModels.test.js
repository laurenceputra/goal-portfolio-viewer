/**
 * Unit tests for UI state and view model helpers
 */

const {
    getReturnClass,
    calculatePercentOfType,
    calculateGoalDiff,
    calculateFixedTargetPercent,
    calculateRemainingTargetPercent,
    isRemainingTargetAboveThreshold,
    getProjectedInvestmentValue,
    buildAllocationDriftModel,
    buildDiffCellData,
    resolveGoalTypeActionTarget,
    buildSummaryViewModel,
    buildBucketDetailViewModel,
    buildHealthStatus,
    buildAttentionDriftReason,
    buildPlanningModel,
    collectGoalIds,
    collectAllGoalIds,
    buildGoalTargetById,
    buildGoalFixedById,
    buildMergedInvestmentData,
    getPerformanceCacheKey,
    getBucketViewModePreference,
    setBucketViewModePreference,
    getCollapseState,
    setCollapseState,
    normalizeBucketViewMode,
    normalizeBooleanPreference
} = require('../goal_portfolio_viewer.user.js');

const {
    createBucketMapFixture,
    createPerformanceCacheFixture,
    createProjectedInvestmentFixture,
    createGoalTargetFixture,
    createGoalFixedFixture
} = require('./fixtures/uiFixtures');

describe('format helpers', () => {
    test('should return correct return class', () => {
        expect(getReturnClass(10)).toBe('positive');
        expect(getReturnClass(-1)).toBe('negative');
        expect(getReturnClass('invalid')).toBe('');
    });

    test('should calculate percent of type', () => {
        expect(calculatePercentOfType(50, 200)).toBe(25);
        expect(calculatePercentOfType(0, 0)).toBe(0);
    });

    test('should calculate goal diff display', () => {
        const diffInfo = calculateGoalDiff(1200, 60, 2500);
        expect(diffInfo.diffClass).toBe('negative');
        expect(diffInfo.diffAmount).toBe(-300);
        expect(diffInfo.driftPercent).toBeCloseTo(-0.2, 5);
        expect(diffInfo.driftAmount).toBe(-300);
    });

    test('should handle invalid goal diff inputs', () => {
        expect(calculateGoalDiff(100, null, 200)).toEqual({
            diffAmount: null,
            diffClass: '',
            driftPercent: null,
            driftAmount: null
        });
    });

    test('should build diff cell data', () => {
        const diffData = buildDiffCellData(1200, 60, 2500);
        expect(diffData.diffDisplay).toMatch(/-?\$?-?300\.00/);
        expect(diffData.diffClassName).toBe('gpv-diff-cell negative');
    });

    test('should calculate fixed target percent', () => {
        expect(calculateFixedTargetPercent(500, 2000)).toBe(25);
        expect(calculateFixedTargetPercent(500, 0)).toBeNull();
    });

    test('should calculate remaining target percent', () => {
        expect(calculateRemainingTargetPercent([60, 25])).toBe(15);
        expect(calculateRemainingTargetPercent([100, 10])).toBe(-10);
    });

    test('should detect high remaining target percentage', () => {
        expect(isRemainingTargetAboveThreshold(2)).toBe(false);
        expect(isRemainingTargetAboveThreshold(2.01)).toBe(true);
        expect(isRemainingTargetAboveThreshold('invalid')).toBe(false);
    });
});

describe('projected and goal helpers', () => {
    test('should get projected investment value', () => {
        const projected = createProjectedInvestmentFixture();
        expect(getProjectedInvestmentValue(projected, 'Retirement', 'GENERAL_WEALTH_ACCUMULATION')).toBe(500);
        expect(getProjectedInvestmentValue(projected, 'Retirement', 'CASH_MANAGEMENT')).toBe(0);
    });

    test('should return default diff cell data on invalid inputs', () => {
        const diffData = buildDiffCellData(100, null, 0);
        expect(diffData.diffDisplay).toBe('-');
        expect(diffData.diffClassName).toBe('gpv-diff-cell');
    });
});

describe('resolveGoalTypeActionTarget', () => {
    test('should resolve target input action', () => {
        const targetInput = { dataset: { goalId: 'g1' } };
        const target = {
            closest: selector => (selector === '.gpv-target-input' ? targetInput : null)
        };
        expect(resolveGoalTypeActionTarget(target)).toEqual({
            type: 'target',
            element: targetInput
        });
    });

    test('should resolve fixed toggle action', () => {
        const fixedToggle = { dataset: { goalId: 'g2' } };
        const target = {
            closest: selector => (selector === '.gpv-fixed-toggle-input' ? fixedToggle : null)
        };
        expect(resolveGoalTypeActionTarget(target)).toEqual({
            type: 'fixed',
            element: fixedToggle
        });
    });

    test('should return null when target is not resolvable', () => {
        expect(resolveGoalTypeActionTarget(null)).toBeNull();
        expect(resolveGoalTypeActionTarget({})).toBeNull();
    });
});

describe('view model builders', () => {
    test('should build summary view model', () => {
        const bucketMap = createBucketMapFixture();
        const projected = createProjectedInvestmentFixture();
        const targets = createGoalTargetFixture();
        const fixed = createGoalFixedFixture();
        const viewModel = buildSummaryViewModel(bucketMap, projected, targets, fixed);
        expect(viewModel.buckets).toHaveLength(2);
        expect(viewModel.buckets[0].bucketName).toBe('Education');
        expect(viewModel.buckets[1].bucketName).toBe('Retirement');
        expect(viewModel.showAllocationDriftHint).toBe(true);
        const retirement = viewModel.buckets[1];
        expect(retirement.returnClass).toBe('positive');
        expect(retirement.goalTypes[0].goalType).toBe('GENERAL_WEALTH_ACCUMULATION');
        expect(retirement.goalTypes[1].returnClass).toBe('negative');
        expect(retirement.goalTypes[0].allocationDriftDisplay).toBe('20.00%');
        expect(retirement.goalTypes[0].allocationDriftClass).toBe('gpv-drift--green');
        expect(Array.isArray(viewModel.attentionItems)).toBe(true);
        expect(viewModel.attentionItems.length).toBeGreaterThan(0);
        expect(retirement.health.label).toBe('Needs Setup');
        expect(retirement.health.reasons.length).toBeGreaterThan(0);
        expect(retirement.health.score).toBeUndefined();
    });

    test('should build bucket detail view model with projections', () => {
        const bucketMap = createBucketMapFixture();
        const projected = createProjectedInvestmentFixture();
        const targets = createGoalTargetFixture();
        const fixed = createGoalFixedFixture();
        const viewModel = buildBucketDetailViewModel({
            bucketName: 'Retirement',
            bucketMap,
            projectedInvestmentsState: projected,
            goalTargetById: targets,
            goalFixedById: fixed
        });
        expect(viewModel.bucketName).toBe('Retirement');
        const goalTypeModel = viewModel.goalTypes[0];
        expect(goalTypeModel.goals.map(goal => goal.goalName)).toEqual([
            'Retirement - Core',
            'Retirement - Growth'
        ]);
        expect(goalTypeModel.projectedAmount).toBe(500);
        expect(goalTypeModel.adjustedTotal).toBe(2500);
        expect(goalTypeModel.remainingTargetDisplay).toBe('12.00%');
        expect(goalTypeModel.remainingTargetIsHigh).toBe(true);
        expect(goalTypeModel.allocationDriftDisplay).toBe('20.00%');
        expect(goalTypeModel.allocationDriftClass).toBe('gpv-drift--green');
        expect(goalTypeModel.planning).toBeTruthy();
        expect(goalTypeModel.planning.targetCoverageLabel).toContain('Target total is');
        expect(viewModel.health.label).toBe('Needs Setup');
        expect(viewModel.health.score).toBeUndefined();
        const firstGoal = goalTypeModel.goals[0];
        expect(firstGoal.percentOfType).toBe(60);
        expect(firstGoal.diffDisplay).toMatch(/0\.00/);
        expect(firstGoal.targetDisplay).toBe('48.00');
        expect(firstGoal.isFixed).toBe(true);
        expect(firstGoal.driftDisplay).toBe('0.00% (SGD\u00A00.00)');
        expect(firstGoal.driftClass).toBe('gpv-drift--green');
    });

    test('should map per-goal window returns with fallback', () => {
        const bucketMap = createBucketMapFixture();
        const cacheFixture = createPerformanceCacheFixture();
        const storage = new Map();
        const previousGet = global.GM_getValue;
        const previousSet = global.GM_setValue;
        const previousDelete = global.GM_deleteValue;
        global.GM_getValue = (key, fallback = null) => (storage.has(key) ? storage.get(key) : fallback);
        global.GM_setValue = (key, value) => storage.set(key, value);
        global.GM_deleteValue = key => storage.delete(key);
        try {
            Object.entries(cacheFixture).forEach(([goalId, payload]) => {
                storage.set(getPerformanceCacheKey(goalId), JSON.stringify(payload));
            });
            const viewModel = buildBucketDetailViewModel({
                bucketName: 'Retirement',
                bucketMap,
                projectedInvestmentsState: null,
                goalTargetById: null,
                goalFixedById: null
            });
            const goalTypeModel = viewModel.goalTypes[0];
            const coreGoal = goalTypeModel.goals.find(goal => goal.goalId === 'g1');
            expect(coreGoal.windowReturnDisplays).toEqual({
                oneMonth: '+0.42%',
                sixMonth: '+2.31%',
                ytd: '-0.80%',
                oneYear: '+8.05%',
                threeYear: '-'
            });
            const growthGoal = goalTypeModel.goals.find(goal => goal.goalId === 'g2');
            expect(growthGoal.windowReturnDisplays.oneMonth).toBe('-');
            expect(growthGoal.windowReturnDisplays.sixMonth).toBe('+1.23%');
            expect(growthGoal.windowReturnDisplays.threeYear).toBe('-');
            const cashGoal = viewModel.goalTypes[1].goals[0];
            expect(cashGoal.windowReturnDisplays.oneMonth).toBe('-');
        } finally {
            global.GM_getValue = previousGet;
            global.GM_setValue = previousSet;
            global.GM_deleteValue = previousDelete;
        }
    });

    test('should return empty buckets for invalid summary input', () => {
        expect(buildSummaryViewModel(null)).toEqual({
            buckets: [],
            showAllocationDriftHint: false,
            attentionItems: []
        });
        expect(buildSummaryViewModel('invalid')).toEqual({
            buckets: [],
            showAllocationDriftHint: false,
            attentionItems: []
        });
    });

    test('should handle summary buckets without meta or goal types', () => {
        const bucketMap = {
            Lonely: {}
        };
        const viewModel = buildSummaryViewModel(bucketMap);
        expect(viewModel.buckets).toHaveLength(1);
        expect(viewModel.buckets[0].endingBalanceAmount).toBe(0);
        expect(viewModel.buckets[0].goalTypes).toEqual([]);
        expect(viewModel.showAllocationDriftHint).toBe(false);
    });

    test('should build bucket detail without projected investments or targets', () => {
        const bucketMap = createBucketMapFixture();
        const viewModel = buildBucketDetailViewModel({
            bucketName: 'Retirement',
            bucketMap,
            projectedInvestmentsState: null,
            goalTargetById: null,
            goalFixedById: null
        });
        const goalTypeModel = viewModel.goalTypes[0];
        expect(goalTypeModel.projectedAmount).toBe(0);
        expect(goalTypeModel.remainingTargetDisplay).toBe('100.00%');
        expect(goalTypeModel.remainingTargetIsHigh).toBe(true);
        expect(goalTypeModel.goals[0].targetDisplay).toBe('');
        expect(goalTypeModel.goals[0].returnPercentDisplay).toBe('10.00%');
    });

    test('should apply remaining target to diff when single target is missing', () => {
        const bucketMap = {
            Solo: {
                _meta: { endingBalanceTotal: 1000 },
                GENERAL_WEALTH_ACCUMULATION: {
                    endingBalanceAmount: 1000,
                    totalCumulativeReturn: 0,
                    goals: [
                        {
                            goalId: 'g1',
                            goalName: 'Solo - Fixed',
                            endingBalanceAmount: 600,
                            totalCumulativeReturn: 0
                        },
                        {
                            goalId: 'g2',
                            goalName: 'Solo - Missing',
                            endingBalanceAmount: 400,
                            totalCumulativeReturn: 0
                        }
                    ]
                }
            }
        };
        const viewModel = buildBucketDetailViewModel({
            bucketName: 'Solo',
            bucketMap,
            projectedInvestmentsState: null,
            goalTargetById: {},
            goalFixedById: { g1: true }
        });
        const goalTypeModel = viewModel.goalTypes[0];
        expect(goalTypeModel.remainingTargetDisplay).toBe('0.00%');
        const missingGoal = goalTypeModel.goals.find(goal => goal.goalId === 'g2');
        expect(missingGoal.targetDisplay).toBe('');
        expect(missingGoal.diffDisplay).toMatch(/0\.00/);
    });

    test('should treat fixed goal coverage as assigned in planning health', () => {
        const bucketMap = {
            FixedOnly: {
                _meta: { endingBalanceTotal: 1000 },
                GENERAL_WEALTH_ACCUMULATION: {
                    endingBalanceAmount: 1000,
                    totalCumulativeReturn: 20,
                    goals: [
                        {
                            goalId: 'fixed-1',
                            goalName: 'FixedOnly - Core',
                            endingBalanceAmount: 1000,
                            totalCumulativeReturn: 20
                        }
                    ]
                }
            }
        };
        const viewModel = buildBucketDetailViewModel({
            bucketName: 'FixedOnly',
            bucketMap,
            projectedInvestmentsState: null,
            goalTargetById: {},
            goalFixedById: { 'fixed-1': true }
        });
        expect(viewModel.health.label).toBe('Healthy');
        expect(viewModel.health.reasons).toEqual([]);
        expect(viewModel.goalTypes[0].planning.targetCoverageLabel).toBeNull();
    });

    test('should not flag all-zero targets as setup intent', () => {
        const bucketMap = {
            Zeroed: {
                _meta: { endingBalanceTotal: 1000 },
                GENERAL_WEALTH_ACCUMULATION: {
                    endingBalanceAmount: 1000,
                    totalCumulativeReturn: 0,
                    goals: [
                        {
                            goalId: 'z1',
                            goalName: 'Zeroed - One',
                            endingBalanceAmount: 600,
                            totalCumulativeReturn: 0
                        },
                        {
                            goalId: 'z2',
                            goalName: 'Zeroed - Two',
                            endingBalanceAmount: 400,
                            totalCumulativeReturn: 0
                        }
                    ]
                }
            }
        };
        const viewModel = buildBucketDetailViewModel({
            bucketName: 'Zeroed',
            bucketMap,
            projectedInvestmentsState: null,
            goalTargetById: { z1: 0, z2: 0 },
            goalFixedById: {}
        });
        expect(viewModel.health.label).toBe('Healthy');
        expect(viewModel.health.reasons).toEqual([]);
        expect(viewModel.goalTypes[0].planning.targetCoverageLabel).toBeNull();
    });

    test('should only add Endowus drift attention for red severity', () => {
        const planning = buildPlanningModel({
            adjustedTotal: 2500,
            projectedAmount: 0,
            goals: [
                {
                    goalId: 'y1',
                    goalName: 'Yellow - One',
                    endingBalanceAmount: 800,
                    targetPercent: 40
                },
                {
                    goalId: 'y2',
                    goalName: 'Yellow - Two',
                    endingBalanceAmount: 1700,
                    targetPercent: 60
                }
            ]
        });
        expect(planning.scenarioAmount).toBe(0);
        expect(buildAttentionDriftReason('gpv-drift--yellow', 'x')).toBeNull();
        expect(buildAttentionDriftReason('gpv-drift--green', 'x')).toBeNull();
        expect(buildAttentionDriftReason('gpv-drift--red', 'x')).toBe('x');
    });

    test('should keep health status labels without scores', () => {
        expect(buildHealthStatus({ reasons: [], setupRequired: false })).toEqual({
            label: 'Healthy',
            className: 'gpv-health--healthy',
            reasons: []
        });
        expect(buildHealthStatus({ reasons: ['Missing target'], setupRequired: true })).toEqual({
            label: 'Needs Setup',
            className: 'gpv-health--setup',
            reasons: ['Missing target']
        });
    });

    test('should keep diff empty when remaining target is negative', () => {
        const bucketMap = {
            Stretch: {
                _meta: { endingBalanceTotal: 1000 },
                GENERAL_WEALTH_ACCUMULATION: {
                    endingBalanceAmount: 1000,
                    totalCumulativeReturn: 0,
                    goals: [
                        {
                            goalId: 'g1',
                            goalName: 'Stretch - One',
                            endingBalanceAmount: 300,
                            totalCumulativeReturn: 0
                        },
                        {
                            goalId: 'g2',
                            goalName: 'Stretch - Two',
                            endingBalanceAmount: 300,
                            totalCumulativeReturn: 0
                        },
                        {
                            goalId: 'g3',
                            goalName: 'Stretch - Missing',
                            endingBalanceAmount: 400,
                            totalCumulativeReturn: 0
                        }
                    ]
                }
            }
        };
        const viewModel = buildBucketDetailViewModel({
            bucketName: 'Stretch',
            bucketMap,
            projectedInvestmentsState: null,
            goalTargetById: { g1: 80, g2: 30 },
            goalFixedById: {}
        });
        const goalTypeModel = viewModel.goalTypes[0];
        const missingGoal = goalTypeModel.goals.find(goal => goal.goalId === 'g3');
        expect(missingGoal.targetDisplay).toBe('');
        expect(missingGoal.diffDisplay).toBe('-');
        expect(goalTypeModel.allocationDriftDisplay).toBe('-');
        expect(goalTypeModel.allocationDriftClass).toBe('');
        expect(goalTypeModel.allocationDriftAvailable).toBe(false);
    });

    test('should return null for missing bucket', () => {
        const bucketMap = createBucketMapFixture();
        expect(buildBucketDetailViewModel({
            bucketName: 'Missing',
            bucketMap,
            projectedInvestmentsState: {},
            goalTargetById: {},
            goalFixedById: {}
        })).toBeNull();
    });

    test('should honor explicit goal bucket assignment over goal name bucket', () => {
        const performanceData = [{
            goalId: 'goal-1',
            totalInvestmentValue: { amount: 1000 },
            totalCumulativeReturn: { amount: 100 },
            simpleRateOfReturnPercent: 0.1
        }];
        const investibleData = [{
            goalId: 'goal-1',
            goalName: 'Retirement - Core',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
            totalInvestmentAmount: { display: { amount: 1000 } }
        }];
        const summaryData = [{
            goalId: 'goal-1',
            goalName: 'Retirement - Core',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        const defaultBuckets = buildMergedInvestmentData(performanceData, investibleData, summaryData);
        expect(Object.keys(defaultBuckets)).toEqual(['Retirement']);

        const assignedBuckets = buildMergedInvestmentData(
            performanceData,
            investibleData,
            summaryData,
            { 'goal-1': 'Wealth Builder' }
        );
        expect(Object.keys(assignedBuckets)).toEqual(['Wealth Builder']);
    });
});

describe('collectGoalIds and buildGoalTargetById', () => {
    test('should collect goal ids from bucket', () => {
        const bucketMap = createBucketMapFixture();
        const goalIds = collectGoalIds(bucketMap.Retirement).sort();
        expect(goalIds).toEqual(['g1', 'g2', 'g3']);
    });

    test('should collect all goal ids across buckets', () => {
        const bucketMap = createBucketMapFixture();
        const goalIds = collectAllGoalIds(bucketMap).sort();
        expect(goalIds).toEqual(['g1', 'g2', 'g3']);
    });

    test('should build goal target map with getter', () => {
        const map = buildGoalTargetById(['a', 'b'], id => (id === 'a' ? 20 : null));
        expect(map).toEqual({ a: 20 });
    });

    test('should build goal fixed map with getter', () => {
        const map = buildGoalFixedById(['a', 'b'], id => id === 'b');
        expect(map).toEqual({ b: true });
    });
});

describe('buildAllocationDriftModel', () => {
    test('should use target amounts as denominator', () => {
        const goalModels = [
            { endingBalanceAmount: 800, targetPercent: 40, isFixed: false },
            { endingBalanceAmount: 1200, targetPercent: 60, isFixed: false }
        ];
        const model = buildAllocationDriftModel(goalModels, 2500);
        expect(model.allocationDriftPercent).toBeCloseTo(0.4, 5);
        expect(model.allocationDriftDisplay).toBe('40.00%');
        expect(model.allocationDriftClass).toBe('gpv-drift--yellow');
        expect(model.allocationDriftAvailable).toBe(true);
    });

    test('should include zero-balance goals when targets are positive', () => {
        const goalModels = [
            { endingBalanceAmount: 0, targetPercent: 50, isFixed: false },
            { endingBalanceAmount: 1000, targetPercent: 50, isFixed: false }
        ];
        const model = buildAllocationDriftModel(goalModels, 1000);
        expect(model.allocationDriftPercent).toBeCloseTo(2, 5);
        expect(model.allocationDriftDisplay).toBe('200.00%');
        expect(model.allocationDriftClass).toBe('gpv-drift--red');
    });

    test('should skip non-positive target amounts', () => {
        const goalModels = [
            { endingBalanceAmount: 100, targetPercent: 0, isFixed: false }
        ];
        const model = buildAllocationDriftModel(goalModels, 1000);
        expect(model.allocationDriftPercent).toBe(0);
        expect(model.allocationDriftDisplay).toBe('0.00%');
        expect(model.allocationDriftClass).toBe('gpv-drift--green');
        expect(model.allocationDriftAvailable).toBe(true);
    });

    test('should return unavailable for invalid inputs', () => {
        expect(buildAllocationDriftModel([], 1000)).toEqual({
            allocationDriftPercent: null,
            allocationDriftDisplay: '-',
            allocationDriftClass: '',
            allocationDriftAvailable: false
        });
        expect(buildAllocationDriftModel([{ endingBalanceAmount: 100, targetPercent: 50 }], 0)).toEqual({
            allocationDriftPercent: null,
            allocationDriftDisplay: '-',
            allocationDriftClass: '',
            allocationDriftAvailable: false
        });
    });
});

describe('declutter view state helpers', () => {
    let storage;
    let previousGet;
    let previousSet;
    let previousDelete;

    beforeEach(() => {
        storage = new Map();
        previousGet = global.GM_getValue;
        previousSet = global.GM_setValue;
        previousDelete = global.GM_deleteValue;
        global.GM_getValue = (key, fallback = null) => (storage.has(key) ? storage.get(key) : fallback);
        global.GM_setValue = (key, value) => storage.set(key, value);
        global.GM_deleteValue = key => storage.delete(key);
    });

    afterEach(() => {
        global.GM_getValue = previousGet;
        global.GM_setValue = previousSet;
        global.GM_deleteValue = previousDelete;
    });

    test('should normalize bucket view modes', () => {
        expect(normalizeBucketViewMode('performance')).toBe('performance');
        expect(normalizeBucketViewMode('allocation')).toBe('allocation');
        expect(normalizeBucketViewMode('invalid')).toBe('allocation');
    });

    test('should default bucket mode to allocation', () => {
        expect(getBucketViewModePreference()).toBe('allocation');
    });

    test('should persist bucket mode preference', () => {
        expect(setBucketViewModePreference('performance')).toBe('performance');
        expect(getBucketViewModePreference()).toBe('performance');
    });

    test('should normalize boolean preferences with fallback', () => {
        expect(normalizeBooleanPreference('true', false)).toBe(true);
        expect(normalizeBooleanPreference('false', true)).toBe(false);
        expect(normalizeBooleanPreference('invalid', true)).toBe(true);
    });

    test('should persist collapse state by bucket and section', () => {
        setCollapseState('Retirement', 'GENERAL_WEALTH_ACCUMULATION', 'performance', false);
        expect(getCollapseState('Retirement', 'GENERAL_WEALTH_ACCUMULATION', 'performance')).toBe(false);
        expect(getCollapseState('Retirement', 'GENERAL_WEALTH_ACCUMULATION', 'projection')).toBe(true);
    });
});
