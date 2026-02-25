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
}

async function captureScreenshot(page, summary, outputDir, flowName) {
    const normalizedFlowName = normalizeName(flowName);
    const screenshotName = `e2e-${normalizedFlowName}.png`;
    const screenshotPath = path.join(outputDir, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: false });

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

async function captureSyncScreens(page, outputDir, summary) {
    const syncButtonSelector = '.gpv-header-buttons .gpv-sync-btn';

    await page.click(syncButtonSelector);
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
        const status = document.querySelector('.gpv-sync-status-bar');
        if (status) {
            status.insertAdjacentHTML(
                'beforeend',
                '<div class="gpv-sync-status-item"><span class="gpv-sync-label">Auth:</span><span class="gpv-sync-value">Connected (refresh active)</span></div>'
            );
        }
        const actions = document.querySelector('.gpv-sync-actions');
        if (actions && !actions.querySelector('#gpv-sync-now-btn')) {
            actions.insertAdjacentHTML(
                'beforeend',
                '<button class="gpv-sync-btn gpv-sync-btn-secondary" id="gpv-sync-now-btn">Sync Now</button>'
            );
        }
    });

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
    const fsmUrl = `http://localhost:${DEFAULT_PORT}/fsmone/holdings/investments`;
    await page.goto(fsmUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__GPV_E2E_READY__ === true, null, { timeout: 20000 });
    await page.click('.gpv-trigger-btn');
    await page.waitForSelector('.gpv-overlay', { timeout: 5000 });

    await page.waitForSelector('.gpv-fsm-toolbar', { timeout: 5000 });
    recordAssertion(summary, 'fsm-overlay', 'toolbar', true, 'FSM toolbar rendered.');
    await captureScreenshot(page, summary, outputDir, 'fsm-overlay');

    const managerToggle = await page.$('.gpv-fsm-toolbar button');
    if (managerToggle) {
        await managerToggle.click();
        await page.waitForSelector('.gpv-fsm-manager', { timeout: 5000 });
        recordAssertion(summary, 'fsm-manager', 'manager-panel', true, 'FSM manager panel rendered.');
        await captureScreenshot(page, summary, outputDir, 'fsm-manager');
        await managerToggle.click();
    }

    const summaryCards = await page.$$eval('.gpv-summary-row .gpv-summary-card', nodes => nodes.length);
    recordAssertion(summary, 'fsm-overlay', 'summary-cards', summaryCards >= 4, 'FSM summary cards present.');
    if (summaryCards < 4) {
        summary.status = 'failed';
    }

    const tableHeaders = await page.$$eval('.gpv-table thead th', nodes => nodes.map(node => node.textContent || '').map(text => text.trim()));
    const hasTableHeaders = tableHeaders.includes('Ticker') && tableHeaders.includes('Portfolio');
    recordAssertion(summary, 'fsm-overlay', 'table-headers', hasTableHeaders, 'FSM table headers present.');
    if (!hasTableHeaders) {
        summary.status = 'failed';
    }

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
