// ==UserScript==
// @name         Goal Portfolio Viewer
// @namespace    https://github.com/laurenceputra/goal-portfolio-viewer
// @version      2.8.0
// @description  View and organize your investment portfolio by buckets with a modern interface. Groups goals by bucket names and displays comprehensive portfolio analytics. Currently supports Endowus (Singapore). Now with optional cross-device sync!
// @author       laurenceputra
// @match        https://app.sg.endowus.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_cookie
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/laurenceputra/goal-portfolio-viewer/main/tampermonkey/goal_portfolio_viewer.user.js
// @downloadURL  https://raw.githubusercontent.com/laurenceputra/goal-portfolio-viewer/main/tampermonkey/goal_portfolio_viewer.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ============================================
    // Logic
    // ============================================

    const DEBUG = false;
    const REMAINING_TARGET_ALERT_THRESHOLD = 2;
    const DEBUG_AUTH = false;
    const SORT_CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

    const UNKNOWN_GOAL_TYPE = 'UNKNOWN_GOAL_TYPE';
    const PROJECTED_KEY_SEPARATOR = '|';

    const ENDPOINT_PATHS = {
        performance: '/v1/goals/performance',
        investible: '/v2/goals/investible',
        summary: '/v1/goals'
    };
    const SUMMARY_ENDPOINT_REGEX = /\/v1\/goals(?:[?#]|$)/;

    const STORAGE_KEYS = {
        performance: 'api_performance',
        investible: 'api_investible',
        summary: 'api_summary'
    };
    const STORAGE_KEY_PREFIXES = {
        goalTarget: 'goal_target_pct_',
        goalFixed: 'goal_fixed_',
        performanceCache: 'gpv_performance_'
    };

    const CLASS_NAMES = {
        goalTable: 'gpv-goal-table',
        targetInput: 'gpv-target-input',
        fixedToggleInput: 'gpv-fixed-toggle-input',
        projectedInput: 'gpv-projected-input',
        remainingTarget: 'gpv-remaining-target',
        remainingAlert: 'gpv-remaining-alert',
        diffCell: 'gpv-diff-cell'
    };

    // ============================================
    // Sync Constants (Cross-Device Sync Feature)
    // ============================================

    const SYNC_STORAGE_KEYS = {
        enabled: 'sync_enabled',
        serverUrl: 'sync_server_url',
        password: 'sync_password', // Single password for both auth and encryption
        userId: 'sync_user_id',
        deviceId: 'sync_device_id',
        lastSync: 'sync_last_sync',
        lastSyncHash: 'sync_last_hash',
        autoSync: 'sync_auto_sync',
        syncInterval: 'sync_interval_minutes'
    };

    const SYNC_DEFAULTS = {
        serverUrl: 'https://goal-sync.workers.dev',
        autoSync: false,
        syncInterval: 30 // minutes
    };

    const SYNC_STATUS = {
        idle: 'idle',
        syncing: 'syncing',
        success: 'success',
        error: 'error',
        conflict: 'conflict'
    };


    // Export surface for tests; populated as helpers become available.
    // When set before load, window.__GPV_DISABLE_AUTO_INIT prevents DOM auto-init (used in tests).
    const testExports = {};

    function logDebug(message, data) {
        if (!DEBUG) {
            return;
        }
        if (data && typeof data === 'object') {
            const sanitized = { ...data };
            delete sanitized.investment;
            delete sanitized.endingBalanceAmount;
            delete sanitized.totalCumulativeReturn;
            delete sanitized.netInvestmentAmount;
            console.log(message, sanitized);
            return;
        }
        console.log(message);
    }

    /**
     * Get storage key for a goal's target percentage
     * @param {string} goalId - Unique goal identifier
     * @returns {string} Storage key
     */
    function getGoalTargetKey(goalId) {
        return `${STORAGE_KEY_PREFIXES.goalTarget}${goalId}`;
    }

    /**
     * Get storage key for a goal's fixed toggle state
     * @param {string} goalId - Unique goal identifier
     * @returns {string} Storage key
     */
    function getGoalFixedKey(goalId) {
        return `${STORAGE_KEY_PREFIXES.goalFixed}${goalId}`;
    }

    /**
     * Get storage key for a goal type's projected investment
     * @param {string} bucket - Bucket name
     * @param {string} goalType - Goal type
     * @returns {string} Storage key
     */
    function getProjectedInvestmentKey(bucket, goalType) {
        const safeBucket = encodeURIComponent(bucket ?? '');
        const safeGoalType = encodeURIComponent(goalType ?? '');
        // Keep separator unencoded to preserve a stable split point in storage keys.
        return `${safeBucket}${PROJECTED_KEY_SEPARATOR}${safeGoalType}`;
    }

    function normalizeString(value, fallback = '') {
        if (value === null || value === undefined) {
            return fallback;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed ? trimmed : fallback;
        }
        return String(value);
    }

    function normalizePerformanceResponse(response) {
        const safeResponse = response && typeof response === 'object' ? response : {};
        const returnsTable = safeResponse.returnsTable && typeof safeResponse.returnsTable === 'object'
            ? safeResponse.returnsTable
            : {};
        const performanceDates = safeResponse.performanceDates && typeof safeResponse.performanceDates === 'object'
            ? safeResponse.performanceDates
            : {};
        const timeSeries = safeResponse.timeSeries && typeof safeResponse.timeSeries === 'object'
            ? safeResponse.timeSeries
            : {};
        const timeSeriesData = Array.isArray(timeSeries.data) ? timeSeries.data : [];
        return {
            ...safeResponse,
            returnsTable,
            performanceDates,
            timeSeries: {
                ...timeSeries,
                data: timeSeriesData
            }
        };
    }

    /**
     * Build a lookup map from an array using a key selector.
     * Duplicate keys overwrite earlier entries (last write wins).
     * @param {Array} items - Array of items to index
     * @param {Function} keyFn - Function returning a key for each item
     * @returns {Object} Lookup map keyed by the resolved key
     */
    function indexBy(items, keyFn) {
        const safeItems = Array.isArray(items) ? items : [];
        if (typeof keyFn !== 'function') {
            return {};
        }
        return safeItems.reduce((acc, item) => {
            const key = keyFn(item);
            if (key !== null && key !== undefined && key !== '') {
                acc[key] = item;
            }
            return acc;
        }, {});
    }

    function extractBucketName(goalName) {
        if (!goalName || typeof goalName !== 'string') {
            return 'Uncategorized';
        }
        const trimmed = goalName.trim();
        if (!trimmed) {
            return 'Uncategorized';
        }
        const separatorIndex = trimmed.indexOf(' - ');
        if (separatorIndex === -1) {
            return trimmed;
        }
        const bucket = trimmed.substring(0, separatorIndex).trim();
        return bucket || 'Uncategorized';
    }

    const GOAL_TYPE_LABELS = {
        GENERAL_WEALTH_ACCUMULATION: 'Investment',
        CASH_MANAGEMENT: 'Cash',
        PASSIVE_INCOME: 'Income'
    };

    function getDisplayGoalType(goalType) {
        if (!goalType || goalType === UNKNOWN_GOAL_TYPE) {
            return 'Unknown';
        }
        return GOAL_TYPE_LABELS[goalType] ?? goalType;
    }

    function sortGoalTypes(goalTypeKeys) {
        const preferred = ['GENERAL_WEALTH_ACCUMULATION', 'PASSIVE_INCOME', 'CASH_MANAGEMENT'];
        const preferredSet = new Set(preferred);
        const others = goalTypeKeys.filter(k => !preferredSet.has(k)).sort();
        const sorted = preferred.filter(type => goalTypeKeys.includes(type));
        return [...sorted, ...others];
    }

    // MONEY_FORMATTER uses en-US locale to avoid narrow no-break space rendering differences across environments,
    // while keeping the currency fixed to SGD. This maintains consistent formatting without relying on locale-specific symbols.
    const MONEY_FORMATTER = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'SGD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    function toFiniteNumber(value, fallback = null) {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : fallback;
    }

    function formatMoney(val) {
        if (typeof val === 'number' && Number.isFinite(val)) {
            return MONEY_FORMATTER.format(val);
        }
        return '-';
    }

    function formatPercent(value, options = {}) {
        if (value === null || value === undefined) {
            return options.fallback ?? '-';
        }
        const multiplier = toFiniteNumber(options.multiplier ?? 1, null);
        if (multiplier === null) {
            return options.fallback ?? '-';
        }
        const numericValue = toFiniteNumber(value, null);
        if (numericValue === null) {
            return options.fallback ?? '-';
        }
        const percentValue = numericValue * multiplier;
        const showSign = options.showSign === true;
        const sign = showSign && percentValue > 0 ? '+' : '';
        return `${sign}${percentValue.toFixed(2)}%`;
    }

    function getFiniteNumbers(values) {
        const numbers = values.map(value => toFiniteNumber(value, null));
        return numbers.some(value => value === null) ? null : numbers;
    }

    function formatGrowthPercentFromEndingBalance(totalReturn, endingBalance) {
        // Calculate growth percentage as: return / principal * 100
        // where principal = ending balance - return
        // Example: if you invested $100 and now have $110, return is $10
        // Growth = 10 / 100 * 100 = 10%
        const numericValues = getFiniteNumbers([totalReturn, endingBalance]);
        if (!numericValues) {
            return '-';
        }
        const [numericReturn, numericEndingBalance] = numericValues;
        const principal = numericEndingBalance - numericReturn;
        if (principal <= 0) {
            return '-';
        }
        return ((numericReturn / principal) * 100).toFixed(2) + '%';
    }

    function getReturnClass(value) {
        const numericValue = toFiniteNumber(value, null);
        if (numericValue === null) {
            return '';
        }
        return numericValue >= 0 ? 'positive' : 'negative';
    }

    function calculatePercentOfType(amount, total) {
        const numericValues = getFiniteNumbers([amount, total]);
        if (!numericValues) {
            return 0;
        }
        const [numericAmount, numericTotal] = numericValues;
        if (numericTotal <= 0) {
            return 0;
        }
        return (numericAmount / numericTotal) * 100;
    }

    function calculateGoalDiff(currentAmount, targetPercent, adjustedTypeTotal) {
        if (targetPercent === null || targetPercent === undefined) {
            return { diffAmount: null, diffClass: '' };
        }
        const numericValues = getFiniteNumbers([currentAmount, targetPercent, adjustedTypeTotal]);
        if (!numericValues) {
            return { diffAmount: null, diffClass: '' };
        }
        const [numericCurrent, numericTarget, numericTotal] = numericValues;
        if (numericTotal <= 0) {
            return { diffAmount: null, diffClass: '' };
        }
        const targetAmount = (numericTarget / 100) * numericTotal;
        const diffAmount = numericCurrent - targetAmount;
        const threshold = numericCurrent * 0.05;
        const diffClass = Math.abs(diffAmount) > threshold ? 'negative' : 'positive';
        return {
            diffAmount,
            diffClass
        };
    }

    function isDashboardRoute(url, originFallback = 'https://app.sg.endowus.com') {
        if (typeof url !== 'string' || !url) {
            return false;
        }
        try {
            const target = new URL(url, originFallback);
            return target.pathname === '/dashboard' || target.pathname === '/dashboard/';
        } catch (_error) {
            return false;
        }
    }

    // ============================================
    // Allocation Model Helpers
    // ============================================

    function calculateFixedTargetPercent(currentAmount, adjustedTypeTotal) {
        const numericValues = getFiniteNumbers([currentAmount, adjustedTypeTotal]);
        if (!numericValues) {
            return null;
        }
        const [numericCurrent, numericTotal] = numericValues;
        if (numericTotal <= 0) {
            return null;
        }
        return (numericCurrent / numericTotal) * 100;
    }

    function calculateRemainingTargetPercent(targetPercents) {
        if (!Array.isArray(targetPercents)) {
            return 100;
        }
        const sum = targetPercents.reduce((total, targetPercent) => {
            const numericTarget = Number(targetPercent);
            if (!Number.isFinite(numericTarget)) {
                return total;
            }
            return total + numericTarget;
        }, 0);
        const remaining = 100 - sum;
        return Number.isFinite(remaining) ? remaining : 100;
    }

    function isRemainingTargetAboveThreshold(remainingTargetPercent, threshold = REMAINING_TARGET_ALERT_THRESHOLD) {
        const numericValues = getFiniteNumbers([remainingTargetPercent, threshold]);
        if (!numericValues) {
            return false;
        }
        const [numericRemaining, numericThreshold] = numericValues;
        return numericRemaining > numericThreshold;
    }

    // Cache for sortGoalsByName memoization
    let sortedGoalsCache = null;
    let sortedGoalsCacheKey = null;
    let sortedGoalsCacheTimestamp = null;

    function clearSortCacheIfExpired() {
        if (sortedGoalsCacheTimestamp === null) {
            return;
        }
        const now = Date.now();
        const age = now - sortedGoalsCacheTimestamp;
        if (age > SORT_CACHE_EXPIRY_MS) {
            sortedGoalsCache = null;
            sortedGoalsCacheKey = null;
            sortedGoalsCacheTimestamp = null;
            logDebug('[Goal Portfolio Viewer] Cleared expired sort cache');
        }
    }

    function sortGoalsByName(goals) {
        const safeGoals = Array.isArray(goals) ? goals : [];
        
        // Generate cache key from goal IDs
        const cacheKey = safeGoals.map(g => g?.goalId || '').join(',');
        
        // Check if cache has expired
        clearSortCacheIfExpired();
        
        // Return cached result if available
        if (sortedGoalsCacheKey === cacheKey && sortedGoalsCache !== null) {
            // Update timestamp on cache hit
            sortedGoalsCacheTimestamp = Date.now();
            return sortedGoalsCache;
        }
        
        // Perform sort and cache result
        const sorted = safeGoals.slice().sort((left, right) => {
            const leftName = String(left?.goalName || '');
            const rightName = String(right?.goalName || '');
            const nameCompare = leftName.localeCompare(rightName, 'en', { sensitivity: 'base' });
            if (nameCompare !== 0) {
                return nameCompare;
            }
            const leftId = String(left?.goalId || '');
            const rightId = String(right?.goalId || '');
            return leftId.localeCompare(rightId, 'en', { sensitivity: 'base' });
        });
        
        sortedGoalsCache = sorted;
        sortedGoalsCacheKey = cacheKey;
        sortedGoalsCacheTimestamp = Date.now();
        return sorted;
    }

    function buildGoalModel(goal, totalTypeAmount, adjustedTotal, goalTargets, goalFixed) {
        const endingBalanceAmount = goal.endingBalanceAmount || 0;
        const percentOfType = calculatePercentOfType(
            endingBalanceAmount,
            totalTypeAmount
        );
        const isFixed = goalFixed[goal.goalId] === true;
        const targetPercent = isFixed
            ? calculateFixedTargetPercent(endingBalanceAmount, adjustedTotal)
            : (typeof goalTargets[goal.goalId] === 'number'
                ? goalTargets[goal.goalId]
                : null);
        const diffInfo = calculateGoalDiff(endingBalanceAmount, targetPercent, adjustedTotal);
        const returnPercent = typeof goal.simpleRateOfReturnPercent === 'number'
            && Number.isFinite(goal.simpleRateOfReturnPercent)
            ? goal.simpleRateOfReturnPercent
            : null;
        const returnValue = goal.totalCumulativeReturn || 0;
        return {
            goalId: goal.goalId,
            goalName: goal.goalName,
            endingBalanceAmount,
            percentOfType,
            isFixed,
            targetPercent,
            diffAmount: diffInfo.diffAmount,
            diffClass: diffInfo.diffClass,
            returnValue,
            returnPercent
        };
    }

    function buildGoalTypeAllocationModel(goals, totalTypeAmount, adjustedTotal, goalTargets, goalFixed) {
        const safeGoals = sortGoalsByName(goals);
        const safeTargets = goalTargets || {};
        const safeFixed = goalFixed || {};
        const goalModels = safeGoals.map(goal => buildGoalModel(
            goal,
            totalTypeAmount,
            adjustedTotal,
            safeTargets,
            safeFixed
        ));
        const remainingTargetPercent = calculateRemainingTargetPercent(
            goalModels.map(goal => goal.targetPercent)
        );
        return {
            goalModels,
            remainingTargetPercent
        };
    }

    function computeGoalTypeViewState(
        goals,
        totalTypeAmount,
        adjustedTotal,
        goalTargets,
        goalFixed
    ) {
        const allocationModel = buildGoalTypeAllocationModel(
            goals,
            totalTypeAmount,
            adjustedTotal,
            goalTargets,
            goalFixed
        );
        const goalModelsById = allocationModel.goalModels.reduce((acc, goal) => {
            if (goal?.goalId) {
                acc[goal.goalId] = goal;
            }
            return acc;
        }, {});
        return {
            ...allocationModel,
            goalModelsById,
            adjustedTotal
        };
    }

    function getProjectedInvestmentValue(projectedInvestmentsState, bucket, goalType) {
        if (!projectedInvestmentsState || typeof projectedInvestmentsState !== 'object') {
            return 0;
        }
        const key = getProjectedInvestmentKey(bucket, goalType);
        const value = projectedInvestmentsState[key];
        return typeof value === 'number' && Number.isFinite(value) ? value : 0;
    }

    function buildDiffCellData(currentAmount, targetPercent, adjustedTypeTotal) {
        const diffInfo = calculateGoalDiff(currentAmount, targetPercent, adjustedTypeTotal);
        const diffDisplay = diffInfo.diffAmount === null ? '-' : formatMoney(diffInfo.diffAmount);
        return {
            diffDisplay,
            diffClassName: diffInfo.diffClass
                ? `${CLASS_NAMES.diffCell} ${diffInfo.diffClass}`
                : CLASS_NAMES.diffCell
        };
    }

    function resolveGoalTypeActionTarget(target) {
        if (!target || typeof target.closest !== 'function') {
            return null;
        }
        const targetInput = target.closest(`.${CLASS_NAMES.targetInput}`);
        if (targetInput) {
            return { type: 'target', element: targetInput };
        }
        const fixedToggle = target.closest(`.${CLASS_NAMES.fixedToggleInput}`);
        if (fixedToggle) {
            return { type: 'fixed', element: fixedToggle };
        }
        return null;
    }

    function buildBucketBase(bucketName, bucketObj) {
        if (!bucketObj) {
            return null;
        }
        const goalTypes = Object.keys(bucketObj).filter(key => key !== '_meta');
        const bucketTotalReturn = goalTypes.reduce((total, goalType) => {
            const value = bucketObj[goalType]?.totalCumulativeReturn;
            return total + (Number.isFinite(value) ? value : 0);
        }, 0);
        const orderedTypes = sortGoalTypes(goalTypes);
        const endingBalanceTotal = bucketObj._meta?.endingBalanceTotal || 0;
        return {
            bucketName,
            bucketObj,
            goalTypes,
            orderedTypes,
            bucketTotalReturn,
            endingBalanceTotal
        };
    }

    function buildSummaryViewModel(bucketMap) {
        if (!bucketMap || typeof bucketMap !== 'object') {
            return { buckets: [] };
        }
        const buckets = Object.keys(bucketMap)
            .sort()
            .map(bucketName => {
                const bucketObj = bucketMap[bucketName];
                const base = buildBucketBase(bucketName, bucketObj);
                if (!base) {
                    return null;
                }
                const { orderedTypes, bucketTotalReturn, endingBalanceTotal } = base;
                return {
                    bucketName,
                    endingBalanceAmount: endingBalanceTotal,
                    totalReturn: bucketTotalReturn,
                    endingBalanceDisplay: formatMoney(endingBalanceTotal),
                    returnDisplay: formatMoney(bucketTotalReturn),
                    growthDisplay: formatGrowthPercentFromEndingBalance(
                        bucketTotalReturn,
                        endingBalanceTotal
                    ),
                    returnClass: getReturnClass(bucketTotalReturn),
                    goalTypes: orderedTypes
                        .map(goalType => {
                            const group = base.bucketObj[goalType];
                            if (!group) {
                                return null;
                            }
                            const typeReturn = group.totalCumulativeReturn || 0;
                            return {
                                goalType,
                                displayName: getDisplayGoalType(goalType),
                                endingBalanceAmount: group.endingBalanceAmount || 0,
                                endingBalanceDisplay: formatMoney(group.endingBalanceAmount),
                                returnAmount: typeReturn,
                                returnDisplay: formatMoney(typeReturn),
                                growthDisplay: formatGrowthPercentFromEndingBalance(
                                    typeReturn,
                                    group.endingBalanceAmount
                                ),
                                returnClass: getReturnClass(typeReturn)
                            };
                        })
                        .filter(Boolean)
                };
            })
            .filter(Boolean);
        return { buckets };
    }

    function buildBucketDetailViewModel({
        bucketName,
        bucketMap,
        projectedInvestmentsState,
        goalTargetById,
        goalFixedById
    }) {
        if (!bucketMap || typeof bucketMap !== 'object' || !bucketName) {
            return null;
        }
        const bucketObj = bucketMap[bucketName];
        const base = buildBucketBase(bucketName, bucketObj);
        if (!base) {
            return null;
        }
        const projectedInvestments = projectedInvestmentsState || {};
        const goalTargets = goalTargetById || {};
        const goalFixed = goalFixedById || {};
        const { orderedTypes, bucketTotalReturn, endingBalanceTotal } = base;

        return {
            bucketName,
            endingBalanceAmount: endingBalanceTotal,
            totalReturn: bucketTotalReturn,
            endingBalanceDisplay: formatMoney(endingBalanceTotal),
            returnDisplay: formatMoney(bucketTotalReturn),
            growthDisplay: formatGrowthPercentFromEndingBalance(
                bucketTotalReturn,
                endingBalanceTotal
            ),
            returnClass: getReturnClass(bucketTotalReturn),
            goalTypes: orderedTypes
                .map(goalType => {
                    const group = base.bucketObj[goalType];
                    if (!group) {
                        return null;
                    }
                    const typeReturn = group.totalCumulativeReturn || 0;
                    const projectedAmount = getProjectedInvestmentValue(projectedInvestments, bucketName, goalType);
                    const adjustedTotal = (group.endingBalanceAmount || 0) + projectedAmount;
                    const goals = Array.isArray(group.goals) ? group.goals : [];
                    const allocationModel = computeGoalTypeViewState(
                        goals,
                        group.endingBalanceAmount || 0,
                        adjustedTotal,
                        goalTargets,
                        goalFixed
                    );
                    return {
                        goalType,
                        displayName: getDisplayGoalType(goalType),
                        endingBalanceAmount: group.endingBalanceAmount || 0,
                        endingBalanceDisplay: formatMoney(group.endingBalanceAmount),
                        totalReturn: typeReturn,
                        returnDisplay: formatMoney(typeReturn),
                        growthDisplay: formatGrowthPercentFromEndingBalance(
                            typeReturn,
                            group.endingBalanceAmount
                        ),
                        returnClass: getReturnClass(typeReturn),
                        projectedAmount,
                        adjustedTotal,
                        remainingTargetPercent: allocationModel.remainingTargetPercent,
                        remainingTargetDisplay: formatPercent(allocationModel.remainingTargetPercent),
                        remainingTargetIsHigh: isRemainingTargetAboveThreshold(allocationModel.remainingTargetPercent),
                        goalModelsById: allocationModel.goalModelsById,
                        goals: allocationModel.goalModels.map(goal => ({
                            ...goal,
                            endingBalanceDisplay: formatMoney(goal.endingBalanceAmount),
                            percentOfTypeDisplay: formatPercent(goal.percentOfType),
                            targetDisplay: goal.targetPercent !== null ? goal.targetPercent.toFixed(2) : '',
                            diffDisplay: goal.diffAmount === null ? '-' : formatMoney(goal.diffAmount),
                            returnDisplay: formatMoney(goal.returnValue),
                            returnPercentDisplay: formatPercent(goal.returnPercent, { multiplier: 100, showSign: false }),
                            returnClass: getReturnClass(goal.returnValue)
                        }))
                    };
                })
                .filter(Boolean)
        };
    }

    function collectGoalIds(bucketObj) {
        if (!bucketObj || typeof bucketObj !== 'object') {
            return [];
        }
        return Object.keys(bucketObj).filter(key => key !== '_meta').reduce((goalIds, goalType) => {
            const group = bucketObj[goalType];
            const goals = Array.isArray(group?.goals) ? group.goals : [];
            goals.forEach(goal => {
                if (goal?.goalId) {
                    goalIds.push(goal.goalId);
                }
            });
            return goalIds;
        }, []);
    }

    function buildGoalMapById(goalIds, getValueFn, isValidFn) {
        if (!Array.isArray(goalIds) || typeof getValueFn !== 'function') {
            return {};
        }
        const isValidValue = typeof isValidFn === 'function' ? isValidFn : () => false;
        return goalIds.reduce((acc, goalId) => {
            const value = getValueFn(goalId);
            if (isValidValue(value)) {
                acc[goalId] = value === true ? true : value;
            }
            return acc;
        }, {});
    }

    function buildGoalTargetById(goalIds, getTargetFn) {
        return buildGoalMapById(
            goalIds,
            getTargetFn,
            value => typeof value === 'number' && Number.isFinite(value)
        );
    }

    function buildGoalFixedById(goalIds, getFixedFn) {
        return buildGoalMapById(
            goalIds,
            getFixedFn,
            value => value === true
        );
    }

    /**
     * Merges data from all three API endpoints into a structured bucket map
     * @param {Array} performanceData - Performance API data
     * @param {Array} investibleData - Investible API data
     * @param {Array} summaryData - Summary API data
     * @returns {Object|null} Bucket map with aggregated data, or null if API data incomplete
     * Structure: { bucketName: { _meta: { endingBalanceTotal: number }, goalType: { endingBalanceAmount, totalCumulativeReturn, goals: [] } } }
     */
    function buildMergedInvestmentData(performanceData, investibleData, summaryData) {
        if (!performanceData || !investibleData || !summaryData) {
            return null;
        }

        if (!Array.isArray(performanceData) || !Array.isArray(investibleData) || !Array.isArray(summaryData)) {
            return null;
        }

        const investibleMap = indexBy(investibleData, item => item?.goalId);
        const summaryMap = indexBy(summaryData, item => item?.goalId);

        const bucketMap = {};

        performanceData.forEach(perf => {
            const invest = investibleMap[perf.goalId] || {};
            const summary = summaryMap[perf.goalId] || {};
            const goalName = normalizeString(invest.goalName || summary.goalName || '', '');
            // Extract bucket name using "Bucket Name - Goal Description" convention
            const goalBucket = extractBucketName(goalName);
            // Note: investible API `totalInvestmentAmount` is misnamed and represents ending balance.
            // We map it internally to endingBalanceAmount to avoid confusing it with principal invested.
            const performanceEndingBalance = extractAmount(perf.totalInvestmentValue);
            const pendingProcessingAmount = extractAmount(perf.pendingProcessingAmount);
            let endingBalanceAmount = performanceEndingBalance !== null
                ? performanceEndingBalance
                : extractAmount(invest.totalInvestmentAmount);
            if (Number.isFinite(endingBalanceAmount) && Number.isFinite(pendingProcessingAmount)) {
                endingBalanceAmount += pendingProcessingAmount;
            }
            const cumulativeReturn = extractAmount(perf.totalCumulativeReturn);
            const safeEndingBalanceAmount = Number.isFinite(endingBalanceAmount) ? endingBalanceAmount : 0;
            const safeCumulativeReturn = Number.isFinite(cumulativeReturn) ? cumulativeReturn : 0;
            
            const goalObj = {
                goalId: perf.goalId,
                goalName: goalName,
                goalBucket: goalBucket,
                goalType: normalizeString(
                    invest.investmentGoalType || summary.investmentGoalType || '',
                    UNKNOWN_GOAL_TYPE
                ),
                endingBalanceAmount: Number.isFinite(endingBalanceAmount) ? endingBalanceAmount : null,
                totalCumulativeReturn: Number.isFinite(cumulativeReturn) ? cumulativeReturn : null,
                simpleRateOfReturnPercent: Number.isFinite(perf.simpleRateOfReturnPercent)
                    ? perf.simpleRateOfReturnPercent
                    : null
            };

            if (!bucketMap[goalBucket]) {
                bucketMap[goalBucket] = {
                    _meta: {
                        endingBalanceTotal: 0
                    }
                };
            }
            
            if (!bucketMap[goalBucket][goalObj.goalType]) {
                bucketMap[goalBucket][goalObj.goalType] = {
                    endingBalanceAmount: 0,
                    totalCumulativeReturn: 0,
                    goals: []
                };
            }
            
            bucketMap[goalBucket][goalObj.goalType].goals.push(goalObj);

            bucketMap[goalBucket][goalObj.goalType].endingBalanceAmount += safeEndingBalanceAmount;
            bucketMap[goalBucket]._meta.endingBalanceTotal += safeEndingBalanceAmount;
            bucketMap[goalBucket][goalObj.goalType].totalCumulativeReturn += safeCumulativeReturn;
        });

        return bucketMap;
    }

    const ViewModels = {
        buildSummaryViewModel,
        buildBucketDetailViewModel
    };

    // ============================================
    // Performance Logic
    // ============================================

    const PERFORMANCE_WINDOWS = {
        oneMonth: { key: 'oneMonth', label: '1M' },
        sixMonth: { key: 'sixMonth', label: '6M' },
        ytd: { key: 'ytd', label: 'YTD' },
        oneYear: { key: 'oneYear', label: '1Y' },
        threeYear: { key: 'threeYear', label: '3Y' }
    };

    function getPerformanceCacheKey(goalId) {
        return `${STORAGE_KEY_PREFIXES.performanceCache}${goalId}`;
    }

    function isCacheFresh(fetchedAt, maxAgeMs, nowMs = Date.now()) {
        const fetchedTime = Number(fetchedAt);
        const maxAge = Number(maxAgeMs);
        if (!Number.isFinite(fetchedTime) || !Number.isFinite(maxAge) || maxAge <= 0) {
            return false;
        }
        return nowMs - fetchedTime < maxAge;
    }

    function isCacheRefreshAllowed(fetchedAt, minAgeMs, nowMs = Date.now()) {
        const minAge = Number(minAgeMs);
        const fetchedTime = Number(fetchedAt);
        const nowTime = Number(nowMs);
        if (!Number.isFinite(minAge) || minAge <= 0 || !Number.isFinite(fetchedTime) || !Number.isFinite(nowTime)) {
            return false;
        }
        return nowTime - fetchedTime >= minAge;
    }

    function formatPercentage(value) {
        return formatPercent(value, { multiplier: 100, showSign: true });
    }

    function normalizeTimeSeriesData(timeSeriesData) {
        if (!Array.isArray(timeSeriesData)) {
            return [];
        }
        return timeSeriesData
            .map(entry => {
                const date = new Date(entry?.date);
                const amount = entry?.amount != null ? Number(entry.amount) : NaN;
                const cumulativeNetInvestmentAmount = entry?.cumulativeNetInvestmentAmount != null
                    ? Number(entry.cumulativeNetInvestmentAmount)
                    : NaN;
                if (!Number.isFinite(date?.getTime()) || !Number.isFinite(amount)) {
                    return null;
                }
                return {
                    date,
                    dateString: entry.date,
                    amount,
                    cumulativeNetInvestmentAmount: Number.isFinite(cumulativeNetInvestmentAmount)
                        ? cumulativeNetInvestmentAmount
                        : null
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    function getLatestTimeSeriesPoint(timeSeriesData, isNormalized = false) {
        const normalized = isNormalized
            ? (Array.isArray(timeSeriesData) ? timeSeriesData : [])
            : normalizeTimeSeriesData(timeSeriesData);
        return normalized.length ? normalized[normalized.length - 1] : null;
    }

    function findNearestPointOnOrBefore(timeSeriesData, targetDate, isNormalized = false) {
        const normalized = isNormalized
            ? (Array.isArray(timeSeriesData) ? timeSeriesData : [])
            : normalizeTimeSeriesData(timeSeriesData);
        if (!normalized.length) {
            return null;
        }
        const target = targetDate instanceof Date ? targetDate : new Date(targetDate);
        if (!Number.isFinite(target?.getTime())) {
            return null;
        }
        for (let i = normalized.length - 1; i >= 0; i -= 1) {
            if (normalized[i].date.getTime() <= target.getTime()) {
                return normalized[i];
            }
        }
        return null;
    }

    function getPerformanceDate(performanceDates, keys) {
        if (!performanceDates || typeof performanceDates !== 'object') {
            return null;
        }
        for (const key of keys) {
            if (performanceDates[key]) {
                const date = new Date(performanceDates[key]);
                if (Number.isFinite(date.getTime())) {
                    return date;
                }
            }
        }
        return null;
    }

    function getWindowStartDate(windowKey, timeSeriesData, performanceDates, isNormalized = false) {
        const normalized = isNormalized
            ? (Array.isArray(timeSeriesData) ? timeSeriesData : [])
            : normalizeTimeSeriesData(timeSeriesData);
        const latestPoint = getLatestTimeSeriesPoint(normalized, true);
        if (!latestPoint) {
            return null;
        }
        const latestDate = latestPoint.date;
        const startDate = new Date(latestDate.getTime());

        switch (windowKey) {
            case 'oneMonth':
                startDate.setMonth(startDate.getMonth() - 1);
                return startDate;
            case 'sixMonth':
                startDate.setMonth(startDate.getMonth() - 6);
                return startDate;
            case 'oneYear':
                startDate.setFullYear(startDate.getFullYear() - 1);
                return startDate;
            case 'threeYear':
                startDate.setFullYear(startDate.getFullYear() - 3);
                return startDate;
            case 'ytd': {
                const ytdDate = getPerformanceDate(performanceDates, ['ytd', 'ytdStartDate', 'yearStartDate']);
                if (ytdDate) {
                    return ytdDate;
                }
                return new Date(latestDate.getFullYear(), 0, 1);
            }
            default:
                return null;
        }
    }

    function calculateReturnFromTimeSeries(timeSeriesData, startDate) {
        if (!startDate) {
            return null;
        }
        const normalized = normalizeTimeSeriesData(timeSeriesData);
        const startPoint = findNearestPointOnOrBefore(normalized, startDate, true);
        const endPoint = getLatestTimeSeriesPoint(normalized, true);
        if (!startPoint || !endPoint) {
            return null;
        }
        if (!Number.isFinite(startPoint.amount) || startPoint.amount === 0) {
            return null;
        }
        const startNetInvestment = startPoint.cumulativeNetInvestmentAmount;
        const endNetInvestment = endPoint.cumulativeNetInvestmentAmount;
        let adjustedEndAmount = endPoint.amount;
        if (Number.isFinite(startNetInvestment) && Number.isFinite(endNetInvestment)) {
            adjustedEndAmount = endPoint.amount - (endNetInvestment - startNetInvestment);
        }
        if (!Number.isFinite(adjustedEndAmount)) {
            return null;
        }
        return (adjustedEndAmount / startPoint.amount) - 1;
    }

    function extractReturnPercent(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (value && typeof value === 'object') {
            const possibleKeys = ['returnPercent', 'rateOfReturn', 'return', 'percent'];
            for (const key of possibleKeys) {
                const candidate = value[key];
                if (typeof candidate === 'number' && Number.isFinite(candidate)) {
                    return candidate;
                }
            }
        }
        return null;
    }

    function mapReturnsTableToWindowReturns(returnsTable) {
        if (!returnsTable || typeof returnsTable !== 'object') {
            return {};
        }
        const twrTable = returnsTable.twr && typeof returnsTable.twr === 'object'
            ? returnsTable.twr
            : null;
        if (!twrTable) {
            return {};
        }
        return {
            oneMonth: extractReturnPercent(twrTable.oneMonthValue),
            sixMonth: extractReturnPercent(twrTable.sixMonthValue),
            ytd: extractReturnPercent(twrTable.ytdValue),
            oneYear: extractReturnPercent(twrTable.oneYearValue),
            threeYear: extractReturnPercent(twrTable.threeYearValue)
        };
    }

    function derivePerformanceWindows(returnsTable, performanceDates, timeSeriesData) {
        const mappedReturns = mapReturnsTableToWindowReturns(returnsTable);
        const windows = {};
        Object.values(PERFORMANCE_WINDOWS).forEach(window => {
            const existingValue = mappedReturns[window.key];
            if (existingValue !== null && existingValue !== undefined) {
                windows[window.key] = existingValue;
                return;
            }
            const startDate = getWindowStartDate(window.key, timeSeriesData, performanceDates);
            const fallbackValue = calculateReturnFromTimeSeries(timeSeriesData, startDate);
            windows[window.key] = fallbackValue;
        });
        return windows;
    }

    function mergeTimeSeriesByDate(timeSeriesCollection, seriesAreNormalized = false) {
        const totals = new Map();
        if (!Array.isArray(timeSeriesCollection)) {
            return [];
        }
        timeSeriesCollection.forEach(series => {
            const normalized = seriesAreNormalized
                ? (Array.isArray(series) ? series : [])
                : normalizeTimeSeriesData(series);
            normalized.forEach(point => {
                const existing = totals.get(point.dateString);
                if (existing) {
                    existing.amount += point.amount;
                } else {
                    totals.set(point.dateString, {
                        date: point.date,
                        dateString: point.dateString,
                        amount: point.amount
                    });
                }
            });
        });
        return Array.from(totals.values())
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .map(entry => ({ date: entry.dateString, amount: entry.amount }));
    }

    function getTimeSeriesWindow(timeSeriesData, startDate, isNormalized = false) {
        const normalized = isNormalized
            ? (Array.isArray(timeSeriesData) ? timeSeriesData : [])
            : normalizeTimeSeriesData(timeSeriesData);
        if (!startDate) {
            return normalized.map(point => ({
                date: point.dateString,
                amount: point.amount
            }));
        }
        const targetDate = startDate instanceof Date ? startDate : new Date(startDate);
        if (!Number.isFinite(targetDate?.getTime())) {
            return [];
        }
        return normalized
            .filter(point => point.date.getTime() >= targetDate.getTime())
            .map(point => ({ date: point.dateString, amount: point.amount }));
    }

    function extractAmount(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (value && typeof value === 'object') {
            const nestedAmount = value.amount;
            if (typeof nestedAmount === 'number' && Number.isFinite(nestedAmount)) {
                return nestedAmount;
            }
            const displayAmount = value.display?.amount;
            if (typeof displayAmount === 'number' && Number.isFinite(displayAmount)) {
                return displayAmount;
            }
        }
        return null;
    }

    function parseJsonSafely(rawText) {
        if (typeof rawText !== 'string' || !rawText.trim()) {
            return null;
        }
        try {
            return JSON.parse(rawText);
        } catch (_error) {
            return null;
        }
    }

    function calculateWeightedAverage(values, weights) {
        if (!Array.isArray(values) || !Array.isArray(weights) || values.length !== weights.length) {
            return null;
        }
        let total = 0;
        let totalWeight = 0;
        values.forEach((value, index) => {
            const numericValue = Number(value);
            const weight = Number(weights[index]);
            if (Number.isFinite(numericValue) && Number.isFinite(weight) && weight > 0) {
                total += numericValue * weight;
                totalWeight += weight;
            }
        });
        if (totalWeight === 0) {
            return null;
        }
        return total / totalWeight;
    }

    function calculateWeightedWindowReturns(performanceResponses) {
        const responses = Array.isArray(performanceResponses)
            ? performanceResponses.map(normalizePerformanceResponse)
            : [];
        const windowKeys = Object.values(PERFORMANCE_WINDOWS).map(window => window.key);
        const valuesByWindow = {};
        const weightsByWindow = {};

        windowKeys.forEach(key => {
            valuesByWindow[key] = [];
            weightsByWindow[key] = [];
        });

        responses.forEach(response => {
            const mappedReturns = mapReturnsTableToWindowReturns(response?.returnsTable);
            const netInvestmentValue = extractAmount(
                response?.gainOrLossTable?.netInvestment?.allTimeValue
            ) ?? extractAmount(response?.netInvestmentAmount ?? response?.netInvestment);
            const weight = Number.isFinite(netInvestmentValue) && netInvestmentValue > 0 ? netInvestmentValue : null;

            if (!weight) {
                return;
            }

            windowKeys.forEach(windowKey => {
                const mappedValue = mappedReturns[windowKey];
                if (typeof mappedValue === 'number' && Number.isFinite(mappedValue)) {
                    valuesByWindow[windowKey].push(mappedValue);
                    weightsByWindow[windowKey].push(weight);
                }
            });
        });

        const weightedReturns = {};
        windowKeys.forEach(windowKey => {
            weightedReturns[windowKey] = calculateWeightedAverage(
                valuesByWindow[windowKey],
                weightsByWindow[windowKey]
            );
        });

        return weightedReturns;
    }

    function summarizePerformanceMetrics(performanceResponses, mergedTimeSeries) {
        const responses = Array.isArray(performanceResponses)
            ? performanceResponses.map(normalizePerformanceResponse)
            : [];
        const netInvestments = [];
        const totalReturns = [];
        const simpleReturns = [];
        const twrReturns = [];
        const annualisedIrrReturns = [];
        let totalReturnAmount = 0;
        let totalReturnSeen = false;
        let netFeesAmount = 0;
        let netFeesSeen = false;
        let netInvestmentAmount = 0;
        let netInvestmentSeen = false;
        let endingBalanceAmount = 0;
        let endingBalanceSeen = false;

        responses.forEach(response => {
            const totalReturnValue = extractAmount(response?.totalCumulativeReturnAmount);
            const netInvestmentValue = extractAmount(
                response?.gainOrLossTable?.netInvestment?.allTimeValue
            ) ?? extractAmount(response?.netInvestmentAmount ?? response?.netInvestment);
            const accessFeeValue = extractAmount(response?.gainOrLossTable?.accessFeeCharged?.allTimeValue);
            const trailerFeeValue = extractAmount(response?.gainOrLossTable?.trailerFeeRebates?.allTimeValue);
            const endingBalanceValue = extractAmount(
                response?.endingBalanceAmount ?? response?.totalBalanceAmount ?? response?.marketValueAmount
            );

            if (Number.isFinite(totalReturnValue)) {
                totalReturnSeen = true;
                totalReturnAmount += totalReturnValue;
            }
            if (Number.isFinite(accessFeeValue) || Number.isFinite(trailerFeeValue)) {
                netFeesSeen = true;
                netFeesAmount += (Number.isFinite(accessFeeValue) ? accessFeeValue : 0)
                    - (Number.isFinite(trailerFeeValue) ? trailerFeeValue : 0);
            }
            if (Number.isFinite(netInvestmentValue)) {
                netInvestmentSeen = true;
                netInvestmentAmount += netInvestmentValue;
            }
            if (Number.isFinite(endingBalanceValue)) {
                endingBalanceSeen = true;
                endingBalanceAmount += endingBalanceValue;
            }

            const netWeight = Number.isFinite(netInvestmentValue) ? netInvestmentValue : 0;
            if (Number.isFinite(netWeight) && netWeight > 0) {
                netInvestments.push(netWeight);
                totalReturns.push(response?.totalCumulativeReturnPercent);
                simpleReturns.push(response?.simpleRateOfReturnPercent ?? response?.simpleReturnPercent);
                twrReturns.push(
                    response?.returnsTable?.twr?.allTimeValue
                    ?? response?.timeWeightedReturnPercent
                    ?? response?.twrPercent
                );
                annualisedIrrReturns.push(
                    response?.returnsTable?.annualisedIrr?.allTimeValue
                );
            }
        });

        if (endingBalanceAmount === 0 && Array.isArray(mergedTimeSeries) && mergedTimeSeries.length) {
            const latest = mergedTimeSeries[mergedTimeSeries.length - 1];
            if (Number.isFinite(latest?.amount)) {
                endingBalanceAmount = latest.amount;
                endingBalanceSeen = true;
            }
        }

        const totalReturnPercent = calculateWeightedAverage(totalReturns, netInvestments);
        const simpleReturnPercent = calculateWeightedAverage(simpleReturns, netInvestments);
        const twrPercent = calculateWeightedAverage(twrReturns, netInvestments);
        const annualisedIrrPercent = calculateWeightedAverage(annualisedIrrReturns, netInvestments);

        // Note: We intentionally do not infer netInvestmentAmount from mergedTimeSeries, because
        // the time series typically represents market value over time, not cumulative net investment.
        // Using market value as net investment would produce inaccurate financial metrics.

        return {
            totalReturnPercent,
            simpleReturnPercent,
            twrPercent,
            annualisedIrrPercent,
            totalReturnAmount: totalReturnSeen ? totalReturnAmount : null,
            netFeesAmount: netFeesSeen ? netFeesAmount : null,
            netInvestmentAmount: netInvestmentSeen ? netInvestmentAmount : null,
            endingBalanceAmount: endingBalanceSeen ? endingBalanceAmount : null
        };
    }

    function buildPerformanceMetricsRows(metrics) {
        const rows = [
            {
                key: 'totalReturnPercent',
                label: 'Total Return %',
                value: formatPercent(metrics?.totalReturnPercent, { multiplier: 100, showSign: true }),
                info: 'Weighted by net investment over time. Large recent contributions can dilute earlier gains. Compare with Simple Return % to see how contributions affect performance.'
            },
            {
                key: 'simpleReturnPercent',
                label: 'Simple Return %',
                value: formatPercent(metrics?.simpleReturnPercent, { multiplier: 100, showSign: true })
            },
            {
                key: 'twrPercent',
                label: 'TWR %',
                value: formatPercent(metrics?.twrPercent, { multiplier: 100, showSign: true })
            },
            {
                key: 'annualisedIrrPercent',
                label: 'Annualised IRR',
                value: formatPercent(metrics?.annualisedIrrPercent, { multiplier: 100, showSign: true })
            },
            {
                key: 'totalReturnAmount',
                label: 'Gain / Loss',
                value: formatMoney(metrics?.totalReturnAmount)
            },
            {
                key: 'netFeesAmount',
                label: 'Net Fees',
                value: formatMoney(metrics?.netFeesAmount)
            },
            {
                key: 'netInvestmentAmount',
                label: 'Net Investment',
                value: formatMoney(metrics?.netInvestmentAmount)
            },
            {
                key: 'endingBalanceAmount',
                label: 'Ending Balance',
                value: formatMoney(metrics?.endingBalanceAmount)
            }
        ];

        return rows;
    }

    function createSequentialRequestQueue({ delayMs, waitFn }) {
        const delay = Number(delayMs) || 0;
        const wait = waitFn || (ms => new Promise(resolve => setTimeout(resolve, ms)));

        return async function runSequential(items, requestFn) {
            const results = [];
            if (!Array.isArray(items) || typeof requestFn !== 'function') {
                return results;
            }
            for (let index = 0; index < items.length; index += 1) {
                try {
                    const value = await requestFn(items[index]);
                    results.push({ status: 'fulfilled', value, item: items[index] });
                } catch (error) {
                    results.push({ status: 'rejected', reason: error, item: items[index] });
                }
                if (index < items.length - 1 && delay > 0) {
                    await wait(delay);
                }
            }
            return results;
        };
    }

    // ============================================
    // Storage Management
    // ============================================

    const Storage = {
        get(key, fallback, context) {
            try {
                return GM_getValue(key, fallback);
            } catch (error) {
                const label = context || 'Error reading storage';
                console.error(`[Goal Portfolio Viewer] ${label}:`, error);
                return fallback;
            }
        },
        set(key, value, context) {
            try {
                GM_setValue(key, value);
                return true;
            } catch (error) {
                const label = context || 'Error writing storage';
                console.error(`[Goal Portfolio Viewer] ${label}:`, error);
                return false;
            }
        },
        remove(key, context) {
            try {
                GM_deleteValue(key);
                return true;
            } catch (error) {
                const label = context || 'Error deleting storage';
                console.error(`[Goal Portfolio Viewer] ${label}:`, error);
                return false;
            }
        },
        readJson(key, validateFn, context) {
            const stored = Storage.get(key, null, context);
            if (!stored) {
                return null;
            }
            const parsed = parseJsonSafely(stored);
            if (!validateFn(parsed)) {
                Storage.remove(key, context);
                return null;
            }
            return parsed;
        },
        writeJson(key, value, context) {
            return Storage.set(key, JSON.stringify(value), context);
        }
    };

    // ============================================
    // Sync Modules (Cross-Device Sync Feature)
    // ============================================

    const SyncEncryption = (() => {
    const PBKDF2_ITERATIONS = 100000;
    const MASTER_KEY_ITERATIONS = 200000; // Higher iterations for master key derivation
    const KEY_LENGTH = 256;
    const IV_LENGTH = 12; // 96 bits for GCM
    const SALT_LENGTH = 16; // 128 bits
    const MASTER_KEY_SALT = 'goal-portfolio-viewer-master-key-v1'; // Fixed salt for master key derivation

    /**
     * Check if Web Crypto API is available
     */
    function isSupported() {
        return typeof window !== 'undefined' && 
               window.crypto && 
               window.crypto.subtle &&
               typeof window.crypto.getRandomValues === 'function';
    }

    /**
     * Generate a cryptographically secure random buffer
     */
    function generateRandomBuffer(length) {
        return window.crypto.getRandomValues(new Uint8Array(length));
    }

    /**
     * Generate a UUID v4 using cryptographically secure randomness
     */
    function generateUUID() {
        // Use crypto.randomUUID() if available (modern browsers)
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }

        // Fallback: use crypto.getRandomValues() for secure random bytes
        const buffer = new Uint8Array(16);
        window.crypto.getRandomValues(buffer);

        // Set version (4) and variant (RFC 4122) bits
        buffer[6] = (buffer[6] & 0x0f) | 0x40;
        buffer[8] = (buffer[8] & 0x3f) | 0x80;

        // Convert to UUID string format
        const hex = Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
    }

    /**
     * Derive master key from password using PBKDF2
     * Master key acts as intermediate key material - password is never used directly for encryption
     * Returns: raw key bytes (Uint8Array) for use as input to encryption key derivation
     */
    async function deriveMasterKey(password) {
        if (!isSupported()) {
            throw new Error('Web Crypto API not supported');
        }

        const encoder = new TextEncoder();
        const passwordKey = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits']
        );

        // Derive 32 bytes (256 bits) of key material
        const masterKeyBits = await window.crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: encoder.encode(MASTER_KEY_SALT),
                iterations: MASTER_KEY_ITERATIONS,
                hash: 'SHA-256'
            },
            passwordKey,
            256
        );

        return new Uint8Array(masterKeyBits);
    }

    /**
     * Derive encryption key from master key using PBKDF2
     * This adds another layer of key derivation for defense in depth
     */
    async function deriveKey(masterKey, salt) {
        const masterKeyObj = await window.crypto.subtle.importKey(
            'raw',
            masterKey,
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        return window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            masterKeyObj,
            { name: 'AES-GCM', length: KEY_LENGTH },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypt data with AES-GCM
     * Password is used as proxy to derive master key, which then derives encryption key
     * Returns: base64(salt + iv + ciphertext + auth_tag)
     */
    async function encrypt(plaintext, password) {
        if (!isSupported()) {
            throw new Error('Web Crypto API not supported');
        }

        try {
            const encoder = new TextEncoder();
            const salt = generateRandomBuffer(SALT_LENGTH);
            const iv = generateRandomBuffer(IV_LENGTH);
            
            // Step 1: Derive master key from password (password is proxy)
            const masterKey = await deriveMasterKey(password);
            
            // Step 2: Derive encryption key from master key
            const key = await deriveKey(masterKey, salt);

            const ciphertext = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encoder.encode(plaintext)
            );

            // Concatenate: salt + iv + ciphertext (includes auth tag)
            const combined = new Uint8Array(
                salt.length + iv.length + ciphertext.byteLength
            );
            combined.set(salt, 0);
            combined.set(iv, salt.length);
            combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

            // Convert to base64 for transmission
            return btoa(String.fromCharCode(...combined));
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Encryption failed:', error);
            throw new Error('Encryption failed');
        }
    }

    /**
     * Decrypt data encrypted with encrypt()
     * Password is used as proxy to derive master key, which then derives decryption key
     */
    async function decrypt(encryptedBase64, password) {
        if (!isSupported()) {
            throw new Error('Web Crypto API not supported');
        }

        try {
            // Decode from base64
            const combined = new Uint8Array(
                atob(encryptedBase64).split('').map(c => c.charCodeAt(0))
            );

            // Extract components
            const salt = combined.slice(0, SALT_LENGTH);
            const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
            const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

            // Step 1: Derive master key from password (password is proxy)
            const masterKey = await deriveMasterKey(password);
            
            // Step 2: Derive decryption key from master key
            const key = await deriveKey(masterKey, salt);

            const plaintext = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                ciphertext
            );

            const decoder = new TextDecoder();
            return decoder.decode(plaintext);
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Decryption failed:', error);
            throw new Error('Decryption failed - check password');
        }
    }

    /**
     * Compute SHA-256 hash of data
     */
    async function hash(data) {
        const encoder = new TextEncoder();
        const buffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(data));
        const hashArray = Array.from(new Uint8Array(buffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Hash password for authentication
     * Uses SHA-256 with userId as salt
     */
    async function hashPasswordForAuth(password, userId) {
        if (!isSupported()) {
            throw new Error('Web Crypto API not supported');
        }

        const encoder = new TextEncoder();
        const data = encoder.encode(password + '|' + userId);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    return {
        isSupported,
        generateUUID,
        deriveMasterKey,
        encrypt,
        decrypt,
        hash,
        hashPasswordForAuth
    };
})();
    testExports.SyncEncryption = SyncEncryption;

    // ============================================
    // Sync Manager (Cross-Device Sync)
    // ============================================

    const SyncManager = (() => {
    let syncStatus = SYNC_STATUS.idle;
    let lastError = null;
    let autoSyncTimer = null;

    /**
     * Check if sync is enabled
     */
    function isEnabled() {
        return Storage.get(SYNC_STORAGE_KEYS.enabled, false) === true;
    }

    /**
     * Check if sync is configured
     */
    function isConfigured() {
        const serverUrl = Storage.get(SYNC_STORAGE_KEYS.serverUrl, null);
        const password = Storage.get(SYNC_STORAGE_KEYS.password, null);
        const userId = Storage.get(SYNC_STORAGE_KEYS.userId, null);
        return serverUrl && password && userId;
    }

    /**
     * Get or create device ID
     */
    function getDeviceId() {
        let deviceId = Storage.get(SYNC_STORAGE_KEYS.deviceId, null);
        if (!deviceId) {
            deviceId = SyncEncryption.generateUUID();
            Storage.set(SYNC_STORAGE_KEYS.deviceId, deviceId);
        }
        return deviceId;
    }

    /**
     * Collect syncable config data
     */
    function collectConfigData() {
        const config = {
            version: 1,
            goalTargets: {},
            goalFixed: {},
            timestamp: Date.now()
        };

        // Collect all goal target percentages
        const allKeys = GM_listValues ? GM_listValues() : [];
        for (const key of allKeys) {
            if (key.startsWith(STORAGE_KEY_PREFIXES.goalTarget)) {
                const goalId = key.substring(STORAGE_KEY_PREFIXES.goalTarget.length);
                const value = Storage.get(key, null);
                if (value !== null) {
                    config.goalTargets[goalId] = value;
                }
            } else if (key.startsWith(STORAGE_KEY_PREFIXES.goalFixed)) {
                const goalId = key.substring(STORAGE_KEY_PREFIXES.goalFixed.length);
                const value = Storage.get(key, false);
                config.goalFixed[goalId] = value;
            }
        }

        return config;
    }

    /**
     * Apply config data to local storage
     */
    function applyConfigData(config) {
        if (!config || typeof config !== 'object') {
            throw new Error('Invalid config data');
        }

        // Apply goal targets
        if (config.goalTargets && typeof config.goalTargets === 'object') {
            for (const [goalId, value] of Object.entries(config.goalTargets)) {
                const key = getGoalTargetKey(goalId);
                Storage.set(key, value);
            }
        }

        // Apply goal fixed states
        if (config.goalFixed && typeof config.goalFixed === 'object') {
            for (const [goalId, value] of Object.entries(config.goalFixed)) {
                const key = getGoalFixedKey(goalId);
                Storage.set(key, value === true);
            }
        }

        logDebug('[Goal Portfolio Viewer] Applied sync config data', {
            targets: Object.keys(config.goalTargets || {}).length,
            fixed: Object.keys(config.goalFixed || {}).length
        });
    }

    /**
     * Upload config to server
     */
    async function uploadConfig(config) {
        const serverUrl = Storage.get(SYNC_STORAGE_KEYS.serverUrl, SYNC_DEFAULTS.serverUrl);
        const password = Storage.get(SYNC_STORAGE_KEYS.password, null);
        const userId = Storage.get(SYNC_STORAGE_KEYS.userId, null);

        if (!password || !userId) {
            throw new Error('Sync not configured');
        }

        // Encrypt config using password
        const plaintext = JSON.stringify(config);
        const encryptedData = await SyncEncryption.encrypt(plaintext, password);

        // Hash password for authentication
        const passwordHash = await SyncEncryption.hashPasswordForAuth(password, userId);

        // Prepare payload
        const payload = {
            encryptedData,
            deviceId: getDeviceId(),
            timestamp: config.timestamp,
            version: config.version,
            userId
        };

        // Upload to server (POST /sync)
        const response = await fetch(`${serverUrl}/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Password-Hash': passwordHash,
                'X-User-Id': userId
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Upload failed: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Download config from server
     */
    async function downloadConfig() {
        const serverUrl = Storage.get(SYNC_STORAGE_KEYS.serverUrl, SYNC_DEFAULTS.serverUrl);
        const password = Storage.get(SYNC_STORAGE_KEYS.password, null);
        const userId = Storage.get(SYNC_STORAGE_KEYS.userId, null);

        if (!password || !userId) {
            throw new Error('Sync not configured');
        }

        // Hash password for authentication
        const passwordHash = await SyncEncryption.hashPasswordForAuth(password, userId);

        // Download from server
        const response = await fetch(`${serverUrl}/sync/${userId}`, {
            method: 'GET',
            headers: {
                'X-Password-Hash': passwordHash,
                'X-User-Id': userId
            }
        });

        if (response.status === 404) {
            // No data on server yet
            return null;
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Download failed: ${response.status}`);
        }

        const serverData = await response.json();

        // Server returns: { success: true, data: { encryptedData, deviceId, timestamp, version } }
        const { data } = serverData || {};

        if (!data || !data.encryptedData) {
            throw new Error('Invalid server response: missing encrypted data');
        }

        // Decrypt config using password
        const plaintext = await SyncEncryption.decrypt(data.encryptedData, password);
        const config = JSON.parse(plaintext);

        return {
            config,
            metadata: {
                deviceId: data.deviceId,
                timestamp: data.timestamp,
                version: data.version
            }
        };
    }

    /**
     * Check if there's a sync conflict
     */
    async function detectConflict(localConfig, serverData) {
        if (!serverData) {
            return null; // No server data, no conflict
        }

        const localTimestamp = localConfig.timestamp;
        const serverTimestamp = serverData.metadata.timestamp;
        const localDeviceId = getDeviceId();
        const serverDeviceId = serverData.metadata.deviceId;

        // If last sync was from this device, no conflict
        if (serverDeviceId === localDeviceId) {
            return null;
        }

        // If local is older than server, it's a conflict
        if (localTimestamp < serverTimestamp) {
            return {
                local: localConfig,
                remote: serverData.config,
                localTimestamp,
                remoteTimestamp: serverTimestamp,
                remoteDeviceId: serverDeviceId
            };
        }

        return null;
    }

    /**
     * Perform sync operation
     */
    async function performSync(options = {}) {
        const { force = false, direction = 'both' } = options;

        if (!isEnabled() || !isConfigured()) {
            throw new Error('Sync not enabled or configured');
        }

        if (!SyncEncryption.isSupported()) {
            throw new Error('Web Crypto API not supported in this browser');
        }

        syncStatus = SYNC_STATUS.syncing;
        if (typeof updateSyncUI === 'function') {
            updateSyncUI();
        }

        try {
            const localConfig = collectConfigData();
            
            if (direction === 'upload' || direction === 'both') {
                // Upload local config
                await uploadConfig(localConfig);
                Storage.set(SYNC_STORAGE_KEYS.lastSync, Date.now());
                
                const hash = await SyncEncryption.hash(JSON.stringify(localConfig));
                Storage.set(SYNC_STORAGE_KEYS.lastSyncHash, hash);

                syncStatus = SYNC_STATUS.success;
                lastError = null;
                logDebug('[Goal Portfolio Viewer] Sync upload successful');
            }

            if (direction === 'download' || direction === 'both') {
                // Download and check for conflicts
                const serverData = await downloadConfig();
                
                if (!serverData) {
                    // No server data, upload local
                    if (direction === 'both') {
                        await uploadConfig(localConfig);
                        Storage.set(SYNC_STORAGE_KEYS.lastSync, Date.now());
                    }
                    syncStatus = SYNC_STATUS.success;
                    lastError = null;
                    logDebug('[Goal Portfolio Viewer] No server data, uploaded local config');
                } else {
                    // Check for conflicts
                    const conflict = await detectConflict(localConfig, serverData);
                    
                    if (conflict && !force) {
                        syncStatus = SYNC_STATUS.conflict;
                        if (typeof showConflictResolutionUI === 'function') {
                            showConflictResolutionUI(conflict);
                        }
                        return { status: 'conflict', conflict };
                    } else if (serverData) {
                        // Apply server data
                        applyConfigData(serverData.config);
                        Storage.set(SYNC_STORAGE_KEYS.lastSync, Date.now());
                        
                        const hash = await SyncEncryption.hash(JSON.stringify(serverData.config));
                        Storage.set(SYNC_STORAGE_KEYS.lastSyncHash, hash);

                        syncStatus = SYNC_STATUS.success;
                        lastError = null;
                        logDebug('[Goal Portfolio Viewer] Sync download successful');
                    }
                }
            }

            if (typeof updateSyncUI === 'function') {
                updateSyncUI();
            }
            return { status: 'success' };
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Sync failed:', error);
            syncStatus = SYNC_STATUS.error;
            lastError = error.message;
            if (typeof updateSyncUI === 'function') {
                updateSyncUI();
            }
            throw error;
        }
    }

    /**
     * Resolve conflict by choosing local or remote
     */
    async function resolveConflict(resolution, conflict) {
        try {
            syncStatus = SYNC_STATUS.syncing;
            if (typeof updateSyncUI === 'function') {
                updateSyncUI();
            }

            if (resolution === 'local') {
                // Upload local, overwrite server
                await uploadConfig(conflict.local);
                Storage.set(SYNC_STORAGE_KEYS.lastSync, Date.now());
            } else if (resolution === 'remote') {
                // Apply remote, keep server
                applyConfigData(conflict.remote);
                Storage.set(SYNC_STORAGE_KEYS.lastSync, Date.now());
            } else {
                throw new Error('Invalid resolution');
            }

            syncStatus = SYNC_STATUS.success;
            lastError = null;
            if (typeof updateSyncUI === 'function') {
                updateSyncUI();
            }
            
            // Refresh the portfolio view
            if (typeof renderPortfolioView === 'function') {
                renderPortfolioView();
            }
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Conflict resolution failed:', error);
            syncStatus = SYNC_STATUS.error;
            lastError = error.message;
            if (typeof updateSyncUI === 'function') {
                updateSyncUI();
            }
            throw error;
        }
    }

    /**
     * Start automatic sync
     */
    function startAutoSync() {
        stopAutoSync(); // Clear any existing timer

        const autoSync = Storage.get(SYNC_STORAGE_KEYS.autoSync, SYNC_DEFAULTS.autoSync);
        const intervalMinutes = Storage.get(SYNC_STORAGE_KEYS.syncInterval, SYNC_DEFAULTS.syncInterval);

        if (!autoSync || !isEnabled() || !isConfigured()) {
            return;
        }

        const intervalMs = intervalMinutes * 60 * 1000;
        autoSyncTimer = setInterval(() => {
            performSync({ direction: 'both' }).catch(error => {
                console.error('[Goal Portfolio Viewer] Auto-sync failed:', error);
            });
        }, intervalMs);

        logDebug(`[Goal Portfolio Viewer] Auto-sync started (interval: ${intervalMinutes} minutes)`);
    }

    /**
     * Stop automatic sync
     */
    function stopAutoSync() {
        if (autoSyncTimer) {
            clearInterval(autoSyncTimer);
            autoSyncTimer = null;
            logDebug('[Goal Portfolio Viewer] Auto-sync stopped');
        }
    }

    /**
     * Get current sync status
     */
    function getStatus() {
        return {
            status: syncStatus,
            lastError,
            lastSync: Storage.get(SYNC_STORAGE_KEYS.lastSync, null),
            isEnabled: isEnabled(),
            isConfigured: isConfigured(),
            cryptoSupported: SyncEncryption.isSupported()
        };
    }

    /**
     * Enable sync
     */
    function enable(config) {
        if (!config || !config.serverUrl || !config.password || !config.userId) {
            throw new Error('Invalid sync configuration: serverUrl, password, and userId required');
        }

        Storage.set(SYNC_STORAGE_KEYS.enabled, true);
        Storage.set(SYNC_STORAGE_KEYS.serverUrl, config.serverUrl);
        Storage.set(SYNC_STORAGE_KEYS.password, config.password);
        Storage.set(SYNC_STORAGE_KEYS.userId, config.userId);
        
        if (config.autoSync !== undefined) {
            Storage.set(SYNC_STORAGE_KEYS.autoSync, config.autoSync);
        }
        if (config.syncInterval !== undefined) {
            Storage.set(SYNC_STORAGE_KEYS.syncInterval, config.syncInterval);
        }

        startAutoSync();
        logDebug('[Goal Portfolio Viewer] Sync enabled');
    }

    /**
     * Register a new user account
     */
    async function register(serverUrl, userId, password) {
        if (!serverUrl || !userId || !password) {
            throw new Error('serverUrl, userId, and password are required');
        }

        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters');
        }

        // Hash password for authentication
        const passwordHash = await SyncEncryption.hashPasswordForAuth(password, userId);

        // Call register endpoint
        const response = await fetch(`${serverUrl}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId,
                passwordHash
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'Registration failed');
        }

        return result;
    }

    /**
     * Login (verify credentials)
     */
    async function login(serverUrl, userId, password) {
        if (!serverUrl || !userId || !password) {
            throw new Error('serverUrl, userId, and password are required');
        }

        // Hash password for authentication
        const passwordHash = await SyncEncryption.hashPasswordForAuth(password, userId);

        // Call login endpoint
        const response = await fetch(`${serverUrl}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId,
                passwordHash
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'Login failed');
        }

        return result;
    }

    /**
     * Disable sync
     */
    function disable() {
        stopAutoSync();
        Storage.set(SYNC_STORAGE_KEYS.enabled, false);
        logDebug('[Goal Portfolio Viewer] Sync disabled');
    }

    /**
     * Clear sync configuration
     */
    function clearConfig() {
        stopAutoSync();
        
        Object.values(SYNC_STORAGE_KEYS).forEach(key => {
            Storage.remove(key);
        });
        
        syncStatus = SYNC_STATUS.idle;
        lastError = null;
        
        logDebug('[Goal Portfolio Viewer] Sync configuration cleared');
    }

    return {
        isEnabled,
        isConfigured,
        getStatus,
        performSync,
        resolveConflict,
        enable,
        disable,
        clearConfig,
        startAutoSync,
        stopAutoSync,
        collectConfigData,
        applyConfigData,
        register,
        login
    };
})();
    testExports.SyncManager = SyncManager;

    // ============================================
    // Browser-Only Code (Skip in Node.js/Testing Environment)
    // ============================================
    // Everything below this point requires browser APIs (window, document, etc.)
    // and should not execute when running tests in Node.js.
    if (typeof window !== 'undefined') {

    // ============================================
    // Adapters/State
    // ============================================
    const PERFORMANCE_ENDPOINT = 'https://bff.prod.silver.endowus.com/v1/performance';
    const REQUEST_DELAY_MS = 500;
    const PERFORMANCE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
    const PERFORMANCE_CACHE_REFRESH_MIN_AGE_MS = 24 * 60 * 60 * 1000;
    const PERFORMANCE_CHART_WINDOW = PERFORMANCE_WINDOWS.oneYear.key;
    const PERFORMANCE_REQUEST_TIMEOUT_MS = 10000;

    const state = {
        apiData: {
            performance: null,
            investible: null,
            summary: null
        },
        projectedInvestments: {},
        performance: {
            goalData: {},
            requestQueue: createSequentialRequestQueue({
                delayMs: REQUEST_DELAY_MS
            })
        },
        auth: {
            requestHeaders: null,
            gmCookieAuthToken: null,
            gmCookieDumped: false
        },
        ui: {
            portfolioButton: null,
            lastUrl: window.location.href,
            urlMonitorCleanup: null,
            urlCheckTimeout: null,
            observer: null
        }
    };

    const ENDPOINT_HANDLERS = {
        performance: data => {
            state.apiData.performance = data;
            Storage.writeJson(STORAGE_KEYS.performance, data, 'Error saving performance data');
            logDebug('[Goal Portfolio Viewer] Intercepted performance data');
        },
        investible: data => {
            state.apiData.investible = data;
            Storage.writeJson(STORAGE_KEYS.investible, data, 'Error saving investible data');
            logDebug('[Goal Portfolio Viewer] Intercepted investible data');
        },
        summary: data => {
            if (!Array.isArray(data)) {
                return;
            }
            state.apiData.summary = data;
            Storage.writeJson(STORAGE_KEYS.summary, data, 'Error saving summary data');
            logDebug('[Goal Portfolio Viewer] Intercepted summary data');
        }
    };

    function detectEndpointKey(url) {
        if (typeof url !== 'string') {
            return null;
        }
        if (url.includes(ENDPOINT_PATHS.performance)) {
            return 'performance';
        }
        if (url.includes(ENDPOINT_PATHS.investible)) {
            return 'investible';
        }
        if (url.match(SUMMARY_ENDPOINT_REGEX)) {
            return 'summary';
        }
        return null;
    }

    async function handleInterceptedResponse(url, readData) {
        const endpointKey = detectEndpointKey(url);
        if (!endpointKey) {
            return;
        }
        const handler = ENDPOINT_HANDLERS[endpointKey];
        if (typeof handler !== 'function') {
            return;
        }
        try {
            const data = await readData();
            if (data === null || data === undefined) {
                return;
            }
            handler(data);
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Error parsing API response:', error);
        }
    }

    function logAuthDebug(message, data) {
        if (!DEBUG_AUTH) {
            return;
        }
        if (data && typeof data === 'object') {
            console.log(message, data);
            return;
        }
        console.log(message);
    }
    // Non-persistent storage for projected investments (resets on reload)
    // Key format: "bucketName|goalType" -> projected amount

    // ============================================
    // API Interception via Monkey Patching
    // ============================================
    
    // Store original functions
    const originalFetch = window.fetch;
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

    // Fetch interception
    window.fetch = async function(...args) {
        extractAuthHeaders(args[0], args[1]);
        const response = await originalFetch.apply(this, args);
        const url = args[0];
        void handleInterceptedResponse(url, () => response.clone().json());
        return response;
    };

    // XMLHttpRequest interception
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._url = url;
        this._headers = {};
        return originalXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
        if (this._headers) {
            this._headers[header] = value;
        }
        return originalXHRSetRequestHeader.apply(this, [header, value]);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        const url = this._url;
        extractAuthHeaders(url, { headers: this._headers });
        
        if (url && typeof url === 'string') {
            this.addEventListener('load', function() {
                handleInterceptedResponse(url, () => Promise.resolve(parseJsonSafely(this.responseText)));
            });
        }
        
        return originalXHRSend.apply(this, args);
    };

    logDebug('[Goal Portfolio Viewer] API interception initialized');

    const GoalTargetStore = {
        getTarget(goalId) {
            const key = getGoalTargetKey(goalId);
            const value = Storage.get(key, null, 'Error loading goal target percentage');
            if (value === null) {
                return null;
            }
            const numericValue = parseFloat(value);
            return Number.isFinite(numericValue) ? numericValue : null;
        },
        setTarget(goalId, percentage) {
            const numericPercentage = parseFloat(percentage);
            if (!Number.isFinite(numericPercentage)) {
                return null;
            }
            const validPercentage = Math.max(0, Math.min(100, numericPercentage));
            const key = getGoalTargetKey(goalId);
            const didSet = Storage.set(key, validPercentage, 'Error saving goal target percentage');
            if (!didSet) {
                return null;
            }
            logDebug(`[Goal Portfolio Viewer] Saved goal target percentage for ${goalId}: ${validPercentage}%`);
            return validPercentage;
        },
        clearTarget(goalId) {
            const key = getGoalTargetKey(goalId);
            Storage.remove(key, 'Error deleting goal target percentage');
            logDebug(`[Goal Portfolio Viewer] Deleted goal target percentage for ${goalId}`);
        },
        getFixed(goalId) {
            const key = getGoalFixedKey(goalId);
            return Storage.get(key, false, 'Error loading goal fixed state') === true;
        },
        setFixed(goalId, isFixed) {
            const key = getGoalFixedKey(goalId);
            Storage.set(key, isFixed === true, 'Error saving goal fixed state');
            logDebug(`[Goal Portfolio Viewer] Saved goal fixed state for ${goalId}: ${isFixed === true}`);
        },
        clearFixed(goalId) {
            const key = getGoalFixedKey(goalId);
            Storage.remove(key, 'Error deleting goal fixed state');
            logDebug(`[Goal Portfolio Viewer] Deleted goal fixed state for ${goalId}`);
        }
    };
    testExports.GoalTargetStore = GoalTargetStore;
    
    /**
     * Load previously intercepted API data from Tampermonkey storage
     */
    function loadStoredData(appState) {
        const apiDataState = appState?.apiData;
        if (!apiDataState) {
            return;
        }
        const performance = Storage.readJson(
            STORAGE_KEYS.performance,
            data => data && typeof data === 'object',
            'Error loading performance data'
        );
        if (performance) {
            apiDataState.performance = performance;
            logDebug('[Goal Portfolio Viewer] Loaded performance data from storage');
        }
        const investible = Storage.readJson(
            STORAGE_KEYS.investible,
            data => data && typeof data === 'object',
            'Error loading investible data'
        );
        if (investible) {
            apiDataState.investible = investible;
            logDebug('[Goal Portfolio Viewer] Loaded investible data from storage');
        }
        const summary = Storage.readJson(
            STORAGE_KEYS.summary,
            data => Array.isArray(data),
            'Error loading summary data'
        );
        if (summary) {
            apiDataState.summary = summary;
            logDebug('[Goal Portfolio Viewer] Loaded summary data from storage');
        }
    }

    /**
     * Set projected investment for a specific goal type
     * @param {string} bucket - Bucket name
     * @param {string} goalType - Goal type
     * @param {number} amount - Projected investment amount
     */
    function setProjectedInvestment(projectedInvestmentsState, bucket, goalType, amount) {
        const key = getProjectedInvestmentKey(bucket, goalType);
        const validAmount = parseFloat(amount) || 0;
        projectedInvestmentsState[key] = validAmount;
        logDebug(`[Goal Portfolio Viewer] Set projected investment for ${bucket}|${goalType}: ${validAmount}`);
    }

    /**
     * Clear projected investment for a specific goal type
     * @param {string} bucket - Bucket name
     * @param {string} goalType - Goal type
     */
    function clearProjectedInvestment(projectedInvestmentsState, bucket, goalType) {
        const key = getProjectedInvestmentKey(bucket, goalType);
        delete projectedInvestmentsState[key];
        logDebug(`[Goal Portfolio Viewer] Cleared projected investment for ${bucket}|${goalType}`);
    }


    // ============================================
    // Sync Encryption Module (Cross-Device Sync)
    // ============================================


        // ============================================
    // Performance Data Fetching
    // ============================================

    function getHeaderValue(headers, key) {
        if (!headers) {
            return null;
        }
        if (headers instanceof Headers) {
            return headers.get(key);
        }
        if (typeof headers === 'object') {
            return headers[key] || headers[key.toLowerCase()] || headers[key.toUpperCase()] || null;
        }
        return null;
    }

    function getCookieValue(name) {
        if (typeof document === 'undefined' || !document.cookie) {
            return null;
        }
        const entries = document.cookie.split(';').map(entry => entry.trim());
        const match = entries.find(entry => entry.startsWith(`${name}=`));
        if (!match) {
            return null;
        }
        const value = match.slice(name.length + 1);
        if (!value) {
            return null;
        }
        try {
            return decodeURIComponent(value);
        } catch (_error) {
            // Fallback to raw value if decoding fails due to malformed encoding
            return value;
        }
    }

    function selectAuthCookieToken(cookies) {
        if (!Array.isArray(cookies) || !cookies.length) {
            return null;
        }
        const httpOnlyCookie = cookies.find(cookie => cookie?.httpOnly);
        return (httpOnlyCookie || cookies[0])?.value || null;
    }

    function findCookieValue(cookies, name) {
        if (!Array.isArray(cookies)) {
            return null;
        }
        return cookies.find(cookie => cookie?.name === name)?.value || null;
    }

    function getCookieValueByNames(names) {
        for (const name of names) {
            const value = getCookieValue(name);
            if (value) {
                return { name, value };
            }
        }
        return null;
    }

    function listCookieByQuery(query) {
        return new Promise(resolve => {
            GM_cookie.list(query, cookies => resolve(cookies || []));
        });
    }

    function dumpAvailableCookies() {
        if (state.auth.gmCookieDumped || !DEBUG_AUTH) {
            return;
        }
        state.auth.gmCookieDumped = true;
        listCookieByQuery({})
            .then(cookies => {
                // Debug-only: log a safe summary of available GM_cookie entries
                const summary = cookies.map(cookie => ({
                    domain: cookie.domain,
                    path: cookie.path,
                    name: cookie.name
                }));
                logAuthDebug('[Goal Portfolio Viewer][DEBUG_AUTH] Available GM_cookie entries:', summary);
            })
            .catch(error => {
                console.error('[Goal Portfolio Viewer][DEBUG_AUTH] Failed to list GM_cookie entries:', error);
            });
    }

    function getAuthTokenFromGMCookie() {
        if (state.auth.gmCookieAuthToken) {
            return Promise.resolve(state.auth.gmCookieAuthToken);
        }
        if (typeof GM_cookie === 'undefined' || typeof GM_cookie.list !== 'function') {
            return Promise.resolve(null);
        }
        return new Promise(resolve => {
            dumpAvailableCookies();
            const cookieNames = ['webapp-sg-access-token', 'webapp-sg-accessToken'];
            const queries = [
                { domain: '.endowus.com', path: '/', name: cookieNames[0] },
                { domain: '.endowus.com', path: '/', name: cookieNames[1] },
                { domain: 'app.sg.endowus.com', path: '/', name: cookieNames[0] },
                { domain: 'app.sg.endowus.com', path: '/', name: cookieNames[1] }
            ];
            const tryNext = index => {
                if (index >= queries.length) {
                    resolve(null);
                    return;
                }
                listCookieByQuery(queries[index]).then(cookies => {
                    const token = selectAuthCookieToken(cookies) || findCookieValue(cookies, cookieNames[1]);
                    if (token) {
                        state.auth.gmCookieAuthToken = token;
                        resolve(token);
                        return;
                    }
                    tryNext(index + 1);
                });
            };
            tryNext(0);
        });
    }

    function buildAuthorizationValue(token) {
        if (!token || typeof token !== 'string') {
            return null;
        }
        if (token.toLowerCase().startsWith('bearer ')) {
            return token;
        }
        return `Bearer ${token}`;
    }

    async function getFallbackAuthHeaders() {
        const gmCookieToken = await getAuthTokenFromGMCookie();
        const cookieNames = ['webapp-sg-access-token', 'webapp-sg-accessToken'];
        const cookieValue = getCookieValueByNames(cookieNames);
        const token = gmCookieToken || cookieValue?.value || null;
        const deviceId = getCookieValue('webapp-deviceId');
        // Policy: do not read localStorage for auth-related identifiers.
        const clientId = null;

        return {
            authorization: buildAuthorizationValue(token),
            'client-id': clientId,
            'device-id': deviceId
        };
    }

    function extractAuthHeaders(requestUrl, requestInit) {
        const url = typeof requestUrl === 'string' ? requestUrl : requestUrl?.url;
        if (!url || !url.includes('endowus.com')) {
            if (DEBUG_AUTH && url) {
                logAuthDebug('[Goal Portfolio Viewer][DEBUG_AUTH] Skipping header extraction for non-endowus.com URL:', url);
            }
            return;
        }
        const headers = requestInit?.headers || requestUrl?.headers || null;
        const authorization = getHeaderValue(headers, 'authorization');
        const clientId = getHeaderValue(headers, 'client-id');
        const deviceId = getHeaderValue(headers, 'device-id');

        if (authorization || clientId || deviceId) {
            if (!state.auth.requestHeaders || typeof state.auth.requestHeaders !== 'object') {
                state.auth.requestHeaders = {};
            }
            const nextHeaders = {
                authorization,
                'client-id': clientId,
                'device-id': deviceId
            };
            Object.entries(nextHeaders).forEach(([key, value]) => {
                if (value) {
                    state.auth.requestHeaders[key] = value;
                } else if (DEBUG_AUTH && value === '') {
                    logAuthDebug('[Goal Portfolio Viewer][DEBUG_AUTH] Skipped empty auth header:', { key });
                }
            });
        }
    }

    async function buildPerformanceRequestHeaders() {
        const headers = new Headers();
        const fallbackHeaders = await getFallbackAuthHeaders();
        const mergedHeaders = {
            ...fallbackHeaders
        };
        if (state.auth.requestHeaders) {
            Object.entries(state.auth.requestHeaders).forEach(([key, value]) => {
                if (value) {
                    mergedHeaders[key] = value;
                }
            });
        }
        Object.entries(mergedHeaders).forEach(([key, value]) => {
            if (value) {
                headers.set(key, value);
            }
        });
        return headers;
    }

    function readPerformanceCache(goalId, ignoreFreshness = false) {
        const key = getPerformanceCacheKey(goalId);
        const parsed = Storage.readJson(
            key,
            data => {
                const fetchedAt = data?.fetchedAt;
                const response = data?.response;
                return typeof fetchedAt === 'number' && fetchedAt > 0 && response && typeof response === 'object';
            },
            'Error reading performance cache'
        );
        if (!parsed) {
            return null;
        }
        const shouldEnforceFreshness = !ignoreFreshness;
        if (shouldEnforceFreshness && !isCacheFresh(parsed.fetchedAt, PERFORMANCE_CACHE_MAX_AGE_MS)) {
            Storage.remove(key, 'Error deleting stale performance cache');
            return null;
        }
        return parsed;
    }
    testExports.readPerformanceCache = readPerformanceCache;

    function writePerformanceCache(goalId, responseData) {
        const key = getPerformanceCacheKey(goalId);
        const payload = {
            fetchedAt: Date.now(),
            response: responseData
        };
        Storage.writeJson(key, payload, 'Error writing performance cache');
    }
    testExports.writePerformanceCache = writePerformanceCache;

    function getCachedPerformanceResponse(goalId, ignoreFreshness = false) {
        const cached = readPerformanceCache(goalId, ignoreFreshness);
        if (!cached) {
            return null;
        }
        return cached.response ? normalizePerformanceResponse(cached.response) : null;
    }
    testExports.getCachedPerformanceResponse = getCachedPerformanceResponse;

    async function fetchPerformanceForGoal(goalId) {
        const url = `${PERFORMANCE_ENDPOINT}?displayCcy=SGD&goalId=${encodeURIComponent(goalId)}`;
        const headers = await buildPerformanceRequestHeaders();
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        let timeoutId = null;
        if (controller) {
            timeoutId = setTimeout(() => controller.abort(), PERFORMANCE_REQUEST_TIMEOUT_MS);
        }

        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers,
            signal: controller ? controller.signal : undefined
        }).finally(() => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        });
        const cloned = response.clone();
        if (!response.ok) {
            throw new Error(`Performance request failed: ${response.status}`);
        }
        return cloned.json();
    }
    testExports.fetchPerformanceForGoal = fetchPerformanceForGoal;

    async function ensurePerformanceData(goalIds) {
        const results = {};
        const idsToFetch = [];

        goalIds.forEach(goalId => {
            if (!goalId) {
                return;
            }
            if (state.performance.goalData[goalId]) {
                results[goalId] = state.performance.goalData[goalId];
                return;
            }
            const cached = getCachedPerformanceResponse(goalId);
            if (cached) {
                state.performance.goalData[goalId] = cached;
                results[goalId] = cached;
            } else {
                idsToFetch.push(goalId);
            }
        });

        if (!idsToFetch.length) {
            return results;
        }

        const queueResults = await state.performance.requestQueue(idsToFetch, async goalId => {
            try {
                const data = await fetchPerformanceForGoal(goalId);
                const normalized = normalizePerformanceResponse(data);
                writePerformanceCache(goalId, normalized);
                state.performance.goalData[goalId] = normalized;
                return normalized;
            } catch (error) {
                console.warn('[Goal Portfolio Viewer] Performance fetch failed:', error);
                return null;
            }
        });

        queueResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                results[result.item] = result.value;
            }
        });

        return results;
    }
    testExports.ensurePerformanceData = ensurePerformanceData;

    function buildGoalTypePerformanceSummary(performanceResponses) {
        // Guard against empty/null input - Staff Engineer requirement
        if (!Array.isArray(performanceResponses) || performanceResponses.length === 0) {
            return null;
        }
        // Filter nulls defensively (should already be filtered, but double-check)
        const responses = performanceResponses
            .filter(r => r && typeof r === 'object')
            .map(normalizePerformanceResponse);
        
        if (!responses.length) {
            return null;
        }
        const normalizedSeriesCollection = responses.map(response =>
            normalizeTimeSeriesData(response?.timeSeries?.data || [])
        );
        const mergedSeries = mergeTimeSeriesByDate(normalizedSeriesCollection, true);
        const normalizedMergedSeries = normalizeTimeSeriesData(mergedSeries);
        const primaryPerformanceDates = responses[0]?.performanceDates;
        const windowStart = getWindowStartDate(
            PERFORMANCE_CHART_WINDOW,
            normalizedMergedSeries,
            primaryPerformanceDates,
            true
        );
        const windowSeries = getTimeSeriesWindow(normalizedMergedSeries, windowStart, true);
        const windowReturns = responses.length === 1
            ? derivePerformanceWindows(
                responses[0]?.returnsTable,
                primaryPerformanceDates,
                responses[0]?.timeSeries?.data || []
            )
            : calculateWeightedWindowReturns(responses);

        const metrics = summarizePerformanceMetrics(responses, normalizedMergedSeries);

        return {
            mergedSeries,
            windowSeries,
            windowReturns,
            metrics
        };
    }
    testExports.buildGoalTypePerformanceSummary = buildGoalTypePerformanceSummary;

    function getLatestPerformanceCacheTimestamp(goalIds) {
        if (!Array.isArray(goalIds)) {
            return null;
        }
        let latestFetchedAt = null;
        goalIds.forEach(goalId => {
            const cached = readPerformanceCache(goalId);
            const fetchedAt = cached?.fetchedAt;
            if (typeof fetchedAt === 'number' && Number.isFinite(fetchedAt)) {
                if (latestFetchedAt === null || fetchedAt > latestFetchedAt) {
                    latestFetchedAt = fetchedAt;
                }
            }
        });
        return latestFetchedAt;
    }
    testExports.getLatestPerformanceCacheTimestamp = getLatestPerformanceCacheTimestamp;

    function clearPerformanceCache(goalIds) {
        if (!Array.isArray(goalIds)) {
            return;
        }
        goalIds.forEach(goalId => {
            if (!goalId) {
                return;
            }
            const key = getPerformanceCacheKey(goalId);
            Storage.remove(key, 'Error deleting performance cache');
            delete state.performance.goalData[goalId];
        });
    }
    testExports.clearPerformanceCache = clearPerformanceCache;

    // ============================================
    // UI
    // ============================================

    const PERFORMANCE_CHART_DEFAULT_WIDTH = 400;
    const PERFORMANCE_CHART_DEFAULT_HEIGHT = 110;
    const PERFORMANCE_CHART_MIN_WIDTH = 240;
    const PERFORMANCE_CHART_MIN_HEIGHT = 90;
    const PERFORMANCE_CHART_MAX_HEIGHT = 180;
    const PERFORMANCE_CHART_LEFT_PADDING = 100;
    const PERFORMANCE_CHART_RIGHT_PADDING = 50;
    // Aspect ratio tuned for typical container widths (≈240–800px) to keep charts readable
    // while staying within PERFORMANCE_CHART_MIN_HEIGHT and PERFORMANCE_CHART_MAX_HEIGHT.
    const PERFORMANCE_CHART_ASPECT_RATIO = 0.28;
    // Debounce timeout for chart resize operations. Balance between responsiveness
    // and reducing re-renders during continuous resize events.
    const CHART_RESIZE_DEBOUNCE_MS = 140;

    function getChartHeightForWidth(width) {
        const safeWidth = Math.max(PERFORMANCE_CHART_MIN_WIDTH, Number(width) || PERFORMANCE_CHART_DEFAULT_WIDTH);
        const targetHeight = Math.round(safeWidth * PERFORMANCE_CHART_ASPECT_RATIO);
        return Math.min(
            PERFORMANCE_CHART_MAX_HEIGHT,
            Math.max(PERFORMANCE_CHART_MIN_HEIGHT, targetHeight || PERFORMANCE_CHART_DEFAULT_HEIGHT)
        );
    }
    testExports.getChartHeightForWidth = getChartHeightForWidth;

    function getChartPadding(chartWidth, chartHeight) {
        const base = Math.min(chartWidth, chartHeight);
        return Math.min(22, Math.max(12, Math.round(base * 0.18)));
    }

    function getChartDimensions(container) {
        if (!container || typeof container.getBoundingClientRect !== 'function') {
            return {
                width: PERFORMANCE_CHART_DEFAULT_WIDTH,
                height: PERFORMANCE_CHART_DEFAULT_HEIGHT
            };
        }
        const rect = container.getBoundingClientRect();
        const width = Math.max(PERFORMANCE_CHART_MIN_WIDTH, Math.round(rect.width));
        const baseHeight = rect.height ? Math.round(rect.height) : getChartHeightForWidth(width);
        const height = Math.max(PERFORMANCE_CHART_MIN_HEIGHT, baseHeight);
        return {
            width: width || PERFORMANCE_CHART_DEFAULT_WIDTH,
            height: height || PERFORMANCE_CHART_DEFAULT_HEIGHT
        };
    }
    testExports.getChartDimensions = getChartDimensions;

    function renderPerformanceChart(chartWrapper, series, dimensionsOverride) {
        if (!chartWrapper) {
            return;
        }
        const dimensions = dimensionsOverride || getChartDimensions(chartWrapper);
        const svg = createLineChartSvg(series, dimensions.width, dimensions.height);
        chartWrapper.innerHTML = '';
        chartWrapper.appendChild(svg);
    }
    testExports.renderPerformanceChart = renderPerformanceChart;

    function initializePerformanceChart(chartWrapper, series) {
        if (typeof ResizeObserver === 'undefined' || !chartWrapper) {
            renderPerformanceChart(chartWrapper, series);
            return null;
        }

        let resizeTimer = null;
        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (!entry) {
                return;
            }
            const { width, height } = entry.contentRect;
            if (!width || !height) {
                return;
            }
            const targetHeight = getChartHeightForWidth(width);
            if (Math.round(height) !== targetHeight) {
                chartWrapper.style.height = `${targetHeight}px`;
            }
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (!chartWrapper.isConnected) {
                    observer.disconnect();
                    return;
                }
                renderPerformanceChart(chartWrapper, series, {
                    width: Math.max(PERFORMANCE_CHART_MIN_WIDTH, Math.round(width)),
                    height: Math.max(PERFORMANCE_CHART_MIN_HEIGHT, Math.round(targetHeight))
                });
            }, CHART_RESIZE_DEBOUNCE_MS);
        });

        observer.observe(chartWrapper);

        return () => {
            clearTimeout(resizeTimer);
            observer.disconnect();
        };
    }

    function getChartLayout(chartWidth, chartHeight) {
        const widthValue = Math.max(PERFORMANCE_CHART_MIN_WIDTH, Number(chartWidth) || PERFORMANCE_CHART_DEFAULT_WIDTH);
        const heightValue = Math.max(PERFORMANCE_CHART_MIN_HEIGHT, Number(chartHeight) || PERFORMANCE_CHART_DEFAULT_HEIGHT);
        const padding = getChartPadding(widthValue, heightValue);
        const plotWidth = Math.max(
            1,
            widthValue - PERFORMANCE_CHART_LEFT_PADDING - PERFORMANCE_CHART_RIGHT_PADDING - padding * 2
        );
        const plotHeight = Math.max(1, heightValue - padding * 2);
        return {
            widthValue,
            heightValue,
            padding,
            plotWidth,
            plotHeight,
            leftPadding: PERFORMANCE_CHART_LEFT_PADDING,
            rightPadding: PERFORMANCE_CHART_RIGHT_PADDING
        };
    }

    function getChartSeriesStats(series) {
        const amounts = series.map(point => Number(point.amount)).filter(val => Number.isFinite(val));
        if (amounts.length < 2) {
            return null;
        }
        const minValue = Math.min(...amounts);
        const maxValue = Math.max(...amounts);
        return {
            amounts,
            minValue,
            maxValue,
            range: maxValue - minValue || 1
        };
    }

    function getChartPoint(series, index, layout, minValue, range) {
        const x = layout.leftPadding + layout.padding + (index / (series.length - 1)) * layout.plotWidth;
        const y = layout.padding + layout.plotHeight - ((series[index].amount - minValue) / range) * layout.plotHeight;
        return { x, y };
    }

    function formatChartDateLabel(dateString) {
        const date = new Date(dateString);
        if (!Number.isFinite(date.getTime())) {
            return dateString;
        }
        return date.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' });
    }

    function appendChartXAxisLabels(axisGroup, series, layout) {
        const xLabels = [
            { value: series[0].date, anchor: 'start', x: layout.leftPadding + layout.padding },
            {
                value: series[series.length - 1].date,
                anchor: 'end',
                x: layout.leftPadding + layout.padding + layout.plotWidth
            }
        ];

        xLabels.forEach(labelInfo => {
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', `${labelInfo.x}`);
            const labelY = Math.min(layout.heightValue - 6, layout.padding + layout.plotHeight + 12);
            label.setAttribute('y', `${labelY}`);
            label.setAttribute('text-anchor', labelInfo.anchor);
            label.setAttribute('class', 'gpv-performance-chart-label');
            label.textContent = formatChartDateLabel(labelInfo.value);
            axisGroup.appendChild(label);
        });
    }

    function buildChartAxisGroup(layout, minValue, maxValue, range, series) {
        const axisGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        axisGroup.setAttribute('class', 'gpv-performance-chart-axis');

        const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        xAxis.setAttribute('x1', `${layout.leftPadding + layout.padding}`);
        xAxis.setAttribute('x2', `${layout.leftPadding + layout.padding + layout.plotWidth}`);
        xAxis.setAttribute('y1', `${layout.padding + layout.plotHeight}`);
        xAxis.setAttribute('y2', `${layout.padding + layout.plotHeight}`);
        axisGroup.appendChild(xAxis);

        const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        yAxis.setAttribute('x1', `${layout.leftPadding + layout.padding}`);
        yAxis.setAttribute('x2', `${layout.leftPadding + layout.padding}`);
        yAxis.setAttribute('y1', `${layout.padding}`);
        yAxis.setAttribute('y2', `${layout.padding + layout.plotHeight}`);
        axisGroup.appendChild(yAxis);

        const tickValues = [maxValue, (maxValue + minValue) / 2, minValue];
        tickValues.forEach((value, index) => {
            const y = layout.padding + layout.plotHeight - ((value - minValue) / range) * layout.plotHeight;
            const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tick.setAttribute('x1', `${layout.leftPadding + layout.padding - 3}`);
            tick.setAttribute('x2', `${layout.leftPadding + layout.padding}`);
            tick.setAttribute('y1', `${y}`);
            tick.setAttribute('y2', `${y}`);
            tick.setAttribute('class', 'gpv-performance-chart-tick');
            axisGroup.appendChild(tick);

            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', `${layout.leftPadding + layout.padding - 6}`);
            label.setAttribute('y', `${y + 3}`);
            label.setAttribute('text-anchor', 'end');
            label.setAttribute('class', 'gpv-performance-chart-label');
            label.textContent = formatMoney(value);
            axisGroup.appendChild(label);

            if (index === 1) {
                const grid = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                grid.setAttribute('x1', `${layout.leftPadding + layout.padding}`);
                grid.setAttribute('x2', `${layout.leftPadding + layout.padding + layout.plotWidth}`);
                grid.setAttribute('y1', `${y}`);
                grid.setAttribute('y2', `${y}`);
                grid.setAttribute('class', 'gpv-performance-chart-grid');
                axisGroup.appendChild(grid);
            }
        });

        appendChartXAxisLabels(axisGroup, series, layout);

        return axisGroup;
    }

    function buildChartPath(series, layout, minValue, range) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const trendPositive = series[series.length - 1].amount >= series[0].amount;
        const strokeColor = trendPositive ? '#10b981' : '#ef4444';

        const points = series.map((point, index) => {
            const coords = getChartPoint(series, index, layout, minValue, range);
            return `${index === 0 ? 'M' : 'L'} ${coords.x.toFixed(2)} ${coords.y.toFixed(2)}`;
        });

        path.setAttribute('d', points.join(' '));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', strokeColor);
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        return path;
    }

    function buildChartPointGroup(series, layout, minValue, range) {
        const highlightIndices = [0, Math.floor(series.length / 2), series.length - 1];
        const pointGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        pointGroup.setAttribute('class', 'gpv-performance-chart-points');
        highlightIndices.forEach(index => {
            const point = series[index];
            if (!point) {
                return;
            }
            const coords = getChartPoint(series, index, layout, minValue, range);
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', `${coords.x}`);
            circle.setAttribute('cy', `${coords.y}`);
            circle.setAttribute('r', '2.5');
            circle.setAttribute('class', 'gpv-performance-chart-point');
            pointGroup.appendChild(circle);
        });
        return pointGroup;
    }

    function buildChartAxisTitles(layout) {
        const axisTitleX = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        axisTitleX.setAttribute('x', `${layout.leftPadding + layout.padding + layout.plotWidth / 2}`);
        axisTitleX.setAttribute('y', `${Math.min(layout.heightValue - 2, layout.padding + layout.plotHeight + 20)}`);
        axisTitleX.setAttribute('text-anchor', 'middle');
        axisTitleX.setAttribute('class', 'gpv-performance-chart-title');
        axisTitleX.textContent = 'Date';

        const axisTitleY = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        axisTitleY.setAttribute('x', `${Math.max(layout.leftPadding + 4, layout.leftPadding + layout.padding - 10)}`);
        axisTitleY.setAttribute('y', `${Math.max(12, layout.padding - 6)}`);
        axisTitleY.setAttribute('text-anchor', 'start');
        axisTitleY.setAttribute('class', 'gpv-performance-chart-title');
        axisTitleY.textContent = 'Value (SGD)';

        return { axisTitleX, axisTitleY };
    }

    function createLineChartSvg(series, chartWidth, chartHeight) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const layout = getChartLayout(chartWidth, chartHeight);
        const totalHorizontalPadding = layout.leftPadding + layout.rightPadding;
        svg.setAttribute('viewBox', `0 0 ${layout.widthValue} ${layout.heightValue}`);
        svg.setAttribute('class', 'gpv-performance-chart');

        if (!Array.isArray(series) || series.length < 2) {
            const emptyText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            // Position at center of viewBox (accounting for left and right padding)
            emptyText.setAttribute('x', `${layout.leftPadding + (layout.widthValue - totalHorizontalPadding) / 2}`);
            emptyText.setAttribute('y', `${layout.heightValue / 2}`);
            emptyText.setAttribute('text-anchor', 'middle');
            emptyText.setAttribute('class', 'gpv-performance-chart-empty');
            emptyText.textContent = 'No chart data';
            svg.appendChild(emptyText);
            return svg;
        }

        const stats = getChartSeriesStats(series);
        if (!stats) {
            return svg;
        }

        const axisGroup = buildChartAxisGroup(layout, stats.minValue, stats.maxValue, stats.range, series);
        const path = buildChartPath(series, layout, stats.minValue, stats.range);
        const pointGroup = buildChartPointGroup(series, layout, stats.minValue, stats.range);
        const axisTitles = buildChartAxisTitles(layout);

        svg.appendChild(axisGroup);
        svg.appendChild(axisTitles.axisTitleX);
        svg.appendChild(axisTitles.axisTitleY);
        svg.appendChild(path);
        svg.appendChild(pointGroup);
        return svg;
    }
    testExports.createLineChartSvg = createLineChartSvg;

    function buildPerformanceWindowGrid(windowReturns) {
        const grid = createElement('div', 'gpv-performance-window-grid');

        const items = [
            { label: '1M', value: windowReturns?.oneMonth },
            { label: '6M', value: windowReturns?.sixMonth },
            { label: 'YTD', value: windowReturns?.ytd },
            { label: '1Y', value: windowReturns?.oneYear },
            { label: '3Y', value: windowReturns?.threeYear }
        ];

        items.forEach(item => {
            const tile = createElement('div', 'gpv-performance-window-tile');
            const label = createElement('div', 'gpv-performance-window-label', item.label);
            const value = createElement(
                'div',
                'gpv-performance-window-value',
                formatPercent(item.value, { multiplier: 100, showSign: true })
            );
            if (typeof item.value === 'number') {
                value.classList.add(item.value >= 0 ? 'positive' : 'negative');
            }

            tile.appendChild(label);
            tile.appendChild(value);
            grid.appendChild(tile);
        });

        return grid;
    }
    testExports.buildPerformanceWindowGrid = buildPerformanceWindowGrid;

    function buildPerformanceMetricsTable(metrics) {
        const table = createElement('table', 'gpv-performance-metrics-table');
        const tbody = createElement('tbody');
        const rows = buildPerformanceMetricsRows(metrics);

        rows.forEach(row => {
            const tr = createElement('tr');
            const labelCell = createElement('td', 'gpv-performance-metric-label');
            const labelText = createElement('span', 'gpv-performance-metric-label-text', row.label);
            labelCell.appendChild(labelText);
            if (row.info) {
                const info = createElement('span', 'gpv-performance-metric-info', '?');
                info.setAttribute('aria-label', row.info);
                info.setAttribute('data-tooltip', row.info);
                labelCell.appendChild(info);
            }
            const valueCell = createElement('td', 'gpv-performance-metric-value', row.value);

            tr.appendChild(labelCell);
            tr.appendChild(valueCell);
            tbody.appendChild(tr);

        });

        table.appendChild(tbody);
        return table;
    }

    function renderGoalTypePerformance(typeSection, goalIds, cleanupCallbacks) {
        const performanceContainer = createElement('div', 'gpv-performance-container');
        const loading = createElement('div', 'gpv-performance-loading', 'Loading performance data...');
        performanceContainer.appendChild(loading);

        typeSection.appendChild(performanceContainer);

        const refreshFootnote = createElement(
            'div',
            'gpv-performance-cache-note',
            'Performance data is cached for 7 days. You can refresh it once every 24 hours.'
        );
        const refreshButton = createElement('button', 'gpv-performance-refresh-btn');
        refreshButton.type = 'button';

        function setRefreshButtonState(latestFetchedAt) {
            const canRefresh = isCacheRefreshAllowed(
                latestFetchedAt,
                PERFORMANCE_CACHE_REFRESH_MIN_AGE_MS
            );
            refreshButton.disabled = !canRefresh;
            refreshButton.textContent = canRefresh ? 'Clear cache & refresh' : 'Refresh available after 24 hours';
            refreshButton.title = canRefresh
                ? 'Clear cached performance data and fetch the latest values.'
                : 'Performance data can be refreshed once every 24 hours.';
        }

        function renderPerformanceSummary(summary) {
            const windowGrid = buildPerformanceWindowGrid(summary.windowReturns);
            const chartWrapper = createElement('div', 'gpv-performance-chart-wrapper');
            const metricsTable = buildPerformanceMetricsTable(summary.metrics);

            const detailRow = createElement('div', 'gpv-performance-detail-row');
            detailRow.appendChild(chartWrapper);
            detailRow.appendChild(metricsTable);

            performanceContainer.appendChild(windowGrid);
            performanceContainer.appendChild(detailRow);

            const footerRow = createElement('div', 'gpv-performance-footer-row');
            footerRow.appendChild(refreshFootnote);
            footerRow.appendChild(refreshButton);
            performanceContainer.appendChild(footerRow);

            requestAnimationFrame(() => {
                if (!chartWrapper.isConnected) {
                    return;
                }
                const initialWidth = chartWrapper.getBoundingClientRect().width;
                chartWrapper.style.height = `${getChartHeightForWidth(initialWidth)}px`;
                const cleanup = initializePerformanceChart(chartWrapper, summary.windowSeries);
                if (typeof cleanup === 'function' && Array.isArray(cleanupCallbacks)) {
                    cleanupCallbacks.push(cleanup);
                }
            });
        }

        function loadPerformanceData() {
            ensurePerformanceData(goalIds).then(performanceMap => {
                if (!performanceContainer.isConnected) {
                    return;
                }
                const responses = goalIds
                    .map(goalId => performanceMap[goalId])
                    .filter(Boolean);
                const summary = buildGoalTypePerformanceSummary(responses);

                performanceContainer.innerHTML = '';
                if (!summary) {
                    const emptyState = createElement('div', 'gpv-performance-loading', 'Performance data unavailable.');
                    performanceContainer.appendChild(emptyState);
                    return;
                }

                renderPerformanceSummary(summary);
                const latestFetchedAt = getLatestPerformanceCacheTimestamp(goalIds);
                setRefreshButtonState(latestFetchedAt);
            });
        }

        refreshButton.addEventListener('click', () => {
            const latestFetchedAt = getLatestPerformanceCacheTimestamp(goalIds);
            if (!isCacheRefreshAllowed(latestFetchedAt, PERFORMANCE_CACHE_REFRESH_MIN_AGE_MS)) {
                setRefreshButtonState(latestFetchedAt);
                return;
            }
            refreshButton.disabled = true;
            refreshButton.textContent = 'Refreshing...';
            clearPerformanceCache(goalIds);
            performanceContainer.innerHTML = '';
            performanceContainer.appendChild(loading);
            loadPerformanceData();
        });

        loadPerformanceData();
    }
    
    function createElement(tagName, className, textContent) {
        const element = document.createElement(tagName);
        if (className) {
            element.className = className;
        }
        if (textContent !== undefined && textContent !== null) {
            element.textContent = textContent;
        }
        return element;
    }

    function appendTextSpan(container, className, textContent) {
        const span = createElement('span', className, textContent);
        container.appendChild(span);
        return span;
    }

    function appendLabeledValue(container, wrapperClass, labelText, valueText, options = {}) {
        const wrapper = createElement('span', wrapperClass);
        const labelClass = options.labelClass || null;
        const valueClass = options.valueClass || null;
        const separator = options.separator ?? ' ';
        appendTextSpan(wrapper, labelClass, labelText);
        if (separator) {
            wrapper.appendChild(document.createTextNode(separator));
        }
        appendTextSpan(wrapper, valueClass, valueText);
        container.appendChild(wrapper);
        return wrapper;
    }

    function createStatItem(label, value, valueClass) {
        const item = createElement('div', 'gpv-stat-item');
        appendTextSpan(item, 'gpv-stat-label', label);
        const valueClassName = valueClass ? `gpv-stat-value ${valueClass}` : 'gpv-stat-value';
        appendTextSpan(item, valueClassName, value);
        return item;
    }

    function buildBucketStatsFragment({
        endingBalanceDisplay,
        returnDisplay,
        returnClass,
        growthDisplay,
        returnLabel
    }) {
        const fragment = document.createDocumentFragment();
        fragment.appendChild(createStatItem('Balance', endingBalanceDisplay));
        fragment.appendChild(createStatItem(returnLabel, returnDisplay, returnClass));
        fragment.appendChild(createStatItem('Growth', growthDisplay, returnClass));
        return fragment;
    }

    function renderSummaryView(contentDiv, summaryViewModel, onBucketSelect) {
        contentDiv.innerHTML = '';

        const summaryContainer = createElement('div', 'gpv-summary-container');

        summaryViewModel.buckets.forEach(bucketModel => {
            const bucketCard = createElement('div', 'gpv-bucket-card');
            bucketCard.dataset.bucket = bucketModel.bucketName;
            bucketCard.setAttribute('role', 'button');
            bucketCard.setAttribute('tabindex', '0');
            if (typeof onBucketSelect === 'function') {
                bucketCard.addEventListener('click', () => onBucketSelect(bucketModel.bucketName));
                bucketCard.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onBucketSelect(bucketModel.bucketName);
                    }
                });
            }

            const bucketHeader = createElement('div', 'gpv-bucket-header');
            const bucketTitle = createElement('h2', 'gpv-bucket-title', bucketModel.bucketName);
            const bucketStats = createElement('div', 'gpv-stats gpv-bucket-stats');
            bucketStats.appendChild(buildBucketStatsFragment({
                endingBalanceDisplay: bucketModel.endingBalanceDisplay,
                returnDisplay: bucketModel.returnDisplay,
                returnClass: bucketModel.returnClass,
                growthDisplay: bucketModel.growthDisplay,
                returnLabel: 'Return'
            }));
            
            bucketHeader.appendChild(bucketTitle);
            bucketHeader.appendChild(bucketStats);
            bucketCard.appendChild(bucketHeader);

            bucketModel.goalTypes.forEach(goalTypeModel => {
                const typeRow = createElement('div', 'gpv-goal-type-row');
                appendTextSpan(typeRow, 'gpv-goal-type-name', goalTypeModel.displayName);
                appendLabeledValue(
                    typeRow,
                    'gpv-goal-type-stat',
                    'Balance:',
                    goalTypeModel.endingBalanceDisplay
                );
                appendLabeledValue(
                    typeRow,
                    'gpv-goal-type-stat',
                    'Return:',
                    goalTypeModel.returnDisplay
                );
                appendLabeledValue(
                    typeRow,
                    'gpv-goal-type-stat',
                    'Growth:',
                    goalTypeModel.growthDisplay
                );
                bucketCard.appendChild(typeRow);
            });

            summaryContainer.appendChild(bucketCard);
        });

        contentDiv.appendChild(summaryContainer);
    }
    testExports.renderSummaryView = renderSummaryView;

    function renderBucketView({
        contentDiv,
        bucketViewModel,
        mergedInvestmentDataState,
        projectedInvestmentsState,
        cleanupCallbacks
    }) {
        contentDiv.innerHTML = '';
        if (!bucketViewModel) {
            return;
        }

        const bucketHeader = createElement('div', 'gpv-detail-header');
        const bucketTitle = createElement('h2', 'gpv-detail-title', bucketViewModel.bucketName);
        const bucketStats = createElement('div', 'gpv-stats gpv-detail-stats');
        bucketStats.appendChild(buildBucketStatsFragment({
            endingBalanceDisplay: bucketViewModel.endingBalanceDisplay,
            returnDisplay: bucketViewModel.returnDisplay,
            returnClass: bucketViewModel.returnClass,
            growthDisplay: bucketViewModel.growthDisplay,
            returnLabel: 'Return'
        }));
        
        bucketHeader.appendChild(bucketTitle);
        bucketHeader.appendChild(bucketStats);
        contentDiv.appendChild(bucketHeader);

        bucketViewModel.goalTypes.forEach(goalTypeModel => {
            const typeGrowth = goalTypeModel.growthDisplay;
            
            const typeSection = createElement('div', 'gpv-type-section');
            typeSection.dataset.bucket = bucketViewModel.bucketName;
            typeSection.dataset.goalType = goalTypeModel.goalType;
            
            const typeHeader = createElement('div', 'gpv-type-header');
            
            // Get current projected investment for this goal type
            const currentProjectedInvestment = goalTypeModel.projectedAmount;
            
            const typeTitle = createElement('h3', null, goalTypeModel.displayName);
            const typeSummary = createElement('div', 'gpv-type-summary');
            appendLabeledValue(typeSummary, null, 'Balance:', goalTypeModel.endingBalanceDisplay);
            appendLabeledValue(typeSummary, null, 'Return:', goalTypeModel.returnDisplay);
            appendLabeledValue(typeSummary, null, 'Growth:', typeGrowth);
            typeHeader.appendChild(typeTitle);
            typeHeader.appendChild(typeSummary);
            
            typeSection.appendChild(typeHeader);

            renderGoalTypePerformance(
                typeSection,
                goalTypeModel.goals.map(goal => goal.goalId).filter(Boolean),
                cleanupCallbacks
            );

            // Add projected investment input section as sibling after performance container
            const projectedInputContainer = createElement('div', 'gpv-projected-input-container');
            const projectedLabel = createElement('label', 'gpv-projected-label');
            appendTextSpan(projectedLabel, 'gpv-projected-icon', '💡');
            appendTextSpan(projectedLabel, null, 'Add Projected Investment (simulation only):');

            const projectedInput = createElement('input', CLASS_NAMES.projectedInput);
            projectedInput.type = 'number';
            projectedInput.step = '100';
            projectedInput.value = currentProjectedInvestment > 0 ? String(currentProjectedInvestment) : '';
            projectedInput.placeholder = 'Enter amount';
            projectedInput.dataset.bucket = bucketViewModel.bucketName;
            projectedInput.dataset.goalType = goalTypeModel.goalType;

            projectedInputContainer.appendChild(projectedLabel);
            projectedInputContainer.appendChild(projectedInput);
            
            typeSection.appendChild(projectedInputContainer);
            
            // Add event listener for projected investment input
            projectedInput.addEventListener('input', function() {
                EventHandlers.handleProjectedInvestmentChange({
                    input: this,
                    bucket: bucketViewModel.bucketName,
                    goalType: goalTypeModel.goalType,
                    typeSection,
                    mergedInvestmentDataState,
                    projectedInvestmentsState
                });
            });

            const table = createElement('table', `gpv-table ${CLASS_NAMES.goalTable}`);
            const thead = createElement('thead');
            const headerRow = createElement('tr');

            headerRow.appendChild(createElement('th', 'gpv-goal-name-header', 'Goal Name'));
            headerRow.appendChild(createElement('th', null, 'Balance'));
            headerRow.appendChild(createElement('th', null, '% of Goal Type'));
            headerRow.appendChild(createElement('th', 'gpv-fixed-header', 'Fixed'));

            const targetHeader = createElement('th', 'gpv-target-header');
            targetHeader.appendChild(createElement('div', null, 'Target %'));
            const remainingTargetClass = goalTypeModel.remainingTargetIsHigh
                ? `${CLASS_NAMES.remainingTarget} ${CLASS_NAMES.remainingAlert}`
                : CLASS_NAMES.remainingTarget;
            const remainingTarget = createElement('div', remainingTargetClass);
            appendTextSpan(remainingTarget, 'gpv-remaining-label', 'Remaining:');
            remainingTarget.appendChild(document.createTextNode(' '));
            appendTextSpan(remainingTarget, 'gpv-remaining-value', goalTypeModel.remainingTargetDisplay);
            targetHeader.appendChild(remainingTarget);
            headerRow.appendChild(targetHeader);

            headerRow.appendChild(createElement('th', null, 'Diff'));
            headerRow.appendChild(createElement('th', null, 'Cumulative Return'));
            headerRow.appendChild(createElement('th', null, 'Return %'));

            thead.appendChild(headerRow);
            table.appendChild(thead);

            const tbody = createElement('tbody');

            const goalModelsById = goalTypeModel.goalModelsById || {};

            goalTypeModel.goals.forEach(goalModel => {
                const tr = createElement('tr');
                tr.appendChild(createElement('td', 'gpv-goal-name', goalModel.goalName));
                tr.appendChild(createElement('td', null, goalModel.endingBalanceDisplay));
                tr.appendChild(createElement('td', null, goalModel.percentOfTypeDisplay));

                const fixedCell = createElement('td', 'gpv-fixed-cell');
                const fixedLabel = createElement('label', 'gpv-fixed-toggle');
                const fixedInput = createElement('input', CLASS_NAMES.fixedToggleInput);
                fixedInput.type = 'checkbox';
                fixedInput.dataset.goalId = goalModel.goalId;
                fixedInput.checked = goalModel.isFixed === true;
                fixedLabel.appendChild(fixedInput);
                fixedLabel.appendChild(createElement('span', 'gpv-toggle-slider'));
                fixedCell.appendChild(fixedLabel);
                tr.appendChild(fixedCell);

                const targetCell = createElement('td', 'gpv-target-cell');
                const targetInput = createElement('input', CLASS_NAMES.targetInput);
                targetInput.type = 'number';
                targetInput.min = '0';
                targetInput.max = '100';
                targetInput.step = '0.01';
                targetInput.value = goalModel.targetDisplay ?? '';
                targetInput.placeholder = 'Set target';
                targetInput.dataset.goalId = goalModel.goalId;
                targetInput.dataset.fixed = goalModel.isFixed ? 'true' : 'false';
                targetInput.disabled = goalModel.isFixed === true;
                targetCell.appendChild(targetInput);
                tr.appendChild(targetCell);

                const diffClassName = goalModel.diffClass
                    ? `${CLASS_NAMES.diffCell} ${goalModel.diffClass}`
                    : CLASS_NAMES.diffCell;
                tr.appendChild(createElement('td', diffClassName, goalModel.diffDisplay));
                tr.appendChild(createElement('td', goalModel.returnClass || null, goalModel.returnDisplay));
                tr.appendChild(createElement('td', goalModel.returnClass || null, goalModel.returnPercentDisplay));

                tbody.appendChild(tr);
            });
            
            table.appendChild(tbody);
            typeSection.appendChild(table);

            typeSection.addEventListener('input', event => {
                const resolved = resolveGoalTypeActionTarget(event.target);
                if (!resolved || resolved.type !== 'target') {
                    return;
                }
                const goalId = resolved.element.dataset.goalId;
                const goalModel = goalModelsById[goalId];
                if (!goalModel) {
                    return;
                }
                EventHandlers.handleGoalTargetChange({
                    input: resolved.element,
                    goalId: goalModel.goalId,
                    currentEndingBalance: goalModel.endingBalanceAmount,
                    totalTypeEndingBalance: goalTypeModel.endingBalanceAmount,
                    bucket: bucketViewModel.bucketName,
                    goalType: goalTypeModel.goalType,
                    typeSection,
                    mergedInvestmentDataState,
                    projectedInvestmentsState
                });
            });

            typeSection.addEventListener('change', event => {
                const resolved = resolveGoalTypeActionTarget(event.target);
                if (!resolved || resolved.type !== 'fixed') {
                    return;
                }
                const goalId = resolved.element.dataset.goalId;
                if (!goalModelsById[goalId]) {
                    return;
                }
                EventHandlers.handleGoalFixedToggle({
                    input: resolved.element,
                    goalId,
                    bucket: bucketViewModel.bucketName,
                    goalType: goalTypeModel.goalType,
                    typeSection,
                    mergedInvestmentDataState,
                    projectedInvestmentsState
                });
            });
            contentDiv.appendChild(typeSection);
        });
    }

    function buildGoalTypeAllocationSnapshot({
        bucket,
        goalType,
        mergedInvestmentDataState,
        projectedInvestmentsState
    }) {
        const bucketObj = mergedInvestmentDataState[bucket];
        const group = bucketObj?.[goalType];
        if (!group) {
            return null;
        }
        const goals = Array.isArray(group.goals) ? group.goals : [];
        const goalIds = goals.map(goal => goal.goalId).filter(Boolean);
        const goalTargets = buildGoalTargetById(goalIds, GoalTargetStore.getTarget);
        const goalFixed = buildGoalFixedById(goalIds, GoalTargetStore.getFixed);
        const totalTypeAmount = group.endingBalanceAmount || 0;
        const projectedAmount = getProjectedInvestmentValue(projectedInvestmentsState, bucket, goalType);
        const adjustedTotal = totalTypeAmount + projectedAmount;
        return computeGoalTypeViewState(
            goals,
            totalTypeAmount,
            adjustedTotal,
            goalTargets,
            goalFixed
        );
    }

    function refreshGoalTypeSection({
        typeSection,
        bucket,
        goalType,
        mergedInvestmentDataState,
        projectedInvestmentsState,
        options = {}
    }) {
        const snapshot = buildGoalTypeAllocationSnapshot({
            bucket,
            goalType,
            mergedInvestmentDataState,
            projectedInvestmentsState
        });
        if (!snapshot) {
            return;
        }
        const remainingTarget = typeSection.querySelector(`.${CLASS_NAMES.remainingTarget}`);
        if (remainingTarget) {
            const remainingValue = remainingTarget.querySelector('.gpv-remaining-value');
            const displayValue = formatPercent(snapshot.remainingTargetPercent);
            if (remainingValue) {
                remainingValue.textContent = displayValue;
            } else {
                remainingTarget.textContent = '';
                appendTextSpan(remainingTarget, 'gpv-remaining-label', 'Remaining:');
                remainingTarget.appendChild(document.createTextNode(' '));
                appendTextSpan(remainingTarget, 'gpv-remaining-value', displayValue);
            }
            remainingTarget.classList.toggle(
                CLASS_NAMES.remainingAlert,
                isRemainingTargetAboveThreshold(snapshot.remainingTargetPercent)
            );
        }
        const rows = typeSection.querySelectorAll(`.${CLASS_NAMES.goalTable} tbody tr`);
        const forceTargetRefresh = options.forceTargetRefresh === true;
        rows.forEach(row => {
            const targetInput = row.querySelector(`.${CLASS_NAMES.targetInput}`);
            const diffCell = row.querySelector(`.${CLASS_NAMES.diffCell}`);
            if (!targetInput) {
                return;
            }
            const goalId = targetInput.dataset.goalId;
            const goalModel = snapshot.goalModelsById[goalId];
            if (!goalModel) {
                return;
            }
            targetInput.dataset.fixed = goalModel.isFixed ? 'true' : 'false';
            targetInput.disabled = goalModel.isFixed;
            if (goalModel.isFixed || forceTargetRefresh) {
                targetInput.value = goalModel.targetPercent !== null ? goalModel.targetPercent.toFixed(2) : '';
            }
            if (diffCell) {
                diffCell.textContent = goalModel.diffAmount === null ? '-' : formatMoney(goalModel.diffAmount);
                diffCell.className = goalModel.diffClass
                    ? `${CLASS_NAMES.diffCell} ${goalModel.diffClass}`
                    : CLASS_NAMES.diffCell;
            }
        });
    }

    function flashInputBorder(input, variant) {
        if (!input) {
            return;
        }
        const baseClass = 'gpv-input-flash';
        const variantClass = `gpv-input-flash--${variant || 'error'}`;
        input.classList.remove('gpv-input-flash--error', 'gpv-input-flash--warning', 'gpv-input-flash--success');
        input.classList.remove(baseClass);
        void input.offsetWidth;
        input.classList.add(baseClass, variantClass);
        const onAnimationEnd = () => {
            input.classList.remove(baseClass, variantClass);
            input.removeEventListener('animationend', onAnimationEnd);
        };
        input.addEventListener('animationend', onAnimationEnd);
    }

    /**
     * Handle changes to goal target percentage input
     * @param {HTMLInputElement} input - Input element
     * @param {string} goalId - Goal ID
     * @param {number} currentEndingBalance - Current ending balance amount for this goal
     * @param {number} totalTypeEndingBalance - Total ending balance amount for the goal type
     * @param {string} bucket - Bucket name
     * @param {string} goalType - Goal type
     * @param {HTMLElement} typeSection - Goal type section container
     * @param {Object} mergedInvestmentDataState - Current merged data map
     */
    function handleGoalTargetChange({
        input,
        goalId,
        currentEndingBalance,
        totalTypeEndingBalance,
        bucket,
        goalType,
        typeSection,
        mergedInvestmentDataState,
        projectedInvestmentsState
    }) {
        if (input.dataset.fixed === 'true') {
            return;
        }
        const value = input.value;
        const row = input.closest('tr');
        const diffCell = row.querySelector(`.${CLASS_NAMES.diffCell}`);
        
        if (value === '') {
            // Clear the target if input is empty
            GoalTargetStore.clearTarget(goalId);
            diffCell.textContent = '-';
            diffCell.className = CLASS_NAMES.diffCell;
            refreshGoalTypeSection({
                typeSection,
                bucket,
                goalType,
                mergedInvestmentDataState,
                projectedInvestmentsState
            });
            return;
        }
        
        const targetPercent = parseFloat(value);
        
        // Validate input
        if (!Number.isFinite(targetPercent)) {
            // Invalid number - show error feedback
            flashInputBorder(input, 'error');
            return;
        }
        
        // Save to storage (this will clamp to 0-100 automatically)
        const savedValue = GoalTargetStore.setTarget(goalId, targetPercent);
        if (!Number.isFinite(savedValue)) {
            flashInputBorder(input, 'error');
            return;
        }
        
        // Check if value was clamped and provide feedback
        if (savedValue !== targetPercent) {
            // Value was clamped - update input to show actual stored value
            input.value = savedValue.toFixed(2);
            // Show warning briefly
            flashInputBorder(input, 'warning');
        }
        
        // Get projected investment and calculate adjusted total
        const projectedAmount = getProjectedInvestmentValue(projectedInvestmentsState, bucket, goalType);
        const adjustedTypeTotal = totalTypeEndingBalance + projectedAmount;
        
        // Update difference display in dollar amount
        const diffData = buildDiffCellData(currentEndingBalance, savedValue, adjustedTypeTotal);
        diffCell.textContent = diffData.diffDisplay;
        diffCell.className = diffData.diffClassName;

        refreshGoalTypeSection({
            typeSection,
            bucket,
            goalType,
            mergedInvestmentDataState,
            projectedInvestmentsState
        });
    }
    testExports.handleGoalTargetChange = handleGoalTargetChange;

    function handleGoalFixedToggle({
        input,
        goalId,
        bucket,
        goalType,
        typeSection,
        mergedInvestmentDataState,
        projectedInvestmentsState
    }) {
        const isFixed = input.checked === true;

        if (isFixed) {
            GoalTargetStore.setFixed(goalId, true);
        } else {
            GoalTargetStore.clearFixed(goalId);
        }

        refreshGoalTypeSection({
            typeSection,
            bucket,
            goalType,
            mergedInvestmentDataState,
            projectedInvestmentsState,
            options: { forceTargetRefresh: true }
        });
    }
    testExports.handleGoalFixedToggle = handleGoalFixedToggle;

    /**
     * Handle changes to projected investment input
     * @param {HTMLInputElement} input - Input element
     * @param {string} bucket - Bucket name
     * @param {string} goalType - Goal type
     * @param {HTMLElement} typeSection - The type section element containing the table
     */
    function handleProjectedInvestmentChange({
        input,
        bucket,
        goalType,
        typeSection,
        mergedInvestmentDataState,
        projectedInvestmentsState
    }) {
        const value = input.value;
        
        if (value === '' || value === '0') {
            // Clear the projected investment if input is empty or zero
            clearProjectedInvestment(projectedInvestmentsState, bucket, goalType);
        } else {
            const amount = parseFloat(value);
            
            // Validate input
            if (isNaN(amount)) {
                // Invalid number - show error feedback
                flashInputBorder(input, 'error');
                return;
            }
            
            // Save the projected investment
            setProjectedInvestment(projectedInvestmentsState, bucket, goalType, amount);
            
            // Show success feedback
            flashInputBorder(input, 'success');
        }
        
        // Recalculate all diffs in this goal type section
        const tbody = typeSection.querySelector(`.${CLASS_NAMES.goalTable} tbody`);
        if (tbody) {
            refreshGoalTypeSection({
                typeSection,
                bucket,
                goalType,
                mergedInvestmentDataState,
                projectedInvestmentsState
            });
        }
    }
    testExports.handleProjectedInvestmentChange = handleProjectedInvestmentChange;

    const EventHandlers = {
        handleGoalTargetChange,
        handleGoalFixedToggle,
        handleProjectedInvestmentChange
    };

    // ============================================
    // UI: Sync Helper Functions
    // ============================================

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * Show notification (toast)
     */
    function showNotification(message, type = 'info') {
        const notification = createElement('div');
        notification.className = `gpv-notification gpv-notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Fade in
        setTimeout(() => {
            notification.classList.add('gpv-notification-show');
        }, 10);
        
        // Fade out and remove
        setTimeout(() => {
            notification.classList.remove('gpv-notification-show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }

    /**
     * Format timestamp for display
     */
    function formatTimestamp(timestamp) {
        if (!timestamp) return 'Never';
        const date = new Date(timestamp);
        return date.toLocaleString();
    }


    // ============================================
    // UI: Sync Functions
    // ============================================

function createSyncSettingsHTML() {
    const syncStatus = SyncManager.getStatus();
    const isEnabled = syncStatus.isEnabled;
    const isConfigured = syncStatus.isConfigured;
    const cryptoSupported = syncStatus.cryptoSupported;
    
    const serverUrl = Storage.get(SYNC_STORAGE_KEYS.serverUrl, SYNC_DEFAULTS.serverUrl);
    const userId = Storage.get(SYNC_STORAGE_KEYS.userId, '');
    const password = Storage.get(SYNC_STORAGE_KEYS.password, '');
    const autoSync = Storage.get(SYNC_STORAGE_KEYS.autoSync, SYNC_DEFAULTS.autoSync);
    const syncInterval = Storage.get(SYNC_STORAGE_KEYS.syncInterval, SYNC_DEFAULTS.syncInterval);
    
    const lastSyncTimestamp = syncStatus.lastSync;
    const lastSyncText = lastSyncTimestamp 
        ? new Date(lastSyncTimestamp).toLocaleString()
        : 'Never';

    return `
        <div class="gpv-sync-settings">
            <div class="gpv-sync-header">
                <h3>Sync Settings</h3>
                ${!cryptoSupported ? `
                    <div class="gpv-sync-warning">
                        ⚠️ Web Crypto API not supported in this browser. Sync requires a modern browser.
                    </div>
                ` : ''}
            </div>

            <div class="gpv-sync-status-bar">
                <div class="gpv-sync-status-item">
                    <span class="gpv-sync-label">Status:</span>
                    <span class="gpv-sync-value gpv-sync-status-${syncStatus.status}">
                        ${syncStatus.status.toUpperCase()}
                    </span>
                </div>
                <div class="gpv-sync-status-item">
                    <span class="gpv-sync-label">Last Sync:</span>
                    <span class="gpv-sync-value">${lastSyncText}</span>
                </div>
                ${syncStatus.lastError ? `
                    <div class="gpv-sync-status-item gpv-sync-error">
                        <span class="gpv-sync-label">Error:</span>
                        <span class="gpv-sync-value">${escapeHtml(syncStatus.lastError)}</span>
                    </div>
                ` : ''}
            </div>

            <div class="gpv-sync-form">
                <div class="gpv-sync-form-group">
                    <label class="gpv-sync-toggle">
                        <input 
                            type="checkbox" 
                            id="gpv-sync-enabled"
                            ${isEnabled ? 'checked' : ''}
                            ${!cryptoSupported ? 'disabled' : ''}
                        />
                        <span>Enable Sync</span>
                    </label>
                    <p class="gpv-sync-help">
                        Sync your goal configurations across devices using encrypted cloud storage.
                        <a href="https://github.com/laurenceputra/goal-portfolio-viewer/blob/main/SYNC_ARCHITECTURE.md" 
                           target="_blank" 
                           rel="noopener noreferrer">Learn more</a>
                    </p>
                </div>

                <div class="gpv-sync-form-group">
                    <label for="gpv-sync-server-url">Server URL</label>
                    <input 
                        type="text" 
                        id="gpv-sync-server-url"
                        class="gpv-sync-input"
                        value="${escapeHtml(serverUrl)}"
                        placeholder="${SYNC_DEFAULTS.serverUrl}"
                        ${!isEnabled || !cryptoSupported ? 'disabled' : ''}
                    />
                    <p class="gpv-sync-help">
                        Default: ${SYNC_DEFAULTS.serverUrl} (or use your self-hosted instance)
                    </p>
                </div>

                <div class="gpv-sync-form-group">
                    <label for="gpv-sync-user-id">User ID / Email</label>
                    <input 
                        type="text" 
                        id="gpv-sync-user-id"
                        class="gpv-sync-input"
                        value="${escapeHtml(userId)}"
                        placeholder="your.email@example.com or username"
                        ${!isEnabled || !cryptoSupported ? 'disabled' : ''}
                    />
                    <p class="gpv-sync-help">
                        Your unique identifier - use email address or custom username (3-50 characters)
                    </p>
                </div>

                <div class="gpv-sync-form-group">
                    <label for="gpv-sync-password">Password</label>
                    <input 
                        type="password" 
                        id="gpv-sync-password"
                        class="gpv-sync-input"
                        value="${escapeHtml(password)}"
                        placeholder="Strong password (min 8 characters)"
                        ${!isEnabled || !cryptoSupported ? 'disabled' : ''}
                    />
                    <p class="gpv-sync-help">
                        🔒 Your password is used for both authentication and encryption.<br>
                        ⚠️ <strong>Keep it safe!</strong> If lost, your data cannot be recovered.
                    </p>
                </div>

                ${!isConfigured ? `
                    <div class="gpv-sync-auth-buttons">
                        <button type="button" class="gpv-sync-btn-primary" id="gpv-sync-register-btn" ${!cryptoSupported ? 'disabled' : ''}>
                            📝 Sign Up
                        </button>
                        <button type="button" class="gpv-sync-btn-secondary" id="gpv-sync-login-btn" ${!cryptoSupported ? 'disabled' : ''}>
                            🔑 Login
                        </button>
                    </div>
                    <p class="gpv-sync-help" style="text-align: center; margin-top: 8px;">
                        New user? Click <strong>Sign Up</strong> to create an account.<br>
                        Existing user? Click <strong>Login</strong> to verify credentials.
                    </p>
                ` : ''}

                <div class="gpv-sync-form-group">
                    <label class="gpv-sync-toggle">
                        <input 
                            type="checkbox" 
                            id="gpv-sync-auto"
                            ${autoSync ? 'checked' : ''}
                            ${!isEnabled || !cryptoSupported ? 'disabled' : ''}
                        />
                        <span>Automatic Sync</span>
                    </label>
                </div>

                <div class="gpv-sync-form-group">
                    <label for="gpv-sync-interval">Sync Interval (minutes)</label>
                    <input 
                        type="number" 
                        id="gpv-sync-interval"
                        class="gpv-sync-input"
                        value="${syncInterval}"
                        min="5"
                        max="1440"
                        ${!isEnabled || !autoSync || !cryptoSupported ? 'disabled' : ''}
                    />
                    <p class="gpv-sync-help">
                        How often to automatically sync (5-1440 minutes)
                    </p>
                </div>

                <div class="gpv-sync-actions">
                    <button 
                        class="gpv-sync-btn gpv-sync-btn-primary"
                        id="gpv-sync-save-btn"
                        ${!cryptoSupported ? 'disabled' : ''}
                    >
                        Save Settings
                    </button>
                    <button 
                        class="gpv-sync-btn gpv-sync-btn-secondary"
                        id="gpv-sync-test-btn"
                        ${!isEnabled || !isConfigured || !cryptoSupported ? 'disabled' : ''}
                    >
                        Test Connection
                    </button>
                    <button 
                        class="gpv-sync-btn gpv-sync-btn-secondary"
                        id="gpv-sync-now-btn"
                        ${!isEnabled || !isConfigured || !cryptoSupported ? 'disabled' : ''}
                    >
                        Sync Now
                    </button>
                    <button 
                        class="gpv-sync-btn gpv-sync-btn-danger"
                        id="gpv-sync-clear-btn"
                    >
                        Clear Configuration
                    </button>
                </div>
            </div>
        </div>
    `;
}

function setupSyncSettingsListeners() {
    // Enable/disable sync
    const enabledCheckbox = document.getElementById('gpv-sync-enabled');
    if (enabledCheckbox) {
        enabledCheckbox.addEventListener('change', (e) => {
            const inputs = document.querySelectorAll('.gpv-sync-input, #gpv-sync-auto, #gpv-sync-interval');
            inputs.forEach(input => {
                input.disabled = !e.target.checked;
            });
            
            const buttons = document.querySelectorAll('#gpv-sync-test-btn, #gpv-sync-now-btn');
            buttons.forEach(btn => {
                btn.disabled = !e.target.checked;
            });
        });
    }

    // Auto-sync toggle
    const autoSyncCheckbox = document.getElementById('gpv-sync-auto');
    if (autoSyncCheckbox) {
        autoSyncCheckbox.addEventListener('change', (e) => {
            const intervalInput = document.getElementById('gpv-sync-interval');
            if (intervalInput) {
                intervalInput.disabled = !e.target.checked;
            }
        });
    }

    // Save settings
    const saveBtn = document.getElementById('gpv-sync-save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            try {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';

                const enabled = document.getElementById('gpv-sync-enabled').checked;
                const serverUrl = document.getElementById('gpv-sync-server-url').value.trim();
                const userId = document.getElementById('gpv-sync-user-id').value.trim();
                const password = document.getElementById('gpv-sync-password').value;
                const autoSync = document.getElementById('gpv-sync-auto').checked;
                const syncInterval = parseInt(document.getElementById('gpv-sync-interval').value) || SYNC_DEFAULTS.syncInterval;

                // Validation
                if (enabled) {
                    if (!serverUrl || !userId || !password) {
                        throw new Error('All fields are required when sync is enabled');
                    }
                    if (password.length < 8) {
                        throw new Error('Password must be at least 8 characters');
                    }
                    if (syncInterval < 5 || syncInterval > 1440) {
                        throw new Error('Sync interval must be between 5 and 1440 minutes');
                    }
                }

                if (enabled) {
                    SyncManager.enable({
                        serverUrl,
                        userId,
                        password,
                        autoSync,
                        syncInterval
                    });
                    showSuccessMessage('Sync settings saved successfully!');
                } else {
                    SyncManager.disable();
                    showSuccessMessage('Sync disabled');
                }

                // Refresh the settings panel
                setTimeout(() => {
                    const settingsPanel = document.querySelector('.gpv-sync-settings');
                    if (settingsPanel) {
                        settingsPanel.outerHTML = createSyncSettingsHTML();
                        setupSyncSettingsListeners();
                    }
                }, 1000);
            } catch (error) {
                console.error('[Goal Portfolio Viewer] Save sync settings failed:', error);
                showErrorMessage(`Failed to save settings: ${error.message}`);
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Settings';
            }
        });
    }

    // Register button
    const registerBtn = document.getElementById('gpv-sync-register-btn');
    if (registerBtn) {
        registerBtn.addEventListener('click', async () => {
            try {
                registerBtn.disabled = true;
                registerBtn.textContent = 'Signing up...';

                const serverUrl = document.getElementById('gpv-sync-server-url').value.trim();
                const userId = document.getElementById('gpv-sync-user-id').value.trim();
                const password = document.getElementById('gpv-sync-password').value;

                if (!serverUrl || !userId || !password) {
                    throw new Error('Please fill in Server URL, User ID, and Password');
                }

                if (password.length < 8) {
                    throw new Error('Password must be at least 8 characters');
                }

                const result = await SyncManager.register(serverUrl, userId, password);
                showSuccessMessage('✅ Account created successfully! You can now enable sync.');
                
                // Refresh UI to show that user is now registered
                setTimeout(() => {
                    const settingsPanel = document.querySelector('.gpv-sync-settings');
                    if (settingsPanel) {
                        settingsPanel.outerHTML = createSyncSettingsHTML();
                        setupSyncSettingsListeners();
                    }
                }, 1500);
            } catch (error) {
                console.error('[Goal Portfolio Viewer] Registration failed:', error);
                showErrorMessage(`Registration failed: ${error.message}`);
            } finally {
                registerBtn.disabled = false;
                registerBtn.textContent = '📝 Sign Up';
            }
        });
    }

    // Login button
    const loginBtn = document.getElementById('gpv-sync-login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            try {
                loginBtn.disabled = true;
                loginBtn.textContent = 'Logging in...';

                const serverUrl = document.getElementById('gpv-sync-server-url').value.trim();
                const userId = document.getElementById('gpv-sync-user-id').value.trim();
                const password = document.getElementById('gpv-sync-password').value;

                if (!serverUrl || !userId || !password) {
                    throw new Error('Please fill in Server URL, User ID, and Password');
                }

                const result = await SyncManager.login(serverUrl, userId, password);
                showSuccessMessage('✅ Login successful! You can now enable sync.');
                
                // Auto-enable sync after successful login
                document.getElementById('gpv-sync-enabled').checked = true;
                document.getElementById('gpv-sync-enabled').dispatchEvent(new Event('change'));
                
            } catch (error) {
                console.error('[Goal Portfolio Viewer] Login failed:', error);
                showErrorMessage(`Login failed: ${error.message}`);
            } finally {
                loginBtn.disabled = false;
                loginBtn.textContent = '🔑 Login';
            }
        });
    }

    // Test connection
    const testBtn = document.getElementById('gpv-sync-test-btn');
    if (testBtn) {
        testBtn.addEventListener('click', async () => {
            try {
                testBtn.disabled = true;
                testBtn.textContent = 'Testing...';

                const serverUrl = Storage.get(SYNC_STORAGE_KEYS.serverUrl, SYNC_DEFAULTS.serverUrl);
                const response = await fetch(`${serverUrl}/health`);
                const data = await response.json();

                if (response.ok && data.status === 'ok') {
                    showSuccessMessage(`Connection successful! Server version: ${data.version}`);
                } else {
                    throw new Error('Server returned unexpected response');
                }
            } catch (error) {
                console.error('[Goal Portfolio Viewer] Test connection failed:', error);
                showErrorMessage(`Connection failed: ${error.message}`);
            } finally {
                testBtn.disabled = false;
                testBtn.textContent = 'Test Connection';
            }
        });
    }

    // Sync now
    const syncNowBtn = document.getElementById('gpv-sync-now-btn');
    if (syncNowBtn) {
        syncNowBtn.addEventListener('click', async () => {
            try {
                syncNowBtn.disabled = true;
                syncNowBtn.textContent = 'Syncing...';

                const result = await SyncManager.performSync({ direction: 'both' });
                
                if (result.status === 'conflict') {
                    showInfoMessage('Sync conflict detected. Please resolve the conflict.');
                } else {
                    showSuccessMessage('Sync completed successfully!');
                    
                    // Refresh the portfolio view
                    if (typeof renderPortfolioView === 'function') {
                        renderPortfolioView();
                    }
                }

                // Refresh the settings panel
                setTimeout(() => {
                    const settingsPanel = document.querySelector('.gpv-sync-settings');
                    if (settingsPanel) {
                        settingsPanel.outerHTML = createSyncSettingsHTML();
                        setupSyncSettingsListeners();
                    }
                }, 1000);
            } catch (error) {
                console.error('[Goal Portfolio Viewer] Sync failed:', error);
                showErrorMessage(`Sync failed: ${error.message}`);
            } finally {
                syncNowBtn.disabled = false;
                syncNowBtn.textContent = 'Sync Now';
            }
        });
    }

    // Clear configuration
    const clearBtn = document.getElementById('gpv-sync-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear sync configuration? This will not delete data from the server.')) {
                SyncManager.clearConfig();
                showInfoMessage('Sync configuration cleared');
                
                // Refresh the settings panel
                const settingsPanel = document.querySelector('.gpv-sync-settings');
                if (settingsPanel) {
                    settingsPanel.outerHTML = createSyncSettingsHTML();
                    setupSyncSettingsListeners();
                }
            }
        });
    }
}

/**
 * Show sync settings modal
 */

function showSyncSettings() {
    console.log('[Goal Portfolio Viewer] showSyncSettings called');
    
    try {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'gpv-modal-overlay';
        
        console.log('[Goal Portfolio Viewer] Creating sync settings HTML...');
        let settingsHTML;
        try {
            settingsHTML = createSyncSettingsHTML();
            console.log('[Goal Portfolio Viewer] Settings HTML created successfully');
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Error creating settings HTML:', error);
            settingsHTML = '<div style="padding: 20px; color: #ef4444;">Error loading sync settings. Please check console for details.</div>';
        }
        
        overlay.innerHTML = `
            <div class="gpv-modal gpv-sync-modal">
                <div class="gpv-modal-header">
                    <h2>Sync Settings</h2>
                    <button class="gpv-modal-close" id="gpv-sync-modal-close">&times;</button>
                </div>
                <div class="gpv-modal-body">
                    ${settingsHTML}
                </div>
            </div>
        `;
        
        console.log('[Goal Portfolio Viewer] Appending overlay to body...');
        document.body.appendChild(overlay);
        console.log('[Goal Portfolio Viewer] Overlay appended to body');

        // Setup listeners
        try {
            console.log('[Goal Portfolio Viewer] Setting up sync settings listeners...');
            setupSyncSettingsListeners();
            console.log('[Goal Portfolio Viewer] Listeners setup complete');
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Error setting up listeners:', error);
        }

        // Close button
        const closeBtn = document.getElementById('gpv-sync-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                console.log('[Goal Portfolio Viewer] Close button clicked');
                overlay.remove();
            });
        }

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                console.log('[Goal Portfolio Viewer] Overlay clicked, closing...');
                overlay.remove();
            }
        });
        
        console.log('[Goal Portfolio Viewer] Sync settings modal shown successfully');
    } catch (error) {
        console.error('[Goal Portfolio Viewer] Critical error in showSyncSettings:', error);
        alert('Error opening sync settings: ' + error.message + '\n\nPlease check the browser console for more details.');
    }
}

// ============================================
// CHUNK 5: CONFLICT RESOLUTION UI
// ============================================

/**
 * Format timestamp for display
 */

function createConflictDialogHTML(conflict) {
    const localTargets = Object.keys(conflict.local.goalTargets || {}).length;
    const remoteTargets = Object.keys(conflict.remote.goalTargets || {}).length;
    const localFixed = Object.keys(conflict.local.goalFixed || {}).length;
    const remoteFixed = Object.keys(conflict.remote.goalFixed || {}).length;

    return `
        <div class="gpv-conflict-dialog">
            <h3>⚠️ Sync Conflict Detected</h3>
            <p class="gpv-conflict-description">
                Your local configuration conflicts with the data on the server. 
                This typically happens when you've made changes on multiple devices.
            </p>

            <div class="gpv-conflict-comparison">
                <div class="gpv-conflict-option">
                    <h4>📱 Local (This Device)</h4>
                    <ul class="gpv-conflict-details">
                        <li><strong>Last Modified:</strong> ${formatTimestamp(conflict.localTimestamp)}</li>
                        <li><strong>Goal Targets:</strong> ${localTargets} configured</li>
                        <li><strong>Fixed Goals:</strong> ${localFixed} configured</li>
                    </ul>
                    <button class="gpv-sync-btn gpv-sync-btn-primary" id="gpv-conflict-keep-local">
                        Keep Local
                    </button>
                </div>

                <div class="gpv-conflict-divider">OR</div>

                <div class="gpv-conflict-option">
                    <h4>☁️ Remote (Server)</h4>
                    <ul class="gpv-conflict-details">
                        <li><strong>Last Modified:</strong> ${formatTimestamp(conflict.remoteTimestamp)}</li>
                        <li><strong>Goal Targets:</strong> ${remoteTargets} configured</li>
                        <li><strong>Fixed Goals:</strong> ${remoteFixed} configured</li>
                        <li><strong>Device:</strong> ${conflict.remoteDeviceId.substring(0, 8)}...</li>
                    </ul>
                    <button class="gpv-sync-btn gpv-sync-btn-primary" id="gpv-conflict-use-remote">
                        Use Remote
                    </button>
                </div>
            </div>

            <div class="gpv-conflict-warning">
                <p><strong>⚠️ Warning:</strong> Choosing one option will overwrite the other. Make sure to choose carefully.</p>
            </div>

            <div class="gpv-conflict-actions">
                <button class="gpv-sync-btn gpv-sync-btn-secondary" id="gpv-conflict-cancel">
                    Cancel (Resolve Later)
                </button>
            </div>
        </div>
    `;
}

/**
 * Show conflict resolution UI
 */

function showConflictResolutionUI(conflict) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'gpv-modal-overlay gpv-conflict-overlay';
    overlay.innerHTML = `
        <div class="gpv-modal gpv-conflict-modal">
            ${createConflictDialogHTML(conflict)}
        </div>
    `;
    
    document.body.appendChild(overlay);

    // Keep local button
    const keepLocalBtn = document.getElementById('gpv-conflict-keep-local');
    if (keepLocalBtn) {
        keepLocalBtn.addEventListener('click', async () => {
            try {
                keepLocalBtn.disabled = true;
                keepLocalBtn.textContent = 'Resolving...';
                
                await SyncManager.resolveConflict('local', conflict);
                showSuccessMessage('Conflict resolved! Local data uploaded to server.');
                overlay.remove();
            } catch (error) {
                console.error('[Goal Portfolio Viewer] Conflict resolution failed:', error);
                showErrorMessage(`Failed to resolve conflict: ${error.message}`);
                keepLocalBtn.disabled = false;
                keepLocalBtn.textContent = 'Keep Local';
            }
        });
    }

    // Use remote button
    const useRemoteBtn = document.getElementById('gpv-conflict-use-remote');
    if (useRemoteBtn) {
        useRemoteBtn.addEventListener('click', async () => {
            try {
                useRemoteBtn.disabled = true;
                useRemoteBtn.textContent = 'Resolving...';
                
                await SyncManager.resolveConflict('remote', conflict);
                showSuccessMessage('Conflict resolved! Remote data applied locally.');
                overlay.remove();
            } catch (error) {
                console.error('[Goal Portfolio Viewer] Conflict resolution failed:', error);
                showErrorMessage(`Failed to resolve conflict: ${error.message}`);
                useRemoteBtn.disabled = false;
                useRemoteBtn.textContent = 'Use Remote';
            }
        });
    }

    // Cancel button
    const cancelBtn = document.getElementById('gpv-conflict-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            overlay.remove();
            showInfoMessage('Conflict resolution postponed. Sync will retry later.');
        });
    }

    // Prevent closing on overlay click for conflicts
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            showInfoMessage('Please choose an option to resolve the conflict.');
        }
    });
}

// ============================================
// CHUNK 6: SYNC STATUS INDICATOR
// ============================================

/**

function createSyncIndicatorHTML() {
    const syncStatus = SyncManager.getStatus();
    
    if (!syncStatus.isEnabled) {
        return ''; // Don't show indicator if sync is disabled
    }

    const statusIcons = {
        idle: '⚪',
        syncing: '🔄',
        success: '✅',
        error: '❌',
        conflict: '⚠️'
    };

    const statusTexts = {
        idle: 'Sync Idle',
        syncing: 'Syncing...',
        success: 'Synced',
        error: 'Sync Error',
        conflict: 'Sync Conflict'
    };

    const icon = statusIcons[syncStatus.status] || statusIcons.idle;
    const text = statusTexts[syncStatus.status] || statusTexts.idle;

    return `
        <div class="gpv-sync-indicator gpv-sync-status-${syncStatus.status}" 
             id="gpv-sync-indicator"
             title="${text}${syncStatus.lastError ? ': ' + syncStatus.lastError : ''}">
            <span class="gpv-sync-icon">${icon}</span>
            <span class="gpv-sync-text">${text}</span>
        </div>
    `;
}

/**
 * Update sync UI elements
 */

function updateSyncUI() {
    // Update sync indicator
    const indicator = document.getElementById('gpv-sync-indicator');
    if (indicator) {
        const parent = indicator.parentElement;
        indicator.outerHTML = createSyncIndicatorHTML();
        
        // Re-attach click listener
        const newIndicator = parent.querySelector('#gpv-sync-indicator');
        if (newIndicator) {
            newIndicator.addEventListener('click', showSyncSettings);
        }
    }

    // Update sync settings panel if open
    const settingsPanel = document.querySelector('.gpv-sync-settings');
    if (settingsPanel) {
        settingsPanel.outerHTML = createSyncSettingsHTML();
        setupSyncSettingsListeners();
    }
}

// ============================================

    // ============================================
    // UI: Styles
    // ============================================
    
    function injectStyles() {
        const style = createElement('style');
        style.textContent = `
            /* Modern Portfolio Viewer Styles */
            
            .gpv-trigger-btn {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 999999;
                padding: 12px 24px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #fff;
                border: none;
                border-radius: 12px;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                cursor: pointer;
                font-size: 15px;
                font-weight: 600;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                transition: all 0.3s ease;
                backdrop-filter: blur(10px);
            }
            
            .gpv-trigger-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
            }
            
            .gpv-trigger-btn:active {
                transform: translateY(0);
            }
            
            .gpv-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(8px);
                z-index: 1000000;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: gpv-fadeIn 0.2s ease;
            }
            
            @keyframes gpv-fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            .gpv-container {
                background: #ffffff;
                border-radius: 20px;
                padding: 0;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                position: relative;
                max-height: 85vh;
                max-width: 1200px;
                width: 90vw;
                min-width: 800px;
                display: flex;
                flex-direction: column;
                animation: gpv-slideUp 0.3s ease;
            }
            
            @keyframes gpv-slideUp {
                from { 
                    opacity: 0;
                    transform: translateY(20px);
                }
                to { 
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            @keyframes gpv-input-flash {
                0% { box-shadow: 0 0 0 2px var(--gpv-flash-color); }
                100% { box-shadow: 0 0 0 0 rgba(0, 0, 0, 0); }
            }

            .gpv-input-flash {
                border-color: var(--gpv-flash-color);
                box-shadow: 0 0 0 2px var(--gpv-flash-color);
                animation: gpv-input-flash 0.8s ease;
            }

            .gpv-input-flash--error {
                --gpv-flash-color: #dc2626;
            }

            .gpv-input-flash--warning {
                --gpv-flash-color: #f59e0b;
            }

            .gpv-input-flash--success {
                --gpv-flash-color: #10b981;
            }
            
            .gpv-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 24px;
                border-bottom: 1px solid #e5e7eb;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 20px 20px 0 0;
            }
            
            .gpv-header h1 {
                margin: 0;
                font-size: 20px;
                font-weight: 700;
                color: #ffffff;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }
            
            .gpv-sync-indicator-container {
                flex: 1;
                display: flex;
                justify-content: center;
                padding: 0 16px;
            }
            
            .gpv-header-buttons {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .gpv-close-btn {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: #ffffff;
                font-size: 24px;
                width: 36px;
                height: 36px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                font-weight: 300;
            }
            
            .gpv-close-btn:hover {
                background: rgba(255, 255, 255, 0.3);
                transform: rotate(90deg);
            }
            
            .gpv-sync-btn {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: #ffffff;
                font-size: 14px;
                padding: 8px 16px;
                border-radius: 18px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                font-weight: 500;
                gap: 6px;
            }
            
            .gpv-sync-btn:hover {
                background: rgba(255, 255, 255, 0.3);
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            }
            
            .gpv-sync-btn:active {
                transform: translateY(0);
            }
            
            .gpv-controls {
                padding: 12px 24px;
                background: #f9fafb;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .gpv-select-label {
                font-weight: 600;
                color: #1f2937;
                font-size: 16px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }
            
            .gpv-select {
                padding: 10px 18px;
                border: 2px solid #e5e7eb;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 500;
                color: #1f2937;
                background: #ffffff;
                cursor: pointer;
                transition: all 0.2s ease;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                min-width: 220px;
            }
            
            .gpv-select:hover {
                border-color: #667eea;
            }
            
            .gpv-select:focus {
                outline: none;
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            
            .gpv-content {
                overflow-y: auto;
                padding: 16px 24px;
                flex: 1;
            }
            
            /* Summary View Styles */
            
            .gpv-summary-container {
                display: flex;
                flex-direction: column;
                gap: 14px;
            }
            
            .gpv-bucket-card {
                background: #ffffff;
                border: 2px solid #e5e7eb;
                border-radius: 12px;
                padding: 16px;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .gpv-bucket-card:hover {
                border-color: #667eea;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
                transform: translateY(-2px);
            }

            .gpv-bucket-card:focus-visible {
                outline: 3px solid rgba(102, 126, 234, 0.7);
                outline-offset: 2px;
            }
            
            .gpv-bucket-header {
                margin-bottom: 12px;
            }
            
            .gpv-bucket-title {
                font-size: 19px;
                font-weight: 700;
                color: #111827;
                margin: 0 0 10px 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }
            
            .gpv-stats {
                display: flex;
                gap: 24px;
            }

            .gpv-bucket-stats {
                flex-wrap: wrap;
            }
            
            .gpv-stat-item {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            
            .gpv-stat-label {
                font-size: 12px;
                font-weight: 600;
                color: #4b5563;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .gpv-stat-value {
                font-size: 18px;
                font-weight: 700;
                color: #111827;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }
            
            .gpv-stat-value.positive {
                color: #059669;
            }
            
            .gpv-stat-value.negative {
                color: #dc2626;
            }
            
            .gpv-goal-type-row {
                display: flex;
                gap: 16px;
                padding: 10px 12px;
                background: #f9fafb;
                border-radius: 8px;
                margin-bottom: 8px;
                align-items: center;
            }
            
            .gpv-goal-type-name {
                font-weight: 700;
                color: #1f2937;
                min-width: 120px;
                font-size: 14px;
            }
            
            .gpv-goal-type-stat {
                font-size: 13px;
                color: #4b5563;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }
            
            /* Detail View Styles */
            
            .gpv-detail-header {
                margin-bottom: 16px;
                padding-bottom: 12px;
                border-bottom: 2px solid #e5e7eb;
            }
            
            .gpv-detail-title {
                font-size: 22px;
                font-weight: 700;
                color: #111827;
                margin: 0 0 12px 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }
            
            .gpv-detail-stats {
                gap: 28px;
                flex-wrap: nowrap;
            }
            
            .gpv-type-section {
                margin-bottom: 24px;
            }
            
            .gpv-type-header {
                margin-bottom: 12px;
            }
            
            .gpv-type-header h3 {
                font-size: 17px;
                font-weight: 700;
                color: #1f2937;
                margin: 0 0 8px 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }
            
            .gpv-type-summary {
                display: flex;
                gap: 20px;
                font-size: 14px;
                color: #4b5563;
                font-weight: 500;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }
            
            /* Table Styles */
            
            .gpv-table {
                width: 100%;
                border-collapse: separate;
                border-spacing: 0;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }
            
            .gpv-table thead tr {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            
            .gpv-table th {
                padding: 10px 14px;
                text-align: right;
                font-weight: 700;
                font-size: 12px;
                color: #ffffff;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                white-space: nowrap;
            }

            .gpv-table th.gpv-goal-name-header {
                text-align: left;
            }

            .gpv-fixed-header {
                text-align: center;
            }
            
            .gpv-table td {
                padding: 10px 14px;
                text-align: right;
                font-size: 14px;
                color: #1f2937;
                border-top: 1px solid #e5e7eb;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }
            
            .gpv-table tbody tr {
                transition: background-color 0.2s ease;
            }
            
            .gpv-table tbody tr:hover {
                background-color: #f3f4f6;
            }
            
            .gpv-table .gpv-goal-name {
                text-align: left;
                font-weight: 600;
                color: #111827;
                font-size: 14px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }
            
            .gpv-table .positive {
                color: #059669;
                font-weight: 700;
            }
            
            .gpv-table .negative {
                color: #dc2626;
                font-weight: 700;
            }
            
            /* Target Input Styles */
            
            .gpv-target-cell {
                padding: 6px 8px !important;
            }

            .gpv-target-header {
                text-align: right;
            }

            .gpv-remaining-target {
                margin-top: 4px;
                font-size: 11px;
                color: #fef3c7;
                font-weight: 500;
            }

            .gpv-remaining-target.gpv-remaining-alert {
                color: #ffffff;
                background: #f97316;
                border-radius: 999px;
                padding: 2px 6px;
                font-weight: 700;
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }

            .gpv-fixed-cell {
                text-align: center;
                white-space: nowrap;
            }

            .gpv-fixed-toggle {
                position: relative;
                display: inline-block;
                width: 36px;
                height: 20px;
                vertical-align: middle;
            }

            .gpv-fixed-toggle-input {
                opacity: 0;
                width: 0;
                height: 0;
            }

            .gpv-toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #9ca3af;
                transition: 0.2s;
                border-radius: 999px;
            }

            .gpv-toggle-slider:before {
                position: absolute;
                content: '';
                height: 14px;
                width: 14px;
                left: 3px;
                bottom: 3px;
                background-color: #ffffff;
                transition: 0.2s;
                border-radius: 50%;
            }

            .gpv-fixed-toggle-input:checked + .gpv-toggle-slider {
                background-color: #4f46e5;
            }

            .gpv-fixed-toggle-input:checked + .gpv-toggle-slider:before {
                transform: translateX(16px);
            }

            .gpv-target-input {
                width: 70px;
                padding: 4px 8px;
                border: 2px solid #e5e7eb;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 600;
                color: #1f2937;
                background: #ffffff;
                transition: all 0.2s ease;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }
            
            .gpv-target-input:focus {
                outline: none;
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            
            .gpv-target-input:hover {
                border-color: #667eea;
            }
            
            .gpv-target-input::placeholder {
                color: #9ca3af;
                font-weight: 400;
                font-size: 12px;
            }
            
            /* Remove spinner arrows in Chrome, Safari, Edge, Opera */
            .gpv-target-input::-webkit-outer-spin-button,
            .gpv-target-input::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
            }
            
            /* Remove spinner arrows in Firefox */
            .gpv-target-input[type=number] {
                -moz-appearance: textfield;
            }
            
            .gpv-diff-cell {
                font-weight: 700;
                font-size: 14px;
                text-align: center;
            }
            
            .gpv-diff-cell.positive {
                color: #059669;
            }
            
            .gpv-diff-cell.negative {
                color: #dc2626;
            }
            
            /* Projected Investment Input Styles */
            
            .gpv-projected-input-container {
                margin-top: 12px;
                margin-bottom: 12px;
                padding: 12px;
                background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
                border: 2px dashed #0284c7;
                border-radius: 8px;
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .gpv-projected-label {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 13px;
                font-weight: 600;
                color: #0c4a6e;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                white-space: nowrap;
            }
            
            .gpv-projected-icon {
                font-size: 16px;
            }
            
            .gpv-projected-input {
                width: 140px;
                padding: 6px 12px;
                border: 2px solid #0284c7;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 600;
                color: #0c4a6e;
                background: #ffffff;
                transition: all 0.2s ease;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }
            
            .gpv-projected-input:focus {
                outline: none;
                border-color: #0369a1;
                box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.2);
            }
            
            .gpv-projected-input:hover {
                border-color: #0369a1;
            }
            
            .gpv-projected-input::placeholder {
                color: #075985;
                font-weight: 400;
                font-size: 13px;
            }
            
            /* Remove spinner arrows for projected input */
            .gpv-projected-input::-webkit-outer-spin-button,
            .gpv-projected-input::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
            }
            
            .gpv-projected-input[type=number] {
                -moz-appearance: textfield;
            }

            /* Performance Chart + Metrics */

            .gpv-performance-container {
                display: flex;
                flex-direction: column;
                gap: 20px;
                align-items: stretch;
                padding: 12px;
                border-radius: 10px;
                background: #f8fafc;
                border: 1px solid #e5e7eb;
                margin-bottom: 14px;
            }

            .gpv-performance-detail-row {
                display: flex;
                gap: 20px;
                align-items: stretch;
            }

            .gpv-performance-footer-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
            }

            .gpv-performance-cache-note {
                font-size: 12px;
                color: #64748b;
                font-weight: 500;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }

            .gpv-performance-refresh-btn {
                background: #ffffff;
                border: 1px solid #cbd5f5;
                color: #4c1d95;
                font-size: 12px;
                font-weight: 700;
                padding: 6px 12px;
                border-radius: 999px;
                cursor: pointer;
                transition: all 0.2s ease;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }

            .gpv-performance-refresh-btn:hover:not(:disabled) {
                border-color: #a78bfa;
                color: #5b21b6;
                box-shadow: 0 2px 6px rgba(76, 29, 149, 0.18);
            }

            .gpv-performance-refresh-btn:disabled {
                cursor: not-allowed;
                opacity: 0.6;
                box-shadow: none;
            }

            .gpv-performance-loading {
                font-size: 14px;
                font-weight: 600;
                color: #64748b;
                width: 100%;
                text-align: center;
                padding: 12px 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }

            .gpv-performance-chart-wrapper {
                flex: 1;
                min-width: 240px;
                min-height: 90px;
                height: auto;
            }

            .gpv-performance-chart {
                width: 100%;
                height: 100%;
                display: block;
            }

            .gpv-performance-chart-axis line {
                stroke: #cbd5f5;
                stroke-width: 1;
            }

            .gpv-performance-chart-grid {
                stroke: #e2e8f0;
                stroke-width: 1;
                stroke-dasharray: 2 2;
            }

            .gpv-performance-chart-tick {
                stroke: #94a3b8;
                stroke-width: 1;
            }

            .gpv-performance-chart-label {
                font-size: 9px;
                fill: #64748b;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }

            .gpv-performance-chart-title {
                font-size: 9px;
                fill: #475569;
                font-weight: 600;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }

            .gpv-performance-chart-point {
                fill: #1f2937;
            }

            .gpv-performance-chart-empty {
                font-size: 12px;
                fill: #94a3b8;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }

            .gpv-performance-window-grid {
                display: grid;
                grid-template-columns: repeat(6, minmax(0, 1fr));
                gap: 8px;
                width: 100%;
            }

            .gpv-performance-window-tile {
                background: #ffffff;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 6px 8px;
                text-align: center;
            }

            .gpv-performance-window-label {
                font-size: 11px;
                font-weight: 700;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 0.4px;
            }

            .gpv-performance-window-value {
                font-size: 13px;
                font-weight: 700;
                color: #0f172a;
            }

            .gpv-performance-window-value.positive {
                color: #059669;
            }

            .gpv-performance-window-value.negative {
                color: #dc2626;
            }

            .gpv-performance-metrics-table {
                width: 100%;
                max-width: 320px;
                border-collapse: collapse;
                font-size: 13px;
            }

            .gpv-performance-detail-row .gpv-performance-chart-wrapper {
                flex: 1;
                min-width: 240px;
            }

            .gpv-performance-metrics-table tr {
                border-bottom: 1px solid #e5e7eb;
            }

            .gpv-performance-metrics-table tr:last-child {
                border-bottom: none;
            }

            .gpv-performance-metric-label {
                display: flex;
                align-items: center;
                gap: 6px;
                text-align: left;
                color: #475569;
                font-weight: 600;
                padding: 6px 4px;
            }

            .gpv-performance-metric-label-text {
                display: inline-flex;
                align-items: center;
            }

            .gpv-performance-metric-info {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 16px;
                height: 16px;
                border-radius: 999px;
                border: 1px solid #cbd5f5;
                background: #eef2ff;
                color: #4c51bf;
                font-size: 10px;
                font-weight: 700;
                line-height: 1;
                cursor: help;
            }

            .gpv-performance-metric-info::before,
            .gpv-performance-metric-info::after {
                position: absolute;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.12s ease-out;
                transition-delay: 0.1s;
            }

            .gpv-performance-metric-info::before {
                content: '';
                top: calc(100% + 2px);
                left: 50%;
                transform: translateX(-50%);
                border-width: 6px 6px 0 6px;
                border-style: solid;
                border-color: #0f172a transparent transparent transparent;
            }

            .gpv-performance-metric-info::after {
                content: attr(data-tooltip);
                top: calc(100% + 8px);
                left: 50%;
                transform: translateX(-50%);
                max-width: 360px;
                width: max-content;
                padding: 6px 8px;
                border-radius: 6px;
                background: #0f172a;
                color: #f8fafc;
                font-size: 11px;
                line-height: 1.4;
                text-align: left;
                white-space: normal;
                box-shadow: 0 8px 24px rgba(15, 23, 42, 0.25);
                z-index: 2;
            }

            .gpv-performance-metric-info:hover::before,
            .gpv-performance-metric-info:hover::after {
                opacity: 1;
            }

            .gpv-performance-metric-value {
                text-align: right;
                color: #0f172a;
                font-weight: 700;
                padding: 6px 4px;
            }
            
            /* Scrollbar Styles */
            
            .gpv-content::-webkit-scrollbar {
                width: 8px;
            }
            
            .gpv-content::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 4px;
            }
            
            .gpv-content::-webkit-scrollbar-thumb {
                background: #cbd5e1;
                border-radius: 4px;
            }
            
            .gpv-content::-webkit-scrollbar-thumb:hover {
                background: #94a3b8;
            }
            /* =========================== */
            /* Sync UI Styles */
            /* =========================== */
                /* Sync Settings Modal */
                .gpv-sync-modal {
                    max-width: 700px;
                    max-height: 90vh;
                    overflow-y: auto;
                }

                .gpv-sync-settings {
                    padding: 20px;
                }

                .gpv-sync-header h3 {
                    margin: 0 0 15px 0;
                    font-size: 20px;
                    font-weight: 600;
                }

                .gpv-sync-warning {
                    background-color: #fff3cd;
                    border: 1px solid #ffc107;
                    border-radius: 4px;
                    padding: 12px;
                    margin-bottom: 15px;
                    color: #856404;
                }

                .gpv-sync-status-bar {
                    background-color: #f8f9fa;
                    border: 1px solid #dee2e6;
                    border-radius: 4px;
                    padding: 12px;
                    margin-bottom: 20px;
                }

                .gpv-sync-status-item {
                    display: flex;
                    align-items: center;
                    margin-bottom: 8px;
                }

                .gpv-sync-status-item:last-child {
                    margin-bottom: 0;
                }

                .gpv-sync-label {
                    font-weight: 600;
                    margin-right: 8px;
                    min-width: 100px;
                }

                .gpv-sync-value {
                    flex: 1;
                }

                .gpv-sync-status-idle {
                    color: #6c757d;
                }

                .gpv-sync-status-syncing {
                    color: #007bff;
                    font-weight: 600;
                }

                .gpv-sync-status-success {
                    color: #28a745;
                    font-weight: 600;
                }

                .gpv-sync-status-error {
                    color: #dc3545;
                    font-weight: 600;
                }

                .gpv-sync-status-conflict {
                    color: #ffc107;
                    font-weight: 600;
                }

                .gpv-sync-error {
                    color: #dc3545;
                }

                .gpv-sync-form {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }

                .gpv-sync-form-group {
                    display: flex;
                    flex-direction: column;
                }

                .gpv-sync-form-group label {
                    font-weight: 600;
                    margin-bottom: 6px;
                    font-size: 14px;
                }

                .gpv-sync-input {
                    padding: 8px 12px;
                    border: 1px solid #ced4da;
                    border-radius: 4px;
                    font-size: 14px;
                    font-family: inherit;
                }

                .gpv-sync-input:disabled {
                    background-color: #e9ecef;
                    cursor: not-allowed;
                }

                .gpv-sync-input:focus {
                    outline: none;
                    border-color: #007bff;
                    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
                }

                .gpv-sync-toggle {
                    display: flex;
                    align-items: center;
                    cursor: pointer;
                    user-select: none;
                }

                .gpv-sync-toggle input[type="checkbox"] {
                    margin-right: 8px;
                    cursor: pointer;
                }

                .gpv-sync-toggle input[type="checkbox"]:disabled {
                    cursor: not-allowed;
                }

                .gpv-sync-help {
                    margin: 6px 0 0 0;
                    font-size: 12px;
                    color: #6c757d;
                }

                .gpv-sync-help a {
                    color: #007bff;
                    text-decoration: none;
                }

                .gpv-sync-help a:hover {
                    text-decoration: underline;
                }

                .gpv-sync-actions {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                    margin-top: 10px;
                }

                .gpv-sync-btn {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 4px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .gpv-sync-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .gpv-sync-btn-primary {
                    background-color: #007bff;
                    color: white;
                }

                .gpv-sync-btn-primary:hover:not(:disabled) {
                    background-color: #0056b3;
                }

                .gpv-sync-btn-secondary {
                    background-color: #6c757d;
                    color: white;
                }

                .gpv-sync-btn-secondary:hover:not(:disabled) {
                    background-color: #545b62;
                }

                .gpv-sync-btn-danger {
                    background-color: #dc3545;
                    color: white;
                }

                .gpv-sync-btn-danger:hover:not(:disabled) {
                    background-color: #c82333;
                }

                /* Conflict Dialog */
                .gpv-conflict-modal {
                    max-width: 800px;
                }

                .gpv-conflict-dialog {
                    padding: 20px;
                }

                .gpv-conflict-dialog h3 {
                    margin: 0 0 15px 0;
                    font-size: 20px;
                    font-weight: 600;
                }

                .gpv-conflict-description {
                    margin: 0 0 20px 0;
                    color: #6c757d;
                }

                .gpv-conflict-comparison {
                    display: grid;
                    grid-template-columns: 1fr auto 1fr;
                    gap: 20px;
                    margin-bottom: 20px;
                    align-items: center;
                }

                .gpv-conflict-option {
                    border: 2px solid #dee2e6;
                    border-radius: 8px;
                    padding: 20px;
                }

                .gpv-conflict-option h4 {
                    margin: 0 0 15px 0;
                    font-size: 16px;
                    font-weight: 600;
                }

                .gpv-conflict-details {
                    list-style: none;
                    padding: 0;
                    margin: 0 0 15px 0;
                }

                .gpv-conflict-details li {
                    padding: 6px 0;
                    font-size: 14px;
                }

                .gpv-conflict-divider {
                    font-weight: 600;
                    color: #6c757d;
                    text-align: center;
                }

                .gpv-conflict-warning {
                    background-color: #fff3cd;
                    border: 1px solid #ffc107;
                    border-radius: 4px;
                    padding: 12px;
                    margin-bottom: 15px;
                }

                .gpv-conflict-warning p {
                    margin: 0;
                    color: #856404;
                    font-size: 14px;
                }

                .gpv-conflict-actions {
                    display: flex;
                    justify-content: center;
                }

                /* Sync Indicator */
                .gpv-sync-indicator {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background-color: white;
                    border: 1px solid #dee2e6;
                    border-radius: 20px;
                    padding: 8px 16px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    transition: all 0.2s;
                    z-index: 9999;
                }

                .gpv-sync-indicator:hover {
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                }

                .gpv-sync-icon {
                    font-size: 16px;
                }

                .gpv-sync-text {
                    font-size: 13px;
                    font-weight: 600;
                }

                .gpv-sync-indicator.gpv-sync-status-syncing .gpv-sync-icon {
                    animation: gpv-spin 1s linear infinite;
                }

                @keyframes gpv-spin {
                    from {
                        transform: rotate(0deg);
                    }
                    to {
                        transform: rotate(360deg);
                    }
                }

                /* Notifications */
                .gpv-notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background-color: white;
                    border-radius: 4px;
                    padding: 12px 16px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    z-index: 10000;
                    opacity: 0;
                    transform: translateY(-20px);
                    transition: all 0.3s;
                    max-width: 400px;
                }

                .gpv-notification-show {
                    opacity: 1;
                    transform: translateY(0);
                }

                .gpv-notification-success {
                    border-left: 4px solid #28a745;
                }

                .gpv-notification-error {
                    border-left: 4px solid #dc3545;
                }

                .gpv-notification-info {
                    border-left: 4px solid #007bff;
                }

                /* Responsive adjustments */
                @media (max-width: 768px) {
                    .gpv-conflict-comparison {
                        grid-template-columns: 1fr;
                    }

                    .gpv-conflict-divider {
                        display: none;
                    }

                    .gpv-sync-indicator {
                        bottom: 10px;
                        right: 10px;
                    }

                    .gpv-sync-text {
                        display: none;
                    }
                }

        `;
        document.head.appendChild(style);
    }

    // ============================================
    // Controller: View Pipeline
    // ============================================

    function buildPortfolioViewModel({
        selection,
        mergedInvestmentDataState,
        projectedInvestmentsState
    }) {
        if (!mergedInvestmentDataState || typeof mergedInvestmentDataState !== 'object') {
            return null;
        }
        if (selection === 'SUMMARY') {
            return {
                kind: 'SUMMARY',
                viewModel: ViewModels.buildSummaryViewModel(mergedInvestmentDataState)
            };
        }
        const bucketObj = mergedInvestmentDataState[selection];
        if (!bucketObj) {
            return null;
        }
        const goalIds = collectGoalIds(bucketObj);
        const goalTargetById = buildGoalTargetById(goalIds, GoalTargetStore.getTarget);
        const goalFixedById = buildGoalFixedById(goalIds, GoalTargetStore.getFixed);
        const viewModel = ViewModels.buildBucketDetailViewModel({
            bucketName: selection,
            bucketMap: mergedInvestmentDataState,
            projectedInvestmentsState,
            goalTargetById,
            goalFixedById
        });
        if (!viewModel) {
            return null;
        }
        return {
            kind: 'BUCKET',
            viewModel
        };
    }

    function renderPortfolioView({
        contentDiv,
        selection,
        mergedInvestmentDataState,
        projectedInvestmentsState,
        cleanupCallbacks,
        onBucketSelect
    }) {
        const view = buildPortfolioViewModel({
            selection,
            mergedInvestmentDataState,
            projectedInvestmentsState
        });
        if (!view) {
            return;
        }
        if (view.kind === 'SUMMARY') {
            renderSummaryView(contentDiv, view.viewModel, onBucketSelect);
            return;
        }
        renderBucketView({
            contentDiv,
            bucketViewModel: view.viewModel,
            mergedInvestmentDataState,
            projectedInvestmentsState,
            cleanupCallbacks
        });
    }

    const ViewPipeline = {
        buildViewModel: buildPortfolioViewModel,
        render: renderPortfolioView
    };

    // ============================================
    // Controller
    // ============================================

    function showOverlay() {
        let old = document.getElementById('gpv-overlay');
        if (old) {
            if (Array.isArray(old.gpvCleanupCallbacks)) {
                old.gpvCleanupCallbacks.forEach(callback => {
                    if (typeof callback === 'function') {
                        callback();
                    }
                });
                old.gpvCleanupCallbacks.length = 0;
            }
            old.remove();
        }

        const mergedInvestmentDataState = buildMergedInvestmentData(
            state.apiData.performance,
            state.apiData.investible,
            state.apiData.summary
        );
        if (!mergedInvestmentDataState) {
            logDebug('[Goal Portfolio Viewer] Not all API data available yet');
            alert('Please wait for portfolio data to load, then try again.');
            return;
        }
        logDebug('[Goal Portfolio Viewer] Data merged successfully');

        const overlay = createElement('div', 'gpv-overlay');
        overlay.id = 'gpv-overlay';

        const container = createElement('div', 'gpv-container');
        const cleanupCallbacks = [];
        container.gpvCleanupCallbacks = cleanupCallbacks;
        overlay.gpvCleanupCallbacks = cleanupCallbacks;

        const header = createElement('div', 'gpv-header');
        const title = createElement('h1', null, 'Portfolio Viewer');
        
        // Add sync status indicator if sync is enabled
        const syncIndicatorContainer = createElement('div', 'gpv-sync-indicator-container');
        if (typeof createSyncIndicatorHTML === 'function') {
            const indicatorHTML = createSyncIndicatorHTML();
            if (indicatorHTML) {
                syncIndicatorContainer.innerHTML = indicatorHTML;
                const indicator = syncIndicatorContainer.querySelector('#gpv-sync-indicator');
                if (indicator) {
                    indicator.addEventListener('click', showSyncSettings);
                }
            }
        }
        
        // Create button container for sync and close buttons
        const buttonContainer = createElement('div', 'gpv-header-buttons');
        
        // Add sync settings button
        const syncBtn = createElement('button', 'gpv-sync-btn', '⚙️ Sync');
        syncBtn.title = 'Configure cross-device sync';
        syncBtn.onclick = () => {
            console.log('[Goal Portfolio Viewer] Sync button clicked');
            console.log('[Goal Portfolio Viewer] typeof showSyncSettings:', typeof showSyncSettings);
            if (typeof showSyncSettings === 'function') {
                console.log('[Goal Portfolio Viewer] Calling showSyncSettings...');
                showSyncSettings();
            } else {
                console.error('[Goal Portfolio Viewer] showSyncSettings is not a function!');
                alert('Sync settings are not available. Please ensure the sync module is loaded.');
            }
        };
        
        const closeBtn = createElement('button', 'gpv-close-btn', '✕');
        function teardownOverlay() {
            if (!overlay.isConnected) {
                return;
            }
            if (!Array.isArray(cleanupCallbacks)) {
                return;
            }
            cleanupCallbacks.forEach(callback => {
                if (typeof callback === 'function') {
                    callback();
                }
            });
            cleanupCallbacks.length = 0;
        }

        function closeOverlay() {
            if (!overlay.isConnected) {
                return;
            }
            teardownOverlay();
            overlay.remove();
        }

        closeBtn.onclick = closeOverlay;
        
        buttonContainer.appendChild(syncBtn);
        buttonContainer.appendChild(closeBtn);
        
        header.appendChild(title);
        header.appendChild(syncIndicatorContainer);
        header.appendChild(buttonContainer);
        container.appendChild(header);

        const controls = createElement('div', 'gpv-controls');
        const selectLabel = createElement('label', 'gpv-select-label', 'View:');
        const select = createElement('select', 'gpv-select');
        const summaryOption = createElement('option', null, '📊 Summary View');
        summaryOption.value = 'SUMMARY';
        select.appendChild(summaryOption);

        Object.keys(mergedInvestmentDataState).sort().forEach(bucket => {
            const opt = createElement('option', null, `📁 ${bucket}`);
            opt.value = bucket;
            select.appendChild(opt);
        });

        controls.appendChild(selectLabel);
        controls.appendChild(select);
        container.appendChild(controls);

        const contentDiv = createElement('div', 'gpv-content');
        container.appendChild(contentDiv);

        function renderView(value) {
            ViewPipeline.render({
                contentDiv,
                selection: value,
                mergedInvestmentDataState,
                projectedInvestmentsState: state.projectedInvestments,
                cleanupCallbacks,
                onBucketSelect
            });
        }

        function onBucketSelect(bucket) {
            if (!bucket || !mergedInvestmentDataState[bucket]) {
                return;
            }
            select.value = bucket;
            renderView(bucket);
        }

        renderView('SUMMARY');

        select.onchange = function() {
            renderView(select.value);
        };

        overlay.appendChild(container);
        
        // Close overlay when clicking outside the container
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                closeOverlay();
            }
        };
        
        document.body.appendChild(overlay);
    }

    // ============================================
    // Controller: Initialization
    // ============================================

    function shouldShowButton() {
        return isDashboardRoute(window.location.href, window.location.origin);
    }
    
    function createButton() {
        if (!state.ui.portfolioButton) {
            state.ui.portfolioButton = createElement('button', 'gpv-trigger-btn', '📊 Portfolio Viewer');
            state.ui.portfolioButton.onclick = showOverlay;
        }
        return state.ui.portfolioButton;
    }
    
    function updateButtonVisibility() {
        if (!document.body) return;
        
        const shouldShow = shouldShowButton();
        const buttonExists = state.ui.portfolioButton && state.ui.portfolioButton.parentNode;
        
        if (shouldShow && !buttonExists) {
            // Show button
            const btn = createButton();
            document.body.appendChild(btn);
            logDebug('[Goal Portfolio Viewer] Button shown on dashboard');
        } else if (!shouldShow && buttonExists) {
            // Hide button
            state.ui.portfolioButton.remove();
            logDebug('[Goal Portfolio Viewer] Button hidden (not on dashboard)');
        }
    }
    
    function handleUrlChange() {
        const currentUrl = window.location.href;
        if (currentUrl !== state.ui.lastUrl) {
            state.ui.lastUrl = currentUrl;
            logDebug('[Goal Portfolio Viewer] URL changed to:', { url: currentUrl });
            updateButtonVisibility();
        }
    }

    function wrapHistoryMethod(methodName, onChange) {
        const original = history[methodName];
        if (typeof original !== 'function') {
            return () => {};
        }
        const wrapped = function(...args) {
            const result = original.apply(this, args);
            try {
                onChange();
            } catch (error) {
                console.warn('[Goal Portfolio Viewer] URL monitoring error:', error);
            }
            return result;
        };
        history[methodName] = wrapped;
        return () => {
            if (history[methodName] === wrapped) {
                history[methodName] = original;
            }
        };
    }
    
    function startUrlMonitoring() {
        if (state.ui.urlMonitorCleanup) {
            state.ui.urlMonitorCleanup();
        } else if (window.__gpvUrlMonitorCleanup) {
            window.__gpvUrlMonitorCleanup();
        }

        state.ui.lastUrl = window.location.href;
        updateButtonVisibility();

        // Debounce function to limit how often handleUrlChange can be called
        const debouncedUrlCheck = () => {
            if (state.ui.urlCheckTimeout) {
                clearTimeout(state.ui.urlCheckTimeout);
            }
            state.ui.urlCheckTimeout = setTimeout(handleUrlChange, 100);
        };

        // Listen to popstate event for browser back/forward navigation
        window.addEventListener('popstate', handleUrlChange);

        const restorePushState = wrapHistoryMethod('pushState', handleUrlChange);
        const restoreReplaceState = wrapHistoryMethod('replaceState', handleUrlChange);

        const intervalId = window.setInterval(handleUrlChange, 500);

        const appRoot = document.querySelector('#root')
            || document.querySelector('#app')
            || document.querySelector('main');
        if (appRoot) {
            // Use MutationObserver as a fallback for navigation patterns not caught by History API
            state.ui.observer = new MutationObserver(debouncedUrlCheck);
            state.ui.observer.observe(appRoot, {
                childList: true,
                subtree: true
            });
        }

        state.ui.urlMonitorCleanup = () => {
            window.removeEventListener('popstate', handleUrlChange);
            restorePushState();
            restoreReplaceState();
            window.clearInterval(intervalId);
            if (state.ui.observer) {
                state.ui.observer.disconnect();
                state.ui.observer = null;
            }
            if (state.ui.urlCheckTimeout) {
                clearTimeout(state.ui.urlCheckTimeout);
                state.ui.urlCheckTimeout = null;
            }
            state.ui.urlMonitorCleanup = null;
            window.__gpvUrlMonitorCleanup = null;
        };
        window.__gpvUrlMonitorCleanup = state.ui.urlMonitorCleanup;

        logDebug('[Goal Portfolio Viewer] URL monitoring started with History API hooks');
    }
    
    function init() {
        // Load stored API data
        loadStoredData(state);

        // Clear expired sort cache on startup
        clearSortCacheIfExpired();

        if (DEBUG_AUTH) {
            getAuthTokenFromGMCookie();
        }
        
        if (document.body) {
            injectStyles();
            startUrlMonitoring();
        } else {
            setTimeout(init, 100);
        }
    }

    // Wait for DOM to be ready
    if (!window.__GPV_DISABLE_AUTO_INIT) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

    } // End of browser-only code

    // ============================================
    // Conditional Export for Testing (Node.js only)
    // ============================================
    // This allows tests to import pure logic functions without duplication.
    // The userscript remains standalone in the browser (no imports/exports).
    // In Node.js (test/CI), these functions are programmatically accessible.
    // Pattern: Keep all logic in ONE place (this file), test the real implementation.
    if (typeof module !== 'undefined' && module.exports) {
        const baseExports = {
            normalizeString,
            indexBy,
            getGoalTargetKey,
            getGoalFixedKey,
            getProjectedInvestmentKey,
            extractBucketName,
            getDisplayGoalType,
            sortGoalTypes,
            formatMoney,
            formatPercent,
            formatGrowthPercentFromEndingBalance,
            getReturnClass,
            calculatePercentOfType,
            calculateGoalDiff,
            isDashboardRoute,
            calculateFixedTargetPercent,
            calculateRemainingTargetPercent,
            isRemainingTargetAboveThreshold,
            buildGoalTypeAllocationModel,
            getProjectedInvestmentValue,
            buildDiffCellData,
            sortGoalsByName,
            resolveGoalTypeActionTarget,
            buildSummaryViewModel,
            buildBucketDetailViewModel,
            collectGoalIds,
            buildGoalTargetById,
            buildGoalFixedById,
            buildMergedInvestmentData,
            getPerformanceCacheKey,
            isCacheFresh,
            isCacheRefreshAllowed,
            formatPercentage,
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
            parseJsonSafely,
            calculateWeightedAverage,
            calculateWeightedWindowReturns,
            summarizePerformanceMetrics,
            buildPerformanceMetricsRows,
            derivePerformanceWindows,
            createSequentialRequestQueue
        };

        module.exports = { ...baseExports, ...testExports };
    }

})();
