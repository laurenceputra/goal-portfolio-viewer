/**
 * Automated Screenshot Capture for Goal Portfolio Viewer Demo
 * 
 * This script uses Playwright to automate screenshot capture of the demo,
 * including scrolling to capture the complete bucket details view.
 * 
 * Usage: node take-screenshots.js
 * 
 * Requirements:
 *   pnpm install
 *   npx playwright install chromium
 * 
 * @eslint-env node
 */

const fs = require('fs');
const path = require('path');
const { startDemoServer } = require('./mock-server');

async function takeScreenshots() {
    // Check if playwright is available
    let playwright;
    try {
        playwright = require('playwright');
    } catch (_error) {
        console.error('\n❌ Playwright not installed!');
        console.error('\nTo use automated screenshots, install Playwright:');
        console.error('  pnpm install');
        console.error('  npx playwright install chromium');
        console.error('\nFor manual screenshots, run: python3 take-screenshots.py\n');
        process.exit(1);
    }

    const demoDir = __dirname;
    const outputDir = process.env.SCREENSHOT_DIR
        ? path.resolve(process.env.SCREENSHOT_DIR)
        : path.join(demoDir, 'screenshots');
    const port = 8765;
    const demoUrl = `http://localhost:${port}/dashboard/`;

    // Ensure docs directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log('\n' + '='.repeat(70));
    console.log('GOAL PORTFOLIO VIEWER - AUTOMATED SCREENSHOT CAPTURE');
    console.log('='.repeat(70));
    console.log(`\nDemo URL: ${demoUrl}`);
    console.log(`Screenshot directory: ${outputDir}\n`);

    // Start HTTP server
    console.log(`🌐 Starting demo server on port ${port}...`);
    const server = await startDemoServer({ demoDir, port });
    console.log('   ✓ Server started');

    // Launch browser
    console.log('🌐 Launching browser...');
    const browser = await playwright.chromium.launch({
        headless: true
    });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();
    
    // Enable console logging
    page.on('console', msg => {
        console.log('Browser console:', msg.text());
    });
    
    page.on('pageerror', error => {
        console.error('Browser error:', error);
    });

    try {
        // Navigate to demo page
        console.log('📂 Loading demo page...');
        await page.goto(demoUrl, { waitUntil: 'networkidle' });
        
        // Wait for the demo to signal readiness
        await page.waitForFunction(() => window.__GPV_E2E_READY__ === true, null, { timeout: 20000 });
        
        // Check if button exists
        const buttonExists = await page.$('.gpv-trigger-btn');
        if (!buttonExists) {
            // Debug: capture console logs
            console.log('⚠️  Button not found, checking console logs...');
            const logs = await page.evaluate(() => {
                return window.__consoleLogs || [];
            });
            console.log('Console logs:', logs);
            
            // Take debug screenshot
            await page.screenshot({
                path: path.join(outputDir, 'debug-screenshot.png'),
                fullPage: true
            });
            console.log('   ✓ Saved debug screenshot: debug-screenshot.png');
            
            // Check if userscript loaded
            const userscriptLoaded = await page.evaluate(() => {
                return !!window.portfolioViewerDebug || document.querySelector('.gpv-trigger-btn');
            });
            console.log('Userscript loaded:', userscriptLoaded);
        }
        
        // Wait for the trigger button to appear
        console.log('⏳ Waiting for Portfolio Viewer button...');
        await page.waitForSelector('.gpv-trigger-btn', { timeout: 20000 });
        
        // Click the trigger button
        console.log('🖱️  Clicking Portfolio Viewer button...');
        await page.click('.gpv-trigger-btn');
        
        // Wait for modal to appear
        await page.waitForSelector('.gpv-overlay', { timeout: 5000 });
        await page.waitForTimeout(1000); // Wait for animations
        
        // Screenshot 1: Summary view
        console.log('📸 Capturing summary view...');
        await page.screenshot({
            path: path.join(outputDir, 'screenshot-summary.png'),
            fullPage: false
        });
        console.log('   ✓ Saved: screenshot-summary.png');
        
        // Screenshot 2: House Purchase bucket detail
        console.log('📸 Capturing House Purchase bucket detail...');
        
        // Debug: check available options
        const options = await page.$$eval('select.gpv-select option', opts => 
            opts.map(opt => ({ value: opt.value, text: opt.textContent }))
        );
        console.log('   Available options:', options);
        
        // Select House Purchase from dropdown
        await page.selectOption('select.gpv-select', options.find(opt => opt.text.includes('House Purchase'))?.value || 'House Purchase');
        await page.waitForTimeout(1000); // Wait for view to update
        
        // Take screenshot of top section (performance graph)
        await page.screenshot({
            path: path.join(outputDir, 'house-purchase-performance.png'),
            fullPage: false
        });
        console.log('   ✓ Saved: house-purchase-performance.png');
        
        // Scroll the content panel to bottom to show goals table
        await page.evaluate(() => {
            const content = document.querySelector('.gpv-content');
            if (content) {
                content.scrollTo(0, content.scrollHeight);
            }
        });
        await page.waitForTimeout(500); // Wait for scroll
        
        // Take screenshot of scrolled view showing goals table
        await page.screenshot({
            path: path.join(outputDir, 'house-purchase-goals.png'),
            fullPage: false
        });
        console.log('   ✓ Saved: house-purchase-goals.png');
        
        // Screenshot 3: Retirement bucket detail
        console.log('📸 Capturing Retirement bucket detail...');
        
        // Scroll back to top first
        await page.evaluate(() => {
            const content = document.querySelector('.gpv-content');
            if (content) {
                content.scrollTo(0, 0);
            }
        });
        await page.waitForTimeout(300);
        
        // Select Retirement from dropdown using value
        await page.selectOption('select.gpv-select', 'Retirement');
        await page.waitForTimeout(1000); // Wait for view to update
        
        // Take screenshot of top section (performance graph)
        await page.screenshot({
            path: path.join(outputDir, 'retirement-performance.png'),
            fullPage: false
        });
        console.log('   ✓ Saved: retirement-performance.png');
        
        // Scroll to bottom
        await page.evaluate(() => {
            const content = document.querySelector('.gpv-content');
            if (content) {
                content.scrollTo(0, content.scrollHeight);
            }
        });
        await page.waitForTimeout(500);
        
        // Take screenshot of scrolled view
        await page.screenshot({
            path: path.join(outputDir, 'retirement-goals.png'),
            fullPage: false
        });
        console.log('   ✓ Saved: retirement-goals.png');
        
        // Sync settings screens
        console.log('📸 Capturing Sync Settings (unconfigured)...');
        await page.click('.gpv-header-buttons .gpv-sync-btn');
        await page.waitForSelector('.gpv-sync-settings', { timeout: 5000 });
        await page.screenshot({
            path: path.join(outputDir, 'sync-settings-unconfigured.png'),
            fullPage: false
        });
        console.log('   ✓ Saved: sync-settings-unconfigured.png');

        console.log('📸 Capturing Sync Settings (configured)...');
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
        await page.screenshot({
            path: path.join(outputDir, 'sync-settings-configured.png'),
            fullPage: false
        });
        console.log('   ✓ Saved: sync-settings-configured.png');

        console.log('📸 Capturing Sync Conflict dialog...');
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
                throw new Error('Conflict dialog renderer not available for screenshots.');
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
        await page.screenshot({
            path: path.join(outputDir, 'sync-conflict-dialog.png'),
            fullPage: false
        });
        console.log('   ✓ Saved: sync-conflict-dialog.png');

        console.log('\n✅ All screenshots captured successfully!');
        console.log(`\n📁 Screenshots saved to: ${outputDir}\n`);
        
    } catch (error) {
        console.error('\n❌ Error capturing screenshots:', error.message);
        console.error('\nTry manual screenshots with: python3 take-screenshots.py\n');
        throw error;
    } finally {
        await browser.close();
        server.close();
        console.log('🛑 Server stopped');
    }
}

// Run if called directly
if (require.main === module) {
    takeScreenshots()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { takeScreenshots };
