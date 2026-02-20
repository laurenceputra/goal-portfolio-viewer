/**
 * Unit tests for Goal Portfolio Viewer utility functions
 * 
 * These tests import pure logic functions directly from the userscript.
 * The userscript conditionally exports functions when running in Node.js,
 * allowing tests to target the real implementation without code duplication.
 */

const {
    utils,
    storageKeys,
    getDisplayGoalType,
    sortGoalTypes,
    sortGoalsByName,
    formatMoney,
    formatPercent,
    formatGrowthPercentFromEndingBalance,
    calculateGoalDiff,
    calculateFixedTargetPercent,
    calculateRemainingTargetPercent,
    isRemainingTargetAboveThreshold,
    buildGoalTypeAllocationModel,
    buildMergedInvestmentData,
    getPerformanceCacheKey,
    isCacheFresh,
    isCacheRefreshAllowed,
    formatPercentage,
    isDashboardRoute,
    isFsmInvestmentsRoute,
    normalizeTimeSeriesData,
    normalizePerformanceResponse,
    getLatestTimeSeriesPoint,
    findNearestPointOnOrBefore,
    getPerformanceDate,
    getWindowStartDate,
    calculateReturnFromTimeSeries,
    mapReturnsTableToWindowReturns,
    mergeTimeSeriesByDate,
    getTimeSeriesWindow,
    extractAmount,
    calculateWeightedAverage,
    calculateWeightedWindowReturns,
    buildPerformanceMetricsRows,
    summarizePerformanceMetrics,
    derivePerformanceWindows,
    parseJsonSafely
} = require('../goal_portfolio_viewer.user.js');

describe('storage key helpers', () => {
    test('should generate consistent storage keys', () => {
        const cases = [
            { name: 'goal target', actual: storageKeys.goalTarget('goal123'), expected: 'goal_target_pct_goal123' },
            { name: 'goal target empty', actual: storageKeys.goalTarget(''), expected: 'goal_target_pct_' },
            { name: 'goal target special', actual: storageKeys.goalTarget('goal-123-abc'), expected: 'goal_target_pct_goal-123-abc' },
            { name: 'goal fixed', actual: storageKeys.goalFixed('goal123'), expected: 'goal_fixed_goal123' },
            { name: 'goal fixed empty', actual: storageKeys.goalFixed(''), expected: 'goal_fixed_' },
            { name: 'fsm target', actual: storageKeys.fsmTarget('AAA'), expected: 'fsm_target_pct_AAA' },
            { name: 'fsm fixed', actual: storageKeys.fsmFixed('AAA'), expected: 'fsm_fixed_AAA' },
            { name: 'fsm tag', actual: storageKeys.fsmTag('AAA'), expected: 'fsm_tag_AAA' },
            { name: 'fsm drift setting', actual: storageKeys.fsmDriftSetting('warningPct'), expected: 'fsm_drift_setting_warningPct' },
            {
                name: 'projected investment empty',
                actual: storageKeys.projectedInvestment('', ''),
                expected: '|'
            },
            {
                name: 'performance cache',
                actual: getPerformanceCacheKey('goal-123'),
                expected: 'gpv_performance_goal-123'
            }
        ];

        cases.forEach(({ name: _name, actual, expected }) => {
            expect(actual).toBe(expected);
        });
    });
});

describe('normalizeString', () => {
    test('should return fallback for null/undefined', () => {
        expect(utils.normalizeString(null, 'fallback')).toBe('fallback');
        expect(utils.normalizeString(undefined, 'fallback')).toBe('fallback');
    });

    test('should trim strings and collapse whitespace-only to fallback', () => {
        expect(utils.normalizeString('  Hello  ', 'fallback')).toBe('Hello');
        expect(utils.normalizeString('   ', 'fallback')).toBe('fallback');
    });

    test('should coerce non-string types', () => {
        expect(utils.normalizeString(123)).toBe('123');
        expect(utils.normalizeString(false)).toBe('false');
        expect(utils.normalizeString({ key: 'value' })).toBe('[object Object]');
    });
});

describe('indexBy', () => {
    test('should index items by key', () => {
        const items = [
            { goalId: 'a', value: 1 },
            { goalId: 'b', value: 2 }
        ];
        const result = utils.indexBy(items, item => item.goalId);
        expect(result.a.value).toBe(1);
        expect(result.b.value).toBe(2);
    });

    test('should ignore empty or null keys', () => {
        const items = [
            { goalId: '', value: 1 },
            { goalId: null, value: 2 },
            { goalId: 'c', value: 3 }
        ];
        const result = utils.indexBy(items, item => item.goalId);
        expect(result.c.value).toBe(3);
        expect(Object.keys(result)).toHaveLength(1);
    });

    test('should overwrite duplicate keys with last value', () => {
        const items = [
            { goalId: 'dup', value: 1 },
            { goalId: 'dup', value: 2 }
        ];
        const result = utils.indexBy(items, item => item.goalId);
        expect(result.dup.value).toBe(2);
    });

    test('should return empty object for invalid inputs', () => {
        expect(utils.indexBy(null, () => 'a')).toEqual({});
        expect(utils.indexBy([], null)).toEqual({});
    });
});

describe('getProjectedInvestmentKey', () => {
    test('should generate correct key with pipe separator', () => {
        expect(storageKeys.projectedInvestment('Retirement', 'GENERAL_WEALTH_ACCUMULATION'))
            .toBe('Retirement|GENERAL_WEALTH_ACCUMULATION');
    });

    test('should preserve special characters', () => {
        expect(storageKeys.projectedInvestment('Emergency-Fund', 'CASH_MANAGEMENT'))
            .toBe('Emergency-Fund|CASH_MANAGEMENT');
    });

    test('should encode separator characters', () => {
        expect(storageKeys.projectedInvestment('Bucket|Name', 'TYPE|A'))
            .toBe('Bucket%7CName|TYPE%7CA');
    });
});

describe('extractBucketName', () => {
    test('should return Uncategorized for invalid inputs', () => {
        expect(utils.extractBucketName(null)).toBe('Uncategorized');
        expect(utils.extractBucketName(123)).toBe('Uncategorized');
        expect(utils.extractBucketName('   ')).toBe('Uncategorized');
    });

    test('should return full name when no separator', () => {
        expect(utils.extractBucketName('Emergency Fund')).toBe('Emergency Fund');
    });

    test('should return bucket prefix when separator exists', () => {
        expect(utils.extractBucketName('Retirement - Core Portfolio')).toBe('Retirement');
    });

    test('should handle multiple separators', () => {
        expect(utils.extractBucketName('Bucket - Goal - Extra')).toBe('Bucket');
    });
});

describe('getDisplayGoalType', () => {
    test('should convert GENERAL_WEALTH_ACCUMULATION to Investment', () => {
        expect(getDisplayGoalType('GENERAL_WEALTH_ACCUMULATION')).toBe('Investment');
    });

    test('should convert CASH_MANAGEMENT to Cash', () => {
        expect(getDisplayGoalType('CASH_MANAGEMENT')).toBe('Cash');
    });

    test('should convert PASSIVE_INCOME to Income', () => {
        expect(getDisplayGoalType('PASSIVE_INCOME')).toBe('Income');
    });

    test('should return unknown types as-is', () => {
        expect(getDisplayGoalType('UNKNOWN_TYPE')).toBe('UNKNOWN_TYPE');
        expect(getDisplayGoalType('SRS')).toBe('SRS');
    });

    test('should handle empty string', () => {
        expect(getDisplayGoalType('')).toBe('Unknown');
    });
});

describe('sortGoalTypes', () => {
    test('should sort in preferred order', () => {
        const input = ['CASH_MANAGEMENT', 'GENERAL_WEALTH_ACCUMULATION', 'PASSIVE_INCOME'];
        const expected = ['GENERAL_WEALTH_ACCUMULATION', 'PASSIVE_INCOME', 'CASH_MANAGEMENT'];
        expect(sortGoalTypes(input)).toEqual(expected);
    });

    test('should handle partial preferred types', () => {
        const input = ['CASH_MANAGEMENT', 'OTHER_TYPE'];
        const expected = ['CASH_MANAGEMENT', 'OTHER_TYPE'];
        expect(sortGoalTypes(input)).toEqual(expected);
    });

    test('should sort non-preferred types alphabetically', () => {
        const input = ['ZTYPE', 'ATYPE', 'MTYPE'];
        const expected = ['ATYPE', 'MTYPE', 'ZTYPE'];
        expect(sortGoalTypes(input)).toEqual(expected);
    });

    test('should handle mixed preferred and non-preferred types', () => {
        const input = ['ZTYPE', 'GENERAL_WEALTH_ACCUMULATION', 'ATYPE', 'CASH_MANAGEMENT'];
        const expected = ['GENERAL_WEALTH_ACCUMULATION', 'CASH_MANAGEMENT', 'ATYPE', 'ZTYPE'];
        expect(sortGoalTypes(input)).toEqual(expected);
    });

    test('should handle empty array', () => {
        expect(sortGoalTypes([])).toEqual([]);
    });

    test('should not modify original array', () => {
        const input = ['CASH_MANAGEMENT', 'GENERAL_WEALTH_ACCUMULATION'];
        const original = [...input];
        sortGoalTypes(input);
        expect(input).toEqual(original);
    });
});

describe('sortGoalsByName', () => {
    test('should sort goals by name case-insensitively', () => {
        const input = [
            { goalId: 'b', goalName: 'beta' },
            { goalId: 'a', goalName: 'Alpha' }
        ];
        const sorted = sortGoalsByName(input);
        expect(sorted.map(goal => goal.goalName)).toEqual(['Alpha', 'beta']);
    });

    test('should use goalId as tiebreaker when names match', () => {
        const input = [
            { goalId: '2', goalName: 'Same' },
            { goalId: '1', goalName: 'same' }
        ];
        const sorted = sortGoalsByName(input);
        expect(sorted.map(goal => goal.goalId)).toEqual(['1', '2']);
    });

    test('should return empty array for invalid input', () => {
        expect(sortGoalsByName(null)).toEqual([]);
    });

    test('should return cached result for same goal IDs', () => {
        const input1 = [
            { goalId: 'b', goalName: 'beta' },
            { goalId: 'a', goalName: 'Alpha' }
        ];
        const sorted1 = sortGoalsByName(input1);
        
        // Call again with same goal IDs (same order)
        const input2 = [
            { goalId: 'b', goalName: 'beta' },
            { goalId: 'a', goalName: 'Alpha' }
        ];
        const sorted2 = sortGoalsByName(input2);
        
        // Should return the same reference (cached)
        expect(sorted2).toBe(sorted1);
    });

    test('should recalculate when goal IDs change', () => {
        const input1 = [
            { goalId: 'b', goalName: 'beta' },
            { goalId: 'a', goalName: 'Alpha' }
        ];
        const sorted1 = sortGoalsByName(input1);
        
        // Call with different goal IDs
        const input2 = [
            { goalId: 'c', goalName: 'Charlie' },
            { goalId: 'a', goalName: 'Alpha' }
        ];
        const sorted2 = sortGoalsByName(input2);
        
        // Should return a different reference (recalculated)
        expect(sorted2).not.toBe(sorted1);
        expect(sorted2.map(goal => goal.goalName)).toEqual(['Alpha', 'Charlie']);
    });

    test('should recalculate when goal order changes', () => {
        const input1 = [
            { goalId: 'a', goalName: 'Alpha' },
            { goalId: 'b', goalName: 'beta' }
        ];
        const sorted1 = sortGoalsByName(input1);
        
        // Call with same goals but different order (different cache key)
        const input2 = [
            { goalId: 'b', goalName: 'beta' },
            { goalId: 'a', goalName: 'Alpha' }
        ];
        const sorted2 = sortGoalsByName(input2);
        
        // Should recalculate since input order changed (cache key changed)
        expect(sorted2).not.toBe(sorted1);
        // But results should still be sorted the same way
        expect(sorted2.map(goal => goal.goalName)).toEqual(['Alpha', 'beta']);
    });

    test('should handle empty arrays', () => {
        const result1 = sortGoalsByName([]);
        const result2 = sortGoalsByName([]);
        
        // Should cache empty array results
        expect(result2).toBe(result1);
        expect(result2).toEqual([]);
    });

    test('should update timestamp on cache hit', () => {
        const input = [
            { goalId: 'b', goalName: 'beta' },
            { goalId: 'a', goalName: 'Alpha' }
        ];
        const sorted1 = sortGoalsByName(input);
        
        // Call again with same input - should be cached
        const sorted2 = sortGoalsByName(input);
        expect(sorted2).toBe(sorted1);
        
        // Timestamp should be updated (cache is still fresh)
        const sorted3 = sortGoalsByName(input);
        expect(sorted3).toBe(sorted1);
    });

    test('should evict cached results after expiry', () => {
        const input = [
            { goalId: 'z', goalName: 'Zulu' },
            { goalId: 'a', goalName: 'Alpha' }
        ];
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        const nowRef = { value: 0 };
        const dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => nowRef.value);

        const sorted1 = sortGoalsByName(input);
        const sorted2 = sortGoalsByName(input);
        expect(sorted2).toBe(sorted1);

        nowRef.value = weekMs + 1;
        const sorted3 = sortGoalsByName(input);
        expect(sorted3).not.toBe(sorted1);
        expect(sorted3.map(goal => goal.goalName)).toEqual(['Alpha', 'Zulu']);

        dateNowSpy.mockRestore();
    });
});

describe('formatMoney', () => {
    test('should format positive numbers correctly', () => {
        expect(formatMoney(1000)).toMatch(/1,000\.00/);
        expect(formatMoney(1234567.89)).toMatch(/1,234,567\.89/);
    });

    test('should format zero', () => {
        expect(formatMoney(0)).toMatch(/0\.00/);
    });

    test('should format negative numbers', () => {
        expect(formatMoney(-1000)).toMatch(/-?\d?,?1,000\.00/);
    });

    test('should handle decimal precision', () => {
        expect(formatMoney(10.5)).toMatch(/10\.50/);
        expect(formatMoney(10.999)).toMatch(/11\.00/);
    });

    test('should return dash for invalid inputs', () => {
        expect(formatMoney(NaN)).toBe('-');
        expect(formatMoney(undefined)).toBe('-');
        expect(formatMoney(null)).toBe('-');
        expect(formatMoney('invalid')).toBe('-');
    });

    test('should return dash for non-finite numbers', () => {
        expect(formatMoney(Infinity)).toBe('-');
        expect(formatMoney(-Infinity)).toBe('-');
    });

    test('should handle very large numbers', () => {
        const result = formatMoney(1000000000);
        expect(result).toMatch(/1,000,000,000\.00/);
    });
});

describe('formatPercent', () => {
    test('should return fallback for invalid inputs', () => {
        expect(formatPercent(null)).toBe('-');
        expect(formatPercent('invalid')).toBe('-');
        expect(formatPercent(10, { multiplier: 'invalid' })).toBe('-');
    });

    test('should respect custom fallback', () => {
        expect(formatPercent(null, { fallback: 'n/a' })).toBe('n/a');
    });

    test('should format with default multiplier', () => {
        expect(formatPercent(12.3456)).toBe('12.35%');
    });

    test('should format with custom multiplier', () => {
        expect(formatPercent(0.1234, { multiplier: 100 })).toBe('12.34%');
    });

    test('should format ratio with sign when enabled', () => {
        expect(formatPercent(0.1, { multiplier: 100, showSign: true })).toBe('+10.00%');
        expect(formatPercent(-0.025, { multiplier: 100, showSign: true })).toBe('-2.50%');
    });

    test('should format ratio without sign by default', () => {
        expect(formatPercent(0.1, { multiplier: 100 })).toBe('10.00%');
        expect(formatPercent(0)).toBe('0.00%');
    });

    test('should format percent with optional sign', () => {
        expect(formatPercent(12.5)).toBe('12.50%');
        expect(formatPercent(12.5, { showSign: true })).toBe('+12.50%');
    });
});

describe('formatGrowthPercentFromEndingBalance', () => {
    test('should calculate growth percentage correctly for positive returns', () => {
        // Principal: 100, Return: 10, Ending Balance: 110
        // Growth = 10 / 100 * 100 = 10%
        expect(formatGrowthPercentFromEndingBalance(10, 110)).toBe('10.00%');
    });

    test('should calculate growth percentage for negative returns', () => {
        // Principal: 100, Return: -10, Ending Balance: 90
        // Growth = -10 / 100 * 100 = -10%
        expect(formatGrowthPercentFromEndingBalance(-10, 90)).toBe('-10.00%');
    });

    test('should handle zero return', () => {
        expect(formatGrowthPercentFromEndingBalance(0, 100)).toBe('0.00%');
    });

    test('should return dash for zero denominator', () => {
        expect(formatGrowthPercentFromEndingBalance(100, 100)).toBe('-');
    });

    test('should return dash for invalid inputs', () => {
        expect(formatGrowthPercentFromEndingBalance(NaN, 100)).toBe('-');
        expect(formatGrowthPercentFromEndingBalance(10, NaN)).toBe('-');
        expect(formatGrowthPercentFromEndingBalance(Infinity, 100)).toBe('-');
    });

    test('should handle string inputs that are convertible', () => {
        expect(formatGrowthPercentFromEndingBalance('10', '110')).toBe('10.00%');
    });

    test('should handle large percentage gains', () => {
        // Principal: 100, Return: 200, Ending Balance: 300
        // Growth = 200 / 100 * 100 = 200%
        expect(formatGrowthPercentFromEndingBalance(200, 300)).toBe('200.00%');
    });

    test('should handle fractional percentages', () => {
        // Principal: 100, Return: 0.5, Ending Balance: 100.5
        // Growth = 0.5 / 100 * 100 = 0.5%
        expect(formatGrowthPercentFromEndingBalance(0.5, 100.5)).toBe('0.50%');
    });
});

describe('calculateGoalDiff', () => {
    test('should return null diff when target is missing', () => {
        expect(calculateGoalDiff(1000, null, 2000)).toEqual({ diffAmount: null, diffClass: '' });
    });

    test('should calculate diff and class when within threshold', () => {
        const result = calculateGoalDiff(1000, 50, 2000);
        expect(result.diffAmount).toBe(0);
        expect(result.diffClass).toBe('positive');
    });

    test('should mark diff as negative when over threshold', () => {
        const result = calculateGoalDiff(1000, 80, 2000);
        expect(result.diffAmount).toBe(-600);
        expect(result.diffClass).toBe('negative');
    });

    test('should mark diff as positive when at threshold', () => {
        const result = calculateGoalDiff(1000, 95, 1000);
        expect(result.diffAmount).toBe(50);
        expect(result.diffClass).toBe('positive');
    });

    test('should handle zero or negative current amounts', () => {
        const zeroResult = calculateGoalDiff(0, 50, 1000);
        expect(zeroResult.diffAmount).toBe(-500);
        expect(zeroResult.diffClass).toBe('negative');

        const negativeResult = calculateGoalDiff(-100, 50, 1000);
        expect(negativeResult.diffAmount).toBe(-600);
        expect(negativeResult.diffClass).toBe('negative');
    });

    test('should return null diff for invalid totals', () => {
        expect(calculateGoalDiff(1000, 10, 0)).toEqual({ diffAmount: null, diffClass: '' });
    });
});

describe('calculateFixedTargetPercent', () => {
    test('should calculate fixed percent of total', () => {
        expect(calculateFixedTargetPercent(500, 2000)).toBe(25);
    });

    test('should return null for invalid totals', () => {
        expect(calculateFixedTargetPercent(100, 0)).toBeNull();
    });
});

describe('calculateRemainingTargetPercent', () => {
    test('should return remaining percent after valid targets', () => {
        expect(calculateRemainingTargetPercent([20, 30])).toBe(50);
    });

    test('should ignore invalid target values', () => {
        expect(calculateRemainingTargetPercent([20, 'x', null])).toBe(80);
    });

    test('should return 100 for non-array input', () => {
        expect(calculateRemainingTargetPercent(null)).toBe(100);
    });
});

describe('isRemainingTargetAboveThreshold', () => {
    test('should return true when above threshold', () => {
        expect(isRemainingTargetAboveThreshold(5, 2)).toBe(true);
    });

    test('should return false when equal to threshold', () => {
        expect(isRemainingTargetAboveThreshold(2, 2)).toBe(false);
    });

    test('should return false for invalid input', () => {
        expect(isRemainingTargetAboveThreshold('x', 2)).toBe(false);
    });
});

describe('buildGoalTypeAllocationModel', () => {
    test('should sort goals alphabetically by name', () => {
        const goals = [
            { goalId: 'g2', goalName: 'Beta Goal', endingBalanceAmount: 50, totalCumulativeReturn: 0 },
            { goalId: 'g1', goalName: 'alpha goal', endingBalanceAmount: 50, totalCumulativeReturn: 0 }
        ];
        const model = buildGoalTypeAllocationModel(goals, 100, 100, {}, {});
        expect(model.goalModels.map(goal => goal.goalName)).toEqual(['alpha goal', 'Beta Goal']);
    });

    test('should use goalId as tiebreaker when goal names match', () => {
        const goals = [
            { goalId: 'g2', goalName: 'Emergency Fund', endingBalanceAmount: 50, totalCumulativeReturn: 0 },
            { goalId: 'g1', goalName: 'Emergency Fund', endingBalanceAmount: 50, totalCumulativeReturn: 0 }
        ];
        const model = buildGoalTypeAllocationModel(goals, 100, 100, {}, {});
        expect(model.goalModels.map(goal => goal.goalId)).toEqual(['g1', 'g2']);
    });

    test('should calculate goal allocation with fixed targets', () => {
        const goals = [
            { goalId: 'g1', goalName: 'Goal 1', endingBalanceAmount: 100, totalCumulativeReturn: 0 },
            { goalId: 'g2', goalName: 'Goal 2', endingBalanceAmount: 300, totalCumulativeReturn: 0 }
        ];
        const goalTargets = {};
        const goalFixed = { g1: true };
        const model = buildGoalTypeAllocationModel(goals, 400, 400, goalTargets, goalFixed);
        const goalOne = model.goalModels.find(goal => goal.goalId === 'g1');
        expect(goalOne.targetPercent).toBe(25);
        expect(model.remainingTargetPercent).toBe(0);
    });

    test('should keep explicit targets when not fixed', () => {
        const goals = [{ goalId: 'g1', goalName: 'Goal 1', endingBalanceAmount: 200, totalCumulativeReturn: 0 }];
        const goalTargets = { g1: 40 };
        const goalFixed = {};
        const model = buildGoalTypeAllocationModel(goals, 200, 200, goalTargets, goalFixed);
        expect(model.goalModels[0].targetPercent).toBe(40);
        expect(model.remainingTargetPercent).toBe(60);
    });
});

describe('isDashboardRoute', () => {
    test('should match dashboard paths with query or hash', () => {
        expect(isDashboardRoute('https://app.sg.endowus.com/dashboard')).toBe(true);
        expect(isDashboardRoute('https://app.sg.endowus.com/dashboard/')).toBe(true);
        expect(isDashboardRoute('https://app.sg.endowus.com/dashboard?x=1')).toBe(true);
        expect(isDashboardRoute('https://app.sg.endowus.com/dashboard#section')).toBe(true);
    });

    test('should reject non-dashboard paths', () => {
        expect(isDashboardRoute('https://app.sg.endowus.com/overview')).toBe(false);
    });
});




describe('isFsmInvestmentsRoute', () => {
    test('should match FSM investments path', () => {
        expect(isFsmInvestmentsRoute('https://secure.fundsupermart.com/fsmone/holdings/investments')).toBe(true);
        expect(isFsmInvestmentsRoute('https://secure.fundsupermart.com/fsmone/holdings/investments?x=1')).toBe(true);
    });

    test('should reject non-target FSM paths', () => {
        expect(isFsmInvestmentsRoute('https://secure.fundsupermart.com/fsmone/holdings')).toBe(false);
    });
});


describe('extractAmount', () => {
    test('should return number when input is numeric', () => {
        expect(extractAmount(10)).toBe(10);
    });

    test('should extract nested amount fields', () => {
        expect(extractAmount({ amount: 25 })).toBe(25);
        expect(extractAmount({ display: { amount: 50 } })).toBe(50);
    });

    test('should return null for invalid input', () => {
        expect(extractAmount({})).toBeNull();
        expect(extractAmount({ amount: 'bad' })).toBeNull();
    });
});

describe('isCacheFresh', () => {
    test('should return true when within max age', () => {
        const now = 1_000_000;
        const fetchedAt = now - 1000;
        expect(isCacheFresh(fetchedAt, 7 * 24 * 60 * 60 * 1000, now)).toBe(true);
    });

    test('should return false when stale', () => {
        const now = 1_000_000;
        const fetchedAt = now - (8 * 24 * 60 * 60 * 1000);
        expect(isCacheFresh(fetchedAt, 7 * 24 * 60 * 60 * 1000, now)).toBe(false);
    });

    test('should return false for invalid inputs', () => {
        expect(isCacheFresh('invalid', 1000, 2000)).toBe(false);
        expect(isCacheFresh(1000, 'invalid', 2000)).toBe(false);
    });

    test('should return false when exactly at max age boundary', () => {
        const now = 1_000_000;
        const maxAge = 1000;
        const fetchedAt = now - maxAge;
        // Implementation uses `nowMs - fetchedTime < maxAge`
        // When nowMs - fetchedTime === maxAge (exactly at boundary), cache is stale
        expect(isCacheFresh(fetchedAt, maxAge, now)).toBe(false);
    });

    test('should return false when one millisecond over max age', () => {
        const now = 1_000_000;
        const maxAge = 1000;
        const fetchedAt = now - maxAge - 1;
        expect(isCacheFresh(fetchedAt, maxAge, now)).toBe(false);
    });

    test('should return false for zero max age', () => {
        const now = 1_000_000;
        const fetchedAt = now;
        // maxAge <= 0 returns false
        expect(isCacheFresh(fetchedAt, 0, now)).toBe(false);
    });

    test('should handle negative max age', () => {
        const now = 1_000_000;
        const fetchedAt = now;
        expect(isCacheFresh(fetchedAt, -1000, now)).toBe(false);
    });

    test('should handle future fetchedAt timestamp', () => {
        const now = 1_000_000;
        const fetchedAt = now + 1000;
        expect(isCacheFresh(fetchedAt, 1000, now)).toBe(true);
    });

    test('should return false for NaN inputs', () => {
        expect(isCacheFresh(NaN, 1000, 2000)).toBe(false);
        expect(isCacheFresh(1000, NaN, 2000)).toBe(false);
        expect(isCacheFresh(1000, 1000, NaN)).toBe(false);
    });

    test('should return false for Infinity inputs', () => {
        expect(isCacheFresh(Infinity, 1000, 2000)).toBe(false);
        expect(isCacheFresh(1000, Infinity, 2000)).toBe(false);
        expect(isCacheFresh(1000, 1000, Infinity)).toBe(false);
    });
});

describe('isCacheRefreshAllowed', () => {
    test('should allow refresh when cache is older than min age', () => {
        const now = 1_000_000;
        const fetchedAt = now - 10_000;
        expect(isCacheRefreshAllowed(fetchedAt, 5000, now)).toBe(true);
    });

    test('should block refresh when cache is newer than min age', () => {
        const now = 1_000_000;
        const fetchedAt = now - 1000;
        expect(isCacheRefreshAllowed(fetchedAt, 5000, now)).toBe(false);
    });

    test('should return false for invalid inputs', () => {
        expect(isCacheRefreshAllowed('invalid', 1000, 2000)).toBe(false);
        expect(isCacheRefreshAllowed(1000, 'invalid', 2000)).toBe(false);
        expect(isCacheRefreshAllowed(1000, 1000, NaN)).toBe(false);
    });
});

describe('formatPercentage', () => {
    test('should format positive percentage with sign', () => {
        expect(formatPercentage(0.1234)).toBe('+12.34%');
    });

    test('should format negative percentage', () => {
        expect(formatPercentage(-0.05)).toBe('-5.00%');
    });

    test('should format zero without sign', () => {
        expect(formatPercentage(0)).toBe('0.00%');
    });

    test('should return dash for invalid input', () => {
        expect(formatPercentage('invalid')).toBe('-');
    });

    test('should return dash for null input', () => {
        expect(formatPercentage(null)).toBe('-');
    });

    test('should return dash for undefined input', () => {
        expect(formatPercentage(undefined)).toBe('-');
    });

    test('should return dash for NaN', () => {
        expect(formatPercentage(NaN)).toBe('-');
    });

    test('should return dash for Infinity', () => {
        expect(formatPercentage(Infinity)).toBe('-');
        expect(formatPercentage(-Infinity)).toBe('-');
    });

    test('should handle very small percentages', () => {
        expect(formatPercentage(0.0001)).toBe('+0.01%');
        expect(formatPercentage(-0.0001)).toBe('-0.01%');
    });

    test('should handle very large percentages', () => {
        expect(formatPercentage(10)).toBe('+1000.00%');
        expect(formatPercentage(-5)).toBe('-500.00%');
    });
});

describe('normalizeTimeSeriesData', () => {
    test('should normalize and sort by date', () => {
        const result = normalizeTimeSeriesData([
            { date: '2024-06-02', amount: 110 },
            { date: '2024-06-01', amount: 100 }
        ]);
        expect(result[0].dateString).toBe('2024-06-01');
        expect(result[1].dateString).toBe('2024-06-02');
    });

    test('should skip invalid entries', () => {
        const result = normalizeTimeSeriesData([
            { date: 'invalid', amount: 100 },
            { date: '2024-06-01', amount: null }
        ]);
        expect(result).toEqual([]);
    });
});

describe('normalizePerformanceResponse', () => {
    test('should provide default nested objects', () => {
        const normalized = normalizePerformanceResponse(null);
        expect(normalized.returnsTable).toEqual({});
        expect(normalized.performanceDates).toEqual({});
        expect(normalized.timeSeries.data).toEqual([]);
    });

    test('should preserve existing nested data', () => {
        const response = {
            returnsTable: { twr: { oneMonthValue: 0.1 } },
            performanceDates: { ytd: '2024-01-01' },
            timeSeries: { data: [{ date: '2024-01-01', amount: 100 }] }
        };
        const normalized = normalizePerformanceResponse(response);
        expect(normalized.returnsTable.twr.oneMonthValue).toBe(0.1);
        expect(normalized.performanceDates.ytd).toBe('2024-01-01');
        expect(normalized.timeSeries.data).toHaveLength(1);
    });
});

describe('parseJsonSafely', () => {
    test('should parse valid JSON and reject invalid inputs', () => {
        const cases = [
            { input: '{"ok":true}', expected: { ok: true } },
            { input: '{invalid', expected: null },
            { input: '', expected: null },
            { input: '   ', expected: null },
            { input: null, expected: null },
            { input: undefined, expected: null }
        ];

        cases.forEach(({ input, expected }) => {
            expect(parseJsonSafely(input)).toEqual(expected);
        });
    });
});

describe('getLatestTimeSeriesPoint', () => {
    test('should return latest normalized point', () => {
        const data = [
            { date: '2024-06-01', amount: 100 },
            { date: '2024-06-03', amount: 120 }
        ];
        const latest = getLatestTimeSeriesPoint(data);
        expect(latest.dateString).toBe('2024-06-03');
    });

    test('should return null for empty data', () => {
        expect(getLatestTimeSeriesPoint([])).toBeNull();
    });
});

describe('findNearestPointOnOrBefore', () => {
    test('should return nearest point on or before target date', () => {
        const data = [
            { date: '2024-06-01', amount: 100 },
            { date: '2024-06-03', amount: 120 }
        ];
        const nearest = findNearestPointOnOrBefore(data, new Date('2024-06-02'));
        expect(nearest.dateString).toBe('2024-06-01');
    });

    test('should return null for invalid target date', () => {
        expect(findNearestPointOnOrBefore([], 'invalid')).toBeNull();
    });
});

describe('getPerformanceDate', () => {
    test('should return first valid date from keys', () => {
        const result = getPerformanceDate({ ytd: '2024-01-02', ytdStartDate: '2024-01-01' }, ['ytdStartDate', 'ytd']);
        expect(result.toISOString().slice(0, 10)).toBe('2024-01-01');
    });

    test('should return null when no valid dates', () => {
        expect(getPerformanceDate({ ytd: 'invalid' }, ['ytd'])).toBeNull();
    });
});

describe('getWindowStartDate', () => {
    const timeSeries = [
        { date: '2024-05-30', amount: 100 },
        { date: '2024-05-31', amount: 110 },
        { date: '2024-06-03', amount: 120 }
    ];

    test('should return 1M start date based on latest data point', () => {
        const startDate = getWindowStartDate('oneMonth', timeSeries, null);
        expect(startDate.toISOString().slice(0, 10)).toBe('2024-05-03');
    });

    test('should return YTD start date when provided', () => {
        const startDate = getWindowStartDate('ytd', timeSeries, { ytdStartDate: '2024-02-01' });
        expect(startDate.toISOString().slice(0, 10)).toBe('2024-02-01');
    });

    test('should return null for empty time series', () => {
        expect(getWindowStartDate('oneMonth', [], null)).toBeNull();
    });

    test('should return null for invalid window key', () => {
        expect(getWindowStartDate('invalid', timeSeries, null)).toBeNull();
    });

    test('should handle 6-month window', () => {
        const startDate = getWindowStartDate('sixMonth', timeSeries, null);
        expect(startDate.toISOString().slice(0, 10)).toBe('2023-12-03');
    });

    test('should handle 1-year window', () => {
        const startDate = getWindowStartDate('oneYear', timeSeries, null);
        expect(startDate.toISOString().slice(0, 10)).toBe('2023-06-03');
    });

    test('should handle 3-year window', () => {
        const startDate = getWindowStartDate('threeYear', timeSeries, null);
        expect(startDate.toISOString().slice(0, 10)).toBe('2021-06-03');
    });

    test('should fallback to beginning of year for YTD without performanceDates', () => {
        const startDate = getWindowStartDate('ytd', timeSeries, null);
        expect(startDate.getFullYear()).toBe(2024);
        expect(startDate.getMonth()).toBe(0); // January
        expect(startDate.getDate()).toBe(1);
    });

    test('should handle invalid performanceDates object', () => {
        const startDate = getWindowStartDate('ytd', timeSeries, { ytdStartDate: 'invalid-date' });
        expect(startDate.getFullYear()).toBe(2024);
        expect(startDate.getMonth()).toBe(0);
    });
});

describe('mergeTimeSeriesByDate', () => {
    test('should merge series by date and sum amounts', () => {
        const series = [
            [
                { date: '2024-06-01', amount: 100 },
                { date: '2024-06-02', amount: 200 }
            ],
            [
                { date: '2024-06-01', amount: 50 }
            ]
        ];
        const result = mergeTimeSeriesByDate(series);
        expect(result).toEqual([
            { date: '2024-06-01', amount: 150 },
            { date: '2024-06-02', amount: 200 }
        ]);
    });

    test('should merge normalized series when flag is set', () => {
        const series = [
            [
                { date: new Date('2024-06-01'), dateString: '2024-06-01', amount: 100 },
                { date: new Date('2024-06-02'), dateString: '2024-06-02', amount: 200 }
            ],
            [
                { date: new Date('2024-06-01'), dateString: '2024-06-01', amount: 50 }
            ]
        ];
        const result = mergeTimeSeriesByDate(series, true);
        expect(result).toEqual([
            { date: '2024-06-01', amount: 150 },
            { date: '2024-06-02', amount: 200 }
        ]);
    });
});

describe('getTimeSeriesWindow', () => {
    test('should return full series when start date is missing', () => {
        const result = getTimeSeriesWindow([
            { date: '2024-06-01', amount: 100 },
            { date: '2024-06-02', amount: 200 }
        ]);
        expect(result).toHaveLength(2);
    });

    test('should filter by start date', () => {
        const result = getTimeSeriesWindow([
            { date: '2024-06-01', amount: 100 },
            { date: '2024-06-02', amount: 200 }
        ], new Date('2024-06-02'));
        expect(result).toEqual([{ date: '2024-06-02', amount: 200 }]);
    });

    test('should return empty array for invalid start date', () => {
        const result = getTimeSeriesWindow([
            { date: '2024-06-01', amount: 100 },
            { date: '2024-06-02', amount: 200 }
        ], 'not-a-date');
        expect(result).toEqual([]);
    });
});

describe('calculateWeightedAverage', () => {
    test('should calculate weighted average with positive weights', () => {
        expect(calculateWeightedAverage([1, 3], [1, 3])).toBe(2.5);
    });

    test('should return null for invalid inputs', () => {
        expect(calculateWeightedAverage([1], [1, 2])).toBeNull();
        expect(calculateWeightedAverage([], [])).toBeNull();
        expect(calculateWeightedAverage([1], [0])).toBeNull();
    });
});

describe('summarizePerformanceMetrics', () => {
    test('should preserve zero-valued summary amounts', () => {
        const metrics = summarizePerformanceMetrics([
            {
                totalCumulativeReturnAmount: 0,
                gainOrLossTable: {
                    netInvestment: { allTimeValue: 0 }
                },
                endingBalanceAmount: 0
            }
        ], []);

        expect(metrics.totalReturnAmount).toBe(0);
        expect(metrics.netInvestmentAmount).toBe(0);
        expect(metrics.endingBalanceAmount).toBe(0);
    });

    test('should aggregate net fees and weighted returns', () => {
        const metrics = summarizePerformanceMetrics([
            {
                totalCumulativeReturnAmount: { amount: 20 },
                gainOrLossTable: {
                    netInvestment: { allTimeValue: 100 },
                    accessFeeCharged: { allTimeValue: 5 },
                    trailerFeeRebates: { allTimeValue: 1 }
                },
                totalCumulativeReturnPercent: 0.2,
                simpleRateOfReturnPercent: 0.1,
                returnsTable: { twr: { allTimeValue: 0.08 }, annualisedIrr: { allTimeValue: 0.07 } }
            },
            {
                totalCumulativeReturnAmount: { amount: 30 },
                gainOrLossTable: {
                    netInvestment: { allTimeValue: 300 },
                    accessFeeCharged: { allTimeValue: 9 },
                    trailerFeeRebates: { allTimeValue: 3 }
                },
                totalCumulativeReturnPercent: 0.1,
                simpleRateOfReturnPercent: 0.05,
                returnsTable: { twr: { allTimeValue: 0.04 }, annualisedIrr: { allTimeValue: 0.03 } }
            }
        ], []);

        expect(metrics.netFeesAmount).toBe(10);
        expect(metrics.totalReturnAmount).toBe(50);
        expect(metrics.totalReturnPercent).toBeCloseTo((0.2 * 100 + 0.1 * 300) / 400, 6);
        expect(metrics.simpleReturnPercent).toBeCloseTo((0.1 * 100 + 0.05 * 300) / 400, 6);
        expect(metrics.twrPercent).toBeCloseTo((0.08 * 100 + 0.04 * 300) / 400, 6);
        expect(metrics.annualisedIrrPercent).toBeCloseTo((0.07 * 100 + 0.03 * 300) / 400, 6);
    });

    test('should fallback ending balance from merged time series', () => {
        const metrics = summarizePerformanceMetrics([], [
            { date: '2024-06-01', amount: 123 }
        ]);
        expect(metrics.endingBalanceAmount).toBe(123);
    });
});

describe('buildPerformanceMetricsRows', () => {
    test('should include total return context and simple return row', () => {
        const rows = buildPerformanceMetricsRows({
            totalReturnPercent: 0.1,
            simpleReturnPercent: 0.2,
            twrPercent: 0.05,
            annualisedIrrPercent: 0.07,
            totalReturnAmount: 100,
            netFeesAmount: 2,
            netInvestmentAmount: 1000,
            endingBalanceAmount: 1100
        });

        expect(rows).toHaveLength(8);
        expect(rows[0].label).toBe('Total Return %');
        expect(rows[0].value).toBe('+10.00%');
        expect(rows[0].info).toContain('Weighted by net investment');
        expect(rows[0].info).toContain('Compare with Simple Return %');

        const simpleRow = rows.find(row => row.key === 'simpleReturnPercent');
        expect(simpleRow.label).toBe('Simple Return %');
        expect(simpleRow.value).toBe('+20.00%');
    });
});

describe('calculateReturnFromTimeSeries', () => {
    test('should calculate return using nearest available start date', () => {
        const timeSeries = [
            { date: '2024-05-30', amount: 100 },
            { date: '2024-05-31', amount: 110 },
            { date: '2024-06-03', amount: 120 }
        ];
        const startDate = new Date('2024-06-01');
        const result = calculateReturnFromTimeSeries(timeSeries, startDate);
        expect(result).toBeCloseTo(120 / 110 - 1, 6);
    });

    test('should adjust for net investment flows when cumulative data is available', () => {
        const timeSeries = [
            { date: '2024-06-01', amount: 100, cumulativeNetInvestmentAmount: 100 },
            { date: '2024-06-02', amount: 150, cumulativeNetInvestmentAmount: 140 }
        ];
        const result = calculateReturnFromTimeSeries(timeSeries, new Date('2024-06-01'));
        expect(result).toBeCloseTo(0.1, 6);
    });

    test('should return -100% when adjusted end amount is zero', () => {
        const timeSeries = [
            { date: '2024-06-01', amount: 100, cumulativeNetInvestmentAmount: 100 },
            { date: '2024-06-02', amount: 100, cumulativeNetInvestmentAmount: 200 }
        ];
        const result = calculateReturnFromTimeSeries(timeSeries, new Date('2024-06-01'));
        expect(result).toBeCloseTo(-1, 6);
    });

    test('should allow negative adjusted end amounts for heavy losses', () => {
        const timeSeries = [
            { date: '2024-06-01', amount: 100, cumulativeNetInvestmentAmount: 100 },
            { date: '2024-06-02', amount: 50, cumulativeNetInvestmentAmount: 200 }
        ];
        const result = calculateReturnFromTimeSeries(timeSeries, new Date('2024-06-01'));
        expect(result).toBeCloseTo(-1.5, 6);
    });

    test('should account for redemptions when cumulative net investment decreases', () => {
        const timeSeries = [
            { date: '2024-06-01', amount: 120, cumulativeNetInvestmentAmount: 200 },
            { date: '2024-06-02', amount: 80, cumulativeNetInvestmentAmount: 150 }
        ];
        const result = calculateReturnFromTimeSeries(timeSeries, new Date('2024-06-01'));
        expect(result).toBeCloseTo(130 / 120 - 1, 6);
    });

    test('should return null when start point amount is zero', () => {
        const timeSeries = [
            { date: '2024-06-01', amount: 0 },
            { date: '2024-06-02', amount: 100 }
        ];
        const result = calculateReturnFromTimeSeries(timeSeries, new Date('2024-06-01'));
        expect(result).toBeNull();
    });

    test('should allow zero or negative end point amounts', () => {
        const timeSeries = [
            { date: '2024-06-01', amount: 100 },
            { date: '2024-06-02', amount: 0 }
        ];
        const result = calculateReturnFromTimeSeries(timeSeries, new Date('2024-06-01'));
        expect(result).toBeCloseTo(-1, 6);

        const timeSeriesNegative = [
            { date: '2024-06-01', amount: 100 },
            { date: '2024-06-02', amount: -50 }
        ];
        const resultNegative = calculateReturnFromTimeSeries(timeSeriesNegative, new Date('2024-06-01'));
        expect(resultNegative).toBeCloseTo(-1.5, 6);
    });

    test('should allow negative start amounts when non-zero', () => {
        const timeSeries = [
            { date: '2024-06-01', amount: -100 },
            { date: '2024-06-02', amount: -80 }
        ];
        const result = calculateReturnFromTimeSeries(timeSeries, new Date('2024-06-01'));
        expect(result).toBeCloseTo(-80 / -100 - 1, 6);
    });

    test('should ignore entries with null amounts', () => {
        const timeSeries = [
            { date: '2024-06-01', amount: null },
            { date: '2024-06-02', amount: 100 }
        ];
        const result = calculateReturnFromTimeSeries(timeSeries, new Date('2024-06-01'));
        expect(result).toBeNull();
    });

    test('should treat null cumulative net investment as missing', () => {
        const timeSeries = [
            { date: '2024-06-01', amount: 100, cumulativeNetInvestmentAmount: null },
            { date: '2024-06-02', amount: 120, cumulativeNetInvestmentAmount: 110 }
        ];
        const result = calculateReturnFromTimeSeries(timeSeries, new Date('2024-06-01'));
        expect(result).toBeCloseTo(120 / 100 - 1, 6);
    });

    test('should return null for null startDate', () => {
        const timeSeries = [
            { date: '2024-06-01', amount: 100 },
            { date: '2024-06-02', amount: 110 }
        ];
        expect(calculateReturnFromTimeSeries(timeSeries, null)).toBeNull();
    });

    test('should return null for undefined startDate', () => {
        const timeSeries = [
            { date: '2024-06-01', amount: 100 },
            { date: '2024-06-02', amount: 110 }
        ];
        expect(calculateReturnFromTimeSeries(timeSeries, undefined)).toBeNull();
    });

    test('should return null for invalid startDate', () => {
        const timeSeries = [
            { date: '2024-06-01', amount: 100 },
            { date: '2024-06-02', amount: 110 }
        ];
        expect(calculateReturnFromTimeSeries(timeSeries, 'not-a-date')).toBeNull();
    });

    test('should return null for empty time series', () => {
        expect(calculateReturnFromTimeSeries([], new Date('2024-06-01'))).toBeNull();
    });

    test('should return null when no point found before startDate', () => {
        const timeSeries = [
            { date: '2024-06-10', amount: 100 },
            { date: '2024-06-11', amount: 110 }
        ];
        const result = calculateReturnFromTimeSeries(timeSeries, new Date('2024-06-01'));
        expect(result).toBeNull();
    });

    test('should handle negative returns correctly', () => {
        const timeSeries = [
            { date: '2024-06-01', amount: 100 },
            { date: '2024-06-02', amount: 80 }
        ];
        const result = calculateReturnFromTimeSeries(timeSeries, new Date('2024-06-01'));
        expect(result).toBeCloseTo(-0.2, 6);
    });

    test('should handle very small amounts', () => {
        const timeSeries = [
            { date: '2024-06-01', amount: 0.01 },
            { date: '2024-06-02', amount: 0.02 }
        ];
        const result = calculateReturnFromTimeSeries(timeSeries, new Date('2024-06-01'));
        expect(result).toBeCloseTo(1, 6);
    });
});

describe('mapReturnsTableToWindowReturns', () => {
    test('should map returns table values', () => {
        const returnsTable = {
            twr: {
                oneMonthValue: 0.02,
                sixMonthValue: 0.08,
                oneYearValue: 0.12,
                threeYearValue: 0.3,
                ytdValue: 0.05
            }
        };
        expect(mapReturnsTableToWindowReturns(returnsTable)).toEqual({
            oneMonth: 0.02,
            sixMonth: 0.08,
            ytd: 0.05,
            oneYear: 0.12,
            threeYear: 0.3
        });
    });

    test('should return empty object for null input', () => {
        expect(mapReturnsTableToWindowReturns(null)).toEqual({});
    });

    test('should return empty object for undefined input', () => {
        expect(mapReturnsTableToWindowReturns(undefined)).toEqual({});
    });

    test('should return empty object for non-object input', () => {
        expect(mapReturnsTableToWindowReturns('string')).toEqual({});
        expect(mapReturnsTableToWindowReturns(123)).toEqual({});
    });

    test('should return empty object when twr is missing', () => {
        expect(mapReturnsTableToWindowReturns({})).toEqual({});
        expect(mapReturnsTableToWindowReturns({ other: {} })).toEqual({});
    });

    test('should handle partial twr data', () => {
        const returnsTable = {
            twr: {
                oneMonthValue: 0.02,
                oneYearValue: 0.12
            }
        };
        const result = mapReturnsTableToWindowReturns(returnsTable);
        expect(result.oneMonth).toBe(0.02);
        expect(result.oneYear).toBe(0.12);
        expect(result.sixMonth).toBeNull();
        expect(result.ytd).toBeNull();
        expect(result.threeYear).toBeNull();
    });

    test('should extract return percent from object values', () => {
        const returnsTable = {
            twr: {
                oneMonthValue: { returnPercent: 0.05 },
                sixMonthValue: { rateOfReturn: 0.1 }
            }
        };
        const result = mapReturnsTableToWindowReturns(returnsTable);
        expect(result.oneMonth).toBe(0.05);
        expect(result.sixMonth).toBe(0.1);
    });

    test('should handle zero values correctly', () => {
        const returnsTable = {
            twr: {
                oneMonthValue: 0,
                sixMonthValue: 0,
                oneYearValue: 0
            }
        };
        const result = mapReturnsTableToWindowReturns(returnsTable);
        expect(result.oneMonth).toBe(0);
        expect(result.sixMonth).toBe(0);
        expect(result.oneYear).toBe(0);
    });

    test('should handle negative values correctly', () => {
        const returnsTable = {
            twr: {
                oneMonthValue: -0.05,
                ytdValue: -0.1
            }
        };
        const result = mapReturnsTableToWindowReturns(returnsTable);
        expect(result.oneMonth).toBe(-0.05);
        expect(result.ytd).toBe(-0.1);
    });
});

describe('derivePerformanceWindows', () => {
    test('should use returns table values when available', () => {
        const returnsTable = {
            twr: {
                oneMonthValue: 0.02,
                sixMonthValue: 0.08,
                oneYearValue: 0.12,
                threeYearValue: 0.3,
                ytdValue: 0.05
            }
        };
        const timeSeries = [
            { date: '2024-01-01', amount: 100 },
            { date: '2024-06-01', amount: 120 }
        ];
        const result = derivePerformanceWindows(returnsTable, null, timeSeries);
        expect(result.oneMonth).toBe(0.02);
        expect(result.sixMonth).toBe(0.08);
        expect(result.oneYear).toBe(0.12);
        expect(result.threeYear).toBe(0.3);
        expect(result.ytd).toBe(0.05);
    });

    test('should fall back to time series data when returns table is missing', () => {
        const timeSeries = [
            { date: '2023-08-01', amount: 90 },
            { date: '2024-01-01', amount: 100 },
            { date: '2024-02-01', amount: 110 },
            { date: '2024-03-01', amount: 120 }
        ];
        const result = derivePerformanceWindows({}, null, timeSeries);
        expect(result.oneMonth).toBeCloseTo(0.0909, 3);
        expect(result.sixMonth).toBeCloseTo(0.3333, 3);
    });

    test('should fall back per-window when returns table value is null', () => {
        const returnsTable = {
            twr: {
                oneMonthValue: null,
                sixMonthValue: 0.1
            }
        };
        const timeSeries = [
            { date: '2024-05-01', amount: 100 },
            { date: '2024-06-01', amount: 110 }
        ];
        const result = derivePerformanceWindows(returnsTable, null, timeSeries);
        expect(result.oneMonth).toBeCloseTo(0.1, 6);
        expect(result.sixMonth).toBe(0.1);
    });
});

describe('calculateWeightedWindowReturns', () => {
    test('should weight TWR window returns by net investment', () => {
        const responses = [
            {
                returnsTable: {
                    twr: {
                        oneMonthValue: 0.01,
                        oneYearValue: 0.1,
                        ytdValue: 0.08
                    }
                },
                gainOrLossTable: {
                    netInvestment: { allTimeValue: 100 }
                }
            },
            {
                returnsTable: {
                    twr: {
                        oneMonthValue: 0.03,
                        oneYearValue: 0.2,
                        ytdValue: 0.04
                    }
                },
                gainOrLossTable: {
                    netInvestment: { allTimeValue: 300 }
                }
            }
        ];
        const result = calculateWeightedWindowReturns(responses, null);
        expect(result.oneMonth).toBeCloseTo((0.01 * 100 + 0.03 * 300) / 400, 6);
        expect(result.oneYear).toBeCloseTo((0.1 * 100 + 0.2 * 300) / 400, 6);
        expect(result.ytd).toBeCloseTo((0.08 * 100 + 0.04 * 300) / 400, 6);
    });

    test('should exclude goals without TWR window data', () => {
        const responses = [
            {
                returnsTable: {
                    twr: {
                        oneYearValue: 0.1
                    }
                },
                gainOrLossTable: {
                    netInvestment: { allTimeValue: 200 }
                }
            },
            {
                returnsTable: {
                    oneYear: 0.3
                },
                timeSeries: {
                    data: [
                        { date: '2024-01-01', amount: 100 },
                        { date: '2024-06-01', amount: 140 }
                    ]
                },
                gainOrLossTable: {
                    netInvestment: { allTimeValue: 800 }
                }
            }
        ];
        const result = calculateWeightedWindowReturns(responses, null);
        expect(result.oneYear).toBeCloseTo(0.1, 6);
        expect(result.oneMonth).toBeNull();
    });

    test('should use fallback net investment fields', () => {
        const responses = [
            {
                returnsTable: { twr: { oneMonthValue: 0.1 } },
                netInvestmentAmount: { amount: 100 }
            },
            {
                returnsTable: { twr: { oneMonthValue: 0.2 } },
                netInvestment: { amount: 300 }
            }
        ];
        const result = calculateWeightedWindowReturns(responses, null);
        expect(result.oneMonth).toBeCloseTo((0.1 * 100 + 0.2 * 300) / 400, 6);
    });
});

describe('buildMergedInvestmentData', () => {
    test('should return null if any data is missing', () => {
        expect(buildMergedInvestmentData(null, [], [])).toBeNull();
        expect(buildMergedInvestmentData([], null, [])).toBeNull();
        expect(buildMergedInvestmentData([], [], null)).toBeNull();
    });

    test('should return null if any data is not an array', () => {
        expect(buildMergedInvestmentData({}, [], [])).toBeNull();
        expect(buildMergedInvestmentData([], 'string', [])).toBeNull();
        expect(buildMergedInvestmentData([], [], 123)).toBeNull();
    });

    test('should merge data correctly for single goal', () => {
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

        const result = buildMergedInvestmentData(performanceData, investibleData, summaryData);

        expect(result).toHaveProperty('Retirement');
        expect(result.Retirement._meta.endingBalanceTotal).toBe(1000);
        expect(result.Retirement.GENERAL_WEALTH_ACCUMULATION.endingBalanceAmount).toBe(1000);
        expect(result.Retirement.GENERAL_WEALTH_ACCUMULATION.totalCumulativeReturn).toBe(100);
        expect(result.Retirement.GENERAL_WEALTH_ACCUMULATION.goals).toHaveLength(1);
    });

    test('should preserve zero simpleRateOfReturnPercent values', () => {
        const performanceData = [{
            goalId: 'goal1',
            totalCumulativeReturn: { amount: 0 },
            simpleRateOfReturnPercent: 0
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

        const result = buildMergedInvestmentData(performanceData, investibleData, summaryData);

        expect(result.Retirement.GENERAL_WEALTH_ACCUMULATION.goals[0].simpleRateOfReturnPercent).toBe(0);
    });

    test('should extract bucket from goal name separator', () => {
        const performanceData = [{ goalId: 'goal1', totalCumulativeReturn: { amount: 50 } }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: 'Emergency Fund - Cash Buffer',
            investmentGoalType: 'CASH_MANAGEMENT',
            totalInvestmentAmount: { display: { amount: 500 } }
        }];
        const summaryData = [{ goalId: 'goal1' }];

        const result = buildMergedInvestmentData(performanceData, investibleData, summaryData);

        expect(result).toHaveProperty('Emergency Fund');
        expect(result['Emergency Fund'].CASH_MANAGEMENT.goals[0].goalBucket).toBe('Emergency Fund');
    });

    test('should use "Uncategorized" for goals without bucket name', () => {
        const performanceData = [{ goalId: 'goal1', totalCumulativeReturn: { amount: 50 } }];
        const investibleData = [{
            goalId: 'goal1',
            goalName: '',
            investmentGoalType: 'CASH_MANAGEMENT',
            totalInvestmentAmount: { display: { amount: 500 } }
        }];
        const summaryData = [{ goalId: 'goal1' }];

        const result = buildMergedInvestmentData(performanceData, investibleData, summaryData);

        expect(result).toHaveProperty('Uncategorized');
    });

    test('should aggregate multiple goals in same bucket and type', () => {
        const performanceData = [
            { goalId: 'goal1', totalCumulativeReturn: { amount: 100 } },
            { goalId: 'goal2', totalCumulativeReturn: { amount: 200 } }
        ];
        
        const investibleData = [
            {
                goalId: 'goal1',
                goalName: 'Retirement - Portfolio A',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 1000 } }
            },
            {
                goalId: 'goal2',
                goalName: 'Retirement - Portfolio B',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 2000 } }
            }
        ];
        
        const summaryData = [
            { goalId: 'goal1' },
            { goalId: 'goal2' }
        ];

        const result = buildMergedInvestmentData(performanceData, investibleData, summaryData);

        expect(result.Retirement._meta.endingBalanceTotal).toBe(3000);
        expect(result.Retirement.GENERAL_WEALTH_ACCUMULATION.endingBalanceAmount).toBe(3000);
        expect(result.Retirement.GENERAL_WEALTH_ACCUMULATION.totalCumulativeReturn).toBe(300);
        expect(result.Retirement.GENERAL_WEALTH_ACCUMULATION.goals).toHaveLength(2);
    });

    test('should normalize investment and return amounts from nested shapes', () => {
        const performanceData = [
            { goalId: 'goal1', totalCumulativeReturn: { display: { amount: 75 } } }
        ];

        const investibleData = [
            {
                goalId: 'goal1',
                goalName: 'Emergency - Buffer',
                investmentGoalType: 'CASH_MANAGEMENT',
                totalInvestmentAmount: { amount: 1500 }
            }
        ];

        const summaryData = [{ goalId: 'goal1' }];

        const result = buildMergedInvestmentData(performanceData, investibleData, summaryData);

        expect(result.Emergency._meta.endingBalanceTotal).toBe(1500);
        expect(result.Emergency.CASH_MANAGEMENT.endingBalanceAmount).toBe(1500);
        expect(result.Emergency.CASH_MANAGEMENT.totalCumulativeReturn).toBe(75);
        expect(result.Emergency.CASH_MANAGEMENT.goals[0].endingBalanceAmount).toBe(1500);
        expect(result.Emergency.CASH_MANAGEMENT.goals[0].totalCumulativeReturn).toBe(75);
    });

    test('should add pending processing amount to performance total investment value', () => {
        const performanceData = [
            {
                goalId: 'goal1',
                totalInvestmentValue: { amount: 124038.45 },
                pendingProcessingAmount: { amount: 6396.52 },
                totalCumulativeReturn: { amount: 563.58 }
            }
        ];

        const investibleData = [
            {
                goalId: 'goal1',
                goalName: 'Retirement - Portfolio',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 100000 } }
            }
        ];

        const summaryData = [
            {
                goalId: 'goal1',
                goalName: 'Retirement - Portfolio',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
            }
        ];

        const result = buildMergedInvestmentData(performanceData, investibleData, summaryData);

        expect(result.Retirement._meta.endingBalanceTotal).toBeCloseTo(130434.97, 2);
        expect(result.Retirement.GENERAL_WEALTH_ACCUMULATION.endingBalanceAmount).toBeCloseTo(130434.97, 2);
        expect(result.Retirement.GENERAL_WEALTH_ACCUMULATION.goals[0].endingBalanceAmount).toBeCloseTo(130434.97, 2);
    });

    test('should ignore missing pending processing amount when performance total investment value exists', () => {
        const performanceData = [
            {
                goalId: 'goal1',
                totalInvestmentValue: { amount: 124038.45 },
                totalCumulativeReturn: { amount: 563.58 }
            }
        ];

        const investibleData = [
            {
                goalId: 'goal1',
                goalName: 'Retirement - Portfolio',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 100000 } }
            }
        ];

        const summaryData = [
            {
                goalId: 'goal1',
                goalName: 'Retirement - Portfolio',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
            }
        ];

        const result = buildMergedInvestmentData(performanceData, investibleData, summaryData);

        expect(result.Retirement._meta.endingBalanceTotal).toBeCloseTo(124038.45, 2);
        expect(result.Retirement.GENERAL_WEALTH_ACCUMULATION.endingBalanceAmount).toBeCloseTo(124038.45, 2);
        expect(result.Retirement.GENERAL_WEALTH_ACCUMULATION.goals[0].endingBalanceAmount).toBeCloseTo(124038.45, 2);
    });

    test('should handle multiple buckets and goal types', () => {
        const performanceData = [
            { goalId: 'goal1', totalCumulativeReturn: { amount: 100 } },
            { goalId: 'goal2', totalCumulativeReturn: { amount: 50 } }
        ];
        
        const investibleData = [
            {
                goalId: 'goal1',
                goalName: 'Retirement - Portfolio',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 1000 } }
            },
            {
                goalId: 'goal2',
                goalName: 'Emergency - Fund',
                investmentGoalType: 'CASH_MANAGEMENT',
                totalInvestmentAmount: { display: { amount: 500 } }
            }
        ];
        
        const summaryData = [
            { goalId: 'goal1' },
            { goalId: 'goal2' }
        ];

        const result = buildMergedInvestmentData(performanceData, investibleData, summaryData);

        expect(result).toHaveProperty('Retirement');
        expect(result).toHaveProperty('Emergency');
        expect(result.Retirement.GENERAL_WEALTH_ACCUMULATION).toBeDefined();
        expect(result.Emergency.CASH_MANAGEMENT).toBeDefined();
    });

    test('should handle missing optional fields gracefully', () => {
        const performanceData = [{ goalId: 'goal1' }];
        const investibleData = [{ goalId: 'goal1', goalName: 'Test - Goal' }];
        const summaryData = [{ goalId: 'goal1' }];

        const result = buildMergedInvestmentData(performanceData, investibleData, summaryData);

        expect(result).toBeDefined();
        expect(result.Test.UNKNOWN_GOAL_TYPE).toBeDefined();
        expect(result.Test.UNKNOWN_GOAL_TYPE.goals[0].endingBalanceAmount).toBeNull();
        expect(result.Test.UNKNOWN_GOAL_TYPE.goals[0].totalCumulativeReturn).toBeNull();
    });

    test('should fallback to summary data if investible data missing fields', () => {
        const performanceData = [{ goalId: 'goal1', totalCumulativeReturn: { amount: 100 } }];
        const investibleData = [{ goalId: 'goal1' }];
        const summaryData = [{
            goalId: 'goal1',
            goalName: 'Retirement - Plan',
            investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION'
        }];

        const result = buildMergedInvestmentData(performanceData, investibleData, summaryData);

        expect(result.Retirement.GENERAL_WEALTH_ACCUMULATION.goals[0].goalName).toBe('Retirement - Plan');
        expect(result.Retirement.GENERAL_WEALTH_ACCUMULATION.goals[0].goalType).toBe('GENERAL_WEALTH_ACCUMULATION');
    });

    test('should handle empty arrays', () => {
        const result = buildMergedInvestmentData([], [], []);
        expect(result).toEqual({});
    });

    test('should skip goals with non-numeric investment amounts in totals', () => {
        const performanceData = [
            { goalId: 'goal1', totalCumulativeReturn: { amount: 100 } },
            { goalId: 'goal2', totalCumulativeReturn: { amount: 50 } }
        ];
        
        const investibleData = [
            {
                goalId: 'goal1',
                goalName: 'Retirement - A',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: { amount: 1000 } }
            },
            {
                goalId: 'goal2',
                goalName: 'Retirement - B',
                investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION',
                totalInvestmentAmount: { display: {} } // Missing amount
            }
        ];
        
        const summaryData = [
            { goalId: 'goal1' },
            { goalId: 'goal2' }
        ];

        const result = buildMergedInvestmentData(performanceData, investibleData, summaryData);

        expect(result.Retirement._meta.endingBalanceTotal).toBe(1000); // Only goal1 counted
        expect(result.Retirement.GENERAL_WEALTH_ACCUMULATION.endingBalanceAmount).toBe(1000);
        expect(result.Retirement.GENERAL_WEALTH_ACCUMULATION.goals).toHaveLength(2); // Both goals present
    });
});

