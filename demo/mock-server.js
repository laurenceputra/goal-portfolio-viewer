/**
 * Demo server with mock Endowus endpoints for E2E testing.
 *
 * Usage: node mock-server.js
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');

const DEFAULT_PORT = 8765;
const DEMO_DIR = __dirname;
const REPO_ROOT = path.resolve(__dirname, '..');

const CONTENT_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

function loadMockData(demoDir) {
    const mockPath = path.join(demoDir, 'mock-data.json');
    const contents = fs.readFileSync(mockPath, 'utf-8');
    return JSON.parse(contents);
}

function sendJson(res, payload, statusCode = 200) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
}

function sendText(res, message, statusCode) {
    res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
    res.end(message);
}

function getPerformanceSeries(mockData, goalId) {
    if (!mockData.performanceTimeSeries || !goalId) {
        return null;
    }
    return mockData.performanceTimeSeries[goalId] || null;
}

function resolveStaticFile(demoDir, repoRoot, requestPath) {
    if (requestPath === '/dashboard' || requestPath === '/dashboard/') {
        return path.join(demoDir, 'dashboard', 'index.html');
    }

    if (requestPath === '/fsmone/holdings/investments') {
        return path.join(demoDir, 'fsm', 'index.html');
    }

    if (requestPath === '/') {
        return path.join(demoDir, 'index.html');
    }

    if (requestPath.startsWith('/tampermonkey/')) {
        return path.join(repoRoot, requestPath);
    }

    return path.join(demoDir, requestPath);
}

function isSafePath(baseDir, targetPath) {
    const resolved = path.resolve(targetPath);
    return resolved.startsWith(baseDir);
}

function startDemoServer({
    demoDir = DEMO_DIR,
    repoRoot = REPO_ROOT,
    port = DEFAULT_PORT,
    onRequest
} = {}) {
    const mockData = loadMockData(demoDir);

    const server = http.createServer((req, res) => {
        const parsed = url.parse(req.url, true);
        const pathname = parsed.pathname;

        if (typeof onRequest === 'function') {
            onRequest(req);
        }

        if (pathname === '/v1/goals/performance') {
            return sendJson(res, mockData.performance);
        }
        if (pathname === '/v2/goals/investible') {
            return sendJson(res, mockData.investible);
        }
        if (pathname === '/v1/goals') {
            return sendJson(res, mockData.summary);
        }
        if (pathname === '/v1/performance') {
            const goalId = parsed.query.goalId;
            const series = getPerformanceSeries(mockData, goalId);
            if (!series) {
                return sendText(res, 'Not found', 404);
            }
            return sendJson(res, series);
        }

        if (pathname === '/fsmone/rest/holding/client/protected/find-holdings-with-pnl') {
            return sendJson(res, mockData.fsmHoldings || { data: [] });
        }

        const filePath = resolveStaticFile(demoDir, repoRoot, pathname);
        const baseDir = filePath.startsWith(repoRoot) ? repoRoot : demoDir;

        if (!isSafePath(baseDir, filePath)) {
            return sendText(res, 'Forbidden', 403);
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                return sendText(res, 'Not found', 404);
            }
            const ext = path.extname(filePath);
            const contentType = CONTENT_TYPES[ext] || 'text/plain';
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
    });

    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(port, () => resolve(server));
    });
}

if (require.main === module) {
    startDemoServer()
        .then(server => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : DEFAULT_PORT;
            console.log(`Demo server running at http://localhost:${port}/dashboard/`);
        })
        .catch(error => {
            console.error('Failed to start demo server:', error);
            process.exit(1);
        });
}

module.exports = {
    startDemoServer
};
