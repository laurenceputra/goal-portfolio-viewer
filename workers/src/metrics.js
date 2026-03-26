const BASE_ROUTE_METRICS = Object.freeze([
'request_count',
'request_latency_ms',
'route_outcome_total'
]);

const ALL_ROUTES = '*';
const METRICS_SINK_KEY = '__metrics';

function freezeRouteDefinition(route) {
return Object.freeze({
...route,
requiredMetrics: BASE_ROUTE_METRICS,
requiredOutcomes: Object.freeze([...(route.requiredOutcomes || [])]),
requiredFeatures: Object.freeze([...(route.requiredFeatures || [])])
});
}

function freezePointDefinition(point) {
return Object.freeze({
...point,
routes: point.routes === ALL_ROUTES ? ALL_ROUTES : Object.freeze([...(point.routes || [])]),
baseMetrics: Object.freeze([...(point.baseMetrics || [])]),
outcomes: Object.freeze([...(point.outcomes || [])]),
features: Object.freeze([...(point.features || [])])
});
}

export const METRICS_CONTRACT_VERSION = 'v1';

export const WORKER_ROUTE_DEFINITIONS = Object.freeze([
freezeRouteDefinition({
id: 'health',
method: 'GET',
path: '/health',
matcher: /^\/health$/,
authRequired: false,
requiredOutcomes: ['success']
}),
freezeRouteDefinition({
id: 'auth-register',
method: 'POST',
path: '/auth/register',
matcher: /^\/auth\/register$/,
authRequired: false,
requiredOutcomes: ['success', 'bad_request', 'rate_limit_exceeded', 'internal_error']
}),
freezeRouteDefinition({
id: 'auth-login',
method: 'POST',
path: '/auth/login',
matcher: /^\/auth\/login$/,
authRequired: false,
requiredOutcomes: ['success', 'bad_request', 'unauthorized', 'rate_limit_exceeded', 'internal_error'],
requiredFeatures: ['token_issue']
}),
freezeRouteDefinition({
id: 'auth-refresh',
method: 'POST',
path: '/auth/refresh',
matcher: /^\/auth\/refresh$/,
authRequired: false,
requiredOutcomes: ['success', 'unauthorized', 'rate_limit_exceeded', 'internal_error'],
requiredFeatures: ['token_issue']
}),
freezeRouteDefinition({
id: 'sync-upload',
method: 'POST',
path: '/sync',
matcher: /^\/sync$/,
authRequired: true,
requiredOutcomes: ['success', 'bad_request', 'unauthorized', 'forbidden', 'payload_too_large', 'conflict', 'rate_limit_exceeded', 'internal_error'],
requiredFeatures: ['payload_size_bytes', 'token_verify', 'rate_limit_hits']
}),
freezeRouteDefinition({
id: 'sync-download',
method: 'GET',
path: '/sync/:userId',
matcher: /^\/sync\/(.+)$/,
authRequired: true,
requiredOutcomes: ['success', 'bad_request', 'unauthorized', 'forbidden', 'not_found', 'rate_limit_exceeded', 'internal_error'],
requiredFeatures: ['token_verify', 'rate_limit_hits']
}),
freezeRouteDefinition({
id: 'sync-delete',
method: 'DELETE',
path: '/sync/:userId',
matcher: /^\/sync\/(.+)$/,
authRequired: true,
requiredOutcomes: ['success', 'bad_request', 'unauthorized', 'forbidden', 'rate_limit_exceeded', 'internal_error'],
requiredFeatures: ['token_verify', 'rate_limit_hits']
})
]);

export const METRIC_POINTS = Object.freeze({
routeRequestCount: freezePointDefinition({
id: 'route.request-count',
source: 'workers/src/index.js',
routes: ALL_ROUTES,
baseMetrics: ['request_count']
}),
routeLatency: freezePointDefinition({
id: 'route.request-latency',
source: 'workers/src/index.js',
routes: ALL_ROUTES,
baseMetrics: ['request_latency_ms']
}),
routeOutcomeTotal: freezePointDefinition({
id: 'route.outcome-total',
source: 'workers/src/index.js',
routes: ALL_ROUTES,
baseMetrics: ['route_outcome_total']
}),
successOutcome: freezePointDefinition({
id: 'route.success',
source: 'workers/src/index.js',
routes: ALL_ROUTES,
outcomes: ['success']
}),
badRequestOutcome: freezePointDefinition({
id: 'route.bad-request',
source: 'workers/src/index.js',
routes: ['auth-register', 'auth-login', 'sync-upload', 'sync-download', 'sync-delete'],
outcomes: ['bad_request']
}),
unauthorizedOutcome: freezePointDefinition({
id: 'route.unauthorized',
source: 'workers/src/index.js',
routes: ['auth-login', 'auth-refresh', 'sync-upload', 'sync-download', 'sync-delete'],
outcomes: ['unauthorized']
}),
forbiddenOutcome: freezePointDefinition({
id: 'route.forbidden',
source: 'workers/src/index.js',
routes: ['sync-upload', 'sync-download', 'sync-delete'],
outcomes: ['forbidden']
}),
payloadTooLargeOutcome: freezePointDefinition({
id: 'route.payload-too-large',
source: 'workers/src/index.js',
routes: ['sync-upload'],
outcomes: ['payload_too_large']
}),
internalErrorOutcome: freezePointDefinition({
id: 'route.internal-error',
source: 'workers/src/index.js',
routes: ['auth-register', 'auth-login', 'auth-refresh', 'sync-upload', 'sync-download', 'sync-delete'],
outcomes: ['internal_error']
}),
payloadSizeFeature: freezePointDefinition({
id: 'route.payload-size',
source: 'workers/src/index.js',
routes: ['sync-upload'],
features: ['payload_size_bytes']
}),
tokenVerifyFeature: freezePointDefinition({
id: 'route.token-verify',
source: 'workers/src/index.js',
routes: ['sync-upload', 'sync-download', 'sync-delete'],
features: ['token_verify']
}),
tokenIssueFeature: freezePointDefinition({
id: 'route.token-issue',
source: 'workers/src/index.js',
routes: ['auth-login', 'auth-refresh'],
features: ['token_issue']
}),
conflictOutcome: freezePointDefinition({
id: 'sync.conflict',
source: 'workers/src/handlers.js',
routes: ['sync-upload'],
outcomes: ['conflict']
}),
notFoundOutcome: freezePointDefinition({
id: 'sync.not-found',
source: 'workers/src/handlers.js',
routes: ['sync-download'],
outcomes: ['not_found']
}),
rateLimitOutcome: freezePointDefinition({
id: 'route.rate-limit-exceeded',
source: 'workers/src/ratelimit.js',
routes: ['auth-register', 'auth-login', 'auth-refresh', 'sync-upload', 'sync-download', 'sync-delete'],
outcomes: ['rate_limit_exceeded']
}),
rateLimitHitFeature: freezePointDefinition({
id: 'route.rate-limit-hit',
source: 'workers/src/ratelimit.js',
routes: ['auth-register', 'auth-login', 'auth-refresh', 'sync-upload', 'sync-download', 'sync-delete'],
features: ['rate_limit_hits']
})
});

export function getRouteDefinitionById(routeId) {
return WORKER_ROUTE_DEFINITIONS.find(route => route.id === routeId) || null;
}

export function normalizeRoutePath(pathname) {
if (typeof pathname !== 'string' || pathname.length === 0) {
return pathname;
}
return pathname.startsWith('/sync/') && pathname !== '/sync'
? '/sync/:userId'
: pathname;
}

export function getRouteDefinition(method, pathname) {
const normalizedPath = normalizeRoutePath(pathname);
return WORKER_ROUTE_DEFINITIONS.find(route => route.method === method && route.path === normalizedPath) || null;
}

export function matchWorkerRoute(method, pathname) {
for (const route of WORKER_ROUTE_DEFINITIONS) {
if (route.method !== method) {
continue;
}
const match = pathname.match(route.matcher);
if (!match) {
continue;
}
return {
route,
params: route.path === '/sync/:userId'
? { userId: match[1] }
: {}
};
}
return null;
}

export function createRequestMetricsContext(request, route) {
return {
startedAt: Date.now(),
method: request.method,
route,
requestBytes: null,
outcome: null
};
}

export function setRequestOutcome(metricsContext, outcome) {
if (metricsContext) {
metricsContext.outcome = outcome;
}
}

export function recordMetricEvent(env, point, payload = {}) {
const event = {
pointId: point.id,
source: point.source,
timestamp: Date.now(),
...payload
};
const sink = env?.[METRICS_SINK_KEY];
if (Array.isArray(sink)) {
sink.push(event);
} else if (typeof sink === 'function') {
sink(event);
}
return event;
}

function buildRoutePayload(route, payload = {}) {
return {
routeId: route.id,
method: route.method,
normalizedPath: route.path,
...payload
};
}

export function recordOutcomeMetric(env, point, route, status, payload = {}) {
return recordMetricEvent(env, point, buildRoutePayload(route, { status, ...payload }));
}

export function recordFeatureMetric(env, point, route, payload = {}) {
return recordMetricEvent(env, point, buildRoutePayload(route, payload));
}

export function recordRequestMetric(env, metricsContext) {
return recordMetricEvent(env, METRIC_POINTS.routeRequestCount, buildRoutePayload(metricsContext.route, {
requestBytes: metricsContext.requestBytes
}));
}

function deriveOutcomeFromStatus(status) {
if (status >= 200 && status < 400) {
return 'success';
}
if (status === 400) {
return 'bad_request';
}
if (status === 401) {
return 'unauthorized';
}
if (status === 403) {
return 'forbidden';
}
if (status === 404) {
return 'not_found';
}
if (status === 409) {
return 'conflict';
}
if (status === 413) {
return 'payload_too_large';
}
if (status === 429) {
return 'rate_limit_exceeded';
}
if (status >= 500) {
return 'internal_error';
}
return 'error';
}

export function completeRequestMetrics(env, metricsContext, response) {
const outcome = metricsContext.outcome || deriveOutcomeFromStatus(response.status);
const durationMs = Math.max(0, Date.now() - metricsContext.startedAt);
const routePayload = buildRoutePayload(metricsContext.route, {
status: response.status,
outcome
});
recordMetricEvent(env, METRIC_POINTS.routeOutcomeTotal, routePayload);
recordMetricEvent(env, METRIC_POINTS.routeLatency, {
...routePayload,
durationMs
});
if (outcome === 'success') {
recordOutcomeMetric(env, METRIC_POINTS.successOutcome, metricsContext.route, response.status);
}
return response;
}

function pointAppliesToRoute(point, routeId) {
return point.routes === ALL_ROUTES || point.routes.includes(routeId);
}

function getCoverageMatches(points, routeId, type, name) {
return points
.filter(point => pointAppliesToRoute(point, routeId) && point[type].includes(name))
.map(point => point.id);
}

function buildCoverageItems(route, points) {
const metrics = route.requiredMetrics.map(name => {
const pointIds = getCoverageMatches(points, route.id, 'baseMetrics', name);
return { type: 'metric', name, covered: pointIds.length > 0, pointIds };
});
const outcomes = route.requiredOutcomes.map(name => {
const pointIds = getCoverageMatches(points, route.id, 'outcomes', name);
return { type: 'outcome', name, covered: pointIds.length > 0, pointIds };
});
const features = route.requiredFeatures.map(name => {
const pointIds = getCoverageMatches(points, route.id, 'features', name);
return { type: 'feature', name, covered: pointIds.length > 0, pointIds };
});
return { metrics, outcomes, features };
}

export function summarizeMetricsCoverage({ routeDefinitions = WORKER_ROUTE_DEFINITIONS, instrumentationPoints = [] } = {}) {
const routes = routeDefinitions.map(route => {
const coverage = buildCoverageItems(route, instrumentationPoints);
const items = [...coverage.metrics, ...coverage.outcomes, ...coverage.features];
const coveredItems = items.filter(item => item.covered).length;
return {
routeId: route.id,
method: route.method,
path: route.path,
covered: coveredItems === items.length,
items,
coverage
};
});

const allItems = routes.flatMap(route => route.items.map(item => ({
...item,
routeId: route.routeId,
method: route.method,
path: route.path
})));
const coveredItems = allItems.filter(item => item.covered).length;
const coveragePct = allItems.length === 0
? 100
: Number(((coveredItems / allItems.length) * 100).toFixed(2));
const missingItems = allItems.filter(item => !item.covered);

return {
contractVersion: METRICS_CONTRACT_VERSION,
complete: missingItems.length === 0,
totals: {
routes: routes.length,
coveredRoutes: routes.filter(route => route.covered).length,
items: allItems.length,
coveredItems,
missingItems: missingItems.length,
coveragePct
},
routes,
missingItems,
instrumentationPoints: instrumentationPoints.map(point => ({
id: point.id,
source: point.source,
routes: point.routes,
baseMetrics: point.baseMetrics,
outcomes: point.outcomes,
features: point.features
}))
};
}

export function formatCoverageReport(summary) {
const lines = [
`Metrics coverage analyzer (${summary.contractVersion})`,
`Overall coverage: ${summary.totals.coveragePct}% (${summary.totals.coveredItems}/${summary.totals.items})`,
`Fully covered routes: ${summary.totals.coveredRoutes}/${summary.totals.routes}`,
''
];

for (const route of summary.routes) {
const status = route.covered ? 'OK' : 'MISSING';
lines.push(`- [${status}] ${route.method} ${route.path} (${route.routeId})`);
if (!route.covered) {
for (const item of route.items.filter(item => !item.covered)) {
lines.push(`    - missing ${item.type}: ${item.name}`);
}
}
}

if (summary.missingItems.length === 0) {
lines.push('', 'No missing metrics coverage items.');
} else {
lines.push('', 'Missing coverage items:');
for (const item of summary.missingItems) {
lines.push(`- ${item.method} ${item.path} (${item.routeId}) -> ${item.type}: ${item.name}`);
}
}

return lines.join('\n');
}
