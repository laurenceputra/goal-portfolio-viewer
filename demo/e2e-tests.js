/**
 * E2E smoke and regression tests for the demo dashboard.
 *
 * Usage:
 *   node demo/e2e-tests.js
 *
 * Modes:
 *   E2E_MODE=smoke (default)
 *   E2E_MODE=regression
 *   E2E_MODE=update-baseline
 */

const fs = require('fs');
const path = require('path');
const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');
const { startDemoServer } = require('./mock-server');

const DEFAULT_PORT = 8765;
const E2E_MODE = process.env.E2E_MODE || 'smoke';
const MODE = ['smoke', 'regression', 'update-baseline'].includes(E2E_MODE)
    ? E2E_MODE
    : 'smoke';
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const DEFAULT_DIFF_THRESHOLD = Number.parseFloat(process.env.E2E_DIFF_THRESHOLD || '0.001');
const REGRESSION_DIR = path.join(__dirname, 'regression');
const REGRESSION_BASELINE_DIR = path.join(REGRESSION_DIR, 'baseline');
const REGRESSION_ACTUAL_DIR = path.join(REGRESSION_DIR, 'actual');
const REGRESSION_DIFF_DIR = path.join(REGRESSION_DIR, 'diff');

function assertCondition(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function readPng(filePath) {
    const data = fs.readFileSync(filePath);
    return PNG.sync.read(data);
}

function writePng(filePath, png) {
    const buffer = PNG.sync.write(png);
    fs.writeFileSync(filePath, buffer);
}

function comparePngs({ baselinePath, actualPath, diffPath }) {
    const baseline = readPng(baselinePath);
    const actual = readPng(actualPath);
    const width = Math.max(baseline.width, actual.width);
    const height = Math.max(baseline.height, actual.height);

    const baselineCanvas = new PNG({ width, height });
    const actualCanvas = new PNG({ width, height });
    PNG.bitblt(baseline, baselineCanvas, 0, 0, baseline.width, baseline.height, 0, 0);
    PNG.bitblt(actual, actualCanvas, 0, 0, actual.width, actual.height, 0, 0);

    const diff = new PNG({ width, height });
    const mismatch = pixelmatch(
        baselineCanvas.data,
        actualCanvas.data,
        diff.data,
        width,
        height,
        { threshold: 0.1 }
    );
    writePng(diffPath, diff);
    return {
        mismatchPixels: mismatch,
        mismatchRatio: width * height === 0 ? 0 : mismatch / (width * height)
    };
}

function normalizeName(name) {
    return name.replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase();
}

function buildPaths(flowName) {
    const normalizedFlow = normalizeName(flowName);
    const relative = `${normalizedFlow}.png`;
    return {
        relative,
        baseline: path.join(REGRESSION_BASELINE_DIR, relative),
        actual: path.join(REGRESSION_ACTUAL_DIR, relative),
        diff: path.join(REGRESSION_DIFF_DIR, relative)
    };
}

function buildSummaryPaths(outputDir) {
    const summaryPath = process.env.E2E_SUMMARY_PATH
        ? path.resolve(process.env.E2E_SUMMARY_PATH)
        : path.join(outputDir, 'e2e-summary.json');
    return { summaryPath };
}

async function runE2ETests() {
    let playwright;
    try {
        playwright = require('playwright');
    } catch (error) {
        console.error('Playwright is required for E2E tests.');
        throw error;
    }

    const demoUrl = `http://localhost:${DEFAULT_PORT}/dashboard/`;
    const outputDir = process.env.E2E_SCREENSHOT_DIR
        ? path.resolve(process.env.E2E_SCREENSHOT_DIR)
        : path.join(__dirname, 'screenshots');
    const { summaryPath } = buildSummaryPaths(outputDir);

    const summary = {
        mode: MODE,
        status: 'passed',
        flowsTested: [],
        screenshots: [],
        assertions: {},
        diffs: []
    };

    let server;
    let browser;

    ensureDir(outputDir);
    if (MODE !== 'smoke') {
        ensureDir(REGRESSION_DIR);
        ensureDir(REGRESSION_BASELINE_DIR);
        ensureDir(REGRESSION_ACTUAL_DIR);
        ensureDir(REGRESSION_DIFF_DIR);
    }

    try {
        server = await startDemoServer({ port: DEFAULT_PORT });
        browser = await playwright.chromium.launch({ headless: true });
        const context = await browser.newContext({
            viewport: DEFAULT_VIEWPORT,
            locale: 'en-SG',
            timezoneId: 'Asia/Singapore'
        });
        await context.addInitScript({
            content: `(() => {
                const style = document.createElement('style');
                style.setAttribute('data-e2e-disable-animations', 'true');
                style.textContent = '*{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important;}';
                document.documentElement.appendChild(style);
            })();`
        });

        const page = await context.newPage();
        await page.goto(demoUrl, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.__GPV_E2E_READY__ === true, null, { timeout: 20000 });

        const trigger = await page.$('.gpv-trigger-btn');
        assertCondition(trigger, 'Expected Portfolio Viewer trigger button to exist.');

        await page.click('.gpv-trigger-btn');
        await page.waitForSelector('.gpv-overlay', { timeout: 5000 });

        const summaryHeader = await page.$('.gpv-header');
        assertCondition(summaryHeader, 'Expected summary header to render.');

        await captureScreenshot(page, summary, outputDir, 'summary');
        recordAssertion(summary, 'summary', 'summary-header', true, 'Summary header rendered.');

        const options = await page.$$eval('select.gpv-select option', opts =>
            opts.map(opt => opt.textContent)
        );
        const hasHouse = options.some(text => text.includes('House Purchase'));
        const hasRetirement = options.some(text => text.includes('Retirement'));
        assertCondition(hasHouse, 'Expected House Purchase option.');
        assertCondition(hasRetirement, 'Expected Retirement option.');
        recordAssertion(summary, 'summary', 'bucket-options', hasHouse && hasRetirement, 'Found bucket options.');

        await openBucket(page, 'House Purchase');
        await page.waitForSelector('.gpv-content .gpv-fixed-toggle-input', { state: 'attached', timeout: 5000 });
        const fixedRow = await page.$('.gpv-content .gpv-fixed-toggle-input');
        assertCondition(fixedRow, 'Expected fixed toggle input to render in House Purchase view.');
        const isFixedChecked = await page.$eval(
            '.gpv-content .gpv-fixed-toggle-input',
            input => input instanceof HTMLInputElement && input.checked === true
        );
        if (!isFixedChecked) {
            await page.click('.gpv-content .gpv-fixed-toggle');
        }
        await page.waitForFunction(
            () => {
                const fixedInput = document.querySelector('.gpv-content .gpv-fixed-toggle-input');
                return fixedInput instanceof HTMLInputElement && fixedInput.checked === true;
            },
            null,
            { timeout: 5000 }
        );
    recordAssertion(summary, 'house-purchase', 'fixed-toggle', true, 'Fixed toggle enabled.');
        await captureScreenshot(page, summary, outputDir, 'house-purchase');

        await openBucket(page, 'Retirement');
    recordAssertion(summary, 'retirement', 'detail-title', true, 'Retirement detail loaded.');
        await captureScreenshot(page, summary, outputDir, 'retirement');

        await captureSyncScreens(page, outputDir, summary);

        await captureFsmFlow(page, summary, outputDir);
        await captureOcbcFlow(page, summary, outputDir);
    } catch (error) {
        summary.status = 'failed';
        summary.error = error instanceof Error ? error.message : String(error);
        throw error;
    } finally {
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
        if (browser) {
            await browser.close();
        }
        if (server) {
            server.close();
        }
    }

    await finalizeSummary(summary);
}

if (require.main === module) {
    runE2ETests()
        .then(() => {
            console.log('E2E demo tests completed successfully.');
        })
        .catch(error => {
            console.error('E2E demo tests failed:', error);
            process.exit(1);
        });
}

module.exports = {
    runE2ETests
};

async function openBucket(page, bucketName) {
    await page.selectOption('select.gpv-select', bucketName);
    await page.waitForFunction(
        name => {
            const title = document.querySelector('.gpv-detail-title');
            return title && title.textContent && title.textContent.includes(name);
        },
        bucketName,
        { timeout: 5000 }
    );
    await waitForBucketViewStability(page);
}

async function waitForBucketViewStability(page, { timeout = 7000, idleMs = 250 } = {}) {
    await page.waitForLoadState('networkidle', { timeout }).catch(() => undefined);
    await page.waitForFunction(() => {
        const root = document.querySelector('#gpv-overlay .gpv-content');
        if (!root) {
            return false;
        }
        const loadingNodes = Array.from(root.querySelectorAll('.gpv-performance-loading'));
        return loadingNodes.every(node => {
            const text = (node.textContent || '').trim();
            return !/^Loading performance data/i.test(text);
        });
    }, null, { timeout });
    await page.evaluate(quietMs => {
        return new Promise(resolve => {
            const root = document.querySelector('#gpv-overlay .gpv-content');
            if (!root) {
                resolve();
                return;
            }
            let settleTimer = null;
            const observer = new MutationObserver(() => {
                if (settleTimer) {
                    clearTimeout(settleTimer);
                }
                settleTimer = setTimeout(() => {
                    observer.disconnect();
                    resolve();
                }, quietMs);
            });
            observer.observe(root, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true
            });
            settleTimer = setTimeout(() => {
                observer.disconnect();
                resolve();
            }, quietMs);
        });
    }, idleMs);
}

async function clickButtonByRole(page, name, { timeout = 5000, retries = 1 } = {}) {
    let attempt = 0;
    while (attempt <= retries) {
        try {
            const button = page.getByRole('button', { name }).first();
            await button.waitFor({ state: 'visible', timeout });
            await button.click({ timeout });
            return;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const detached = message.includes('not attached to the DOM');
            if (!detached || attempt === retries) {
                throw error;
            }
            attempt += 1;
            await page.waitForTimeout(50);
        }
    }
}

async function captureScreenshot(page, summary, outputDir, flowName) {
    const normalizedFlowName = normalizeName(flowName);
    const screenshotName = `e2e-${normalizedFlowName}.png`;
    const screenshotPath = path.join(outputDir, screenshotName);
    await page.waitForFunction(
        () => !document.fonts || document.fonts.status === 'loaded',
        null,
        { timeout: 5000 }
    ).catch(() => undefined);
    await page.evaluate(() => new Promise(resolve => {
        const schedule = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : callback => setTimeout(callback, 0);
        schedule(() => schedule(resolve));
    }));
    const overlayContainer = page.locator('#gpv-overlay .gpv-container').first();
    if (await overlayContainer.count() > 0) {
        await overlayContainer.screenshot({ path: screenshotPath });
    } else {
        await page.screenshot({ path: screenshotPath, fullPage: false });
    }

    if (!summary.flowsTested.includes(flowName)) {
        summary.flowsTested.push(flowName);
    }
    summary.screenshots.push(screenshotName);

    if (MODE === 'smoke') {
        return;
    }

    const paths = buildPaths(flowName);
    fs.copyFileSync(screenshotPath, paths.actual);

    if (MODE === 'update-baseline') {
        ensureDir(REGRESSION_BASELINE_DIR);
        fs.copyFileSync(paths.actual, paths.baseline);
        summary.diffs.push({ flow: flowName, screenshot: paths.relative, status: 'baseline-updated' });
        return;
    }

    if (!fs.existsSync(paths.baseline)) {
        summary.diffs.push({ flow: flowName, screenshot: paths.relative, status: 'baseline-missing' });
        summary.status = 'failed';
        return;
    }

    const diffResult = comparePngs({
        baselinePath: paths.baseline,
        actualPath: paths.actual,
        diffPath: paths.diff
    });

    const pass = diffResult.mismatchRatio <= DEFAULT_DIFF_THRESHOLD;
    summary.diffs.push({
        flow: flowName,
        screenshot: paths.relative,
        status: pass ? 'passed' : 'failed',
        mismatchPixels: diffResult.mismatchPixels,
        mismatchRatio: diffResult.mismatchRatio,
        threshold: DEFAULT_DIFF_THRESHOLD
    });
    if (!pass) {
        summary.status = 'failed';
    }
}

function recordAssertion(summary, flowName, assertionName, passed, message) {
    if (!summary.assertions[flowName]) {
        summary.assertions[flowName] = [];
    }
    summary.assertions[flowName].push({ name: assertionName, passed, message });
    if (!passed) {
        summary.status = 'failed';
    }
}

async function finalizeSummary(summary) {
    if (summary.status !== 'failed') {
        return;
    }

    const failingAssertions = Object.entries(summary.assertions || {}).flatMap(([flow, items]) =>
        (Array.isArray(items) ? items : [])
            .filter(item => item && item.passed === false)
            .map(item => `${flow}:${item.name}`)
    );
    const failingDiffs = (Array.isArray(summary.diffs) ? summary.diffs : [])
        .filter(diff => diff?.status === 'failed' || diff?.status === 'baseline-missing')
        .map(diff => `${diff.flow}:${diff.status}`);
    const failures = [...failingAssertions, ...failingDiffs];
    throw new Error(`E2E regression recorded failures: ${failures.join(', ') || 'unknown failure'}`);
}

async function captureSyncScreens(page, outputDir, summary) {
    const syncButtons = page.locator('.gpv-header-buttons .gpv-sync-btn').filter({ hasText: /sync/i });
    const syncCount = await syncButtons.count();
    assertCondition(syncCount > 0, 'Expected a Sync button in overlay header.');
    await syncButtons.first().click();
    await page.waitForSelector('.gpv-sync-settings', { timeout: 5000 });

    await page.waitForFunction(() => {
        const root = document.querySelector('.gpv-sync-settings');
        if (!root) {
            return false;
        }
        const required = ['gpv-sync-status-bar', 'gpv-sync-actions', 'gpv-sync-form'];
        return required.every(token => root.querySelector(`.${token}`));
    }, null, { timeout: 5000 });

    recordAssertion(summary, 'sync-unconfigured', 'sync-settings', true, 'Sync settings rendered.');
    await captureScreenshot(page, summary, outputDir, 'sync-unconfigured');

    await page.evaluate(() => {
        const advanced = document.querySelector('.gpv-sync-advanced');
        if (advanced) {
            advanced.open = true;
        }
    });

    await page.waitForFunction(() => {
        const root = document.querySelector('.gpv-sync-settings');
        if (!root) {
            return false;
        }
        const advanced = root.querySelector('.gpv-sync-advanced');
        if (!advanced) {
            return false;
        }
        if (advanced.open !== true) {
            return false;
        }
        const syncNow = root.querySelector('#gpv-sync-now-btn');
        return Boolean(syncNow);
    }, null, { timeout: 5000 });

    recordAssertion(summary, 'sync-configured', 'sync-actions', true, 'Sync actions rendered.');
    await captureScreenshot(page, summary, outputDir, 'sync-configured');

    await page.evaluate(() => {
        const overlay = document.getElementById('gpv-overlay');
        if (overlay) {
            overlay.remove();
        }
    });

    const conflict = {
        local: {
            goalTargets: { goal_1: 10 },
            goalFixed: {},
            platforms: {
                fsm: {
                    portfolios: [{ id: 'demo-fsm-1', name: 'Core Portfolio' }],
                    assignmentByCode: { ESG001: 'demo-fsm-1' }
                }
            }
        },
        remote: {
            goalTargets: { goal_1: 20 },
            goalFixed: {},
            platforms: {
                fsm: {
                    portfolios: [{ id: 'demo-fsm-2', name: 'Growth Portfolio' }],
                    assignmentByCode: { ESG001: 'demo-fsm-2' }
                }
            }
        },
        localHash: 'local-hash',
        remoteHash: 'remote-hash',
        localTimestamp: 1700000000000,
        remoteTimestamp: 1700000005000
    };

    await page.evaluate(conflictPayload => {
        const conflictHtml = window.__gpvSyncUi?.createConflictDialogHTML
            ? window.__gpvSyncUi.createConflictDialogHTML(conflictPayload)
            : null;
        if (!conflictHtml) {
            throw new Error('Conflict dialog renderer not available for E2E.');
        }
        const overlay = document.createElement('div');
        overlay.id = 'gpv-overlay';
        overlay.className = 'gpv-overlay gpv-conflict-overlay';
        const container = document.createElement('div');
        container.className = 'gpv-container gpv-conflict-modal';
        container.innerHTML = conflictHtml;
        overlay.appendChild(container);
        document.body.appendChild(overlay);
    }, conflict);

    await page.waitForSelector('.gpv-conflict-dialog', { timeout: 5000 });
    await page.waitForFunction(() => {
        const dialog = document.querySelector('.gpv-conflict-dialog');
        if (!dialog) {
            return false;
        }
        const required = ['gpv-conflict-stepper', 'gpv-conflict-actions', 'gpv-conflict-step-panel'];
        return required.every(token => dialog.querySelector(`.${token}`));
    }, null, { timeout: 5000 });

    recordAssertion(summary, 'sync-conflict', 'conflict-dialog', true, 'Conflict dialog rendered.');
    await captureScreenshot(page, summary, outputDir, 'sync-conflict');
}

async function captureFsmFlow(page, summary, outputDir) {
    const WHAT_IF_SPLIT_TOKEN = /what-if split/i;
    const PROJECTED_OUTPUT_PATTERN = /projected investment\s*:/i;
    const CURRENCY_AMOUNT_PATTERN = /(SGD|\$)\s*[\d,]+(?:\.\d{2})?/i;

    const fsmUrl = `http://localhost:${DEFAULT_PORT}/fsmone/holdings/investments`;
    await page.goto(fsmUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__GPV_E2E_READY__ === true, null, { timeout: 20000 });
    await page.click('.gpv-trigger-btn');
    await page.waitForSelector('.gpv-overlay', { timeout: 5000 });

    await page.waitForSelector('.gpv-fsm-toolbar', { timeout: 5000 });
    recordAssertion(summary, 'fsm-overlay', 'toolbar', true, 'FSM toolbar rendered.');
    await captureScreenshot(page, summary, outputDir, 'fsm-overlay');

    await clickButtonByRole(page, /view all holdings/i);
    await page.waitForSelector('.gpv-fsm-table-wrap .gpv-table', { timeout: 5000 });
    await page.waitForSelector('.gpv-fsm-filter-toolbar', { timeout: 5000 });

    const managerToggle = page.getByRole('button', { name: /manage portfolios|hide portfolio manager/i }).first();
    if (await managerToggle.count() > 0) {
        await clickButtonByRole(page, /manage portfolios|hide portfolio manager/i);
        await page.waitForSelector('.gpv-fsm-manager', { timeout: 5000 });
        recordAssertion(summary, 'fsm-manager', 'manager-panel', true, 'FSM manager panel rendered.');
        await captureScreenshot(page, summary, outputDir, 'fsm-manager');
        await clickButtonByRole(page, /hide portfolio manager/i);
        await page.waitForSelector('.gpv-fsm-manager', { state: 'detached', timeout: 5000 });
    }

    const summaryCards = await page.$$eval('.gpv-summary-row .gpv-summary-card', nodes => nodes.length);
    recordAssertion(summary, 'fsm-overlay', 'summary-cards', summaryCards >= 4, 'FSM summary cards present.');
    if (summaryCards < 4) {
        summary.status = 'failed';
    }

    const tableHeaders = await page.$$eval(
        '.gpv-fsm-table-wrap .gpv-table thead th',
        nodes => nodes.map(node => node.textContent || '').map(text => text.trim())
    );
    const hasCoreHeaders = tableHeaders.includes('Ticker')
        && tableHeaders.includes('Current %')
        && tableHeaders.includes('Target %')
        && tableHeaders.includes('Portfolio');
    const hasTableHeaders = hasCoreHeaders;
    recordAssertion(summary, 'fsm-overlay', 'table-headers', hasTableHeaders, 'FSM table headers present.');
    if (!hasTableHeaders) {
        summary.status = 'failed';
    }

    const allScopeProjectionAbsent = await page.$('.gpv-projected-input') === null;
    const allScopeOverlayText = await page.$eval('.gpv-overlay', node => node.textContent || '');
    const allScopePromptAbsent = !WHAT_IF_SPLIT_TOKEN.test(allScopeOverlayText);
    const allScopeProjectedInvestmentAbsent = !PROJECTED_OUTPUT_PATTERN.test(allScopeOverlayText);
    const noAllScopeProjection = allScopeProjectionAbsent
        && allScopePromptAbsent
        && allScopeProjectedInvestmentAbsent;
    recordAssertion(
        summary,
        'fsm-overlay',
        'no-all-scope-projection',
        noAllScopeProjection,
        'All scope does not render projected investment controls or copy.'
    );
    if (!noAllScopeProjection) {
        summary.status = 'failed';
    }

    await page.waitForFunction(
        () => typeof window.GM_setValue === 'function',
        null,
        { timeout: 5000 }
    );

    await page.evaluate(async () => {
        const growthId = 'ESG003|sub:ESG3';
        if (typeof window.GM_setValue !== 'function') {
            throw new Error('Demo bridge missing: window.GM_setValue is not available');
        }
        const key = `fsm_target_pct_${growthId}`;
        await Promise.resolve(window.GM_setValue(key, 64.5));
        if (typeof window.GM_getValue === 'function') {
            const storedValue = await Promise.resolve(window.GM_getValue(key));
            if (storedValue !== 64.5) {
                throw new Error(`Demo bridge verification failed for ${key}: expected 64.5, received ${String(storedValue)}`);
            }
        }
    });
    await page.selectOption('.gpv-fsm-filter-toolbar select.gpv-select', 'demo-fsm-core');
    await page.waitForSelector('.gpv-projected-input', { timeout: 5000 });
    await page.waitForFunction(() => {
        const scopeSelect = document.querySelector('.gpv-fsm-filter-toolbar select.gpv-select');
        const projectedInput = document.querySelector('.gpv-projected-input');
        const overlay = document.querySelector('.gpv-overlay');
        const text = overlay && overlay.textContent ? overlay.textContent : '';
        return Boolean(
            scopeSelect instanceof HTMLSelectElement
            && scopeSelect.value === 'demo-fsm-core'
            && projectedInput
            && /what-if split/i.test(text)
        );
    }, null, { timeout: 5000 });
    const preAmountCoreState = await page.evaluate(() => {
        const scopeSelect = document.querySelector('.gpv-fsm-filter-toolbar select.gpv-select');
        const projectedInput = document.querySelector('.gpv-projected-input');
        const overlay = document.querySelector('.gpv-overlay');
        const text = overlay && overlay.textContent ? overlay.textContent : '';
        return {
            coreScopeSelected: scopeSelect instanceof HTMLSelectElement && scopeSelect.value === 'demo-fsm-core',
            hasProjectionInput: Boolean(projectedInput),
            hasWhatIfPrompt: /what-if split/i.test(text)
        };
    });

    const projectionInput = page.locator('.gpv-projected-input').first();
    await projectionInput.click();
    await projectionInput.fill('1000');

    await page.waitForFunction(() => {
        const overlay = document.querySelector('.gpv-overlay');
        const input = document.querySelector('.gpv-projected-input');
        const inputHasProjectedAmount = input instanceof HTMLInputElement && input.value.replace(/,/g, '') === '1000';
        const overlayText = overlay && overlay.textContent ? overlay.textContent : '';
        const hasProjectedOutput = Boolean(
            overlay
            && /projected investment\s*:/i.test(overlayText)
            && /(SGD|\$)\s*[\d,]+(?:\.\d{2})?/i.test(overlayText)
        );
        const scenarioSplitCount = overlay
            ? overlay.querySelectorAll('.gpv-planning-list .gpv-planning-item').length
            : 0;
        return inputHasProjectedAmount && hasProjectedOutput && scenarioSplitCount > 0;
    }, null, { timeout: 5000 });

    const projectionOverlayText = await page.$eval('.gpv-overlay', node => node.textContent || '');
    const hasProjectionOutput = PROJECTED_OUTPUT_PATTERN.test(projectionOverlayText)
        && CURRENCY_AMOUNT_PATTERN.test(projectionOverlayText);
    const scenarioSplitCount = await page.$$eval('.gpv-planning-list .gpv-planning-item', items => items.length);
    await page.waitForFunction(() => {
        const input = document.querySelector('.gpv-projected-input');
        return input instanceof HTMLInputElement && input === document.activeElement;
    }, null, { timeout: 5000 });
    const projectionInputFocused = await page.$eval('.gpv-projected-input', input => input === document.activeElement);

    const projectionOutputReady = preAmountCoreState.hasProjectionInput
        && preAmountCoreState.coreScopeSelected
        && preAmountCoreState.hasWhatIfPrompt
        && hasProjectionOutput
        && scenarioSplitCount > 0
        && projectionInputFocused;
    recordAssertion(
        summary,
        'fsm-projection',
        'projection-output',
        projectionOutputReady,
        'Core Portfolio projection input updates what-if split and retains focus.'
    );
    if (!projectionOutputReady) {
        summary.status = 'failed';
    }
    await captureScreenshot(page, summary, outputDir, 'fsm-projection');

    const conflict = {
        local: {
            goalTargets: { goal_1: 10 },
            goalFixed: {},
            platforms: {
                fsm: {
                    portfolios: [{ id: 'demo-fsm-1', name: 'Core Portfolio' }],
                    assignmentByCode: { ESG001: 'demo-fsm-1' }
                }
            }
        },
        remote: {
            goalTargets: { goal_1: 20 },
            goalFixed: {},
            platforms: {
                fsm: {
                    portfolios: [{ id: 'demo-fsm-2', name: 'Growth Portfolio' }],
                    assignmentByCode: { ESG001: 'demo-fsm-2' }
                }
            }
        },
        localHash: 'local-hash',
        remoteHash: 'remote-hash',
        localTimestamp: 1700000000000,
        remoteTimestamp: 1700000005000
    };

    await page.evaluate(conflictPayload => {
        const conflictHtml = window.__gpvSyncUi?.createConflictDialogHTML
            ? window.__gpvSyncUi.createConflictDialogHTML(conflictPayload)
            : null;
        if (!conflictHtml) {
            throw new Error('Conflict dialog renderer not available for FSM E2E.');
        }
        const overlay = document.getElementById('gpv-overlay');
        if (overlay) {
            overlay.remove();
        }
        const newOverlay = document.createElement('div');
        newOverlay.id = 'gpv-overlay';
        newOverlay.className = 'gpv-overlay gpv-conflict-overlay';
        const container = document.createElement('div');
        container.className = 'gpv-container gpv-conflict-modal';
        container.innerHTML = conflictHtml;
        newOverlay.appendChild(container);
        document.body.appendChild(newOverlay);
    }, conflict);

    await page.waitForSelector('.gpv-conflict-dialog', { timeout: 5000 });
    const fsmDiffCount = await page.$eval('.gpv-conflict-details', list => {
        const item = Array.from(list.querySelectorAll('li')).find(li => li.textContent && li.textContent.includes('FSM differences'));
        if (!item) {
            return 0;
        }
        const match = item.textContent.match(/FSM differences:\s*(\d+)/);
        return match ? Number(match[1]) : 0;
    });
    recordAssertion(summary, 'fsm-conflict', 'fsm-diff-count', fsmDiffCount > 0, 'FSM conflict diff rows present.');
    if (fsmDiffCount <= 0) {
        summary.status = 'failed';
    }
    await captureScreenshot(page, summary, outputDir, 'fsm-conflict');
}

async function captureOcbcFlow(page, summary, outputDir) {
    const ocbcFlowName = 'ocbc-overlay';
    if (!summary.flowsTested.includes(ocbcFlowName)) {
        summary.flowsTested.push(ocbcFlowName);
    }

    const ocbcUrl = `http://localhost:${DEFAULT_PORT}/internet-banking/digital/web/sg/cfo/investment-accounts/portfolio-holdings?menuId=e2e-ocbc`;
    await page.goto(ocbcUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__GPV_E2E_READY__ === true, null, { timeout: 20000 });

    await page.click('.gpv-trigger-btn');
    await page.waitForSelector('.gpv-overlay', { timeout: 5000 });

    const overlayTextAssets = await page.$eval('.gpv-overlay', node => node.textContent || '');
    const titleText = await page.$eval('.gpv-overlay', root => {
        const titleNode = root.querySelector('.gpv-title, .gpv-header h2, .gpv-header');
        return titleNode ? (titleNode.textContent || '') : '';
    });
    const hasOcbcTitle = /Portfolio Viewer\s*\(OCBC\)/i.test(titleText);
    recordAssertion(summary, ocbcFlowName, 'title-contains-ocbc', hasOcbcTitle, 'Overlay title contains Portfolio Viewer (OCBC).');

    const hasPortfolioLabelA = overlayTextAssets.includes('Portfolio 6500142646-2');
    recordAssertion(summary, ocbcFlowName, 'assets-has-portfolio-1', hasPortfolioLabelA, 'Assets portfolio view contains Portfolio 6500142646-2.');

    const hasPortfolioLabelB = overlayTextAssets.includes('Portfolio 6500142647-2');
    recordAssertion(summary, ocbcFlowName, 'assets-has-portfolio-2', hasPortfolioLabelB, 'Assets portfolio view contains Portfolio 6500142647-2.');

    const hasIdentifierColumn = overlayTextAssets.includes('Identifier');
    recordAssertion(summary, ocbcFlowName, 'assets-has-identifier-column', hasIdentifierColumn, 'Assets portfolio view contains Identifier column.');

    const hasAssetName = overlayTextAssets.includes('OCBC Global Equity Opportunities Fund');
    recordAssertion(summary, ocbcFlowName, 'assets-has-fund-name', hasAssetName, 'Assets view contains OCBC Global Equity Opportunities Fund.');

    const hasAssetClass = overlayTextAssets.includes('Equity Funds') && overlayTextAssets.includes('Structured Products');
    recordAssertion(summary, ocbcFlowName, 'assets-has-sub-asset-classes', hasAssetClass, 'Assets view contains Equity Funds and Structured Products.');

    const hasReferenceAmount = /16,758\.20/.test(overlayTextAssets);
    recordAssertion(summary, ocbcFlowName, 'assets-has-reference-amount', hasReferenceAmount, 'Assets view contains 16,758.20 reference amount.');

    const excludesLiabilityByDefault = !overlayTextAssets.includes('OCBC Investment Credit Line');
    recordAssertion(summary, ocbcFlowName, 'assets-excludes-liability', excludesLiabilityByDefault, 'Assets view does not contain OCBC Investment Credit Line.');

    await captureScreenshot(page, summary, outputDir, 'ocbc-assets');

    const isViewLabelAssociated = await page.$eval('.gpv-overlay', root => {
        const labels = Array.from(root.querySelectorAll('label'));
        const target = labels.find(label => (label.textContent || '').trim() === 'View:');
        return Boolean(target && target.getAttribute('for') === 'gpv-ocbc-view-select');
    });
    recordAssertion(summary, ocbcFlowName, 'view-label-associated', isViewLabelAssociated, 'View label is associated with gpv-ocbc-view-select.');

    const isModeLabelAssociated = await page.$eval('.gpv-overlay', root => {
        const labels = Array.from(root.querySelectorAll('label'));
        const target = labels.find(label => (label.textContent || '').trim() === 'Mode:');
        return Boolean(target && target.getAttribute('for') === 'gpv-ocbc-mode-select');
    });
    recordAssertion(summary, ocbcFlowName, 'mode-label-associated', isModeLabelAssociated, 'Mode label is associated with gpv-ocbc-mode-select.');

    await page.selectOption('#gpv-ocbc-mode-select', 'allocation');
    await page.waitForFunction(() => {
        const overlay = document.querySelector('.gpv-overlay');
        if (!overlay) {
            return false;
        }
        const text = overlay.textContent || '';
        return text.includes('New sub-portfolio')
            && text.includes('Unassigned')
            && text.includes('Portfolio 6500142646-2');
    }, null, { timeout: 5000 });

    const overlayTextAllocation = await page.$eval('.gpv-overlay', node => node.textContent || '');
    const allocationHeaders = await page.$$eval('.gpv-overlay th', cells => cells.map(cell => (cell.textContent || '').trim()));
    const hasAllocationUi = overlayTextAllocation.includes('New sub-portfolio')
        && overlayTextAllocation.includes('Unassigned');
    recordAssertion(summary, ocbcFlowName, 'allocation-has-sub-portfolio-ui', hasAllocationUi, 'Allocation mode shows sub-portfolio controls and summary.');

    const hasPortfolioFirstAllocation = overlayTextAllocation.includes('Portfolio 6500142646-2')
        && overlayTextAllocation.includes('Portfolio 6500142647-2')
        && overlayTextAllocation.includes('Unassigned')
        && overlayTextAllocation.includes('New sub-portfolio');
    recordAssertion(summary, ocbcFlowName, 'allocation-portfolio-first-mode', hasPortfolioFirstAllocation, 'Allocation mode is portfolio-first and includes product type rows plus sub-portfolio controls.');

    const hasProductTypeColumnAndRowText = allocationHeaders.includes('Product Type')
        && overlayTextAllocation.includes('Equity Funds');
    recordAssertion(summary, ocbcFlowName, 'allocation-product-type-column-row', hasProductTypeColumnAndRowText, 'Allocation mode includes Product Type column and product type row text.');

    const hasBothPortfolioNumbers = overlayTextAllocation.includes('6500142646-2')
        && overlayTextAllocation.includes('6500142647-2')
        && overlayTextAllocation.includes('Portfolio 6500142646-2')
        && overlayTextAllocation.includes('Portfolio 6500142647-2');
    recordAssertion(summary, ocbcFlowName, 'allocation-has-both-portfolio-numbers', hasBothPortfolioNumbers, 'Allocation mode contains both OCBC portfolio numbers under portfolio sections.');

    await page.selectOption('#gpv-ocbc-mode-select', 'portfolio');
    await page.waitForFunction(() => {
        const overlay = document.querySelector('.gpv-overlay');
        if (!overlay) {
            return false;
        }
        const text = overlay.textContent || '';
        const allocationTextGone = !text.includes('New sub-portfolio')
            && !text.includes('Target Assigned:')
            && !text.includes('Unassigned');
        return allocationTextGone || text.includes('Portfolio 6500142646-2');
    }, null, { timeout: 5000 });

    const liabilitiesValue = await page.$eval('#gpv-ocbc-view-select', select => {
        if (!(select instanceof HTMLSelectElement)) {
            return 'liabilities';
        }
        const matchingOption = Array.from(select.options).find(option => /liabilities/i.test(option.textContent || ''));
        return matchingOption ? matchingOption.value : 'liabilities';
    });
    await page.selectOption('#gpv-ocbc-view-select', liabilitiesValue);
    await page.waitForFunction(() => {
        const overlay = document.querySelector('.gpv-overlay');
        if (!overlay) {
            return false;
        }
        const text = overlay.textContent || '';
        return text.includes('OCBC Investment Credit Line')
            && !text.includes('OCBC Global Equity Opportunities Fund')
            && !text.includes('New sub-portfolio');
    }, null, { timeout: 5000 });

    const overlayTextLiabilities = await page.$eval('.gpv-overlay', node => node.textContent || '');
    const hasLiabilityName = overlayTextLiabilities.includes('OCBC Investment Credit Line');
    recordAssertion(summary, ocbcFlowName, 'liabilities-has-loan-name', hasLiabilityName, 'Liabilities view contains OCBC Investment Credit Line.');

    const hasLiabilityClass = overlayTextLiabilities.includes('Investment Loans');
    recordAssertion(summary, ocbcFlowName, 'liabilities-has-sub-asset-class', hasLiabilityClass, 'Liabilities view contains Investment Loans.');

    const hasNegativeAmount = /-\s*SGD\s*5,240\.75|SGD\s*-\s*5,240\.75|-\s*5,240\.75/.test(overlayTextLiabilities);
    recordAssertion(summary, ocbcFlowName, 'liabilities-has-negative-amount', hasNegativeAmount, 'Liabilities view contains negative SGD amount for investment loan.');

    const assetRemovedInLiabilitiesView = !overlayTextLiabilities.includes('OCBC Global Equity Opportunities Fund');
    recordAssertion(summary, ocbcFlowName, 'liabilities-excludes-asset', assetRemovedInLiabilitiesView, 'Liabilities view does not contain OCBC Global Equity Opportunities Fund.');

    await captureScreenshot(page, summary, outputDir, 'ocbc-liabilities');
}
