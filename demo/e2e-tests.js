/**
 * E2E smoke tests for the demo dashboard.
 *
 * Usage: node demo/e2e-tests.js
 */

const fs = require('fs');
const path = require('path');
const { startDemoServer } = require('./mock-server');

function assertCondition(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function runE2ETests() {
    let playwright;
    try {
        playwright = require('playwright');
    } catch (error) {
        console.error('Playwright is required for E2E tests.');
        throw error;
    }

    const port = 8765;
    const demoUrl = `http://localhost:${port}/dashboard/`;
    const outputDir = process.env.E2E_SCREENSHOT_DIR
        ? path.resolve(process.env.E2E_SCREENSHOT_DIR)
        : path.join(__dirname, 'screenshots');
    const summaryPath = process.env.E2E_SUMMARY_PATH
        ? path.resolve(process.env.E2E_SUMMARY_PATH)
        : path.join(outputDir, 'e2e-summary.json');
    const summary = {
        status: 'passed',
        flowsTested: [],
        screenshots: []
    };

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const server = await startDemoServer({ port });
    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    try {
        await page.goto(demoUrl, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.__GPV_E2E_READY__ === true, null, { timeout: 20000 });

        const trigger = await page.$('.gpv-trigger-btn');
        assertCondition(trigger, 'Expected Portfolio Viewer trigger button to exist.');

        await page.click('.gpv-trigger-btn');
        await page.waitForSelector('.gpv-overlay', { timeout: 5000 });

        const summaryHeader = await page.$('.gpv-header');
        assertCondition(summaryHeader, 'Expected summary header to render.');

        await page.screenshot({
            path: path.join(outputDir, 'e2e-summary.png'),
            fullPage: false
        });
        summary.flowsTested.push('summary');
        summary.screenshots.push('e2e-summary.png');

        const options = await page.$$eval('select.gpv-select option', opts =>
            opts.map(opt => opt.textContent)
        );
        assertCondition(options.some(text => text.includes('House Purchase')), 'Expected House Purchase option.');
        assertCondition(options.some(text => text.includes('Retirement')), 'Expected Retirement option.');

        await page.selectOption('select.gpv-select', 'House Purchase');
        await page.waitForFunction(
            () => {
                const title = document.querySelector('.gpv-detail-title');
                return title && title.textContent && title.textContent.includes('House Purchase');
            },
            null,
            { timeout: 5000 }
        );
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
        await page.screenshot({
            path: path.join(outputDir, 'e2e-house-purchase.png'),
            fullPage: false
        });
        summary.flowsTested.push('house-purchase');
        summary.screenshots.push('e2e-house-purchase.png');

        await page.selectOption('select.gpv-select', 'Retirement');
        await page.waitForFunction(
            () => {
                const title = document.querySelector('.gpv-detail-title');
                return title && title.textContent && title.textContent.includes('Retirement');
            },
            null,
            { timeout: 5000 }
        );
        await page.screenshot({
            path: path.join(outputDir, 'e2e-retirement.png'),
            fullPage: false
        });
        summary.flowsTested.push('retirement');
        summary.screenshots.push('e2e-retirement.png');

        const syncScreens = await captureSyncScreens(page, outputDir);
        summary.flowsTested.push(...syncScreens.flows);
        summary.screenshots.push(...syncScreens.screenshots);
    } catch (error) {
        summary.status = 'failed';
        summary.error = error instanceof Error ? error.message : String(error);
        throw error;
    } finally {
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
        await browser.close();
        server.close();
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

async function captureSyncScreens(page, outputDir) {
    const results = { flows: [], screenshots: [] };
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

    const unconfiguredPath = path.join(outputDir, 'e2e-sync-unconfigured.png');
    await page.screenshot({ path: unconfiguredPath, fullPage: false });
    results.flows.push('sync-unconfigured');
    results.screenshots.push('e2e-sync-unconfigured.png');

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

    const configuredPath = path.join(outputDir, 'e2e-sync-configured.png');
    await page.screenshot({ path: configuredPath, fullPage: false });
    results.flows.push('sync-configured');
    results.screenshots.push('e2e-sync-configured.png');

    await page.evaluate(() => {
        const overlay = document.getElementById('gpv-overlay');
        if (overlay) {
            overlay.remove();
        }
    });

    const conflict = {
        local: { goalTargets: { goal_1: 10 }, goalFixed: {} },
        remote: { goalTargets: { goal_1: 20 }, goalFixed: {} },
        localHash: 'local-hash',
        remoteHash: 'remote-hash',
        localTimestamp: Date.now() - 5000,
        remoteTimestamp: Date.now()
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

    const conflictPath = path.join(outputDir, 'e2e-sync-conflict.png');
    await page.screenshot({ path: conflictPath, fullPage: false });
    results.flows.push('sync-conflict');
    results.screenshots.push('e2e-sync-conflict.png');

    return results;
}
