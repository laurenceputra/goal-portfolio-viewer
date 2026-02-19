// ==UserScript==
// @name         Goal Portfolio Viewer
// @namespace    https://github.com/laurenceputra/goal-portfolio-viewer
// @version      2.12.1
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
    const COLLAPSE_KEY_SEPARATOR = '|';

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
        performanceCache: 'gpv_performance_',
        collapseState: 'gpv_collapse_'
    };
    const VIEW_STATE_KEYS = {
        bucketMode: 'gpv_bucket_mode'
    };
    const BUCKET_VIEW_MODES = {
        allocation: 'allocation',
        performance: 'performance'
    };
    const COLLAPSE_SECTIONS = {
        performance: 'performance',
        projection: 'projection'
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
        userId: 'sync_user_id',
        deviceId: 'sync_device_id',
        lastSync: 'sync_last_sync',
        lastSyncHash: 'sync_last_hash',
        autoSync: 'sync_auto_sync',
        syncInterval: 'sync_interval_minutes',
        accessToken: 'sync_access_token',
        refreshToken: 'sync_refresh_token',
        accessTokenExpiry: 'sync_access_token_expiry',
        refreshTokenExpiry: 'sync_refresh_token_expiry',
        rememberKey: 'sync_remember_key',
        rememberedMasterKey: 'sync_master_key'
    };

    const SYNC_DEFAULTS = {
        serverUrl: 'https://goal-portfolio-sync.laurenceputra.workers.dev',
        autoSync: true,
        syncInterval: 30 // minutes
    };

    const utils = {
        normalizeServerUrl(serverUrl) {
            if (!serverUrl || typeof serverUrl !== 'string') {
                return '';
            }
            return serverUrl.trim().replace(/\/+$/, '');
        },
        normalizeString(value, fallback = '') {
            if (value === null || value === undefined) {
                return fallback;
            }
            if (typeof value === 'string') {
                const trimmed = value.trim();
                return trimmed ? trimmed : fallback;
            }
            return String(value);
        },
        normalizePerformanceResponse(response) {
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
        },
        indexBy(items, keyFn) {
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
        },
        extractBucketName(goalName) {
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
    };

    const SYNC_STATUS = {
        idle: 'idle',
        syncing: 'syncing',
        success: 'success',
        error: 'error',
        conflict: 'conflict'
    };

    const syncUi = {
        update: null,
        showConflictResolution: null
    };


    // Export surface for tests; populated as helpers become available.
    // When set before load, window.__GPV_DISABLE_AUTO_INIT prevents DOM auto-init (used in tests).

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

    function buildStorageKey(...parts) {
        return parts.map(part => part ?? '').join('');
    }

    const storageKeys = {
        goalTarget(goalId) {
            return buildStorageKey(STORAGE_KEY_PREFIXES.goalTarget, goalId ?? '');
        },
        goalFixed(goalId) {
            return buildStorageKey(STORAGE_KEY_PREFIXES.goalFixed, goalId ?? '');
        },
        performanceCache(goalId) {
            return buildStorageKey(STORAGE_KEY_PREFIXES.performanceCache, goalId ?? '');
        },
        collapseState(bucket, goalType, section) {
            const safeBucket = encodeURIComponent(bucket ?? '');
            const safeGoalType = encodeURIComponent(goalType ?? '');
            const safeSection = encodeURIComponent(section ?? '');
            return buildStorageKey(
                STORAGE_KEY_PREFIXES.collapseState,
                safeBucket,
                COLLAPSE_KEY_SEPARATOR,
                safeGoalType,
                COLLAPSE_KEY_SEPARATOR,
                safeSection
            );
        },
        projectedInvestment(bucket, goalType) {
            const safeBucket = encodeURIComponent(bucket ?? '');
            const safeGoalType = encodeURIComponent(goalType ?? '');
            // Keep separator unencoded to preserve a stable split point in storage keys.
            return buildStorageKey(safeBucket, PROJECTED_KEY_SEPARATOR, safeGoalType);
        }
    };

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


    function buildAllocationDriftModel(goalModels, adjustedTotal) {
        if (!Array.isArray(goalModels) || goalModels.length === 0) {
            return {
                allocationDriftPercent: null,
                allocationDriftDisplay: '-',
                allocationDriftAvailable: false
            };
        }
        const numericAdjustedTotal = toFiniteNumber(adjustedTotal, null);
        if (numericAdjustedTotal === null || numericAdjustedTotal <= 0) {
            return {
                allocationDriftPercent: null,
                allocationDriftDisplay: '-',
                allocationDriftAvailable: false
            };
        }
        const nonFixedGoals = goalModels.filter(goal => goal.isFixed !== true);
        const targetGoals = nonFixedGoals.filter(goal => typeof goal.targetPercent === 'number'
            && Number.isFinite(goal.targetPercent));
        const missingGoals = nonFixedGoals.filter(goal => goal.targetPercent === null || goal.targetPercent === undefined);
        if (targetGoals.length < 1 || missingGoals.length > 1) {
            return {
                allocationDriftPercent: null,
                allocationDriftDisplay: '-',
                allocationDriftAvailable: false
            };
        }
        const remainingTargetPercent = missingGoals.length === 1
            ? calculateRemainingTargetPercent(goalModels.map(goal => goal.targetPercent))
            : null;
        if (missingGoals.length === 1 && typeof remainingTargetPercent === 'number' && remainingTargetPercent < 0) {
            return {
                allocationDriftPercent: null,
                allocationDriftDisplay: '-',
                allocationDriftAvailable: false
            };
        }
        let driftSum = 0;
        nonFixedGoals.forEach(goal => {
            const currentAmount = goal.endingBalanceAmount || 0;
            let targetPercent = goal.targetPercent;
            if ((targetPercent === null || targetPercent === undefined) && missingGoals.length === 1) {
                targetPercent = remainingTargetPercent;
            }
            if (typeof targetPercent !== 'number' || !Number.isFinite(targetPercent)) {
                return;
            }
            const targetAmount = (targetPercent / 100) * numericAdjustedTotal;
            if (targetAmount <= 0) {
                return;
            }
            const driftRatio = Math.abs(targetAmount - currentAmount) / targetAmount;
            if (Number.isFinite(driftRatio)) {
                driftSum += driftRatio;
            }
        });
        return {
            allocationDriftPercent: driftSum,
            allocationDriftDisplay: formatPercent(driftSum, { multiplier: 100, showSign: false }),
            allocationDriftAvailable: true
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
        let goalModels = safeGoals.map(goal => buildGoalModel(
            goal,
            totalTypeAmount,
            adjustedTotal,
            safeTargets,
            safeFixed
        ));
        const remainingTargetPercent = calculateRemainingTargetPercent(
            goalModels.map(goal => goal.targetPercent)
        );
        const nonFixedGoals = goalModels.filter(goal => goal.isFixed !== true);
        const missingTargetGoals = nonFixedGoals.filter(goal => goal.targetPercent === null || goal.targetPercent === undefined);
        const missingGoalId = missingTargetGoals.length === 1 ? missingTargetGoals[0]?.goalId : null;
        const hasOtherTarget = goalModels.some(goal => goal?.goalId !== missingGoalId
            && typeof goal.targetPercent === 'number'
            && Number.isFinite(goal.targetPercent));
        const shouldAssignRemainingTarget = missingTargetGoals.length === 1
            && hasOtherTarget
            && remainingTargetPercent >= 0;
        const adjustedRemainingTargetPercent = shouldAssignRemainingTarget ? 0 : remainingTargetPercent;
        if (shouldAssignRemainingTarget) {
            goalModels = goalModels.map(goal => {
                if (!goal?.goalId || goal.goalId !== missingGoalId) {
                    return goal;
                }
                const diffInfo = calculateGoalDiff(
                    goal.endingBalanceAmount || 0,
                    remainingTargetPercent,
                    adjustedTotal
                );
                return {
                    ...goal,
                    diffAmount: diffInfo.diffAmount,
                    diffClass: diffInfo.diffClass
                };
            });
        }
        const allocationDriftModel = buildAllocationDriftModel(goalModels, adjustedTotal);
        return {
            goalModels,
            remainingTargetPercent: adjustedRemainingTargetPercent,
            allocationDriftPercent: allocationDriftModel.allocationDriftPercent,
            allocationDriftDisplay: allocationDriftModel.allocationDriftDisplay,
            allocationDriftAvailable: allocationDriftModel.allocationDriftAvailable
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
        const key = storageKeys.projectedInvestment(bucket, goalType);
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

    function buildSummaryViewModel(bucketMap, projectedInvestmentsState, goalTargetById, goalFixedById) {
        if (!bucketMap || typeof bucketMap !== 'object') {
            return { buckets: [], showAllocationDriftHint: false };
        }
        const projectedInvestments = projectedInvestmentsState || {};
        const goalTargets = goalTargetById || {};
        const goalFixed = goalFixedById || {};
        let showAllocationDriftHint = false;
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
                            const projectedAmount = getProjectedInvestmentValue(
                                projectedInvestments,
                                bucketName,
                                goalType
                            );
                            const adjustedTotal = (group.endingBalanceAmount || 0) + projectedAmount;
                            const goals = Array.isArray(group.goals) ? group.goals : [];
                            const allocationModel = computeGoalTypeViewState(
                                goals,
                                group.endingBalanceAmount || 0,
                                adjustedTotal,
                                goalTargets,
                                goalFixed
                            );
                            if (allocationModel.allocationDriftAvailable === false) {
                                showAllocationDriftHint = true;
                            }
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
                                returnClass: getReturnClass(typeReturn),
                                allocationDriftDisplay: allocationModel.allocationDriftDisplay,
                                allocationDriftAvailable: allocationModel.allocationDriftAvailable
                            };
                        })
                        .filter(Boolean)
                };
            })
            .filter(Boolean);
        return { buckets, showAllocationDriftHint };
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
        let showAllocationDriftHint = false;

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
                    if (allocationModel.allocationDriftAvailable === false) {
                        showAllocationDriftHint = true;
                    }
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
                        allocationDriftDisplay: allocationModel.allocationDriftDisplay,
                        allocationDriftAvailable: allocationModel.allocationDriftAvailable,
                        goalModelsById: allocationModel.goalModelsById,
                        goals: allocationModel.goalModels.map(goal => {
                            const windowReturns = getGoalWindowReturns(goal.goalId);
                            const windowReturnDisplays = buildWindowReturnDisplays(windowReturns);
                            return {
                                ...goal,
                                endingBalanceDisplay: formatMoney(goal.endingBalanceAmount),
                                percentOfTypeDisplay: formatPercent(goal.percentOfType),
                                targetDisplay: goal.targetPercent !== null ? goal.targetPercent.toFixed(2) : '',
                                diffDisplay: goal.diffAmount === null ? '-' : formatMoney(goal.diffAmount),
                                returnDisplay: formatMoney(goal.returnValue),
                                returnPercentDisplay: formatPercent(goal.returnPercent, { multiplier: 100, showSign: false }),
                                returnClass: getReturnClass(goal.returnValue),
                                windowReturns,
                                windowReturnDisplays
                            };
                        })
                    };
                })
                .filter(Boolean),
            showAllocationDriftHint
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

    function collectAllGoalIds(bucketMap) {
        if (!bucketMap || typeof bucketMap !== 'object') {
            return [];
        }
        return Object.keys(bucketMap).reduce((goalIds, bucketName) => {
            const bucketObj = bucketMap[bucketName];
            return goalIds.concat(collectGoalIds(bucketObj));
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

        const investibleMap = utils.indexBy(investibleData, item => item?.goalId);
        const summaryMap = utils.indexBy(summaryData, item => item?.goalId);

        const bucketMap = {};

        performanceData.forEach(perf => {
            const invest = investibleMap[perf.goalId] || {};
            const summary = summaryMap[perf.goalId] || {};
            const goalName = utils.normalizeString(invest.goalName || summary.goalName || '', '');
            // Extract bucket name using "Bucket Name - Goal Description" convention
            const goalBucket = utils.extractBucketName(goalName);
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
                goalType: utils.normalizeString(
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
    const PERFORMANCE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

    function getGoalWindowReturns(goalId) {
        if (!goalId) {
            return {};
        }
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
            return {};
        }
        if (!isCacheFresh(parsed.fetchedAt, PERFORMANCE_CACHE_MAX_AGE_MS)) {
            Storage.remove(key, 'Error deleting stale performance cache');
            return {};
        }
        const cachedResponse = parsed.response ? utils.normalizePerformanceResponse(parsed.response) : null;
        if (!cachedResponse) {
            return {};
        }
        return mapReturnsTableToWindowReturns(cachedResponse.returnsTable);
    }

    function buildWindowReturnDisplays(windowReturns) {
        const displays = {};
        Object.values(PERFORMANCE_WINDOWS).forEach(window => {
            displays[window.key] = formatPercent(windowReturns?.[window.key], { multiplier: 100, showSign: true });
        });
        return displays;
    }

    function getPerformanceCacheKey(goalId) {
        return storageKeys.performanceCache(goalId);
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
            ? performanceResponses.map(utils.normalizePerformanceResponse)
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
            ? performanceResponses.map(utils.normalizePerformanceResponse)
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
            const validator = typeof validateFn === 'function' ? validateFn : () => true;
            if (!validator(parsed)) {
                Storage.remove(key, context);
                return null;
            }
            return parsed;
        },
        writeJson(key, value, context) {
            return Storage.set(key, JSON.stringify(value), context);
        }
    };

    function normalizeBucketViewMode(value) {
        return value === BUCKET_VIEW_MODES.performance
            ? BUCKET_VIEW_MODES.performance
            : BUCKET_VIEW_MODES.allocation;
    }

    function normalizeBooleanPreference(value, fallbackValue) {
        if (value === true || value === 'true' || value === 1 || value === '1') {
            return true;
        }
        if (value === false || value === 'false' || value === 0 || value === '0') {
            return false;
        }
        return fallbackValue;
    }

    function getBucketViewModePreference() {
        const rawValue = Storage.get(
            VIEW_STATE_KEYS.bucketMode,
            BUCKET_VIEW_MODES.allocation,
            'Error reading bucket mode'
        );
        const normalized = normalizeBucketViewMode(rawValue);
        if (rawValue !== normalized) {
            Storage.set(VIEW_STATE_KEYS.bucketMode, normalized, 'Error writing bucket mode');
        }
        return normalized;
    }

    function setBucketViewModePreference(mode) {
        const normalized = normalizeBucketViewMode(mode);
        Storage.set(VIEW_STATE_KEYS.bucketMode, normalized, 'Error writing bucket mode');
        return normalized;
    }

    function getCollapseState(bucket, goalType, section) {
        const key = storageKeys.collapseState(bucket, goalType, section);
        const rawValue = Storage.get(key, null, 'Error reading collapse state');
        const normalized = normalizeBooleanPreference(rawValue, true);
        if (rawValue !== null && rawValue !== undefined && normalized !== rawValue) {
            Storage.set(key, normalized ? 'true' : 'false', 'Error writing collapse state');
        }
        return normalized;
    }

    function setCollapseState(bucket, goalType, section, isCollapsed) {
        const key = storageKeys.collapseState(bucket, goalType, section);
        Storage.set(key, isCollapsed ? 'true' : 'false', 'Error writing collapse state');
    }

    function bytesToBase64(bytes) {
        if (!bytes || !(bytes instanceof Uint8Array)) {
            return '';
        }
        return btoa(String.fromCharCode(...bytes));
    }

    function base64ToBytes(base64) {
        if (!base64 || typeof base64 !== 'string') {
            return null;
        }
        try {
            return new Uint8Array(atob(base64).split('').map(char => char.charCodeAt(0)));
        } catch (_error) {
            return null;
        }
    }

    function getRememberedMasterKey() {
        const remember = Storage.get(SYNC_STORAGE_KEYS.rememberKey, false);
        if (!remember) {
            return null;
        }
        const stored = Storage.get(SYNC_STORAGE_KEYS.rememberedMasterKey, null);
        const bytes = base64ToBytes(stored);
        return bytes && bytes.length ? bytes : null;
    }

    function setRememberedMasterKey(masterKey, remember) {
        if (!remember) {
            Storage.set(SYNC_STORAGE_KEYS.rememberKey, false);
            Storage.remove(SYNC_STORAGE_KEYS.rememberedMasterKey);
            return;
        }
        if (!masterKey || !(masterKey instanceof Uint8Array) || !masterKey.length) {
            return;
        }
        Storage.set(SYNC_STORAGE_KEYS.rememberKey, true);
        Storage.set(SYNC_STORAGE_KEYS.rememberedMasterKey, bytesToBase64(masterKey));
    }

    function clearRememberedMasterKey() {
        Storage.set(SYNC_STORAGE_KEYS.rememberKey, false);
        Storage.remove(SYNC_STORAGE_KEYS.rememberedMasterKey);
    }

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

    function getCryptoApi() {
        if (typeof globalThis !== 'undefined' && globalThis.crypto) {
            return globalThis.crypto;
        }
        if (typeof window !== 'undefined' && window.crypto) {
            return window.crypto;
        }
        return null;
    }

    /**
     * Check if Web Crypto API is available
     */
    function isSupported() {
        const cryptoApi = getCryptoApi();
        return Boolean(
            cryptoApi &&
            cryptoApi.subtle &&
            typeof cryptoApi.getRandomValues === 'function'
        );
    }

    /**
     * Generate a cryptographically secure random buffer
     */
    function generateRandomBuffer(length) {
        const cryptoApi = getCryptoApi();
        if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
            throw new Error('Web Crypto API not supported');
        }
        return cryptoApi.getRandomValues(new Uint8Array(length));
    }

    /**
     * Generate a UUID v4 using cryptographically secure randomness
     */
    function generateUUID() {
        const cryptoApi = getCryptoApi();
        // Use crypto.randomUUID() if available (modern browsers)
        if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
            return cryptoApi.randomUUID();
        }

        if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
            throw new Error('Web Crypto API not supported');
        }

        // Fallback: use crypto.getRandomValues() for secure random bytes
        const buffer = new Uint8Array(16);
        cryptoApi.getRandomValues(buffer);

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
        if (typeof password !== 'string') {
            throw new Error('Invalid password');
        }

        const cryptoApi = getCryptoApi();
        const encoder = new TextEncoder();
        const passwordKey = await cryptoApi.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits']
        );

        // Derive 32 bytes (256 bits) of key material
        const masterKeyBits = await cryptoApi.subtle.deriveBits(
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
        const cryptoApi = getCryptoApi();
        const masterKeyObj = await cryptoApi.subtle.importKey(
            'raw',
            masterKey,
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        return cryptoApi.subtle.deriveKey(
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

    function assertValidMasterKey(masterKey) {
        if (!masterKey || !(masterKey instanceof Uint8Array) || !masterKey.length) {
            throw new Error('Invalid encryption key');
        }
        return masterKey;
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
            const masterKey = await deriveMasterKey(password);
            return encryptWithMasterKey(plaintext, masterKey);
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Encryption failed:', error);
            throw new Error('Encryption failed');
        }
    }

    async function encryptWithMasterKey(plaintext, masterKey) {
        if (!isSupported()) {
            throw new Error('Web Crypto API not supported');
        }
        try {
            const cryptoApi = getCryptoApi();
            const encoder = new TextEncoder();
            const salt = generateRandomBuffer(SALT_LENGTH);
            const iv = generateRandomBuffer(IV_LENGTH);
            const normalizedKey = assertValidMasterKey(masterKey);
            const key = await deriveKey(normalizedKey, salt);

            const ciphertext = await cryptoApi.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encoder.encode(plaintext)
            );

            const combined = new Uint8Array(
                salt.length + iv.length + ciphertext.byteLength
            );
            combined.set(salt, 0);
            combined.set(iv, salt.length);
            combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

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
            const masterKey = await deriveMasterKey(password);
            return decryptWithMasterKey(encryptedBase64, masterKey);
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Decryption failed:', error);
            throw new Error('Decryption failed - check password');
        }
    }

    async function decryptWithMasterKey(encryptedBase64, masterKey) {
        if (!isSupported()) {
            throw new Error('Web Crypto API not supported');
        }
        try {
            const cryptoApi = getCryptoApi();
            const combined = new Uint8Array(
                atob(encryptedBase64).split('').map(c => c.charCodeAt(0))
            );

            const salt = combined.slice(0, SALT_LENGTH);
            const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
            const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

            const normalizedKey = assertValidMasterKey(masterKey);
            const key = await deriveKey(normalizedKey, salt);

            const plaintext = await cryptoApi.subtle.decrypt(
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
        const cryptoApi = getCryptoApi();
        const encoder = new TextEncoder();
        const buffer = await cryptoApi.subtle.digest('SHA-256', encoder.encode(data));
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

        const cryptoApi = getCryptoApi();
        const encoder = new TextEncoder();
        const data = encoder.encode(password + '|' + userId);
        const hashBuffer = await cryptoApi.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    return {
        isSupported,
        generateUUID,
        deriveMasterKey,
        encryptWithMasterKey,
        decryptWithMasterKey,
        encrypt,
        decrypt,
        hash,
        hashPasswordForAuth
    };
})();

    // ============================================
    // Sync Manager (Cross-Device Sync)
    // ============================================

    const SyncManager = (() => {
    const TOKEN_EXPIRY_SKEW_MS = 60 * 1000;
    let syncStatus = SYNC_STATUS.idle;
    let lastError = null;
    let lastErrorMeta = null;
    const SYNC_ON_CHANGE_BUFFER_MS = 15000;
    let autoSyncTimer = null;
    let syncOnChangeTimer = null;
    let syncOnChangeRetryTimer = null;
    let sessionMasterKey = getRememberedMasterKey();

    function getStoredServerUrl(fallback = '') {
        const stored = Storage.get(SYNC_STORAGE_KEYS.serverUrl, fallback);
        return utils.normalizeServerUrl(stored || '');
    }

    function decodeBase64Url(value) {
        if (!value || typeof value !== 'string') {
            return null;
        }
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const paddingNeeded = (4 - (normalized.length % 4)) % 4;
        const padded = normalized + '='.repeat(paddingNeeded);
        try {
            return atob(padded);
        } catch (_error) {
            return null;
        }
    }

    function parseJwtPayload(token) {
        if (!token || typeof token !== 'string') {
            return null;
        }
        const parts = token.split('.');
        if (parts.length !== 3) {
            return null;
        }
        const decoded = decodeBase64Url(parts[1]);
        if (!decoded) {
            return null;
        }
        return parseJsonSafely(decoded);
    }

    function getStoredTokenExpiry(storageKey, token) {
        const storedExpiry = Storage.get(storageKey, null);
        if (typeof storedExpiry === 'number' && Number.isFinite(storedExpiry)) {
            return storedExpiry;
        }
        const payload = parseJwtPayload(token);
        if (payload && typeof payload.exp === 'number') {
            return payload.exp * 1000;
        }
        return null;
    }

    function isTokenValid(token, expiryKey) {
        if (!token) {
            return false;
        }
        const expiry = getStoredTokenExpiry(expiryKey, token);
        if (!expiry) {
            return false;
        }
        return Date.now() < expiry - TOKEN_EXPIRY_SKEW_MS;
    }

    function hasValidRefreshToken() {
        const refreshToken = Storage.get(SYNC_STORAGE_KEYS.refreshToken, null);
        return isTokenValid(refreshToken, SYNC_STORAGE_KEYS.refreshTokenExpiry);
    }

    function setSessionMasterKey(masterKey) {
        if (!masterKey || !(masterKey instanceof Uint8Array) || !masterKey.length) {
            sessionMasterKey = null;
            return;
        }
        sessionMasterKey = masterKey;
    }

    function requireSessionKey() {
        if (!sessionMasterKey) {
            throw new Error('Encryption key not set for this session. Enter your password and save settings to unlock sync.');
        }
        return sessionMasterKey;
    }

    async function hashConfigData(config) {
        if (!config || typeof config !== 'object') {
            return null;
        }
        const { timestamp: _timestamp, ...rest } = config;
        return SyncEncryption.hash(JSON.stringify(rest));
    }

    function storeTokens(tokens) {
        if (!tokens || typeof tokens !== 'object') {
            return;
        }
        if (tokens.accessToken) {
            Storage.set(SYNC_STORAGE_KEYS.accessToken, tokens.accessToken);
        }
        if (tokens.refreshToken) {
            Storage.set(SYNC_STORAGE_KEYS.refreshToken, tokens.refreshToken);
        }
        if (tokens.accessExpiresAt) {
            Storage.set(SYNC_STORAGE_KEYS.accessTokenExpiry, tokens.accessExpiresAt);
        }
        if (tokens.refreshExpiresAt) {
            Storage.set(SYNC_STORAGE_KEYS.refreshTokenExpiry, tokens.refreshExpiresAt);
        }
    }

    function clearTokens() {
        Storage.remove(SYNC_STORAGE_KEYS.accessToken);
        Storage.remove(SYNC_STORAGE_KEYS.refreshToken);
        Storage.remove(SYNC_STORAGE_KEYS.accessTokenExpiry);
        Storage.remove(SYNC_STORAGE_KEYS.refreshTokenExpiry);
    }

    async function refreshAccessToken() {
        const serverUrl = getStoredServerUrl(SYNC_DEFAULTS.serverUrl);
        const refreshToken = Storage.get(SYNC_STORAGE_KEYS.refreshToken, null);
        if (!refreshToken) {
            throw new Error('Not logged in. Please login again.');
        }

        const response = await fetch(`${serverUrl}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${refreshToken}`
            }
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            clearTokens();
            throw new Error(result.message || 'Session expired. Please login again.');
        }

        storeTokens(result.tokens);
        return result.tokens?.accessToken || null;
    }

    async function getAccessToken() {
        const accessToken = Storage.get(SYNC_STORAGE_KEYS.accessToken, null);
        if (isTokenValid(accessToken, SYNC_STORAGE_KEYS.accessTokenExpiry)) {
            return accessToken;
        }
        return refreshAccessToken();
    }

    if (isEnabled() && hasValidRefreshToken() && sessionMasterKey) {
        startAutoSync();
    }

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
        const serverUrl = getStoredServerUrl('');
        const userId = Storage.get(SYNC_STORAGE_KEYS.userId, null);
        return Boolean(serverUrl && userId && hasValidRefreshToken());
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

        Object.entries(config.goalFixed).forEach(([goalId, isFixed]) => {
            if (isFixed === true) {
                delete config.goalTargets[goalId];
            }
        });

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
            const fixedMap = config.goalFixed && typeof config.goalFixed === 'object'
                ? config.goalFixed
                : {};
            for (const [goalId, value] of Object.entries(config.goalTargets)) {
                if (fixedMap[goalId] === true) {
                    continue;
                }
                const key = storageKeys.goalTarget(goalId);
                Storage.set(key, value);
            }
        }

        // Apply goal fixed states
        if (config.goalFixed && typeof config.goalFixed === 'object') {
            for (const [goalId, value] of Object.entries(config.goalFixed)) {
                const key = storageKeys.goalFixed(goalId);
                Storage.set(key, value === true);
            }
        }

        logDebug('[Goal Portfolio Viewer] Applied sync config data', {
            targets: Object.keys(config.goalTargets || {}).length,
            fixed: Object.keys(config.goalFixed || {}).length
        });
    }


    function categorizeSyncError(error) {
        const message = String(error?.message || 'Unknown error');
        const code = String(error?.code || '').toUpperCase();

        if (code === 'RATE_LIMIT_EXCEEDED') {
            return 'rate_limit';
        }
        if (code === 'SYNC_IN_PROGRESS') {
            return 'in_progress';
        }
        if (code.includes('AUTH') || /unauthorized|forbidden|token|login/i.test(message)) {
            return 'auth';
        }
        if (code.includes('TIMEOUT') || /timeout/i.test(message)) {
            return 'timeout';
        }
        if (code.includes('CRYPTO') || /decrypt|encrypt|encryption key|password/i.test(message)) {
            return 'crypto';
        }
        if (/network|failed to fetch|offline|cors/i.test(message)) {
            return 'network';
        }
        if (code.includes('PARSE') || /json|parse|unexpected response/i.test(message)) {
            return 'parse';
        }
        if (error && typeof error.status === 'number' && error.status >= 500) {
            return 'server';
        }
        return 'server';
    }

    function getSyncErrorGuidance(error) {
        const category = categorizeSyncError(error);
        const retryAfter = Number(error?.retryAfterSeconds);
        if (category === 'auth') {
            return {
                category,
                userMessage: 'Authentication failed. Please log in again to refresh your session.',
                primaryAction: 'Login again'
            };
        }
        if (category === 'network') {
            return {
                category,
                userMessage: 'Network issue detected. Check connection and retry sync.',
                primaryAction: 'Retry sync'
            };
        }
        if (category === 'rate_limit') {
            return {
                category,
                userMessage: retryAfter > 0
                    ? `Rate limit reached. Retry in about ${Math.ceil(retryAfter / 60)} minute(s).`
                    : 'Rate limit reached. Please wait before syncing again.',
                primaryAction: 'Retry later'
            };
        }
        if (category === 'in_progress') {
            return {
                category,
                userMessage: 'Sync already in progress. Please wait for it to finish before retrying.',
                primaryAction: 'Wait for sync'
            };
        }
        if (category === 'crypto') {
            return {
                category,
                userMessage: 'Sync is locked. Enter your password and save settings to unlock encryption key.',
                primaryAction: 'Unlock sync'
            };
        }
        if (category === 'parse') {
            return {
                category,
                userMessage: 'Unexpected server response. Retry and check sync server health if it persists.',
                primaryAction: 'Retry sync'
            };
        }
        return {
            category,
            userMessage: 'Sync server issue detected. Please retry in a moment.',
            primaryAction: 'Retry sync'
        };
    }

    function createApiError(response, errorData, fallbackMessage) {
        const message = (errorData && (errorData.message || errorData.error)) || fallbackMessage;
        const error = new Error(message);
        if (errorData && errorData.error) {
            error.code = errorData.error;
        }
        if (response && response.status === 429) {
            error.code = 'RATE_LIMIT_EXCEEDED';
        }
        const retryAfterHeader = response?.headers?.get('Retry-After');
        const retryAfterSeconds = Number(errorData?.retryAfter || retryAfterHeader);
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
            error.retryAfterSeconds = retryAfterSeconds;
        }
        return error;
    }

    /**
     * Upload config to server
     */
    async function uploadConfig(config) {
        const serverUrl = getStoredServerUrl(SYNC_DEFAULTS.serverUrl);
        const userId = Storage.get(SYNC_STORAGE_KEYS.userId, null);

        if (!userId) {
            throw new Error('Sync not configured');
        }

        const masterKey = requireSessionKey();

        // Encrypt config using master key
        const plaintext = JSON.stringify(config);
        const encryptedData = await SyncEncryption.encryptWithMasterKey(plaintext, masterKey);

        const accessToken = await getAccessToken();

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
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw createApiError(response, errorData, `Upload failed: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Download config from server
     */
    async function downloadConfig() {
        const serverUrl = getStoredServerUrl(SYNC_DEFAULTS.serverUrl);
        const userId = Storage.get(SYNC_STORAGE_KEYS.userId, null);

        if (!userId) {
            throw new Error('Sync not configured');
        }

        const accessToken = await getAccessToken();

        // Download from server
        const response = await fetch(`${serverUrl}/sync/${userId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.status === 404) {
            // No data on server yet
            return null;
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw createApiError(response, errorData, `Download failed: ${response.status}`);
        }

        const serverData = await response.json();

        // Server returns: { success: true, data: { encryptedData, deviceId, timestamp, version } }
        const { data } = serverData || {};

        if (!data || !data.encryptedData) {
            throw new Error('Invalid server response: missing encrypted data');
        }

        // Decrypt config using master key
        const masterKey = requireSessionKey();
        const plaintext = await SyncEncryption.decryptWithMasterKey(data.encryptedData, masterKey);
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
    async function detectConflict(localConfig, serverData, localHash = null, remoteHash = null) {
        if (!serverData) {
            return null; // No server data, no conflict
        }

        const localTimestamp = localConfig.timestamp;
        const serverTimestamp = serverData.metadata.timestamp;
        const localDeviceId = getDeviceId();
        const serverDeviceId = serverData.metadata.deviceId;
        const resolvedLocalHash = localHash || await hashConfigData(localConfig);
        const resolvedRemoteHash = remoteHash || await hashConfigData(serverData.config);

        // Same content should not be treated as conflict, regardless of device.
        if (resolvedLocalHash && resolvedRemoteHash && resolvedLocalHash === resolvedRemoteHash) {
            return null;
        }

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
                remoteDeviceId: serverDeviceId,
                localHash: resolvedLocalHash,
                remoteHash: resolvedRemoteHash
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

        if (syncStatus === SYNC_STATUS.syncing) {
            const error = new Error('Sync already in progress');
            error.code = 'SYNC_IN_PROGRESS';
            throw error;
        }

        requireSessionKey();

        syncStatus = SYNC_STATUS.syncing;
        if (typeof syncUi.update === 'function') {
            syncUi.update();
        }

        try {
            const localConfig = collectConfigData();
            const localHash = await hashConfigData(localConfig);
            const lastSyncHash = Storage.get(SYNC_STORAGE_KEYS.lastSyncHash, null);
            const lastSyncTimestamp = Storage.get(SYNC_STORAGE_KEYS.lastSync, null);
            if (localHash && lastSyncHash === localHash && typeof lastSyncTimestamp === 'number') {
                localConfig.timestamp = lastSyncTimestamp;
            }
            
            if (direction === 'upload') {
                await uploadConfig(localConfig);
                Storage.set(SYNC_STORAGE_KEYS.lastSync, localConfig.timestamp);
                Storage.set(SYNC_STORAGE_KEYS.lastSyncHash, localHash);

                syncStatus = SYNC_STATUS.success;
                lastError = null;
                lastErrorMeta = null;
                logDebug('[Goal Portfolio Viewer] Sync upload successful');
            } else if (direction === 'download') {
                const serverData = await downloadConfig();
                if (!serverData) {
                    syncStatus = SYNC_STATUS.success;
                    lastError = null;
                    lastErrorMeta = null;
                    logDebug('[Goal Portfolio Viewer] No server data to download');
                } else {
                    applyConfigData(serverData.config);
                    Storage.set(SYNC_STORAGE_KEYS.lastSync, serverData.metadata.timestamp);
                    const serverHash = await hashConfigData(serverData.config);
                    Storage.set(SYNC_STORAGE_KEYS.lastSyncHash, serverHash);

                    syncStatus = SYNC_STATUS.success;
                    lastError = null;
                    lastErrorMeta = null;
                    logDebug('[Goal Portfolio Viewer] Sync download successful');
                }
            } else {
                const serverData = await downloadConfig();

                if (!serverData) {
                    await uploadConfig(localConfig);
                    Storage.set(SYNC_STORAGE_KEYS.lastSync, localConfig.timestamp);
                    Storage.set(SYNC_STORAGE_KEYS.lastSyncHash, localHash);

                    syncStatus = SYNC_STATUS.success;
                    lastError = null;
                    lastErrorMeta = null;
                    logDebug('[Goal Portfolio Viewer] No server data, uploaded local config');
                } else {
                    const serverHash = await hashConfigData(serverData.config);

                    if (localHash && serverHash && localHash === serverHash) {
                        Storage.set(SYNC_STORAGE_KEYS.lastSync, Math.max(localConfig.timestamp, serverData.metadata.timestamp));
                        Storage.set(SYNC_STORAGE_KEYS.lastSyncHash, localHash);

                        syncStatus = SYNC_STATUS.success;
                        lastError = null;
                        lastErrorMeta = null;
                        logDebug('[Goal Portfolio Viewer] Local and server content identical, sync already up to date');
                    } else {
                        const conflict = await detectConflict(localConfig, serverData, localHash, serverHash);

                        if (conflict && !force) {
                            syncStatus = SYNC_STATUS.conflict;
                            if (typeof syncUi.showConflictResolution === 'function') {
                                syncUi.showConflictResolution(conflict);
                            }
                            return { status: 'conflict', conflict };
                        }

                        if (localConfig.timestamp > serverData.metadata.timestamp) {
                            await uploadConfig(localConfig);
                            Storage.set(SYNC_STORAGE_KEYS.lastSync, localConfig.timestamp);
                            Storage.set(SYNC_STORAGE_KEYS.lastSyncHash, localHash);

                            syncStatus = SYNC_STATUS.success;
                            lastError = null;
                            lastErrorMeta = null;
                            logDebug('[Goal Portfolio Viewer] Local config newer, uploaded to server');
                        } else if (localConfig.timestamp < serverData.metadata.timestamp) {
                            applyConfigData(serverData.config);
                            Storage.set(SYNC_STORAGE_KEYS.lastSync, serverData.metadata.timestamp);
                            Storage.set(SYNC_STORAGE_KEYS.lastSyncHash, serverHash);

                            syncStatus = SYNC_STATUS.success;
                            lastError = null;
                            lastErrorMeta = null;
                            logDebug('[Goal Portfolio Viewer] Server config newer, applied locally');
                        } else {
                            syncStatus = SYNC_STATUS.success;
                            lastError = null;
                            lastErrorMeta = null;
                            logDebug('[Goal Portfolio Viewer] Sync already up to date');
                        }
                    }
                }
            }

            if (typeof syncUi.update === 'function') {
                syncUi.update();
            }
            return { status: 'success' };
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Sync failed:', error);
            syncStatus = SYNC_STATUS.error;
            lastError = error.message;
            const guidance = getSyncErrorGuidance(error);
            lastErrorMeta = {
                category: guidance.category,
                userMessage: guidance.userMessage,
                primaryAction: guidance.primaryAction,
                retryAfterSeconds: Number(error?.retryAfterSeconds) || null,
                lastAttemptAt: Date.now()
            };
            if (typeof syncUi.update === 'function') {
                syncUi.update();
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
            if (typeof syncUi.update === 'function') {
                syncUi.update();
            }

            if (resolution === 'local') {
                // Upload local, overwrite server
                await uploadConfig(conflict.local);
                Storage.set(SYNC_STORAGE_KEYS.lastSync, conflict.localTimestamp);
                const hash = await hashConfigData(conflict.local);
                Storage.set(SYNC_STORAGE_KEYS.lastSyncHash, hash);
            } else if (resolution === 'remote') {
                // Apply remote, keep server
                applyConfigData(conflict.remote);
                Storage.set(SYNC_STORAGE_KEYS.lastSync, conflict.remoteTimestamp);
                const hash = await hashConfigData(conflict.remote);
                Storage.set(SYNC_STORAGE_KEYS.lastSyncHash, hash);
            } else {
                throw new Error('Invalid resolution');
            }

            syncStatus = SYNC_STATUS.success;
            lastError = null;
            lastErrorMeta = null;
            if (typeof syncUi.update === 'function') {
                syncUi.update();
            }
            
            // Refresh the portfolio view
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('gpv-show-portfolio'));
            }
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Conflict resolution failed:', error);
            syncStatus = SYNC_STATUS.error;
            lastError = error.message;
            const guidance = getSyncErrorGuidance(error);
            lastErrorMeta = {
                category: guidance.category,
                userMessage: guidance.userMessage,
                primaryAction: guidance.primaryAction,
                retryAfterSeconds: Number(error?.retryAfterSeconds) || null,
                lastAttemptAt: Date.now()
            };
            if (typeof syncUi.update === 'function') {
                syncUi.update();
            }
            throw error;
        }
    }

    /**
     * Schedule a buffered sync when local config changes
     */
    function scheduleSyncOnChange(reason = 'change') {
        if (!isEnabled() || !isConfigured()) {
            return;
        }

        const autoSync = Storage.get(SYNC_STORAGE_KEYS.autoSync, SYNC_DEFAULTS.autoSync);
        if (!autoSync) {
            return;
        }

        if (!sessionMasterKey) {
            return;
        }

        if (syncOnChangeRetryTimer) {
            clearTimeout(syncOnChangeRetryTimer);
            syncOnChangeRetryTimer = null;
        }

        if (syncOnChangeTimer) {
            clearTimeout(syncOnChangeTimer);
        }

        const retryDelayMs = 3000;
        const attemptSync = async () => {
            syncOnChangeTimer = null;
            if (syncStatus === SYNC_STATUS.syncing) {
                if (!syncOnChangeRetryTimer) {
                    syncOnChangeRetryTimer = setTimeout(async () => {
                        syncOnChangeRetryTimer = null;
                        await attemptSync();
                    }, retryDelayMs);
                }
                return;
            }

            try {
                await performSync({ direction: 'both' });
            } catch (error) {
                console.error('[Goal Portfolio Viewer] Sync-on-change failed:', error);
            }
        };

        syncOnChangeTimer = setTimeout(attemptSync, SYNC_ON_CHANGE_BUFFER_MS);

        logDebug(`[Goal Portfolio Viewer] Scheduled sync (${reason}) in ${Math.round(SYNC_ON_CHANGE_BUFFER_MS / 1000)}s`);
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

        if (!sessionMasterKey) {
            logDebug('[Goal Portfolio Viewer] Auto-sync requires an unlocked encryption key');
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
        if (syncOnChangeTimer) {
            clearTimeout(syncOnChangeTimer);
            syncOnChangeTimer = null;
        }
        if (syncOnChangeRetryTimer) {
            clearTimeout(syncOnChangeRetryTimer);
            syncOnChangeRetryTimer = null;
        }
    }

    /**
     * Get current sync status
     */
    function getStatus() {
        return {
            status: syncStatus,
            lastError,
            lastErrorMeta,
            lastSync: Storage.get(SYNC_STORAGE_KEYS.lastSync, null),
            isEnabled: isEnabled(),
            isConfigured: isConfigured(),
            cryptoSupported: SyncEncryption.isSupported(),
            hasSessionKey: Boolean(sessionMasterKey),
            hasValidRefreshToken: hasValidRefreshToken()
        };
    }

    /**
     * Enable sync
     */
    async function enable(config) {
        const normalizedServerUrl = utils.normalizeServerUrl(config?.serverUrl);
        if (!config || !normalizedServerUrl || !config.userId) {
            throw new Error('Invalid sync configuration: serverUrl and userId required');
        }

        if (config.masterKey) {
            setSessionMasterKey(config.masterKey);
        } else if (config.password) {
            const derivedKey = await SyncEncryption.deriveMasterKey(config.password);
            setSessionMasterKey(derivedKey);
        } else if (!sessionMasterKey) {
            const storedKey = getRememberedMasterKey();
            if (storedKey) {
                setSessionMasterKey(storedKey);
            }
        }

        if (!sessionMasterKey) {
            throw new Error('Encryption key required to unlock sync for this session');
        }

        const previousUserId = Storage.get(SYNC_STORAGE_KEYS.userId, null);
        const previousServerUrl = Storage.get(SYNC_STORAGE_KEYS.serverUrl, null);
        if ((previousUserId && previousUserId !== config.userId) ||
            (previousServerUrl && previousServerUrl !== normalizedServerUrl)) {
            clearTokens();
        }

        Storage.set(SYNC_STORAGE_KEYS.enabled, true);
        Storage.set(SYNC_STORAGE_KEYS.serverUrl, normalizedServerUrl);
        Storage.set(SYNC_STORAGE_KEYS.userId, config.userId);
        
        if (config.autoSync !== undefined) {
            Storage.set(SYNC_STORAGE_KEYS.autoSync, config.autoSync);
        } else {
            Storage.set(SYNC_STORAGE_KEYS.autoSync, SYNC_DEFAULTS.autoSync);
        }
        if (config.syncInterval !== undefined) {
            Storage.set(SYNC_STORAGE_KEYS.syncInterval, config.syncInterval);
        }

        if (config.rememberKey === true) {
            setRememberedMasterKey(sessionMasterKey, true);
        } else if (config.rememberKey === false) {
            clearRememberedMasterKey();
        }

        startAutoSync();
        logDebug('[Goal Portfolio Viewer] Sync enabled');
    }

    /**
     * Register a new user account
     */
    async function register(serverUrl, userId, password) {
        const normalizedServerUrl = utils.normalizeServerUrl(serverUrl);
        if (!normalizedServerUrl || !userId || !password) {
            throw new Error('serverUrl, userId, and password are required');
        }

        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters');
        }

        // Hash password for authentication
        const passwordHash = await SyncEncryption.hashPasswordForAuth(password, userId);

        // Call register endpoint
        const response = await fetch(`${normalizedServerUrl}/auth/register`, {
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

        Storage.set(SYNC_STORAGE_KEYS.serverUrl, normalizedServerUrl);
        Storage.set(SYNC_STORAGE_KEYS.userId, userId);
        const masterKey = await SyncEncryption.deriveMasterKey(password);
        setSessionMasterKey(masterKey);

        return result;
    }

    /**
     * Login (verify credentials)
     */
    async function login(serverUrl, userId, password) {
        const normalizedServerUrl = utils.normalizeServerUrl(serverUrl);
        if (!normalizedServerUrl || !userId || !password) {
            throw new Error('serverUrl, userId, and password are required');
        }

        // Hash password for authentication
        const passwordHash = await SyncEncryption.hashPasswordForAuth(password, userId);

        // Call login endpoint
        const response = await fetch(`${normalizedServerUrl}/auth/login`, {
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

        if (!result.tokens || !result.tokens.refreshToken) {
            throw new Error('Login did not return valid session tokens');
        }

        const masterKey = await SyncEncryption.deriveMasterKey(password);
        setSessionMasterKey(masterKey);

        storeTokens(result.tokens);
        Storage.set(SYNC_STORAGE_KEYS.serverUrl, normalizedServerUrl);
        Storage.set(SYNC_STORAGE_KEYS.userId, userId);

        if (isEnabled()) {
            startAutoSync();
        }

        return result;
    }

    /**
     * Disable sync
     */
    function disable() {
        stopAutoSync();
        Storage.set(SYNC_STORAGE_KEYS.enabled, false);
        setSessionMasterKey(null);
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
        clearTokens();
        setSessionMasterKey(null);
        clearRememberedMasterKey();
        
        syncStatus = SYNC_STATUS.idle;
        lastError = null;
        lastErrorMeta = null;
        
        logDebug('[Goal Portfolio Viewer] Sync configuration cleared');
    }

    const testingHooks = typeof module !== 'undefined' && module.exports
        ? {
            parseJwtPayload,
            getStoredTokenExpiry,
            isTokenValid,
            refreshAccessToken,
            getAccessToken,
            storeTokens,
            clearTokens
        }
        : null;

    return {
        isEnabled,
        isConfigured,
        getStatus,
        performSync,
        resolveConflict,
        enable,
        disable,
        clearConfig,
        scheduleSyncOnChange,
        startAutoSync,
        stopAutoSync,
        collectConfigData,
        applyConfigData,
        register,
        login,
        ...(testingHooks ? { __test: testingHooks } : {})
    };
})();

function buildConflictDiffItemsForMap(conflict, nameMapOverride = {}) {
    if (!conflict || !conflict.local || !conflict.remote) {
        return [];
    }
    const localTargets = conflict.local.goalTargets || {};
    const remoteTargets = conflict.remote.goalTargets || {};
    const localFixed = conflict.local.goalFixed || {};
    const remoteFixed = conflict.remote.goalFixed || {};
    const goalIds = new Set([
        ...Object.keys(localTargets),
        ...Object.keys(remoteTargets),
        ...Object.keys(localFixed),
        ...Object.keys(remoteFixed)
    ]);
    if (goalIds.size === 0) {
        return [];
    }

    const nameMap = nameMapOverride && typeof nameMapOverride === 'object'
        ? nameMapOverride
        : {};
    return Array.from(goalIds)
        .map(goalId => {
            const localTarget = localTargets[goalId];
            const remoteTarget = remoteTargets[goalId];
            const localFixedValue = localFixed[goalId] === true;
            const remoteFixedValue = remoteFixed[goalId] === true;
            const shouldIgnoreTarget = localFixedValue || remoteFixedValue;
            const targetChanged = !shouldIgnoreTarget && localTarget !== remoteTarget;
            const fixedChanged = localFixedValue !== remoteFixedValue;
            if (!targetChanged && !fixedChanged) {
                return null;
            }
            const goalName = nameMap[goalId] || `Goal ${goalId.slice(0, 8)}...`;
            return {
                goalId,
                goalName,
                localTargetDisplay: formatSyncTarget(localTarget),
                remoteTargetDisplay: formatSyncTarget(remoteTarget),
                localFixedDisplay: formatSyncFixed(localFixedValue),
                remoteFixedDisplay: formatSyncFixed(remoteFixedValue)
            };
        })
        .filter(Boolean)
        .sort((left, right) => left.goalName.localeCompare(right.goalName));
}

function formatSyncTarget(target) {
    return typeof target === 'number' ? target.toFixed(2) + '%' : '-';
}

function formatSyncFixed(isFixed) {
    return isFixed ? 'Yes' : 'No';
}

function countSyncedTargets(targets = {}, fixed = {}) {
    return Object.keys(targets || {}).filter(goalId => fixed?.[goalId] !== true).length;
}

let GoalTargetStore;

    // ============================================
    // Browser-Only Code (Skip in Node.js/Testing Environment)
    // ============================================
    // Everything below this point requires browser APIs (window, document, etc.)
    // and should not execute when running tests in Node.js.
    if (typeof window !== 'undefined' && window.document) {

    // ============================================
    // Adapters/State
    // ============================================
    const PERFORMANCE_ENDPOINT = 'https://bff.prod.silver.endowus.com/v1/performance';
    const REQUEST_DELAY_MS = 500;
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


    function validateEndpointPayload(endpointKey, data) {
        if (!data || typeof data !== 'object') {
            return { valid: false, reason: 'Expected object payload' };
        }
        if (!Array.isArray(data)) {
            // Some tests/mocks use object payloads; accept and defer to endpoint handlers.
            return { valid: true, reason: null };
        }
        if (endpointKey === 'performance') {
            const isValid = data.every(item => item && typeof item === 'object' && item.goalId);
            return { valid: isValid, reason: isValid ? null : 'Missing goalId in performance payload' };
        }
        if (endpointKey === 'investible') {
            const isValid = data.every(item => item && typeof item === 'object' && item.goalId);
            return { valid: isValid, reason: isValid ? null : 'Missing goalId in investible payload' };
        }
        if (endpointKey === 'summary') {
            const isValid = data.every(item => item && typeof item === 'object' && item.goalId);
            return { valid: isValid, reason: isValid ? null : 'Missing goalId in summary payload' };
        }
        return { valid: true, reason: null };
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
            const validation = validateEndpointPayload(endpointKey, data);
            if (!validation.valid) {
                console.warn(`[Goal Portfolio Viewer] Ignoring ${endpointKey} payload: ${validation.reason}`);
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

    GoalTargetStore = {
        getTarget(goalId) {
            const key = storageKeys.goalTarget(goalId);
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
            const key = storageKeys.goalTarget(goalId);
            const didSet = Storage.set(key, validPercentage, 'Error saving goal target percentage');
            if (!didSet) {
                return null;
            }
            logDebug(`[Goal Portfolio Viewer] Saved goal target percentage for ${goalId}: ${validPercentage}%`);
            if (typeof SyncManager?.scheduleSyncOnChange === 'function') {
                SyncManager.scheduleSyncOnChange('target-update');
            }
            return validPercentage;
        },
        clearTarget(goalId) {
            const key = storageKeys.goalTarget(goalId);
            Storage.remove(key, 'Error deleting goal target percentage');
            logDebug(`[Goal Portfolio Viewer] Deleted goal target percentage for ${goalId}`);
            if (typeof SyncManager?.scheduleSyncOnChange === 'function') {
                SyncManager.scheduleSyncOnChange('target-clear');
            }
        },
        getFixed(goalId) {
            const key = storageKeys.goalFixed(goalId);
            return Storage.get(key, false, 'Error loading goal fixed state') === true;
        },
        setFixed(goalId, isFixed) {
            const key = storageKeys.goalFixed(goalId);
            Storage.set(key, isFixed === true, 'Error saving goal fixed state');
            logDebug(`[Goal Portfolio Viewer] Saved goal fixed state for ${goalId}: ${isFixed === true}`);
            if (typeof SyncManager?.scheduleSyncOnChange === 'function') {
                SyncManager.scheduleSyncOnChange('fixed-update');
            }
        },
        clearFixed(goalId) {
            const key = storageKeys.goalFixed(goalId);
            Storage.remove(key, 'Error deleting goal fixed state');
            logDebug(`[Goal Portfolio Viewer] Deleted goal fixed state for ${goalId}`);
            if (typeof SyncManager?.scheduleSyncOnChange === 'function') {
                SyncManager.scheduleSyncOnChange('fixed-clear');
            }
        }
    };
    
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
        const key = storageKeys.projectedInvestment(bucket, goalType);
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
        const key = storageKeys.projectedInvestment(bucket, goalType);
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

    function writePerformanceCache(goalId, responseData) {
        const key = getPerformanceCacheKey(goalId);
        const payload = {
            fetchedAt: Date.now(),
            response: responseData
        };
        Storage.writeJson(key, payload, 'Error writing performance cache');
    }

    function getCachedPerformanceResponse(goalId, ignoreFreshness = false) {
        const cached = readPerformanceCache(goalId, ignoreFreshness);
        if (!cached) {
            return null;
        }
        return cached.response ? utils.normalizePerformanceResponse(cached.response) : null;
    }

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

    async function ensurePerformanceData(goalIds, options = {}) {
        const results = {};
        const idsToFetch = [];
        const onFreshData = typeof options.onFreshData === 'function'
            ? options.onFreshData
            : null;
        const existingGoalIds = new Set(Object.keys(state.performance.goalData || {}));
        const cacheOnly = options.cacheOnly === true;

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
            } else if (!cacheOnly) {
                idsToFetch.push(goalId);
            }
        });

        if (!idsToFetch.length) {
            return results;
        }

        const queueResults = await state.performance.requestQueue(idsToFetch, async goalId => {
            try {
                const data = await fetchPerformanceForGoal(goalId);
                const normalized = utils.normalizePerformanceResponse(data);
                writePerformanceCache(goalId, normalized);
                state.performance.goalData[goalId] = normalized;
                return normalized;
            } catch (error) {
                console.warn('[Goal Portfolio Viewer] Performance fetch failed:', error);
                return null;
            }
        });

        const fetchedGoalIds = [];
        queueResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                results[result.item] = result.value;
                if (!existingGoalIds.has(result.item)) {
                    fetchedGoalIds.push(result.item);
                }
            }
        });

        if (onFreshData && fetchedGoalIds.length) {
            try {
                onFreshData({
                    fetchedGoalIds,
                    results
                });
            } catch (error) {
                console.warn('[Goal Portfolio Viewer] Performance data callback failed:', error);
            }
        }

        return results;
    }

    function buildGoalTypePerformanceSummary(performanceResponses) {
        // Guard against empty/null input - Staff Engineer requirement
        if (!Array.isArray(performanceResponses) || performanceResponses.length === 0) {
            return null;
        }
        // Filter nulls defensively (should already be filtered, but double-check)
        const responses = performanceResponses
            .filter(r => r && typeof r === 'object')
            .map(utils.normalizePerformanceResponse);
        
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

    function renderPerformanceChart(chartWrapper, series, dimensionsOverride) {
        if (!chartWrapper) {
            return;
        }
        const dimensions = dimensionsOverride || getChartDimensions(chartWrapper);
        const svg = createLineChartSvg(series, dimensions.width, dimensions.height);
        chartWrapper.innerHTML = '';
        chartWrapper.appendChild(svg);
    }

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

    if (typeof globalThis !== 'undefined') {
        globalThis.__gpvChartHelpers = {
            getChartHeightForWidth,
            getChartDimensions,
            createLineChartSvg,
            buildPerformanceWindowGrid
        };
    }

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

    function renderGoalTypePerformance(typeSection, goalIds, cleanupCallbacks, options = {}) {
        const performanceContainer = createElement('div', 'gpv-performance-container');
        const loading = createElement('div', 'gpv-performance-loading', 'Loading performance data...');
        performanceContainer.setAttribute('aria-busy', 'true');
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
            performanceContainer.setAttribute('aria-busy', 'false');

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
            ensurePerformanceData(goalIds, {
                onFreshData: options.onFreshData,
                cacheOnly: options.cacheOnly === true
            }).then(performanceMap => {
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
                    performanceContainer.setAttribute('aria-busy', 'false');
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

    const FOCUSABLE_SELECTOR = [
        'a[href]',
        'button',
        'input',
        'select',
        'textarea',
        '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    function getFocusableElements(container) {
        if (!container || typeof container.querySelectorAll !== 'function') {
            return [];
        }
        return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
            .filter(element => !element.disabled && element.getAttribute('aria-hidden') !== 'true');
    }

    function applyAriaHiddenToSiblings(overlay) {
        if (!overlay || !overlay.parentElement || !document.body) {
            return () => {};
        }
        const siblings = Array.from(document.body.children).filter(child => child !== overlay);
        const previousValues = new Map();
        siblings.forEach(element => {
            previousValues.set(element, element.getAttribute('aria-hidden'));
            element.setAttribute('aria-hidden', 'true');
        });
        return () => {
            siblings.forEach(element => {
                const previous = previousValues.get(element);
                if (previous === null) {
                    element.removeAttribute('aria-hidden');
                } else if (previous !== undefined) {
                    element.setAttribute('aria-hidden', previous);
                }
            });
        };
    }

    function setupModalAccessibility({
        overlay,
        container,
        titleId,
        onClose,
        initialFocus
    }) {
        if (!overlay || !container) {
            return () => {};
        }
        const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        container.setAttribute('role', 'dialog');
        container.setAttribute('aria-modal', 'true');
        if (titleId) {
            container.setAttribute('aria-labelledby', titleId);
        }
        if (!container.hasAttribute('tabindex')) {
            container.setAttribute('tabindex', '-1');
        }
        const restoreAria = applyAriaHiddenToSiblings(overlay);
        const focusTarget = initialFocus || getFocusableElements(container)[0] || container;

        const handleKeydown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                if (typeof onClose === 'function') {
                    onClose();
                }
                return;
            }
            if (event.key !== 'Tab') {
                return;
            }
            const focusables = getFocusableElements(container);
            if (!focusables.length) {
                event.preventDefault();
                container.focus();
                return;
            }
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
                return;
            }
            if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        const handleFocusIn = event => {
            if (!container.contains(event.target)) {
                const focusables = getFocusableElements(container);
                (focusables[0] || container).focus();
            }
        };

        overlay.addEventListener('keydown', handleKeydown);
        document.addEventListener('focusin', handleFocusIn);

        const focusLater = () => {
            if (focusTarget && typeof focusTarget.focus === 'function') {
                focusTarget.focus();
            }
        };
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(focusLater);
        } else {
            setTimeout(focusLater, 0);
        }

        return () => {
            overlay.removeEventListener('keydown', handleKeydown);
            document.removeEventListener('focusin', handleFocusIn);
            restoreAria();
            if (previousActive && typeof previousActive.focus === 'function') {
                previousActive.focus();
            }
        };
    }

    function wireSyncIndicator(indicator, onActivate) {
        if (!indicator) {
            return;
        }
        indicator.setAttribute('role', 'button');
        indicator.setAttribute('tabindex', '0');
        if (typeof onActivate === 'function') {
            indicator.addEventListener('click', onActivate);
            indicator.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onActivate();
                }
            });
        }
    }

    function buildSafeCollapseId(prefix, ...parts) {
        const normalizedParts = parts.map(part => (
            utils.normalizeString(part, '')
                .replace(/[^a-zA-Z0-9-_]/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '')
        ));
        return [prefix, ...normalizedParts.filter(Boolean)].join('-');
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

        if (summaryViewModel.showAllocationDriftHint) {
            const hint = createElement('div', 'gpv-allocation-drift-hint', 'Set goal targets to see drift.');
            contentDiv.appendChild(hint);
        }

        const summaryContainer = createElement('div', 'gpv-summary-container');

        summaryViewModel.buckets.forEach(bucketModel => {
            const bucketCard = createElement('div', 'gpv-bucket-card');
            bucketCard.dataset.bucket = bucketModel.bucketName;
            bucketCard.setAttribute('role', 'button');
            bucketCard.setAttribute('tabindex', '0');
            bucketCard.setAttribute('aria-label', `Open ${bucketModel.bucketName} bucket`);

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
                appendLabeledValue(
                    typeRow,
                    'gpv-goal-type-stat',
                    'Allocation Drift:',
                    goalTypeModel.allocationDriftDisplay
                );
                bucketCard.appendChild(typeRow);
            });

            summaryContainer.appendChild(bucketCard);
        });

        if (typeof onBucketSelect === 'function') {
            const handleBucketAction = event => {
                const targetElement = event.target && typeof event.target.closest === 'function'
                    ? event.target
                    : event.target?.parentElement;
                const targetCard = targetElement && typeof targetElement.closest === 'function'
                    ? targetElement.closest('.gpv-bucket-card')
                    : null;
                if (!targetCard || !summaryContainer.contains(targetCard)) {
                    return;
                }
                const bucketName = targetCard.dataset.bucket;
                if (!bucketName) {
                    return;
                }
                if (event.type === 'click') {
                    onBucketSelect(bucketName);
                    return;
                }
                if (event.type === 'keydown' && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    onBucketSelect(bucketName);
                }
            };
            summaryContainer.addEventListener('click', handleBucketAction);
            summaryContainer.addEventListener('keydown', handleBucketAction);
        }

        contentDiv.appendChild(summaryContainer);
    }






    function renderBucketView({
        contentDiv,
        bucketViewModel,
        mergedInvestmentDataState,
        projectedInvestmentsState,
        cleanupCallbacks,
        onPerformanceDataLoaded,
        useCacheOnly
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

        if (bucketViewModel.showAllocationDriftHint) {
            const hint = createElement('div', 'gpv-allocation-drift-hint', 'Set goal targets to see drift.');
            contentDiv.appendChild(hint);
        }

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
            appendLabeledValue(typeSummary, null, 'Allocation Drift:', goalTypeModel.allocationDriftDisplay);
            typeHeader.appendChild(typeTitle);
            typeHeader.appendChild(typeSummary);

            const typeActions = createElement('div', 'gpv-type-actions');
            typeHeader.appendChild(typeActions);
            
            typeSection.appendChild(typeHeader);

            const goalTypeId = goalTypeModel.goalType;
            const performanceSectionId = buildSafeCollapseId(
                'gpv-collapse',
                bucketViewModel.bucketName,
                goalTypeId,
                'performance'
            );
            const projectionSectionId = buildSafeCollapseId(
                'gpv-collapse',
                bucketViewModel.bucketName,
                goalTypeId,
                'projection'
            );
            let performanceCollapsed = getCollapseState(
                bucketViewModel.bucketName,
                goalTypeId,
                COLLAPSE_SECTIONS.performance
            );
            let projectionCollapsed = getCollapseState(
                bucketViewModel.bucketName,
                goalTypeId,
                COLLAPSE_SECTIONS.projection
            );

            const performancePanel = createElement('div', 'gpv-collapsible gpv-performance-panel');
            performancePanel.id = performanceSectionId;
            performancePanel.dataset.loaded = 'false';
            performancePanel.classList.toggle('gpv-collapsible--collapsed', performanceCollapsed);
            performancePanel.dataset.goalType = goalTypeId;

            const projectionPanel = createElement('div', 'gpv-collapsible gpv-projection-panel');
            projectionPanel.id = projectionSectionId;
            projectionPanel.classList.toggle('gpv-collapsible--collapsed', projectionCollapsed);
            projectionPanel.dataset.goalType = goalTypeId;

            const performanceToggle = createElement('button', 'gpv-section-toggle gpv-section-toggle--performance');
            performanceToggle.type = 'button';
            performanceToggle.setAttribute('aria-controls', performanceSectionId);
            performanceToggle.setAttribute('aria-expanded', String(!performanceCollapsed));
            const performanceIcon = createElement('span', 'gpv-section-toggle-icon', performanceCollapsed ? '▸' : '▾');
            performanceToggle.appendChild(performanceIcon);
            performanceToggle.appendChild(createElement('span', null, 'Performance'));

            const projectionToggle = createElement('button', 'gpv-section-toggle gpv-section-toggle--projection');
            projectionToggle.type = 'button';
            projectionToggle.setAttribute('aria-controls', projectionSectionId);
            projectionToggle.setAttribute('aria-expanded', String(!projectionCollapsed));
            const projectionIcon = createElement('span', 'gpv-section-toggle-icon', projectionCollapsed ? '▸' : '▾');
            projectionToggle.appendChild(projectionIcon);
            projectionToggle.appendChild(createElement('span', null, 'Projection'));

            typeActions.appendChild(performanceToggle);
            typeActions.appendChild(projectionToggle);

            function loadPerformancePanel() {
                if (performancePanel.dataset.loaded === 'true') {
                    return;
                }
                try {
                    renderGoalTypePerformance(
                        performancePanel,
                        goalTypeModel.goals.map(goal => goal.goalId).filter(Boolean),
                        cleanupCallbacks,
                        {
                            onFreshData: onPerformanceDataLoaded,
                            cacheOnly: useCacheOnly
                        }
                    );
                    performancePanel.dataset.loaded = 'true';
                } catch (error) {
                    performancePanel.textContent = 'Performance data unavailable.';
                    performancePanel.dataset.loaded = 'false';
                    console.error('[Goal Portfolio Viewer] Failed to load performance panel:', error);
                }
            }

            performanceToggle.addEventListener('click', () => {
                const shouldPersist = performanceToggle.dataset.autoExpand !== 'true';
                if (performanceToggle.dataset.autoExpand) {
                    delete performanceToggle.dataset.autoExpand;
                }
                performanceCollapsed = !performanceCollapsed;
                if (shouldPersist) {
                    setCollapseState(
                        bucketViewModel.bucketName,
                        goalTypeId,
                        COLLAPSE_SECTIONS.performance,
                        performanceCollapsed
                    );
                }
                performancePanel.classList.toggle('gpv-collapsible--collapsed', performanceCollapsed);
                performanceToggle.setAttribute('aria-expanded', String(!performanceCollapsed));
                performanceIcon.textContent = performanceCollapsed ? '▸' : '▾';
                if (!performanceCollapsed) {
                    loadPerformancePanel();
                }
            });

            projectionToggle.addEventListener('click', () => {
                projectionCollapsed = !projectionCollapsed;
                setCollapseState(bucketViewModel.bucketName, goalTypeId, COLLAPSE_SECTIONS.projection, projectionCollapsed);
                projectionPanel.classList.toggle('gpv-collapsible--collapsed', projectionCollapsed);
                projectionToggle.setAttribute('aria-expanded', String(!projectionCollapsed));
                projectionIcon.textContent = projectionCollapsed ? '▸' : '▾';
            });

            if (!performanceCollapsed) {
                loadPerformancePanel();
            }

            typeSection.appendChild(performancePanel);

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
            
            projectionPanel.appendChild(projectedInputContainer);
            typeSection.appendChild(projectionPanel);
            
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
            headerRow.appendChild(createElement('th', 'gpv-fixed-header gpv-column-fixed', 'Fixed'));

            const targetHeader = createElement('th', 'gpv-target-header gpv-column-target');
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

            headerRow.appendChild(createElement('th', 'gpv-column-diff', 'Diff'));
            headerRow.appendChild(createElement('th', 'gpv-column-return', 'Cumulative Return'));
            headerRow.appendChild(createElement('th', 'gpv-column-return-percent', 'Return %'));

            thead.appendChild(headerRow);
            table.appendChild(thead);

            const metricsColSpan = headerRow.children.length;
            const tbody = createElement('tbody');

            const goalModelsById = goalTypeModel.goalModelsById || {};

            goalTypeModel.goals.forEach(goalModel => {
                const tr = createElement('tr', 'gpv-goal-row');
                tr.appendChild(createElement('td', 'gpv-goal-name', goalModel.goalName));
                tr.appendChild(createElement('td', null, goalModel.endingBalanceDisplay));
                tr.appendChild(createElement('td', null, goalModel.percentOfTypeDisplay));

                const fixedCell = createElement('td', 'gpv-fixed-cell gpv-column-fixed');
                const fixedLabel = createElement('label', 'gpv-fixed-toggle');
                const fixedInput = createElement('input', CLASS_NAMES.fixedToggleInput);
                fixedInput.type = 'checkbox';
                fixedInput.dataset.goalId = goalModel.goalId;
                fixedInput.checked = goalModel.isFixed === true;
                fixedLabel.appendChild(fixedInput);
                fixedLabel.appendChild(createElement('span', 'gpv-toggle-slider'));
                fixedCell.appendChild(fixedLabel);
                tr.appendChild(fixedCell);

                const targetCell = createElement('td', 'gpv-target-cell gpv-column-target');
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
                    ? `${CLASS_NAMES.diffCell} gpv-column-diff ${goalModel.diffClass}`
                    : `${CLASS_NAMES.diffCell} gpv-column-diff`;
                tr.appendChild(createElement('td', diffClassName, goalModel.diffDisplay));
                const returnClassName = goalModel.returnClass
                    ? `${goalModel.returnClass} gpv-column-return`
                    : 'gpv-column-return';
                const returnPercentClassName = goalModel.returnClass
                    ? `${goalModel.returnClass} gpv-column-return-percent`
                    : 'gpv-column-return-percent';
                tr.appendChild(createElement('td', returnClassName, goalModel.returnDisplay));
                tr.appendChild(createElement('td', returnPercentClassName, goalModel.returnPercentDisplay));

                tbody.appendChild(tr);

                const metricsRow = createElement('tr', 'gpv-goal-metrics-row');
                const metricsCell = createElement('td', 'gpv-goal-metrics-cell');
                metricsCell.colSpan = metricsColSpan;
                const metricsContainer = createElement('div', 'gpv-goal-metrics');
                const windowReturnDisplays = goalModel.windowReturnDisplays || {};
                const windowReturns = goalModel.windowReturns || {};

                Object.values(PERFORMANCE_WINDOWS).forEach(window => {
                    const item = createElement('div', 'gpv-goal-metrics-item');
                    const label = createElement('span', 'gpv-goal-metrics-label', `${window.label} TWR:`);
                    const displayValue = windowReturnDisplays[window.key] ?? '-';
                    const value = createElement('span', 'gpv-goal-metrics-value', displayValue);
                    const numericValue = windowReturns[window.key];
                    if (typeof numericValue === 'number' && Number.isFinite(numericValue)) {
                        value.classList.add(numericValue >= 0 ? 'positive' : 'negative');
                    }
                    item.appendChild(label);
                    item.appendChild(value);
                    metricsContainer.appendChild(item);
                });

                metricsCell.appendChild(metricsContainer);
                metricsRow.appendChild(metricsCell);
                tbody.appendChild(metricsRow);
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
                const changeTarget = event.target;
                const resolved = resolveGoalTypeActionTarget(changeTarget);
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
        notification.setAttribute('role', type === 'error' ? 'alert' : 'status');
        notification.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
        notification.setAttribute('aria-atomic', 'true');
        
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

    let syncToastTimer = null;

    function getSyncToastContainer() {
        const overlay = document.getElementById('gpv-overlay');
        if (!overlay) {
            return null;
        }
        const container = overlay.querySelector('.gpv-container') || overlay;
        let toast = container.querySelector('#gpv-sync-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'gpv-sync-toast';
            toast.className = 'gpv-sync-toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            toast.setAttribute('aria-atomic', 'true');
            container.appendChild(toast);
        }
        return toast;
    }

    function setSyncMessage(message, type) {
        const container = getSyncToastContainer();
        if (!container || !message) {
            showNotification(message, type);
            return;
        }
        const role = type === 'error' ? 'alert' : 'status';
        const live = type === 'error' ? 'assertive' : 'polite';
        container.setAttribute('role', role);
        container.setAttribute('aria-live', live);
        container.textContent = message;
        container.classList.remove('gpv-sync-toast-success', 'gpv-sync-toast-error', 'gpv-sync-toast-info');
        container.classList.add(`gpv-sync-toast-${type}`, 'gpv-sync-toast-visible');
        if (syncToastTimer) {
            clearTimeout(syncToastTimer);
        }
        syncToastTimer = setTimeout(() => {
            clearSyncMessage();
        }, 10000);
    }

    function clearSyncMessage() {
        const container = getSyncToastContainer();
        if (!container) {
            return;
        }
        container.textContent = '';
        container.classList.remove('gpv-sync-toast-success', 'gpv-sync-toast-error', 'gpv-sync-toast-info', 'gpv-sync-toast-visible');
        if (syncToastTimer) {
            clearTimeout(syncToastTimer);
            syncToastTimer = null;
        }
    }

    function showSuccessMessage(message) {
        setSyncMessage(message, 'success');
    }

    function showErrorMessage(message) {
        setSyncMessage(message, 'error');
    }

    function showInfoMessage(message) {
        setSyncMessage(message, 'info');
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

function getSyncServerUrlFromInput() {
    const input = document.getElementById('gpv-sync-server-url');
    if (!input) {
        return '';
    }
    return input.value.trim();
}

function resolveSyncServerUrl(preferInput = true) {
    const inputValue = preferInput ? getSyncServerUrlFromInput() : '';
    const fallback = Storage.get(SYNC_STORAGE_KEYS.serverUrl, SYNC_DEFAULTS.serverUrl);
    return utils.normalizeServerUrl(inputValue || fallback || '');
}

function getSyncFormState() {
    const enabled = document.getElementById('gpv-sync-enabled')?.checked === true;
    const rawServerUrl = getSyncServerUrlFromInput();
    const serverUrl = utils.normalizeServerUrl(rawServerUrl);
    const userId = document.getElementById('gpv-sync-user-id')?.value.trim() || '';
    const password = document.getElementById('gpv-sync-password')?.value || '';
    const rememberKey = document.getElementById('gpv-sync-remember-key')?.checked === true;
    const autoSync = document.getElementById('gpv-sync-auto')?.checked === true;
    const intervalValue = document.getElementById('gpv-sync-interval')?.value;
    const syncInterval = Number.parseInt(intervalValue, 10) || SYNC_DEFAULTS.syncInterval;
    return {
        enabled,
        rawServerUrl,
        serverUrl,
        userId,
        password,
        rememberKey,
        autoSync,
        syncInterval
    };
}

function showSyncMessageByType(message, type = 'success') {
    if (!message) {
        return;
    }
    if (type === 'error') {
        showErrorMessage(message);
        return;
    }
    if (type === 'info') {
        showInfoMessage(message);
        return;
    }
    showSuccessMessage(message);
}

function scrollOverlayContentToTop(sourceNode = null) {
    const fallbackOverlay = document.getElementById('gpv-overlay');
    const overlay = sourceNode && typeof sourceNode.closest === 'function'
        ? sourceNode.closest('#gpv-overlay') || fallbackOverlay
        : fallbackOverlay;
    if (!overlay) {
        return;
    }
    const content = overlay.querySelector('.gpv-content');
    if (!content) {
        return;
    }
    const enforceTop = () => {
        if (content.scrollTop !== 0) {
            content.scrollTop = 0;
        }
    };
    if (typeof content.scrollTo === 'function') {
        content.scrollTo({ top: 0, behavior: 'smooth' });
        if (content.gpvEnforceTopTimer) {
            clearTimeout(content.gpvEnforceTopTimer);
        }
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                requestAnimationFrame(enforceTop);
            });
        } else {
            setTimeout(enforceTop, 32);
        }
        content.gpvEnforceTopTimer = setTimeout(enforceTop, 220);
        return;
    }
    content.scrollTop = 0;
}

function rerenderSyncSettingsPanel({ message, type = 'success', delay = 300 } = {}) {
    const settingsPanel = document.querySelector('.gpv-sync-settings');
    if (!settingsPanel) {
        return;
    }
    const refresh = () => {
        settingsPanel.outerHTML = createSyncSettingsHTML();
        setupSyncSettingsListeners();
        showSyncMessageByType(message, type);
        scrollOverlayContentToTop();
    };
    if (delay > 0) {
        setTimeout(refresh, delay);
    } else {
        refresh();
    }
}

function withButtonState(button, busyText, action) {
    if (!button || typeof action !== 'function') {
        return;
    }
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
    let actionPromise;
    try {
        actionPromise = action();
    } catch (error) {
        actionPromise = Promise.reject(error);
    }
    return Promise.resolve(actionPromise).finally(() => {
        if (button.isConnected) {
            button.disabled = false;
            button.textContent = originalText;
        }
    });
}

function createSyncSettingsHTML() {
    const syncStatus = SyncManager.getStatus();
    const isEnabled = syncStatus.isEnabled;
    const isConfigured = syncStatus.isConfigured;
    const cryptoSupported = syncStatus.cryptoSupported;
    const hasSessionKey = syncStatus.hasSessionKey;
    const hasValidRefreshToken = syncStatus.hasValidRefreshToken;
    
    const serverUrl = utils.normalizeServerUrl(Storage.get(SYNC_STORAGE_KEYS.serverUrl, SYNC_DEFAULTS.serverUrl)) || SYNC_DEFAULTS.serverUrl;
    const userId = Storage.get(SYNC_STORAGE_KEYS.userId, '');
    const rememberKey = Storage.get(SYNC_STORAGE_KEYS.rememberKey, false);
    const password = '';
    const autoSync = Storage.get(SYNC_STORAGE_KEYS.autoSync, SYNC_DEFAULTS.autoSync);
    const syncInterval = Storage.get(SYNC_STORAGE_KEYS.syncInterval, SYNC_DEFAULTS.syncInterval);
    const isValidPassword = Boolean(password && password.length >= 8);
    const shouldShowRememberKey = isEnabled
        && cryptoSupported
        && (hasSessionKey || isValidPassword || rememberKey);
    
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
                    <span class="gpv-sync-label">Auth:</span>
                    <span class="gpv-sync-value">${hasValidRefreshToken ? 'Connected (refresh active)' : 'Login required (enter password and click Login)'}</span>
                </div>
                <div class="gpv-sync-status-item">
                    <span class="gpv-sync-label">Session:</span>
                    <span class="gpv-sync-value">${hasSessionKey ? 'Unlocked (stays active while refresh token is valid)' : 'Locked (enter password to unlock this device)'}</span>
                </div>
                <div class="gpv-sync-status-item">
                    <span class="gpv-sync-label">Last Sync:</span>
                    <span class="gpv-sync-value">${lastSyncText}</span>
                </div>
                ${syncStatus.lastError ? `
                    <div class="gpv-sync-status-item gpv-sync-error">
                        <span class="gpv-sync-label">Error:</span>
                        <span class="gpv-sync-value">${escapeHtml(syncStatus.lastErrorMeta?.userMessage || syncStatus.lastError)}</span>
                    </div>
                    <div class="gpv-sync-status-item">
                        <span class="gpv-sync-label">Category:</span>
                        <span class="gpv-sync-value">${escapeHtml(syncStatus.lastErrorMeta?.category || 'server')}</span>
                    </div>
                    <div class="gpv-sync-status-item">
                        <span class="gpv-sync-label">Recommended:</span>
                        <span class="gpv-sync-value">${escapeHtml(syncStatus.lastErrorMeta?.primaryAction || 'Retry sync')}</span>
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
                        <span>Activate Sync</span>
                    </label>
                    <p class="gpv-sync-help">
                        Sync your goal configurations across devices using encrypted cloud storage.
                        <a href="https://github.com/laurenceputra/goal-portfolio-viewer/blob/main/SYNC_ARCHITECTURE.md" 
                           target="_blank" 
                           rel="noopener noreferrer">Learn more</a>
                    </p>
                    <p class="gpv-sync-help">
                        🔒 <strong>No data is sent</strong> until you click <strong>Save Settings</strong>.
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
                    <label for="gpv-sync-password">Password (not stored)</label>
                    <input 
                        type="password" 
                        id="gpv-sync-password"
                        class="gpv-sync-input"
                        value="${escapeHtml(password)}"
                        placeholder="Strong password (min 8 characters)"
                        autocomplete="current-password"
                        ${!isEnabled || !cryptoSupported ? 'disabled' : ''}
                    />
                    <p class="gpv-sync-help">
                        🔒 Your password is used for both authentication and encryption and is not stored locally unless you opt in below.<br>
                        ⚠️ <strong>Keep it safe!</strong> If lost, your data cannot be recovered.
                        Use your browser's password manager to autofill each session.
                    </p>
                </div>

                <div class="gpv-sync-form-group" id="gpv-sync-remember-hint" style="display: ${shouldShowRememberKey || !isEnabled || !cryptoSupported ? 'none' : 'block'};">
                    <p class="gpv-sync-help">Enter a valid password to enable device key storage.</p>
                </div>

                <div class="gpv-sync-form-group" id="gpv-sync-remember-wrapper" style="display: ${shouldShowRememberKey ? 'block' : 'none'};">
                    <label class="gpv-sync-toggle">
                        <input 
                            type="checkbox" 
                            id="gpv-sync-remember-key"
                            ${rememberKey ? 'checked' : ''}
                            ${!isEnabled || !cryptoSupported ? 'disabled' : ''}
                        />
                        <span>Remember encryption key on this device</span>
                    </label>
                    <p class="gpv-sync-help">
                        Stores an encryption key on this device after activation. Only enable on a trusted device.
                        This key encrypts only your goal targets and fixed flags; portfolio balances, holdings, transactions, and personal data never leave your browser.
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
                        Existing user? Click <strong>Login</strong> to enable sync and verify credentials.
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
                        <span>Automatic Sync (recommended)</span>
                    </label>
                    <p class="gpv-sync-help">
                        Syncs in the background and after changes (batched within a short buffer).
                    </p>
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
                        Background sync interval (5-1440 minutes). Changes are also batched and synced automatically.
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
                        ${!isEnabled || !isConfigured || !cryptoSupported || !hasSessionKey ? 'disabled' : ''}
                    >
                        Sync Now
                    </button>
                    <button 
                        class="gpv-sync-btn gpv-sync-btn-danger"
                        id="gpv-sync-clear-btn"
                    >
                        Logout
                    </button>
                </div>
            </div>
        </div>
    `;
}

function setupSyncSettingsListeners() {
    // TODO: Improve sync auth error handling and user-visible feedback (centralize messaging, handle non-JSON/network failures).
    const serverUrlInput = document.getElementById('gpv-sync-server-url');
    if (serverUrlInput) {
        serverUrlInput.addEventListener('blur', () => {
            const normalized = utils.normalizeServerUrl(serverUrlInput.value);
            if (normalized) {
                Storage.set(SYNC_STORAGE_KEYS.serverUrl, normalized);
            }
        });
    }

    const userIdInput = document.getElementById('gpv-sync-user-id');
    if (userIdInput) {
        userIdInput.addEventListener('blur', () => {
            const value = userIdInput.value.trim();
            if (value) {
                Storage.set(SYNC_STORAGE_KEYS.userId, value);
            }
        });
    }

    const passwordInput = document.getElementById('gpv-sync-password');
    const rememberKeyWrapper = document.getElementById('gpv-sync-remember-wrapper');
    const rememberKeyHint = document.getElementById('gpv-sync-remember-hint');
    const enabledCheckbox = document.getElementById('gpv-sync-enabled');

    function updateRememberKeyVisibility() {
        const status = SyncManager.getStatus();
        const isEnabled = enabledCheckbox ? enabledCheckbox.checked : status.isEnabled;
        const isValidPassword = Boolean(passwordInput?.value && passwordInput.value.length >= 8);
        const rememberKeyCheckbox = document.getElementById('gpv-sync-remember-key');
        const shouldShow = isEnabled && status.cryptoSupported && (status.hasSessionKey || isValidPassword || rememberKeyCheckbox?.checked);

        if (rememberKeyWrapper) {
            rememberKeyWrapper.style.display = shouldShow ? 'block' : 'none';
        }
        if (rememberKeyHint) {
            rememberKeyHint.style.display = shouldShow || !isEnabled || !status.cryptoSupported ? 'none' : 'block';
        }
    }

    const rememberKeyCheckbox = document.getElementById('gpv-sync-remember-key');
    let rememberKeyTouched = false;
    if (rememberKeyCheckbox) {
        rememberKeyCheckbox.addEventListener('change', (e) => {
            rememberKeyTouched = true;
            if (!e.target.checked) {
                clearRememberedMasterKey();
            }
            updateRememberKeyVisibility();
        });
    }

    // Enable/disable sync
    if (enabledCheckbox) {
        enabledCheckbox.addEventListener('change', (e) => {
            const inputs = document.querySelectorAll('.gpv-sync-input, #gpv-sync-auto, #gpv-sync-interval');
            inputs.forEach(input => {
                input.disabled = !e.target.checked;
            });
            
            const status = SyncManager.getStatus();
            const buttons = document.querySelectorAll('#gpv-sync-test-btn, #gpv-sync-now-btn');
            buttons.forEach(btn => {
                if (btn.id === 'gpv-sync-now-btn') {
                    btn.disabled = !e.target.checked || !status.isConfigured || !status.hasSessionKey;
                } else {
                    btn.disabled = !e.target.checked || !status.isConfigured;
                }
            });
            updateRememberKeyVisibility();
        });
    }

    if (passwordInput) {
        passwordInput.addEventListener('input', updateRememberKeyVisibility);
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

    updateRememberKeyVisibility();

    // Save settings
    const saveBtn = document.getElementById('gpv-sync-save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            withButtonState(saveBtn, 'Saving...', async () => {
                try {
                    clearSyncMessage();
                    const {
                        enabled,
                        serverUrl,
                        userId,
                        password,
                        rememberKey,
                        autoSync,
                        syncInterval
                    } = getSyncFormState();
                    const { hasSessionKey } = SyncManager.getStatus();

                    // Validation
                    if (enabled) {
                        if (!serverUrl || !userId) {
                            throw new Error('Server URL and User ID are required when sync is activated');
                        }
                        if (!password && !hasSessionKey) {
                            throw new Error('Password is required to unlock sync for this session (or enable remember key)');
                        }
                        if (password && password.length < 8) {
                            throw new Error('Password must be at least 8 characters');
                        }
                        if (syncInterval < 5 || syncInterval > 1440) {
                            throw new Error('Sync interval must be between 5 and 1440 minutes');
                        }
                    }

                    if (enabled) {
                        await SyncManager.enable({
                            serverUrl,
                            userId,
                            password: password || null,
                            autoSync,
                            syncInterval,
                            rememberKey
                        });
                        const successMessage = 'Sync settings saved successfully!';
                        showSuccessMessage(successMessage);
                        rerenderSyncSettingsPanel({ message: successMessage, type: 'success', delay: 300 });
                    } else {
                        SyncManager.disable();
                        const disabledMessage = 'Sync deactivated';
                        showSuccessMessage(disabledMessage);
                        rerenderSyncSettingsPanel({ message: disabledMessage, type: 'success', delay: 300 });
                    }
                } catch (error) {
                    console.error('[Goal Portfolio Viewer] Save sync settings failed:', error);
                    showErrorMessage(`Failed to save settings: ${error.message}`);
                }
            });
        });
    }

    // Register button
    const registerBtn = document.getElementById('gpv-sync-register-btn');
    if (registerBtn) {
        registerBtn.addEventListener('click', () => {
            withButtonState(registerBtn, 'Signing up...', async () => {
                try {
                    clearSyncMessage();
                    const {
                        serverUrl,
                        userId,
                        password,
                        autoSync,
                        syncInterval
                    } = getSyncFormState();

                    if (!serverUrl || !userId || !password) {
                        throw new Error('Please fill in Server URL, User ID, and Password');
                    }

                    if (password.length < 8) {
                        throw new Error('Password must be at least 8 characters');
                    }

                    await SyncManager.register(serverUrl, userId, password);
                    await SyncManager.login(serverUrl, userId, password);
                    await SyncManager.enable({
                        serverUrl,
                        userId,
                        password,
                        autoSync,
                        syncInterval,
                        rememberKey: true
                    });
                    const successMessage = '✅ Account created and sync enabled with encryption by default.';
                    showSuccessMessage(successMessage);
                    rerenderSyncSettingsPanel({ message: successMessage, type: 'success', delay: 1500 });
                } catch (error) {
                    console.error('[Goal Portfolio Viewer] Registration failed:', error);
                    showErrorMessage(`Registration failed: ${error.message}`);
                }
            });
        });
    }

    // Login button
    const loginBtn = document.getElementById('gpv-sync-login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            withButtonState(loginBtn, 'Logging in...', async () => {
                try {
                    clearSyncMessage();
                    const {
                        serverUrl,
                        userId,
                        password,
                        autoSync,
                        syncInterval
                    } = getSyncFormState();
                    const rememberKeyCheckbox = document.getElementById('gpv-sync-remember-key');
                    const rememberKey = rememberKeyTouched
                        ? rememberKeyCheckbox?.checked === true
                        : true;

                    if (!serverUrl || !userId || !password) {
                        throw new Error('Please fill in Server URL, User ID, and Password');
                    }

                    await SyncManager.login(serverUrl, userId, password);
                    await SyncManager.enable({
                        serverUrl,
                        userId,
                        password,
                        autoSync,
                        syncInterval,
                        rememberKey
                    });
                    const successMessage = '✅ Login successful! Sync enabled with encryption by default.';
                    showSuccessMessage(successMessage);

                    if (typeof syncUi.update === 'function') {
                        syncUi.update();
                    }

                    rerenderSyncSettingsPanel({ message: successMessage, type: 'success', delay: 500 });
                } catch (error) {
                    console.error('[Goal Portfolio Viewer] Login failed:', error);
                    showErrorMessage(`Login failed: ${error.message}`);
                }
            });
        });
    }

    // Test connection
    const testBtn = document.getElementById('gpv-sync-test-btn');
    if (testBtn) {
        testBtn.addEventListener('click', () => {
            withButtonState(testBtn, 'Testing...', async () => {
                try {
                    clearSyncMessage();
                    const serverUrl = resolveSyncServerUrl(true);
                    if (!serverUrl) {
                        throw new Error('Server URL is required to test the connection');
                    }
                    Storage.set(SYNC_STORAGE_KEYS.serverUrl, serverUrl);
                    const response = await fetch(`${serverUrl}/health`);
                    const data = await response.json().catch(() => ({}));

                    if (response.ok && data.status === 'ok') {
                        showSuccessMessage(`Connection successful! Server version: ${data.version}`);
                    } else {
                        throw new Error(data.message || 'Server returned unexpected response');
                    }
                } catch (error) {
                    console.error('[Goal Portfolio Viewer] Test connection failed:', error);
                    showErrorMessage(`Connection failed: ${error.message}`);
                }
            });
        });
    }

    // Sync now
    const syncNowBtn = document.getElementById('gpv-sync-now-btn');
    if (syncNowBtn) {
        syncNowBtn.addEventListener('click', () => {
            withButtonState(syncNowBtn, 'Syncing...', async () => {
                try {
                    clearSyncMessage();

                    const { hasSessionKey } = SyncManager.getStatus();
                    if (!hasSessionKey) {
                        throw new Error('Encryption key required. Enter your password and Save Settings to unlock sync.');
                    }

                    const result = await SyncManager.performSync({ direction: 'both' });
                    
                    if (result.status === 'conflict') {
                        showInfoMessage('Sync conflict detected. Please resolve the conflict.');
                    } else {
                        showSuccessMessage('Sync completed successfully!');
                    }

                    rerenderSyncSettingsPanel({ delay: 1000 });
                } catch (error) {
                    console.error('[Goal Portfolio Viewer] Sync failed:', error);
                    if (error && error.code === 'RATE_LIMIT_EXCEEDED') {
                        const retrySeconds = Number(error.retryAfterSeconds);
                        const retryMinutes = Number.isFinite(retrySeconds) ? Math.max(1, Math.ceil(retrySeconds / 60)) : null;
                        const retryText = retryMinutes ? ` Try again in ${retryMinutes} minute${retryMinutes === 1 ? '' : 's'}.` : '';
                        showErrorMessage(`Too many syncs in a short time.${retryText} You can keep working locally and sync later.`);
                    } else {
                        showErrorMessage(`Sync failed: ${error.message}`);
                    }
                }
            });
        });
    }

    // Clear configuration
    const clearBtn = document.getElementById('gpv-sync-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            clearSyncMessage();
            if (confirm('Log out of sync on this device? Your encrypted data remains on the server.')) {
                SyncManager.clearConfig();
                const logoutMessage = 'Logged out. You can log in again to resume sync.';
                showInfoMessage(logoutMessage);
                rerenderSyncSettingsPanel({ delay: 300 });
            }
        });
    }
}

    if (typeof window !== 'undefined') {
        window.__gpvSyncUi = {
            createSyncSettingsHTML,
            setupSyncSettingsListeners
        };
    }

function renderSyncOverlayView({
    title,
    bodyHtml,
    onBack,
    backLabel,
    overlayClassName = 'gpv-overlay',
    containerClassName = 'gpv-container',
    allowOverlayClose = true,
    onOverlayClick
}) {
    let overlay = document.getElementById('gpv-overlay');
    if (overlay) {
        overlay.remove();
    }
    overlay = document.createElement('div');
    overlay.id = 'gpv-overlay';
    overlay.className = overlayClassName;
    document.body.appendChild(overlay);

    const container = document.createElement('div');
    container.className = containerClassName;

    const closeOverlay = () => {
        if (typeof overlay.gpvModalCleanup === 'function') {
            overlay.gpvModalCleanup();
        }
        overlay.remove();
    };

    const header = document.createElement('div');
    header.className = 'gpv-header';

    const headerButtons = document.createElement('div');
    headerButtons.className = 'gpv-header-buttons';

    if (typeof onBack === 'function') {
        const backBtn = document.createElement('button');
        backBtn.className = 'gpv-sync-btn';
        backBtn.type = 'button';
        backBtn.textContent = backLabel || '← Back';
        backBtn.title = 'Return to previous view';
        backBtn.onclick = () => {
            onBack();
            closeOverlay();
        };
        headerButtons.appendChild(backBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'gpv-close-btn';
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.onclick = closeOverlay;
    headerButtons.appendChild(closeBtn);

    const titleNode = document.createElement('h1');
    titleNode.textContent = title;
    const titleId = 'gpv-sync-overlay-title';
    titleNode.id = titleId;

    header.appendChild(titleNode);
    header.appendChild(headerButtons);

    const body = document.createElement('div');
    body.className = 'gpv-content';
    body.innerHTML = bodyHtml;

    container.appendChild(header);
    container.appendChild(body);
    overlay.appendChild(container);

    overlay.addEventListener('click', (e) => {
        if (e.target !== overlay) {
            return;
        }
        if (allowOverlayClose) {
            closeOverlay();
            return;
        }
        if (typeof onOverlayClick === 'function') {
            onOverlayClick();
        }
    });

    overlay.gpvModalCleanup = setupModalAccessibility({
        overlay,
        container,
        titleId,
        onClose: allowOverlayClose ? closeOverlay : null,
        initialFocus: closeBtn
    });

    return { overlay, container, body };
}

/**
 * Show sync settings modal
 */

function showSyncSettings() {
    
    try {
        let settingsHTML;
        try {
            settingsHTML = createSyncSettingsHTML();
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Error creating settings HTML:', error);
            settingsHTML = '<div style="padding: 20px; color: #ef4444;">Error loading sync settings. Please check console for details.</div>';
        }

        const { overlay } = renderSyncOverlayView({
            title: 'Sync Settings',
            bodyHtml: settingsHTML,
            onBack: () => {
                if (typeof renderPortfolioView === 'function') {
                    overlay.innerHTML = '';
                    const event = new CustomEvent('gpv-show-portfolio');
                    document.dispatchEvent(event);
                }
            },
            backLabel: '← Back to Investments'
        });

        // Setup listeners
        try {
            setupSyncSettingsListeners();
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Error setting up listeners:', error);
        }
        
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
    const localTargets = countSyncedTargets(conflict.local.goalTargets, conflict.local.goalFixed);
    const remoteTargets = countSyncedTargets(conflict.remote.goalTargets, conflict.remote.goalFixed);
    const localFixed = Object.keys(conflict.local.goalFixed || {}).length;
    const remoteFixed = Object.keys(conflict.remote.goalFixed || {}).length;
    const diffItems = _buildConflictDiffItems(conflict);
    const diffRows = diffItems.map(item => `
        <tr>
            <td class="gpv-conflict-goal-name">${escapeHtml(item.goalName)}</td>
            <td>
                <div><strong>Target:</strong> ${item.localTargetDisplay}</div>
                <div><strong>Fixed:</strong> ${item.localFixedDisplay}</div>
            </td>
            <td>
                <div><strong>Target:</strong> ${item.remoteTargetDisplay}</div>
                <div><strong>Fixed:</strong> ${item.remoteFixedDisplay}</div>
            </td>
        </tr>
    `).join('');
    const diffSection = diffItems.length > 0
        ? `
            <div class="gpv-conflict-diff">
                <h4>Changed Goals</h4>
                <table class="gpv-conflict-diff-table">
                    <thead>
                        <tr>
                            <th>Goal</th>
                            <th>Local</th>
                            <th>Remote</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${diffRows}
                    </tbody>
                </table>
            </div>
        `
        : `
            <div class="gpv-conflict-diff">
                <h4>Changed Goals</h4>
                <div class="gpv-conflict-diff-empty">No goal-level differences detected.</div>
            </div>
        `;

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
                        Keep This Device (Overwrite Server)
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
                        Use Server (Overwrite This Device)
                    </button>
                </div>
            </div>

            ${diffSection}

            <div class="gpv-conflict-warning">
                <p><strong>⚠️ Warning:</strong> Keep This Device uploads local settings and overwrites server data. Use Server downloads server settings and overwrites local settings on this device.</p>
            </div>

            <div class="gpv-conflict-actions">
                <button class="gpv-sync-btn gpv-sync-btn-secondary" id="gpv-conflict-cancel">
                    Cancel (Resolve Later)
                </button>
            </div>
        </div>
    `;
}

function buildGoalNameMap() {
    const cached = Storage.readJson(STORAGE_KEYS.summary, null);
    const goalMap = Array.isArray(cached)
        ? utils.indexBy(cached, item => item?.goalId)
        : null;
    const nameMap = goalMap
        ? Object.entries(goalMap).reduce((acc, [goalId, goal]) => {
            const name = utils.normalizeString(goal?.goalName || '', '');
            if (name) {
                acc[goalId] = name;
            }
            return acc;
        }, {})
        : {};
    const merged = buildMergedInvestmentData(
        state.apiData.performance,
        state.apiData.investible,
        state.apiData.summary
    );
    if (merged) {
        Object.keys(merged).forEach(bucket => {
            const bucketObj = merged[bucket];
            if (!bucketObj || typeof bucketObj !== 'object') {
                return;
            }
            Object.keys(bucketObj).forEach(goalType => {
                if (goalType === '_meta') {
                    return;
                }
                const goals = Array.isArray(bucketObj[goalType]?.goals)
                    ? bucketObj[goalType].goals
                    : [];
                goals.forEach(goal => {
                    if (goal?.goalId && goal?.goalName) {
                        nameMap[goal.goalId] = goal.goalName;
                    }
                });
            });
        });
    }
    return nameMap;
}

function _buildConflictDiffItems(conflict) {
    return buildConflictDiffItemsForMap(conflict, buildGoalNameMap());
}

/**
 * Show conflict resolution UI
 */

syncUi.showConflictResolution = function showConflictResolution(conflict) {
    renderSyncOverlayView({
        title: 'Sync Conflict',
        bodyHtml: createConflictDialogHTML(conflict),
        onBack: () => showSyncSettings(),
        backLabel: '← Back to Sync Settings',
        overlayClassName: 'gpv-overlay gpv-conflict-overlay',
        containerClassName: 'gpv-container gpv-conflict-modal',
        allowOverlayClose: false,
        onOverlayClick: () => {
            showInfoMessage('Please choose an option to resolve the conflict.');
        }
    });

    // Keep local button
    const keepLocalBtn = document.getElementById('gpv-conflict-keep-local');
    if (keepLocalBtn) {
        keepLocalBtn.addEventListener('click', async () => {
            try {
                keepLocalBtn.disabled = true;
                keepLocalBtn.textContent = 'Resolving...';
                
                await SyncManager.resolveConflict('local', conflict);
                showSuccessMessage('Conflict resolved! Local data uploaded to server.');
                showSyncSettings();
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
                showSyncSettings();
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
            const overlay = document.getElementById('gpv-overlay');
            if (overlay) {
                if (typeof overlay.gpvModalCleanup === 'function') {
                    overlay.gpvModalCleanup();
                }
                overlay.remove();
            }
            showInfoMessage('Conflict resolution postponed. Sync will retry later.');
        });
    }
}

// ============================================
// CHUNK 6: SYNC STATUS INDICATOR
// ============================================

/**
 * Create sync status indicator HTML
 */
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
    const statusLabel = syncStatus.lastError ? `${text}: ${syncStatus.lastError}` : text;
    const safeText = escapeHtml(text);
    const safeLabel = escapeHtml(statusLabel);

    return `
        <div class="gpv-sync-indicator gpv-sync-status-${syncStatus.status}" 
              id="gpv-sync-indicator"
              role="button"
              tabindex="0"
              aria-label="${safeLabel}"
              title="${safeLabel}">
            <span class="gpv-sync-icon">${icon}</span>
            <span class="gpv-sync-text">${safeText}</span>
        </div>
    `;
}

/**
 * Update sync UI elements
 */

syncUi.update = function updateSyncUI() {
    // Update sync indicator
    const indicator = document.getElementById('gpv-sync-indicator');
    if (indicator) {
        const parent = indicator.parentElement;
        indicator.outerHTML = createSyncIndicatorHTML();
        
        // Re-attach click listener
        const newIndicator = parent.querySelector('#gpv-sync-indicator');
        if (newIndicator) {
            wireSyncIndicator(newIndicator, showSyncSettings);
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
        if (document.getElementById('gpv-styles')) {
            return;
        }
        const style = createElement('style');
        style.id = 'gpv-styles';
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

            .gpv-container--expanded {
                max-width: 96vw;
                max-height: 95vh;
                width: 96vw;
            }

            @media (max-width: 900px) {
                .gpv-container {
                    min-width: 0;
                    width: 94vw;
                }

                .gpv-container--expanded {
                    width: 96vw;
                }
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

            .gpv-expand-btn {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: #ffffff;
                font-size: 14px;
                padding: 8px 14px;
                border-radius: 18px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                font-weight: 600;
                gap: 6px;
            }

            .gpv-expand-btn:hover {
                background: rgba(255, 255, 255, 0.3);
                transform: translateY(-1px);
            }

            .gpv-expand-btn:active {
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

            .gpv-mode-toggle {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                margin-left: auto;
            }

            .gpv-mode-toggle.gpv-mode-toggle--hidden {
                display: none;
            }

            .gpv-mode-label {
                font-weight: 600;
                color: #1f2937;
                font-size: 14px;
            }

            .gpv-mode-btn {
                border: 1px solid #c7d2fe;
                background: #eef2ff;
                color: #3730a3;
                padding: 6px 12px;
                border-radius: 999px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .gpv-mode-btn.is-active {
                background: #4f46e5;
                border-color: #4338ca;
                color: #ffffff;
            }

            .gpv-mode-btn:focus-visible {
                outline: 2px solid rgba(79, 70, 229, 0.5);
                outline-offset: 2px;
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

            .gpv-allocation-drift-hint {
                background: #fef3c7;
                border: 1px solid #f59e0b;
                border-radius: 10px;
                color: #92400e;
                font-size: 13px;
                font-weight: 600;
                margin-bottom: 12px;
                padding: 10px 12px;
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

            .gpv-type-actions {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-top: 8px;
                flex-wrap: wrap;
            }

            .gpv-section-toggle {
                border: 1px solid #e5e7eb;
                background: #ffffff;
                color: #374151;
                padding: 4px 10px;
                border-radius: 999px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                transition: all 0.2s ease;
            }

            .gpv-section-toggle:hover {
                border-color: #c7d2fe;
                color: #4338ca;
            }

            .gpv-section-toggle:focus-visible {
                outline: 2px solid rgba(99, 102, 241, 0.5);
                outline-offset: 2px;
            }

            .gpv-section-toggle-icon {
                font-size: 12px;
            }

            .gpv-collapsible {
                margin-top: 12px;
            }

            .gpv-collapsible.gpv-collapsible--collapsed {
                display: none;
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

            .gpv-table tbody tr.gpv-goal-row:hover + tr.gpv-goal-metrics-row {
                background-color: #f3f4f6;
            }

            .gpv-table tbody tr.gpv-goal-metrics-row:hover {
                background-color: #f3f4f6;
            }

            .gpv-mode-allocation .gpv-column-return,
            .gpv-mode-allocation .gpv-column-return-percent,
            .gpv-mode-allocation tr.gpv-goal-metrics-row {
                display: none;
            }

            .gpv-mode-performance .gpv-column-fixed,
            .gpv-mode-performance .gpv-column-target,
            .gpv-mode-performance .gpv-column-diff,
            .gpv-mode-performance .gpv-projection-panel,
            .gpv-mode-performance .gpv-section-toggle--projection {
                display: none;
            }

            .gpv-table tbody tr.gpv-goal-metrics-row td {
                border-top: none;
                padding-top: 4px;
                padding-bottom: 8px;
                text-align: left;
                font-size: 12px;
                color: #4b5563;
            }

            .gpv-goal-metrics {
                display: flex;
                flex-wrap: wrap;
                gap: 4px 10px;
                font-size: 12px;
                color: #6b7280;
                justify-content: flex-start;
            }

            .gpv-goal-metrics-item {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                flex: 0 0 auto;
                min-width: 0;
            }

            .gpv-goal-metrics-label {
                font-weight: 600;
                color: #6b7280;
            }

            .gpv-goal-metrics-value {
                font-weight: 600;
                color: #1f2937;
            }

            @media (max-width: 640px) {
                .gpv-goal-metrics-item {
                    min-width: 0;
                }
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

                .gpv-sync-toast {
                    position: absolute;
                    left: 50%;
                    bottom: 18px;
                    transform: translate(-50%, 12px);
                    opacity: 0;
                    pointer-events: none;
                    padding: 10px 14px;
                    border-radius: 10px;
                    font-size: 13px;
                    line-height: 1.4;
                    min-width: 220px;
                    max-width: 70%;
                    text-align: center;
                    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
                    transition: opacity 0.2s ease, transform 0.2s ease;
                    z-index: 2;
                }

                .gpv-sync-toast-visible {
                    opacity: 1;
                    transform: translate(-50%, 0);
                }

                .gpv-sync-toast-success {
                    background-color: #e6f4ea;
                    border: 1px solid #b7e1c1;
                    color: #1e7e34;
                }

                .gpv-sync-toast-error {
                    background-color: #f8d7da;
                    border: 1px solid #f5c6cb;
                    color: #a71d2a;
                }

                .gpv-sync-toast-info {
                    background-color: #e7f1ff;
                    border: 1px solid #cfe2ff;
                    color: #084298;
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
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border-radius: 20px;
                    padding: 12px 24px;
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                    font-weight: 600;
                }

                .gpv-sync-btn-primary:hover:not(:disabled) {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: #fff;
                    transform: translateY(-2px);
                    box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
                }

                .gpv-sync-btn-secondary {
                    background: rgba(255, 255, 255, 0.2);
                    color: #667eea;
                    border: 2px solid #667eea;
                    border-radius: 20px;
                    padding: 12px 24px;
                    font-weight: 600;
                }

                .gpv-sync-btn-secondary:hover:not(:disabled) {
                    background: rgba(255, 255, 255, 0.3);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
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

                .gpv-conflict-diff {
                    margin-bottom: 15px;
                    padding: 16px;
                    background: #f8fafc;
                    border-radius: 8px;
                    border: 1px solid #e5e7eb;
                }

                .gpv-conflict-diff h4 {
                    margin: 0 0 12px 0;
                    font-size: 14px;
                    color: #111827;
                }

                .gpv-conflict-diff-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 12px;
                }

                .gpv-conflict-diff-table th,
                .gpv-conflict-diff-table td {
                    text-align: left;
                    padding: 8px 6px;
                    border-bottom: 1px solid #e5e7eb;
                    vertical-align: top;
                }

                .gpv-conflict-diff-table th {
                    color: #6b7280;
                    font-weight: 600;
                }

                .gpv-conflict-goal-name {
                    font-weight: 600;
                    color: #111827;
                }

                .gpv-conflict-diff-empty {
                    font-size: 12px;
                    color: #6b7280;
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
            const goalIds = collectAllGoalIds(mergedInvestmentDataState);
            const goalTargetById = buildGoalTargetById(goalIds, GoalTargetStore.getTarget);
            const goalFixedById = buildGoalFixedById(goalIds, GoalTargetStore.getFixed);
            return {
                kind: 'SUMMARY',
                viewModel: ViewModels.buildSummaryViewModel(
                    mergedInvestmentDataState,
                    projectedInvestmentsState,
                    goalTargetById,
                    goalFixedById
                )
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
        onBucketSelect,
        onPerformanceDataLoaded,
        useCacheOnly
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
            cleanupCallbacks,
            onPerformanceDataLoaded,
            useCacheOnly
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
        const titleId = 'gpv-portfolio-title';
        title.id = titleId;
        
        // Add sync status indicator if sync is enabled
        const syncIndicatorContainer = createElement('div', 'gpv-sync-indicator-container');
        if (typeof createSyncIndicatorHTML === 'function') {
            const indicatorHTML = createSyncIndicatorHTML();
            if (indicatorHTML) {
                syncIndicatorContainer.innerHTML = indicatorHTML;
                const indicator = syncIndicatorContainer.querySelector('#gpv-sync-indicator');
                if (indicator) {
                    wireSyncIndicator(indicator, showSyncSettings);
                }
            }
        }
        
        // Create button container for sync and close buttons
        const buttonContainer = createElement('div', 'gpv-header-buttons');
        
        // Add sync settings button
        const syncBtn = createElement('button', 'gpv-sync-btn', '⚙️ Sync');
        syncBtn.title = 'Configure cross-device sync';
        syncBtn.onclick = () => {
            if (typeof showSyncSettings === 'function') {
                showSyncSettings();
            } else {
                console.error('[Goal Portfolio Viewer] showSyncSettings is not a function!');
                alert('Sync settings are not available. Please ensure the sync module is loaded.');
            }
        };

        let isOverlayExpanded = false;
        const expandBtn = createElement('button', 'gpv-expand-btn');
        expandBtn.type = 'button';
        function updateExpandButton() {
            expandBtn.textContent = isOverlayExpanded ? 'Shrink' : 'Expand';
            expandBtn.setAttribute('aria-pressed', String(isOverlayExpanded));
            expandBtn.setAttribute(
                'aria-label',
                isOverlayExpanded ? 'Shrink overlay size' : 'Expand overlay size'
            );
            expandBtn.title = isOverlayExpanded ? 'Shrink overlay' : 'Expand overlay';
        }
        updateExpandButton();
        expandBtn.onclick = () => {
            isOverlayExpanded = !isOverlayExpanded;
            container.classList.toggle('gpv-container--expanded', isOverlayExpanded);
            updateExpandButton();
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
        buttonContainer.appendChild(expandBtn);
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

        const modeToggle = createElement('div', 'gpv-mode-toggle');
        modeToggle.setAttribute('role', 'group');
        modeToggle.setAttribute('aria-label', 'Detail mode');
        const modeLabel = createElement('span', 'gpv-mode-label', 'Mode:');
        const allocationButton = createElement('button', 'gpv-mode-btn', 'Allocation');
        allocationButton.type = 'button';
        allocationButton.dataset.mode = BUCKET_VIEW_MODES.allocation;
        const performanceButton = createElement('button', 'gpv-mode-btn', 'Performance');
        performanceButton.type = 'button';
        performanceButton.dataset.mode = BUCKET_VIEW_MODES.performance;
        modeToggle.appendChild(modeLabel);
        modeToggle.appendChild(allocationButton);
        modeToggle.appendChild(performanceButton);

        controls.appendChild(modeToggle);
        container.appendChild(controls);

        const contentDiv = createElement('div', 'gpv-content');
        container.appendChild(contentDiv);

        let currentBucketMode = getBucketViewModePreference();
        function updateModeToggle(mode) {
            const normalized = normalizeBucketViewMode(mode);
            allocationButton.classList.toggle('is-active', normalized === BUCKET_VIEW_MODES.allocation);
            allocationButton.setAttribute('aria-pressed', String(normalized === BUCKET_VIEW_MODES.allocation));
            performanceButton.classList.toggle('is-active', normalized === BUCKET_VIEW_MODES.performance);
            performanceButton.setAttribute('aria-pressed', String(normalized === BUCKET_VIEW_MODES.performance));
        }

        function applyBucketMode(mode) {
            const normalized = normalizeBucketViewMode(mode);
            contentDiv.classList.toggle('gpv-mode-allocation', normalized === BUCKET_VIEW_MODES.allocation);
            contentDiv.classList.toggle('gpv-mode-performance', normalized === BUCKET_VIEW_MODES.performance);
            updateModeToggle(normalized);
            if (normalized === BUCKET_VIEW_MODES.performance) {
                expandPerformancePanels(contentDiv);
            }
        }

        function expandPerformancePanels(scope) {
            if (!scope) {
                return;
            }
            const panels = Array.from(scope.querySelectorAll('.gpv-performance-panel'));
            if (!panels.length) {
                return;
            }
            panels.forEach(panel => {
                if (!panel.classList.contains('gpv-collapsible--collapsed')) {
                    return;
                }
                const toggle = scope.querySelector(
                    `.gpv-section-toggle--performance[aria-controls="${panel.id}"]`
                );
                if (!toggle) {
                    return;
                }
                toggle.dataset.autoExpand = 'true';
                toggle.click();
            });
        }

        allocationButton.addEventListener('click', () => {
            if (currentBucketMode === BUCKET_VIEW_MODES.allocation) {
                return;
            }
            currentBucketMode = setBucketViewModePreference(BUCKET_VIEW_MODES.allocation);
            applyBucketMode(currentBucketMode);
        });

        performanceButton.addEventListener('click', () => {
            if (currentBucketMode === BUCKET_VIEW_MODES.performance) {
                return;
            }
            currentBucketMode = setBucketViewModePreference(BUCKET_VIEW_MODES.performance);
            applyBucketMode(currentBucketMode);
        });

        let performanceRefreshToken = 0;
        let pendingPerformanceRefresh = null;

        function schedulePerformanceRefresh(token, fetchedGoalIds) {
            if (pendingPerformanceRefresh) {
                clearTimeout(pendingPerformanceRefresh);
            }
            pendingPerformanceRefresh = setTimeout(() => {
                pendingPerformanceRefresh = null;
                if (token !== performanceRefreshToken) {
                    return;
                }
                renderView(select.value, { preserveScroll: true, useCacheOnly: true });
            }, 80);
        }

        function createPerformanceDataLoadedHandler(activeSelection) {
            const selectionKey = activeSelection;
            const token = performanceRefreshToken;
            return ({ fetchedGoalIds } = {}) => {
                if (!Array.isArray(fetchedGoalIds) || fetchedGoalIds.length === 0) {
                    return;
                }
                if (!overlay.isConnected) {
                    return;
                }
                if (token !== performanceRefreshToken) {
                    return;
                }
                if (select.value !== selectionKey) {
                    return;
                }
                if (currentBucketMode !== BUCKET_VIEW_MODES.performance) {
                    return;
                }
                schedulePerformanceRefresh(token, fetchedGoalIds);
            };
        }

        function renderView(value, { scrollToTop = false, preserveScroll = false, useCacheOnly = false } = {}) {
            performanceRefreshToken += 1;
            const previousScrollTop = preserveScroll ? contentDiv.scrollTop : null;
            ViewPipeline.render({
                contentDiv,
                selection: value,
                mergedInvestmentDataState,
                projectedInvestmentsState: state.projectedInvestments,
                cleanupCallbacks,
                onBucketSelect,
                onPerformanceDataLoaded: createPerformanceDataLoadedHandler(value),
                useCacheOnly
            });
            const isBucketView = value !== 'SUMMARY';
            modeToggle.classList.toggle('gpv-mode-toggle--hidden', !isBucketView);
            if (isBucketView) {
                applyBucketMode(currentBucketMode);
            } else {
                contentDiv.classList.remove('gpv-mode-allocation', 'gpv-mode-performance');
            }
            if (preserveScroll && previousScrollTop !== null) {
                contentDiv.scrollTop = previousScrollTop;
            }
            if (scrollToTop) {
                scrollOverlayContentToTop(contentDiv);
            }
            if (value !== 'SUMMARY' && currentBucketMode === BUCKET_VIEW_MODES.performance) {
                expandPerformancePanels(contentDiv);
            }
        }

        function onBucketSelect(bucket) {
            if (!bucket || !mergedInvestmentDataState[bucket]) {
                return;
            }
            select.value = bucket;
            renderView(bucket, { scrollToTop: true });
        }

        renderView('SUMMARY');

        select.onchange = function() {
            renderView(select.value, { scrollToTop: true });
        };

        overlay.appendChild(container);
        
        // Close overlay when clicking outside the container
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                closeOverlay();
            }
        };
        
        document.body.appendChild(overlay);

        const modalCleanup = setupModalAccessibility({
            overlay,
            container,
            titleId,
            onClose: closeOverlay,
            initialFocus: closeBtn
        });
        if (typeof modalCleanup === 'function') {
            cleanupCallbacks.push(modalCleanup);
        }
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
            
            // Add event listener for back button from sync settings
            document.addEventListener('gpv-show-portfolio', () => {
                showOverlay();
            });
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

    if (typeof module !== 'undefined' && module.exports) {
        window.__gpvTestingHooks = {
            injectStyles,
            showOverlay,
            startUrlMonitoring,
            init
        };
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
        const chartHelpers = typeof globalThis !== 'undefined' ? globalThis.__gpvChartHelpers : null;
        const syncUiExports = typeof window !== 'undefined'
            ? window.__gpvSyncUi
            : (typeof globalThis !== 'undefined' ? globalThis.__gpvSyncUi : null);
        const testingHooks = typeof window !== 'undefined' ? window.__gpvTestingHooks : null;
        const baseExports = {
            utils,
            storageKeys,
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
            buildAllocationDriftModel,
            buildGoalTypeAllocationModel,
            getProjectedInvestmentValue,
            buildDiffCellData,
            sortGoalsByName,
            resolveGoalTypeActionTarget,
            buildSummaryViewModel,
            buildBucketDetailViewModel,
            collectGoalIds,
            collectAllGoalIds,
            buildGoalTargetById,
            buildGoalFixedById,
            getBucketViewModePreference,
            setBucketViewModePreference,
            getCollapseState,
            setCollapseState,
            normalizeBucketViewMode,
            normalizeBooleanPreference,
            getChartHeightForWidth: chartHelpers?.getChartHeightForWidth,
            getChartDimensions: chartHelpers?.getChartDimensions,
            createLineChartSvg: chartHelpers?.createLineChartSvg,
            buildPerformanceWindowGrid: chartHelpers?.buildPerformanceWindowGrid,
            buildMergedInvestmentData,
            getPerformanceCacheKey,
            isCacheFresh,
            isCacheRefreshAllowed,
            formatPercentage,
            normalizeTimeSeriesData,
            normalizePerformanceResponse: utils.normalizePerformanceResponse,
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
            createSequentialRequestQueue,
            SyncEncryption,
            SyncManager,
            GoalTargetStore,
            createSyncSettingsHTML: syncUiExports?.createSyncSettingsHTML,
            setupSyncSettingsListeners: syncUiExports?.setupSyncSettingsListeners,
            buildConflictDiffItems: buildConflictDiffItemsForMap,
            formatSyncTarget,
            formatSyncFixed,
            clearSortCacheIfExpired,
            injectStyles: testingHooks?.injectStyles,
            showOverlay: testingHooks?.showOverlay,
            startUrlMonitoring: testingHooks?.startUrlMonitoring,
            init: testingHooks?.init
        };

        if (chartHelpers && chartHelpers.buildPerformanceWindowGrid) {
            module.exports = baseExports;
            return;
        }
        const {
            getChartHeightForWidth: fallbackGetChartHeightForWidth,
            getChartDimensions: fallbackGetChartDimensions,
            createLineChartSvg: fallbackCreateLineChartSvg,
            buildPerformanceWindowGrid: fallbackBuildPerformanceWindowGrid
        } = require('./__tests__/helpers/chartHelpers');

        module.exports = {
            ...baseExports,
            getChartHeightForWidth: fallbackGetChartHeightForWidth,
            getChartDimensions: fallbackGetChartDimensions,
            createLineChartSvg: fallbackCreateLineChartSvg,
            buildPerformanceWindowGrid: fallbackBuildPerformanceWindowGrid
        };
    }

})();
