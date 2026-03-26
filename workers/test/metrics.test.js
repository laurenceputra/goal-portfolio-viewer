import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { METRIC_POINTS, WORKER_ROUTE_DEFINITIONS } from '../src/metrics.js';
import {
analyzeMetricsCoverage,
getRuntimeInstrumentationPoints
} from '../scripts/analyze-metrics-coverage.mjs';

test('analyzeMetricsCoverage reports full worker metrics coverage', () => {
const summary = analyzeMetricsCoverage();

assert.equal(summary.complete, true);
assert.equal(summary.totals.routes, WORKER_ROUTE_DEFINITIONS.length);
assert.equal(summary.totals.coveredRoutes, WORKER_ROUTE_DEFINITIONS.length);
assert.equal(summary.totals.coveragePct, 100);
});

test('analyzeMetricsCoverage flags missing required instrumentation', () => {
const instrumentationPoints = getRuntimeInstrumentationPoints()
.filter((point) => point.id !== METRIC_POINTS.rateLimitHitFeature.id);
const summary = analyzeMetricsCoverage({ instrumentationPoints });

assert.equal(summary.complete, false);
assert.ok(summary.missingItems.some((item) => item.type === 'feature' && item.name === 'rate_limit_hits'));
assert.ok(summary.missingItems.some((item) => item.routeId === 'sync-upload'));
});

test('metrics analyzer CLI emits machine-readable json', () => {
const workersDir = fileURLToPath(new URL('..', import.meta.url));
const result = spawnSync(process.execPath, ['scripts/analyze-metrics-coverage.mjs', '--json'], {
cwd: workersDir,
encoding: 'utf8'
});

assert.equal(result.status, 0, result.stderr);
const summary = JSON.parse(result.stdout);
assert.equal(summary.complete, true);
assert.equal(summary.totals.coveragePct, 100);
});
