// ==UserScript==
// @name         Goal Portfolio Viewer
// @namespace    https://github.com/laurenceputra/goal-portfolio-viewer
// @version      2.14.10
// @description  View and organize your investment portfolio with a modern interface across Endowus, FSM, and OCBC holdings. Includes bucket analytics and optional cross-device sync for configuration.
// @author       laurenceputra
// @match        https://app.sg.endowus.com/*
// @match        https://secure.fundsupermart.com/fsmone/*
// @match        https://internet.ocbc.com/internet-banking/digital/web/sg/cfo/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @grant        GM_cookie
// @connect      goal-portfolio-sync.laurenceputra.workers.dev
// @connect      localhost
// @connect      127.0.0.1
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
    const TARGET_TOTAL_TOLERANCE_PERCENT = 2;
    const MATERIAL_DRIFT_RATIO = 0.25;
    const FSM_PROFIT_PERCENT_SCALE = 'auto';
    const FSM_UNASSIGNED_PORTFOLIO_ID = 'unassigned';
    const FSM_ALL_PORTFOLIO_ID = 'all';
    const FSM_MAX_PORTFOLIO_NAME_LENGTH = 64;
    const DEBUG_AUTH = false;

    const UNKNOWN_GOAL_TYPE = 'UNKNOWN_GOAL_TYPE';
    const PROJECTED_KEY_SEPARATOR = '|';
    const COLLAPSE_KEY_SEPARATOR = '|';

    const ENDPOINT_PATHS = {
        performance: '/v1/goals/performance',
        investible: '/v2/goals/investible',
        summary: '/v1/goals',
        fsmHoldings: '/fsmone/rest/holding/client/protected/find-holdings-with-pnl',
        ocbcHoldings: '/digital/api/sg/ms-investment-accounts/v1/portfolio-holdings/inquiry'
    };
    const SUMMARY_ENDPOINT_REGEX = /\/v1\/goals(?:[?#]|$)/;

    const STORAGE_KEYS = {
        endowus: 'endowus',
        fsm: 'fsm',
        ocbc: 'ocbc',
        performance: 'api_performance',
        investible: 'api_investible',
        summary: 'api_summary',
        fsmHoldings: 'api_fsm_holdings',
        ocbcHoldings: 'api_ocbc_holdings',
        fsmPortfolios: 'fsm_portfolios',
        fsmAssignmentByCode: 'fsm_assignment_by_code',
        ocbcAllocationBuckets: 'ocbc_allocation_buckets',
        ocbcSubPortfolios: 'ocbc_sub_portfolios',
        ocbcAllocationAssignmentByCode: 'ocbc_allocation_assignment_by_code',
        ocbcAllocationOrderByScope: 'ocbc_allocation_order_by_scope'
    };
    const STORAGE_KEY_PREFIXES = {
        goalTarget: 'goal_target_pct_',
        goalFixed: 'goal_fixed_',
        goalBucket: 'goal_bucket_name_',
        fsmTarget: 'fsm_target_pct_',
        fsmFixed: 'fsm_fixed_',
        ocbcTarget: 'ocbc_target_pct_',
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
    const FSM_PROFIT_COLOR_THRESHOLD = 0.05;

    // ============================================
    // Sync Constants (Cross-Device Sync Feature)
    // ============================================

    const SYNC_STORAGE_KEYS = {
        enabled: 'sync_enabled',
        serverUrl: 'sync_server_url',
        userId: 'sync_user_id',
        deviceId: 'sync_device_id',
        lastSync: 'sync_last_sync',
        lastDataTimestamp: 'sync_last_data_timestamp',
        lastSyncMetadataVersion: 'sync_last_sync_metadata_version',
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
    const SYNC_METADATA_VERSION = 2;
    const SYNC_REQUEST_TIMEOUT_MS = 15000;
    const FSM_HOLDING_ID_SEPARATOR = '|sub:';

    const utils = {
        normalizeServerUrl(serverUrl) {
            if (!serverUrl || typeof serverUrl !== 'string') {
                return '';
            }
            return serverUrl.trim().replace(/\/+$/, '');
        },
        isAllowedSyncServerUrl(serverUrl) {
            const normalized = this.normalizeServerUrl(serverUrl);
            if (!normalized) {
                return false;
            }
            try {
                const url = new URL(normalized);
                if (url.protocol === 'https:') {
                    return true;
                }
                return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
            } catch (_error) {
                return false;
            }
        },
        assertAllowedSyncServerUrl(serverUrl) {
            if (!this.isAllowedSyncServerUrl(serverUrl)) {
                throw new Error('Sync server URL must use HTTPS, except localhost/127.0.0.1 for development');
            }
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

    function getFsmHoldingIdentity(rowOrCode, maybeSubcode) {
        const isRow = rowOrCode && typeof rowOrCode === 'object';
        const code = utils.normalizeString(isRow ? rowOrCode.code : rowOrCode, '');
        const subcode = utils.normalizeString(isRow ? (rowOrCode.subcode ?? rowOrCode.subCode) : maybeSubcode, '');
        if (!code) {
            return '';
        }
        if (!subcode) {
            return code;
        }
        return `${encodeURIComponent(code)}${FSM_HOLDING_ID_SEPARATOR}${encodeURIComponent(subcode)}`;
    }

    function formatFsmHoldingIdentity(identity) {
        const normalized = utils.normalizeString(identity, '');
        if (!normalized.includes(FSM_HOLDING_ID_SEPARATOR)) {
            return normalized;
        }
        const [encodedCode, encodedSubcode] = normalized.split(FSM_HOLDING_ID_SEPARATOR);
        try {
            const code = decodeURIComponent(encodedCode || '');
            const subcode = decodeURIComponent(encodedSubcode || '');
            return subcode ? `${code} / ${subcode}` : code;
        } catch (_error) {
            return normalized;
        }
    }

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
        goalBucket(goalId) {
            return buildStorageKey(STORAGE_KEY_PREFIXES.goalBucket, goalId ?? '');
        },
        goalBucketCleared(goalId) {
            return buildStorageKey(STORAGE_KEY_PREFIXES.goalBucket, goalId ?? '', '__cleared');
        },
        fsmTarget(code) {
            return buildStorageKey(STORAGE_KEY_PREFIXES.fsmTarget, code ?? '');
        },
        fsmFixed(code) {
            return buildStorageKey(STORAGE_KEY_PREFIXES.fsmFixed, code ?? '');
        },
        ocbcTarget(code) {
            return buildStorageKey(STORAGE_KEY_PREFIXES.ocbcTarget, code ?? '');
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

    function toOptionalFiniteNumber(value) {
        if (typeof value === 'string' && value.trim() === '') {
            return null;
        }
        if (value === null || value === undefined || value === '') {
            return null;
        }
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : null;
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

    function formatSignedMoney(value) {
        const numericValue = toOptionalFiniteNumber(value);
        if (numericValue === null) {
            return '-';
        }
        const money = formatMoney(numericValue);
        if (money === '-') {
            return '-';
        }
        return numericValue > 0 ? `+${money}` : money;
    }

    function resolveProfitPercentRatio(value, derivedPercent = null) {
        const numericValue = toOptionalFiniteNumber(value);
        if (numericValue === null) {
            return derivedPercent;
        }
        const absoluteValue = Math.abs(numericValue);
        const ratioCandidate = numericValue;
        const pointsCandidate = numericValue / 100;
        if (derivedPercent !== null) {
            const ratioDistance = Math.abs(derivedPercent - ratioCandidate);
            const pointsDistance = Math.abs(derivedPercent - pointsCandidate);
            return pointsDistance <= ratioDistance ? pointsCandidate : ratioCandidate;
        }
        if (FSM_PROFIT_PERCENT_SCALE === 'ratio') {
            return ratioCandidate;
        }
        if (FSM_PROFIT_PERCENT_SCALE === 'points') {
            return pointsCandidate;
        }
        if (absoluteValue === 0) {
            return pointsCandidate;
        }
        return null;
    }

    function calculateProfitPercentFromValue(currentValue, profitValue) {
        const numericCurrentValue = toOptionalFiniteNumber(currentValue);
        const numericProfitValue = toOptionalFiniteNumber(profitValue);
        if (numericCurrentValue === null || numericProfitValue === null) {
            return null;
        }
        const costBasis = numericCurrentValue - numericProfitValue;
        if (!Number.isFinite(costBasis) || costBasis <= 0) {
            return null;
        }
        return numericProfitValue / costBasis;
    }

    function formatProfitDisplay(profitValue, profitPercent) {
        const valueDisplay = formatSignedMoney(profitValue);
        const percentDisplay = formatPercent(profitPercent, {
            multiplier: 100,
            showSign: true
        });
        if (valueDisplay === '-' && percentDisplay === '-') {
            return '-';
        }
        if (valueDisplay === '-') {
            return percentDisplay;
        }
        if (percentDisplay === '-') {
            return valueDisplay;
        }
        return `${valueDisplay} (${percentDisplay})`;
    }

    function normalizeMoneyDisplaySpacing(value) {
        if (typeof value !== 'string') {
            return value;
        }
        return value.replace(/\u00A0/g, ' ');
    }

    function formatFsmProfitDisplay(profitValue, profitPercent) {
        const percentDisplay = formatPercent(profitPercent, {
            multiplier: 100,
            showSign: true
        });
        const valueDisplay = normalizeMoneyDisplaySpacing(formatSignedMoney(profitValue));
        if (percentDisplay === '-' && valueDisplay === '-') {
            return '-';
        }
        if (percentDisplay === '-') {
            return valueDisplay;
        }
        if (valueDisplay === '-') {
            return percentDisplay;
        }
        return `${percentDisplay} (${valueDisplay})`;
    }

    function getFsmProfitClass(profitPercent) {
        const numericPercent = toOptionalFiniteNumber(profitPercent);
        if (numericPercent === null) {
            return '';
        }
        if (numericPercent > FSM_PROFIT_COLOR_THRESHOLD) {
            return 'positive';
        }
        if (numericPercent < -FSM_PROFIT_COLOR_THRESHOLD) {
            return 'negative';
        }
        return '';
    }

    function getDriftSeverityClass(driftRatio) {
        const numericDrift = toFiniteNumber(driftRatio, null);
        if (numericDrift === null) {
            return '';
        }
        const magnitude = Math.abs(numericDrift);
        if (magnitude <= MATERIAL_DRIFT_RATIO) {
            return 'gpv-drift--green';
        }
        if (magnitude <= 0.5) {
            return 'gpv-drift--yellow';
        }
        return 'gpv-drift--red';
    }

    function formatDriftDisplay(driftPercent, driftAmount) {
        const percentDisplay = formatPercent(driftPercent, {
            multiplier: 100,
            showSign: true
        });
        const amountDisplay = formatSignedMoney(driftAmount);
        if (percentDisplay === '-' || amountDisplay === '-') {
            return '-';
        }
        return `${percentDisplay} (${amountDisplay})`;
    }

    function getFiniteNumbers(values) {
        const numbers = values.map(value => toFiniteNumber(value, null));
        return numbers.some(value => value === null) ? null : numbers;
    }

    function normalizePortfolioName(value) {
        const name = utils.normalizeString(value, '');
        if (!name) {
            return '';
        }
        return name.slice(0, FSM_MAX_PORTFOLIO_NAME_LENGTH);
    }

    function toSlug(value) {
        const slug = utils.normalizeString(value, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return slug || 'portfolio';
    }

    function buildPortfolioId(name, existingIds = []) {
        const base = toSlug(name);
        const idSet = new Set(existingIds);
        if (!idSet.has(base)) {
            return base;
        }
        let suffix = 2;
        while (idSet.has(`${base}-${suffix}`)) {
            suffix += 1;
        }
        return `${base}-${suffix}`;
    }

    function normalizeFsmPortfolios(portfolios) {
        if (!Array.isArray(portfolios)) {
            return [];
        }
        const usedIds = new Set();
        return portfolios
            .map(item => {
                const name = normalizePortfolioName(item?.name);
                if (!name) {
                    return null;
                }
                const id = utils.normalizeString(item?.id, '') || buildPortfolioId(name, Array.from(usedIds));
                if (id === FSM_UNASSIGNED_PORTFOLIO_ID || usedIds.has(id)) {
                    return null;
                }
                usedIds.add(id);
                return {
                    id,
                    name,
                    archived: item?.archived === true
                };
            })
            .filter(Boolean);
    }

    function formatGrowthPercentFromEndingBalance(totalReturn, endingBalance) {
        // Calculate growth percentage as: return / principal * 100
        // where principal = ending balance - return
        // Example: if you invested $100 and now have $110, return is $10
        // Growth = 10 / 100 * 100 = 10%
        const numericReturn = toOptionalFiniteNumber(totalReturn);
        const numericEndingBalance = toOptionalFiniteNumber(endingBalance);
        if (numericReturn === null || numericEndingBalance === null) {
            return '-';
        }
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

    function calculateAllocationRatio(amount, total) {
        const numericValues = getFiniteNumbers([amount, total]);
        if (!numericValues) {
            return null;
        }
        const [numericAmount, numericTotal] = numericValues;
        if (numericTotal <= 0) {
            return null;
        }
        return numericAmount / numericTotal;
    }

    function calculateAllocationDrift(currentAmount, targetPercent, total) {
        if (targetPercent === null || targetPercent === undefined) {
            return null;
        }
        const numericValues = getFiniteNumbers([currentAmount, targetPercent, total]);
        if (!numericValues) {
            return null;
        }
        const [numericCurrent, numericTarget, numericTotal] = numericValues;
        if (numericTotal <= 0) {
            return null;
        }
        const targetAmount = (numericTarget / 100) * numericTotal;
        if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
            return null;
        }
        const driftAmount = numericCurrent - targetAmount;
        const driftPercent = driftAmount / targetAmount;
        if (!Number.isFinite(driftPercent) || !Number.isFinite(driftAmount)) {
            return null;
        }
        return { driftPercent, driftAmount };
    }

    function calculatePercentOfType(amount, total) {
        const ratio = calculateAllocationRatio(amount, total);
        if (ratio === null) {
            return 0;
        }
        return ratio * 100;
    }

    function calculateGoalDiff(currentAmount, targetPercent, adjustedTypeTotal) {
        const drift = calculateAllocationDrift(currentAmount, targetPercent, adjustedTypeTotal);
        if (!drift) {
            return { diffAmount: null, diffClass: '', driftPercent: null, driftAmount: null };
        }
        const diffAmount = drift.driftAmount;
        const threshold = Number(currentAmount) * 0.05;
        const diffClass = Math.abs(diffAmount) > threshold ? 'negative' : 'positive';
        return {
            diffAmount,
            diffClass,
            driftPercent: drift.driftPercent,
            driftAmount: diffAmount
        };
    }


    function buildAllocationDriftModel(goalModels, adjustedTotal) {
        if (!Array.isArray(goalModels) || goalModels.length === 0) {
            return {
                allocationDriftPercent: null,
                allocationDriftDisplay: '-',
                allocationDriftClass: '',
                allocationDriftAvailable: false
            };
        }
        const numericAdjustedTotal = toFiniteNumber(adjustedTotal, null);
        if (numericAdjustedTotal === null || numericAdjustedTotal <= 0) {
            return {
                allocationDriftPercent: null,
                allocationDriftDisplay: '-',
                allocationDriftClass: '',
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
                allocationDriftClass: '',
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
                allocationDriftClass: '',
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
            allocationDriftClass: getDriftSeverityClass(driftSum),
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

    function isFsmInvestmentsRoute(url, originFallback = 'https://secure.fundsupermart.com') {
        if (typeof url !== 'string' || !url) {
            return false;
        }
        try {
            const target = new URL(url, originFallback);
            return target.pathname === '/fsmone/holdings/investments';
        } catch (_error) {
            return false;
        }
    }

    function isOcbcPortfolioHoldingsRoute(url, originFallback = 'https://internet.ocbc.com') {
        if (typeof url !== 'string' || !url) {
            return false;
        }
        try {
            const target = new URL(url, originFallback);
            const expectedOrigin = 'https://internet.ocbc.com';
            const normalizedPath = target.pathname.replace(/\/+$/, '');
            const isExpectedPath = normalizedPath === '/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings';
            if (!isExpectedPath) {
                return false;
            }
            if (target.origin === expectedOrigin) {
                return true;
            }

            const demoRouteEnabled = typeof window !== 'undefined' && window.__GPV_OCBC_DEMO_ROUTE__ === true;
            if (!demoRouteEnabled) {
                return false;
            }

            return target.hostname === 'localhost' || target.hostname === '127.0.0.1';
        } catch (_error) {
            return false;
        }
    }

    function isOcbcDashboardRoute(url, originFallback = 'https://internet.ocbc.com') {
        if (typeof url !== 'string' || !url) {
            return false;
        }
        try {
            const target = new URL(url, originFallback);
            const normalizedPath = target.pathname.replace(/\/+$/, '');
            return normalizedPath === '/internet-banking/digital/web/sg/cfo/dashboard';
        } catch (_error) {
            return false;
        }
    }

    function parseOcbcNumericValue(value) {
        if (value === null || value === undefined) {
            return null;
        }
        if (typeof value === 'string' && value.trim() === '') {
            return null;
        }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const parsedValue = parseOcbcNumericValue(value.parsedValue);
            if (parsedValue !== null) {
                return parsedValue;
            }
            const parsedFromSource = parseOcbcNumericValue(value.source);
            if (parsedFromSource !== null) {
                return parsedFromSource;
            }
            return null;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function normalizeOcbcIdentitySegment(value) {
        return utils.normalizeString(value, '').trim().toLowerCase();
    }

    function hashOcbcIdentityFingerprint(input) {
        const source = utils.normalizeString(input, '');
        let hashA = 2166136261;
        let hashB = 2166136261;
        for (let index = 0; index < source.length; index += 1) {
            const code = source.charCodeAt(index);
            hashA ^= code;
            hashA = Math.imul(hashA, 16777619);
            hashB ^= (code ^ ((index + 1) & 0xff));
            hashB = Math.imul(hashB, 16777619);
        }
        return `${(hashA >>> 0).toString(16).padStart(8, '0')}${(hashB >>> 0).toString(16).padStart(8, '0')}`;
    }

    function buildOcbcLegacyAssignmentCodeAliases(row, resolvedPortfolioNo, fallbackIndex) {
        const portfolioNo = utils.normalizeString(resolvedPortfolioNo, '-');
        const aliases = [];
        const stableKeys = [
            row?.isin,
            row?.fundCode,
            row?.description
        ];
        stableKeys.forEach(value => {
            const normalized = utils.normalizeString(value, '');
            if (normalized) {
                aliases.push(`${portfolioNo}:${normalized}`);
            }
        });
        aliases.push(`${portfolioNo}:${portfolioNo || '-'}#${fallbackIndex + 1}`);
        return Array.from(new Set(aliases));
    }

    function buildOcbcStableHoldingCode(row, context = {}) {
        const resolvedPortfolioNo = utils.normalizeString(context.portfolioNo, '-');
        const fallbackIndex = Number.isFinite(Number(context.index)) ? Number(context.index) : 0;
        const positionId = utils.normalizeString(row?.positionId, '');
        const sectionType = utils.normalizeString(context.sectionType, 'assets');
        const scopeParts = [
            sectionType,
            resolvedPortfolioNo,
            utils.normalizeString(context.assetClassDesc, ''),
            utils.normalizeString(context.subAssetClassDesc, '')
        ].map(normalizeOcbcIdentitySegment).filter(Boolean);

        const strongIdParts = [
            row?.isin,
            row?.fundCode
        ].map(normalizeOcbcIdentitySegment).filter(Boolean);
        const weakDescriptorParts = [
            row?.description,
            row?.fundName,
            row?.companyName,
            row?.assetDesc,
            row?.shortName,
            row?.originalCcy
        ].map(normalizeOcbcIdentitySegment).filter(Boolean);

        const hasHoldingSpecificIdentity = strongIdParts.length > 0 || weakDescriptorParts.length > 0;
        const fingerprintParts = hasHoldingSpecificIdentity
            ? (strongIdParts.length > 0
                ? [...scopeParts, ...strongIdParts]
                : [...scopeParts, ...weakDescriptorParts])
            : [];
        const fingerprint = fingerprintParts.join('|');
        const hashedCode = hasHoldingSpecificIdentity
            ? `${resolvedPortfolioNo}:gpv-ocbc-${hashOcbcIdentityFingerprint(fingerprint)}`
            : `${resolvedPortfolioNo}:gpv-ocbc-fallback-${resolvedPortfolioNo || '-'}-${fallbackIndex + 1}`;
        const legacyAliases = [
            ...buildOcbcLegacyAssignmentCodeAliases(row, resolvedPortfolioNo, fallbackIndex),
            hashedCode
        ];

        if (positionId) {
            const isAssetsSection = sectionType === 'assets';
            const primaryCode = isAssetsSection
                ? `${resolvedPortfolioNo}:${positionId}`
                : `${resolvedPortfolioNo}:${sectionType}:${positionId}`;
            return {
                code: primaryCode,
                usedFallbackIndex: !hasHoldingSpecificIdentity,
                legacyAliases: Array.from(new Set(legacyAliases))
            };
        }

        if (!hasHoldingSpecificIdentity) {
            return {
                code: hashedCode,
                usedFallbackIndex: true,
                legacyAliases: Array.from(new Set(legacyAliases))
            };
        }

        return {
            code: hashedCode,
            usedFallbackIndex: false,
            legacyAliases: Array.from(new Set(legacyAliases))
        };
    }

    function mapOcbcHoldingRow(row, context = {}) {
        if (!row || typeof row !== 'object') {
            return null;
        }
        const resolvedPortfolioNo = utils.normalizeString(context.portfolioNo, '-');
        const index = Number.isFinite(Number(context.index)) ? Number(context.index) : 0;
        const identity = buildOcbcStableHoldingCode(row, context);
        const code = identity.code;
        const fallbackLabel = `Holding ${index + 1}`;
        const displayTicker = utils.normalizeString(
            row.isin
            || row.fundCode
            || row.description
            || row.shortName
            || fallbackLabel,
            fallbackLabel
        );
        const currentValueLcy = parseOcbcNumericValue(row.marketValueReferenceCcy)
            ?? parseOcbcNumericValue(row.marketValue)
            ?? parseOcbcNumericValue(row.marketValueOriginalCcy)
            ?? 0;
        return {
            code,
            legacyCodeAliases: identity.legacyAliases,
            portfolioNo: resolvedPortfolioNo,
            subcode: utils.normalizeString(row.subcode ?? row.subCode, ''),
            displayTicker,
            name: utils.normalizeString(row.fundName || row.companyName || row.description || row.shortName, '-'),
            assetClassDesc: utils.normalizeString(context.assetClassDesc, ''),
            subAssetClassDesc: utils.normalizeString(context.subAssetClassDesc, ''),
            productType: utils.normalizeString(
                context.subAssetClassDesc || context.assetClassDesc || row.shortName,
                '-'
            ),
            currentValueLcy,
            profitValueLcy: parseOcbcNumericValue(row.totalUnrealisedPLRefCcy) ?? parseOcbcNumericValue(row.totalPl),
            profitPercentLcy: parseOcbcNumericValue(row.unrealisedPLPercent)
        };
    }

    function normalizeOcbcHoldingsPayload(data) {
        const groups = Array.isArray(data?.data) ? data.data : [];
        const assets = [];
        const liabilities = [];
        let assetIndex = 0;
        let liabilityIndex = 0;

        function flattenSectionRows(sectionType, rows) {
            const isAssets = sectionType === 'assets';
            (Array.isArray(rows) ? rows : []).forEach(group => {
                const portfolioNo = utils.normalizeString(group?.portfolioNo, '-');
                const sections = Array.isArray(group?.[sectionType]) ? group[sectionType] : [];
                sections.forEach(section => {
                    const assetClassDesc = utils.normalizeString(section?.assetClassDesc, '');
                    const subAssets = Array.isArray(section?.subAssets) ? section.subAssets : [];
                    subAssets.forEach(subAsset => {
                        const subAssetClassDesc = utils.normalizeString(subAsset?.subAssetClassDesc, '');
                        const holdings = Array.isArray(subAsset?.holdings) ? subAsset.holdings : [];
                        holdings.forEach(row => {
                            const normalized = mapOcbcHoldingRow(row, {
                                portfolioNo,
                                assetClassDesc,
                                subAssetClassDesc,
                                sectionType,
                                index: isAssets ? assetIndex : liabilityIndex
                            });
                            if (!normalized) {
                                return;
                            }
                            if (isAssets) {
                                assetIndex += 1;
                                assets.push(normalized);
                            } else {
                                liabilityIndex += 1;
                                liabilities.push(normalized);
                            }
                        });
                    });
                });
            });
        }

        flattenSectionRows('assets', groups);
        flattenSectionRows('liabilities', groups);
        return { assets, liabilities };
    }

    function getOcbcAssignmentLookupCandidates(row) {
        const candidates = [];
        const primaryCode = utils.normalizeString(row?.code, '');
        if (primaryCode) {
            candidates.push(primaryCode);
        }
        const aliases = Array.isArray(row?.legacyCodeAliases) ? row.legacyCodeAliases : [];
        aliases.forEach(alias => {
            const normalizedAlias = utils.normalizeString(alias, '');
            if (normalizedAlias) {
                candidates.push(normalizedAlias);
            }
        });
        return Array.from(new Set(candidates));
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

    function sortGoalsByName(goals) {
        const safeGoals = Array.isArray(goals) ? goals : [];
        return safeGoals.slice().sort((left, right) => {
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
    }

    function getGoalRawEndingBalanceAmount(goal) {
        return goal?.rawEndingBalanceAmount ?? goal?.endingBalanceAmount;
    }

    function buildGoalBalancesTsvRow(goals) {
        const safeGoals = Array.isArray(goals) ? goals : [];
        return safeGoals.map(goal => {
            const rawEndingBalanceAmount = getGoalRawEndingBalanceAmount(goal);
            return rawEndingBalanceAmount === null || rawEndingBalanceAmount === undefined
                ? ''
                : String(rawEndingBalanceAmount);
        }).join('\t');
    }

    function buildGoalModel(goal, totalTypeAmount, adjustedTotal, goalTargets, goalFixed) {
        const endingBalanceAmount = goal.endingBalanceAmount || 0;
        const rawEndingBalanceAmount = getGoalRawEndingBalanceAmount(goal);
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
        const returnValue = toFiniteNumber(goal.totalCumulativeReturn, null);
        return {
            goalId: goal.goalId,
            goalName: goal.goalName,
            endingBalanceAmount,
            rawEndingBalanceAmount,
            percentOfType,
            isFixed,
            targetPercent,
            effectiveTargetPercent: targetPercent,
            diffAmount: diffInfo.diffAmount,
            diffClass: diffInfo.diffClass,
            driftPercent: diffInfo.driftPercent,
            driftAmount: diffInfo.driftAmount,
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
        const hasFixedGoal = goalModels.some(goal => goal?.isFixed === true);
        const shouldAssignRemainingTarget = missingTargetGoals.length === 1
            && (hasOtherTarget || hasFixedGoal)
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
                    effectiveTargetPercent: remainingTargetPercent,
                    diffAmount: diffInfo.diffAmount,
                    diffClass: diffInfo.diffClass,
                    driftPercent: diffInfo.driftPercent,
                    driftAmount: diffInfo.driftAmount
                };
            });
        }
        const allocationDriftModel = buildAllocationDriftModel(goalModels, adjustedTotal);
        return {
            goalModels,
            remainingTargetPercent: adjustedRemainingTargetPercent,
            allocationDriftPercent: allocationDriftModel.allocationDriftPercent,
            allocationDriftDisplay: allocationDriftModel.allocationDriftDisplay,
            allocationDriftClass: allocationDriftModel.allocationDriftClass,
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
            if (total === null || !Number.isFinite(value)) {
                return null;
            }
            return total + value;
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
            return { buckets: [], showAllocationDriftHint: false, attentionItems: [] };
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
                const goalTypeModels = orderedTypes
                    .map(goalType => {
                        const group = base.bucketObj[goalType];
                        if (!group) {
                            return null;
                        }
                        const typeReturn = group.totalCumulativeReturn === null
                            ? null
                            : toFiniteNumber(group.totalCumulativeReturn, null);
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
                        return enrichGoalTypeWithPlanning({
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
                            allocationDriftClass: allocationModel.allocationDriftClass,
                            allocationDriftAvailable: allocationModel.allocationDriftAvailable,
                            goals: allocationModel.goalModels.map(goal => buildBucketDetailGoalRow(goal)),
                            adjustedTotal,
                            projectedAmount
                        });
                    })
                    .filter(Boolean);
                const bucketReasons = goalTypeModels.flatMap(model => model.health?.reasons || []);
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
                    goalTypes: goalTypeModels,
                    health: buildHealthStatus({
                        reasons: bucketReasons,
                        setupRequired: bucketReasons.some(reason => reason.includes('Target total is'))
                    })
                };
            })
            .filter(Boolean);
        return {
            buckets,
            showAllocationDriftHint,
            attentionItems: buildNeedsAttentionItemsForSummary({ buckets })
        };
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

    const goalTypeModels = orderedTypes
        .map(goalType => {
            const group = base.bucketObj[goalType];
            if (!group) {
                return null;
            }
            const projectedAmount = getProjectedInvestmentValue(projectedInvestments, bucketName, goalType);
            const allocationModel = computeGoalTypeViewState(
                Array.isArray(group.goals) ? group.goals : [],
                group.endingBalanceAmount || 0,
                (group.endingBalanceAmount || 0) + projectedAmount,
                goalTargets,
                goalFixed
            );
            if (allocationModel.allocationDriftAvailable === false) {
                showAllocationDriftHint = true;
            }
            return enrichGoalTypeWithPlanning(buildBucketDetailGoalTypeModel({
                goalType,
                group,
                projectedAmount,
                allocationModel
            }));
        })
        .filter(Boolean);

    const bucketReasons = goalTypeModels.flatMap(model => model.health?.reasons || []);

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
        goalTypes: goalTypeModels,
        showAllocationDriftHint,
        health: buildHealthStatus({
            reasons: bucketReasons,
            setupRequired: bucketReasons.some(reason => reason.includes('Target total is'))
        })
    };
}

function buildBucketDetailGoalTypeModel({ goalType, group, projectedAmount, allocationModel }) {
    const typeReturn = group.totalCumulativeReturn === null
        ? null
        : toFiniteNumber(group.totalCumulativeReturn, null);
    const endingBalanceAmount = group.endingBalanceAmount || 0;
    return {
        goalType,
        displayName: getDisplayGoalType(goalType),
        endingBalanceAmount,
        endingBalanceDisplay: formatMoney(group.endingBalanceAmount),
        totalReturn: typeReturn,
        returnDisplay: formatMoney(typeReturn),
        growthDisplay: formatGrowthPercentFromEndingBalance(
            typeReturn,
            group.endingBalanceAmount
        ),
        returnClass: getReturnClass(typeReturn),
        projectedAmount,
        adjustedTotal: endingBalanceAmount + projectedAmount,
        remainingTargetPercent: allocationModel.remainingTargetPercent,
        remainingTargetDisplay: formatPercent(allocationModel.remainingTargetPercent),
        remainingTargetIsHigh: isRemainingTargetAboveThreshold(allocationModel.remainingTargetPercent),
        allocationDriftDisplay: allocationModel.allocationDriftDisplay,
        allocationDriftClass: allocationModel.allocationDriftClass,
        allocationDriftAvailable: allocationModel.allocationDriftAvailable,
        goalModelsById: allocationModel.goalModelsById,
        goals: allocationModel.goalModels.map(goal => buildBucketDetailGoalRow(goal))
    };
}

function buildBucketDetailGoalRow(goal) {
    const windowReturns = getGoalWindowReturns(goal.goalId);
    const windowReturnDisplays = buildWindowReturnDisplays(windowReturns);
    return {
        ...goal,
        endingBalanceDisplay: formatMoney(goal.endingBalanceAmount),
        percentOfTypeDisplay: formatPercent(goal.percentOfType),
        targetDisplay: goal.targetPercent !== null ? goal.targetPercent.toFixed(2) : '',
        diffDisplay: goal.diffAmount === null ? '-' : formatMoney(goal.diffAmount),
        driftDisplay: formatDriftDisplay(goal.driftPercent, goal.driftAmount),
        driftClass: getDriftSeverityClass(goal.driftPercent),
        returnDisplay: formatMoney(goal.returnValue),
        returnPercentDisplay: formatPercent(goal.returnPercent, { multiplier: 100, showSign: false }),
        returnClass: getReturnClass(goal.returnValue),
        windowReturns,
        windowReturnDisplays
    };
}

function enrichGoalTypeWithPlanning(goalTypeModel) {
    const planning = buildPlanningModel(goalTypeModel);
    const reasons = [];
    const largestUnderweight = Array.isArray(planning.materialBuys) ? planning.materialBuys[0] : null;
    const largestOverweight = Array.isArray(planning.materialSells) ? planning.materialSells[0] : null;
    if (planning.targetCoverageLabel) {
        reasons.push(planning.targetCoverageLabel);
    }
    const underweightReason = largestUnderweight
        ? buildAttentionDriftReason(
            getDriftSeverityClass(largestUnderweight.driftPercent),
            `Largest underweight: ${largestUnderweight.goalName}`
        )
        : null;
    if (underweightReason) {
        reasons.push(underweightReason);
    }
    const overweightReason = largestOverweight
        && Math.abs(largestOverweight.diffAmount || largestOverweight.driftAmount || 0) > 0
        ? buildAttentionDriftReason(
            getDriftSeverityClass(largestOverweight.driftPercent),
            `Largest overweight: ${largestOverweight.goalName}`
        )
        : null;
    if (overweightReason) {
        reasons.push(overweightReason);
    }
    return {
        ...goalTypeModel,
        planning,
        targetCoverageIssue: planning.targetCoverageLabel,
        health: buildHealthStatus({ reasons, setupRequired: Boolean(planning.targetCoverageLabel) })
    };
}

function collectGoalIdSetFromApiData(performanceData, investibleData, summaryData) {
    const goalIds = new Set();
    if (Array.isArray(performanceData)) {
        performanceData.forEach(item => {
            const goalId = utils.normalizeString(item?.goalId, '');
            if (goalId) {
                goalIds.add(goalId);
            }
        });
    }
    if (Array.isArray(investibleData)) {
        investibleData.forEach(item => {
            const goalId = utils.normalizeString(item?.goalId, '');
            if (goalId) {
                goalIds.add(goalId);
            }
        });
    }
    if (Array.isArray(summaryData)) {
        summaryData.forEach(item => {
            const goalId = utils.normalizeString(item?.goalId, '');
            if (goalId) {
                goalIds.add(goalId);
            }
        });
    }
    return goalIds;
}

function buildGoalBucketAssignmentMap({
    performanceData,
    investibleData,
    summaryData,
    getAssignedBucket,
    seedAssignedBucket
}) {
    const goalIds = collectGoalIdSetFromApiData(performanceData, investibleData, summaryData);
    if (goalIds.size === 0) {
        return {};
    }
    const investibleMap = utils.indexBy(investibleData, item => item?.goalId);
    const summaryMap = utils.indexBy(summaryData, item => item?.goalId);
    const getBucket = typeof getAssignedBucket === 'function' ? getAssignedBucket : () => null;
    const seedBucket = typeof seedAssignedBucket === 'function' ? seedAssignedBucket : null;
    const bucketById = {};

    Array.from(goalIds).forEach(goalId => {
        const assignedBucket = utils.normalizeString(getBucket(goalId), '');
        const wasCleared = readEndowusStore().clearedGoalBuckets[goalId] === true
            || Storage.get(storageKeys.goalBucketCleared(goalId), false) === true;
        if (assignedBucket) {
            bucketById[goalId] = assignedBucket;
            return;
        }
        const invest = investibleMap[goalId] || {};
        const summary = summaryMap[goalId] || {};
        const goalName = utils.normalizeString(invest.goalName || summary.goalName || '', '');
        const derivedBucket = utils.extractBucketName(goalName);
        if (!derivedBucket) {
            return;
        }
        bucketById[goalId] = derivedBucket;
        if (seedBucket && !wasCleared) {
            seedBucket(goalId, derivedBucket, { suppressSync: true });
        }
    });

    return bucketById;
}

function buildHealthStatus({ reasons, setupRequired = false }) {
    const dedupe = new Set();
    const safeReasons = Array.isArray(reasons)
        ? reasons
            .filter(reason => typeof reason === 'string' && reason.trim().length > 0)
            .filter(reason => {
                if (dedupe.has(reason)) {
                    return false;
                }
                dedupe.add(reason);
                return true;
            })
        : [];
    if (safeReasons.length === 0) {
        return {
            label: 'Healthy',
            className: 'gpv-health--healthy',
            reasons: []
        };
    }
    if (setupRequired) {
        return {
            label: 'Needs Setup',
            className: 'gpv-health--setup',
            reasons: safeReasons
        };
    }
    return {
        label: 'Needs Review',
        className: 'gpv-health--review',
        reasons: safeReasons
    };
}

function hasConfiguredAllocationIntent({ targetValues = [], fixedCount = 0 }) {
    const safeTargets = Array.isArray(targetValues) ? targetValues : [];
    return safeTargets.some(value => Number.isFinite(value) && value > 0) || fixedCount > 0;
}

function buildAttentionDriftReason(driftClass, label) {
    return driftClass === 'gpv-drift--red' ? label : null;
}

function isMaterialDriftCandidate(item) {
    if (!item || !Number.isFinite(item?.driftPercent)) {
        return false;
    }
    return Math.abs(item.driftPercent) > MATERIAL_DRIFT_RATIO;
}

function getPlanningTradeAmount(item) {
    return Math.abs(toFiniteNumber(item?.diffAmount ?? item?.driftAmount, 0));
}

function getPlanningTradeName(item) {
    return item?.displayTicker || item?.goalName || item?.name || item?.code || null;
}

function formatPlanningTradeLine(label, items) {
    const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
    if (safeItems.length === 0) {
        return null;
    }
    const formattedItems = safeItems.map(item => {
        const name = getPlanningTradeName(item);
        const amount = toFiniteNumber(item?.recommendedAmount, null) ?? getPlanningTradeAmount(item);
        if (!name || amount <= 0) {
            return null;
        }
        return `${name} ${formatMoney(amount)}`;
    }).filter(Boolean);
    if (formattedItems.length === 0) {
        return null;
    }
    return `${label}: ${formattedItems.join(' | ')}`;
}

function buildPlanningTradeLines({
    suggestedBuys,
    suggestedSells,
    triggerBuys,
    triggerSells
}) {
    const hasSuggestedBuys = Array.isArray(suggestedBuys) && suggestedBuys.length > 0;
    const hasSuggestedSells = Array.isArray(suggestedSells) && suggestedSells.length > 0;
    const lines = [];
    if (hasSuggestedBuys) {
        lines.push(formatPlanningTradeLine('Trigger sells', triggerSells));
        lines.push(formatPlanningTradeLine('Suggested buys', suggestedBuys));
    }
    if (hasSuggestedSells) {
        lines.push(formatPlanningTradeLine('Trigger buys', triggerBuys));
        lines.push(formatPlanningTradeLine('Suggested sells', suggestedSells));
    }
    return lines.filter(Boolean);
}

function selectPlanningTradesByDrift(items, direction, { materialOnly = false } = {}) {
    const comparator = direction === 'buy'
        ? item => toFiniteNumber(item?.diffAmount ?? item?.driftAmount, 0) < 0
        : item => toFiniteNumber(item?.diffAmount ?? item?.driftAmount, 0) > 0;
    return (Array.isArray(items) ? items : [])
        .filter(item => comparator(item) && (!materialOnly || isMaterialDriftCandidate(item)))
        .sort((left, right) => Math.abs(toFiniteNumber(right?.driftPercent, 0)) - Math.abs(toFiniteNumber(left?.driftPercent, 0)));
}

function buildFundingRecommendations(triggerTrades, oppositeTrades) {
    const triggerTotal = (Array.isArray(triggerTrades) ? triggerTrades : [])
        .reduce((sum, item) => sum + getPlanningTradeAmount(item), 0);
    if (triggerTotal <= 0) {
        return [];
    }
    const targetAmount = triggerTotal * 0.9;
    let runningTotal = 0;
    const recommendations = [];
    (Array.isArray(oppositeTrades) ? oppositeTrades : []).forEach(item => {
        if (runningTotal >= targetAmount) {
            return;
        }
        const amount = getPlanningTradeAmount(item);
        if (amount <= 0) {
            return;
        }
        const remainingAmount = Math.max(targetAmount - runningTotal, 0);
        const recommendedAmount = Math.min(amount, remainingAmount || amount);
        runningTotal += recommendedAmount;
        recommendations.push({
            ...item,
            recommendedAmount: Number(recommendedAmount.toFixed(2))
        });
    });
    return recommendations;
}

function buildTriggerSubset(triggerTrades, fundedTrades) {
    const fundedTotal = (Array.isArray(fundedTrades) ? fundedTrades : [])
        .reduce((sum, item) => sum + (toFiniteNumber(item?.recommendedAmount, null) ?? getPlanningTradeAmount(item)), 0);
    if (fundedTotal <= 0) {
        return [];
    }
    let runningTotal = 0;
    const triggers = [];
    (Array.isArray(triggerTrades) ? triggerTrades : []).forEach(item => {
        if (runningTotal >= fundedTotal) {
            return;
        }
        const amount = getPlanningTradeAmount(item);
        if (amount <= 0) {
            return;
        }
        const remainingAmount = Math.max(fundedTotal - runningTotal, 0);
        const triggerAmount = Math.min(amount, remainingAmount || amount);
        runningTotal += triggerAmount;
        triggers.push({
            ...item,
            recommendedAmount: Number(triggerAmount.toFixed(2))
        });
    });
    return triggers;
}

function buildPlanningRecommendations({ buys, sells }) {
    const materialBuys = selectPlanningTradesByDrift(buys, 'buy', { materialOnly: true });
    const materialSells = selectPlanningTradesByDrift(sells, 'sell', { materialOnly: true });
    const suggestedBuys = materialSells.length > 0
        ? buildFundingRecommendations(materialSells, selectPlanningTradesByDrift(buys, 'buy'))
        : [];
    const suggestedSells = materialBuys.length > 0
        ? buildFundingRecommendations(materialBuys, selectPlanningTradesByDrift(sells, 'sell'))
        : [];
    return {
        suggestedBuys,
        suggestedSells,
        triggerBuys: buildTriggerSubset(materialBuys, suggestedSells),
        triggerSells: buildTriggerSubset(materialSells, suggestedBuys),
        buyCandidates: selectPlanningTradesByDrift(buys, 'buy'),
        sellCandidates: selectPlanningTradesByDrift(sells, 'sell'),
        materialBuys,
        materialSells,
        hasMaterialDrift: materialBuys.length > 0 || materialSells.length > 0
    };
}

function buildTargetCoverageLabel(targetTotalPercent) {
    const rounded = Number.isFinite(targetTotalPercent) ? Number(targetTotalPercent.toFixed(2)) : null;
    if (rounded === null) {
        return null;
    }
    const difference = rounded - 100;
    if (Math.abs(difference) <= TARGET_TOTAL_TOLERANCE_PERCENT) {
        return null;
    }
    if (difference < 0) {
        return `Target total is ${rounded.toFixed(2)}% (${Math.abs(difference).toFixed(2)}% unallocated)`;
    }
    return `Target total is ${rounded.toFixed(2)}% (${difference.toFixed(2)}% over-allocated)`;
}

function buildAssignedCoverageText(assignedPercent) {
    const safeAssigned = Number.isFinite(assignedPercent) ? assignedPercent : 0;
    const roundedAssigned = Number(safeAssigned.toFixed(2));
    const difference = roundedAssigned - 100;
    if (Math.abs(difference) <= TARGET_TOTAL_TOLERANCE_PERCENT) {
        return `${roundedAssigned.toFixed(2)}% assigned`;
    }
    if (difference < 0) {
        return `${roundedAssigned.toFixed(2)}% assigned, ${Math.abs(difference).toFixed(2)}% remaining`;
    }
    return `${roundedAssigned.toFixed(2)}% assigned, ${difference.toFixed(2)}% overallocated`;
}

function calculateRecommendedContributionSplit(goalModels, additionalAmount) {
    const numericAmount = toFiniteNumber(additionalAmount, null);
    if (numericAmount === null || numericAmount <= 0 || !Array.isArray(goalModels)) {
        return [];
    }
    const candidates = goalModels
        .filter(goal => goal && goal.isFixed !== true && Number.isFinite(goal.diffAmount) && goal.diffAmount < 0)
        .map(goal => ({
            goalId: goal.goalId,
            goalName: goal.goalName,
            neededAmount: Math.abs(goal.diffAmount)
        }));
    const totalNeed = candidates.reduce((sum, item) => sum + item.neededAmount, 0);
    if (totalNeed <= 0) {
        return [];
    }
    return candidates.map(item => {
        const share = item.neededAmount / totalNeed;
        return {
            goalId: item.goalId,
            goalName: item.goalName,
            amount: Number((numericAmount * share).toFixed(2))
        };
    });
}

function buildPlanningModel(goalTypeModel) {
    const goalModels = Array.isArray(goalTypeModel?.goals) ? goalTypeModel.goals : [];
    const adjustedTotal = toFiniteNumber(goalTypeModel?.adjustedTotal, null);
    const targetValues = [];
    let fixedCount = 0;
    const targetCoveragePercent = goalModels.reduce((sum, goal) => {
        if (goal?.isFixed === true) {
            fixedCount += 1;
            const fixedTargetPercent = calculateFixedTargetPercent(
                toFiniteNumber(goal?.endingBalanceAmount, 0),
                adjustedTotal
            );
            if (fixedTargetPercent === null) {
                return sum;
            }
            return sum + fixedTargetPercent;
        }
        const targetPercent = toFiniteNumber(goal?.effectiveTargetPercent, null);
        if (targetPercent === null) {
            return sum;
        }
        targetValues.push(targetPercent);
        return sum + targetPercent;
    }, 0);
    const coverageLabel = hasConfiguredAllocationIntent({ targetValues, fixedCount })
        ? buildTargetCoverageLabel(targetCoveragePercent)
        : null;

    const underweightCandidates = goalModels
        .filter(goal => Number.isFinite(goal?.diffAmount) && goal.diffAmount < 0)
        .sort((left, right) => Math.abs(right.diffAmount) - Math.abs(left.diffAmount));
    const overweightCandidates = goalModels
        .filter(goal => Number.isFinite(goal?.diffAmount) && goal.diffAmount > 0)
        .sort((left, right) => Math.abs(right.diffAmount) - Math.abs(left.diffAmount));
    const planningRecommendations = buildPlanningRecommendations({
        buys: underweightCandidates,
        sells: overweightCandidates
    });

    const projectedAmount = toFiniteNumber(goalTypeModel?.projectedAmount, 0);
    const scenarioAmount = projectedAmount > 0 ? projectedAmount : 0;
    const scenarioSplit = calculateRecommendedContributionSplit(goalModels, scenarioAmount);

    return {
        adjustedTotal,
        targetCoveragePercent,
        targetCoverageLabel: coverageLabel,
        scenarioAmount,
        scenarioSplit,
        suggestedBuys: planningRecommendations.suggestedBuys,
        suggestedSells: planningRecommendations.suggestedSells,
        triggerBuys: planningRecommendations.triggerBuys,
        triggerSells: planningRecommendations.triggerSells,
        buyCandidates: planningRecommendations.buyCandidates,
        sellCandidates: planningRecommendations.sellCandidates,
        materialBuys: planningRecommendations.materialBuys,
        materialSells: planningRecommendations.materialSells,
        hasMaterialDrift: planningRecommendations.hasMaterialDrift
    };
}

function buildBucketPlanningModel(goalTypeModels) {
    const models = Array.isArray(goalTypeModels) ? goalTypeModels.filter(Boolean) : [];
    if (models.length === 0) {
        return null;
    }
    const coverageIssues = [];
    const scenarioByGoal = {};
    let scenarioAmount = 0;
    const bucketBuyCandidates = [];
    const bucketSellCandidates = [];
    const bucketMaterialBuys = [];
    const bucketMaterialSells = [];

    models.forEach(goalTypeModel => {
        const planning = goalTypeModel?.planning;
        if (!planning) {
            return;
        }
        if (planning.targetCoverageLabel) {
            coverageIssues.push(`${goalTypeModel.displayName}: ${planning.targetCoverageLabel}`);
        }
        scenarioAmount += toFiniteNumber(planning.scenarioAmount, 0);
        const split = Array.isArray(planning.scenarioSplit) ? planning.scenarioSplit : [];
        split.forEach(item => {
            const goalId = utils.normalizeString(item?.goalId, '');
            if (!goalId) {
                return;
            }
            if (!scenarioByGoal[goalId]) {
                scenarioByGoal[goalId] = {
                    goalId,
                    goalName: utils.normalizeString(item.goalName, goalId),
                    amount: 0
                };
            }
            scenarioByGoal[goalId].amount += toFiniteNumber(item?.amount, 0);
        });
        bucketBuyCandidates.push(...(Array.isArray(planning.buyCandidates) ? planning.buyCandidates : []));
        bucketSellCandidates.push(...(Array.isArray(planning.sellCandidates) ? planning.sellCandidates : []));
        bucketMaterialBuys.push(...(Array.isArray(planning.materialBuys) ? planning.materialBuys : []));
        bucketMaterialSells.push(...(Array.isArray(planning.materialSells) ? planning.materialSells : []));
    });

    const scenarioSplit = Object.values(scenarioByGoal)
        .sort((left, right) => right.amount - left.amount)
        .slice(0, 4)
        .map(item => ({
            ...item,
            amount: Number(item.amount.toFixed(2))
        }));
    const sortedBucketBuyCandidates = selectPlanningTradesByDrift(bucketBuyCandidates, 'buy');
    const sortedBucketSellCandidates = selectPlanningTradesByDrift(bucketSellCandidates, 'sell');
    const sortedBucketMaterialBuys = selectPlanningTradesByDrift(bucketMaterialBuys, 'buy', { materialOnly: true });
    const sortedBucketMaterialSells = selectPlanningTradesByDrift(bucketMaterialSells, 'sell', { materialOnly: true });
    const suggestedBuys = buildFundingRecommendations(sortedBucketMaterialSells, sortedBucketBuyCandidates);
    const suggestedSells = buildFundingRecommendations(sortedBucketMaterialBuys, sortedBucketSellCandidates);

    return {
        coverageIssues,
        scenarioAmount,
        scenarioSplit,
        suggestedBuys,
        suggestedSells,
        triggerBuys: buildTriggerSubset(sortedBucketMaterialBuys, suggestedSells),
        triggerSells: buildTriggerSubset(sortedBucketMaterialSells, suggestedBuys),
        hasMaterialDrift: sortedBucketMaterialBuys.length > 0 || sortedBucketMaterialSells.length > 0
    };
}

function buildNeedsAttentionItemsForSummary(summaryViewModel) {
    if (!summaryViewModel || !Array.isArray(summaryViewModel.buckets)) {
        return [];
    }
    const items = [];
    summaryViewModel.buckets.forEach(bucket => {
        const goalTypes = Array.isArray(bucket.goalTypes) ? bucket.goalTypes : [];
        goalTypes.forEach(goalType => {
            if (goalType.targetCoverageIssue) {
                items.push({
                    bucketName: bucket.bucketName,
                    label: `${bucket.bucketName}: ${goalType.targetCoverageIssue}`,
                    reason: goalType.targetCoverageIssue
                });
            }
        });
        const healthReasons = Array.isArray(bucket.health?.reasons) ? bucket.health.reasons : [];
        healthReasons.forEach(reason => {
            if (items.some(item => item.bucketName === bucket.bucketName && item.reason === reason)) {
                return;
            }
            items.push({
                bucketName: bucket.bucketName,
                label: `${bucket.bucketName}: ${reason}`,
                reason
            });
        });
    });
    return items.slice(0, 6);
}

function buildNeedsAttentionItemsForFsmOverview(overviewModel) {
    if (!overviewModel || !Array.isArray(overviewModel.cards)) {
        return [];
    }
    const items = [];
    overviewModel.cards.forEach(card => {
        const reasons = Array.isArray(card.health?.reasons) ? card.health.reasons : [];
        reasons.forEach(reason => {
            items.push({
                scopeId: card.id,
                label: `${card.label}: ${reason}`,
                reason
            });
        });
    });
    return items.slice(0, 6);
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
    function buildMergedInvestmentData(performanceData, investibleData, summaryData, goalBucketById = {}) {
        if (!performanceData || !investibleData || !summaryData) {
            return null;
        }

        if (!Array.isArray(performanceData) || !Array.isArray(investibleData) || !Array.isArray(summaryData)) {
            return null;
        }

        const investibleMap = utils.indexBy(investibleData, item => item?.goalId);
        const summaryMap = utils.indexBy(summaryData, item => item?.goalId);
        const performanceMap = utils.indexBy(performanceData, item => item?.goalId);
        const goalIds = Array.from(new Set([
            ...performanceData.map(item => utils.normalizeString(item?.goalId, '')).filter(Boolean),
            ...investibleData.map(item => utils.normalizeString(item?.goalId, '')).filter(Boolean),
            ...summaryData.map(item => utils.normalizeString(item?.goalId, '')).filter(Boolean)
        ]));

        const bucketMap = {};

        goalIds.forEach(goalId => {
            const perf = performanceMap[goalId] || {};
            const invest = investibleMap[goalId] || {};
            const summary = summaryMap[goalId] || {};
            const goalName = utils.normalizeString(invest.goalName || summary.goalName || '', '');
            const configuredBucket = utils.normalizeString(goalBucketById?.[goalId], '');
            // Extract bucket name using "Bucket Name - Goal Description" convention
            const goalBucket = configuredBucket || utils.extractBucketName(goalName);
            // Note: investible API `totalInvestmentAmount` is misnamed and represents ending balance.
            // We map it internally to endingBalanceAmount to avoid confusing it with principal invested.
            const performanceEndingBalanceRaw = resolveRawAmountValue(perf.totalInvestmentValue);
            const performanceEndingBalance = extractAmount(perf.totalInvestmentValue);
            const pendingProcessingAmount = extractAmount(perf.pendingProcessingAmount);
            const investEndingBalanceRaw = resolveRawAmountValue(invest.totalInvestmentAmount);
            const investEndingBalance = extractAmount(invest.totalInvestmentAmount);
            const usingPerformanceEndingBalance = performanceEndingBalance !== null;
            let endingBalanceAmount = performanceEndingBalance !== null
                ? performanceEndingBalance
                : investEndingBalance;
            let rawEndingBalanceAmount = usingPerformanceEndingBalance
                ? performanceEndingBalanceRaw
                : investEndingBalanceRaw;
            if (Number.isFinite(endingBalanceAmount) && Number.isFinite(pendingProcessingAmount)) {
                endingBalanceAmount += pendingProcessingAmount;
                const shouldUseComputedRawEndingBalance = pendingProcessingAmount !== 0
                    || (rawEndingBalanceAmount === null && Number.isFinite(endingBalanceAmount));
                if (shouldUseComputedRawEndingBalance) {
                    rawEndingBalanceAmount = endingBalanceAmount;
                }
            }
            const cumulativeReturn = extractAmount(perf.totalCumulativeReturn);
            const safeEndingBalanceAmount = Number.isFinite(endingBalanceAmount) ? endingBalanceAmount : 0;
            
            const goalObj = {
                goalId,
                goalName: goalName,
                goalBucket: goalBucket,
                goalType: utils.normalizeString(
                    invest.investmentGoalType || summary.investmentGoalType || '',
                    UNKNOWN_GOAL_TYPE
                ),
                endingBalanceAmount: Number.isFinite(endingBalanceAmount) ? endingBalanceAmount : null,
                rawEndingBalanceAmount,
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
            if (bucketMap[goalBucket][goalObj.goalType].totalCumulativeReturn !== null && Number.isFinite(cumulativeReturn)) {
                bucketMap[goalBucket][goalObj.goalType].totalCumulativeReturn += cumulativeReturn;
            } else {
                bucketMap[goalBucket][goalObj.goalType].totalCumulativeReturn = null;
            }
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

    function hydrateVisibleGoalMetricRows(contentRoot, goalIds) {
        if (!contentRoot || !Array.isArray(goalIds) || !goalIds.length) {
            return;
        }
        const rowsByGoalId = {};
        const metricsRows = Array.from(contentRoot.querySelectorAll('tr.gpv-goal-metrics-row'));
        metricsRows.forEach(row => {
            const rowGoalId = row.dataset.goalId;
            if (rowGoalId) {
                rowsByGoalId[rowGoalId] = row;
            }
        });

        goalIds.forEach(goalId => {
            const metricsRow = rowsByGoalId[goalId];
            if (!metricsRow) {
                return;
            }
            const windowReturns = getGoalWindowReturns(goalId);
            const windowReturnDisplays = buildWindowReturnDisplays(windowReturns);
            Object.values(PERFORMANCE_WINDOWS).forEach(window => {
                const value = metricsRow.querySelector(
                    `.gpv-goal-metrics-value[data-window-key="${window.key}"]`
                );
                if (!value) {
                    return;
                }
                value.textContent = windowReturnDisplays[window.key] ?? '-';
                value.classList.remove('positive', 'negative');
                const numericValue = windowReturns[window.key];
                if (typeof numericValue === 'number' && Number.isFinite(numericValue)) {
                    value.classList.add(numericValue >= 0 ? 'positive' : 'negative');
                }
            });
        });
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

    function resolveRawAmountValue(value) {
        if (typeof value === 'number') {
            return Number.isFinite(value) ? value : null;
        }
        if (typeof value === 'string') {
            if (value.trim() === '') {
                return null;
            }
            return Number.isFinite(Number(value)) ? value : null;
        }
        if (value && typeof value === 'object') {
            const directAmount = resolveRawAmountValue(value.amount);
            if (directAmount !== null) {
                return directAmount;
            }
            return resolveRawAmountValue(value.display?.amount);
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
        const aggregates = initializePerformanceAggregates();
        const weights = initializePerformanceWeights();

        responses.forEach(response => {
            accumulatePerformanceTotals(aggregates, response);
            accumulateWeightedReturns(weights, response);
        });

        const endingBalanceAmount = resolveEndingBalanceAmount(
            aggregates.endingBalanceAmount,
            aggregates.endingBalanceSeen,
            mergedTimeSeries
        );

        const weighted = computeWeightedPerformanceValues(weights);

        // Note: We intentionally do not infer netInvestmentAmount from mergedTimeSeries, because
        // the time series typically represents market value over time, not cumulative net investment.
        // Using market value as net investment would produce inaccurate financial metrics.

        return {
            totalReturnPercent: weighted.totalReturnPercent,
            simpleReturnPercent: weighted.simpleReturnPercent,
            twrPercent: weighted.twrPercent,
            annualisedIrrPercent: weighted.annualisedIrrPercent,
            totalReturnAmount: aggregates.totalReturnSeen ? aggregates.totalReturnAmount : null,
            netFeesAmount: aggregates.netFeesSeen ? aggregates.netFeesAmount : null,
            netInvestmentAmount: aggregates.netInvestmentSeen ? aggregates.netInvestmentAmount : null,
            endingBalanceAmount
        };
    }

    function initializePerformanceAggregates() {
        return {
            totalReturnAmount: 0,
            totalReturnSeen: false,
            netFeesAmount: 0,
            netFeesSeen: false,
            netInvestmentAmount: 0,
            netInvestmentSeen: false,
            endingBalanceAmount: 0,
            endingBalanceSeen: false
        };
    }

    function initializePerformanceWeights() {
        return {
            netInvestments: [],
            totalReturns: [],
            simpleReturns: [],
            twrReturns: [],
            annualisedIrrReturns: []
        };
    }

    function accumulatePerformanceTotals(aggregates, response) {
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
            aggregates.totalReturnSeen = true;
            aggregates.totalReturnAmount += totalReturnValue;
        }
        if (Number.isFinite(accessFeeValue) || Number.isFinite(trailerFeeValue)) {
            aggregates.netFeesSeen = true;
            aggregates.netFeesAmount += (Number.isFinite(accessFeeValue) ? accessFeeValue : 0)
                - (Number.isFinite(trailerFeeValue) ? trailerFeeValue : 0);
        }
        if (Number.isFinite(netInvestmentValue)) {
            aggregates.netInvestmentSeen = true;
            aggregates.netInvestmentAmount += netInvestmentValue;
        }
        if (Number.isFinite(endingBalanceValue)) {
            aggregates.endingBalanceSeen = true;
            aggregates.endingBalanceAmount += endingBalanceValue;
        }
        return netInvestmentValue;
    }

    function accumulateWeightedReturns(weights, response) {
        const netInvestmentValue = extractAmount(
            response?.gainOrLossTable?.netInvestment?.allTimeValue
        ) ?? extractAmount(response?.netInvestmentAmount ?? response?.netInvestment);
        const netWeight = Number.isFinite(netInvestmentValue) ? netInvestmentValue : 0;
        if (!Number.isFinite(netWeight) || netWeight <= 0) {
            return;
        }
        weights.netInvestments.push(netWeight);
        weights.totalReturns.push(response?.totalCumulativeReturnPercent);
        weights.simpleReturns.push(response?.simpleRateOfReturnPercent ?? response?.simpleReturnPercent);
        weights.twrReturns.push(
            response?.returnsTable?.twr?.allTimeValue
            ?? response?.timeWeightedReturnPercent
            ?? response?.twrPercent
        );
        weights.annualisedIrrReturns.push(
            response?.returnsTable?.annualisedIrr?.allTimeValue
        );
    }

    function computeWeightedPerformanceValues(weights) {
        return {
            totalReturnPercent: calculateWeightedAverage(weights.totalReturns, weights.netInvestments),
            simpleReturnPercent: calculateWeightedAverage(weights.simpleReturns, weights.netInvestments),
            twrPercent: calculateWeightedAverage(weights.twrReturns, weights.netInvestments),
            annualisedIrrPercent: calculateWeightedAverage(weights.annualisedIrrReturns, weights.netInvestments)
        };
    }

    function resolveEndingBalanceAmount(endingBalanceAmount, endingBalanceSeen, mergedTimeSeries) {
        if (!endingBalanceSeen && Array.isArray(mergedTimeSeries) && mergedTimeSeries.length) {
            const latest = mergedTimeSeries[mergedTimeSeries.length - 1];
            if (Number.isFinite(latest?.amount)) {
                return latest.amount;
            }
        }
        return endingBalanceSeen ? endingBalanceAmount : null;
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
        missing: Object.freeze({ __gpvStorageMissing: true }),
        get(key, fallback, context) {
            try {
                return GM_getValue(key, fallback);
            } catch (error) {
                const label = context || 'Error reading storage';
                console.error(`[Goal Portfolio Viewer] ${label}:`, error);
                return fallback;
            }
        },
        has(key, context) {
            return Storage.get(key, Storage.missing, context) !== Storage.missing;
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

    function normalizeEndowusStore(data) {
        const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        return {
            performance: Array.isArray(source.performance) ? source.performance : null,
            investible: Array.isArray(source.investible) ? source.investible : null,
            summary: Array.isArray(source.summary) ? source.summary : null,
            goalTargets: source.goalTargets && typeof source.goalTargets === 'object' ? source.goalTargets : {},
            goalFixed: source.goalFixed && typeof source.goalFixed === 'object' ? source.goalFixed : {},
            goalBuckets: source.goalBuckets && typeof source.goalBuckets === 'object' ? source.goalBuckets : {},
            clearedGoalBuckets: source.clearedGoalBuckets && typeof source.clearedGoalBuckets === 'object' ? source.clearedGoalBuckets : {}
        };
    }

    function normalizeFsmStore(data) {
        const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        return {
            holdings: Array.isArray(source.holdings) ? source.holdings : null,
            targetsByCode: source.targetsByCode && typeof source.targetsByCode === 'object' ? source.targetsByCode : {},
            fixedByCode: source.fixedByCode && typeof source.fixedByCode === 'object' ? source.fixedByCode : {},
            portfolios: normalizeFsmPortfolios(Array.isArray(source.portfolios) ? source.portfolios : []),
            assignmentByCode: source.assignmentByCode && typeof source.assignmentByCode === 'object' ? source.assignmentByCode : {}
        };
    }

    function normalizeOcbcSubPortfoliosForStore(data) {
        const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        const normalized = {};
        Object.entries(source).forEach(([viewKey, portfolios]) => {
            if (!portfolios || typeof portfolios !== 'object' || Array.isArray(portfolios)) {
                return;
            }
            const normalizedView = {};
            Object.entries(portfolios).forEach(([portfolioNo, items]) => {
                if (!Array.isArray(items)) {
                    return;
                }
                const filtered = items
                    .map(item => {
                        if (!item || typeof item !== 'object') {
                            return null;
                        }
                        const id = utils.normalizeString(item.id, '');
                        if (!id) {
                            return null;
                        }
                        return {
                            id,
                            name: utils.normalizeString(item.name, 'Untitled sub-portfolio'),
                            archived: item.archived === true,
                            legacyProductType: utils.normalizeString(item.legacyProductType, ''),
                            legacyBucketId: utils.normalizeString(item.legacyBucketId, '')
                        };
                    })
                    .filter(Boolean)
                    .map(item => ({ ...item }));
                if (filtered.length) {
                    normalizedView[portfolioNo] = filtered;
                }
            });
            if (Object.keys(normalizedView).length) {
                normalized[viewKey] = normalizedView;
            }
        });
        return normalized;
    }

    function normalizeOcbcAssignmentByCodeForStore(data) {
        const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        const normalized = {};
        Object.entries(source).forEach(([code, rawAssignment]) => {
            const normalizedCode = utils.normalizeString(code, '');
            if (!normalizedCode) {
                return;
            }
            const subPortfolioId = utils.normalizeString(
                rawAssignment && typeof rawAssignment === 'object' && !Array.isArray(rawAssignment)
                    ? rawAssignment.subPortfolioId
                    : rawAssignment,
                ''
            );
            if (subPortfolioId) {
                normalized[normalizedCode] = subPortfolioId;
            }
        });
        return normalized;
    }

    function normalizeOcbcOrderByScopeForStore(data) {
        const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        const normalized = {};
        Object.entries(source).forEach(([scope, value]) => {
            const normalizedScope = utils.normalizeString(scope, '');
            if (!normalizedScope || !Array.isArray(value)) {
                return;
            }
            const deduped = [];
            const seen = new Set();
            value.forEach(code => {
                const normalizedCode = utils.normalizeString(code, '');
                if (!normalizedCode || seen.has(normalizedCode)) {
                    return;
                }
                seen.add(normalizedCode);
                deduped.push(normalizedCode);
            });
            if (deduped.length) {
                normalized[normalizedScope] = deduped;
            }
        });
        return normalized;
    }

    function normalizeOcbcStore(data) {
        const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        return {
            holdings: source.holdings && typeof source.holdings === 'object' ? source.holdings : null,
            subPortfolios: normalizeOcbcSubPortfoliosForStore(source.subPortfolios),
            assignmentByCode: normalizeOcbcAssignmentByCodeForStore(source.assignmentByCode),
            orderByScope: normalizeOcbcOrderByScopeForStore(source.orderByScope),
            targetsByScope: source.targetsByScope && typeof source.targetsByScope === 'object' ? source.targetsByScope : {}
        };
    }

    function writePlatformStore(key, store, context) {
        return Storage.writeJson(key, store, context || `Error saving ${key} store`);
    }

    function removeLegacyPrefixedKeys(prefix, errorMessage) {
        const allKeys = typeof GM_listValues === 'function' ? GM_listValues() : [];
        allKeys.forEach(key => {
            if (key.startsWith(prefix)) {
                Storage.remove(key, errorMessage);
            }
        });
    }

    function cleanupLegacyEndowusKeys() {
        Storage.remove(STORAGE_KEYS.performance, 'Error deleting legacy Endowus performance data');
        Storage.remove(STORAGE_KEYS.investible, 'Error deleting legacy Endowus investible data');
        Storage.remove(STORAGE_KEYS.summary, 'Error deleting legacy Endowus summary data');
        removeLegacyPrefixedKeys(STORAGE_KEY_PREFIXES.goalTarget, 'Error deleting legacy Endowus target key');
        removeLegacyPrefixedKeys(STORAGE_KEY_PREFIXES.goalFixed, 'Error deleting legacy Endowus fixed key');
        removeLegacyPrefixedKeys(STORAGE_KEY_PREFIXES.goalBucket, 'Error deleting legacy Endowus bucket key');
    }

    function cleanupLegacyFsmKeys() {
        Storage.remove(STORAGE_KEYS.fsmHoldings, 'Error deleting legacy FSM holdings data');
        Storage.remove(STORAGE_KEYS.fsmPortfolios, 'Error deleting legacy FSM portfolios data');
        Storage.remove(STORAGE_KEYS.fsmAssignmentByCode, 'Error deleting legacy FSM assignment data');
        removeLegacyPrefixedKeys(STORAGE_KEY_PREFIXES.fsmTarget, 'Error deleting legacy FSM target key');
        removeLegacyPrefixedKeys(STORAGE_KEY_PREFIXES.fsmFixed, 'Error deleting legacy FSM fixed key');
    }

    function cleanupLegacyOcbcKeys() {
        Storage.remove(STORAGE_KEYS.ocbcHoldings, 'Error deleting legacy OCBC holdings data');
        Storage.remove(STORAGE_KEYS.ocbcSubPortfolios, 'Error deleting legacy OCBC sub-portfolios data');
        Storage.remove(STORAGE_KEYS.ocbcAllocationAssignmentByCode, 'Error deleting legacy OCBC assignment data');
        Storage.remove(STORAGE_KEYS.ocbcAllocationOrderByScope, 'Error deleting legacy OCBC order data');
        removeLegacyPrefixedKeys(STORAGE_KEY_PREFIXES.ocbcTarget, 'Error deleting legacy OCBC target key');
    }

    function collectLegacyEndowusConfigForStore() {
        const config = {
            goalTargets: {},
            goalFixed: {},
            goalBuckets: {},
            clearedGoalBuckets: {}
        };
        const allKeys = typeof GM_listValues === 'function' ? GM_listValues() : [];
        for (const key of allKeys) {
            if (key.startsWith(STORAGE_KEY_PREFIXES.goalTarget)) {
                const goalId = key.substring(STORAGE_KEY_PREFIXES.goalTarget.length);
                const value = Storage.get(key, null);
                if (value !== null) {
                    config.goalTargets[goalId] = value;
                }
            } else if (key.startsWith(STORAGE_KEY_PREFIXES.goalFixed)) {
                const goalId = key.substring(STORAGE_KEY_PREFIXES.goalFixed.length);
                config.goalFixed[goalId] = Storage.get(key, false) === true;
            } else if (key.startsWith(STORAGE_KEY_PREFIXES.goalBucket)) {
                if (key.endsWith('__cleared')) {
                    const goalId = key.substring(STORAGE_KEY_PREFIXES.goalBucket.length, key.length - '__cleared'.length);
                    config.clearedGoalBuckets[goalId] = Storage.get(key, false) === true;
                    continue;
                }
                const goalId = key.substring(STORAGE_KEY_PREFIXES.goalBucket.length);
                const value = utils.normalizeString(Storage.get(key, ''), '');
                if (value) {
                    config.goalBuckets[goalId] = value;
                }
            }
        }
        Object.entries(config.goalFixed).forEach(([goalId, isFixed]) => {
            if (isFixed === true) {
                delete config.goalTargets[goalId];
            }
        });
        return config;
    }

    function collectLegacyFsmConfigForStore() {
        const fsm = {
            targetsByCode: {},
            fixedByCode: {},
            portfolios: [],
            assignmentByCode: {}
        };
        const allKeys = typeof GM_listValues === 'function' ? GM_listValues() : [];
        for (const key of allKeys) {
            if (key.startsWith(STORAGE_KEY_PREFIXES.fsmTarget)) {
                const code = key.substring(STORAGE_KEY_PREFIXES.fsmTarget.length);
                const value = Storage.get(key, null);
                if (value !== null) {
                    fsm.targetsByCode[code] = value;
                }
                continue;
            }
            if (key.startsWith(STORAGE_KEY_PREFIXES.fsmFixed)) {
                const code = key.substring(STORAGE_KEY_PREFIXES.fsmFixed.length);
                fsm.fixedByCode[code] = Storage.get(key, false) === true;
            }
        }
        Object.entries(fsm.fixedByCode).forEach(([code, isFixed]) => {
            if (isFixed === true) {
                delete fsm.targetsByCode[code];
            }
        });
        fsm.portfolios = normalizeFsmPortfolios(
            Storage.readJson(STORAGE_KEYS.fsmPortfolios, data => Array.isArray(data), 'Error loading FSM portfolios') || []
        );
        const assignmentByCode = Storage.readJson(
            STORAGE_KEYS.fsmAssignmentByCode,
            data => data && typeof data === 'object' && !Array.isArray(data),
            'Error loading FSM assignments'
        ) || {};
        const validPortfolioIds = new Set(fsm.portfolios.filter(item => item.archived !== true).map(item => item.id));
        Object.entries(assignmentByCode).forEach(([code, portfolioId]) => {
            const normalizedCode = utils.normalizeString(code, '');
            if (!normalizedCode) {
                return;
            }
            const normalizedPortfolioId = utils.normalizeString(portfolioId, '');
            fsm.assignmentByCode[normalizedCode] = validPortfolioIds.has(normalizedPortfolioId)
                ? normalizedPortfolioId
                : FSM_UNASSIGNED_PORTFOLIO_ID;
        });
        return fsm;
    }

    function collectLegacyOcbcConfigForStore() {
        const targetsByScope = {};
        const allKeys = typeof GM_listValues === 'function' ? GM_listValues() : [];
        for (const key of allKeys) {
            if (!key.startsWith(STORAGE_KEY_PREFIXES.ocbcTarget)) {
                continue;
            }
            const scope = key.substring(STORAGE_KEY_PREFIXES.ocbcTarget.length);
            const value = Storage.get(key, null);
            if (value !== null) {
                targetsByScope[scope] = value;
            }
        }
        return {
            subPortfolios: normalizeOcbcSubPortfoliosForStore(
                Storage.readJson(STORAGE_KEYS.ocbcSubPortfolios, data => data && typeof data === 'object' && !Array.isArray(data), 'Error loading OCBC sub-portfolios') || {}
            ),
            assignmentByCode: normalizeOcbcAssignmentByCodeForStore(
                Storage.readJson(STORAGE_KEYS.ocbcAllocationAssignmentByCode, data => data && typeof data === 'object' && !Array.isArray(data), 'Error loading OCBC assignments') || {}
            ),
            orderByScope: normalizeOcbcOrderByScopeForStore(
                Storage.readJson(STORAGE_KEYS.ocbcAllocationOrderByScope, data => data && typeof data === 'object' && !Array.isArray(data), 'Error loading OCBC order') || {}
            ),
            targetsByScope
        };
    }

    function collectLegacyEndowusStore() {
        const config = collectLegacyEndowusConfigForStore();
        return normalizeEndowusStore({
            ...config,
            performance: Storage.readJson(STORAGE_KEYS.performance, data => Array.isArray(data), 'Error loading legacy performance data'),
            investible: Storage.readJson(STORAGE_KEYS.investible, data => Array.isArray(data), 'Error loading legacy investible data'),
            summary: Storage.readJson(STORAGE_KEYS.summary, data => Array.isArray(data), 'Error loading legacy summary data')
        });
    }

    function collectLegacyFsmStore() {
        const config = collectLegacyFsmConfigForStore();
        return normalizeFsmStore({
            ...config,
            holdings: Storage.readJson(STORAGE_KEYS.fsmHoldings, data => Array.isArray(data), 'Error loading legacy FSM holdings data')
        });
    }

    function collectLegacyOcbcStore() {
        const config = collectLegacyOcbcConfigForStore();
        return normalizeOcbcStore({
            ...config,
            holdings: Storage.readJson(
                STORAGE_KEYS.ocbcHoldings,
                data => data && typeof data === 'object' && Array.isArray(data.assets) && Array.isArray(data.liabilities),
                'Error loading legacy OCBC holdings data'
            )
        });
    }

    function hasOwnField(source, field) {
        return Boolean(source && typeof source === 'object' && !Array.isArray(source) && Object.prototype.hasOwnProperty.call(source, field));
    }

    function mergeMissingFieldsFromLegacy(rawStore, normalizedStore, legacyStore, fieldNames) {
        const merged = { ...normalizedStore };
        let didMerge = false;
        (Array.isArray(fieldNames) ? fieldNames : []).forEach(field => {
            if (hasOwnField(rawStore, field)) {
                return;
            }
            merged[field] = legacyStore[field];
            didMerge = true;
        });
        return { merged, didMerge };
    }

    function readEndowusStore() {
        const rawStored = Storage.readJson(STORAGE_KEYS.endowus, data => data && typeof data === 'object' && !Array.isArray(data));
        if (rawStored) {
            const normalized = normalizeEndowusStore(rawStored);
            const legacy = collectLegacyEndowusStore();
            const { merged, didMerge } = mergeMissingFieldsFromLegacy(
                rawStored,
                normalized,
                legacy,
                ['performance', 'investible', 'summary', 'goalTargets', 'goalFixed', 'goalBuckets', 'clearedGoalBuckets']
            );
            if (didMerge) {
                const didWrite = writePlatformStore(STORAGE_KEYS.endowus, merged, 'Error writing merged Endowus store');
                if (didWrite) {
                    cleanupLegacyEndowusKeys();
                }
                return merged;
            }
            cleanupLegacyEndowusKeys();
            return normalized;
        }
        const migrated = collectLegacyEndowusStore();
        const didWrite = writePlatformStore(STORAGE_KEYS.endowus, migrated, 'Error writing migrated Endowus store');
        if (didWrite) {
            cleanupLegacyEndowusKeys();
        }
        return migrated;
    }

    function readFsmStore() {
        const rawStored = Storage.readJson(STORAGE_KEYS.fsm, data => data && typeof data === 'object' && !Array.isArray(data));
        if (rawStored) {
            const normalized = normalizeFsmStore(rawStored);
            const legacy = collectLegacyFsmStore();
            const { merged, didMerge } = mergeMissingFieldsFromLegacy(
                rawStored,
                normalized,
                legacy,
                ['holdings', 'targetsByCode', 'fixedByCode', 'portfolios', 'assignmentByCode']
            );
            if (didMerge) {
                const didWrite = writePlatformStore(STORAGE_KEYS.fsm, merged, 'Error writing merged FSM store');
                if (didWrite) {
                    cleanupLegacyFsmKeys();
                }
                return merged;
            }
            cleanupLegacyFsmKeys();
            return normalized;
        }
        const migrated = collectLegacyFsmStore();
        const didWrite = writePlatformStore(STORAGE_KEYS.fsm, migrated, 'Error writing migrated FSM store');
        if (didWrite) {
            cleanupLegacyFsmKeys();
        }
        return migrated;
    }

    function readOcbcStore() {
        const rawStored = Storage.readJson(STORAGE_KEYS.ocbc, data => data && typeof data === 'object' && !Array.isArray(data));
        if (rawStored) {
            const normalized = normalizeOcbcStore(rawStored);
            const legacy = collectLegacyOcbcStore();
            const { merged, didMerge } = mergeMissingFieldsFromLegacy(
                rawStored,
                normalized,
                legacy,
                ['holdings', 'subPortfolios', 'assignmentByCode', 'orderByScope', 'targetsByScope']
            );
            if (didMerge) {
                const didWrite = writePlatformStore(STORAGE_KEYS.ocbc, merged, 'Error writing merged OCBC store');
                if (didWrite) {
                    cleanupLegacyOcbcKeys();
                }
                return merged;
            }
            cleanupLegacyOcbcKeys();
            return normalized;
        }
        const migrated = collectLegacyOcbcStore();
        const didWrite = writePlatformStore(STORAGE_KEYS.ocbc, migrated, 'Error writing migrated OCBC store');
        if (didWrite) {
            cleanupLegacyOcbcKeys();
        }
        return migrated;
    }

    function updateEndowusStore(updater, context = 'Error saving Endowus store') {
        const current = readEndowusStore();
        const updated = normalizeEndowusStore(typeof updater === 'function' ? updater(current) : current);
        const didWrite = writePlatformStore(STORAGE_KEYS.endowus, updated, context);
        if (didWrite) {
            cleanupLegacyEndowusKeys();
        }
        return { value: updated, success: didWrite };
    }

    function updateFsmStore(updater, context = 'Error saving FSM store') {
        const current = readFsmStore();
        const updated = normalizeFsmStore(typeof updater === 'function' ? updater(current) : current);
        const didWrite = writePlatformStore(STORAGE_KEYS.fsm, updated, context);
        if (didWrite) {
            cleanupLegacyFsmKeys();
        }
        return { value: updated, success: didWrite };
    }

    function updateOcbcStore(updater, context = 'Error saving OCBC store') {
        const current = readOcbcStore();
        const updated = normalizeOcbcStore(typeof updater === 'function' ? updater(current) : current);
        const didWrite = writePlatformStore(STORAGE_KEYS.ocbc, updated, context);
        if (didWrite) {
            cleanupLegacyOcbcKeys();
        }
        return { value: updated, success: didWrite };
    }

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
        const remember = Storage.get(SYNC_STORAGE_KEYS.rememberKey, false) === true;
        if (!remember) {
            return null;
        }
        const stored = Storage.get(SYNC_STORAGE_KEYS.rememberedMasterKey, null);
        const bytes = base64ToBytes(stored);
        if (bytes && bytes.length) {
            return bytes;
        }
        clearRememberedMasterKey();
        return null;
    }

    function setRememberedMasterKey(masterKey, remember) {
        if (!remember) {
            clearRememberedMasterKey();
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
    const STARTUP_SYNC_RETRY_DELAY_MS = 3000;
    let autoSyncTimer = null;
    let startupSyncTimer = null;
    let syncOnChangeTimer = null;
    let syncOnChangeRetryTimer = null;
    let sessionMasterKey = getRememberedMasterKey();

    function getStoredServerUrl(fallback = '', options = {}) {
        const enforceAllowed = options.enforceAllowed !== false;
        const stored = Storage.get(SYNC_STORAGE_KEYS.serverUrl, fallback);
        const normalized = utils.normalizeServerUrl(stored || '');
        if (normalized && enforceAllowed) {
            utils.assertAllowedSyncServerUrl(normalized);
        }
        return normalized;
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

    function clearCryptoLockError() {
        const message = String(lastError || lastErrorMeta?.userMessage || '');
        const isCryptoLockError = lastErrorMeta?.category === 'crypto' &&
            /unlock (?:sync|encryption key)|encryption key (?:not set|required)/i.test(message);
        if (!isCryptoLockError) {
            return;
        }
        lastError = null;
        lastErrorMeta = null;
        if (syncStatus === SYNC_STATUS.error) {
            syncStatus = SYNC_STATUS.idle;
        }
    }

    async function hashConfigData(config) {
        if (!config || typeof config !== 'object') {
            return null;
        }
        const normalized = normalizeSyncConfig(config) || config;
        const sanitized = JSON.parse(JSON.stringify(normalized));
        delete sanitized.timestamp;
        if (sanitized.metadata && typeof sanitized.metadata === 'object') {
            delete sanitized.metadata.lastModified;
        }
        delete sanitized.metadata;
        if (sanitized.platforms && typeof sanitized.platforms === 'object') {
            if (sanitized.platforms.endowus && typeof sanitized.platforms.endowus === 'object') {
                delete sanitized.platforms.endowus.timestamp;
            }
            if (sanitized.platforms.fsm && typeof sanitized.platforms.fsm === 'object') {
                delete sanitized.platforms.fsm.timestamp;
            }
            if (sanitized.platforms.ocbc && typeof sanitized.platforms.ocbc === 'object') {
                delete sanitized.platforms.ocbc.timestamp;
            }
        }
        return SyncEncryption.hash(JSON.stringify(sanitized));
    }

    function isFiniteTimestamp(value) {
        return typeof value === 'number' && Number.isFinite(value);
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

        const response = await requestJson(`${serverUrl}/auth/refresh`, {
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
        const serverUrl = getStoredServerUrl('', { enforceAllowed: false });
        const userId = Storage.get(SYNC_STORAGE_KEYS.userId, null);
        return Boolean(serverUrl && utils.isAllowedSyncServerUrl(serverUrl) && userId && hasValidRefreshToken());
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

    function normalizeOcbcSubPortfoliosConfig(data) {
        const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        const normalized = {};
        Object.entries(source).forEach(([viewKey, portfolios]) => {
            if (!portfolios || typeof portfolios !== 'object' || Array.isArray(portfolios)) {
                return;
            }
            const normalizedView = {};
            Object.entries(portfolios).forEach(([portfolioNo, items]) => {
                if (!Array.isArray(items)) {
                    return;
                }
                const filtered = items
                    .map(item => {
                        if (!item || typeof item !== 'object') {
                            return null;
                        }
                        const id = utils.normalizeString(item.id, '');
                        if (!id) {
                            return null;
                        }
                        return {
                            id,
                            name: utils.normalizeString(item.name, 'Untitled sub-portfolio'),
                            archived: item.archived === true,
                            legacyProductType: utils.normalizeString(item.legacyProductType, ''),
                            legacyBucketId: utils.normalizeString(item.legacyBucketId, '')
                        };
                    })
                    .filter(Boolean)
                    .map(item => ({ ...item }));
                if (filtered.length) {
                    normalizedView[portfolioNo] = filtered;
                }
            });
            if (Object.keys(normalizedView).length) {
                normalized[viewKey] = normalizedView;
            }
        });
        return normalized;
    }

    function normalizeOcbcAssignmentByCodeConfig(data) {
        const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        const normalized = {};
        Object.entries(source).forEach(([code, rawAssignment]) => {
            const normalizedCode = utils.normalizeString(code, '');
            if (!normalizedCode) {
                return;
            }
            const subPortfolioId = utils.normalizeString(
                rawAssignment && typeof rawAssignment === 'object' && !Array.isArray(rawAssignment)
                    ? rawAssignment.subPortfolioId
                    : rawAssignment,
                ''
            );
            if (subPortfolioId) {
                normalized[normalizedCode] = subPortfolioId;
            }
        });
        return normalized;
    }

    function normalizeOcbcOrderByScopeEntries(data) {
        const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        const normalized = {};
        Object.entries(source).forEach(([scope, value]) => {
            const normalizedScope = utils.normalizeString(scope, '');
            if (!normalizedScope || !Array.isArray(value)) {
                return;
            }
            const deduped = [];
            const seen = new Set();
            value.forEach(code => {
                const normalizedCode = utils.normalizeString(code, '');
                if (!normalizedCode || seen.has(normalizedCode)) {
                    return;
                }
                seen.add(normalizedCode);
                deduped.push(normalizedCode);
            });
            if (deduped.length) {
                normalized[normalizedScope] = deduped;
            }
        });
        return normalized;
    }

    function normalizeSyncConfig(config) {
        if (!config || typeof config !== 'object') {
            return null;
        }
        if (typeof config.version === 'number' && config.version >= 2 && config.platforms && typeof config.platforms === 'object') {
            const endowus = config.platforms.endowus && typeof config.platforms.endowus === 'object'
                ? config.platforms.endowus
                : { goalTargets: {}, goalFixed: {}, timestamp: config.timestamp || Date.now() };
            const fsm = config.platforms.fsm && typeof config.platforms.fsm === 'object'
                ? config.platforms.fsm
                : { targetsByCode: {}, fixedByCode: {}, timestamp: config.timestamp || Date.now() };
            const ocbc = config.platforms.ocbc && typeof config.platforms.ocbc === 'object'
                ? config.platforms.ocbc
                : { subPortfolios: {}, assignmentByCode: {}, targetsByScope: {}, timestamp: config.timestamp || Date.now() };
            return {
                version: 2,
                platforms: {
                    endowus: {
                        goalTargets: endowus.goalTargets && typeof endowus.goalTargets === 'object' ? endowus.goalTargets : {},
                        goalFixed: endowus.goalFixed && typeof endowus.goalFixed === 'object' ? endowus.goalFixed : {},
                        goalBuckets: endowus.goalBuckets && typeof endowus.goalBuckets === 'object' ? endowus.goalBuckets : {},
                        clearedGoalBuckets: endowus.clearedGoalBuckets && typeof endowus.clearedGoalBuckets === 'object' ? endowus.clearedGoalBuckets : {},
                        timestamp: typeof endowus.timestamp === 'number' ? endowus.timestamp : (config.timestamp || Date.now())
                    },
                    fsm: {
                        targetsByCode: fsm.targetsByCode && typeof fsm.targetsByCode === 'object' ? fsm.targetsByCode : {},
                        fixedByCode: fsm.fixedByCode && typeof fsm.fixedByCode === 'object' ? fsm.fixedByCode : {},
                        portfolios: normalizeFsmPortfolios(Array.isArray(fsm.portfolios) ? fsm.portfolios : []),
                        assignmentByCode: fsm.assignmentByCode && typeof fsm.assignmentByCode === 'object' ? fsm.assignmentByCode : {},
                        timestamp: typeof fsm.timestamp === 'number' ? fsm.timestamp : (config.timestamp || Date.now())
                    },
                    ocbc: {
                        subPortfolios: normalizeOcbcSubPortfoliosConfig(ocbc.subPortfolios),
                        assignmentByCode: normalizeOcbcAssignmentByCodeConfig(ocbc.assignmentByCode),
                        orderByScope: normalizeOcbcOrderByScopeEntries(ocbc.orderByScope),
                        targetsByScope: ocbc.targetsByScope && typeof ocbc.targetsByScope === 'object' ? ocbc.targetsByScope : {},
                        timestamp: typeof ocbc.timestamp === 'number' ? ocbc.timestamp : (config.timestamp || Date.now())
                    }
                },
                metadata: config.metadata && typeof config.metadata === 'object' ? config.metadata : {},
                timestamp: typeof config.timestamp === 'number' ? config.timestamp : Date.now()
            };
        }
        return {
            version: 2,
            platforms: {
                endowus: {
                    goalTargets: config.goalTargets && typeof config.goalTargets === 'object' ? config.goalTargets : {},
                    goalFixed: config.goalFixed && typeof config.goalFixed === 'object' ? config.goalFixed : {},
                    goalBuckets: config.goalBuckets && typeof config.goalBuckets === 'object' ? config.goalBuckets : {},
                    clearedGoalBuckets: config.clearedGoalBuckets && typeof config.clearedGoalBuckets === 'object' ? config.clearedGoalBuckets : {},
                    timestamp: typeof config.timestamp === 'number' ? config.timestamp : Date.now()
                },
                fsm: {
                    targetsByCode: {},
                    fixedByCode: {},
                    portfolios: [],
                    assignmentByCode: {},
                    timestamp: typeof config.timestamp === 'number' ? config.timestamp : Date.now()
                },
                ocbc: {
                    subPortfolios: {},
                    assignmentByCode: {},
                    orderByScope: {},
                    targetsByScope: {},
                    timestamp: typeof config.timestamp === 'number' ? config.timestamp : Date.now()
                }
            },
            metadata: {},
            timestamp: typeof config.timestamp === 'number' ? config.timestamp : Date.now()
        };
    }

    /**
     * Collect syncable config data
     */
    function collectConfigData() {
        const timestamp = Date.now();
        const endowus = readEndowusStore();
        const fsm = readFsmStore();
        const ocbc = readOcbcStore();
        return {
            version: 2,
            platforms: {
                endowus: {
                    goalTargets: endowus.goalTargets,
                    goalFixed: endowus.goalFixed,
                    goalBuckets: endowus.goalBuckets,
                    clearedGoalBuckets: endowus.clearedGoalBuckets,
                    timestamp
                },
                fsm: {
                    targetsByCode: fsm.targetsByCode,
                    fixedByCode: fsm.fixedByCode,
                    portfolios: fsm.portfolios,
                    assignmentByCode: fsm.assignmentByCode,
                    timestamp
                },
                ocbc: {
                    subPortfolios: ocbc.subPortfolios,
                    assignmentByCode: ocbc.assignmentByCode,
                    orderByScope: ocbc.orderByScope,
                    targetsByScope: ocbc.targetsByScope,
                    timestamp
                }
            },
            metadata: {
                lastModified: timestamp
            },
            timestamp
        };
    }

    /**
     * Apply config data to local storage
     */
    function applyConfigData(config) {
        const normalized = normalizeSyncConfig(config);
        if (!normalized) {
            throw new Error('Invalid config data');
        }

        const endowus = normalized.platforms.endowus || {};
        const endowusTargets = endowus.goalTargets && typeof endowus.goalTargets === 'object' ? endowus.goalTargets : {};
        const endowusFixed = endowus.goalFixed && typeof endowus.goalFixed === 'object' ? endowus.goalFixed : {};
        const endowusBuckets = endowus.goalBuckets && typeof endowus.goalBuckets === 'object' ? endowus.goalBuckets : {};
        const clearedGoalBuckets = endowus.clearedGoalBuckets && typeof endowus.clearedGoalBuckets === 'object' ? endowus.clearedGoalBuckets : {};

        const sanitizedEndowusTargets = Object.entries(endowusTargets).reduce((acc, [goalId, value]) => {
            if (endowusFixed[goalId] !== true) {
                acc[goalId] = value;
            }
            return acc;
        }, {});
        updateEndowusStore(current => ({
            ...current,
            goalTargets: sanitizedEndowusTargets,
            goalFixed: Object.entries(endowusFixed).reduce((acc, [goalId, value]) => {
                acc[goalId] = value === true;
                return acc;
            }, {}),
            goalBuckets: Object.entries(endowusBuckets).reduce((acc, [goalId, value]) => {
                const normalizedBucket = utils.normalizeString(value, '');
                if (normalizedBucket) {
                    acc[goalId] = normalizedBucket;
                }
                return acc;
            }, {}),
            clearedGoalBuckets: Object.entries(clearedGoalBuckets).reduce((acc, [goalId, value]) => {
                if (value === true) {
                    acc[goalId] = true;
                }
                return acc;
            }, {})
        }));

        const fsm = normalized.platforms.fsm || {};
        const fsmTargets = fsm.targetsByCode && typeof fsm.targetsByCode === 'object' ? fsm.targetsByCode : {};
        const fsmFixed = fsm.fixedByCode && typeof fsm.fixedByCode === 'object' ? fsm.fixedByCode : {};
        const fsmPortfolios = normalizeFsmPortfolios(Array.isArray(fsm.portfolios) ? fsm.portfolios : []);
        const fsmAssignmentByCode = fsm.assignmentByCode && typeof fsm.assignmentByCode === 'object' ? fsm.assignmentByCode : {};

        const sanitizedFsmTargets = Object.entries(fsmTargets).reduce((acc, [code, value]) => {
            if (fsmFixed[code] !== true) {
                acc[code] = value;
            }
            return acc;
        }, {});

        const validPortfolioIds = new Set(fsmPortfolios.filter(item => item.archived !== true).map(item => item.id));
        const sanitizedAssignments = {};
        Object.entries(fsmAssignmentByCode).forEach(([code, portfolioId]) => {
            const normalizedCode = utils.normalizeString(code, '');
            if (!normalizedCode) {
                return;
            }
            const normalizedPortfolioId = utils.normalizeString(portfolioId, '');
            sanitizedAssignments[normalizedCode] = validPortfolioIds.has(normalizedPortfolioId)
                ? normalizedPortfolioId
                : FSM_UNASSIGNED_PORTFOLIO_ID;
        });
        updateFsmStore(current => ({
            ...current,
            targetsByCode: sanitizedFsmTargets,
            fixedByCode: Object.entries(fsmFixed).reduce((acc, [code, value]) => {
                acc[code] = value === true;
                return acc;
            }, {}),
            portfolios: fsmPortfolios,
            assignmentByCode: sanitizedAssignments
        }));

        const ocbc = normalized.platforms.ocbc || {};
        const ocbcSubPortfolios = normalizeOcbcSubPortfoliosConfig(ocbc.subPortfolios);
        const ocbcAssignmentByCode = normalizeOcbcAssignmentByCodeConfig(ocbc.assignmentByCode);
        const ocbcOrderByScope = normalizeOcbcOrderByScopeEntries(ocbc.orderByScope);
        const ocbcTargetsByScope = ocbc.targetsByScope && typeof ocbc.targetsByScope === 'object' ? ocbc.targetsByScope : {};
        updateOcbcStore(current => ({
            ...current,
            subPortfolios: ocbcSubPortfolios,
            assignmentByCode: ocbcAssignmentByCode,
            orderByScope: ocbcOrderByScope,
            targetsByScope: ocbcTargetsByScope
        }));

        logDebug('[Goal Portfolio Viewer] Applied sync config data', {
            endowusTargets: Object.keys(endowusTargets).length,
            endowusFixed: Object.keys(endowusFixed).length,
            endowusBuckets: Object.keys(endowusBuckets).length,
            fsmTargets: Object.keys(fsmTargets).length,
            fsmFixed: Object.keys(fsmFixed).length,
            fsmPortfolios: fsmPortfolios.length,
            fsmAssignments: Object.keys(sanitizedAssignments).length,
            ocbcSubPortfolios: Object.keys(ocbcSubPortfolios).length,
            ocbcAssignments: Object.keys(ocbcAssignmentByCode).length,
            ocbcOrderScopes: Object.keys(ocbcOrderByScope).length,
            ocbcTargets: Object.keys(ocbcTargetsByScope).length
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
        if (response?.parseError) {
            error.code = 'PARSE_ERROR';
            if (typeof response.rawText === 'string') {
                error.rawResponse = response.rawText.slice(0, 500);
            }
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

    function buildRequestError(message, code) {
        const error = new Error(message);
        if (code) {
            error.code = code;
        }
        return error;
    }

    function buildResponseWrapper({
        ok,
        status,
        headers,
        rawText,
        parsedJson
    }) {
        const hasText = typeof rawText === 'string' && rawText.trim().length > 0;
        const isJsonNullLiteral = hasText && rawText.trim() === 'null';
        const parseError = parsedJson === null && hasText && !isJsonNullLiteral;
        return {
            ok: ok && !parseError,
            status,
            headers: buildHeaderAccessor(headers),
            rawText,
            parseError,
            json: async () => {
                if (parsedJson === null) {
                    return isJsonNullLiteral ? null : {};
                }
                return parsedJson;
            },
            text: async () => rawText
        };
    }

    function buildHeaderAccessor(headers) {
        if (!headers) {
            return { get: () => null };
        }
        if (typeof headers.get === 'function') {
            return headers;
        }
        const headerMap = Object.entries(headers).reduce((acc, [key, value]) => {
            acc[String(key).toLowerCase()] = value;
            return acc;
        }, {});
        return {
            get(name) {
                if (!name) {
                    return null;
                }
                return headerMap[String(name).toLowerCase()] || null;
            }
        };
    }

    function requestJson(url, options = {}) {
        const method = options.method || 'GET';
        const headers = options.headers || {};
        const body = options.body;
        const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : SYNC_REQUEST_TIMEOUT_MS;
        const fetchImpl = (typeof fetch === 'function') ? fetch : null;

        if (typeof GM_xmlhttpRequest !== 'function') {
            if (!fetchImpl) {
                return Promise.reject(new Error('No HTTP request transport available'));
            }
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            let timeoutId = null;
            if (controller && Number.isFinite(timeoutMs) && timeoutMs > 0) {
                timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            }
            return fetchImpl(url, { method, headers, body, signal: controller ? controller.signal : undefined })
                .then(async response => {
                    const rawText = await response.text();
                    const parsedJson = parseJsonSafely(rawText);
                    return buildResponseWrapper({
                        ok: response.ok,
                        status: response.status,
                        headers: response.headers,
                        rawText,
                        parsedJson
                    });
                })
                .catch(error => {
                    if (error?.name === 'AbortError') {
                        throw buildRequestError('Request timed out', 'TIMEOUT');
                    }
                    throw buildRequestError('Network request failed', 'NETWORK_ERROR');
                })
                .finally(() => {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                });
        }

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method,
                url,
                headers,
                data: body,
                responseType: 'text',
                timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined,
                onload: response => {
                    const status = Number(response?.status) || 0;
                    const text = response?.responseText || '';
                    const rawHeaders = String(response?.responseHeaders || '')
                        .split(/\r?\n/)
                        .map(line => line.trim())
                        .filter(Boolean);
                    const parsedHeaders = rawHeaders.reduce((acc, line) => {
                        const index = line.indexOf(':');
                        if (index <= 0) {
                            return acc;
                        }
                        const key = line.slice(0, index).trim();
                        const value = line.slice(index + 1).trim();
                        acc[key] = value;
                        return acc;
                    }, {});

                    const parsedJson = parseJsonSafely(text);
                    resolve(buildResponseWrapper({
                        ok: status >= 200 && status < 300,
                        status,
                        headers: parsedHeaders,
                        rawText: text,
                        parsedJson
                    }));
                },
                onerror: () => reject(buildRequestError('Network request failed', 'NETWORK_ERROR')),
                ontimeout: () => reject(buildRequestError('Request timed out', 'TIMEOUT'))
            });
        });
    }

    /**
     * Upload config to server
     */
    async function uploadConfig(config, options = {}) {
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
        if (options.force === true) {
            payload.force = true;
        }

        // Upload to server (POST /sync)
        const response = await requestJson(`${serverUrl}/sync`, {
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
        const response = await requestJson(`${serverUrl}/sync/${userId}`, {
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

    function getLastDataTimestamp() {
        const dataTimestamp = Storage.get(SYNC_STORAGE_KEYS.lastDataTimestamp, null);
        if (isFiniteTimestamp(dataTimestamp)) {
            return dataTimestamp;
        }

        // Migration fallback: older versions used lastSync as the synced data timestamp.
        if (Storage.get(SYNC_STORAGE_KEYS.lastSyncMetadataVersion, null) === SYNC_METADATA_VERSION) {
            return null;
        }
        const legacyTimestamp = Storage.get(SYNC_STORAGE_KEYS.lastSync, null);
        return isFiniteTimestamp(legacyTimestamp) ? legacyTimestamp : null;
    }

    function recordSuccessfulSync({ dataTimestamp = null, hash = null, syncedAt = Date.now() } = {}) {
        Storage.set(SYNC_STORAGE_KEYS.lastSync, syncedAt);
        Storage.set(SYNC_STORAGE_KEYS.lastSyncMetadataVersion, SYNC_METADATA_VERSION);
        if (isFiniteTimestamp(dataTimestamp)) {
            Storage.set(SYNC_STORAGE_KEYS.lastDataTimestamp, dataTimestamp);
        }
        if (hash) {
            Storage.set(SYNC_STORAGE_KEYS.lastSyncHash, hash);
        }
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
            const lastDataTimestamp = getLastDataTimestamp();
            const hasLastDataTimestamp = isFiniteTimestamp(lastDataTimestamp);
            if (localHash && lastSyncHash === localHash && hasLastDataTimestamp) {
                localConfig.timestamp = lastDataTimestamp;
            }

            if (direction === 'upload') {
                await uploadConfig(localConfig);
                recordSuccessfulSync({ dataTimestamp: localConfig.timestamp, hash: localHash });

                syncStatus = SYNC_STATUS.success;
                lastError = null;
                lastErrorMeta = null;
                logDebug('[Goal Portfolio Viewer] Sync upload successful');
            } else if (direction === 'download') {
                const serverData = await downloadConfig();
                if (!serverData) {
                    recordSuccessfulSync();
                    syncStatus = SYNC_STATUS.success;
                    lastError = null;
                    lastErrorMeta = null;
                    logDebug('[Goal Portfolio Viewer] No server data to download');
                } else {
                    applyConfigData(serverData.config);
                    const serverHash = await hashConfigData(serverData.config);
                    recordSuccessfulSync({ dataTimestamp: serverData.metadata.timestamp, hash: serverHash });

                    syncStatus = SYNC_STATUS.success;
                    lastError = null;
                    lastErrorMeta = null;
                    logDebug('[Goal Portfolio Viewer] Sync download successful');
                }
            } else {
                const serverData = await downloadConfig();

                if (!serverData) {
                    await uploadConfig(localConfig);
                    recordSuccessfulSync({ dataTimestamp: localConfig.timestamp, hash: localHash });

                    syncStatus = SYNC_STATUS.success;
                    lastError = null;
                    lastErrorMeta = null;
                    logDebug('[Goal Portfolio Viewer] No server data, uploaded local config');
                } else {
                    const serverHash = await hashConfigData(serverData.config);

                    if (!hasLastDataTimestamp) {
                        applyConfigData(serverData.config);
                        recordSuccessfulSync({ dataTimestamp: serverData.metadata.timestamp, hash: serverHash });

                        syncStatus = SYNC_STATUS.success;
                        lastError = null;
                        lastErrorMeta = null;
                        logDebug('[Goal Portfolio Viewer] Missing sync metadata, bootstrapped from server snapshot');
                    } else if (localHash && serverHash && localHash === serverHash) {
                        recordSuccessfulSync({
                            dataTimestamp: Math.max(localConfig.timestamp, serverData.metadata.timestamp),
                            hash: localHash
                        });

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
                            recordSuccessfulSync({ dataTimestamp: localConfig.timestamp, hash: localHash });

                            syncStatus = SYNC_STATUS.success;
                            lastError = null;
                            lastErrorMeta = null;
                            logDebug('[Goal Portfolio Viewer] Local config newer, uploaded to server');
                        } else if (localConfig.timestamp < serverData.metadata.timestamp) {
                            applyConfigData(serverData.config);
                            recordSuccessfulSync({ dataTimestamp: serverData.metadata.timestamp, hash: serverHash });

                            syncStatus = SYNC_STATUS.success;
                            lastError = null;
                            lastErrorMeta = null;
                            logDebug('[Goal Portfolio Viewer] Server config newer, applied locally');
                        } else {
                            recordSuccessfulSync();
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
                const forcedTimestamp = Date.now();
                const forcedConfig = {
                    ...conflict.local,
                    timestamp: forcedTimestamp,
                    platforms: {
                        ...conflict.local.platforms,
                        endowus: {
                            ...conflict.local.platforms?.endowus,
                            timestamp: forcedTimestamp
                        },
                        fsm: {
                            ...conflict.local.platforms?.fsm,
                            timestamp: forcedTimestamp
                        }
                    },
                    metadata: {
                        ...conflict.local.metadata,
                        lastModified: forcedTimestamp
                    }
                };
                const response = await uploadConfig(forcedConfig, { force: true });
                const responseTimestamp = typeof response?.timestamp === 'number'
                    ? response.timestamp
                    : forcedTimestamp;
                const hash = await hashConfigData(forcedConfig);
                recordSuccessfulSync({ dataTimestamp: responseTimestamp, hash });
            } else if (resolution === 'remote') {
                // Apply remote, keep server
                applyConfigData(conflict.remote);
                const hash = await hashConfigData(conflict.remote);
                recordSuccessfulSync({ dataTimestamp: conflict.remoteTimestamp, hash });
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
            lastError = 'Sync is locked. Enter your password and save settings to unlock encryption key.';
            lastErrorMeta = getSyncErrorGuidance({ code: 'CRYPTO_LOCKED' });
            if (typeof syncUi.update === 'function') {
                syncUi.update();
            }
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
    function getAutoSyncIntervalMs() {
        const intervalMinutes = Number(Storage.get(SYNC_STORAGE_KEYS.syncInterval, SYNC_DEFAULTS.syncInterval));
        const safeIntervalMinutes = Number.isFinite(intervalMinutes) && intervalMinutes > 0
            ? intervalMinutes
            : SYNC_DEFAULTS.syncInterval;
        return safeIntervalMinutes * 60 * 1000;
    }

    function isStartupSyncDue(intervalMs = getAutoSyncIntervalMs()) {
        const lastSync = Storage.get(SYNC_STORAGE_KEYS.lastSync, null);
        if (typeof lastSync !== 'number' || !Number.isFinite(lastSync)) {
            return true;
        }
        return Date.now() - lastSync >= intervalMs;
    }

    function scheduleStartupSyncIfDue(intervalMs) {
        if (!isStartupSyncDue(intervalMs)) {
            return;
        }

        startupSyncTimer = setTimeout(() => {
            startupSyncTimer = null;
            if (syncStatus === SYNC_STATUS.syncing) {
                startupSyncTimer = setTimeout(() => {
                    startupSyncTimer = null;
                    scheduleStartupSyncIfDue(intervalMs);
                }, STARTUP_SYNC_RETRY_DELAY_MS);
                if (startupSyncTimer && typeof startupSyncTimer.unref === 'function') {
                    startupSyncTimer.unref();
                }
                return;
            }
            performSync({ direction: 'both' }).catch(error => {
                if (error?.code === 'SYNC_IN_PROGRESS') {
                    return;
                }
                console.error('[Goal Portfolio Viewer] Startup sync failed:', error);
            });
        }, 0);
        if (startupSyncTimer && typeof startupSyncTimer.unref === 'function') {
            startupSyncTimer.unref();
        }
    }

    function startAutoSync() {
        stopAutoSync(); // Clear any existing timer

        const autoSync = Storage.get(SYNC_STORAGE_KEYS.autoSync, SYNC_DEFAULTS.autoSync);
        const intervalMs = getAutoSyncIntervalMs();

        if (!autoSync || !isEnabled() || !isConfigured()) {
            return;
        }

        if (!sessionMasterKey) {
            logDebug('[Goal Portfolio Viewer] Auto-sync requires an unlocked encryption key');
            return;
        }

        scheduleStartupSyncIfDue(intervalMs);

        autoSyncTimer = setInterval(() => {
            performSync({ direction: 'both' }).catch(error => {
                console.error('[Goal Portfolio Viewer] Auto-sync failed:', error);
            });
        }, intervalMs);

        logDebug(`[Goal Portfolio Viewer] Auto-sync started (interval: ${Math.round(intervalMs / 60000)} minutes)`);
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
        if (startupSyncTimer) {
            clearTimeout(startupSyncTimer);
            startupSyncTimer = null;
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
        utils.assertAllowedSyncServerUrl(normalizedServerUrl);

        if (config.masterKey) {
            setSessionMasterKey(config.masterKey);
        } else if (config.password) {
            const derivedKey = await SyncEncryption.deriveMasterKey(config.password);
            setSessionMasterKey(derivedKey);
        }

        if (!sessionMasterKey) {
            throw new Error('Encryption key required to unlock sync for this session');
        }

        clearCryptoLockError();

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
        utils.assertAllowedSyncServerUrl(normalizedServerUrl);

        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters');
        }

        // Hash password for authentication
        const passwordHash = await SyncEncryption.hashPasswordForAuth(password, userId);

        // Call register endpoint
        const response = await requestJson(`${normalizedServerUrl}/auth/register`, {
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
        utils.assertAllowedSyncServerUrl(normalizedServerUrl);

        // Hash password for authentication
        const passwordHash = await SyncEncryption.hashPasswordForAuth(password, userId);

        // Call login endpoint
        const response = await requestJson(`${normalizedServerUrl}/auth/login`, {
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
            setSessionMasterKey,
            storeTokens,
            clearTokens,
            setSyncStatus: status => {
                syncStatus = status;
            },
            hashConfigData,
            getAutoSyncIntervalMs,
            isStartupSyncDue,
            getLastDataTimestamp
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
        requestJson,
        ...(testingHooks ? { __test: testingHooks } : {})
    };
})();

function getEndowusSyncView(config) {
    if (!config || typeof config !== 'object') {
        return { goalTargets: {}, goalFixed: {}, goalBuckets: {}, clearedGoalBuckets: {} };
    }
    if (config.platforms && typeof config.platforms === 'object') {
        const endowus = config.platforms.endowus && typeof config.platforms.endowus === 'object'
            ? config.platforms.endowus
            : {};
        return {
            goalTargets: endowus.goalTargets && typeof endowus.goalTargets === 'object' ? endowus.goalTargets : {},
            goalFixed: endowus.goalFixed && typeof endowus.goalFixed === 'object' ? endowus.goalFixed : {},
            goalBuckets: endowus.goalBuckets && typeof endowus.goalBuckets === 'object' ? endowus.goalBuckets : {},
            clearedGoalBuckets: endowus.clearedGoalBuckets && typeof endowus.clearedGoalBuckets === 'object' ? endowus.clearedGoalBuckets : {}
        };
    }
    return {
        goalTargets: config.goalTargets && typeof config.goalTargets === 'object' ? config.goalTargets : {},
        goalFixed: config.goalFixed && typeof config.goalFixed === 'object' ? config.goalFixed : {},
        goalBuckets: config.goalBuckets && typeof config.goalBuckets === 'object' ? config.goalBuckets : {},
        clearedGoalBuckets: config.clearedGoalBuckets && typeof config.clearedGoalBuckets === 'object' ? config.clearedGoalBuckets : {}
    };
}

function getFsmSyncView(config) {
    if (!config || typeof config !== 'object') {
        return { targetsByCode: {}, fixedByCode: {}, portfolios: [], assignmentByCode: {} };
    }
    if (config.platforms && typeof config.platforms === 'object') {
        const fsm = config.platforms.fsm && typeof config.platforms.fsm === 'object'
            ? config.platforms.fsm
            : {};
        return {
            targetsByCode: fsm.targetsByCode && typeof fsm.targetsByCode === 'object' ? fsm.targetsByCode : {},
            fixedByCode: fsm.fixedByCode && typeof fsm.fixedByCode === 'object' ? fsm.fixedByCode : {},
            portfolios: normalizeFsmPortfolios(Array.isArray(fsm.portfolios) ? fsm.portfolios : []),
            assignmentByCode: fsm.assignmentByCode && typeof fsm.assignmentByCode === 'object' ? fsm.assignmentByCode : {}
        };
    }
    return { targetsByCode: {}, fixedByCode: {}, portfolios: [], assignmentByCode: {} };
}

function formatSyncValue(value) {
    if (value == null) {
        return '-';
    }
    if (typeof value === 'string') {
        return value || '-';
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (Array.isArray(value)) {
        return value.length ? value.join(', ') : '-';
    }
    return JSON.stringify(value);
}

function getFsmHoldingsFromStorage() {
    const store = readFsmStore();
    return Array.isArray(store.holdings) ? store.holdings : [];
}

function buildFsmHoldingsNameMap(fsmHoldings) {
    const rows = Array.isArray(fsmHoldings) ? fsmHoldings : [];
    return rows.reduce((acc, row) => {
        const holdingId = getFsmHoldingIdentity(row);
        if (!holdingId) {
            return acc;
        }
        const name = utils.normalizeString(row?.name, '');
        if (name) {
            acc[holdingId] = name;
        }
        return acc;
    }, {});
}

function buildFsmPortfolioNameMap(portfolios) {
    const rows = Array.isArray(portfolios) ? portfolios : [];
    return rows.reduce((acc, portfolio) => {
        const id = utils.normalizeString(portfolio?.id, '');
        const name = utils.normalizeString(portfolio?.name, '');
        if (id && name) {
            acc[id] = name;
        }
        return acc;
    }, {});
}

function formatFsmPortfolioLabel(portfolioId, portfolioNameMap) {
    const normalizedId = utils.normalizeString(portfolioId, '');
    if (!normalizedId || normalizedId === FSM_UNASSIGNED_PORTFOLIO_ID) {
        return 'Unassigned';
    }
    const name = portfolioNameMap?.[normalizedId];
    if (name) {
        return `${name} (${normalizedId})`;
    }
    return normalizedId;
}

function formatFsmInstrumentLabel(holdingId, holdingsByCode) {
    const normalizedHoldingId = utils.normalizeString(holdingId, '');
    if (!normalizedHoldingId) {
        return '-';
    }
    const readableIdentity = formatFsmHoldingIdentity(normalizedHoldingId);
    const name = utils.normalizeString(holdingsByCode?.[normalizedHoldingId], '');
    if (name) {
        return `${name} (${readableIdentity})`;
    }
    return readableIdentity;
}

function formatFsmAssignmentDisplay({ portfolioId, target, fixed }, portfolioNameMap) {
    const portfolioLabel = formatFsmPortfolioLabel(portfolioId, portfolioNameMap);
    return `${portfolioLabel} · Target ${formatSyncTarget(target)} · Fixed ${formatSyncFixed(fixed === true)}`;
}

function buildFsmConflictDiffItems(conflict, options = {}) {
    if (!conflict || !conflict.local || !conflict.remote) {
        return [];
    }
    const localFsm = getFsmSyncView(conflict.local);
    const remoteFsm = getFsmSyncView(conflict.remote);
    const fsmHoldings = Array.isArray(options.fsmHoldings) ? options.fsmHoldings : null;
    const holdingsByCode = options.holdingsByCode && typeof options.holdingsByCode === 'object'
        ? options.holdingsByCode
        : buildFsmHoldingsNameMap(fsmHoldings || getFsmHoldingsFromStorage());
    const localPortfolioNameById = buildFsmPortfolioNameMap(localFsm.portfolios || []);
    const remotePortfolioNameById = buildFsmPortfolioNameMap(remoteFsm.portfolios || []);

    const rows = [];
    const codes = new Set([
        ...Object.keys(localFsm.targetsByCode || {}),
        ...Object.keys(remoteFsm.targetsByCode || {}),
        ...Object.keys(localFsm.fixedByCode || {}),
        ...Object.keys(remoteFsm.fixedByCode || {})
    ]);

    Array.from(codes).sort().forEach(code => {
        const localTarget = localFsm.targetsByCode?.[code];
        const remoteTarget = remoteFsm.targetsByCode?.[code];
        const localFixed = localFsm.fixedByCode?.[code] === true;
        const remoteFixed = remoteFsm.fixedByCode?.[code] === true;
        const targetChanged = localTarget !== remoteTarget;
        const fixedChanged = localFixed !== remoteFixed;
        if (!targetChanged && !fixedChanged) {
            return;
        }
        rows.push({
            section: 'instrument',
            settingName: `Instrument ${formatFsmInstrumentLabel(code, holdingsByCode)}`,
            localDisplay: `Target ${formatSyncTarget(localTarget)} · Fixed ${formatSyncFixed(localFixed)}`,
            remoteDisplay: `Target ${formatSyncTarget(remoteTarget)} · Fixed ${formatSyncFixed(remoteFixed)}`
        });
    });

    const localPortfolios = normalizeFsmPortfolios(localFsm.portfolios || []).map(item => `${item.name} (${item.id})`).sort();
    const remotePortfolios = normalizeFsmPortfolios(remoteFsm.portfolios || []).map(item => `${item.name} (${item.id})`).sort();
    if (JSON.stringify(localPortfolios) !== JSON.stringify(remotePortfolios)) {
        rows.push({
            section: 'definition',
            settingName: 'Portfolio Definitions',
            localDisplay: formatSyncValue(localPortfolios),
            remoteDisplay: formatSyncValue(remotePortfolios)
        });
    }

    const assignmentCodes = new Set([
        ...Object.keys(localFsm.assignmentByCode || {}),
        ...Object.keys(remoteFsm.assignmentByCode || {})
    ]);
    Array.from(assignmentCodes).sort().forEach(code => {
        const localPortfolio = localFsm.assignmentByCode?.[code] || FSM_UNASSIGNED_PORTFOLIO_ID;
        const remotePortfolio = remoteFsm.assignmentByCode?.[code] || FSM_UNASSIGNED_PORTFOLIO_ID;
        if (localPortfolio === remotePortfolio) {
            return;
        }
        const localTarget = localFsm.targetsByCode?.[code];
        const remoteTarget = remoteFsm.targetsByCode?.[code];
        const localFixed = localFsm.fixedByCode?.[code] === true;
        const remoteFixed = remoteFsm.fixedByCode?.[code] === true;
        rows.push({
            section: 'assignment',
            settingName: formatFsmInstrumentLabel(code, holdingsByCode),
            localDisplay: formatFsmAssignmentDisplay(
                {
                    portfolioId: localPortfolio,
                    target: localTarget,
                    fixed: localFixed
                },
                localPortfolioNameById
            ),
            remoteDisplay: formatFsmAssignmentDisplay(
                {
                    portfolioId: remotePortfolio,
                    target: remoteTarget,
                    fixed: remoteFixed
                },
                remotePortfolioNameById
            )
        });
    });

    return rows;
}

function buildConflictDiffSections(conflict, nameMapOverride = {}, fsmOptions = {}) {
    return {
        endowus: buildConflictDiffItemsForMap(conflict, nameMapOverride),
        fsm: buildFsmConflictDiffItems(conflict, fsmOptions)
    };
}

function buildConflictDiffItemsForMap(conflict, nameMapOverride = {}) {
    if (!conflict || !conflict.local || !conflict.remote) {
        return [];
    }
    const localEndowus = getEndowusSyncView(conflict.local);
    const remoteEndowus = getEndowusSyncView(conflict.remote);
    const localTargets = localEndowus.goalTargets || {};
    const remoteTargets = remoteEndowus.goalTargets || {};
    const localFixed = localEndowus.goalFixed || {};
    const remoteFixed = remoteEndowus.goalFixed || {};
    const localBuckets = localEndowus.goalBuckets || {};
    const remoteBuckets = remoteEndowus.goalBuckets || {};
    const localClearedBuckets = localEndowus.clearedGoalBuckets || {};
    const remoteClearedBuckets = remoteEndowus.clearedGoalBuckets || {};
    const goalIds = new Set([
        ...Object.keys(localTargets),
        ...Object.keys(remoteTargets),
        ...Object.keys(localFixed),
        ...Object.keys(remoteFixed),
        ...Object.keys(localBuckets),
        ...Object.keys(remoteBuckets),
        ...Object.keys(localClearedBuckets),
        ...Object.keys(remoteClearedBuckets)
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
            const localBucket = utils.normalizeString(localBuckets[goalId], '');
            const remoteBucket = utils.normalizeString(remoteBuckets[goalId], '');
            const localBucketCleared = localClearedBuckets[goalId] === true;
            const remoteBucketCleared = remoteClearedBuckets[goalId] === true;
            const shouldIgnoreTarget = localFixedValue || remoteFixedValue;
            const targetChanged = !shouldIgnoreTarget && localTarget !== remoteTarget;
            const fixedChanged = localFixedValue !== remoteFixedValue;
            const bucketChanged = localBucket !== remoteBucket || localBucketCleared !== remoteBucketCleared;
            if (!targetChanged && !fixedChanged && !bucketChanged) {
                return null;
            }
            const goalName = nameMap[goalId] || `Goal ${goalId.slice(0, 8)}...`;
            return {
                goalId,
                goalName,
                localTargetDisplay: formatSyncTarget(localTarget),
                remoteTargetDisplay: formatSyncTarget(remoteTarget),
                localFixedDisplay: formatSyncFixed(localFixedValue),
                remoteFixedDisplay: formatSyncFixed(remoteFixedValue),
                localBucketDisplay: localBucketCleared ? 'Cleared' : (localBucket || '-'),
                remoteBucketDisplay: remoteBucketCleared ? 'Cleared' : (remoteBucket || '-')
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
    const GM_COOKIE_LIST_TIMEOUT_MS = 250;

    const state = {
        apiData: {
            performance: null,
            investible: null,
            summary: null,
            fsmHoldings: null,
            ocbcHoldings: null
        },
        projectedInvestments: {},
        performance: {
            goalData: {},
            requestQueue: createSequentialRequestQueue({
                delayMs: REQUEST_DELAY_MS
            })
        },
        auth: {
            gmCookieDumped: false
        },
        ui: {
            portfolioButton: null,
            lastUrl: window.location.href,
            urlMonitorCleanup: null,
            urlCheckTimeout: null,
            observer: null,
            dataUpdateListeners: new Set()
        },
        readiness: {
            endowus: {
                performanceLoaded: false,
                investibleLoaded: false,
                summaryLoaded: false
            },
            fsm: {
                holdingsLoaded: false
            },
            ocbc: {
                holdingsLoaded: false
            }
        }
    };

    function subscribeDataUpdates(listener) {
        if (typeof listener !== 'function' || !(state.ui.dataUpdateListeners instanceof Set)) {
            return () => {};
        }
        state.ui.dataUpdateListeners.add(listener);
        return () => {
            state.ui.dataUpdateListeners.delete(listener);
        };
    }

    function notifyDataUpdates() {
        if (!(state.ui.dataUpdateListeners instanceof Set) || state.ui.dataUpdateListeners.size === 0) {
            return;
        }
        Array.from(state.ui.dataUpdateListeners).forEach(listener => {
            try {
                listener();
            } catch (error) {
                console.warn('[Goal Portfolio Viewer] Overlay refresh listener failed:', error);
            }
        });
    }

    const ENDPOINT_HANDLERS = {
        performance: data => {
            if (!Array.isArray(data)) {
                return;
            }
            state.apiData.performance = data;
            state.readiness.endowus.performanceLoaded = true;
            updateEndowusStore(current => ({ ...current, performance: data }), 'Error saving performance data');
            logDebug('[Goal Portfolio Viewer] Intercepted performance data');
            notifyDataUpdates();
        },
        investible: data => {
            if (!Array.isArray(data)) {
                return;
            }
            state.apiData.investible = data;
            state.readiness.endowus.investibleLoaded = true;
            updateEndowusStore(current => ({ ...current, investible: data }), 'Error saving investible data');
            logDebug('[Goal Portfolio Viewer] Intercepted investible data');
            notifyDataUpdates();
        },
        summary: data => {
            if (!Array.isArray(data)) {
                return;
            }
            state.apiData.summary = data;
            state.readiness.endowus.summaryLoaded = true;
            updateEndowusStore(current => ({ ...current, summary: data }), 'Error saving summary data');
            logDebug('[Goal Portfolio Viewer] Intercepted summary data');
            notifyDataUpdates();
        },
        fsmHoldings: data => {
            const rows = Array.isArray(data?.data)
                ? data.data.flatMap(group => Array.isArray(group?.holdings) ? group.holdings : [])
                : [];
            const filteredRows = rows.filter(row => row && row.productType !== 'DPMS_HEADER');
            state.apiData.fsmHoldings = filteredRows;
            state.readiness.fsm.holdingsLoaded = true;
            updateFsmStore(current => ({ ...current, holdings: filteredRows }), 'Error saving FSM holdings data');
            logDebug('[Goal Portfolio Viewer] Intercepted FSM holdings data', { rows: filteredRows.length });
            notifyDataUpdates();
        },
        ocbcHoldings: data => {
            const normalized = normalizeOcbcHoldingsPayload(data);
            state.apiData.ocbcHoldings = normalized;
            state.readiness.ocbc.holdingsLoaded = true;
            updateOcbcStore(current => ({ ...current, holdings: normalized }), 'Error saving OCBC holdings data');
            logDebug('[Goal Portfolio Viewer] Intercepted OCBC holdings data', {
                assets: normalized.assets.length,
                liabilities: normalized.liabilities.length
            });
            notifyDataUpdates();
        }
    };

    function detectEndpointInfo(url, method = null) {
        if (typeof url !== 'string' || !url) {
            return { endpointKey: null };
        }
        if (url.includes(ENDPOINT_PATHS.performance)) {
            return { endpointKey: 'performance' };
        }
        if (url.includes(ENDPOINT_PATHS.investible)) {
            return { endpointKey: 'investible' };
        }
        if (url.match(SUMMARY_ENDPOINT_REGEX)) {
            return { endpointKey: 'summary' };
        }
        if (url.includes(ENDPOINT_PATHS.fsmHoldings)) {
            return { endpointKey: 'fsmHoldings' };
        }
        if (url.includes(ENDPOINT_PATHS.ocbcHoldings)) {
            if (!method || method === 'POST') {
                return { endpointKey: 'ocbcHoldings' };
            }
        }
        return { endpointKey: null };
    }


    function validateEndpointPayload(endpointKey, data) {
        if (!data || typeof data !== 'object') {
            return { valid: false, reason: 'Expected object payload' };
        }
        if (!Array.isArray(data) && endpointKey !== 'fsmHoldings' && endpointKey !== 'ocbcHoldings') {
            return { valid: false, reason: `Expected array payload for ${endpointKey}` };
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
        if (endpointKey === 'fsmHoldings') {
            const groups = Array.isArray(data.data) ? data.data : null;
            if (!groups) {
                return { valid: false, reason: 'Missing data array in FSM holdings payload' };
            }
            const isValid = groups.every(group => group && typeof group === 'object' && Array.isArray(group.holdings));
            return { valid: isValid, reason: isValid ? null : 'Invalid holdings group format in FSM payload' };
        }
        if (endpointKey === 'ocbcHoldings') {
            const groups = Array.isArray(data.data) ? data.data : null;
            if (!groups) {
                return { valid: false, reason: 'Missing data array in OCBC holdings payload' };
            }
            const isValid = groups.every(group => group && typeof group === 'object');
            return { valid: isValid, reason: isValid ? null : 'Invalid portfolio group format in OCBC payload' };
        }
        return { valid: true, reason: null };
    }

    async function handleInterceptedResponse(url, readData, method = null) {
        const endpointInfo = detectEndpointInfo(url, method);
        const endpointKey = endpointInfo.endpointKey;
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
                if (endpointKey === 'performance' || endpointKey === 'investible' || endpointKey === 'summary') {
                    showNotification('Latest Endowus refresh failed validation. Showing last synced portfolio data.', 'error');
                }
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

    // Fetch interception
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        const input = args[0];
        const init = args[1];
        const requestCtor = (typeof globalThis !== 'undefined' && globalThis.Request)
            || (typeof window !== 'undefined' && window.Request)
            || null;
        const isRequestInput = Boolean(requestCtor && input instanceof requestCtor);
        const url = typeof input === 'string'
            ? input
            : (input instanceof URL
                ? input.toString()
                : (isRequestInput
                    ? input.url
                    : ''));
        const method = utils.normalizeString(
            init?.method
            || (isRequestInput ? input.method : ''),
            'GET'
        ).toUpperCase();
        if (response?.ok) {
            void handleInterceptedResponse(url, () => response.clone().json(), method);
        }
        return response;
    };

    // XMLHttpRequest interception
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._url = url;
        this._method = method;
        return originalXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        const url = this._url;
        const method = utils.normalizeString(this._method, 'GET').toUpperCase();
        
        if (url && typeof url === 'string') {
            this.addEventListener('load', function() {
                const status = Number(this.status);
                if (!Number.isFinite(status) || (status >= 200 && status < 300)) {
                    handleInterceptedResponse(url, () => Promise.resolve(parseJsonSafely(this.responseText)), method);
                }
            });
        }
        
        return originalXHRSend.apply(this, args);
    };

    logDebug('[Goal Portfolio Viewer] API interception initialized');

    GoalTargetStore = {
        getTarget(goalId) {
            const storeValue = readEndowusStore().goalTargets[goalId];
            const value = storeValue ?? Storage.get(storageKeys.goalTarget(goalId), null, 'Error loading goal target percentage');
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
            const result = updateEndowusStore(current => ({
                ...current,
                goalTargets: { ...current.goalTargets, [goalId]: validPercentage }
            }), 'Error saving goal target percentage');
            if (!result.success) {
                return null;
            }
            logDebug(`[Goal Portfolio Viewer] Saved goal target percentage for ${goalId}: ${validPercentage}%`);
            if (typeof SyncManager?.scheduleSyncOnChange === 'function') {
                SyncManager.scheduleSyncOnChange('target-update');
            }
            return validPercentage;
        },
        clearTarget(goalId) {
            const result = updateEndowusStore(current => {
                const next = { ...current.goalTargets };
                delete next[goalId];
                return { ...current, goalTargets: next };
            }, 'Error deleting goal target percentage');
            if (!result.success) {
                return;
            }
            logDebug(`[Goal Portfolio Viewer] Deleted goal target percentage for ${goalId}`);
            if (typeof SyncManager?.scheduleSyncOnChange === 'function') {
                SyncManager.scheduleSyncOnChange('target-clear');
            }
        },
        getFixed(goalId) {
            const storeValue = readEndowusStore().goalFixed[goalId];
            if (storeValue === true || storeValue === false) {
                return storeValue === true;
            }
            return Storage.get(storageKeys.goalFixed(goalId), false, 'Error loading goal fixed state') === true;
        },
        setFixed(goalId, isFixed) {
            const result = updateEndowusStore(current => ({
                ...current,
                goalFixed: { ...current.goalFixed, [goalId]: isFixed === true }
            }), 'Error saving goal fixed state');
            if (!result.success) {
                return;
            }
            logDebug(`[Goal Portfolio Viewer] Saved goal fixed state for ${goalId}: ${isFixed === true}`);
            if (typeof SyncManager?.scheduleSyncOnChange === 'function') {
                SyncManager.scheduleSyncOnChange('fixed-update');
            }
        },
        clearFixed(goalId) {
            const result = updateEndowusStore(current => {
                const next = { ...current.goalFixed };
                delete next[goalId];
                return { ...current, goalFixed: next };
            }, 'Error deleting goal fixed state');
            if (!result.success) {
                return;
            }
            logDebug(`[Goal Portfolio Viewer] Deleted goal fixed state for ${goalId}`);
            if (typeof SyncManager?.scheduleSyncOnChange === 'function') {
                SyncManager.scheduleSyncOnChange('fixed-clear');
            }
        },
        getBucket(goalId) {
            const cleared = readEndowusStore().clearedGoalBuckets[goalId] === true
                || Storage.get(storageKeys.goalBucketCleared(goalId), false) === true;
            if (cleared) {
                return null;
            }
            const storeValue = utils.normalizeString(readEndowusStore().goalBuckets[goalId] || '', '');
            const value = storeValue || utils.normalizeString(Storage.get(storageKeys.goalBucket(goalId), ''), '');
            return value || null;
        },
        setBucket(goalId, bucketName, options = {}) {
            const normalizedBucket = utils.normalizeString(bucketName, '');
            if (!normalizedBucket) {
                const result = updateEndowusStore(current => {
                    const goalBuckets = { ...current.goalBuckets };
                    delete goalBuckets[goalId];
                    return { ...current, goalBuckets };
                }, 'Error deleting goal bucket assignment');
                if (!result.success) {
                    return null;
                }
                return null;
            }
            const result = updateEndowusStore(current => {
                const clearedGoalBuckets = { ...current.clearedGoalBuckets };
                delete clearedGoalBuckets[goalId];
                return {
                    ...current,
                    goalBuckets: { ...current.goalBuckets, [goalId]: normalizedBucket },
                    clearedGoalBuckets
                };
            }, 'Error saving goal bucket assignment');
            if (!result.success) {
                return null;
            }
            if (options.suppressSync !== true && typeof SyncManager?.scheduleSyncOnChange === 'function') {
                SyncManager.scheduleSyncOnChange('bucket-update');
            }
            return normalizedBucket;
        },
        clearBucket(goalId, options = {}) {
            const result = updateEndowusStore(current => {
                const goalBuckets = { ...current.goalBuckets };
                delete goalBuckets[goalId];
                return {
                    ...current,
                    goalBuckets,
                    clearedGoalBuckets: { ...current.clearedGoalBuckets, [goalId]: true }
                };
            }, 'Error saving cleared goal bucket flag');
            if (!result.success) {
                return;
            }
            if (options.suppressSync !== true && typeof SyncManager?.scheduleSyncOnChange === 'function') {
                SyncManager.scheduleSyncOnChange('bucket-clear');
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
            STORAGE_KEYS.endowus,
            data => data && typeof data === 'object' && !Array.isArray(data),
            'Error loading Endowus data'
        );
        const endowusStore = performance ? normalizeEndowusStore(performance) : readEndowusStore();
        if (Array.isArray(endowusStore.performance)) {
            apiDataState.performance = endowusStore.performance;
            appState.readiness.endowus.performanceLoaded = true;
            logDebug('[Goal Portfolio Viewer] Loaded performance data from storage');
        }
        if (Array.isArray(endowusStore.investible)) {
            apiDataState.investible = endowusStore.investible;
            appState.readiness.endowus.investibleLoaded = true;
            logDebug('[Goal Portfolio Viewer] Loaded investible data from storage');
        }
        if (Array.isArray(endowusStore.summary)) {
            apiDataState.summary = endowusStore.summary;
            appState.readiness.endowus.summaryLoaded = true;
            logDebug('[Goal Portfolio Viewer] Loaded summary data from storage');
        }
        const fsmStore = readFsmStore();
        if (Array.isArray(fsmStore.holdings)) {
            apiDataState.fsmHoldings = fsmStore.holdings;
            appState.readiness.fsm.holdingsLoaded = true;
            logDebug('[Goal Portfolio Viewer] Loaded FSM holdings data from storage');
        }
        const ocbcStore = readOcbcStore();
        if (ocbcStore.holdings && Array.isArray(ocbcStore.holdings.assets) && Array.isArray(ocbcStore.holdings.liabilities)) {
            apiDataState.ocbcHoldings = ocbcStore.holdings;
            appState.readiness.ocbc.holdingsLoaded = true;
            logDebug('[Goal Portfolio Viewer] Loaded OCBC holdings data from storage');
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

    function selectAuthCookieToken(cookies) {
        if (!Array.isArray(cookies) || !cookies.length) {
            return null;
        }
        const httpOnlyCookie = cookies.find(cookie => cookie?.httpOnly);
        return (httpOnlyCookie || cookies[0])?.value || null;
    }

    function isEndowusAuthContext() {
        const hostname = (window?.location?.hostname || '').toLowerCase();
        return hostname === 'endowus.com' || hostname.endsWith('.endowus.com');
    }

    function listCookieByQuery(query) {
        return new Promise(resolve => {
            let settled = false;
            let timeoutId = setTimeout(() => {
                settle([]);
            }, GM_COOKIE_LIST_TIMEOUT_MS);

            const settle = cookies => {
                if (settled) {
                    return;
                }
                settled = true;
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                resolve(Array.isArray(cookies) ? cookies : []);
            };

            if (typeof GM_cookie === 'undefined' || typeof GM_cookie.list !== 'function') {
                settle([]);
                return;
            }

            try {
                const maybePromise = GM_cookie.list(query, cookies => settle(cookies));
                if (maybePromise && typeof maybePromise.then === 'function') {
                    maybePromise
                        .then(cookies => settle(cookies))
                        .catch(() => settle([]));
                }
            } catch (_error) {
                settle([]);
            }
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
        if (!isEndowusAuthContext()) {
            return Promise.resolve(null);
        }
        if (typeof GM_cookie === 'undefined' || typeof GM_cookie.list !== 'function') {
            return Promise.resolve(null);
        }
        dumpAvailableCookies();
        const cookieNames = ['webapp-sg-access-token', 'webapp-sg-accessToken'];
        const domains = ['.endowus.com', 'app.sg.endowus.com'];
        const queries = domains.flatMap(domain => (
            cookieNames.map(name => ({ domain, path: '/', name }))
        ));
        const queryPromises = queries.map(query => listCookieByQuery(query));
        return Promise.all(queryPromises).then(cookieResults => {
            for (const cookies of cookieResults) {
                const token = selectAuthCookieToken(cookies);
                if (token) {
                    return token;
                }
            }
            return null;
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

    async function buildPerformanceRequestHeaders() {
        const headers = new Headers();
        const token = await getAuthTokenFromGMCookie();
        const authorization = buildAuthorizationValue(token);
        if (authorization) {
            headers.set('authorization', authorization);
        }
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

    function scheduleNextFrame(callback) {
        if (typeof callback !== 'function') {
            return;
        }
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(callback);
            return;
        }
        setTimeout(callback, 0);
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

            scheduleNextFrame(() => {
                if (!chartWrapper.isConnected) {
                    return;
                }
                if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') {
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

    function applySelectContentWidth(selectElement, options = {}) {
        if (!selectElement || typeof selectElement.options === 'undefined') {
            return;
        }
        const minCh = Number.isFinite(options.minCh) ? options.minCh : 12;
        const maxCh = Number.isFinite(options.maxCh) ? options.maxCh : 28;
        const paddingCh = Number.isFinite(options.paddingCh) ? options.paddingCh : 4;
        const longestOptionLength = Array.from(selectElement.options).reduce((maxLength, option) => {
            const text = utils.normalizeString(option?.text, '');
            return Math.max(maxLength, text.length);
        }, 0);
        const widthCh = Math.min(maxCh, Math.max(minCh, longestOptionLength + paddingCh));
        selectElement.style.width = `${widthCh}ch`;
        selectElement.style.maxWidth = `${maxCh}ch`;
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
            .filter(element => {
                if (!element || element.disabled || element.getAttribute('aria-hidden') === 'true') {
                    return false;
                }
                if (element.hidden === true) {
                    return false;
                }
                const hiddenAncestor = typeof element.closest === 'function'
                    ? element.closest('[hidden], [aria-hidden="true"]')
                    : null;
                return !hiddenAncestor;
            });
    }

    function setElementsDisabled(elements, disabled) {
        (Array.isArray(elements) ? elements : []).forEach(element => {
            if (!element) {
                return;
            }
            if (disabled) {
                if ('disabled' in element) {
                    element.disabled = true;
                }
                element.setAttribute('tabindex', '-1');
                return;
            }
            if ('disabled' in element) {
                element.disabled = false;
            }
            element.removeAttribute('tabindex');
        });
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
            if (container.contains(event.target)) {
                return;
            }
            const activeElement = document.activeElement;
            if (activeElement instanceof HTMLElement && container.contains(activeElement)) {
                return;
            }
            const focusables = getFocusableElements(container);
            (focusables[0] || container).focus();
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
            const schedule = (typeof window !== 'undefined' && typeof window.setTimeout === 'function')
                ? window.setTimeout.bind(window)
                : (typeof globalThis !== 'undefined' && typeof globalThis.setTimeout === 'function'
                    ? globalThis.setTimeout.bind(globalThis)
                    : null);
            if (schedule) {
                try {
                    schedule(focusLater, 0);
                } catch (_error) {
                    focusLater();
                }
            } else {
                focusLater();
            }
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

    function createKeyboardSelectableCard(element, { ariaLabel, onSelect }) {
        if (!element) {
            return element;
        }
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');
        if (ariaLabel) {
            element.setAttribute('aria-label', ariaLabel);
        }
        if (typeof onSelect === 'function') {
            const handleSelect = event => {
                if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }
                if (event.type === 'keydown') {
                    event.preventDefault();
                }
                onSelect(event);
            };
            element.addEventListener('click', handleSelect);
            element.addEventListener('keydown', handleSelect);
        }
        return element;
    }

    function createTableCell(value, className = null) {
        return createElement('td', className, value);
    }

    function createPercentTargetInput(value, ariaLabel, onChange) {
        const input = createElement('input', 'gpv-target-input');
        input.type = 'number';
        input.min = '0';
        input.max = '100';
        input.step = '0.01';
        input.value = Number.isFinite(value) ? value.toFixed(2) : '';
        if (ariaLabel) {
            input.setAttribute('aria-label', ariaLabel);
        }
        if (typeof onChange === 'function') {
            input.onchange = onChange;
        }
        return input;
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

    function buildBucketHeader(bucketViewModel) {
        const bucketHeader = createElement('div', 'gpv-detail-header');
        const bucketTitle = createElement('h2', 'gpv-detail-title', bucketViewModel.bucketName);
        const healthBadge = createElement(
            'span',
            `gpv-health-badge ${bucketViewModel.health?.className || 'gpv-health--healthy'}`,
            `${bucketViewModel.health?.label || 'Healthy'}`
        );
        const bucketStats = createElement('div', 'gpv-stats gpv-detail-stats');
        bucketStats.appendChild(buildBucketStatsFragment({
            endingBalanceDisplay: bucketViewModel.endingBalanceDisplay,
            returnDisplay: bucketViewModel.returnDisplay,
            returnClass: bucketViewModel.returnClass,
            growthDisplay: bucketViewModel.growthDisplay,
            returnLabel: 'Return'
        }));
        bucketHeader.appendChild(bucketTitle);
        bucketHeader.appendChild(healthBadge);
        bucketHeader.appendChild(bucketStats);
        return bucketHeader;
    }

    function appendPlanningDetails(panel, planning, {
        scopeLabel = null,
        coverageText = null,
        showScenarioPrompt = false
    } = {}) {
        if (scopeLabel) {
            panel.appendChild(createElement('p', 'gpv-planning-copy', `Scope: ${scopeLabel}`));
        }
        if (coverageText) {
            panel.appendChild(createElement('p', 'gpv-planning-coverage', coverageText));
        }
        if (showScenarioPrompt) {
            if (planning.scenarioAmount > 0) {
                panel.appendChild(createElement('p', 'gpv-planning-copy', `Projected Investment: ${formatMoney(planning.scenarioAmount)}`));
            } else {
                panel.appendChild(createElement('p', 'gpv-planning-copy', 'Set a projected investment amount to see a what-if split.'));
            }
            if (Array.isArray(planning.scenarioSplit) && planning.scenarioSplit.length > 0) {
                const splitList = createElement('ul', 'gpv-planning-list');
                planning.scenarioSplit.forEach(item => {
                    splitList.appendChild(createElement('li', 'gpv-planning-item', `${item.goalName}: ${formatMoney(item.amount)}`));
                });
                panel.appendChild(splitList);
            }
        }
        buildPlanningTradeLines(planning).forEach(line => {
            panel.appendChild(createElement('p', 'gpv-planning-copy', line));
        });
    }

    function renderPlanningPanel(contentDiv, bucketViewModel, { beforeNode = null } = {}) {
        if (!contentDiv || !bucketViewModel) {
            return;
        }
        const panel = createElement('div', 'gpv-planning-panel');
        const appendPanel = () => {
            if (beforeNode && beforeNode.parentNode === contentDiv) {
                contentDiv.insertBefore(panel, beforeNode);
                return;
            }
            contentDiv.appendChild(panel);
        };
        panel.appendChild(createElement('h3', 'gpv-planning-title', 'Planning'));

        const planning = buildBucketPlanningModel(bucketViewModel.goalTypes);
        if (!planning) {
            panel.appendChild(createElement('p', 'gpv-planning-empty', 'Planning insights appear once targets and balances are available.'));
            appendPanel();
            return;
        }

        const coverageText = planning.coverageIssues.length > 0
            ? planning.coverageIssues.join(' | ')
            : null;
        appendPlanningDetails(panel, planning, {
            coverageText,
            showScenarioPrompt: true
        });

        appendPanel();
    }

    function renderAllocationDriftHint(contentDiv, bucketViewModel) {
        if (!bucketViewModel.showAllocationDriftHint) {
            return;
        }
        const hint = createElement('div', 'gpv-allocation-drift-hint', 'Set goal targets to see drift.');
        contentDiv.appendChild(hint);
    }

    function createSectionToggle({
        label,
        panelId,
        collapsed,
        variantClass
    }) {
        const toggle = createElement('button', `gpv-section-toggle ${variantClass}`);
        toggle.type = 'button';
        toggle.setAttribute('aria-controls', panelId);
        toggle.setAttribute('aria-expanded', String(!collapsed));
        const icon = createElement('span', 'gpv-section-toggle-icon', collapsed ? '▸' : '▾');
        toggle.appendChild(icon);
        toggle.appendChild(createElement('span', null, label));
        return { toggle, icon };
    }

    function createPerformancePanel({
        bucketViewModel,
        goalTypeModel,
        cleanupCallbacks,
        onPerformanceDataLoaded,
        useCacheOnly,
        performanceSectionId,
        initialCollapsed
    }) {
        const performancePanel = createElement('div', 'gpv-collapsible gpv-performance-panel');
        performancePanel.id = performanceSectionId;
        performancePanel.dataset.loaded = 'false';
        performancePanel.classList.toggle('gpv-collapsible--collapsed', initialCollapsed);
        performancePanel.dataset.goalType = goalTypeModel.goalType;

        const loadPerformancePanel = () => {
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
        };

        const { toggle: performanceToggle, icon: performanceIcon } = createSectionToggle({
            label: 'Performance',
            panelId: performanceSectionId,
            collapsed: initialCollapsed,
            variantClass: 'gpv-section-toggle--performance'
        });

        const state = {
            collapsed: initialCollapsed
        };

        performanceToggle.addEventListener('click', () => {
            const shouldPersist = performanceToggle.dataset.autoExpand !== 'true';
            if (performanceToggle.dataset.autoExpand) {
                delete performanceToggle.dataset.autoExpand;
            }
            state.collapsed = !state.collapsed;
            if (shouldPersist) {
                setCollapseState(
                    bucketViewModel.bucketName,
                    goalTypeModel.goalType,
                    COLLAPSE_SECTIONS.performance,
                    state.collapsed
                );
            }
            performancePanel.classList.toggle('gpv-collapsible--collapsed', state.collapsed);
            performanceToggle.setAttribute('aria-expanded', String(!state.collapsed));
            performanceIcon.textContent = state.collapsed ? '▸' : '▾';
            if (!state.collapsed) {
                loadPerformancePanel();
            }
        });

        if (!state.collapsed) {
            loadPerformancePanel();
        }

        return {
            panel: performancePanel,
            toggle: performanceToggle
        };
    }

    function createProjectionPanel({
        goalTypeModel,
        bucketViewModel,
        projectedInvestmentsState,
        mergedInvestmentDataState,
        projectionSectionId,
        initialCollapsed,
        typeSection
    }) {
        const projectionPanel = createElement('div', 'gpv-collapsible gpv-projection-panel');
        projectionPanel.id = projectionSectionId;
        projectionPanel.classList.toggle('gpv-collapsible--collapsed', initialCollapsed);
        projectionPanel.dataset.goalType = goalTypeModel.goalType;

        const { toggle: projectionToggle, icon: projectionIcon } = createSectionToggle({
            label: 'Projection',
            panelId: projectionSectionId,
            collapsed: initialCollapsed,
            variantClass: 'gpv-section-toggle--projection'
        });

        let projectionCollapsed = initialCollapsed;

        projectionToggle.addEventListener('click', () => {
            projectionCollapsed = !projectionCollapsed;
            setCollapseState(bucketViewModel.bucketName, goalTypeModel.goalType, COLLAPSE_SECTIONS.projection, projectionCollapsed);
            projectionPanel.classList.toggle('gpv-collapsible--collapsed', projectionCollapsed);
            projectionToggle.setAttribute('aria-expanded', String(!projectionCollapsed));
            projectionIcon.textContent = projectionCollapsed ? '▸' : '▾';
        });

        const projectedInputControl = createProjectedInvestmentInput({
            amount: goalTypeModel.projectedAmount,
            onInput: input => {
                EventHandlers.handleProjectedInvestmentChange({
                    input,
                    bucket: bucketViewModel.bucketName,
                    goalType: goalTypeModel.goalType,
                    typeSection,
                    mergedInvestmentDataState,
                    projectedInvestmentsState
                });
            },
            dataAttributes: {
                bucket: bucketViewModel.bucketName,
                goalType: goalTypeModel.goalType
            }
        });
        projectionPanel.appendChild(projectedInputControl.container);

        return {
            panel: projectionPanel,
            toggle: projectionToggle
        };
    }

    function buildGoalTypeTable({ goalTypeModel, typeSection }) {
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

        headerRow.appendChild(createElement('th', 'gpv-column-drift', 'Drift'));
        headerRow.appendChild(createElement('th', 'gpv-column-return', 'Cumulative Return'));
        headerRow.appendChild(createElement('th', 'gpv-column-return-percent', 'Return %'));

        thead.appendChild(headerRow);
        table.appendChild(thead);

        const metricsColSpan = headerRow.children.length;
        const tbody = createElement('tbody');

        goalTypeModel.goals.forEach(goalModel => {
            const tr = createElement('tr', 'gpv-goal-row');
            tr.dataset.goalId = goalModel.goalId || '';
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

            const driftClassName = goalModel.driftClass
                ? `gpv-column-drift ${goalModel.driftClass}`
                : 'gpv-column-drift';
            tr.appendChild(createElement('td', driftClassName, goalModel.driftDisplay));
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
            metricsRow.dataset.goalId = goalModel.goalId || '';
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
                value.dataset.windowKey = window.key;
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
    }

    function wireGoalTypeEvents({
        typeSection,
        goalTypeModel,
        bucketViewModel,
        mergedInvestmentDataState,
        projectedInvestmentsState
    }) {
        const goalModelsById = goalTypeModel.goalModelsById || {};

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
            const goalModel = goalModelsById[goalId];
            if (!goalModel) {
                return;
            }
            EventHandlers.handleGoalFixedToggle({
                input: resolved.element,
                goalId: goalModel.goalId,
                bucket: bucketViewModel.bucketName,
                goalType: goalTypeModel.goalType,
                typeSection,
                mergedInvestmentDataState,
                projectedInvestmentsState
            });
        });
    }

    function renderSummaryView(contentDiv, summaryViewModel, onBucketSelect) {
        contentDiv.innerHTML = '';

        const attention = buildAttentionStrip(summaryViewModel.attentionItems, item => {
            if (typeof onBucketSelect === 'function') {
                onBucketSelect(item.bucketName);
            }
        });
        if (attention) {
            contentDiv.appendChild(attention);
        }

        if (summaryViewModel.showAllocationDriftHint) {
            const hint = createElement('div', 'gpv-allocation-drift-hint', 'Set goal targets to see drift.');
            contentDiv.appendChild(hint);
        }

        const summaryContainer = createElement('div', 'gpv-summary-container');

        summaryViewModel.buckets.forEach(bucketModel => {
            const bucketCard = createElement('div', 'gpv-bucket-card');
            bucketCard.dataset.bucket = bucketModel.bucketName;
            createKeyboardSelectableCard(bucketCard, {
                ariaLabel: `Open ${bucketModel.bucketName} bucket`
            });

            const bucketHeader = createElement('div', 'gpv-bucket-header');
            const bucketTitle = createElement('h2', 'gpv-bucket-title', bucketModel.bucketName);
            const healthBadge = createElement(
                'span',
                `gpv-health-badge ${bucketModel.health?.className || 'gpv-health--healthy'}`,
                `${bucketModel.health?.label || 'Healthy'}`
            );
            bucketHeader.appendChild(healthBadge);
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

            if (Array.isArray(bucketModel.health?.reasons) && bucketModel.health.reasons.length > 0) {
                const reasonList = createElement('ul', 'gpv-health-reasons');
                bucketModel.health.reasons.slice(0, 2).forEach(reason => {
                    reasonList.appendChild(createElement('li', 'gpv-health-reason', reason));
                });
                bucketCard.appendChild(reasonList);
            }

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
                    goalTypeModel.allocationDriftDisplay,
                    { valueClass: goalTypeModel.allocationDriftClass || null }
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






    async function copyTextToClipboard(text) {
        const clipboard = typeof globalThis !== 'undefined' ? globalThis.navigator?.clipboard : null;
        if (clipboard && typeof clipboard.writeText === 'function') {
            try {
                await clipboard.writeText(text);
                return;
            } catch (_error) {
                // Fall back to execCommand copy below.
            }
        }
        if (typeof document === 'undefined' || !document.body || typeof document.execCommand !== 'function') {
            throw new Error('Clipboard unavailable');
        }
        const textarea = createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.left = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) {
            throw new Error('Copy command failed');
        }
    }

    function setBalanceCopyFeedback(statusElement, message, type = 'info') {
        if (!statusElement) {
            return;
        }
        statusElement.textContent = message || '';
        const isError = type === 'error';
        statusElement.setAttribute('role', isError ? 'alert' : 'status');
        statusElement.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    }

    function buildCopyControls({
        buttonLabel,
        buttonAriaLabel = null,
        emptyMessage,
        successMessage,
        copyText,
        controlsClassName = 'gpv-balance-copy-controls',
        buttonClassName = 'gpv-section-toggle gpv-balance-copy-button',
        statusClassName = 'gpv-balance-copy-status'
    }) {
        const controls = createElement('div', controlsClassName);
        const copyButton = createElement('button', buttonClassName, buttonLabel);
        copyButton.type = 'button';
        if (buttonAriaLabel) {
            copyButton.setAttribute('aria-label', buttonAriaLabel);
        }
        const status = createElement('div', statusClassName);
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.setAttribute('aria-atomic', 'true');
        copyButton.addEventListener('click', async () => {
            try {
                const payload = typeof copyText === 'function' ? copyText() : '';
                if (!payload) {
                    setBalanceCopyFeedback(status, emptyMessage || 'Nothing to copy');
                    return;
                }
                await copyTextToClipboard(payload);
                const success = typeof successMessage === 'function' ? successMessage(payload) : successMessage;
                setBalanceCopyFeedback(status, success || 'Copied');
            } catch (_error) {
                setBalanceCopyFeedback(status, 'Copy failed', 'error');
            }
        });
        controls.appendChild(copyButton);
        controls.appendChild(status);
        return controls;
    }

    function buildBalanceCopyControls(goalTypeModel) {
        return buildCopyControls({
            buttonLabel: 'Copy balances row',
            emptyMessage: 'No goals to copy',
            successMessage: () => {
                const matchingGoals = Array.isArray(goalTypeModel?.goals) ? goalTypeModel.goals : [];
                return `Copied ${matchingGoals.length} balances`;
            },
            copyText: () => {
                const matchingGoals = Array.isArray(goalTypeModel?.goals) ? goalTypeModel.goals : [];
                return matchingGoals.length > 0 ? buildGoalBalancesTsvRow(matchingGoals) : '';
            }
        });
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

        contentDiv.appendChild(buildBucketHeader(bucketViewModel));
        renderPlanningPanel(contentDiv, bucketViewModel);
        renderAllocationDriftHint(contentDiv, bucketViewModel);

        bucketViewModel.goalTypes.forEach(goalTypeModel => {
            const typeGrowth = goalTypeModel.growthDisplay;

            const typeSection = createElement('div', 'gpv-type-section');
            typeSection.dataset.bucket = bucketViewModel.bucketName;
            typeSection.dataset.goalType = goalTypeModel.goalType;

            const typeHeader = createElement('div', 'gpv-type-header');
            const typeTitle = createElement('h3', null, goalTypeModel.displayName);
            const typeSummary = createElement('div', 'gpv-type-summary');
            appendLabeledValue(typeSummary, null, 'Balance:', goalTypeModel.endingBalanceDisplay);
            appendLabeledValue(typeSummary, null, 'Return:', goalTypeModel.returnDisplay);
            appendLabeledValue(typeSummary, null, 'Growth:', typeGrowth);
            appendLabeledValue(
                typeSummary,
                null,
                'Allocation Drift:',
                goalTypeModel.allocationDriftDisplay,
                { valueClass: goalTypeModel.allocationDriftClass || null }
            );
            typeHeader.appendChild(typeTitle);
            typeHeader.appendChild(typeSummary);

            const typeActions = createElement('div', 'gpv-type-actions');
            typeActions.appendChild(buildBalanceCopyControls(goalTypeModel));
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
            const performanceCollapsed = getCollapseState(
                bucketViewModel.bucketName,
                goalTypeId,
                COLLAPSE_SECTIONS.performance
            );
            const projectionCollapsed = getCollapseState(
                bucketViewModel.bucketName,
                goalTypeId,
                COLLAPSE_SECTIONS.projection
            );

            const performanceSection = createPerformancePanel({
                bucketViewModel,
                goalTypeModel,
                cleanupCallbacks,
                onPerformanceDataLoaded,
                useCacheOnly,
                performanceSectionId,
                initialCollapsed: performanceCollapsed
            });
            const projectionSection = createProjectionPanel({
                goalTypeModel,
                bucketViewModel,
                projectedInvestmentsState,
                mergedInvestmentDataState,
                projectionSectionId,
                initialCollapsed: projectionCollapsed,
                typeSection
            });

            typeActions.appendChild(performanceSection.toggle);
            typeActions.appendChild(projectionSection.toggle);

            typeSection.appendChild(performanceSection.panel);
            typeSection.appendChild(projectionSection.panel);

            buildGoalTypeTable({ goalTypeModel, typeSection });
            wireGoalTypeEvents({
                typeSection,
                goalTypeModel,
                bucketViewModel,
                mergedInvestmentDataState,
                projectedInvestmentsState
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
            const driftCell = row.querySelector('.gpv-column-drift');
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
            if (driftCell) {
                driftCell.textContent = formatDriftDisplay(goalModel.driftPercent, goalModel.driftAmount);
                const driftClass = getDriftSeverityClass(goalModel.driftPercent);
                driftCell.className = driftClass ? `gpv-column-drift ${driftClass}` : 'gpv-column-drift';
            }
        });
    }

    function refreshBucketPlanningPanel({
        typeSection,
        bucket,
        mergedInvestmentDataState,
        projectedInvestmentsState
    }) {
        const contentDiv = typeSection?.closest('.gpv-content');
        if (!contentDiv || !bucket) {
            return;
        }
        const bucketViewModel = buildBucketDetailViewModel({
            bucketName: bucket,
            bucketMap: mergedInvestmentDataState,
            projectedInvestmentsState,
            goalTargetById: buildGoalTargetById(collectGoalIds(mergedInvestmentDataState?.[bucket]), GoalTargetStore.getTarget),
            goalFixedById: buildGoalFixedById(collectGoalIds(mergedInvestmentDataState?.[bucket]), GoalTargetStore.getFixed)
        });
        if (!bucketViewModel) {
            return;
        }

        const detailHeader = contentDiv.querySelector('.gpv-detail-header');
        const healthBadge = detailHeader?.querySelector('.gpv-health-badge');
        if (healthBadge) {
            healthBadge.className = `gpv-health-badge ${bucketViewModel.health?.className || 'gpv-health--healthy'}`;
            healthBadge.textContent = `${bucketViewModel.health?.label || 'Healthy'}`;
        }

        const existingPanel = contentDiv.querySelector('.gpv-planning-panel');
        const nextSibling = existingPanel?.nextSibling || null;
        if (existingPanel) {
            existingPanel.remove();
        }
        renderPlanningPanel(contentDiv, bucketViewModel, { beforeNode: nextSibling });
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
        _currentEndingBalance,
        _totalTypeEndingBalance,
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
        
        if (value === '') {
            // Clear the target if input is empty
            GoalTargetStore.clearTarget(goalId);
            refreshGoalTypeSection({
                typeSection,
                bucket,
                goalType,
                mergedInvestmentDataState,
                projectedInvestmentsState
            });
            refreshBucketPlanningPanel({
                typeSection,
                bucket,
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
        
        refreshGoalTypeSection({
            typeSection,
            bucket,
            goalType,
            mergedInvestmentDataState,
            projectedInvestmentsState
        });
        refreshBucketPlanningPanel({
            typeSection,
            bucket,
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
        refreshBucketPlanningPanel({
            typeSection,
            bucket,
            mergedInvestmentDataState,
            projectedInvestmentsState
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
            refreshBucketPlanningPanel({
                typeSection,
                bucket,
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

    const FSM_PROJECTION_BUCKET = '__fsm__';

    function isFsmProjectedScope(selectedScope, activePortfolioIds) {
        if (!selectedScope || selectedScope === FSM_ALL_PORTFOLIO_ID || selectedScope === FSM_UNASSIGNED_PORTFOLIO_ID) {
            return false;
        }
        return Array.isArray(activePortfolioIds) && activePortfolioIds.includes(selectedScope);
    }

    function createProjectedInvestmentInput({
        amount = 0,
        inputLabel = 'Add Projected Investment (simulation only):',
        placeholder = 'Enter amount',
        onInput = null,
        dataAttributes = {}
    }) {
        const projectedInputContainer = createElement('div', 'gpv-projected-input-container');
        const projectedLabel = createElement('label', 'gpv-projected-label');
        appendTextSpan(projectedLabel, 'gpv-projected-icon', '💡');
        appendTextSpan(projectedLabel, null, inputLabel);

        const projectedInput = createElement('input', CLASS_NAMES.projectedInput);
        projectedInput.type = 'number';
        projectedInput.step = '100';
        projectedInput.value = amount > 0 ? String(amount) : '';
        projectedInput.placeholder = placeholder;
        Object.keys(dataAttributes || {}).forEach(key => {
            if (!key) {
                return;
            }
            projectedInput.dataset[key] = String(dataAttributes[key]);
        });

        if (typeof onInput === 'function') {
            projectedInput.addEventListener('input', function() {
                onInput(this);
            });
        }

        projectedInputContainer.appendChild(projectedLabel);
        projectedInputContainer.appendChild(projectedInput);
        return {
            container: projectedInputContainer,
            label: projectedLabel,
            input: projectedInput
        };
    }

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
    function _formatTimestamp(timestamp) {
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

    function buildSyncSettingsState() {
        const syncStatus = SyncManager.getStatus();
        const isEnabled = syncStatus.isEnabled;
        const cryptoSupported = syncStatus.cryptoSupported;
        const hasSessionKey = syncStatus.hasSessionKey;
        const hasValidRefreshToken = syncStatus.hasValidRefreshToken;
        const serverUrl = utils.normalizeServerUrl(Storage.get(SYNC_STORAGE_KEYS.serverUrl, SYNC_DEFAULTS.serverUrl)) || SYNC_DEFAULTS.serverUrl;
        const userId = Storage.get(SYNC_STORAGE_KEYS.userId, '');
        const rememberKey = Storage.get(SYNC_STORAGE_KEYS.rememberKey, false) === true;
        const autoSync = Storage.get(SYNC_STORAGE_KEYS.autoSync, SYNC_DEFAULTS.autoSync);
        const syncInterval = Storage.get(SYNC_STORAGE_KEYS.syncInterval, SYNC_DEFAULTS.syncInterval);
        const lastSyncTimestamp = syncStatus.lastSync;
        return {
            syncStatus,
            isEnabled,
            cryptoSupported,
            hasSessionKey,
            hasValidRefreshToken,
            serverUrl,
            userId,
            rememberKey,
            autoSync,
            syncInterval,
            lastSyncText: lastSyncTimestamp
                ? new Date(lastSyncTimestamp).toLocaleString()
                : 'Never'
        };
    }

    function renderSyncHeader({ cryptoSupported }) {
        return `
            <div class="gpv-sync-header">
                <h3>Sync Settings</h3>
                ${!cryptoSupported ? `
                    <div class="gpv-sync-warning">
                        ⚠️ Web Crypto API not supported in this browser. Sync requires a modern browser.
                    </div>
                ` : ''}
            </div>
        `;
    }

    function renderSyncStatusBar({ syncStatus, hasValidRefreshToken, hasSessionKey, lastSyncText }) {
        return `
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
        `;
    }

    function renderSyncActivation({ isEnabled, cryptoSupported }) {
        return `
            <div class="gpv-sync-form-group">
                <h4 class="gpv-sync-quick-title">Quick setup</h4>
                <p class="gpv-sync-help gpv-sync-help--lead">
                    Set your sync endpoint, user ID, and password, then save to enable cross-device portfolio sync.
                </p>
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
                    Login and Sign Up validate credentials immediately. Save applies local sync settings on this device.
                </p>
            </div>
        `;
    }

    function renderServerUrlField({ serverUrl, isEnabled, cryptoSupported }) {
        return `
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
        `;
    }

    function renderUserIdField({ userId, isEnabled, cryptoSupported }) {
        return `
            <div class="gpv-sync-form-group">
                <label for="gpv-sync-user-id">User ID / Email</label>
                <input 
                    type="text" 
                    id="gpv-sync-user-id"
                    class="gpv-sync-input"
                    value="${escapeHtml(userId)}"
                    placeholder="user@example.com"
                    ${!isEnabled || !cryptoSupported ? 'disabled' : ''}
                />
                <p class="gpv-sync-help">Use an email or short username.</p>
            </div>
        `;
    }

    function renderPasswordField({ isEnabled, cryptoSupported }) {
        return `
            <div class="gpv-sync-form-group">
                <label for="gpv-sync-password">Password</label>
                <input 
                    type="password" 
                    id="gpv-sync-password"
                    class="gpv-sync-input"
                    placeholder="••••••••"
                    ${!isEnabled || !cryptoSupported ? 'disabled' : ''}
                />
                <p class="gpv-sync-help">Minimum 8 characters. Your password never leaves your device.</p>
            </div>
        `;
    }

    function renderRememberKeySection({ isEnabled, cryptoSupported, rememberKey }) {
        return `
            <div class="gpv-sync-form-group">
                <label class="gpv-sync-toggle">
                    <input
                        type="checkbox"
                        id="gpv-sync-remember-key"
                        ${rememberKey ? 'checked' : ''}
                        ${!isEnabled || !cryptoSupported ? 'disabled' : ''}
                    />
                    <span>Remember encryption key on this device</span>
                </label>
                <p class="gpv-sync-help">Trusted devices only. Keeps sync unlocked across browser sessions.</p>
            </div>
        `;
    }

    function renderAutoSyncSection({ autoSync, syncInterval, isEnabled, cryptoSupported }) {
        return `
            <div class="gpv-sync-form-group">
                <label class="gpv-sync-toggle">
                    <input
                        type="checkbox"
                        id="gpv-sync-auto"
                        ${autoSync ? 'checked' : ''}
                        ${!isEnabled || !cryptoSupported ? 'disabled' : ''}
                    />
                    <span>Enable Auto-Sync</span>
                </label>
                <div class="gpv-sync-interval">
                    <label for="gpv-sync-interval">Sync Interval (minutes)</label>
                    <input
                        type="number"
                        id="gpv-sync-interval"
                        class="gpv-sync-input"
                        min="5"
                        max="1440"
                        value="${syncInterval}"
                        ${!autoSync || !isEnabled || !cryptoSupported ? 'disabled' : ''}
                    />
                    <p class="gpv-sync-help">Background sync interval (5-1440 minutes). Changes are also batched and synced automatically.</p>
                </div>
            </div>
        `;
    }

    function renderSyncAuthButtons({ isEnabled, cryptoSupported, syncStatus }) {
        if (syncStatus.isConfigured) {
            return '';
        }
        return `
            <div class="gpv-sync-auth-buttons">
                <button type="button" class="gpv-sync-btn-primary" id="gpv-sync-register-btn" ${!isEnabled || !cryptoSupported ? 'disabled' : ''}>
                    📝 Sign Up
                </button>
                <button type="button" class="gpv-sync-btn-secondary" id="gpv-sync-login-btn" ${!isEnabled || !cryptoSupported ? 'disabled' : ''}>
                    🔑 Login
                </button>
            </div>
            <p class="gpv-sync-help" style="text-align: center; margin-top: 8px;">
                New user? Click <strong>Sign Up</strong> to create an account.<br>
                Existing user? Click <strong>Login</strong> to enable sync and verify credentials.
            </p>
        `;
    }

    function renderSyncActionButtons({ isEnabled, cryptoSupported }) {
        return `
            <div class="gpv-sync-actions">
                <button class="gpv-sync-btn gpv-sync-btn-secondary" id="gpv-sync-test-btn" ${!isEnabled || !cryptoSupported ? 'disabled' : ''}>
                    Test Connection
                </button>
                <button class="gpv-sync-btn gpv-sync-btn-danger" id="gpv-sync-clear-btn" ${!cryptoSupported ? 'disabled' : ''}>
                    Logout
                </button>
            </div>
        `;
    }

    function renderSyncPrimaryAction({ isEnabled, cryptoSupported, syncStatus }) {
        return `
            <div class="gpv-sync-actions">
                <button class="gpv-sync-btn gpv-sync-btn-primary" id="gpv-sync-save-btn" ${!cryptoSupported ? 'disabled' : ''}>
                    Save Settings
                </button>
                <button class="gpv-sync-btn gpv-sync-btn-secondary" id="gpv-sync-now-btn" ${!isEnabled || !syncStatus.isConfigured || !syncStatus.hasSessionKey || !cryptoSupported ? 'disabled' : ''}>
                    Sync Now
                </button>
            </div>
        `;
    }

    function renderSyncAdvancedSection({
        isEnabled,
        cryptoSupported,
        autoSync,
        syncInterval
    }) {
        return `
            <details class="gpv-sync-advanced">
                <summary>Advanced settings</summary>
                <div class="gpv-sync-advanced-content">
                    ${renderAutoSyncSection({ autoSync, syncInterval, isEnabled, cryptoSupported })}
                    ${renderSyncActionButtons({ isEnabled, cryptoSupported })}
                </div>
            </details>
        `;
    }

    function createSyncSettingsHTML() {
        const state = buildSyncSettingsState();
        return `
            <div class="gpv-sync-settings">
                ${renderSyncHeader(state)}
                ${renderSyncStatusBar(state)}
                <div class="gpv-sync-form">
                    ${renderSyncActivation(state)}
                    ${renderServerUrlField(state)}
                    ${renderUserIdField(state)}
                    ${renderPasswordField(state)}
                    ${renderRememberKeySection(state)}
                    ${renderSyncAuthButtons(state)}
                    ${renderSyncPrimaryAction({
                        isEnabled: state.isEnabled,
                        cryptoSupported: state.cryptoSupported,
                        syncStatus: state.syncStatus
                    })}
                    ${renderSyncAdvancedSection({
                        isEnabled: state.isEnabled,
                        cryptoSupported: state.cryptoSupported,
                        autoSync: state.autoSync,
                        syncInterval: state.syncInterval,
                        syncStatus: state.syncStatus
                    })}
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
            if (normalized && utils.isAllowedSyncServerUrl(normalized)) {
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

    const enabledCheckbox = document.getElementById('gpv-sync-enabled');

    function updateSyncActivationControls(isEnabled) {
        const inputs = document.querySelectorAll('.gpv-sync-input, #gpv-sync-auto, #gpv-sync-interval, #gpv-sync-remember-key');
        inputs.forEach(input => {
            input.disabled = !isEnabled;
        });

        const status = SyncManager.getStatus();
        const buttons = document.querySelectorAll('#gpv-sync-test-btn, #gpv-sync-now-btn, #gpv-sync-register-btn, #gpv-sync-login-btn');
        buttons.forEach(btn => {
            if (btn.id === 'gpv-sync-now-btn') {
                btn.disabled = !isEnabled || !status.isConfigured || !status.hasSessionKey;
                return;
            }
            if (btn.id === 'gpv-sync-test-btn') {
                btn.disabled = !isEnabled || !status.isConfigured;
                return;
            }
            btn.disabled = !isEnabled;
        });
    }

    // Enable/disable sync
    if (enabledCheckbox) {
        enabledCheckbox.addEventListener('change', (e) => {
            updateSyncActivationControls(e.target.checked);
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

    updateSyncActivationControls(enabledCheckbox?.checked === true);

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
                            throw new Error('Password is required to unlock sync for this session');
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
                            rememberKey,
                            autoSync,
                            syncInterval
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
                        enabled,
                        serverUrl,
                        userId,
                        password,
                        rememberKey,
                        autoSync,
                        syncInterval
                    } = getSyncFormState();

                    if (!enabled) {
                        throw new Error('Activate Sync before signing up');
                    }

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
                        rememberKey,
                        autoSync,
                        syncInterval
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
                        enabled,
                        serverUrl,
                        userId,
                        password,
                        rememberKey,
                        autoSync,
                        syncInterval
                    } = getSyncFormState();

                    if (!enabled) {
                        throw new Error('Activate Sync before logging in');
                    }

                    if (!serverUrl || !userId || !password) {
                        throw new Error('Please fill in Server URL, User ID, and Password');
                    }

                    await SyncManager.login(serverUrl, userId, password);
                    await SyncManager.enable({
                        serverUrl,
                        userId,
                        password,
                        rememberKey,
                        autoSync,
                        syncInterval
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
                    utils.assertAllowedSyncServerUrl(serverUrl);
                    Storage.set(SYNC_STORAGE_KEYS.serverUrl, serverUrl);
                    const response = await SyncManager.requestJson(`${serverUrl}/health`);
                    const data = await response.json().catch(() => ({}));

                    if (response.ok && data.status === 'ok') {
                        showSuccessMessage(`Connection successful! Server version: ${data.version}`);
                    } else {
                        const fallback = response.parseError && response.rawText
                            ? `Server returned non-JSON response: ${response.rawText.slice(0, 120)}`
                            : (data.message || 'Server returned unexpected response');
                        throw new Error(fallback);
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
            setupSyncSettingsListeners,
            createConflictDialogHTML,
            renderSyncOverlayView
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

    const actionButtons = [];

    if (typeof onBack === 'function') {
        const backBtn = document.createElement('button');
        backBtn.className = 'gpv-sync-btn';
        backBtn.type = 'button';
        backBtn.textContent = backLabel || '← Back';
        backBtn.title = 'Return to previous view';
        backBtn.onclick = () => {
            closeOverlay();
            onBack();
        };
        actionButtons.push(backBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'gpv-close-btn';
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.onclick = closeOverlay;
    const { header } = buildOverlayHeader({
        title,
        actionButtons,
        closeButton: closeBtn
    });
    const titleId = 'gpv-sync-overlay-title';
    const headerTitleNode = header.querySelector('h1');
    if (headerTitleNode) {
        headerTitleNode.id = titleId;
    }

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

function showSyncSettings(options = {}) {
    const returnTo = utils.normalizeString(options?.returnTo, 'endowus');
    const syncReturnConfig = {
        endowus: {
            backLabel: '← Back to Portfolio Viewer',
            onBack: () => {
                if (typeof showOverlay === 'function') {
                    showOverlay();
                }
            }
        },
        fsm: {
            backLabel: '← Back to Portfolio Viewer (FSM)',
            onBack: () => {
                const holdings = getFsmReadinessState().fsmHoldings;
                if (Array.isArray(holdings) && holdings.length > 0) {
                    renderFsmOverlay(holdings);
                    return;
                }
                if (typeof showOverlay === 'function') {
                    showOverlay();
                }
            }
        },
        ocbc: {
            backLabel: '← Back to Portfolio Viewer (OCBC)',
            onBack: () => {
                const holdings = getOcbcReadinessState().ocbcHoldings;
                if (holdings) {
                    renderOcbcOverlay(holdings);
                    return;
                }
                if (typeof showOverlay === 'function') {
                    showOverlay();
                }
            }
        }
    };
    const resolvedReturnConfig = syncReturnConfig[returnTo] || syncReturnConfig.endowus;
    
    try {
        let settingsHTML;
        try {
            settingsHTML = createSyncSettingsHTML();
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Error creating settings HTML:', error);
            settingsHTML = '<div style="padding: 20px; color: #ef4444;">Error loading sync settings. Please check console for details.</div>';
        }

        renderSyncOverlayView({
            title: 'Sync Settings',
            bodyHtml: settingsHTML,
            onBack: resolvedReturnConfig.onBack,
            backLabel: resolvedReturnConfig.backLabel
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
    const localEndowus = getEndowusSyncView(conflict.local);
    const remoteEndowus = getEndowusSyncView(conflict.remote);
    const localTargets = countSyncedTargets(localEndowus.goalTargets, localEndowus.goalFixed);
    const remoteTargets = countSyncedTargets(remoteEndowus.goalTargets, remoteEndowus.goalFixed);
    const localFixed = Object.keys(localEndowus.goalFixed || {}).length;
    const remoteFixed = Object.keys(remoteEndowus.goalFixed || {}).length;
    const diffSections = _buildConflictDiffItems(conflict);
    const sectionRows = (rows, label) => rows.length > 0
        ? `<table class="gpv-conflict-diff-table"><thead><tr><th>${label}</th><th>Local</th><th>Remote</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<div class="gpv-conflict-diff-empty">No differences detected.</div>';

    const endowusRows = diffSections.endowus.map(item => `
        <tr>
            <td class="gpv-conflict-goal-name">${escapeHtml(item.goalName)}</td>
            <td>${escapeHtml(item.localTargetDisplay)} / ${escapeHtml(item.localFixedDisplay)} / ${escapeHtml(item.localBucketDisplay)}</td>
            <td>${escapeHtml(item.remoteTargetDisplay)} / ${escapeHtml(item.remoteFixedDisplay)} / ${escapeHtml(item.remoteBucketDisplay)}</td>
        </tr>
    `).join('');

    const fsmDefinitionRows = diffSections.fsm
        .filter(item => item.section === 'definition')
        .map(item => `
            <tr>
                <td class="gpv-conflict-goal-name">${escapeHtml(item.settingName)}</td>
                <td>${escapeHtml(item.localDisplay)}</td>
                <td>${escapeHtml(item.remoteDisplay)}</td>
            </tr>
        `).join('');
    const fsmAssignmentRows = diffSections.fsm
        .filter(item => item.section === 'assignment')
        .map(item => `
            <tr>
                <td class="gpv-conflict-goal-name">${escapeHtml(item.settingName)}</td>
                <td>${escapeHtml(item.localDisplay)}</td>
                <td>${escapeHtml(item.remoteDisplay)}</td>
            </tr>
        `).join('');
    const fsmInstrumentRows = diffSections.fsm
        .filter(item => item.section === 'instrument')
        .map(item => `
            <tr>
                <td class="gpv-conflict-goal-name">${escapeHtml(item.settingName)}</td>
                <td>${escapeHtml(item.localDisplay)}</td>
                <td>${escapeHtml(item.remoteDisplay)}</td>
            </tr>
        `).join('');
    const hasTargetRows = endowusRows.length > 0 || fsmInstrumentRows.length > 0;
    const targetRowsHtml = hasTargetRows
        ? `${endowusRows.length > 0 ? sectionRows(endowusRows, 'Goal') : ''}${fsmInstrumentRows.length > 0 ? sectionRows(fsmInstrumentRows, 'Instrument') : ''}`
        : '<div class="gpv-conflict-diff-empty">No differences detected.</div>';

    return `
        <div class="gpv-conflict-dialog" data-step="1">
            <h3>⚠️ Sync Conflict Detected</h3>
            <div class="gpv-conflict-stepper" aria-label="Conflict resolution steps">
                <span class="gpv-conflict-step is-active" data-step-indicator="1">1 Summary</span>
                <span class="gpv-conflict-step" data-step-indicator="2">2 Definitions</span>
                <span class="gpv-conflict-step" data-step-indicator="3">3 Assignments</span>
                <span class="gpv-conflict-step" data-step-indicator="4">4 Targets</span>
                <span class="gpv-conflict-step" data-step-indicator="5">5 Resolve</span>
            </div>
            <div class="gpv-conflict-step-panel" data-step-panel="1">
                <p class="gpv-conflict-description">Local and server sync data differ. Review each section before choosing a final action.</p>
                <ul class="gpv-conflict-details">
                    <li><strong>Local:</strong> ${localTargets} targets / ${localFixed} fixed</li>
                    <li><strong>Server:</strong> ${remoteTargets} targets / ${remoteFixed} fixed</li>
                    <li><strong>FSM differences:</strong> ${diffSections.fsm.length}</li>
                    <li><strong>Endowus differences:</strong> ${diffSections.endowus.length}</li>
                </ul>
            </div>
            <div class="gpv-conflict-step-panel" data-step-panel="2" hidden>
                <h4>Portfolio definition changes</h4>
                ${sectionRows(fsmDefinitionRows, 'Setting')}
            </div>
            <div class="gpv-conflict-step-panel" data-step-panel="3" hidden>
                <h4>Assignment changes</h4>
                ${sectionRows(fsmAssignmentRows, 'Setting')}
            </div>
            <div class="gpv-conflict-step-panel" data-step-panel="4" hidden>
                <h4>Targets and drift changes</h4>
                ${targetRowsHtml}
            </div>
            <div class="gpv-conflict-step-panel" data-step-panel="5" hidden>
                <h4>Final decision</h4>
                <p class="gpv-conflict-warning"><strong>Impact:</strong> Keep This Device uploads local config. Use Server overwrites this device config.</p>
                <div class="gpv-conflict-actions">
                    <button class="gpv-sync-btn gpv-sync-btn-primary" id="gpv-conflict-keep-local">Keep This Device</button>
                    <button class="gpv-sync-btn gpv-sync-btn-primary" id="gpv-conflict-use-remote">Use Server</button>
                </div>
            </div>
            <div class="gpv-conflict-actions">
                <button class="gpv-sync-btn gpv-sync-btn-secondary" id="gpv-conflict-prev">Back</button>
                <button class="gpv-sync-btn gpv-sync-btn-secondary" id="gpv-conflict-next">Next</button>
                <button class="gpv-sync-btn gpv-sync-btn-secondary" id="gpv-conflict-cancel">Cancel</button>
            </div>
        </div>
    `;
}

function buildGoalNameMap() {
    const cached = readEndowusStore().summary;
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
    const goalBucketById = buildGoalBucketAssignmentMap({
        performanceData: state.apiData.performance,
        investibleData: state.apiData.investible,
        summaryData: state.apiData.summary,
        getAssignedBucket: GoalTargetStore.getBucket,
        seedAssignedBucket: GoalTargetStore.setBucket
    });
    const merged = buildMergedInvestmentData(
        state.apiData.performance,
        state.apiData.investible,
        state.apiData.summary,
        goalBucketById
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
    const fsmHoldings = Array.isArray(state?.apiData?.fsmHoldings)
        ? state.apiData.fsmHoldings
        : getFsmHoldingsFromStorage();
    return buildConflictDiffSections(conflict, buildGoalNameMap(), { fsmHoldings });
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

    const dialog = document.querySelector('.gpv-conflict-dialog');
    const stepIndicators = Array.from(document.querySelectorAll('[data-step-indicator]'));
    const stepPanels = Array.from(document.querySelectorAll('[data-step-panel]'));
    const prevBtn = document.getElementById('gpv-conflict-prev');
    const nextBtn = document.getElementById('gpv-conflict-next');
    let currentStep = 1;
    const maxStep = 5;

    function updateStep(step) {
        currentStep = Math.min(maxStep, Math.max(1, step));
        if (dialog) {
            dialog.setAttribute('data-step', String(currentStep));
        }
        stepIndicators.forEach(node => {
            const isActive = Number(node.getAttribute('data-step-indicator')) === currentStep;
            node.classList.toggle('is-active', isActive);
        });
        stepPanels.forEach(node => {
            const isActive = Number(node.getAttribute('data-step-panel')) === currentStep;
            node.hidden = !isActive;
        });
        if (prevBtn) {
            prevBtn.disabled = currentStep === 1;
        }
        if (nextBtn) {
            nextBtn.disabled = currentStep === maxStep;
        }
    }
    if (prevBtn) {
        prevBtn.addEventListener('click', () => updateStep(currentStep - 1));
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => updateStep(currentStep + 1));
    }
    updateStep(1);

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

    const STYLE_SECTIONS = {
        core: `
            /* Modern Portfolio Viewer Styles */
            .gpv-overlay,
            .gpv-trigger-btn,
            .gpv-notification,
            .gpv-sync-indicator {
                --gpv-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                --gpv-font-size-title: 20px;
                --gpv-font-size-section-title: 18px;
                --gpv-font-size-body: 14px;
                --gpv-font-size-small: 12px;
                --gpv-line-height: 1.45;
                --gpv-space-1: 6px;
                --gpv-space-2: 8px;
                --gpv-space-3: 10px;
                --gpv-space-4: 14px;
                --gpv-space-5: 20px;
                --gpv-space-6: 24px;
                --gpv-radius-sm: 8px;
                --gpv-radius-md: 12px;
                --gpv-radius-lg: 20px;
                --gpv-color-text: #1f2937;
                --gpv-color-muted: #6b7280;
                --gpv-color-border: #e5e7eb;
                --gpv-color-primary: #667eea;
                --gpv-color-primary-strong: #4f46e5;
                --gpv-color-success: #059669;
                --gpv-color-danger: #dc2626;
            }

            .gpv-overlay,
            .gpv-overlay *,
            .gpv-trigger-btn,
            .gpv-notification,
            .gpv-sync-indicator,
            .gpv-sync-indicator * {
                box-sizing: border-box;
                font-family: var(--gpv-font-family);
            }

            .gpv-overlay,
            .gpv-trigger-btn,
            .gpv-sync-indicator,
            .gpv-notification {
                font-size: var(--gpv-font-size-body);
                line-height: var(--gpv-line-height);
                color: var(--gpv-color-text);
            }

            .gpv-container h1,
            .gpv-container h2,
            .gpv-container h3,
            .gpv-container h4,
            .gpv-container p,
            .gpv-container label,
            .gpv-container button,
            .gpv-container input,
            .gpv-container select,
            .gpv-container textarea,
            .gpv-container table,
            .gpv-container th,
            .gpv-container td {
                font-family: inherit;
            }

            .gpv-trigger-btn,
            .gpv-container button,
            .gpv-container input,
            .gpv-container select,
            .gpv-container textarea,
            .gpv-sync-btn,
            .gpv-sync-input {
                font-family: var(--gpv-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif) !important;
                line-height: var(--gpv-line-height, 1.45) !important;
            }
            
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
                font-family: var(--gpv-font-family);
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
                font-family: var(--gpv-font-family);
                font-size: var(--gpv-font-size-body);
                line-height: var(--gpv-line-height);
            }

            .gpv-container button,
            .gpv-container input,
            .gpv-container select,
            .gpv-container textarea,
            .gpv-container label {
                font-family: inherit;
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
                padding: 14px 20px;
                border-bottom: 1px solid #e5e7eb;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 20px 20px 0 0;
            }
            
            .gpv-header h1 {
                margin: 0;
                font-size: var(--gpv-font-size-title);
                font-weight: 700;
                color: #ffffff;
                font-family: inherit;
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
                gap: 10px;
            }
            
            .gpv-close-btn {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: #ffffff;
                font-size: 24px;
                width: 34px;
                height: 34px;
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
                padding: 10px 20px;
                background: #f9fafb;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .gpv-select-label {
                font-weight: 600;
                color: #1f2937;
                font-size: var(--gpv-font-size-body);
                font-family: inherit;
            }
            
            .gpv-select {
                padding: 10px 18px;
                border: 2px solid #e5e7eb;
                border-radius: 8px;
                font-size: var(--gpv-font-size-body);
                font-weight: 500;
                color: #1f2937;
                background: #ffffff;
                cursor: pointer;
                transition: all 0.2s ease;
                font-family: inherit;
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
                padding: 14px 20px;
                flex: 1;
            }
            
            /* Summary View Styles */
            
            .gpv-summary-container {
                display: flex;
                flex-direction: column;
                gap: var(--gpv-space-4);
            }

            .gpv-allocation-drift-hint {
                background: #fef3c7;
                border: 1px solid #f59e0b;
                border-radius: 10px;
                color: #92400e;
                font-size: 13px;
                font-weight: 600;
                margin-bottom: var(--gpv-space-3);
                padding: 10px 12px;
            }

            .gpv-attention-strip {
                background: #fff7ed;
                border: 1px solid #fed7aa;
                border-radius: 10px;
                padding: 10px 12px;
                margin-bottom: var(--gpv-space-3);
            }

            .gpv-attention-title {
                color: #9a3412;
                font-size: 12px;
                font-weight: 800;
                letter-spacing: 0.04em;
                margin-bottom: 8px;
                text-transform: uppercase;
            }

            .gpv-attention-list {
                list-style: none;
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .gpv-attention-item {
                margin: 0;
                padding: 0;
            }

            .gpv-attention-button {
                width: 100%;
                text-align: left;
                border: 1px solid #fdba74;
                background: #ffedd5;
                color: #7c2d12;
                border-radius: 8px;
                padding: 8px 10px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .gpv-attention-button:hover {
                background: #fed7aa;
            }

            .gpv-attention-button:focus-visible {
                outline: 2px solid rgba(194, 65, 12, 0.45);
                outline-offset: 2px;
            }

            .gpv-health-badge {
                display: inline-flex;
                align-items: center;
                border-radius: 999px;
                padding: 4px 10px;
                font-size: 12px;
                font-weight: 700;
                white-space: nowrap;
            }

            .gpv-health--healthy {
                background: #dcfce7;
                color: #166534;
            }

            .gpv-health--setup {
                background: #ffedd5;
                color: #9a3412;
            }

            .gpv-health--review {
                background: #fee2e2;
                color: #991b1b;
            }

            .gpv-health-reasons {
                list-style: disc;
                margin: 4px 0 12px 18px;
                padding: 0;
                color: #4b5563;
                font-size: 12px;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .gpv-health-reason {
                margin: 0;
            }

            .gpv-planning-panel {
                border: 1px solid #dbeafe;
                background: #eff6ff;
                border-radius: 10px;
                padding: 10px 12px;
                margin-bottom: var(--gpv-space-3);
            }

            .gpv-planning-title {
                margin: 0 0 8px;
                font-size: 14px;
                font-weight: 800;
                color: #1e3a8a;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }

            .gpv-planning-coverage,
            .gpv-planning-copy,
            .gpv-planning-empty {
                margin: 0 0 8px;
                color: #1f2937;
                font-size: 13px;
                line-height: 1.45;
            }

            .gpv-planning-list {
                margin: 0 0 8px 18px;
                padding: 0;
                color: #1f2937;
                font-size: 13px;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .gpv-planning-item {
                margin: 0;
            }

            .gpv-readiness {
                border: 1px solid #dbeafe;
                border-radius: 12px;
                background: #f8fbff;
                padding: 14px;
            }

            .gpv-readiness.gpv-readiness-ready {
                border-color: #86efac;
                background: #f0fdf4;
            }

            .gpv-readiness-title {
                margin: 0 0 8px;
                font-size: 18px;
                font-weight: 700;
                color: #1f2937;
            }

            .gpv-readiness-copy {
                margin: 0 0 12px;
                color: #374151;
                font-size: 14px;
            }

            .gpv-readiness-list {
                margin: 0;
                padding: 0;
                list-style: none;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .gpv-readiness-item {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
                color: #374151;
            }

            .gpv-readiness-item.is-ready .gpv-readiness-icon {
                color: #047857;
            }

            .gpv-readiness-item.is-pending .gpv-readiness-icon {
                color: #2563eb;
            }

            .gpv-bucket-manager {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .gpv-bucket-manager-title {
                margin: 0;
                color: #111827;
                font-size: 18px;
                font-weight: 700;
            }

            .gpv-bucket-manager-copy,
            .gpv-bucket-manager-empty {
                margin: 0;
                font-size: 14px;
                color: #4b5563;
            }

            .gpv-bucket-manager-table td {
                vertical-align: middle;
            }

            .gpv-bucket-manager-goal {
                font-weight: 600;
                color: #111827;
            }

            .gpv-bucket-manager-input {
                min-width: 220px;
            }
        `,
        remainder: `
            
            .gpv-bucket-card {
                background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
                border: 2px solid #dbe4ff;
                border-radius: 12px;
                padding: 16px;
                cursor: pointer;
                transition: all 0.3s ease;
                color: #111827;
            }

            .gpv-summary-container .gpv-bucket-card {
                margin-top: 0;
            }
            
            .gpv-bucket-card:hover {
                border-color: #4f46e5;
                box-shadow: 0 8px 18px rgba(79, 70, 229, 0.14);
                transform: translateY(-2px);
            }

            .gpv-bucket-card:focus-visible {
                outline: 3px solid rgba(102, 126, 234, 0.7);
                outline-offset: 2px;
            }
            
            .gpv-bucket-header {
                margin-bottom: 12px;
                display: grid;
                grid-template-columns: auto 1fr;
                gap: 8px 12px;
                align-items: center;
                color: #111827;
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
                gap: 20px;
            }

            .gpv-bucket-stats {
                flex-wrap: wrap;
                grid-column: 1 / -1;
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

            .gpv-summary-profit-value {
                font-weight: 700;
            }

            .gpv-summary-profit-value.positive,
            .gpv-fsm-overview-stat-value.positive {
                color: #059669;
            }

            .gpv-summary-profit-value.negative,
            .gpv-fsm-overview-stat-value.negative {
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

            .gpv-goal-type-stat .gpv-drift--green,
            .gpv-type-summary .gpv-drift--green,
            .gpv-column-drift.gpv-drift--green,
            .gpv-summary-card.gpv-drift--green,
            .gpv-table .gpv-drift--green {
                color: #059669;
                font-weight: 700;
            }

            .gpv-goal-type-stat .gpv-drift--yellow,
            .gpv-type-summary .gpv-drift--yellow,
            .gpv-column-drift.gpv-drift--yellow,
            .gpv-summary-card.gpv-drift--yellow,
            .gpv-table .gpv-drift--yellow {
                color: #b45309;
                font-weight: 700;
            }

            .gpv-goal-type-stat .gpv-drift--red,
            .gpv-type-summary .gpv-drift--red,
            .gpv-column-drift.gpv-drift--red,
            .gpv-summary-card.gpv-drift--red,
            .gpv-table .gpv-drift--red {
                color: #dc2626;
                font-weight: 700;
            }
            
            /* Detail View Styles */
            
            .gpv-detail-header {
                margin-bottom: var(--gpv-space-4);
                padding-bottom: var(--gpv-space-3);
                border-bottom: 2px solid #e5e7eb;
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                gap: var(--gpv-space-2);
            }
            
            .gpv-detail-title {
                font-size: 22px;
                font-weight: 700;
                color: #111827;
                margin: 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }
            
            .gpv-detail-stats {
                gap: 28px;
                flex-wrap: nowrap;
                width: auto;
                align-self: flex-start;
            }

            .gpv-ocbc-portfolio-header {
                margin-bottom: 16px;
            }

            .gpv-ocbc-detail-stats {
                gap: 16px;
                flex-wrap: wrap;
            }

            .gpv-ocbc-detail-stats .gpv-stat-label {
                font-size: 11px;
                letter-spacing: 0.3px;
            }

            .gpv-ocbc-detail-stats .gpv-stat-value {
                font-size: 16px;
                line-height: 1.2;
            }
            
            .gpv-type-section {
                margin-bottom: var(--gpv-space-5);
            }
            
            .gpv-type-header {
                margin-bottom: var(--gpv-space-3);
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

            .gpv-summary-row .gpv-summary-card-label {
                font-weight: 700;
            }

            .gpv-type-actions {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-top: var(--gpv-space-2);
                flex-wrap: wrap;
            }

            .gpv-balance-copy-controls {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }

            .gpv-balance-copy-controls--section {
                justify-content: flex-start;
                margin: 0 0 16px 0;
            }

            .gpv-balance-copy-button {
                white-space: nowrap;
            }

            .gpv-balance-copy-status {
                font-size: 12px;
                font-weight: 600;
                color: #4b5563;
                min-height: 18px;
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

            .gpv-ocbc-instrument-header-row {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-top: 14px;
                margin-bottom: 4px;
                flex-wrap: wrap;
            }

            .gpv-ocbc-instrument-heading {
                margin: 0;
            }

            .gpv-ocbc-target-summary {
                margin-bottom: 14px;
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
            .gpv-mode-performance .gpv-column-drift,
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

            .gpv-fsm-manager-row {
                gap: 10px;
                margin-bottom: 14px;
                align-items: center;
            }

            .gpv-fsm-manager-row label {
                font-weight: 600;
                color: #334155;
            }

            .gpv-fsm-manager-row .gpv-target-input {
                min-width: 220px;
            }

            .gpv-row-reorder-controls {
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }

            .gpv-row-reorder-controls .gpv-section-toggle:disabled {
                opacity: 0.45;
                cursor: not-allowed;
            }

            .gpv-goal-table .gpv-goal-name,
            .gpv-table .gpv-goal-name {
                text-align: left;
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
                    padding: var(--gpv-space-5);
                    font-size: var(--gpv-font-size-body);
                    line-height: var(--gpv-line-height);
                    font-family: inherit;
                    display: flex;
                    flex-direction: column;
                    gap: var(--gpv-space-4);
                }

                .gpv-sync-settings,
                .gpv-sync-settings * {
                    font-family: inherit;
                }

                .gpv-sync-header h3 {
                    margin: 0;
                    font-size: var(--gpv-font-size-title);
                    font-weight: 600;
                }

                .gpv-sync-warning {
                    background-color: #fff3cd;
                    border: 1px solid #ffc107;
                    border-radius: var(--gpv-radius-sm);
                    padding: var(--gpv-space-3);
                    margin: 0;
                    color: #856404;
                }

                .gpv-sync-status-bar {
                    background-color: #f8f9fa;
                    border: 1px solid #dee2e6;
                    border-radius: var(--gpv-radius-sm);
                    padding: var(--gpv-space-3);
                    margin: 0;
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
                    color: var(--gpv-color-muted);
                }

                .gpv-sync-status-syncing {
                    color: var(--gpv-color-primary-strong);
                    font-weight: 600;
                }

                .gpv-sync-status-success {
                    color: var(--gpv-color-success);
                    font-weight: 600;
                }

                .gpv-sync-status-error {
                    color: var(--gpv-color-danger);
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
                    gap: var(--gpv-space-4);
                }

                .gpv-sync-form-group {
                    display: flex;
                    flex-direction: column;
                    gap: var(--gpv-space-2);
                }

                .gpv-sync-form-group label {
                    font-weight: 600;
                    margin-bottom: 6px;
                    font-size: 14px;
                }

                .gpv-sync-interval {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .gpv-sync-input {
                    padding: var(--gpv-space-2) var(--gpv-space-3);
                    border: 1px solid #ced4da;
                    border-radius: var(--gpv-radius-sm);
                    font-size: var(--gpv-font-size-body);
                    font-family: inherit;
                }

                .gpv-sync-input:disabled {
                    background-color: #e9ecef;
                    cursor: not-allowed;
                }

                .gpv-sync-input:focus {
                    outline: none;
                    border-color: var(--gpv-color-primary-strong);
                    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
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
                    margin: 0;
                    font-size: 13px;
                    color: var(--gpv-color-muted);
                }

                .gpv-sync-help.gpv-ocbc-target-summary {
                    margin: 0;
                }

                .gpv-sync-help--lead {
                    margin: 0;
                    font-size: 13px;
                    color: #4b5563;
                    line-height: 1.45;
                }

                .gpv-sync-quick-title {
                    margin: 0;
                    font-size: 13px;
                    font-weight: 700;
                    color: #374151;
                    text-transform: uppercase;
                    letter-spacing: 0.03em;
                }

                .gpv-sync-help a {
                    color: var(--gpv-color-primary-strong);
                    text-decoration: none;
                }

                .gpv-sync-help a:hover {
                    text-decoration: underline;
                }

                .gpv-sync-actions {
                    display: flex;
                    gap: var(--gpv-space-3);
                    flex-wrap: wrap;
                    margin-top: var(--gpv-space-1);
                }

                .gpv-sync-advanced {
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    background: #f9fafb;
                    padding: 10px 12px;
                }

                .gpv-sync-advanced > summary {
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 700;
                    color: #374151;
                    list-style: none;
                }

                .gpv-sync-advanced > summary::-webkit-details-marker {
                    display: none;
                }

                .gpv-sync-advanced-content {
                    margin-top: 10px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .gpv-sync-auth-buttons {
                    display: flex;
                    gap: var(--gpv-space-3);
                    flex-wrap: wrap;
                    justify-content: center;
                }

                .gpv-sync-btn {
                    padding: var(--gpv-space-2) var(--gpv-space-4);
                    border: none;
                    border-radius: var(--gpv-radius-sm);
                    font-size: var(--gpv-font-size-body);
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
                    border-radius: var(--gpv-radius-lg);
                    padding: var(--gpv-space-3) var(--gpv-space-6);
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
                    border-radius: var(--gpv-radius-lg);
                    padding: var(--gpv-space-3) var(--gpv-space-6);
                    font-weight: 600;
                }

                .gpv-sync-btn-secondary:hover:not(:disabled) {
                    background: rgba(255, 255, 255, 0.3);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
                }

                .gpv-header-buttons .gpv-bucket-manage-btn {
                    background: rgba(255, 255, 255, 0.18);
                    color: #ffffff;
                    border: 2px solid rgba(255, 255, 255, 0.7);
                }

                .gpv-header-buttons .gpv-bucket-manage-btn:hover:not(:disabled) {
                    background: rgba(255, 255, 255, 0.28);
                    color: #ffffff;
                    border-color: #ffffff;
                }

                .gpv-fsm-bulk-apply-btn:hover:not(:disabled) {
                    transform: none;
                }

                .gpv-sync-btn-danger {
                    background-color: #dc3545;
                    color: white;
                }

                .gpv-sync-btn-danger:hover:not(:disabled) {
                    background-color: #c82333;
                }

                /* Backward-compatible aliases for legacy class names */
                .gpv-sync-action {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 4px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .gpv-sync-action:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .gpv-sync-danger {
                    background-color: #dc3545;
                    color: white;
                }

                .gpv-sync-danger:hover:not(:disabled) {
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
                    gap: var(--gpv-space-3);
                    flex-wrap: wrap;
                }

                .gpv-conflict-diff {
                    margin-bottom: 15px;
                    padding: 14px;
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

                .gpv-conflict-stepper {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                    margin-bottom: 16px;
                }

                .gpv-conflict-step {
                    font-size: 12px;
                    padding: 4px 8px;
                    border-radius: 999px;
                    background: #e5e7eb;
                    color: #374151;
                }

                .gpv-conflict-step.is-active {
                    background: #2563eb;
                    color: #fff;
                }

                .gpv-conflict-step-panel {
                    display: block;
                }

                .gpv-conflict-step-panel[hidden] {
                    display: none;
                }

                .gpv-sync-overlay-title {
                    display: block;
                }

                .gpv-fsm-manager,
                .gpv-fsm-toolbar,
                .gpv-fsm-manager-row,
                .gpv-fsm-portfolio-list-row,
                .gpv-summary-row {
                    display: flex;
                    gap: var(--gpv-space-2);
                    align-items: center;
                    flex-wrap: wrap;
                    margin-bottom: var(--gpv-space-3);
                }

                .gpv-fsm-manager,
                .gpv-fsm-overview {
                    display: flex;
                    flex-direction: column;
                    gap: var(--gpv-space-3);
                }

                .gpv-fsm-manager,
                .gpv-fsm-overview {
                    align-items: stretch;
                }

                .gpv-fsm-portfolio-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--gpv-space-2);
                }

                .gpv-fsm-section[hidden] {
                    display: none;
                }

                .gpv-summary-card {
                    background: #f8fafc;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    padding: 8px 10px;
                    font-size: 13px;
                }

                .gpv-summary-row {
                    margin-bottom: var(--gpv-space-4);
                }

                .gpv-fsm-filter-input {
                    width: 220px;
                    max-width: 100%;
                }

                .gpv-fsm-portfolio-list {
                    width: 100%;
                }

                .gpv-fsm-portfolio-list-row {
                    justify-content: space-between;
                    margin-bottom: 0;
                }

                .gpv-fsm-portfolio-actions {
                    display: flex;
                    gap: 6px;
                }

                .gpv-fsm-toolbar > *,
                .gpv-fsm-manager-row > *,
                .gpv-fsm-portfolio-list-row > *,
                .gpv-fsm-portfolio-actions > * {
                    box-sizing: border-box;
                }

                .gpv-fsm-toolbar .gpv-sync-btn,
                .gpv-fsm-toolbar .gpv-select,
                .gpv-fsm-toolbar .gpv-target-input,
                .gpv-fsm-manager-row .gpv-sync-btn,
                .gpv-fsm-manager-row .gpv-select,
                .gpv-fsm-manager-row .gpv-target-input,
                .gpv-fsm-portfolio-list-row .gpv-sync-btn,
                .gpv-fsm-portfolio-list-row .gpv-select,
                .gpv-fsm-portfolio-list-row .gpv-target-input,
                .gpv-fsm-toolbar .gpv-summary-card {
                    min-height: 40px;
                }

                .gpv-fsm-toolbar .gpv-sync-btn,
                .gpv-fsm-manager-row .gpv-sync-btn,
                .gpv-fsm-portfolio-list-row .gpv-sync-btn,
                .gpv-fsm-toolbar .gpv-select,
                .gpv-fsm-manager-row .gpv-select,
                .gpv-fsm-portfolio-list-row .gpv-select {
                    font-size: 14px;
                }

                .gpv-fsm-toolbar .gpv-summary-card {
                    display: inline-flex;
                    align-items: center;
                }

                .gpv-fsm-overview-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    flex-wrap: wrap;
                    margin-bottom: 0;
                }

                .gpv-fsm-overview-copy {
                    margin: 0;
                    color: #4b5563;
                    font-size: 13px;
                    line-height: 1.5;
                }

                .gpv-fsm-overview-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
                    gap: 12px;
                }

                .gpv-fsm-filter-toolbar {
                    margin-bottom: var(--gpv-space-4);
                }

                .gpv-fsm-table-wrap,
                .gpv-table-wrap {
                    margin-bottom: var(--gpv-space-4);
                }

                .gpv-fsm-overview-card {
                    background: #ffffff;
                    border: 2px solid #e5e7eb;
                    border-radius: 12px;
                    padding: 16px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .gpv-fsm-overview-card:hover {
                    border-color: #667eea;
                    box-shadow: 0 6px 18px rgba(102, 126, 234, 0.12);
                    transform: translateY(-1px);
                }

                .gpv-fsm-overview-card:focus-visible {
                    outline: 3px solid rgba(102, 126, 234, 0.7);
                    outline-offset: 2px;
                }

                .gpv-fsm-overview-card--unassigned {
                    border-style: dashed;
                }

                .gpv-fsm-overview-card-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 12px;
                    margin-bottom: 12px;
                }

                .gpv-fsm-overview-card-title {
                    margin: 0;
                    color: #111827;
                    font-size: 18px;
                    font-weight: 700;
                }

                .gpv-fsm-overview-card-subtitle {
                    margin: 4px 0 0 0;
                    color: #6b7280;
                    font-size: 12px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }

                .gpv-fsm-overview-card-tag {
                    background: #eef2ff;
                    border-radius: 999px;
                    color: #4338ca;
                    font-size: 12px;
                    font-weight: 700;
                    padding: 6px 10px;
                    white-space: nowrap;
                }

                .gpv-fsm-overview-stats {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 8px;
                }

                .gpv-fsm-overview-stat {
                    background: #f8fafc;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    padding: 8px 10px;
                }

                .gpv-fsm-overview-stat-label {
                    display: block;
                    color: #6b7280;
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 0.03em;
                    margin-bottom: 4px;
                    text-transform: uppercase;
                }

                .gpv-fsm-overview-stat-value {
                    color: #111827;
                    font-size: 14px;
                    font-weight: 700;
                }

                .gpv-fsm-overview-stat-value.gpv-drift--green {
                    color: #047857;
                }

                .gpv-fsm-overview-stat-value.gpv-drift--yellow {
                    color: #b45309;
                }

                .gpv-fsm-overview-stat-value.gpv-drift--red {
                    color: #b91c1c;
                }

                .gpv-fsm-table-wrap {
                    width: 100%;
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                }

                .gpv-fsm-table-portfolio-select {
                    min-width: 0;
                }

                .gpv-table td[data-col="value"],
                .gpv-table td[data-col="profit"],
                .gpv-table td[data-col="current"],
                .gpv-table td[data-col="drift"] {
                    text-align: right;
                }

                .gpv-fsm-table-wrap .gpv-table td[data-col="profit"] {
                    font-weight: 700;
                }

                .gpv-fsm-table-wrap .gpv-table {
                    min-width: 1120px;
                }

                .gpv-fsm-table-wrap thead th {
                    position: sticky;
                    top: 0;
                    z-index: 1;
                }

                .gpv-target-input:disabled {
                    background: #f3f4f6;
                    color: #6b7280;
                    cursor: not-allowed;
                }

                /* Sync Indicator */
                .gpv-sync-indicator {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background-color: white;
                    border: 1px solid var(--gpv-color-border);
                    border-radius: var(--gpv-radius-lg);
                    padding: var(--gpv-space-2) var(--gpv-space-4);
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
                    border-radius: var(--gpv-radius-sm);
                    padding: var(--gpv-space-3) var(--gpv-space-4);
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
                    border-left: 4px solid var(--gpv-color-primary-strong);
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

                    .gpv-fsm-toolbar {
                        align-items: stretch;
                    }

                    .gpv-fsm-overview-header {
                        align-items: stretch;
                    }

                    .gpv-fsm-overview-stats {
                        grid-template-columns: 1fr;
                    }

                    .gpv-fsm-filter-input {
                        width: 100%;
                    }
                }

        `
    };

    function buildStyleText() {
        return Object.values(STYLE_SECTIONS).join('\n');
    }

    function injectStyles() {
        if (document.getElementById('gpv-styles')) {
            return;
        }
        const style = createElement('style');
        style.id = 'gpv-styles';
        style.textContent = buildStyleText();
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

    function getEndowusReadinessState() {
        const hasPerformance = state.readiness.endowus.performanceLoaded === true
            && Array.isArray(state.apiData.performance);
        const hasInvestible = state.readiness.endowus.investibleLoaded === true
            && Array.isArray(state.apiData.investible);
        const hasSummary = state.readiness.endowus.summaryLoaded === true
            && Array.isArray(state.apiData.summary);
        const goalBucketById = buildGoalBucketAssignmentMap({
            performanceData: state.apiData.performance,
            investibleData: state.apiData.investible,
            summaryData: state.apiData.summary,
            getAssignedBucket: GoalTargetStore.getBucket,
            seedAssignedBucket: GoalTargetStore.setBucket
        });
        const mergedInvestmentDataState = hasPerformance && hasInvestible && hasSummary
            ? buildMergedInvestmentData(
                state.apiData.performance,
                state.apiData.investible,
                state.apiData.summary,
                goalBucketById
            )
            : null;
        return {
            hasPerformance,
            hasInvestible,
            hasSummary,
            ready: Boolean(mergedInvestmentDataState),
            mergedInvestmentDataState
        };
    }

    function getFsmReadinessState() {
        const fsmHoldings = Array.isArray(state.apiData.fsmHoldings) ? state.apiData.fsmHoldings : [];
        return {
            ready: state.readiness.fsm.holdingsLoaded === true,
            fsmHoldings
        };
    }

    function getOcbcReadinessState() {
        const ocbcHoldings = state.apiData.ocbcHoldings && typeof state.apiData.ocbcHoldings === 'object'
            ? state.apiData.ocbcHoldings
            : { assets: [], liabilities: [] };
        return {
            ready: state.readiness.ocbc.holdingsLoaded === true,
            ocbcHoldings: {
                assets: Array.isArray(ocbcHoldings.assets) ? ocbcHoldings.assets : [],
                liabilities: Array.isArray(ocbcHoldings.liabilities) ? ocbcHoldings.liabilities : []
            }
        };
    }

    function createReadinessItem(label, isReady) {
        const item = createElement('li', isReady ? 'gpv-readiness-item is-ready' : 'gpv-readiness-item is-pending');
        const icon = createElement('span', 'gpv-readiness-icon', isReady ? '✓' : '…');
        const text = createElement('span', 'gpv-readiness-label', label);
        item.appendChild(icon);
        item.appendChild(text);
        return item;
    }

function createReadinessView({ title, description, items, tone = 'pending' }) {
        const wrapper = createElement('div', `gpv-readiness gpv-readiness-${tone}`);
        wrapper.setAttribute('role', 'status');
        wrapper.setAttribute('aria-live', 'polite');
        wrapper.appendChild(createElement('h2', 'gpv-readiness-title', title));
        wrapper.appendChild(createElement('p', 'gpv-readiness-copy', description));
        const list = createElement('ul', 'gpv-readiness-list');
        items.forEach(item => {
            list.appendChild(createReadinessItem(item.label, item.ready));
        });
        wrapper.appendChild(list);
        return wrapper;
    }

    function buildAttentionStrip(items, onSelect) {
        const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
        if (safeItems.length === 0) {
            return null;
        }
        const attention = createElement('div', 'gpv-attention-strip');
        const title = createElement('div', 'gpv-attention-title', 'Needs Attention');
        attention.appendChild(title);
        const list = createElement('ul', 'gpv-attention-list');
        safeItems.forEach(item => {
            const li = createElement('li', 'gpv-attention-item');
            const label = utils.normalizeString(item.label, 'Review portfolio settings');
            const button = createElement('button', 'gpv-attention-button', label);
            button.type = 'button';
            button.addEventListener('click', () => {
                if (typeof onSelect === 'function') {
                    onSelect(item);
                }
            });
            li.appendChild(button);
            list.appendChild(li);
        });
        attention.appendChild(list);
        return attention;
    }

    // ============================================
    // Controller
    // ============================================

    function loadFsmPortfolioConfig(fsmHoldings = []) {
        const fsmStore = readFsmStore();
        const portfolios = normalizeFsmPortfolios(Array.isArray(fsmStore.portfolios) ? fsmStore.portfolios : []);
        const assignmentByCode = fsmStore.assignmentByCode && typeof fsmStore.assignmentByCode === 'object'
            ? fsmStore.assignmentByCode
            : {};
        const validPortfolioIds = new Set(portfolios.filter(item => item.archived !== true).map(item => item.id));
        const sanitizedAssignments = {};
        const codeCounts = buildFsmCodeCounts(fsmHoldings);
        (Array.isArray(fsmHoldings) ? fsmHoldings : []).forEach(row => {
            const code = utils.normalizeString(row?.code, '');
            const holdingId = getFsmHoldingIdentity(row);
            if (!holdingId) {
                return;
            }
            const legacyAssigned = isFsmLegacyCodeFallbackAllowed(code, holdingId, codeCounts)
                ? assignmentByCode[code]
                : null;
            const assigned = utils.normalizeString(assignmentByCode[holdingId] || legacyAssigned, '');
            sanitizedAssignments[holdingId] = validPortfolioIds.has(assigned) ? assigned : FSM_UNASSIGNED_PORTFOLIO_ID;
        });
        return {
            portfolios,
            assignmentByCode: sanitizedAssignments
        };
    }

    function saveFsmPortfolioConfig(portfolios, assignmentByCode) {
        const safePortfolios = normalizeFsmPortfolios(portfolios);
        updateFsmStore(current => ({
            ...current,
            portfolios: safePortfolios,
            assignmentByCode: assignmentByCode || {}
        }), 'Error saving FSM portfolio config');
        if (typeof SyncManager?.scheduleSyncOnChange === 'function') {
            SyncManager.scheduleSyncOnChange('fsm-portfolio-config-update');
        }
    }

    function getFsmTarget(code) {
        const store = readFsmStore();
        const value = Object.prototype.hasOwnProperty.call(store.targetsByCode, code)
            ? store.targetsByCode[code]
            : Storage.get(storageKeys.fsmTarget(code), null);
        if (value === null || value === undefined || value === '') {
            return null;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function getFsmFixedValue(code) {
        const store = readFsmStore();
        if (Object.prototype.hasOwnProperty.call(store.fixedByCode, code)) {
            return store.fixedByCode[code] === true;
        }
        if (!Storage.has(storageKeys.fsmFixed(code))) {
            return null;
        }
        return Storage.get(storageKeys.fsmFixed(code), false) === true;
    }

    function buildFsmCodeCounts(fsmHoldings) {
        return (Array.isArray(fsmHoldings) ? fsmHoldings : []).reduce((acc, row) => {
            const code = utils.normalizeString(row?.code, '');
            if (code) {
                acc[code] = (acc[code] || 0) + 1;
            }
            return acc;
        }, {});
    }

    function isFsmLegacyCodeFallbackAllowed(code, holdingId, codeCounts) {
        return Boolean(code && holdingId && holdingId !== code && codeCounts?.[code] === 1);
    }

    function buildFsmRowsWithAssignment(fsmHoldings, assignmentByCode) {
        const codeCounts = buildFsmCodeCounts(fsmHoldings);
        return (Array.isArray(fsmHoldings) ? fsmHoldings : []).map(row => {
            const code = utils.normalizeString(row?.code, '');
            const subcode = utils.normalizeString(row?.subcode ?? row?.subCode, '');
            const holdingId = getFsmHoldingIdentity(code, subcode);
            const allowLegacyFallback = isFsmLegacyCodeFallbackAllowed(code, holdingId, codeCounts);
            const currentValue = Number(row?.currentValueLcy);
            const profitValue = toOptionalFiniteNumber(row?.profitValueLcy);
            const profitPercent = toOptionalFiniteNumber(row?.profitPercentLcy);
            const targetPercent = getFsmTarget(holdingId);
            const fixed = getFsmFixedValue(holdingId);
            return {
                ...row,
                code,
                holdingId,
                displayTicker: subcode || code,
                name: utils.normalizeString(row?.name, '-'),
                productType: utils.normalizeString(row?.productType, '-'),
                currentValueLcy: Number.isFinite(currentValue) ? currentValue : 0,
                profitValueLcy: profitValue,
                profitPercentLcy: profitPercent,
                portfolioId: assignmentByCode[holdingId] || FSM_UNASSIGNED_PORTFOLIO_ID,
                targetPercent: targetPercent ?? (allowLegacyFallback ? getFsmTarget(code) : null),
                fixed: fixed ?? (allowLegacyFallback ? getFsmFixedValue(code) : null) ?? false
            };
        });
    }

    function buildFsmScopedSummary(rows) {
        const total = rows.reduce((sum, row) => sum + (Number(row.currentValueLcy) || 0), 0);
        const activeRows = rows.filter(row => row.fixed !== true);
        const activeTargetPercent = activeRows.reduce((sum, row) => sum + (Number(row.targetPercent) || 0), 0);
        const fixedCoveragePercent = rows.reduce((sum, row) => {
            if (row.fixed !== true) {
                return sum;
            }
            const allocation = calculateFsmCurrentAllocation(total, row);
            if (!Number.isFinite(allocation)) {
                return sum;
            }
            return sum + (allocation * 100);
        }, 0);
        const targetPercentTotal = activeTargetPercent + fixedCoveragePercent;
        const fixedCount = rows.filter(row => row.fixed === true).length;
        const unassignedCount = rows.filter(row => row.portfolioId === FSM_UNASSIGNED_PORTFOLIO_ID).length;
        const configuredIntent = hasConfiguredAllocationIntent({
            targetValues: activeRows.map(row => toFiniteNumber(row?.targetPercent, null)),
            fixedCount
        });
        const hasCompleteProfit = rows.length > 0 && rows.every(row => toOptionalFiniteNumber(row?.profitValueLcy) !== null);
        const totalProfitValue = hasCompleteProfit
            ? rows.reduce((sum, row) => {
                const value = toOptionalFiniteNumber(row?.profitValueLcy);
                return sum + (value === null ? 0 : value);
            }, 0)
            : null;
        const totalProfitPercent = hasCompleteProfit
            ? calculateProfitPercentFromValue(total, totalProfitValue)
            : null;
        const totalDrift = activeRows.reduce((sum, row) => {
            const rowDrift = calculateFsmRowDrift(total, row);
            return sum + (Number.isFinite(rowDrift?.driftPercent) ? Math.abs(rowDrift.driftPercent) : 0);
        }, 0);
        const coverageLabel = configuredIntent ? buildTargetCoverageLabel(targetPercentTotal) : null;
        const driftClass = getDriftSeverityClass(totalDrift);
        const healthReasons = [];
        if (coverageLabel) {
            healthReasons.push(coverageLabel);
        }
        if (unassignedCount > 0) {
            const suffix = unassignedCount === 1 ? '' : 's';
            healthReasons.push(`${unassignedCount} holding${suffix} unassigned to a portfolio`);
        }
        const driftReason = buildAttentionDriftReason(driftClass, 'Large allocation drift across this portfolio scope');
        if (driftReason) {
            healthReasons.push(driftReason);
        }
        return {
            total,
            targetAssignedDisplay: formatPercent(targetPercentTotal / 100, { multiplier: 100, showSign: false }),
            driftDisplay: formatPercent(totalDrift, { multiplier: 100, showSign: false }),
            driftClass,
            holdingsCount: rows.length,
            fixedCount,
            unassignedCount,
            totalProfitValue,
            totalProfitPercent,
            profitDisplay: formatFsmProfitDisplay(totalProfitValue, totalProfitPercent),
            profitClass: getFsmProfitClass(totalProfitPercent),
            targetCoverageLabel: coverageLabel,
            health: buildHealthStatus({
                reasons: healthReasons,
                setupRequired: Boolean(coverageLabel) || unassignedCount > 0
            })
        };
    }

    function buildFsmPlanningModel(rows, summary, options = {}) {
        const safeRows = Array.isArray(rows) ? rows : [];
        const safeSummary = summary || {};
        const underweightCandidates = safeRows
            .filter(row => Number.isFinite(row?.driftAmount) && row.driftAmount < 0)
            .sort((left, right) => Math.abs(right.driftAmount) - Math.abs(left.driftAmount));
        const overweightCandidates = safeRows
            .filter(row => Number.isFinite(row?.driftAmount) && row.driftAmount > 0)
            .sort((left, right) => Math.abs(right.driftAmount) - Math.abs(left.driftAmount));
        const planningRecommendations = buildPlanningRecommendations({
            buys: underweightCandidates,
            sells: overweightCandidates
        });
        const projectedAmount = toFiniteNumber(options?.projectedAmount, 0);
        const scenarioAmount = projectedAmount > 0 ? projectedAmount : 0;
        const scenarioSplit = calculateRecommendedContributionSplit(
            safeRows.map(row => ({
                goalId: row?.holdingId || row?.code,
                goalName: row?.displayTicker || row?.name || row?.code,
                isFixed: row?.fixed === true,
                diffAmount: row?.driftAmount
            })),
            scenarioAmount
        );
        return {
            targetCoverageLabel: safeSummary.targetCoverageLabel || null,
            scenarioAmount,
            scenarioSplit,
            suggestedBuys: planningRecommendations.suggestedBuys,
            suggestedSells: planningRecommendations.suggestedSells,
            triggerBuys: planningRecommendations.triggerBuys,
            triggerSells: planningRecommendations.triggerSells,
            hasMaterialDrift: planningRecommendations.hasMaterialDrift
        };
    }

    function calculateFsmCurrentAllocation(total, row) {
        return calculateAllocationRatio(row?.currentValueLcy, total);
    }

    function buildFsmHeader({ overlay, cleanupCallbacks, titleText = 'Portfolio Viewer (FSM)', syncReturnTo = 'fsm' }) {
        const createSyncButton = () => {
            const syncBtn = createElement('button', 'gpv-sync-btn', '⚙️ Sync');
            syncBtn.title = 'Configure cross-device sync';
            syncBtn.onclick = () => {
                if (typeof showSyncSettings === 'function') {
                    showSyncSettings({ returnTo: syncReturnTo });
                }
            };
            return syncBtn;
        };
        const closeBtn = createElement('button', 'gpv-close-btn', '✕');
        const closeOverlay = () => {
            if (!overlay.isConnected) {
                return;
            }
            cleanupCallbacks.forEach(callback => {
                if (typeof callback === 'function') {
                    callback();
                }
            });
            cleanupCallbacks.length = 0;
            overlay.remove();
        };
        closeBtn.onclick = closeOverlay;

        const { header, titleId } = buildOverlayHeader({
            title: titleText,
            actionButtons: [createSyncButton()],
            closeButton: closeBtn
        });
        return { header, closeBtn, titleId, closeOverlay };
    }

    function buildOverlayHeader({ title, actionButtons = [], closeButton, centerNode = null }) {
        const header = createElement('div', 'gpv-header');
        const titleNode = createElement('h1', null, title || 'Portfolio Viewer');
        const titleId = 'gpv-portfolio-title';
        titleNode.id = titleId;
        const buttonContainer = createElement('div', 'gpv-header-buttons');
        actionButtons.forEach(button => {
            if (button) {
                buttonContainer.appendChild(button);
            }
        });
        if (closeButton) {
            buttonContainer.appendChild(closeButton);
        }
        header.appendChild(titleNode);
        if (centerNode) {
            header.appendChild(centerNode);
        }
        header.appendChild(buttonContainer);
        return { header, titleId };
    }

    function calculateFsmRowDrift(total, row) {
        return calculateAllocationDrift(row?.currentValueLcy, row?.targetPercent, total);
    }

    function buildFsmDisplayRows(rows, total) {
        return (Array.isArray(rows) ? rows : []).map(row => {
            const currentAllocationPercent = calculateFsmCurrentAllocation(total, row);
            const driftModel = calculateFsmRowDrift(total, row);
            const driftPercent = driftModel?.driftPercent ?? null;
            const driftAmount = driftModel?.driftAmount ?? null;
            const currentValue = toFiniteNumber(row?.currentValueLcy, null);
            const profitValue = toOptionalFiniteNumber(row?.profitValueLcy);
            const derivedProfitPercent = calculateProfitPercentFromValue(currentValue, profitValue);
            const profitPercent = resolveProfitPercentRatio(row?.profitPercentLcy, derivedProfitPercent);
            return {
                ...row,
                currentAllocationPercent,
                currentAllocationDisplay: formatPercent(currentAllocationPercent, {
                    multiplier: 100,
                    showSign: false
                }),
                profitValue,
                profitPercent,
                profitDisplay: formatFsmProfitDisplay(profitValue, profitPercent),
                profitClass: getFsmProfitClass(profitPercent),
                driftPercent,
                driftAmount,
                driftDisplay: formatDriftDisplay(driftPercent, driftAmount),
                driftClass: getDriftSeverityClass(driftPercent)
            };
        });
    }

    function buildFsmManagerSummary({
        activePortfolioCount,
        unassignedCount,
        isExpanded,
        onToggle
    }) {
        const managerSummary = createElement('div', 'gpv-fsm-toolbar');
        const summaryBadge = createElement(
            'span',
            'gpv-summary-card',
            `Portfolios: ${activePortfolioCount} · Unassigned: ${unassignedCount}`
        );
        managerSummary.appendChild(summaryBadge);
        const managerToggleBtn = createElement(
            'button',
            'gpv-sync-btn gpv-sync-btn-secondary',
            isExpanded ? 'Hide portfolio manager' : 'Manage portfolios'
        );
        managerToggleBtn.type = 'button';
        managerToggleBtn.setAttribute('aria-expanded', String(isExpanded));
        managerToggleBtn.onclick = () => {
            if (typeof onToggle === 'function') {
                onToggle();
            }
        };
        managerSummary.appendChild(managerToggleBtn);
        return managerSummary;
    }

    function buildFsmManagerPanel({
        activePortfolios,
        editingPortfolioId,
        onCreate,
        onStartRename,
        onSaveRename,
        onCancelRename,
        onArchive
    }) {
        const manager = createElement('div', 'gpv-fsm-manager');
        manager.innerHTML = `
            <div class="gpv-fsm-manager-row">
                <label for="gpv-fsm-create-portfolio">New portfolio</label>
                <input id="gpv-fsm-create-portfolio" class="gpv-target-input" maxlength="${FSM_MAX_PORTFOLIO_NAME_LENGTH}" placeholder="Portfolio name" />
                <button class="gpv-sync-btn gpv-sync-btn-primary" id="gpv-fsm-create-portfolio-btn">Create</button>
            </div>
        `;
        const list = createElement('div', 'gpv-fsm-portfolio-list');
        activePortfolios.forEach(item => {
            const row = createElement('div', 'gpv-fsm-portfolio-list-row');

            if (editingPortfolioId === item.id) {
                const renameInput = createElement('input', 'gpv-target-input');
                renameInput.maxLength = FSM_MAX_PORTFOLIO_NAME_LENGTH;
                renameInput.value = item.name;
                renameInput.setAttribute('aria-label', `Rename portfolio ${item.name}`);
                row.appendChild(renameInput);
                const saveRenameBtn = createElement('button', 'gpv-sync-btn gpv-sync-btn-primary', 'Save');
                saveRenameBtn.onclick = () => {
                    const nextName = normalizePortfolioName(renameInput.value);
                    if (!nextName) {
                        return;
                    }
                    if (typeof onSaveRename === 'function') {
                        onSaveRename(item.id, nextName);
                    }
                };
                row.appendChild(saveRenameBtn);
                const cancelRenameBtn = createElement('button', 'gpv-sync-btn gpv-sync-btn-secondary', 'Cancel');
                cancelRenameBtn.onclick = () => {
                    if (typeof onCancelRename === 'function') {
                        onCancelRename();
                    }
                };
                row.appendChild(cancelRenameBtn);
            } else {
                row.innerHTML = `<span>${escapeHtml(item.name)}</span>`;
                const actions = createElement('div', 'gpv-fsm-portfolio-actions');
                const actionSelect = createElement('select', 'gpv-select');
                actionSelect.setAttribute('aria-label', `Actions for portfolio ${item.name}`);
                actionSelect.innerHTML = `
                    <option value="">Actions</option>
                    <option value="rename">Rename portfolio</option>
                    <option value="archive">Archive portfolio</option>
                `;
                actionSelect.onchange = () => {
                    const action = actionSelect.value;
                    actionSelect.value = '';
                    if (action === 'rename') {
                        if (typeof onStartRename === 'function') {
                            onStartRename(item.id);
                        }
                        return;
                    }
                    if (action === 'archive') {
                        if (typeof onArchive === 'function') {
                            onArchive(item.id);
                        }
                    }
                };
                actions.appendChild(actionSelect);
                row.appendChild(actions);
            }
            list.appendChild(row);
        });
        manager.appendChild(list);

        const createBtn = manager.querySelector('#gpv-fsm-create-portfolio-btn');
        const createInput = manager.querySelector('#gpv-fsm-create-portfolio');
        if (createBtn && createInput) {
            createBtn.onclick = () => {
                const name = normalizePortfolioName(createInput.value);
                if (!name) {
                    return;
                }
                if (typeof onCreate === 'function') {
                    onCreate(name);
                }
                createInput.value = '';
            };
        }

        return manager;
    }

    function buildFsmSummaryRow(summary, options = {}) {
        const showDrift = options.showDrift !== false;
        const showProfit = options.showProfit === true;
        const showFixed = options.showFixed !== false;
        const showTargetAssigned = options.showTargetAssigned !== false;
        const showUnassigned = options.showUnassigned !== false;
        const summaryRow = createElement('div', 'gpv-summary-row');
        const driftClassName = summary?.driftClass
            ? `gpv-summary-card ${summary.driftClass}`
            : 'gpv-summary-card';
        const profitClassName = summary?.profitClass === 'positive' || summary?.profitClass === 'negative'
            ? ` ${summary.profitClass}`
            : '';
        const profitCardHtml = showProfit
            ? `<div class="gpv-summary-card"><strong>Profit:</strong> <span class="gpv-summary-profit-value${escapeHtml(profitClassName)}">${escapeHtml(summary?.profitDisplay || '-')}</span></div>`
            : '';
        const fixedCardHtml = showFixed
            ? `<div class="gpv-summary-card"><strong>Fixed:</strong> ${escapeHtml(String(summary.fixedCount))}</div>`
            : '';
        const driftCardHtml = showDrift
            ? `<div class="${escapeHtml(driftClassName)}"><strong>Drift:</strong> ${escapeHtml(summary.driftDisplay)}</div>`
            : '';
        summaryRow.innerHTML = `
            <div class="gpv-summary-card"><strong>Total Value:</strong> ${escapeHtml(formatMoney(summary.total))}</div>
            ${showTargetAssigned ? `<div class="gpv-summary-card"><strong>Target Assigned:</strong> ${escapeHtml(summary.targetAssignedDisplay)}</div>` : ''}
            <div class="gpv-summary-card"><strong>Holdings:</strong> ${escapeHtml(String(summary.holdingsCount))}</div>
            ${showUnassigned ? `<div class="gpv-summary-card"><strong>Unassigned:</strong> ${escapeHtml(String(summary.unassignedCount))}</div>` : ''}
            ${profitCardHtml}
            ${fixedCardHtml}
            ${driftCardHtml}
        `;
        return summaryRow;
    }

    function buildFsmPortfolioOverviewModel(rows, activePortfolios) {
        const safeRows = Array.isArray(rows) ? rows : [];
        const safePortfolios = Array.isArray(activePortfolios) ? activePortfolios : [];
        const groupedRows = safeRows.reduce((acc, row) => {
            const portfolioId = utils.normalizeString(row?.portfolioId, FSM_UNASSIGNED_PORTFOLIO_ID);
            if (!acc[portfolioId]) {
                acc[portfolioId] = [];
            }
            acc[portfolioId].push(row);
            return acc;
        }, {});
        const buildCardModel = (id, label, cardRows, options = {}) => {
            const summary = buildFsmScopedSummary(cardRows);
            return {
                id,
                label,
                holdingsCount: summary.holdingsCount,
                totalDisplay: formatMoney(summary.total),
                targetAssignedDisplay: summary.targetAssignedDisplay,
                driftDisplay: summary.driftDisplay,
                driftClass: summary.driftClass,
                fixedCount: summary.fixedCount,
                profitDisplay: summary.profitDisplay,
                profitClass: summary.profitClass,
                isUnassigned: options.isUnassigned === true,
                health: summary.health
            };
        };
        const cards = safePortfolios.map(item => buildCardModel(item.id, item.name, groupedRows[item.id] || []));
        cards.push(buildCardModel(
            FSM_UNASSIGNED_PORTFOLIO_ID,
            'Unassigned',
            groupedRows[FSM_UNASSIGNED_PORTFOLIO_ID] || [],
            { isUnassigned: true }
        ));
        const allSummary = buildFsmScopedSummary(safeRows);
        return {
            cards,
            allSummary,
            attentionItems: buildNeedsAttentionItemsForFsmOverview({ cards })
        };
    }

    function buildFsmOverviewPanel({ overviewModel, onSelectScope, onOpenAll }) {
        const wrapper = createElement('div', 'gpv-fsm-overview');
        const header = createElement('div', 'gpv-fsm-overview-header');
        const copy = createElement(
            'p',
            'gpv-fsm-overview-copy',
            'Start from a portfolio overview, then open a portfolio or unassigned holdings to manage individual instruments.'
        );
        header.appendChild(copy);
        const allHoldingsBtn = createElement('button', 'gpv-sync-btn gpv-sync-btn-secondary', 'View all holdings');
        allHoldingsBtn.type = 'button';
        allHoldingsBtn.onclick = () => {
            if (typeof onOpenAll === 'function') {
                onOpenAll();
            }
        };
        header.appendChild(allHoldingsBtn);
        wrapper.appendChild(header);

        const attention = buildAttentionStrip(overviewModel?.attentionItems, item => {
            if (typeof onSelectScope === 'function') {
                onSelectScope(item.scopeId);
            }
        });
        if (attention) {
            wrapper.appendChild(attention);
        }

        const grid = createElement('div', 'gpv-fsm-overview-grid');
        const cards = Array.isArray(overviewModel?.cards) ? overviewModel.cards : [];
        cards.forEach(card => {
            const className = card.isUnassigned === true
                ? 'gpv-fsm-overview-card gpv-fsm-overview-card--unassigned'
                : 'gpv-fsm-overview-card';
            const buttonCard = createElement('div', className);
            buttonCard.dataset.scope = card.id;
            createKeyboardSelectableCard(buttonCard, {
                ariaLabel: `Open ${card.label} holdings`,
                onSelect: () => {
                    if (typeof onSelectScope === 'function') {
                        onSelectScope(card.id);
                    }
                }
            });
            buttonCard.innerHTML = `
                <div class="gpv-fsm-overview-card-header">
                    <div>
                        <h2 class="gpv-fsm-overview-card-title">${escapeHtml(card.label)}</h2>
                        <p class="gpv-fsm-overview-card-subtitle">${escapeHtml(`${card.holdingsCount} holding${card.holdingsCount === 1 ? '' : 's'}`)}</p>
                    </div>
                    <span class="gpv-health-badge ${escapeHtml(card.health?.className || 'gpv-health--healthy')}">${escapeHtml(card.health?.label || 'Healthy')}</span>
                </div>
                <div class="gpv-fsm-overview-stats">
                    <div class="gpv-fsm-overview-stat">
                        <span class="gpv-fsm-overview-stat-label">Total value</span>
                        <span class="gpv-fsm-overview-stat-value">${escapeHtml(card.totalDisplay)}</span>
                    </div>
                    <div class="gpv-fsm-overview-stat">
                        <span class="gpv-fsm-overview-stat-label">Target assigned</span>
                        <span class="gpv-fsm-overview-stat-value">${escapeHtml(card.targetAssignedDisplay)}</span>
                    </div>
                    <div class="gpv-fsm-overview-stat">
                        <span class="gpv-fsm-overview-stat-label">Drift</span>
                        <span class="gpv-fsm-overview-stat-value ${escapeHtml(card.driftClass || '')}">${escapeHtml(card.driftDisplay)}</span>
                    </div>
                    <div class="gpv-fsm-overview-stat">
                        <span class="gpv-fsm-overview-stat-label">Profit</span>
                        <span class="gpv-fsm-overview-stat-value ${escapeHtml(card.profitClass || '')}">${escapeHtml(card.profitDisplay || '-')}</span>
                    </div>
                </div>
            `;
            if (Array.isArray(card.health?.reasons) && card.health.reasons.length > 0) {
                const reasonList = createElement('ul', 'gpv-health-reasons');
                card.health.reasons.slice(0, 2).forEach(reason => {
                    reasonList.appendChild(createElement('li', 'gpv-health-reason', reason));
                });
                buttonCard.appendChild(reasonList);
            }
            grid.appendChild(buttonCard);
        });
        wrapper.appendChild(grid);
        return wrapper;
    }

    function buildFsmPlanningPanel(planning, scopeLabel, options = {}) {
        const panel = createElement('div', 'gpv-planning-panel');
        panel.appendChild(createElement('h3', 'gpv-planning-title', 'Planning'));
        appendPlanningDetails(panel, planning || {}, {
            scopeLabel,
            coverageText: planning?.targetCoverageLabel || null,
            showScenarioPrompt: options.showScenarioPrompt === true
        });
        return panel;
    }

    function buildFsmProjectionPanel({ selectedScopeLabel, projectedAmount, onInput }) {
        const panel = createElement('div', 'gpv-planning-panel');
        panel.appendChild(createElement('h3', 'gpv-planning-title', 'Projection'));
        const inputControl = createProjectedInvestmentInput({
            amount: projectedAmount,
            inputLabel: `Add Projected Investment for ${selectedScopeLabel} (simulation only):`,
            onInput
        });
        inputControl.input.setAttribute('aria-label', `Projected investment amount for ${selectedScopeLabel}`);
        panel.appendChild(inputControl.container);
        return panel;
    }

    function createFsmDetailToolbar({ onBack, onScopeChange, onFilterChange }) {
        const toolbar = createElement('div', 'gpv-fsm-toolbar gpv-fsm-filter-toolbar');
        const backBtn = createElement('button', 'gpv-sync-btn gpv-sync-btn-secondary', 'Back to portfolios');
        backBtn.type = 'button';
        backBtn.onclick = () => {
            if (typeof onBack === 'function') {
                onBack();
            }
        };
        toolbar.appendChild(backBtn);

        const scopeSelect = createElement('select', 'gpv-select');
        scopeSelect.setAttribute('aria-label', 'Select portfolio scope');
        scopeSelect.onchange = () => {
            if (typeof onScopeChange === 'function') {
                onScopeChange(scopeSelect.value);
            }
        };
        toolbar.appendChild(scopeSelect);

        const searchInput = createElement('input', 'gpv-target-input gpv-fsm-filter-input');
        searchInput.placeholder = 'Filter holdings';
        searchInput.setAttribute('aria-label', 'Filter holdings by ticker, name, or product type');
        searchInput.oninput = () => {
            if (typeof onFilterChange === 'function') {
                onFilterChange(searchInput.value);
            }
        };
        toolbar.appendChild(searchInput);

        let lastOptionsMarkup = '';
        const setState = ({ scopeOptions, selectedScope, filterTerm }) => {
            const nextOptionsMarkup = (Array.isArray(scopeOptions) ? scopeOptions : []).map(option => `
                <option value="${escapeHtml(option.id)}">${escapeHtml(option.label)}</option>
            `).join('');
            if (nextOptionsMarkup !== lastOptionsMarkup) {
                scopeSelect.innerHTML = nextOptionsMarkup;
                lastOptionsMarkup = nextOptionsMarkup;
            }
            scopeSelect.value = selectedScope;
            if (searchInput.value !== filterTerm) {
                searchInput.value = filterTerm;
            }
        };
        return {
            element: toolbar,
            setState,
            searchInput,
            scopeSelect
        };
    }

    function buildFsmBulkRow({
        selectAllFiltered,
        selectedCount,
        activePortfolios,
        bulkPortfolioId,
        filteredCount,
        onSelectAllChange,
        onBulkPortfolioChange,
        onApplyBulk
    }) {
        const bulkRow = createElement('div', 'gpv-fsm-toolbar');
        const selectAllLabel = createElement('label', null, 'Select all');
        const selectAll = createElement('input');
        selectAll.type = 'checkbox';
        selectAll.checked = selectAllFiltered;
        selectAll.setAttribute('aria-label', 'Select all filtered holdings');
        selectAll.onchange = () => {
            if (typeof onSelectAllChange === 'function') {
                onSelectAllChange(selectAll.checked);
            }
        };
        selectAllLabel.prepend(selectAll);
        bulkRow.appendChild(selectAllLabel);

        const selectedSummary = createElement('span', 'gpv-summary-card', `Selected: ${selectedCount} / ${filteredCount}`);
        bulkRow.appendChild(selectedSummary);

        const bulkSelect = createElement('select', 'gpv-select');
        bulkSelect.innerHTML = [
            { id: FSM_UNASSIGNED_PORTFOLIO_ID, label: 'Unassigned' },
            ...activePortfolios.map(item => ({ id: item.id, label: item.name }))
        ].map(option => `
            <option value="${escapeHtml(option.id)}">${escapeHtml(option.label)}</option>
        `).join('');
        bulkSelect.value = bulkPortfolioId;
        bulkSelect.onchange = () => {
            if (typeof onBulkPortfolioChange === 'function') {
                onBulkPortfolioChange(bulkSelect.value);
            }
        };
        bulkRow.appendChild(bulkSelect);

        const selectedLabel = selectedCount === 1 ? 'holding' : 'holdings';
        const applyBulkBtn = createElement('button', 'gpv-sync-btn gpv-sync-btn-primary gpv-fsm-bulk-apply-btn', `Apply to ${selectedCount} selected ${selectedLabel}`);
        applyBulkBtn.setAttribute('aria-label', `Apply portfolio assignment to ${selectedCount} selected ${selectedLabel}`);
        applyBulkBtn.disabled = selectedCount === 0;
        applyBulkBtn.onclick = () => {
            if (typeof onApplyBulk === 'function') {
                onApplyBulk();
            }
        };
        bulkRow.appendChild(applyBulkBtn);
        return bulkRow;
    }

    function buildFsmHoldingsTable({
        filteredRows,
        selectedHoldingIds,
        selectAllFiltered,
        activePortfolios,
        targetErrorsByHoldingId,
        showDrift,
        onSelectAllChange,
        onRowSelectChange,
        onTargetChange,
        onFixedChange,
        onPortfolioChange
    }) {
        if (!Array.isArray(filteredRows) || filteredRows.length === 0) {
            return createElement('div', 'gpv-conflict-diff-empty', 'No holdings match this filter.');
        }
        const table = createElement('table', 'gpv-table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th><input type="checkbox" aria-label="Select all holdings" ${selectAllFiltered ? 'checked' : ''} /></th>
                    <th>Ticker</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Value (SGD)</th>
                    <th>Profit</th>
                    <th>Current %</th>
                    <th>Target %</th>
                    ${showDrift ? '<th>Drift %</th>' : ''}
                    <th>Fixed</th>
                    <th>Portfolio</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const headerCheckbox = table.querySelector('thead input[type="checkbox"]');
        if (headerCheckbox) {
            headerCheckbox.addEventListener('change', () => {
                if (typeof onSelectAllChange === 'function') {
                    onSelectAllChange(headerCheckbox.checked);
                }
            });
        }

        const tbody = table.querySelector('tbody');
        filteredRows.forEach(row => {
            const tr = document.createElement('tr');
            const holdingId = row.holdingId || row.code;
            const checked = selectedHoldingIds.has(holdingId);
            tr.innerHTML = `
                <td data-col="select"><input type="checkbox" ${checked ? 'checked' : ''} aria-label="Select holding ${escapeHtml(row.displayTicker || row.code)}" /></td>
                <td data-col="ticker">${escapeHtml(row.displayTicker || '-')}</td>
                <td data-col="name">${escapeHtml(row.name)}</td>
                <td data-col="product-type">${escapeHtml(row.productType)}</td>
                <td data-col="value">${escapeHtml(formatMoney(row.currentValueLcy))}</td>
                <td data-col="profit" class="${escapeHtml(row.profitClass || '')}">${escapeHtml(row.profitDisplay || '-')}</td>
                <td data-col="current">${escapeHtml(row.currentAllocationDisplay || '-')}</td>
                <td data-col="target"></td>
                ${showDrift ? `<td data-col="drift" class="${escapeHtml(row.driftClass || '')}">${escapeHtml(row.driftDisplay || '-')}</td>` : ''}
                <td data-col="fixed"></td>
                <td data-col="portfolio"></td>
            `;
            const checkbox = tr.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', () => {
                if (typeof onRowSelectChange === 'function') {
                    onRowSelectChange(holdingId, checkbox.checked);
                }
            });

            const targetCell = tr.querySelector('td[data-col="target"]');
            if (!targetCell) {
                tbody.appendChild(tr);
                return;
            }
            const targetInput = createElement('input', 'gpv-target-input');
            targetInput.type = 'number';
            targetInput.min = '0';
            targetInput.max = '100';
            targetInput.step = '0.01';
            targetInput.placeholder = '0.00';
            targetInput.setAttribute('aria-label', `Target percentage for ${row.displayTicker || row.code}`);
            targetInput.value = Number.isFinite(row.targetPercent) ? Number(row.targetPercent).toFixed(2) : '';
            targetInput.disabled = row.fixed === true;
            if (row.fixed === true) {
                targetInput.title = 'Fixed holdings do not use target %';
            }
            targetInput.onchange = () => {
                if (typeof onTargetChange === 'function') {
                    onTargetChange(row, targetInput.value.trim());
                }
            };
            targetCell.appendChild(targetInput);
            if (targetErrorsByHoldingId[holdingId]) {
                const err = createElement('div', 'gpv-conflict-diff-empty', targetErrorsByHoldingId[holdingId]);
                targetCell.appendChild(err);
            }

            const fixedCell = tr.querySelector('td[data-col="fixed"]');
            if (!fixedCell) {
                tbody.appendChild(tr);
                return;
            }
            const fixedCheckbox = createElement('input');
            fixedCheckbox.type = 'checkbox';
            fixedCheckbox.checked = row.fixed === true;
            fixedCheckbox.setAttribute('aria-label', `Fixed allocation for ${row.displayTicker || row.code}`);
            fixedCheckbox.onchange = () => {
                if (typeof onFixedChange === 'function') {
                    onFixedChange(holdingId, fixedCheckbox.checked === true);
                }
            };
            fixedCell.appendChild(fixedCheckbox);

            const selectCell = tr.querySelector('td[data-col="portfolio"]');
            if (!selectCell) {
                tbody.appendChild(tr);
                return;
            }
            const select = createElement('select', 'gpv-select gpv-fsm-table-portfolio-select');
            select.innerHTML = [
                { id: FSM_UNASSIGNED_PORTFOLIO_ID, label: 'Unassigned' },
                ...activePortfolios.map(item => ({ id: item.id, label: item.name }))
            ].map(option => `
                <option value="${escapeHtml(option.id)}">${escapeHtml(option.label)}</option>
            `).join('');
            applySelectContentWidth(select, { minCh: 12, maxCh: 26, paddingCh: 4 });
            select.value = row.portfolioId;
            select.onchange = () => {
                if (typeof onPortfolioChange === 'function') {
                    onPortfolioChange(holdingId, select.value);
                }
            };
            selectCell.appendChild(select);
            tbody.appendChild(tr);
        });
        const tableWrapper = createElement('div', 'gpv-fsm-table-wrap');
        tableWrapper.appendChild(table);
        return tableWrapper;
    }

    function renderFsmOverlay(fsmHoldings) {
        const overlay = createElement('div', 'gpv-overlay');
        overlay.id = 'gpv-overlay';

        const container = createElement('div', 'gpv-container gpv-container--expanded');
        const cleanupCallbacks = [];
        container.gpvCleanupCallbacks = cleanupCallbacks;
        overlay.gpvCleanupCallbacks = cleanupCallbacks;

        const { header, closeBtn, titleId, closeOverlay } = buildFsmHeader({ overlay, cleanupCallbacks, titleText: 'Portfolio Viewer (FSM)' });
        container.appendChild(header);

        const contentDiv = createElement('div', 'gpv-content');
        container.appendChild(contentDiv);
        overlay.appendChild(container);

        const config = loadFsmPortfolioConfig(fsmHoldings);
        let portfolios = config.portfolios;
        let assignmentByCode = { ...config.assignmentByCode };
        let selectedScope = FSM_ALL_PORTFOLIO_ID;
        let filterTerm = '';
        let bulkPortfolioId = FSM_UNASSIGNED_PORTFOLIO_ID;
        let selectedHoldingIds = new Set();
        let isPortfolioManagerExpanded = false;
        let editingPortfolioId = null;
        let viewMode = 'overview';
        let nextFocusTarget = null;
        const targetErrorsByHoldingId = {};
        const fsmCodeCounts = buildFsmCodeCounts(fsmHoldings);

        const activePortfolios = () => portfolios.filter(item => item.archived !== true);

        function clearLegacyFsmAllocationKeys(row, holdingId, options = {}) {
            const code = utils.normalizeString(row?.code, '');
            if (!isFsmLegacyCodeFallbackAllowed(code, holdingId, fsmCodeCounts)) {
                return;
            }
            if (options.target === true) {
                Storage.remove(storageKeys.fsmTarget(code));
            }
            if (options.fixed === true) {
                Storage.remove(storageKeys.fsmFixed(code));
            }
            updateFsmStore(current => {
                const targetsByCode = { ...current.targetsByCode };
                const fixedByCode = { ...current.fixedByCode };
                if (options.target === true) {
                    delete targetsByCode[code];
                }
                if (options.fixed === true) {
                    delete fixedByCode[code];
                }
                return { ...current, targetsByCode, fixedByCode };
            });
        }

        const managerSection = createElement('div', 'gpv-fsm-section');
        const summarySection = createElement('div', 'gpv-fsm-section');
        const toolbarSection = createElement('div', 'gpv-fsm-section');
        const bodySection = createElement('div', 'gpv-fsm-section');
        contentDiv.appendChild(managerSection);
        contentDiv.appendChild(summarySection);
        contentDiv.appendChild(toolbarSection);
        contentDiv.appendChild(bodySection);

        const detailToolbar = createFsmDetailToolbar({
            onBack: () => {
                viewMode = 'overview';
                filterTerm = '';
                selectedScope = FSM_ALL_PORTFOLIO_ID;
                selectedHoldingIds = new Set();
                nextFocusTarget = 'overview';
                rerender();
            },
            onScopeChange: value => {
                selectedScope = value;
                selectedHoldingIds = new Set();
                rerender();
            },
            onFilterChange: value => {
                filterTerm = value;
                rerender();
            }
        });
        toolbarSection.appendChild(detailToolbar.element);
        const detailToolbarControls = [detailToolbar.searchInput, detailToolbar.scopeSelect];

        const focusAfterRender = () => {
            if (nextFocusTarget === 'overview') {
                const firstOverviewCard = bodySection.querySelector('.gpv-fsm-overview-card');
                if (firstOverviewCard && typeof firstOverviewCard.focus === 'function') {
                    firstOverviewCard.focus();
                }
            } else if (nextFocusTarget === 'detail') {
                if (detailToolbar.searchInput && typeof detailToolbar.searchInput.focus === 'function') {
                    detailToolbar.searchInput.focus();
                }
            } else if (nextFocusTarget === 'projection') {
                const projectionInput = summarySection.querySelector('.gpv-projected-input');
                if (projectionInput && typeof projectionInput.focus === 'function') {
                    projectionInput.focus();
                    const inputLength = String(projectionInput.value || '').length;
                    if (typeof projectionInput.setSelectionRange === 'function' && projectionInput.type !== 'number') {
                        try {
                            projectionInput.setSelectionRange(inputLength, inputLength);
                        } catch (_error) {
                            // Selection APIs are unsupported for number inputs in some environments.
                        }
                    }
                }
            }
            nextFocusTarget = null;
        };

        const buildViewState = () => {
            const rows = buildFsmRowsWithAssignment(fsmHoldings, assignmentByCode);
            const activePortfolioIds = activePortfolios().map(item => item.id);
            const activePortfolioSet = new Set(activePortfolioIds);
            const validHoldingIds = new Set();

            rows.forEach(row => {
                const holdingId = row.holdingId || row.code;
                if (!holdingId) {
                    return;
                }
                validHoldingIds.add(holdingId);
                if (!activePortfolioSet.has(row.portfolioId)) {
                    assignmentByCode[holdingId] = FSM_UNASSIGNED_PORTFOLIO_ID;
                    row.portfolioId = FSM_UNASSIGNED_PORTFOLIO_ID;
                }
            });

            selectedHoldingIds = new Set(Array.from(selectedHoldingIds).filter(holdingId => validHoldingIds.has(holdingId)));

            const unassignedCount = rows.filter(row => row.portfolioId === FSM_UNASSIGNED_PORTFOLIO_ID).length;
            const scopeOptions = [
                { id: FSM_ALL_PORTFOLIO_ID, label: 'All' },
                ...activePortfolios().map(item => ({ id: item.id, label: item.name })),
                { id: FSM_UNASSIGNED_PORTFOLIO_ID, label: `Unassigned (${unassignedCount})` }
            ];
            if (!scopeOptions.find(option => option.id === selectedScope)) {
                selectedScope = FSM_ALL_PORTFOLIO_ID;
            }

            const normalizedFilter = filterTerm.trim().toLowerCase();
            const scopedRows = rows.filter(row => {
                const portfolioMatch = selectedScope === FSM_ALL_PORTFOLIO_ID
                    ? true
                    : (selectedScope === FSM_UNASSIGNED_PORTFOLIO_ID
                        ? row.portfolioId === FSM_UNASSIGNED_PORTFOLIO_ID
                        : row.portfolioId === selectedScope);
                if (!portfolioMatch) {
                    return false;
                }
                return true;
            });

            const filteredRows = scopedRows.filter(row => {
                if (!normalizedFilter) {
                    return true;
                }
                return row.displayTicker.toLowerCase().includes(normalizedFilter)
                    || row.name.toLowerCase().includes(normalizedFilter)
                    || row.productType.toLowerCase().includes(normalizedFilter);
            });

            const filteredHoldingIdSet = new Set(filteredRows.map(row => row.holdingId || row.code).filter(Boolean));
            const selectedCount = Array.from(selectedHoldingIds).filter(holdingId => filteredHoldingIdSet.has(holdingId)).length;
            const selectAllFiltered = filteredRows.length > 0 && filteredRows.every(row => {
                const holdingId = row.holdingId || row.code;
                return holdingId && selectedHoldingIds.has(holdingId);
            });
            const showDrift = selectedScope !== FSM_ALL_PORTFOLIO_ID;
            const summary = buildFsmScopedSummary(scopedRows);
            const selectedScopeOption = scopeOptions.find(option => option.id === selectedScope);
            const projectedEnabled = isFsmProjectedScope(selectedScope, activePortfolioIds);
            const projectedAmount = projectedEnabled
                ? getProjectedInvestmentValue(state.projectedInvestments, FSM_PROJECTION_BUCKET, selectedScope)
                : 0;
            const adjustedTotal = summary.total + projectedAmount;
            const displayRows = buildFsmDisplayRows(filteredRows, adjustedTotal);
            const scopedDisplayRows = buildFsmDisplayRows(scopedRows, adjustedTotal);
            const planning = buildFsmPlanningModel(scopedDisplayRows, summary, {
                projectedAmount
            });
            return {
                rows,
                activePortfolioIds,
                unassignedCount,
                scopeOptions,
                filteredRows,
                filteredHoldingIdSet,
                selectedCount,
                selectAllFiltered,
                showDrift,
                summary,
                displayRows,
                projectedEnabled,
                projectedAmount,
                planning,
                selectedScopeLabel: selectedScopeOption?.label || 'All',
                overviewModel: buildFsmPortfolioOverviewModel(rows, activePortfolios())
            };
        };

        const rerender = () => {
            const viewState = buildViewState();

            managerSection.innerHTML = '';

            const managerSummary = buildFsmManagerSummary({
                activePortfolioCount: viewState.activePortfolioIds.length,
                unassignedCount: viewState.unassignedCount,
                isExpanded: isPortfolioManagerExpanded,
                onToggle: () => {
                    isPortfolioManagerExpanded = !isPortfolioManagerExpanded;
                    rerender();
                }
            });
            managerSection.appendChild(managerSummary);

            if (isPortfolioManagerExpanded) {
                const manager = buildFsmManagerPanel({
                    activePortfolios: activePortfolios(),
                    editingPortfolioId,
                    onCreate: name => {
                        const id = buildPortfolioId(name, portfolios.map(item => item.id));
                        portfolios = [...portfolios, { id, name, archived: false }];
                        bulkPortfolioId = id;
                        saveFsmPortfolioConfig(portfolios, assignmentByCode);
                        rerender();
                    },
                    onStartRename: id => {
                        editingPortfolioId = id;
                        rerender();
                    },
                    onSaveRename: (id, nextName) => {
                        portfolios = portfolios.map(portfolio => portfolio.id === id
                            ? { ...portfolio, name: nextName }
                            : portfolio);
                        editingPortfolioId = null;
                        saveFsmPortfolioConfig(portfolios, assignmentByCode);
                        rerender();
                    },
                    onCancelRename: () => {
                        editingPortfolioId = null;
                        rerender();
                    },
                    onArchive: id => {
                        portfolios = portfolios.map(portfolio => portfolio.id === id
                            ? { ...portfolio, archived: true }
                            : portfolio);
                        Object.keys(assignmentByCode).forEach(code => {
                            if (assignmentByCode[code] === id) {
                                assignmentByCode[code] = FSM_UNASSIGNED_PORTFOLIO_ID;
                            }
                        });
                        saveFsmPortfolioConfig(portfolios, assignmentByCode);
                        if (selectedScope === id) {
                            selectedScope = FSM_UNASSIGNED_PORTFOLIO_ID;
                        }
                        rerender();
                    }
                });
                managerSection.appendChild(manager);
            }

            summarySection.innerHTML = '';
            bodySection.innerHTML = '';

            if (viewMode === 'overview') {
                toolbarSection.hidden = true;
                setElementsDisabled(detailToolbarControls, true);
                summarySection.appendChild(buildFsmSummaryRow(viewState.overviewModel.allSummary, {
                    showDrift: false,
                    showProfit: true,
                    showFixed: false
                }));
                bodySection.appendChild(buildFsmOverviewPanel({
                    overviewModel: viewState.overviewModel,
                    onSelectScope: scopeId => {
                        selectedScope = scopeId;
                        filterTerm = '';
                        selectedHoldingIds = new Set();
                        viewMode = 'detail';
                        nextFocusTarget = 'detail';
                        rerender();
                    },
                    onOpenAll: () => {
                        selectedScope = FSM_ALL_PORTFOLIO_ID;
                        filterTerm = '';
                        selectedHoldingIds = new Set();
                        viewMode = 'detail';
                        nextFocusTarget = 'detail';
                        rerender();
                    }
                }));
                focusAfterRender();
                return;
            }

            toolbarSection.hidden = false;
            setElementsDisabled(detailToolbarControls, false);
            summarySection.appendChild(buildFsmSummaryRow(viewState.summary, {
                showDrift: viewState.showDrift,
                showProfit: true
            }));
            if (viewState.projectedEnabled) {
                summarySection.appendChild(buildFsmProjectionPanel({
                    selectedScopeLabel: viewState.selectedScopeLabel,
                    projectedAmount: viewState.projectedAmount,
                    onInput: input => {
                        const value = input.value;
                        if (value === '') {
                            clearProjectedInvestment(state.projectedInvestments, FSM_PROJECTION_BUCKET, selectedScope);
                            nextFocusTarget = 'projection';
                            rerender();
                            return;
                        }
                        const amount = parseFloat(value);
                        if (!Number.isFinite(amount) || amount < 0) {
                            flashInputBorder(input, 'error');
                            return;
                        }
                        if (amount === 0) {
                            clearProjectedInvestment(state.projectedInvestments, FSM_PROJECTION_BUCKET, selectedScope);
                            nextFocusTarget = 'projection';
                            rerender();
                            return;
                        }
                        setProjectedInvestment(state.projectedInvestments, FSM_PROJECTION_BUCKET, selectedScope, amount);
                        flashInputBorder(input, 'success');
                        nextFocusTarget = 'projection';
                        rerender();
                    }
                }));
            }
            detailToolbar.setState({
                scopeOptions: viewState.scopeOptions,
                selectedScope,
                filterTerm
            });

            summarySection.appendChild(buildFsmPlanningPanel(viewState.planning, viewState.selectedScopeLabel, {
                showScenarioPrompt: viewState.projectedEnabled
            }));

            bodySection.appendChild(buildFsmBulkRow({
                selectAllFiltered: viewState.selectAllFiltered,
                selectedCount: viewState.selectedCount,
                activePortfolios: activePortfolios(),
                bulkPortfolioId,
                filteredCount: viewState.filteredRows.length,
                onSelectAllChange: value => {
                    viewState.filteredRows.forEach(row => {
                        const holdingId = row.holdingId || row.code;
                        if (!holdingId) {
                            return;
                        }
                        if (value) {
                            selectedHoldingIds.add(holdingId);
                            return;
                        }
                        selectedHoldingIds.delete(holdingId);
                    });
                    rerender();
                },
                onBulkPortfolioChange: value => {
                    bulkPortfolioId = value;
                },
                onApplyBulk: () => {
                    const targetHoldingIds = Array.from(selectedHoldingIds).filter(holdingId => viewState.filteredHoldingIdSet.has(holdingId));
                    targetHoldingIds.forEach(holdingId => {
                        assignmentByCode[holdingId] = bulkPortfolioId;
                    });
                    saveFsmPortfolioConfig(portfolios, assignmentByCode);
                    rerender();
                }
            }));

            const table = buildFsmHoldingsTable({
                filteredRows: viewState.displayRows,
                selectedHoldingIds,
                selectAllFiltered: viewState.selectAllFiltered,
                activePortfolios: activePortfolios(),
                targetErrorsByHoldingId,
                showDrift: viewState.showDrift,
                onSelectAllChange: value => {
                    viewState.filteredRows.forEach(row => {
                        const holdingId = row.holdingId || row.code;
                        if (!holdingId) {
                            return;
                        }
                        if (value) {
                            selectedHoldingIds.add(holdingId);
                            return;
                        }
                        selectedHoldingIds.delete(holdingId);
                    });
                    rerender();
                },
                onRowSelectChange: (holdingId, checked) => {
                    if (checked) {
                        selectedHoldingIds.add(holdingId);
                    } else {
                        selectedHoldingIds.delete(holdingId);
                    }
                    rerender();
                },
                onTargetChange: (row, rawValue) => {
                    const holdingId = row.holdingId || row.code;
                    if (!rawValue) {
                        delete targetErrorsByHoldingId[holdingId];
                        updateFsmStore(current => {
                            const targetsByCode = { ...current.targetsByCode };
                            delete targetsByCode[holdingId];
                            return { ...current, targetsByCode };
                        });
                        clearLegacyFsmAllocationKeys(row, holdingId, { target: true });
                        if (typeof SyncManager?.scheduleSyncOnChange === 'function') {
                            SyncManager.scheduleSyncOnChange('fsm-target-clear');
                        }
                        rerender();
                        return;
                    }
                    const parsed = Number(rawValue);
                    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
                        targetErrorsByHoldingId[holdingId] = 'Enter target between 0 and 100';
                        rerender();
                        return;
                    }
                    delete targetErrorsByHoldingId[holdingId];
                    updateFsmStore(current => ({
                        ...current,
                        targetsByCode: { ...current.targetsByCode, [holdingId]: Number(parsed.toFixed(2)) }
                    }));
                    clearLegacyFsmAllocationKeys(row, holdingId, { target: true });
                    if (typeof SyncManager?.scheduleSyncOnChange === 'function') {
                        SyncManager.scheduleSyncOnChange('fsm-target-update');
                    }
                    rerender();
                },
                onFixedChange: (holdingId, isFixed) => {
                    updateFsmStore(current => {
                        const targetsByCode = { ...current.targetsByCode };
                        if (isFixed) {
                            delete targetsByCode[holdingId];
                        }
                        return {
                            ...current,
                            targetsByCode,
                            fixedByCode: { ...current.fixedByCode, [holdingId]: isFixed }
                        };
                    });
                    const row = viewState.rows.find(item => (item.holdingId || item.code) === holdingId);
                    clearLegacyFsmAllocationKeys(row, holdingId, { target: isFixed, fixed: true });
                    if (typeof SyncManager?.scheduleSyncOnChange === 'function') {
                        SyncManager.scheduleSyncOnChange('fsm-fixed-update');
                    }
                    if (isFixed) {
                        delete targetErrorsByHoldingId[holdingId];
                    }
                    rerender();
                },
                onPortfolioChange: (holdingId, value) => {
                    assignmentByCode[holdingId] = value;
                    saveFsmPortfolioConfig(portfolios, assignmentByCode);
                    rerender();
                }
            });
            bodySection.appendChild(table);
            focusAfterRender();
        };

        const unsubscribeOverlayUpdates = subscribeDataUpdates(() => {
            if (!overlay.isConnected) {
                return;
            }
            const nextReadiness = getFsmReadinessState();
            if (!nextReadiness.ready) {
                return;
            }
            fsmHoldings = nextReadiness.fsmHoldings;
            rerender();
        });
        cleanupCallbacks.push(unsubscribeOverlayUpdates);

        rerender();

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

    function buildOcbcSimpleTable(rows, total) {
        const displayRows = buildFsmDisplayRows(rows, total);
        if (displayRows.length === 0) {
            return createElement('div', 'gpv-conflict-diff-empty', 'No holdings available in this view.');
        }
        const table = createElement('table', 'gpv-table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Identifier</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Value (SGD)</th>
                    <th>Profit</th>
                    <th>Current %</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        const tbody = table.querySelector('tbody');
        displayRows.forEach(row => {
            const tr = createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(row.displayTicker || row.code || '-')}</td>
                <td>${escapeHtml(row.name || '-')}</td>
                <td>${escapeHtml(row.productType || '-')}</td>
                <td>${escapeHtml(formatMoney(row.currentValueLcy))}</td>
                <td class="${escapeHtml(row.profitClass || '')}">${escapeHtml(row.profitDisplay || '-')}</td>
                <td>${escapeHtml(row.currentAllocationDisplay || '-')}</td>
            `;
            tbody.appendChild(tr);
        });
        return table;
    }

    function buildOcbcRowsByPortfolioAndProductType(rows) {
        return (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
            const portfolioNo = utils.normalizeString(row?.portfolioNo, '-');
            const productType = utils.normalizeString(row?.productType, '-');
            if (!acc[portfolioNo]) {
                acc[portfolioNo] = {};
            }
            if (!acc[portfolioNo][productType]) {
                acc[portfolioNo][productType] = [];
            }
            acc[portfolioNo][productType].push(row);
            return acc;
        }, {});
    }

    function buildOcbcSummary(rows) {
        const safeRows = Array.isArray(rows) ? rows : [];
        const summary = buildFsmScopedSummary(safeRows.map(row => ({
            ...row,
            portfolioId: FSM_UNASSIGNED_PORTFOLIO_ID,
            targetPercent: null,
            fixed: false
        })));
        const knownProfitRows = safeRows.filter(row => Number.isFinite(toOptionalFiniteNumber(row?.profitValueLcy)));
        const missingProfitCount = Math.max(0, safeRows.length - knownProfitRows.length);
        if (knownProfitRows.length === 0) {
            return summary;
        }
        const profitValue = knownProfitRows.reduce((sum, row) => sum + toFiniteNumber(row.profitValueLcy, 0), 0);
        const total = toFiniteNumber(summary.total, 0);
        const profitPercent = calculateProfitPercentFromValue(total, profitValue);
        const partialSuffix = missingProfitCount > 0 ? ` · partial (${missingProfitCount} missing)` : '';
        return {
            ...summary,
            profitValue,
            profitPercent,
            profitDisplay: `${formatFsmProfitDisplay(profitValue, profitPercent)}${partialSuffix}`,
            profitClass: getFsmProfitClass(profitPercent)
        };
    }

    function buildOcbcPortfolioHeader(portfolioNo, summary) {
        const detailHeader = createElement('div', 'gpv-detail-header gpv-ocbc-portfolio-header');
        const detailTitle = createElement('h2', 'gpv-detail-title', `Portfolio ${portfolioNo}`);
        const detailStats = createElement('div', 'gpv-stats gpv-detail-stats gpv-ocbc-detail-stats');
        const profitClass = summary?.profitClass === 'positive' || summary?.profitClass === 'negative'
            ? summary.profitClass
            : null;

        detailStats.appendChild(createStatItem('Total Value', formatMoney(summary?.total || 0)));
        detailStats.appendChild(createStatItem('Holdings', String(summary?.holdingsCount || 0)));
        detailStats.appendChild(createStatItem('Profit', summary?.profitDisplay || '-', profitClass));

        detailHeader.appendChild(detailTitle);
        detailHeader.appendChild(detailStats);
        return detailHeader;
    }

    function buildOcbcProductTypeHeader(productType, summary) {
        const typeHeader = createElement('div', 'gpv-type-header');
        const typeTitle = createElement('h3', null, productType);
        const typeSummary = createElement('div', 'gpv-type-summary');

        appendLabeledValue(typeSummary, null, 'Value:', formatMoney(summary?.total || 0));
        appendLabeledValue(typeSummary, null, 'Holdings:', String(summary?.holdingsCount || 0));
        appendLabeledValue(
            typeSummary,
            null,
            'Profit:',
            summary?.profitDisplay || '-',
            { valueClass: summary?.profitClass === 'positive' || summary?.profitClass === 'negative' ? summary.profitClass : null }
        );

        typeHeader.appendChild(typeTitle);
        typeHeader.appendChild(typeSummary);
        return typeHeader;
    }

    function encodeOcbcTargetScopeSegment(value, fallback) {
        return encodeURIComponent(utils.normalizeString(value, fallback)).replace(/\|/g, '%7C');
    }

    function buildOcbcTargetScope(viewKey, portfolioNo, subPortfolioId, instrumentCode) {
        const safeView = encodeOcbcTargetScopeSegment(viewKey, 'assets');
        const safePortfolioNo = encodeOcbcTargetScopeSegment(portfolioNo, '-');
        const safeSubPortfolioId = encodeOcbcTargetScopeSegment(subPortfolioId, '');
        const safeInstrumentCode = encodeOcbcTargetScopeSegment(instrumentCode, '');
        return `${safeView}${PROJECTED_KEY_SEPARATOR}${safePortfolioNo}${PROJECTED_KEY_SEPARATOR}${safeSubPortfolioId}${PROJECTED_KEY_SEPARATOR}${safeInstrumentCode}`;
    }

    function buildLegacyOcbcTargetScope(viewKey, productType, bucketId) {
        const safeView = encodeOcbcTargetScopeSegment(viewKey, 'assets');
        const safeProductType = encodeOcbcTargetScopeSegment(productType, '');
        const safeBucketId = encodeOcbcTargetScopeSegment(bucketId, '');
        return `${safeView}${PROJECTED_KEY_SEPARATOR}${safeProductType}${PROJECTED_KEY_SEPARATOR}${safeBucketId}`;
    }

    function getOcbcAllocationTargetPercent(viewKey, portfolioNo, subPortfolioId, bucketId, legacyProductType, legacyBucketId) {
        const ocbcStore = readOcbcStore();
        const scope = buildOcbcTargetScope(viewKey, portfolioNo, subPortfolioId, bucketId);
        if (Object.prototype.hasOwnProperty.call(ocbcStore.targetsByScope, scope)) {
            return toOptionalFiniteNumber(ocbcStore.targetsByScope[scope]);
        }
        const key = storageKeys.ocbcTarget(scope);
        if (Storage.has(key)) {
            return toOptionalFiniteNumber(Storage.get(key, null));
        }
        const normalizedLegacyBucketId = utils.normalizeString(legacyBucketId, '');
        const normalizedBucketId = utils.normalizeString(bucketId, '');
        const normalizedLegacyProductType = utils.normalizeString(legacyProductType, '');
        if (!normalizedBucketId && normalizedLegacyProductType) {
            const legacyScopeBucketId = normalizedLegacyBucketId || utils.normalizeString(subPortfolioId, '');
            const legacyScope = buildLegacyOcbcTargetScope(viewKey, normalizedLegacyProductType, legacyScopeBucketId);
            if (Object.prototype.hasOwnProperty.call(ocbcStore.targetsByScope, legacyScope)) {
                return toOptionalFiniteNumber(ocbcStore.targetsByScope[legacyScope]);
            }
            const legacyKey = storageKeys.ocbcTarget(legacyScope);
            if (Storage.has(legacyKey)) {
                return toOptionalFiniteNumber(Storage.get(legacyKey, null));
            }
        }
        return null;
    }

    function normalizeOcbcOrderByScopeForUi(data) {
        const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        const normalized = {};
        Object.entries(source).forEach(([scope, value]) => {
            const normalizedScope = utils.normalizeString(scope, '');
            if (!normalizedScope || !Array.isArray(value)) {
                return;
            }
            const deduped = [];
            const seen = new Set();
            value.forEach(code => {
                const normalizedCode = utils.normalizeString(code, '');
                if (!normalizedCode || seen.has(normalizedCode)) {
                    return;
                }
                seen.add(normalizedCode);
                deduped.push(normalizedCode);
            });
            if (deduped.length) {
                normalized[normalizedScope] = deduped;
            }
        });
        return normalized;
    }

    function buildOcbcOrderScopeCompatibilityKeys(activeView, portfolioNo, subPortfolioId) {
        const normalizedView = utils.normalizeString(activeView, 'assets');
        const normalizedPortfolioNo = utils.normalizeString(portfolioNo, '-');
        const normalizedSubPortfolioId = utils.normalizeString(subPortfolioId, '');

        const viewVariants = new Set([
            normalizedView,
            encodeOcbcTargetScopeSegment(normalizedView, 'assets')
        ]);
        const portfolioVariants = new Set([
            normalizedPortfolioNo,
            encodeOcbcTargetScopeSegment(normalizedPortfolioNo, '-')
        ]);
        const subPortfolioVariants = new Set();
        if (normalizedSubPortfolioId) {
            subPortfolioVariants.add(normalizedSubPortfolioId);
            subPortfolioVariants.add(encodeOcbcTargetScopeSegment(normalizedSubPortfolioId, ''));
        } else {
            subPortfolioVariants.add('');
            subPortfolioVariants.add('-');
        }

        const keys = new Set();
        viewVariants.forEach(viewVariant => {
            portfolioVariants.forEach(portfolioVariant => {
                subPortfolioVariants.forEach(subPortfolioVariant => {
                    keys.add(`${viewVariant}${PROJECTED_KEY_SEPARATOR}${portfolioVariant}${PROJECTED_KEY_SEPARATOR}${subPortfolioVariant}`);
                });
            });
        });
        return Array.from(keys);
    }

    function loadOcbcAllocationConfig() {
        const bucketsByView = Storage.readJson(
            STORAGE_KEYS.ocbcAllocationBuckets,
            data => data && typeof data === 'object' && !Array.isArray(data),
            'Error reading OCBC allocation buckets'
        ) || {};
        const rawOcbcStore = Storage.readJson(
            STORAGE_KEYS.ocbc,
            data => data && typeof data === 'object' && !Array.isArray(data),
            'Error reading OCBC namespaced store'
        );
        const hasTopLevelOcbcStore = Boolean(rawOcbcStore);
        const ocbcStore = readOcbcStore();
        const legacySubPortfolios = Storage.readJson(
            STORAGE_KEYS.ocbcSubPortfolios,
            data => data && typeof data === 'object' && !Array.isArray(data),
            'Error reading OCBC sub-portfolios'
        ) || {};
        const legacyAssignments = Storage.readJson(
            STORAGE_KEYS.ocbcAllocationAssignmentByCode,
            data => data && typeof data === 'object' && !Array.isArray(data),
            'Error reading OCBC allocation assignments'
        ) || {};
        const legacyOrderByScope = Storage.readJson(
            STORAGE_KEYS.ocbcAllocationOrderByScope,
            data => data && typeof data === 'object' && !Array.isArray(data),
            'Error reading OCBC allocation order'
        ) || {};
        const subPortfoliosByView = hasTopLevelOcbcStore
            ? (ocbcStore.subPortfolios || {})
            : (Object.keys(ocbcStore.subPortfolios || {}).length ? ocbcStore.subPortfolios : legacySubPortfolios);
        const assignmentByCode = hasTopLevelOcbcStore
            ? (ocbcStore.assignmentByCode || {})
            : (Object.keys(ocbcStore.assignmentByCode || {}).length ? ocbcStore.assignmentByCode : legacyAssignments);
        const orderByScope = normalizeOcbcOrderByScopeForUi(hasTopLevelOcbcStore
            ? (ocbcStore.orderByScope || {})
            : (Object.keys(ocbcStore.orderByScope || {}).length ? ocbcStore.orderByScope : legacyOrderByScope));
        return { bucketsByView, subPortfoliosByView, assignmentByCode, orderByScope };
    }

    function saveOcbcSubPortfoliosConfig(subPortfoliosByView, options = {}) {
        updateOcbcStore(current => ({ ...current, subPortfolios: subPortfoliosByView || {} }), 'Error saving OCBC sub-portfolios');
        if (options.suppressSync !== true && typeof SyncManager?.scheduleSyncOnChange === 'function') {
            SyncManager.scheduleSyncOnChange('ocbc-sub-portfolios-update');
        }
    }

    function saveOcbcAllocationAssignmentsConfig(assignmentByCode, options = {}) {
        updateOcbcStore(current => ({ ...current, assignmentByCode: assignmentByCode || {} }), 'Error saving OCBC allocation assignments');
        if (options.suppressSync !== true && typeof SyncManager?.scheduleSyncOnChange === 'function') {
            SyncManager.scheduleSyncOnChange('ocbc-assignment-update');
        }
    }

    function saveOcbcAllocationOrderConfig(orderByScope, options = {}) {
        updateOcbcStore(
            current => ({ ...current, orderByScope: normalizeOcbcOrderByScopeForUi(orderByScope) }),
            'Error saving OCBC allocation order'
        );
        if (options.suppressSync !== true && typeof SyncManager?.scheduleSyncOnChange === 'function') {
            SyncManager.scheduleSyncOnChange('ocbc-order-update');
        }
    }

    function buildOcbcAllocationOrderScope(activeView, portfolioNo, subPortfolioId) {
        return [
            encodeOcbcTargetScopeSegment(activeView, 'assets'),
            encodeOcbcTargetScopeSegment(portfolioNo, '-'),
            encodeOcbcTargetScopeSegment(subPortfolioId, '')
        ].join(PROJECTED_KEY_SEPARATOR);
    }

    function normalizeOcbcSubPortfolioItem(item) {
        if (!item || typeof item !== 'object') {
            return null;
        }
        const id = utils.normalizeString(item.id, '');
        if (!id) {
            return null;
        }
        return {
            id,
            name: utils.normalizeString(item.name, 'Untitled sub-portfolio'),
            archived: item.archived === true,
            legacyProductType: utils.normalizeString(item.legacyProductType, ''),
            legacyBucketId: utils.normalizeString(item.legacyBucketId, '')
        };
    }

    function getActiveOcbcSubPortfolios(subPortfoliosByView, activeView, portfolioNo) {
        const scoped = subPortfoliosByView && typeof subPortfoliosByView === 'object' ? subPortfoliosByView[activeView] : null;
        const items = scoped && typeof scoped === 'object' ? scoped[portfolioNo] : null;
        if (!Array.isArray(items)) {
            return [];
        }
        return items
            .map(normalizeOcbcSubPortfolioItem)
            .filter(item => item && item.archived !== true);
    }

    function ensureOcbcViewSubPortfolioStore(subPortfoliosByView, activeView) {
        if (!subPortfoliosByView[activeView] || typeof subPortfoliosByView[activeView] !== 'object' || Array.isArray(subPortfoliosByView[activeView])) {
            subPortfoliosByView[activeView] = {};
        }
        return subPortfoliosByView[activeView];
    }

    function normalizeOcbcAllocationAssignment(value) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return {
                subPortfolioId: utils.normalizeString(value.subPortfolioId, '')
            };
        }
        return {
            subPortfolioId: utils.normalizeString(value, '')
        };
    }

    function buildOcbcAllocationRowsByPortfolio(rows) {
        return (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
            const portfolioNo = utils.normalizeString(row?.portfolioNo, '-');
            if (!acc[portfolioNo]) {
                acc[portfolioNo] = [];
            }
            acc[portfolioNo].push(row);
            return acc;
        }, {});
    }

    function buildLegacyOcbcSubPortfolios(activeView, bucketsByView) {
        const legacyProductBuckets = bucketsByView?.[activeView] || {};
        const legacySubPortfolios = [];
        const bucketUsageCount = new Map();
        Object.values(legacyProductBuckets).forEach(buckets => {
            if (!Array.isArray(buckets)) {
                return;
            }
            buckets.forEach(bucket => {
                const normalizedId = utils.normalizeString(bucket?.id, '');
                if (!normalizedId) {
                    return;
                }
                bucketUsageCount.set(normalizedId, (bucketUsageCount.get(normalizedId) || 0) + 1);
            });
        });
        Object.entries(legacyProductBuckets).forEach(([productType, buckets]) => {
            if (!Array.isArray(buckets)) {
                return;
            }
            buckets.forEach(bucket => {
                const normalizedId = utils.normalizeString(bucket?.id, '');
                const normalizedProductType = utils.normalizeString(productType, '');
                if (!normalizedId) {
                    return;
                }
                const isDuplicateLegacyBucketId = (bucketUsageCount.get(normalizedId) || 0) > 1;
                const internalId = isDuplicateLegacyBucketId
                    ? `legacy-${normalizedProductType.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'product'}-${normalizedId}`
                    : normalizedId;
                legacySubPortfolios.push({
                    id: internalId,
                    name: utils.normalizeString(bucket?.name, normalizedId),
                    archived: bucket?.archived === true,
                    buckets: [],
                    legacyProductType: normalizedProductType,
                    legacyBucketId: normalizedId
                });
            });
        });
        return legacySubPortfolios.filter(item => item.archived !== true);
    }

    function resolveOcbcAllocationAssignmentForRow(rawAssignment, row, subPortfolios) {
        const normalizedFromRaw = normalizeOcbcAllocationAssignment(rawAssignment);
        if (rawAssignment && typeof rawAssignment === 'object' && !Array.isArray(rawAssignment)) {
            return normalizedFromRaw;
        }
        const rawLegacyId = normalizedFromRaw.subPortfolioId;
        if (!rawLegacyId) {
            return normalizedFromRaw;
        }
        const items = Array.isArray(subPortfolios) ? subPortfolios : [];
        const directMatch = items.find(item => utils.normalizeString(item?.id, '') === rawLegacyId);
        if (directMatch && isOcbcSubPortfolioAllowedForRow(directMatch, row)) {
            return normalizedFromRaw;
        }
        const rowProductType = utils.normalizeString(row?.productType, '');
        const productScopedLegacyMatch = items.find(item => (
            utils.normalizeString(item?.legacyBucketId, '') === rawLegacyId
            && utils.normalizeString(item?.legacyProductType, '') === rowProductType
        ));
        if (productScopedLegacyMatch) {
            return { subPortfolioId: productScopedLegacyMatch.id };
        }
        const legacyBucketMatches = items.filter(item => utils.normalizeString(item?.legacyBucketId, '') === rawLegacyId);
        if (legacyBucketMatches.length === 1) {
            return { subPortfolioId: legacyBucketMatches[0].id };
        }
        return normalizedFromRaw;
    }

    function isOcbcSubPortfolioAllowedForRow(subPortfolio, row) {
        const legacyProductType = utils.normalizeString(subPortfolio?.legacyProductType, '');
        if (!legacyProductType) {
            return true;
        }
        return legacyProductType === utils.normalizeString(row?.productType, '');
    }

    function getEffectiveOcbcAssignmentForRow(rawAssignment, row, subPortfolios) {
        const normalizedAssignment = resolveOcbcAllocationAssignmentForRow(rawAssignment, row, subPortfolios);
        const subPortfolioId = utils.normalizeString(normalizedAssignment?.subPortfolioId, '');
        if (!subPortfolioId) {
            return { subPortfolioId: '' };
        }
        const selectedSubPortfolio = (Array.isArray(subPortfolios) ? subPortfolios : []).find(item => item.id === subPortfolioId);
        if (!selectedSubPortfolio || !isOcbcSubPortfolioAllowedForRow(selectedSubPortfolio, row)) {
            return { subPortfolioId: '' };
        }
        return { subPortfolioId };
    }

    function resolveOcbcAssignmentByRow(assignmentByCode, row, subPortfolios) {
        const source = assignmentByCode && typeof assignmentByCode === 'object' ? assignmentByCode : {};
        const candidates = getOcbcAssignmentLookupCandidates(row);
        for (const code of candidates) {
            const assignment = getEffectiveOcbcAssignmentForRow(source[code], row, subPortfolios);
            if (assignment.subPortfolioId) {
                return assignment;
            }
        }
        return { subPortfolioId: '' };
    }

    function getOcbcInstrumentTargetPercent(viewKey, portfolioNo, subPortfolioId, row) {
        const candidates = getOcbcAssignmentLookupCandidates(row);
        for (const code of candidates) {
            const targetPercent = getOcbcAllocationTargetPercent(viewKey, portfolioNo, subPortfolioId, code);
            if (Number.isFinite(targetPercent)) {
                return targetPercent;
            }
        }
        return null;
    }

    function normalizeOcbcRowOrderCodes(currentOrder, rows) {
        const normalizedRows = Array.isArray(rows) ? rows : [];
        const rowCodes = normalizedRows.map(row => utils.normalizeString(row?.code, '')).filter(Boolean);
        const canonicalByAlias = {};
        normalizedRows.forEach(row => {
            const canonicalCode = utils.normalizeString(row?.code, '');
            if (!canonicalCode) {
                return;
            }
            const aliases = getOcbcAssignmentLookupCandidates(row);
            aliases.forEach(alias => {
                const normalizedAlias = utils.normalizeString(alias, '');
                if (normalizedAlias && !canonicalByAlias[normalizedAlias]) {
                    canonicalByAlias[normalizedAlias] = canonicalCode;
                }
            });
        });
        const seenCodes = new Set();
        const orderedCodes = [];
        (Array.isArray(currentOrder) ? currentOrder : []).forEach(code => {
            const normalizedCode = utils.normalizeString(code, '');
            const canonicalCode = canonicalByAlias[normalizedCode] || normalizedCode;
            if (!canonicalCode || seenCodes.has(canonicalCode) || !rowCodes.includes(canonicalCode)) {
                return;
            }
            seenCodes.add(canonicalCode);
            orderedCodes.push(canonicalCode);
        });
        rowCodes.forEach(code => {
            if (!seenCodes.has(code)) {
                seenCodes.add(code);
                orderedCodes.push(code);
            }
        });
        return orderedCodes;
    }

    function mergeOcbcSubPortfolios(scopedSubPortfolios, legacySubPortfolios) {
        const mergedMap = new Map();
        (Array.isArray(scopedSubPortfolios) ? scopedSubPortfolios : []).forEach(item => {
            const id = utils.normalizeString(item?.id, '');
            if (!id || mergedMap.has(id)) {
                return;
            }
            mergedMap.set(id, item);
        });
        (Array.isArray(legacySubPortfolios) ? legacySubPortfolios : []).forEach(item => {
            const id = utils.normalizeString(item?.id, '');
            if (!id || mergedMap.has(id)) {
                return;
            }
            mergedMap.set(id, item);
        });
        return Array.from(mergedMap.values());
    }

    function renderOcbcOverlay(ocbcHoldings) {
        const overlay = createElement('div', 'gpv-overlay');
        overlay.id = 'gpv-overlay';
        const container = createElement('div', 'gpv-container gpv-container--expanded');
        const cleanupCallbacks = [];
        container.gpvCleanupCallbacks = cleanupCallbacks;
        overlay.gpvCleanupCallbacks = cleanupCallbacks;

        const { header, closeBtn, titleId, closeOverlay } = buildFsmHeader({
            overlay,
            cleanupCallbacks,
            titleText: 'Portfolio Viewer (OCBC)',
            syncReturnTo: 'ocbc'
        });
        container.appendChild(header);

        const controls = createElement('div', 'gpv-controls');
        const viewLabel = createElement('label', 'gpv-select-label', 'View:');
        const viewSelect = createElement('select', 'gpv-select');
        const viewSelectId = 'gpv-ocbc-view-select';
        viewSelect.id = viewSelectId;
        viewLabel.setAttribute('for', viewSelectId);
        viewSelect.setAttribute('aria-label', 'Select OCBC holdings view');
        viewSelect.innerHTML = `
            <option value="assets">Assets</option>
            <option value="liabilities">Liabilities</option>
        `;
        controls.appendChild(viewLabel);
        controls.appendChild(viewSelect);

        const modeLabel = createElement('label', 'gpv-select-label', 'Mode:');
        const modeSelect = createElement('select', 'gpv-select');
        const modeSelectId = 'gpv-ocbc-mode-select';
        modeSelect.id = modeSelectId;
        modeLabel.setAttribute('for', modeSelectId);
        modeSelect.setAttribute('aria-label', 'Select OCBC layout mode');
        modeSelect.innerHTML = `
            <option value="portfolio">Portfolio</option>
            <option value="allocation">Allocation</option>
        `;
        controls.appendChild(modeLabel);
        controls.appendChild(modeSelect);
        container.appendChild(controls);

        const contentDiv = createElement('div', 'gpv-content');
        container.appendChild(contentDiv);
        overlay.appendChild(container);

        const safeHoldings = ocbcHoldings && typeof ocbcHoldings === 'object'
            ? ocbcHoldings
            : { assets: [], liabilities: [] };
        const assets = Array.isArray(safeHoldings.assets) ? safeHoldings.assets : [];
        const liabilities = Array.isArray(safeHoldings.liabilities) ? safeHoldings.liabilities : [];

        const allocationConfig = loadOcbcAllocationConfig();
        const bucketsByView = allocationConfig.bucketsByView;
        const subPortfoliosByView = allocationConfig.subPortfoliosByView;
        const assignmentByCode = allocationConfig.assignmentByCode;
        const orderByScope = allocationConfig.orderByScope;

        function renderAllocationMode(activeView, rows) {
            let assignmentConfigChanged = false;
            const groupedByPortfolio = buildOcbcAllocationRowsByPortfolio(rows);
            const portfolioNos = Object.keys(groupedByPortfolio);
            if (portfolioNos.length === 0) {
                contentDiv.appendChild(createElement('div', 'gpv-conflict-diff-empty', 'No holdings available in this view.'));
                return;
            }

            portfolioNos.forEach(portfolioNo => {
                const portfolioRows = groupedByPortfolio[portfolioNo] || [];
                const portfolioSummary = buildOcbcSummary(portfolioRows);
                const portfolioTotal = toFiniteNumber(portfolioSummary.total, 0);
                const section = createElement('section', 'gpv-bucket-detail-section');
                section.appendChild(buildOcbcPortfolioHeader(portfolioNo, portfolioSummary));

                const scopedSubPortfolios = getActiveOcbcSubPortfolios(subPortfoliosByView, activeView, portfolioNo);
                const legacySubPortfolios = buildLegacyOcbcSubPortfolios(activeView, bucketsByView);
                const persistedSubPortfolios = mergeOcbcSubPortfolios(scopedSubPortfolios, legacySubPortfolios);
                const assignmentReferencedIds = Array.from(new Set(portfolioRows
                    .map(row => resolveOcbcAssignmentByRow(assignmentByCode, row, persistedSubPortfolios).subPortfolioId)
                    .filter(Boolean)));
                assignmentReferencedIds.forEach(id => {
                    const ambiguousLegacyMatches = persistedSubPortfolios.filter(item => (
                        utils.normalizeString(item?.legacyBucketId, '') === id
                        && utils.normalizeString(item?.legacyProductType, '')
                    ));
                    if (ambiguousLegacyMatches.length > 1) {
                        return;
                    }
                    if (!persistedSubPortfolios.some(item => item.id === id)) {
                        persistedSubPortfolios.push({ id, name: id, archived: false });
                    }
                });

                const managerRow = createElement('div', 'gpv-fsm-manager-row');
                const createSubPortfolioId = `gpv-ocbc-sub-portfolio-create-${activeView}-${encodeURIComponent(portfolioNo)}`;
                const createSubPortfolioLabel = createElement('label', null, 'New sub-portfolio');
                createSubPortfolioLabel.setAttribute('for', createSubPortfolioId);
                const createSubPortfolioInput = createElement('input', 'gpv-target-input');
                createSubPortfolioInput.id = createSubPortfolioId;
                createSubPortfolioInput.maxLength = 80;
                createSubPortfolioInput.placeholder = 'Sub-portfolio name';
                const createSubPortfolioBtn = createElement('button', 'gpv-sync-btn gpv-sync-btn-primary', 'Create');
                createSubPortfolioBtn.type = 'button';
                createSubPortfolioBtn.onclick = () => {
                    const name = utils.normalizeString(createSubPortfolioInput.value, '');
                    if (!name) {
                        return;
                    }
                    const normalizedId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                    const subPortfolioId = normalizedId || `sub-portfolio-${Date.now()}`;
                    const viewStore = ensureOcbcViewSubPortfolioStore(subPortfoliosByView, activeView);
                    const currentItems = Array.isArray(viewStore[portfolioNo]) ? viewStore[portfolioNo] : [];
                    if (!currentItems.some(item => utils.normalizeString(item?.id, '') === subPortfolioId)) {
                        currentItems.push({ id: subPortfolioId, name, archived: false });
                        viewStore[portfolioNo] = currentItems;
                        saveOcbcSubPortfoliosConfig(subPortfoliosByView);
                        rerender();
                    }
                };
                managerRow.appendChild(createSubPortfolioLabel);
                managerRow.appendChild(createSubPortfolioInput);
                managerRow.appendChild(createSubPortfolioBtn);
                section.appendChild(managerRow);
                section.appendChild(createElement('h3', 'gpv-detail-title', `Sub-portfolio allocation within Portfolio ${portfolioNo}`));

                const subPortfolioRows = createElement('table', 'gpv-table');
                subPortfolioRows.innerHTML = `
                    <thead>
                        <tr>
                            <th>Sub-portfolio</th>
                            <th>Value (SGD)</th>
                            <th>Current % of portfolio</th>
                            <th>Target % of portfolio</th>
                            <th>Drift</th>
                            <th>Holdings</th>
                            <th>Profit</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                `;
                const subPortfolioBody = subPortfolioRows.querySelector('tbody');
                const subPortfolioRowsData = [{ id: '', name: 'Unassigned', rows: [] }];
                persistedSubPortfolios.forEach(item => subPortfolioRowsData.push({ ...item, rows: [] }));
                const configuredSubPortfolioTargets = subPortfolioRowsData.reduce((sum, subPortfolio) => {
                    if (!subPortfolio.id) {
                        return sum;
                    }
                    const targetPercent = getOcbcAllocationTargetPercent(activeView, portfolioNo, subPortfolio.id, '', subPortfolio.legacyProductType, subPortfolio.legacyBucketId);
                    return Number.isFinite(targetPercent) ? sum + targetPercent : sum;
                }, 0);

                portfolioRows.forEach(row => {
                    const code = utils.normalizeString(row?.code, '');
                    const assignment = resolveOcbcAssignmentByRow(assignmentByCode, row, persistedSubPortfolios);
                    const matchedSubPortfolio = subPortfolioRowsData.find(item => item.id === assignment.subPortfolioId);
                    (matchedSubPortfolio || subPortfolioRowsData[0]).rows.push(row);
                    if (code && assignment.subPortfolioId && assignmentByCode[code] !== assignment.subPortfolioId) {
                        assignmentByCode[code] = assignment.subPortfolioId;
                        assignmentConfigChanged = true;
                    }
                });

                subPortfolioRowsData.forEach(subPortfolio => {
                    const tr = createElement('tr');
                    const subPortfolioSummary = buildOcbcSummary(subPortfolio.rows);
                    const subPortfolioValue = toFiniteNumber(subPortfolioSummary.total, 0);
                    const currentPercent = calculateAllocationRatio(subPortfolioValue, portfolioTotal);
                    const targetPercent = subPortfolio.id
                        ? getOcbcAllocationTargetPercent(activeView, portfolioNo, subPortfolio.id, '', subPortfolio.legacyProductType, subPortfolio.legacyBucketId)
                        : null;
                    const driftModel = targetPercent === null
                        ? { driftPercent: null, driftAmount: null }
                        : calculateAllocationDrift(subPortfolioValue, targetPercent, portfolioTotal);
                    tr.appendChild(createTableCell(subPortfolio.name));
                    tr.appendChild(createTableCell(formatMoney(subPortfolioValue)));
                    tr.appendChild(createTableCell(formatPercent(currentPercent, { multiplier: 100, showSign: false })));

                    const targetCell = createElement('td');
                    if (subPortfolio.id) {
                        const targetInput = createPercentTargetInput(
                            targetPercent,
                            `Target percentage for portfolio ${portfolioNo} sub-portfolio ${subPortfolio.name}`,
                            () => {
                            const parsed = toOptionalFiniteNumber(targetInput.value);
                            const scope = buildOcbcTargetScope(activeView, portfolioNo, subPortfolio.id, '');
                            if (parsed === null) {
                                updateOcbcStore(current => {
                                    const targetsByScope = { ...current.targetsByScope };
                                    delete targetsByScope[scope];
                                    return { ...current, targetsByScope };
                                });
                                if (typeof SyncManager?.scheduleSyncOnChange === 'function') {
                                    SyncManager.scheduleSyncOnChange('ocbc-target-clear');
                                }
                            } else {
                                updateOcbcStore(current => ({
                                    ...current,
                                    targetsByScope: {
                                        ...current.targetsByScope,
                                        [scope]: Number(Math.min(100, Math.max(0, parsed)).toFixed(2))
                                    }
                                }));
                                if (typeof SyncManager?.scheduleSyncOnChange === 'function') {
                                    SyncManager.scheduleSyncOnChange('ocbc-target-update');
                                }
                            }
                            rerender();
                            }
                        );
                        targetCell.appendChild(targetInput);
                    } else {
                        targetCell.textContent = '-';
                    }
                    tr.appendChild(targetCell);
                    tr.appendChild(createTableCell(formatDriftDisplay(driftModel?.driftPercent, driftModel?.driftAmount), getDriftSeverityClass(driftModel?.driftPercent)));
                    tr.appendChild(createTableCell(String(subPortfolio.rows.length)));
                    tr.appendChild(createTableCell(subPortfolioSummary?.profitDisplay || '-', subPortfolioSummary?.profitClass));
                    subPortfolioBody.appendChild(tr);
                });
                section.appendChild(createElement(
                    'p',
                    'gpv-sync-help gpv-ocbc-target-summary',
                    `Sub-portfolio targets: ${buildAssignedCoverageText(configuredSubPortfolioTargets)}`
                ));
                section.appendChild(subPortfolioRows);

                const displayRows = buildFsmDisplayRows(portfolioRows, portfolioTotal);
                const instrumentRowsBySubPortfolio = [{ id: '', name: 'Unassigned', rows: [] }];
                persistedSubPortfolios.forEach(item => instrumentRowsBySubPortfolio.push({ ...item, rows: [] }));
                displayRows.forEach(row => {
                    const code = utils.normalizeString(row?.code, '');
                    const assignment = resolveOcbcAssignmentByRow(assignmentByCode, row, persistedSubPortfolios);
                    const matchedSubPortfolio = instrumentRowsBySubPortfolio.find(item => item.id === assignment.subPortfolioId);
                    (matchedSubPortfolio || instrumentRowsBySubPortfolio[0]).rows.push(row);
                    if (code && assignment.subPortfolioId && assignmentByCode[code] !== assignment.subPortfolioId) {
                        assignmentByCode[code] = assignment.subPortfolioId;
                        assignmentConfigChanged = true;
                    }
                });

                const buildInstrumentTable = ({
                    heading,
                    rows,
                    sectionClass = '',
                    subPortfolioId = '',
                    subPortfolioName = '',
                    denominatorTotal = null
                }) => {
                    if (!rows.length) {
                        return;
                    }
                    const headerRow = createElement('div', 'gpv-ocbc-instrument-header-row');
                    const headingElement = createElement('h3', `gpv-detail-title gpv-ocbc-instrument-heading ${sectionClass}`.trim(), heading);
                    headerRow.appendChild(headingElement);
                    section.appendChild(headerRow);
                    const scopeKey = buildOcbcAllocationOrderScope(activeView, portfolioNo, subPortfolioId);
                    const currentOrder = Array.isArray(orderByScope[scopeKey]) ? orderByScope[scopeKey] : [];
                    const orderedCodes = normalizeOcbcRowOrderCodes(currentOrder, rows);
                    const rowsByCode = rows.reduce((acc, row) => {
                        const code = utils.normalizeString(row?.code, '');
                        if (code && !acc[code]) {
                            acc[code] = row;
                        }
                        return acc;
                    }, {});
                    const orderedRows = orderedCodes.map(code => rowsByCode[code]).filter(Boolean);
                    let copyControls = null;
                    if (subPortfolioId) {
                        const configuredInstrumentTargets = rows.reduce((sum, row) => {
                            const rowCode = utils.normalizeString(row?.code, '');
                            const targetPercent = getOcbcAllocationTargetPercent(activeView, portfolioNo, subPortfolioId, rowCode);
                            return Number.isFinite(targetPercent) ? sum + targetPercent : sum;
                        }, 0);
                        section.appendChild(createElement('p', 'gpv-sync-help gpv-ocbc-target-summary', `${subPortfolioName || subPortfolioId} instrument targets: ${buildAssignedCoverageText(configuredInstrumentTargets)}`));
                        copyControls = buildCopyControls({
                            buttonLabel: 'Copy Values',
                            buttonAriaLabel: `Copy values for sub-portfolio ${subPortfolioName || subPortfolioId}`,
                            emptyMessage: 'No assigned instruments',
                            successMessage: () => `Copied ${orderedRows.length} values`,
                            copyText: () => orderedRows
                                .map(row => {
                                    const rawValue = row?.currentValueLcy;
                                    return rawValue === null || rawValue === undefined ? '' : String(rawValue);
                                })
                                .join('\t'),
                            controlsClassName: 'gpv-balance-copy-controls gpv-balance-copy-controls--section'
                        });
                    }
                    if (copyControls) {
                        section.appendChild(copyControls);
                    }
                    const holdingsTable = createElement('table', 'gpv-table');
                    holdingsTable.innerHTML = `
                    <thead>
                        <tr>
                            <th>Identifier</th>
                            <th>Name</th>
                            <th>Product Type</th>
                            <th>Value (SGD)</th>
                            <th>Current % of sub-portfolio</th>
                            <th>Target % of sub-portfolio</th>
                            <th>Drift</th>
                            <th>Sub-portfolio</th>
                            <th>Reorder</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                `;
                    const holdingsBody = holdingsTable.querySelector('tbody');
                    orderedRows.forEach((row, index) => {
                        const tr = createElement('tr');
                        tr.appendChild(createElement('td', null, row.displayTicker || row.code || '-'));
                        tr.appendChild(createElement('td', null, row.name || '-'));
                        tr.appendChild(createElement('td', null, row.productType || '-'));
                        tr.appendChild(createElement('td', null, formatMoney(row.currentValueLcy)));
                        const code = utils.normalizeString(row.code, '');
                        const assignment = resolveOcbcAssignmentByRow(assignmentByCode, row, persistedSubPortfolios);
                        const effectiveSubPortfolioId = utils.normalizeString(subPortfolioId || assignment.subPortfolioId, '');
                        const resolvedAssignedTotal = Number.isFinite(denominatorTotal)
                            ? toFiniteNumber(denominatorTotal, 0)
                            : toFiniteNumber(buildOcbcSummary(portfolioRows.filter(candidate => (
                                resolveOcbcAssignmentByRow(assignmentByCode, candidate, persistedSubPortfolios).subPortfolioId === effectiveSubPortfolioId
                            ))).total, 0);
                        const currentPercentInSubPortfolio = effectiveSubPortfolioId
                            ? calculateAllocationRatio(toFiniteNumber(row.currentValueLcy, 0), resolvedAssignedTotal)
                            : null;
                        tr.appendChild(createElement('td', null, effectiveSubPortfolioId
                            ? formatPercent(currentPercentInSubPortfolio, { multiplier: 100, showSign: false })
                            : '-'));

                        const targetCell = createElement('td');
                        const targetPercent = effectiveSubPortfolioId
                            ? getOcbcInstrumentTargetPercent(activeView, portfolioNo, effectiveSubPortfolioId, row)
                            : null;
                        if (effectiveSubPortfolioId) {
                            const inputSubPortfolioName = subPortfolioName || (persistedSubPortfolios.find(item => item.id === effectiveSubPortfolioId)?.name) || effectiveSubPortfolioId;
                            const targetInput = createPercentTargetInput(
                                targetPercent,
                                `Target percentage for instrument ${row.displayTicker || row.code || row.name || '-'} in sub-portfolio ${inputSubPortfolioName}`,
                                () => {
                                const parsed = toOptionalFiniteNumber(targetInput.value);
                                const scope = buildOcbcTargetScope(activeView, portfolioNo, effectiveSubPortfolioId, code);
                                if (parsed === null) {
                                    updateOcbcStore(current => {
                                        const targetsByScope = { ...current.targetsByScope };
                                        delete targetsByScope[scope];
                                        return { ...current, targetsByScope };
                                    });
                                    if (typeof SyncManager?.scheduleSyncOnChange === 'function') {
                                        SyncManager.scheduleSyncOnChange('ocbc-target-clear');
                                    }
                                } else {
                                    updateOcbcStore(current => ({
                                        ...current,
                                        targetsByScope: {
                                            ...current.targetsByScope,
                                            [scope]: Number(Math.min(100, Math.max(0, parsed)).toFixed(2))
                                        }
                                    }));
                                    if (typeof SyncManager?.scheduleSyncOnChange === 'function') {
                                        SyncManager.scheduleSyncOnChange('ocbc-target-update');
                                    }
                                }
                                rerender();
                                }
                            );
                            targetCell.appendChild(targetInput);
                        } else {
                            targetCell.textContent = '-';
                        }
                        tr.appendChild(targetCell);

                        const driftModel = (effectiveSubPortfolioId && Number.isFinite(targetPercent))
                            ? calculateAllocationDrift(toFiniteNumber(row.currentValueLcy, 0), targetPercent, resolvedAssignedTotal)
                            : { driftPercent: null, driftAmount: null };
                        tr.appendChild(createElement('td', getDriftSeverityClass(driftModel?.driftPercent), formatDriftDisplay(driftModel?.driftPercent, driftModel?.driftAmount)));

                        const subPortfolioCell = createElement('td');
                        const subPortfolioSelect = createElement('select', 'gpv-select');
                        const labelTicker = row.displayTicker || row.code || row.name || 'this holding';
                        subPortfolioSelect.setAttribute('aria-label', `Sub-portfolio for ${labelTicker}`);
                        const unassignedOption = createElement('option', null, 'Unassigned');
                        unassignedOption.value = '';
                        subPortfolioSelect.appendChild(unassignedOption);
                        const rowProductType = utils.normalizeString(row?.productType, '');
                        const rowSubPortfolioOptions = persistedSubPortfolios.filter(subPortfolio => {
                            const legacyProductType = utils.normalizeString(subPortfolio?.legacyProductType, '');
                            return !legacyProductType || legacyProductType === rowProductType;
                        });
                        rowSubPortfolioOptions.forEach(subPortfolio => {
                            const option = createElement('option', null, subPortfolio.name);
                            option.value = subPortfolio.id;
                            subPortfolioSelect.appendChild(option);
                        });
                        subPortfolioSelect.value = assignment.subPortfolioId;
                        subPortfolioSelect.onchange = () => {
                            const previousSubPortfolioId = utils.normalizeString(assignment.subPortfolioId, '');
                            const nextSubPortfolioId = utils.normalizeString(subPortfolioSelect.value, '');
                            assignmentByCode[code] = nextSubPortfolioId;
                            const nextScopeKey = buildOcbcAllocationOrderScope(activeView, portfolioNo, nextSubPortfolioId);
                            const previousScopeCompatibilityKeys = buildOcbcOrderScopeCompatibilityKeys(activeView, portfolioNo, previousSubPortfolioId);
                            previousScopeCompatibilityKeys.forEach(scopeKey => {
                                const currentScopeOrder = Array.isArray(orderByScope[scopeKey]) ? orderByScope[scopeKey] : null;
                                if (!currentScopeOrder) {
                                    return;
                                }
                                const nextScopeOrder = currentScopeOrder.filter(item => item !== code);
                                if (nextScopeOrder.length) {
                                    orderByScope[scopeKey] = nextScopeOrder;
                                } else {
                                    delete orderByScope[scopeKey];
                                }
                            });
                            const nextScope = Array.isArray(orderByScope[nextScopeKey]) ? orderByScope[nextScopeKey].filter(Boolean) : [];
                            orderByScope[nextScopeKey] = nextScope.filter(item => item !== code).concat(code);
                            saveOcbcAllocationAssignmentsConfig(assignmentByCode);
                            saveOcbcAllocationOrderConfig(orderByScope);
                            rerender();
                        };
                        subPortfolioCell.appendChild(subPortfolioSelect);
                        tr.appendChild(subPortfolioCell);

                        const reorderCell = createElement('td', 'gpv-fixed-cell');
                        const reorderGroup = createElement('div', 'gpv-row-reorder-controls');
                        const moveUpButton = createElement('button', 'gpv-section-toggle', 'Up');
                        const moveDownButton = createElement('button', 'gpv-section-toggle', 'Down');
                        moveUpButton.type = 'button';
                        moveDownButton.type = 'button';
                        moveUpButton.disabled = index === 0;
                        moveDownButton.disabled = index === (orderedRows.length - 1);
                        moveUpButton.setAttribute('aria-label', `Move ${labelTicker} up within ${subPortfolioName || 'unassigned instruments'}`);
                        moveDownButton.setAttribute('aria-label', `Move ${labelTicker} down within ${subPortfolioName || 'unassigned instruments'}`);
                        moveUpButton.onclick = () => {
                            if (index === 0) {
                                return;
                            }
                            const nextOrder = orderedCodes.slice();
                            [nextOrder[index - 1], nextOrder[index]] = [nextOrder[index], nextOrder[index - 1]];
                            orderByScope[scopeKey] = nextOrder;
                            saveOcbcAllocationOrderConfig(orderByScope);
                            rerender();
                        };
                        moveDownButton.onclick = () => {
                            if (index >= orderedRows.length - 1) {
                                return;
                            }
                            const nextOrder = orderedCodes.slice();
                            [nextOrder[index], nextOrder[index + 1]] = [nextOrder[index + 1], nextOrder[index]];
                            orderByScope[scopeKey] = nextOrder;
                            saveOcbcAllocationOrderConfig(orderByScope);
                            rerender();
                        };
                        reorderGroup.appendChild(moveUpButton);
                        reorderGroup.appendChild(moveDownButton);
                        reorderCell.appendChild(reorderGroup);
                        tr.appendChild(reorderCell);
                        holdingsBody.appendChild(tr);
                    });
                    section.appendChild(holdingsTable);
                };

                instrumentRowsBySubPortfolio.forEach(subPortfolio => {
                    if (!subPortfolio.id) {
                        return;
                    }
                    const assignedTotal = toFiniteNumber(buildOcbcSummary(subPortfolio.rows).total, 0);
                    buildInstrumentTable({
                        heading: `Instrument allocation · ${subPortfolio.name}`,
                        rows: subPortfolio.rows,
                        subPortfolioId: subPortfolio.id,
                        subPortfolioName: subPortfolio.name,
                        denominatorTotal: assignedTotal
                    });
                });
                buildInstrumentTable({
                    heading: 'Unassigned instruments',
                    rows: instrumentRowsBySubPortfolio[0].rows,
                    sectionClass: 'gpv-unassigned-title'
                });

                contentDiv.appendChild(section);
            });

            if (assignmentConfigChanged) {
                saveOcbcAllocationAssignmentsConfig(assignmentByCode);
            }
        }

        function rerender() {
            const activeView = viewSelect.value === 'liabilities' ? 'liabilities' : 'assets';
            const rows = activeView === 'liabilities' ? liabilities : assets;
            const mode = modeSelect.value === 'allocation' ? 'allocation' : 'portfolio';
            contentDiv.innerHTML = '';

            if (mode === 'allocation') {
                renderAllocationMode(activeView, rows);
                return;
            }

            const grouped = buildOcbcRowsByPortfolioAndProductType(rows);
            const portfolioNos = Object.keys(grouped);
            if (portfolioNos.length === 0) {
                contentDiv.appendChild(createElement('div', 'gpv-conflict-diff-empty', 'No holdings available in this view.'));
                return;
            }
            portfolioNos.forEach(portfolioNo => {
                const portfolioSection = createElement('section', 'gpv-bucket-detail-section');
                const portfolioRows = Object.values(grouped[portfolioNo]).flat();
                const portfolioSummary = buildOcbcSummary(portfolioRows);
                portfolioSection.appendChild(buildOcbcPortfolioHeader(portfolioNo, portfolioSummary));

                Object.keys(grouped[portfolioNo]).forEach(productType => {
                    const productSection = createElement('section', 'gpv-type-section');
                    const productRows = grouped[portfolioNo][productType] || [];
                    const productSummary = buildOcbcSummary(productRows);
                    productSection.appendChild(buildOcbcProductTypeHeader(productType, productSummary));
                    productSection.appendChild(buildOcbcSimpleTable(productRows, productSummary.total));
                    portfolioSection.appendChild(productSection);
                });
                contentDiv.appendChild(portfolioSection);
            });
        }
        viewSelect.onchange = rerender;
        modeSelect.onchange = rerender;
        rerender();

        overlay.onclick = event => {
            if (event.target === overlay) {
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

    function renderDataReadinessOverlay({
        title,
        description,
        getItems,
        isReady,
        onReady
    }) {
        const overlay = createElement('div', 'gpv-overlay');
        overlay.id = 'gpv-overlay';

        const container = createElement('div', 'gpv-container');
        const cleanupCallbacks = [];
        container.gpvCleanupCallbacks = cleanupCallbacks;
        overlay.gpvCleanupCallbacks = cleanupCallbacks;

        const closeBtn = createElement('button', 'gpv-close-btn', '✕');
        closeBtn.type = 'button';

        function teardown() {
            cleanupCallbacks.forEach(callback => {
                if (typeof callback === 'function') {
                    callback();
                }
            });
            cleanupCallbacks.length = 0;
        }

        function closeOverlay() {
            teardown();
            overlay.remove();
        }

        closeBtn.onclick = closeOverlay;
        const { header, titleId } = buildOverlayHeader({
            title: title || 'Portfolio Viewer',
            closeButton: closeBtn
        });
        container.appendChild(header);

        const contentDiv = createElement('div', 'gpv-content');
        container.appendChild(contentDiv);
        overlay.appendChild(container);

        const updateReadinessView = () => {
            const items = typeof getItems === 'function' ? getItems() : [];
            const ready = typeof isReady === 'function' ? isReady() : false;
            contentDiv.innerHTML = '';
            contentDiv.appendChild(createReadinessView({
                title: ready ? 'Data ready' : 'Preparing data',
                description: ready
                    ? 'Opening your portfolio view...'
                    : description,
                items,
                tone: ready ? 'ready' : 'pending'
            }));
            if (!ready || typeof onReady !== 'function') {
                return;
            }
            teardown();
            onReady();
        };

        const unsubscribe = subscribeDataUpdates(updateReadinessView);
        cleanupCallbacks.push(unsubscribe);

        overlay.onclick = event => {
            if (event.target === overlay) {
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

        updateReadinessView();
    }

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

        const isFsmRoute = isFsmInvestmentsRoute(window.location.href, window.location.origin);
        if (isFsmRoute) {
            const readinessState = getFsmReadinessState();
            if (!readinessState.ready) {
                logDebug('[Goal Portfolio Viewer] FSM holdings not available yet');
                renderDataReadinessOverlay({
                    title: 'Portfolio Viewer (FSM)',
                    description: 'Waiting for FSM holdings response. This updates automatically when data arrives.',
                    getItems: () => [{
                        label: 'FSM holdings data',
                        ready: getFsmReadinessState().ready
                    }],
                    isReady: () => getFsmReadinessState().ready,
                    onReady: () => showOverlay()
                });
                return;
            }
            renderFsmOverlay(readinessState.fsmHoldings);
            return;
        }

        const isOcbcRoute = isOcbcDashboardRoute(window.location.href, window.location.origin)
            || isOcbcPortfolioHoldingsRoute(window.location.href, window.location.origin);
        if (isOcbcRoute) {
            const readinessState = getOcbcReadinessState();
            if (!readinessState.ready) {
                renderDataReadinessOverlay({
                    title: 'Portfolio Viewer (OCBC)',
                    description: 'Waiting for OCBC portfolio holdings response. This updates automatically when data arrives.',
                    getItems: () => [{
                        label: 'OCBC portfolio holdings data',
                        ready: getOcbcReadinessState().ready
                    }],
                    isReady: () => getOcbcReadinessState().ready,
                    onReady: () => showOverlay()
                });
                return;
            }
            renderOcbcOverlay(readinessState.ocbcHoldings);
            return;
        }

        const readinessState = getEndowusReadinessState();
        if (!readinessState.ready) {
            logDebug('[Goal Portfolio Viewer] Not all API data available yet');
            renderDataReadinessOverlay({
                title: 'Portfolio Viewer',
                description: 'Fetching Endowus portfolio data. This view updates automatically as data arrives.',
                getItems: () => {
                    const current = getEndowusReadinessState();
                    return [
                        { label: 'Goal performance', ready: current.hasPerformance },
                        { label: 'Investible balances', ready: current.hasInvestible },
                        { label: 'Goal summaries', ready: current.hasSummary }
                    ];
                },
                isReady: () => getEndowusReadinessState().ready,
                onReady: () => showOverlay()
            });
            return;
        }
        let mergedInvestmentDataState = readinessState.mergedInvestmentDataState;
        logDebug('[Goal Portfolio Viewer] Data merged successfully');

        const overlay = createElement('div', 'gpv-overlay');
        overlay.id = 'gpv-overlay';

        const container = createElement('div', 'gpv-container');
        const cleanupCallbacks = [];
        container.gpvCleanupCallbacks = cleanupCallbacks;
        overlay.gpvCleanupCallbacks = cleanupCallbacks;

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
        
        // Add sync settings button
        const syncBtn = createElement('button', 'gpv-sync-btn', '⚙️ Sync');
        syncBtn.title = 'Configure cross-device sync';
        syncBtn.onclick = () => {
            if (typeof showSyncSettings === 'function') {
                showSyncSettings({ returnTo: 'endowus' });
            } else {
                console.error('[Goal Portfolio Viewer] showSyncSettings is not a function!');
                alert('Sync settings are not available. Please ensure the sync module is loaded.');
            }
        };

        const bucketManageBtn = createElement('button', 'gpv-sync-btn gpv-sync-btn-secondary gpv-bucket-manage-btn', '🗂️ Buckets');
        bucketManageBtn.type = 'button';
        bucketManageBtn.title = 'Manage Endowus bucket assignments';

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

        const { header, titleId } = buildOverlayHeader({
            title: 'Portfolio Viewer',
            actionButtons: [bucketManageBtn, syncBtn, expandBtn],
            closeButton: closeBtn,
            centerNode: syncIndicatorContainer
        });
        container.appendChild(header);

        const controls = createElement('div', 'gpv-controls');
        const selectLabel = createElement('label', 'gpv-select-label', 'View:');
        const select = createElement('select', 'gpv-select');
        function refreshBucketSelectOptions(preferredValue) {
            const selectedValue = preferredValue || select.value || 'SUMMARY';
            select.innerHTML = '';
            const summaryOption = createElement('option', null, '📊 Summary View');
            summaryOption.value = 'SUMMARY';
            select.appendChild(summaryOption);
            Object.keys(mergedInvestmentDataState || {}).sort().forEach(bucket => {
                const opt = createElement('option', null, `📁 ${bucket}`);
                opt.value = bucket;
                select.appendChild(opt);
            });
            const hasSelected = Array.from(select.options).some(option => option.value === selectedValue);
            select.value = hasSelected ? selectedValue : 'SUMMARY';
        }
        refreshBucketSelectOptions('SUMMARY');

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

        function createPerformanceDataLoadedHandler(activeSelection, token) {
            const selectionKey = activeSelection;
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
                hydrateVisibleGoalMetricRows(contentDiv, fetchedGoalIds);
            };
        }

        function renderView(value, { scrollToTop = false, useCacheOnly = false } = {}) {
            performanceRefreshToken += 1;
            const refreshToken = performanceRefreshToken;
            ViewPipeline.render({
                contentDiv,
                selection: value,
                mergedInvestmentDataState,
                projectedInvestmentsState: state.projectedInvestments,
                cleanupCallbacks,
                onBucketSelect,
                onPerformanceDataLoaded: createPerformanceDataLoadedHandler(value, refreshToken),
                useCacheOnly
            });
            const isBucketView = value !== 'SUMMARY';
            modeToggle.classList.toggle('gpv-mode-toggle--hidden', !isBucketView);
            if (isBucketView) {
                applyBucketMode(currentBucketMode);
            } else {
                contentDiv.classList.remove('gpv-mode-allocation', 'gpv-mode-performance');
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

        const unsubscribeOverlayUpdates = subscribeDataUpdates(() => {
            if (!overlay.isConnected) {
                return;
            }
            const refreshedReadiness = getEndowusReadinessState();
            if (!refreshedReadiness.ready) {
                showOverlay();
                return;
            }
            mergedInvestmentDataState = refreshedReadiness.mergedInvestmentDataState;
            const selectedValue = select.value;
            refreshBucketSelectOptions(selectedValue);
            renderView(select.value);
        });
        cleanupCallbacks.push(unsubscribeOverlayUpdates);

        function collectEndowusGoalRows() {
            const bucketRows = Object.keys(mergedInvestmentDataState || {}).sort().flatMap(bucketName => {
                const bucketObj = mergedInvestmentDataState[bucketName];
                if (!bucketObj || typeof bucketObj !== 'object') {
                    return [];
                }
                return Object.keys(bucketObj)
                    .filter(goalType => goalType !== '_meta')
                    .flatMap(goalType => {
                        const goals = Array.isArray(bucketObj[goalType]?.goals) ? bucketObj[goalType].goals : [];
                        return goals.map(goal => ({
                            goalId: utils.normalizeString(goal?.goalId, ''),
                            goalName: utils.normalizeString(goal?.goalName, ''),
                            currentBucket: bucketName
                        }));
                    })
                    .filter(row => row.goalId && row.goalName);
            });
            return bucketRows.sort((left, right) => left.goalName.localeCompare(right.goalName));
        }

        function renderBucketManagerPanelHtml() {
            const goalRows = collectEndowusGoalRows();
            if (!goalRows.length) {
                return `
                    <div class="gpv-bucket-manager">
                        <h3 class="gpv-bucket-manager-title">Bucket Manager</h3>
                        <p class="gpv-bucket-manager-empty">No goals available to assign.</p>
                    </div>
                `;
            }
            const rowsHtml = goalRows.map(row => `
                <tr>
                    <td class="gpv-bucket-manager-goal">${escapeHtml(row.goalName)}</td>
                    <td>
                        <input
                            type="text"
                            class="gpv-target-input gpv-bucket-manager-input"
                            data-goal-id="${escapeHtml(row.goalId)}"
                            data-goal-name="${escapeHtml(row.goalName)}"
                            value="${escapeHtml(row.currentBucket)}"
                            placeholder="Uncategorized"
                            aria-label="Bucket name for ${escapeHtml(row.goalName)}"
                        />
                    </td>
                </tr>
            `).join('');
            return `
                <div class="gpv-bucket-manager">
                    <h3 class="gpv-bucket-manager-title">Bucket Manager</h3>
                    <p class="gpv-bucket-manager-copy">Manage Endowus bucket assignments directly. Existing goals are seeded from naming and can be adjusted here without renaming goals.</p>
                    <table class="gpv-table gpv-bucket-manager-table">
                        <thead>
                            <tr>
                                <th>Goal</th>
                                <th>Bucket</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            `;
        }

        function setupBucketManagerListeners(root) {
            if (!root) {
                return;
            }
            const inputs = Array.from(root.querySelectorAll('.gpv-bucket-manager-input'));
            inputs.forEach(input => {
                const goalId = utils.normalizeString(input.dataset.goalId, '');
                if (!goalId) {
                    return;
                }
                const commit = () => {
                    const derivedBucket = utils.extractBucketName(utils.normalizeString(input.dataset.goalName, ''));
                    const fallbackBucket = derivedBucket || 'Uncategorized';
                    const previousDisplayedBucket = utils.normalizeString(input.defaultValue, '') || fallbackBucket;
                    const nextBucket = utils.normalizeString(input.value, '');
                    if (!nextBucket) {
                        GoalTargetStore.clearBucket(goalId);
                        input.value = fallbackBucket;
                        input.defaultValue = input.value;
                        return;
                    }
                    if (nextBucket === previousDisplayedBucket) {
                        input.value = previousDisplayedBucket;
                        return;
                    }
                    GoalTargetStore.setBucket(goalId, nextBucket);
                    input.value = nextBucket;
                    input.defaultValue = nextBucket;
                };
                input.addEventListener('blur', commit);
                input.addEventListener('keydown', event => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        commit();
                        input.blur();
                    }
                });
            });
        }

        bucketManageBtn.addEventListener('click', () => {
            const managerView = renderSyncOverlayView({
                title: 'Bucket Manager',
                bodyHtml: renderBucketManagerPanelHtml(),
                onBack: () => showOverlay(),
                backLabel: '← Back to Portfolio Viewer'
            });
            setupBucketManagerListeners(managerView?.body);
        });

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
        const href = window.location.href;
        const origin = window.location.origin;
        return isDashboardRoute(href, origin)
            || isFsmInvestmentsRoute(href, origin)
            || isOcbcPortfolioHoldingsRoute(href, origin);
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
        if (typeof window === 'undefined' || !window || typeof document === 'undefined') {
            return;
        }
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

        let intervalId = null;
        let stableChecks = 0;
        const maxStableChecks = 10;
        const pollingIntervalMs = 1000;
        intervalId = window.setInterval(() => {
            if (typeof window === 'undefined' || !window || typeof document === 'undefined') {
                if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                }
                return;
            }
            const beforeUrl = state.ui.lastUrl;
            handleUrlChange();
            if (state.ui.lastUrl === beforeUrl) {
                stableChecks += 1;
            } else {
                stableChecks = 0;
            }
            if (stableChecks >= maxStableChecks && intervalId) {
                window.clearInterval(intervalId);
                intervalId = null;
            }
        }, pollingIntervalMs);
        if (intervalId && typeof intervalId.unref === 'function') {
            intervalId.unref();
        }

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
            if (intervalId) {
                window.clearInterval(intervalId);
                intervalId = null;
            }
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
            init,
            buildBalanceCopyControls,
            isEndowusAuthContext,
            listCookieByQuery,
            buildPerformanceRequestHeaders
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
            getFsmHoldingIdentity,
            formatFsmHoldingIdentity,
            getDisplayGoalType,
            sortGoalTypes,
            formatMoney,
            formatPercent,
            formatProfitDisplay,
            formatFsmProfitDisplay,
            getFsmProfitClass,
            formatGrowthPercentFromEndingBalance,
            getReturnClass,
            calculateAllocationRatio,
            calculateAllocationDrift,
            calculatePercentOfType,
            calculateGoalDiff,
            isDashboardRoute,
            isFsmInvestmentsRoute,
            isOcbcDashboardRoute,
            isOcbcPortfolioHoldingsRoute,
            normalizeOcbcHoldingsPayload,
            calculateFixedTargetPercent,
            calculateRemainingTargetPercent,
            isRemainingTargetAboveThreshold,
            buildAllocationDriftModel,
            buildGoalTypeAllocationModel,
            getProjectedInvestmentValue,
            buildDiffCellData,
            sortGoalsByName,
            buildGoalBalancesTsvRow,
            buildBalanceCopyControls: testingHooks?.buildBalanceCopyControls,
            resolveGoalTypeActionTarget,
            buildSummaryViewModel,
            buildBucketDetailViewModel,
            buildHealthStatus,
            buildAttentionDriftReason,
            buildPlanningTradeLines,
            buildPlanningRecommendations,
            buildPlanningModel,
            buildBucketPlanningModel,
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
            hydrateVisibleGoalMetricRows,
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
            createConflictDialogHTML: syncUiExports?.createConflictDialogHTML,
            buildConflictDiffItems: buildConflictDiffItemsForMap,
            buildConflictDiffSections,
            buildFsmConflictDiffItems,
            formatSyncTarget,
            formatSyncFixed,
            injectStyles: testingHooks?.injectStyles,
            showOverlay: testingHooks?.showOverlay,
            startUrlMonitoring: testingHooks?.startUrlMonitoring,
            init: testingHooks?.init,
            isEndowusAuthContext: testingHooks?.isEndowusAuthContext,
            listCookieByQuery: testingHooks?.listCookieByQuery,
            buildPerformanceRequestHeaders: testingHooks?.buildPerformanceRequestHeaders
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
