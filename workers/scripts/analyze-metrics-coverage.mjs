import {
formatCoverageReport,
summarizeMetricsCoverage
} from '../src/metrics.js';
import { INDEX_METRICS_INSTRUMENTATION, ROUTES } from '../src/index.js';
import { HANDLERS_METRICS_INSTRUMENTATION } from '../src/handlers.js';
import { RATELIMIT_METRICS_INSTRUMENTATION } from '../src/ratelimit.js';

export const RUNTIME_INSTRUMENTATION_SOURCES = Object.freeze([
{ source: 'workers/src/index.js', points: INDEX_METRICS_INSTRUMENTATION },
{ source: 'workers/src/handlers.js', points: HANDLERS_METRICS_INSTRUMENTATION },
{ source: 'workers/src/ratelimit.js', points: RATELIMIT_METRICS_INSTRUMENTATION }
]);

export function getRuntimeInstrumentationPoints() {
const seen = new Set();
const points = [];
for (const source of RUNTIME_INSTRUMENTATION_SOURCES) {
for (const point of source.points) {
if (seen.has(point.id)) {
continue;
}
seen.add(point.id);
points.push(point);
}
}
return points;
}

export function analyzeMetricsCoverage({ routeDefinitions = ROUTES, instrumentationPoints = getRuntimeInstrumentationPoints() } = {}) {
return summarizeMetricsCoverage({
routeDefinitions,
instrumentationPoints
});
}

export function assertMetricsCoverage(summary) {
if (!summary.complete) {
const error = new Error(`Metrics coverage is incomplete: ${summary.totals.missingItems} missing items`);
error.summary = summary;
throw error;
}
return summary;
}

function isCliEntry() {
if (!process.argv[1]) {
return false;
}
return import.meta.url === new URL(`file://${process.argv[1]}`).href;
}

if (isCliEntry()) {
const summary = analyzeMetricsCoverage();
const jsonOnly = process.argv.includes('--json');

if (jsonOnly) {
console.log(JSON.stringify(summary, null, 2));
} else {
console.log(formatCoverageReport(summary));
console.log('');
console.log('Machine-readable summary:');
console.log(JSON.stringify(summary, null, 2));
}

process.exit(summary.complete ? 0 : 1);
}
