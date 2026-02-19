const { setupDom, teardownDom } = require('./helpers/domSetup');

describe('handlers and cache', () => {
    let exportsModule;
    let storage;
    const originalDateNow = Date.now;
    let baseFetchMock;

    beforeEach(() => {
        jest.resetModules();
        setupDom();

        storage = new Map();
        global.GM_setValue = (key, value) => storage.set(key, value);
        global.GM_getValue = (key, fallback = null) => storage.has(key) ? storage.get(key) : fallback;
        global.GM_deleteValue = key => storage.delete(key);
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

    afterEach(() => {
        teardownDom();
        delete global.GM_setValue;
        delete global.GM_getValue;
        delete global.GM_deleteValue;
        delete global.GM_cookie;
        delete global.XMLHttpRequest;
        Date.now = originalDateNow;
    });

    function createTypeSection(goalId) {
        const typeSection = document.createElement('div');
        const table = document.createElement('table');
        table.className = 'gpv-table gpv-goal-table';
        const tbody = document.createElement('tbody');
        const tr = document.createElement('tr');
        const diff = document.createElement('td');
        diff.className = 'gpv-diff-cell';
        const targetTd = document.createElement('td');
        const targetInput = document.createElement('input');
        targetInput.className = 'gpv-target-input';
        targetInput.dataset.goalId = goalId;
        targetInput.dataset.fixed = 'false';
        targetTd.appendChild(targetInput);
        tr.appendChild(targetTd);
        tr.appendChild(diff);
        tbody.appendChild(tr);
        table.appendChild(tbody);
        typeSection.appendChild(table);
        return { typeSection, targetInput, diffCell: diff };
    }

    test('handleGoalTargetChange stores target and updates diff', () => {
        const { handleGoalTargetChange } = exportsModule;
        if (typeof handleGoalTargetChange !== 'function') return;

        const bucket = 'Retirement';
        const goalType = 'GENERAL_WEALTH_ACCUMULATION';
        const goalId = 'g1';
        const mergedInvestmentDataState = {
            [bucket]: {
                _meta: { endingBalanceTotal: 1000 },
                [goalType]: {
                    endingBalanceAmount: 1000,
                    totalCumulativeReturn: 0,
                    goals: [{
                        goalId,
                        goalName: 'Retirement - Core',
                        endingBalanceAmount: 600,
                        totalCumulativeReturn: 0,
                        simpleRateOfReturnPercent: 0
                    }]
                }
            }
        };
        const projectedInvestmentsState = {};
        const { typeSection, targetInput, diffCell } = createTypeSection(goalId);
        targetInput.value = '50';

        handleGoalTargetChange({
            input: targetInput,
            goalId,
            currentEndingBalance: 600,
            totalTypeEndingBalance: 1000,
            bucket,
            goalType,
            typeSection,
            mergedInvestmentDataState,
            projectedInvestmentsState
        });

        expect(storage.get('goal_target_pct_g1')).toBe(50);
        expect(diffCell.textContent).toMatch(/100\.00/);
        expect(diffCell.className).toContain('gpv-diff-cell');
    });

    test('handleGoalTargetChange clears target on empty input', () => {
        const { handleGoalTargetChange } = exportsModule;
        if (typeof handleGoalTargetChange !== 'function') return;

        const bucket = 'Retirement';
        const goalType = 'GENERAL_WEALTH_ACCUMULATION';
        const goalId = 'g1';
        const mergedInvestmentDataState = {
            [bucket]: {
                _meta: { endingBalanceTotal: 1000 },
                [goalType]: {
                    endingBalanceAmount: 1000,
                    totalCumulativeReturn: 0,
                    goals: [{
                        goalId,
                        goalName: 'Retirement - Core',
                        endingBalanceAmount: 600,
                        totalCumulativeReturn: 0,
                        simpleRateOfReturnPercent: 0
                    }]
                }
            }
        };
        const projectedInvestmentsState = {};
        const { typeSection, targetInput, diffCell } = createTypeSection(goalId);
        storage.set('goal_target_pct_g1', 50);
        targetInput.value = '';

        handleGoalTargetChange({
            input: targetInput,
            goalId,
            currentEndingBalance: 600,
            totalTypeEndingBalance: 1000,
            bucket,
            goalType,
            typeSection,
            mergedInvestmentDataState,
            projectedInvestmentsState
        });

        expect(storage.has('goal_target_pct_g1')).toBe(false);
        expect(diffCell.textContent).toBe('-');
        expect(diffCell.className).toBe('gpv-diff-cell');
    });

    test('handleGoalTargetChange clamps target percent to 0-100', () => {
        const { handleGoalTargetChange } = exportsModule;
        if (typeof handleGoalTargetChange !== 'function') return;

        jest.useFakeTimers();

        const bucket = 'Retirement';
        const goalType = 'GENERAL_WEALTH_ACCUMULATION';
        const goalId = 'g1';
        const mergedInvestmentDataState = {
            [bucket]: {
                _meta: { endingBalanceTotal: 1000 },
                [goalType]: {
                    endingBalanceAmount: 1000,
                    totalCumulativeReturn: 0,
                    goals: [{
                        goalId,
                        goalName: 'Retirement - Core',
                        endingBalanceAmount: 600,
                        totalCumulativeReturn: 0,
                        simpleRateOfReturnPercent: 0
                    }]
                }
            }
        };
        const projectedInvestmentsState = {};
        const { typeSection, targetInput } = createTypeSection(goalId);
        targetInput.value = '150';

        handleGoalTargetChange({
            input: targetInput,
            goalId,
            currentEndingBalance: 600,
            totalTypeEndingBalance: 1000,
            bucket,
            goalType,
            typeSection,
            mergedInvestmentDataState,
            projectedInvestmentsState
        });

        expect(storage.get('goal_target_pct_g1')).toBe(100);
        expect(targetInput.value).toBe('100.00');

        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    test('handleGoalTargetChange ignores updates when fixed', () => {
        const { handleGoalTargetChange } = exportsModule;
        if (typeof handleGoalTargetChange !== 'function') return;

        const bucket = 'Retirement';
        const goalType = 'GENERAL_WEALTH_ACCUMULATION';
        const goalId = 'g1';
        const mergedInvestmentDataState = {
            [bucket]: {
                _meta: { endingBalanceTotal: 1000 },
                [goalType]: {
                    endingBalanceAmount: 1000,
                    totalCumulativeReturn: 0,
                    goals: [{
                        goalId,
                        goalName: 'Retirement - Core',
                        endingBalanceAmount: 600,
                        totalCumulativeReturn: 0,
                        simpleRateOfReturnPercent: 0
                    }]
                }
            }
        };
        const projectedInvestmentsState = {};
        const { typeSection, targetInput } = createTypeSection(goalId);
        targetInput.value = '25';
        targetInput.dataset.fixed = 'true';

        handleGoalTargetChange({
            input: targetInput,
            goalId,
            currentEndingBalance: 600,
            totalTypeEndingBalance: 1000,
            bucket,
            goalType,
            typeSection,
            mergedInvestmentDataState,
            projectedInvestmentsState
        });

        expect(storage.has('goal_target_pct_g1')).toBe(false);
    });

    test('handleGoalTargetChange shows error on invalid input', () => {
        const { handleGoalTargetChange } = exportsModule;
        if (typeof handleGoalTargetChange !== 'function') return;

        jest.useFakeTimers();

        const bucket = 'Retirement';
        const goalType = 'GENERAL_WEALTH_ACCUMULATION';
        const goalId = 'g1';
        const mergedInvestmentDataState = {
            [bucket]: {
                _meta: { endingBalanceTotal: 1000 },
                [goalType]: {
                    endingBalanceAmount: 1000,
                    totalCumulativeReturn: 0,
                    goals: [{
                        goalId,
                        goalName: 'Retirement - Core',
                        endingBalanceAmount: 600,
                        totalCumulativeReturn: 0,
                        simpleRateOfReturnPercent: 0
                    }]
                }
            }
        };
        const projectedInvestmentsState = {};
        const { typeSection, targetInput } = createTypeSection(goalId);
        targetInput.value = 'not-a-number';

        handleGoalTargetChange({
            input: targetInput,
            goalId,
            currentEndingBalance: 600,
            totalTypeEndingBalance: 1000,
            bucket,
            goalType,
            typeSection,
            mergedInvestmentDataState,
            projectedInvestmentsState
        });

        expect(storage.has('goal_target_pct_g1')).toBe(false);
        expect(targetInput.classList.contains('gpv-input-flash--error')).toBe(true);

        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    test('GoalTargetStore.setTarget returns null for non-finite values', () => {
        const { GoalTargetStore } = exportsModule;
        if (!GoalTargetStore) return;

        const result = GoalTargetStore.setTarget('g-nonfinite', Infinity);
        expect(result).toBeNull();
        expect(storage.has('goal_target_pct_g-nonfinite')).toBe(false);
    });

    test('GoalTargetStore.setTarget clamps to 0-100 range', () => {
        const { GoalTargetStore } = exportsModule;
        if (!GoalTargetStore) return;

        const above = GoalTargetStore.setTarget('g-above', 150);
        expect(above).toBe(100);
        expect(storage.get('goal_target_pct_g-above')).toBe(100);

        const below = GoalTargetStore.setTarget('g-below', -10);
        expect(below).toBe(0);
        expect(storage.get('goal_target_pct_g-below')).toBe(0);
    });

    test('handleGoalFixedToggle disables target input and stores flag', () => {
        const { handleGoalFixedToggle } = exportsModule;
        if (typeof handleGoalFixedToggle !== 'function') return;

        const bucket = 'Retirement';
        const goalType = 'GENERAL_WEALTH_ACCUMULATION';
        const goalId = 'g1';
        const mergedInvestmentDataState = {
            [bucket]: {
                _meta: { endingBalanceTotal: 1000 },
                [goalType]: {
                    endingBalanceAmount: 1000,
                    totalCumulativeReturn: 0,
                    goals: [{
                        goalId,
                        goalName: 'Retirement - Core',
                        endingBalanceAmount: 600,
                        totalCumulativeReturn: 0,
                        simpleRateOfReturnPercent: 0
                    }]
                }
            }
        };
        const projectedInvestmentsState = {};
        const { typeSection, targetInput } = createTypeSection(goalId);
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.dataset.goalId = goalId;

        handleGoalFixedToggle({
            input: checkbox,
            goalId,
            bucket,
            goalType,
            typeSection,
            mergedInvestmentDataState,
            projectedInvestmentsState
        });

        expect(storage.get('goal_fixed_g1')).toBe(true);
        expect(targetInput.disabled).toBe(true);
    });

    test('handleProjectedInvestmentChange stores and clears projected investment', () => {
        const { handleProjectedInvestmentChange } = exportsModule;
        if (typeof handleProjectedInvestmentChange !== 'function') return;

        jest.useFakeTimers();

        const bucket = 'Retirement';
        const goalType = 'GENERAL_WEALTH_ACCUMULATION';
        const mergedInvestmentDataState = {
            [bucket]: {
                _meta: { endingBalanceTotal: 1000 },
                [goalType]: {
                    endingBalanceAmount: 1000,
                    totalCumulativeReturn: 0,
                    goals: []
                }
            }
        };
        const projectedInvestmentsState = {};
        const typeSection = document.createElement('div');
        const input = document.createElement('input');
        input.className = 'gpv-projected-input';
        input.value = '200';

        handleProjectedInvestmentChange({
            input,
            bucket,
            goalType,
            typeSection,
            mergedInvestmentDataState,
            projectedInvestmentsState
        });
        expect(projectedInvestmentsState[`${bucket}|${goalType}`]).toBe(200);

        input.value = '';
        handleProjectedInvestmentChange({
            input,
            bucket,
            goalType,
            typeSection,
            mergedInvestmentDataState,
            projectedInvestmentsState
        });
        expect(projectedInvestmentsState[`${bucket}|${goalType}`]).toBeUndefined();

        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    test('handleProjectedInvestmentChange allows negative values', () => {
        const { handleProjectedInvestmentChange } = exportsModule;
        if (typeof handleProjectedInvestmentChange !== 'function') return;

        jest.useFakeTimers();

        const bucket = 'Retirement';
        const goalType = 'GENERAL_WEALTH_ACCUMULATION';
        const mergedInvestmentDataState = {
            [bucket]: {
                _meta: { endingBalanceTotal: 1000 },
                [goalType]: {
                    endingBalanceAmount: 1000,
                    totalCumulativeReturn: 0,
                    goals: []
                }
            }
        };
        const projectedInvestmentsState = {};
        const typeSection = document.createElement('div');
        const table = document.createElement('table');
        table.className = 'gpv-goal-table';
        table.appendChild(document.createElement('tbody'));
        typeSection.appendChild(table);
        const input = document.createElement('input');
        input.className = 'gpv-projected-input';
        input.value = '-250';

        handleProjectedInvestmentChange({
            input,
            bucket,
            goalType,
            typeSection,
            mergedInvestmentDataState,
            projectedInvestmentsState
        });

        expect(projectedInvestmentsState[`${bucket}|${goalType}`]).toBe(-250);

        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    test('handleProjectedInvestmentChange clears on zero or invalid input', () => {
        const { handleProjectedInvestmentChange } = exportsModule;
        if (typeof handleProjectedInvestmentChange !== 'function') return;

        jest.useFakeTimers();

        const bucket = 'Retirement';
        const goalType = 'GENERAL_WEALTH_ACCUMULATION';
        const mergedInvestmentDataState = {
            [bucket]: {
                _meta: { endingBalanceTotal: 1000 },
                [goalType]: {
                    endingBalanceAmount: 1000,
                    totalCumulativeReturn: 0,
                    goals: []
                }
            }
        };
        const projectedInvestmentsState = {
            [`${bucket}|${goalType}`]: 200
        };
        const typeSection = document.createElement('div');
        const table = document.createElement('table');
        table.className = 'gpv-goal-table';
        table.appendChild(document.createElement('tbody'));
        typeSection.appendChild(table);
        const input = document.createElement('input');
        input.className = 'gpv-projected-input';

        input.value = '0';
        handleProjectedInvestmentChange({
            input,
            bucket,
            goalType,
            typeSection,
            mergedInvestmentDataState,
            projectedInvestmentsState
        });
        expect(projectedInvestmentsState[`${bucket}|${goalType}`]).toBeUndefined();

        projectedInvestmentsState[`${bucket}|${goalType}`] = 300;
        input.value = 'invalid';
        handleProjectedInvestmentChange({
            input,
            bucket,
            goalType,
            typeSection,
            mergedInvestmentDataState,
            projectedInvestmentsState
        });
        expect(projectedInvestmentsState[`${bucket}|${goalType}`]).toBe(300);
        expect(input.classList.contains('gpv-input-flash--error')).toBe(true);

        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    test('performance cache read/write honors TTL', () => {
        const {
            writePerformanceCache,
            readPerformanceCache,
            getCachedPerformanceResponse
        } = exportsModule;
        if (!writePerformanceCache || !readPerformanceCache || !getCachedPerformanceResponse) return;

        Date.now = () => 1_000;
        writePerformanceCache('goal-x', { foo: 'bar' });
        const fresh = readPerformanceCache('goal-x');
        expect(fresh.response.foo).toBe('bar');
        expect(getCachedPerformanceResponse('goal-x').foo).toBe('bar');

        // Make entry stale (>7 days)
        Date.now = () => 8 * 24 * 60 * 60 * 1000;
        const stale = readPerformanceCache('goal-x');
        expect(stale).toBeNull();
        expect(storage.has('gpv_performance_goal-x')).toBe(false);
    });

    test('performance cache removes invalid payloads', () => {
        const { readPerformanceCache } = exportsModule;
        if (!readPerformanceCache) return;

        storage.set('gpv_performance_bad-json', '{invalid');
        expect(readPerformanceCache('bad-json')).toBeNull();
        expect(storage.has('gpv_performance_bad-json')).toBe(false);

        storage.set('gpv_performance_bad-shape', JSON.stringify({ fetchedAt: 'nope', response: 'bad' }));
        expect(readPerformanceCache('bad-shape')).toBeNull();
        expect(storage.has('gpv_performance_bad-shape')).toBe(false);
    });

    test('readPerformanceCache allows stale cache when ignoreFreshness=true', () => {
        const { writePerformanceCache, readPerformanceCache } = exportsModule;
        if (!writePerformanceCache || !readPerformanceCache) return;

        Date.now = () => 1_000;
        writePerformanceCache('goal-stale', { data: 'old' });

        // Make entry stale (>7 days)
        Date.now = () => 8 * 24 * 60 * 60 * 1000;

        // With ignoreFreshness=true, stale cache should be returned
        const stale = readPerformanceCache('goal-stale', true);
        expect(stale).not.toBeNull();
        expect(stale.response.data).toBe('old');
    });

    test('clearPerformanceCache removes stored entries', () => {
        const { clearPerformanceCache } = exportsModule;
        if (!clearPerformanceCache) return;

        storage.set('gpv_performance_goal-a', JSON.stringify({ fetchedAt: 1, response: {} }));
        storage.set('gpv_performance_goal-b', JSON.stringify({ fetchedAt: 1, response: {} }));

        clearPerformanceCache(['goal-a', 'goal-b']);

        expect(storage.has('gpv_performance_goal-a')).toBe(false);
        expect(storage.has('gpv_performance_goal-b')).toBe(false);
    });

    test('ensurePerformanceData returns null when fetch fails', async () => {
        const { ensurePerformanceData, fetchPerformanceForGoal } = exportsModule;
        if (!ensurePerformanceData || !fetchPerformanceForGoal) return;

        // Mock fetch to fail
        const originalFetch = global.fetch;
        global.fetch = jest.fn(() => Promise.reject(new Error('Network error')));

        try {
            const results = await ensurePerformanceData(['goal-fail']);
            // Failed fetches should not return stale cache
            expect(results['goal-fail']).toBeUndefined();
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('buildGoalTypePerformanceSummary returns null for empty array', () => {
        const { buildGoalTypePerformanceSummary } = exportsModule;
        if (!buildGoalTypePerformanceSummary) return;

        expect(buildGoalTypePerformanceSummary([])).toBeNull();
    });

    test('buildGoalTypePerformanceSummary returns null for null input', () => {
        const { buildGoalTypePerformanceSummary } = exportsModule;
        if (!buildGoalTypePerformanceSummary) return;

        expect(buildGoalTypePerformanceSummary(null)).toBeNull();
        expect(buildGoalTypePerformanceSummary(undefined)).toBeNull();
    });

    test('buildGoalTypePerformanceSummary filters out null/invalid objects', () => {
        const { buildGoalTypePerformanceSummary } = exportsModule;
        if (!buildGoalTypePerformanceSummary) return;

        // With all invalid items, should return null
        const result = buildGoalTypePerformanceSummary([null, undefined, 'string', 123]);
        expect(result).toBeNull();
    });

    test('buildGoalTypePerformanceSummary handles mix of valid and invalid items', () => {
        const { buildGoalTypePerformanceSummary } = exportsModule;
        if (!buildGoalTypePerformanceSummary) return;

        const validResponse = {
            timeSeries: {
                data: [
                    { date: '2023-01-01', value: 1000 },
                    { date: '2023-01-02', value: 1100 }
                ]
            },
            performanceDates: { startDate: '2023-01-01', endDate: '2023-01-02' },
            returnsTable: {}
        };

        const result = buildGoalTypePerformanceSummary([null, validResponse, undefined]);
        expect(result).not.toBeNull();
        expect(result).toHaveProperty('mergedSeries');
        expect(result).toHaveProperty('windowSeries');
        expect(result).toHaveProperty('metrics');
    });

    test('buildGoalTypePerformanceSummary processes valid input', () => {
        const { buildGoalTypePerformanceSummary } = exportsModule;
        if (!buildGoalTypePerformanceSummary) return;

        const response = {
            timeSeries: {
                data: [
                    { date: '2023-01-01', value: 1000 },
                    { date: '2023-01-02', value: 1100 }
                ]
            },
            performanceDates: { startDate: '2023-01-01', endDate: '2023-01-02' },
            returnsTable: {}
        };

        const result = buildGoalTypePerformanceSummary([response]);
        expect(result).not.toBeNull();
        expect(result).toHaveProperty('mergedSeries');
        expect(result).toHaveProperty('windowSeries');
        expect(result).toHaveProperty('windowReturns');
        expect(result).toHaveProperty('metrics');
    });

    test('getLatestPerformanceCacheTimestamp returns latest fetched time', () => {
        const { getLatestPerformanceCacheTimestamp } = exportsModule;
        if (!getLatestPerformanceCacheTimestamp) return;

        Date.now = () => 500;
        storage.set('gpv_performance_goal-a', JSON.stringify({ fetchedAt: 100, response: {} }));
        storage.set('gpv_performance_goal-b', JSON.stringify({ fetchedAt: 200, response: {} }));

        const latest = getLatestPerformanceCacheTimestamp(['goal-a', 'goal-b']);
        expect(latest).toBe(200);
    });

    test('fetch interception stores performance data', async () => {
        const body = { performance: true };
        const responseFactory = data => ({
            clone: () => responseFactory(data),
            json: () => Promise.resolve(data),
            ok: true,
            status: 200
        });
        baseFetchMock.mockResolvedValueOnce(responseFactory(body));

        await window.fetch('/v1/goals/performance');
        const stored = storage.get('api_performance');
        expect(stored).toBeDefined();
        expect(JSON.parse(stored).performance).toBe(true);
    });

    test('hydrateVisibleGoalMetricRows updates all matching rows', () => {
        const { hydrateVisibleGoalMetricRows, storageKeys } = exportsModule;
        if (typeof hydrateVisibleGoalMetricRows !== 'function') return;

        const content = document.createElement('div');
        const goals = [
            { goalId: 'goal-1', oneMonthValue: 0.04 },
            { goalId: 'goal-2', oneMonthValue: 0.02 },
            { goalId: 'goal-3', oneMonthValue: 0.01 }
        ];

        goals.forEach(goal => {
            storage.set(storageKeys.performanceCache(goal.goalId), JSON.stringify({
                fetchedAt: Date.now(),
                response: {
                    returnsTable: {
                        twr: {
                            oneMonthValue: goal.oneMonthValue,
                            sixMonthValue: null,
                            ytdValue: null,
                            oneYearValue: null,
                            threeYearValue: null
                        }
                    }
                }
            }));

            const metricsRow = document.createElement('tr');
            metricsRow.className = 'gpv-goal-metrics-row';
            metricsRow.dataset.goalId = goal.goalId;

            ['oneMonth', 'sixMonth', 'ytd', 'oneYear', 'threeYear'].forEach(windowKey => {
                const value = document.createElement('span');
                value.className = 'gpv-goal-metrics-value';
                value.dataset.windowKey = windowKey;
                value.textContent = '-';
                metricsRow.appendChild(value);
            });

            content.appendChild(metricsRow);
        });

        hydrateVisibleGoalMetricRows(content, goals.map(goal => goal.goalId));

        const rowValues = Array.from(content.querySelectorAll('.gpv-goal-metrics-row')).map(row => {
            const value = row.querySelector('.gpv-goal-metrics-value[data-window-key="oneMonth"]');
            return value?.textContent;
        });

        expect(rowValues).toEqual(['+4.00%', '+2.00%', '+1.00%']);
    });

    test('createSequentialRequestQueue processes items sequentially', async () => {
        const { createSequentialRequestQueue } = exportsModule;
        const waitSpy = jest.fn(() => Promise.resolve());
        const queue = createSequentialRequestQueue({ delayMs: 10, waitFn: waitSpy });

        let calls = 0;
        const requestFn = async item => {
            calls += 1;
            if (item === 2) {
                throw new Error('fail');
            }
            return item * 2;
        };

        const results = await queue([1, 2], requestFn);
        expect(calls).toBe(2);
        expect(waitSpy).toHaveBeenCalledTimes(1);
        expect(results[0]).toMatchObject({ status: 'fulfilled', value: 2, item: 1 });
        expect(results[1].status).toBe('rejected');
    });
});
