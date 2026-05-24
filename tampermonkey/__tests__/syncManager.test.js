const { setupDom, teardownDom } = require('./helpers/domSetup');

describe('SyncManager', () => {
    let exportsModule;
    let storage;
    let fetchMock;
    const originalDateNow = Date.now;

    beforeEach(() => {
        jest.resetModules();
        setupDom();

        storage = new Map();
        global.GM_setValue = (key, value) => storage.set(key, value);
        global.GM_getValue = (key, fallback = null) => storage.has(key) ? storage.get(key) : fallback;
        global.GM_deleteValue = key => storage.delete(key);
        global.GM_listValues = () => [];
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };

        fetchMock = jest.fn((url, options = {}) => {
            if (url.includes('/sync/') && options.method === 'GET') {
                return Promise.resolve({
                    status: 404,
                    ok: false,
                    json: () => Promise.resolve({}),
                    text: () => Promise.resolve('{}'),
                    headers: { get: () => null }
                });
            }
            if (url.includes('/sync') && options.method === 'POST') {
                return Promise.resolve({
                    status: 200,
                    ok: true,
                    json: () => Promise.resolve({ success: true }),
                    text: () => Promise.resolve('{"success":true}'),
                    headers: { get: () => null }
                });
            }
            if (url.includes('/auth/refresh')) {
                return Promise.resolve({
                    status: 200,
                    ok: true,
                    json: () => Promise.resolve({
                        success: true,
                        tokens: {
                            accessToken: 'access-token',
                            refreshToken: 'refresh-token',
                            accessExpiresAt: Date.now() + 60_000,
                            refreshExpiresAt: Date.now() + 120_000
                        }
                    }),
                    text: () => Promise.resolve('{"success":true}'),
                    headers: { get: () => null }
                });
            }
            return Promise.resolve({
                status: 200,
                ok: true,
                json: () => Promise.resolve({}),
                text: () => Promise.resolve('{}'),
                headers: { get: () => null }
            });
        });
        global.fetch = fetchMock;
        window.fetch = fetchMock;

        class FakeXHR {
            constructor() {
                this._headers = {};
                this.responseText = '{}';
            }
            open(method, url) {
                this._url = url;
                return true;
            }
            setRequestHeader(header, value) {
                this._headers[header] = value;
            }
            addEventListener() {}
            send() {}
        }
        global.XMLHttpRequest = FakeXHR;
        global.GM_xmlhttpRequest = jest.fn(({ url, method, onload }) => {
            if (url.includes('/sync/') && method === 'GET') {
                onload({ status: 404, responseText: '{}', responseHeaders: '' });
                return;
            }
            if (url.includes('/sync') && method === 'POST') {
                onload({ status: 200, responseText: '{"success":true}', responseHeaders: '' });
                return;
            }
            if (url.includes('/auth/refresh')) {
                onload({
                    status: 200,
                    responseText: JSON.stringify({
                        success: true,
                        tokens: {
                            accessToken: 'access-token',
                            refreshToken: 'refresh-token',
                            accessExpiresAt: Date.now() + 60_000,
                            refreshExpiresAt: Date.now() + 120_000
                        }
                    }),
                    responseHeaders: ''
                });
                return;
            }
            onload({ status: 200, responseText: '{}', responseHeaders: '' });
        });

    });

    afterEach(() => {
        if (exportsModule?.SyncManager?.stopAutoSync) {
            exportsModule.SyncManager.stopAutoSync();
        }
        if (window.__gpvUrlMonitorCleanup) {
            window.__gpvUrlMonitorCleanup();
        }
        jest.clearAllTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
        teardownDom();
        Date.now = originalDateNow;
    });

    function loadModule() {
        exportsModule = require('../goal_portfolio_viewer.user.js');
        return exportsModule;
    }

    function unlockSync(SyncManager) {
        SyncManager.__test.setSessionMasterKey(new Uint8Array([1, 2, 3, 4]));
    }

    function getSyncStore() {
        return JSON.parse(storage.get('sync') || '{}');
    }

    function seedConfiguredState() {
        storage.set('sync', JSON.stringify({
            enabled: true,
            serverUrl: 'https://sync.example.com',
            userId: 'user@example.com',
            refreshToken: 'refresh-token',
            refreshTokenExpiry: Date.now() + 120_000,
            accessToken: 'access-token',
            accessTokenExpiry: Date.now() + 120_000
        }));
    }

    function seedConfiguredWithoutAccessToken() {
        storage.set('sync', JSON.stringify({
            enabled: true,
            serverUrl: 'https://sync.example.com',
            userId: 'user@example.com',
            refreshToken: 'refresh-token',
            refreshTokenExpiry: Date.now() + 120_000
        }));
    }

    test('legacy flat sync keys migrate full sync schema into sync store and are removed', () => {
        storage.set('sync_enabled', true);
        storage.set('sync_server_url', 'https://sync.example.com');
        storage.set('sync_user_id', 'user@example.com');
        storage.set('sync_device_id', 'device-123');
        storage.set('sync_last_sync', 2_000_000_000_000);
        storage.set('sync_last_data_timestamp', 1_999_999_999_000);
        storage.set('sync_last_sync_metadata_version', 2);
        storage.set('sync_last_hash', 'abc123');
        storage.set('sync_auto_sync', false);
        storage.set('sync_interval_minutes', 45);
        storage.set('sync_access_token', 'legacy-access-token');
        storage.set('sync_refresh_token', 'legacy-refresh-token');
        storage.set('sync_access_token_expiry', 2_000_000_030_000);
        storage.set('sync_refresh_token_expiry', 2_000_000_060_000);
        storage.set('sync_remember_key', true);
        storage.set('sync_master_key', btoa(String.fromCharCode(1, 2, 3, 4)));

        loadModule();

        const syncStore = getSyncStore();
        expect(syncStore.enabled).toBe(true);
        expect(syncStore.serverUrl).toBe('https://sync.example.com');
        expect(syncStore.userId).toBe('user@example.com');
        expect(syncStore.deviceId).toBe('device-123');
        expect(syncStore.lastSync).toBe(2_000_000_000_000);
        expect(syncStore.lastDataTimestamp).toBe(1_999_999_999_000);
        expect(syncStore.lastSyncMetadataVersion).toBe(2);
        expect(syncStore.lastSyncHash).toBe('abc123');
        expect(syncStore.autoSync).toBe(false);
        expect(syncStore.syncInterval).toBe(45);
        expect(syncStore.accessToken).toBe('legacy-access-token');
        expect(syncStore.refreshToken).toBe('legacy-refresh-token');
        expect(syncStore.accessTokenExpiry).toBe(2_000_000_030_000);
        expect(syncStore.refreshTokenExpiry).toBe(2_000_000_060_000);
        expect(syncStore.rememberKey).toBe(true);
        expect(syncStore.rememberedMasterKey).toBe(btoa(String.fromCharCode(1, 2, 3, 4)));
        expect(storage.has('sync_enabled')).toBe(false);
        expect(storage.has('sync_server_url')).toBe(false);
        expect(storage.has('sync_user_id')).toBe(false);
        expect(storage.has('sync_device_id')).toBe(false);
        expect(storage.has('sync_last_sync')).toBe(false);
        expect(storage.has('sync_last_data_timestamp')).toBe(false);
        expect(storage.has('sync_last_sync_metadata_version')).toBe(false);
        expect(storage.has('sync_last_hash')).toBe(false);
        expect(storage.has('sync_auto_sync')).toBe(false);
        expect(storage.has('sync_interval_minutes')).toBe(false);
        expect(storage.has('sync_access_token')).toBe(false);
        expect(storage.has('sync_refresh_token')).toBe(false);
        expect(storage.has('sync_access_token_expiry')).toBe(false);
        expect(storage.has('sync_refresh_token_expiry')).toBe(false);
        expect(storage.has('sync_remember_key')).toBe(false);
        expect(storage.has('sync_master_key')).toBe(false);
    });

    test('legacy flat sync keys are retained when migrated sync write fails', () => {
        storage.set('sync_enabled', true);
        storage.set('sync_server_url', 'https://sync.example.com');
        storage.set('sync_user_id', 'user@example.com');
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const originalSetValue = global.GM_setValue;
        global.GM_setValue = (key, value) => {
            if (key === 'sync') {
                throw new Error('write failed');
            }
            return originalSetValue(key, value);
        };

        try {
            loadModule();
            expect(storage.has('sync')).toBe(false);
            expect(storage.get('sync_enabled')).toBe(true);
            expect(storage.get('sync_server_url')).toBe('https://sync.example.com');
            expect(storage.get('sync_user_id')).toBe('user@example.com');
            expect(errorSpy).toHaveBeenCalledWith('[Goal Portfolio Viewer] Error writing merged sync store:', expect.any(Error));
        } finally {
            global.GM_setValue = originalSetValue;
            errorSpy.mockRestore();
        }
    });

    test('malformed sync store migrates from legacy keys and removes legacy keys after successful write', () => {
        storage.set('sync', '{malformed');
        storage.set('sync_enabled', true);
        storage.set('sync_user_id', 'user@example.com');

        loadModule();

        const syncStore = getSyncStore();
        expect(syncStore.enabled).toBe(true);
        expect(syncStore.userId).toBe('user@example.com');
        expect(storage.has('sync_enabled')).toBe(false);
        expect(storage.has('sync_user_id')).toBe(false);
    });

    test('existing sync values win over legacy with missing fields filled', () => {
        storage.set('sync', JSON.stringify({ enabled: false, serverUrl: 'https://current.example.com' }));
        storage.set('sync_enabled', true);
        storage.set('sync_server_url', 'https://legacy.example.com');
        storage.set('sync_user_id', 'legacy-user');

        loadModule();

        const syncStore = getSyncStore();
        expect(syncStore.enabled).toBe(false);
        expect(syncStore.serverUrl).toBe('https://current.example.com');
        expect(syncStore.userId).toBe('legacy-user');
    });

    test('startAutoSync does not schedule when auto-sync disabled', () => {
        jest.spyOn(global, 'setInterval');
        seedConfiguredState();
        storage.set('sync_auto_sync', false);
        const { SyncManager } = loadModule();

        SyncManager.startAutoSync();

        expect(global.setInterval).not.toHaveBeenCalled();
    });

    test('startAutoSync schedules an immediate first sync when last sync is missing', () => {
        jest.useFakeTimers();
        jest.spyOn(global, 'setTimeout');
        seedConfiguredState();
        storage.set('sync_auto_sync', true);
        const { SyncManager } = loadModule();
        unlockSync(SyncManager);

        SyncManager.startAutoSync();

        expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
    });

    test('startAutoSync schedules an immediate first sync when last sync exceeds configured interval', () => {
        jest.useFakeTimers();
        jest.spyOn(global, 'setTimeout');
        const now = 2_000_000_000_000;
        Date.now = jest.fn(() => now);
        seedConfiguredState();
        storage.set('sync_auto_sync', true);
        storage.set('sync_interval_minutes', 45);
        storage.set('sync_last_sync', now - (45 * 60 * 1000) - 1);
        const { SyncManager } = loadModule();
        unlockSync(SyncManager);

        SyncManager.startAutoSync();

        expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
    });

    test('startAutoSync does not schedule first sync when last sync is within configured interval', () => {
        jest.useFakeTimers();
        jest.spyOn(global, 'setTimeout');
        const now = 2_000_000_000_000;
        Date.now = jest.fn(() => now);
        seedConfiguredState();
        storage.set('sync_auto_sync', true);
        storage.set('sync_interval_minutes', 45);
        storage.set('sync_last_sync', now - (44 * 60 * 1000));
        const { SyncManager } = loadModule();
        unlockSync(SyncManager);

        SyncManager.startAutoSync();

        expect(global.setTimeout).not.toHaveBeenCalledWith(expect.any(Function), 0);
    });

    test('stopAutoSync clears pending startup sync timer', () => {
        jest.useFakeTimers();
        seedConfiguredState();
        storage.set('sync_auto_sync', true);
        const { SyncManager } = loadModule();
        unlockSync(SyncManager);

        SyncManager.startAutoSync();
        expect(jest.getTimerCount()).toBeGreaterThan(0);

        SyncManager.stopAutoSync();

        expect(jest.getTimerCount()).toBe(0);
    });

    test('startup sync retries when another sync is already in progress', () => {
        jest.useFakeTimers();
        const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
        seedConfiguredState();
        storage.set('sync_auto_sync', true);
        const { SyncManager } = loadModule();
        unlockSync(SyncManager);
        SyncManager.__test.setSyncStatus('syncing');

        SyncManager.startAutoSync();
        jest.advanceTimersByTime(0);

        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 3000);

        SyncManager.__test.setSyncStatus('idle');
        jest.advanceTimersByTime(3000);

        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0);
    });

    test('stopAutoSync clears pending startup retry timer', () => {
        jest.useFakeTimers();
        seedConfiguredState();
        storage.set('sync_auto_sync', true);
        const { SyncManager } = loadModule();
        unlockSync(SyncManager);
        SyncManager.__test.setSyncStatus('syncing');

        SyncManager.startAutoSync();
        jest.advanceTimersByTime(0);
        expect(jest.getTimerCount()).toBeGreaterThan(0);

        SyncManager.stopAutoSync();

        expect(jest.getTimerCount()).toBe(0);
    });

    test('startup sync staleness uses configured interval value', () => {
        const now = 2_000_000_000_000;
        Date.now = jest.fn(() => now);
        seedConfiguredState();
        storage.set('sync_interval_minutes', 10);
        storage.set('sync_last_sync', now - (11 * 60 * 1000));
        const { SyncManager } = loadModule();

        expect(SyncManager.__test.getAutoSyncIntervalMs()).toBe(10 * 60 * 1000);
        expect(SyncManager.__test.isStartupSyncDue()).toBe(true);

        storage.set('sync', JSON.stringify({
            ...getSyncStore(),
            lastSync: now - (9 * 60 * 1000)
        }));
        expect(SyncManager.__test.isStartupSyncDue()).toBe(false);
    });

    test('last data timestamp falls back only for legacy sync metadata', () => {
        const legacyTimestamp = 2_000_000_000_000;
        const { SyncManager } = loadModule();

        storage.set('sync_last_sync', legacyTimestamp);
        expect(SyncManager.__test.getLastDataTimestamp()).toBe(legacyTimestamp);

        storage.set('sync_last_sync_metadata_version', 2);
        expect(SyncManager.__test.getLastDataTimestamp()).toBeNull();

        storage.set('sync_last_data_timestamp', legacyTimestamp - 1000);
        expect(SyncManager.__test.getLastDataTimestamp()).toBe(legacyTimestamp - 1000);
    });

    test('scheduleSyncOnChange schedules a buffered sync', () => {
        jest.useFakeTimers();
        const { SyncManager } = loadModule();
        unlockSync(SyncManager);
        seedConfiguredState();
        storage.set('sync_auto_sync', true);

        jest.spyOn(global, 'setTimeout');
        SyncManager.scheduleSyncOnChange('target-update');

        expect(global.setTimeout).toHaveBeenCalled();
    });

    test('GoalTargetStore methods call scheduleSyncOnChange when available', () => {
        const { SyncManager, GoalTargetStore } = loadModule();
        const scheduleSpy = jest.spyOn(SyncManager, 'scheduleSyncOnChange').mockImplementation(() => {});

        GoalTargetStore.setTarget('goal-1', 25);
        GoalTargetStore.clearTarget('goal-1');
        GoalTargetStore.setFixed('goal-1', true);
        GoalTargetStore.clearFixed('goal-1');

        expect(scheduleSpy).toHaveBeenCalledWith('target-update');
        expect(scheduleSpy).toHaveBeenCalledWith('target-clear');
        expect(scheduleSpy).toHaveBeenCalledWith('fixed-update');
        expect(scheduleSpy).toHaveBeenCalledWith('fixed-clear');
    });

    test('collectConfigData and applyConfigData preserve cleared Endowus bucket markers', () => {
        const { SyncManager, GoalTargetStore } = loadModule();
        GoalTargetStore.clearBucket('goal-1', { suppressSync: true });

        const config = SyncManager.collectConfigData();
        expect(config.platforms.endowus.allocation.clearedGoalBuckets).toEqual({ 'goal-1': true });

        storage.clear();
        SyncManager.applyConfigData(config);

        expect(JSON.parse(storage.get('endowus')).allocation.clearedGoalBuckets['goal-1']).toBe(true);
    });

    test('collectConfigData emits v4 payload and excludes Endowus targets for fixed goals', () => {
        const { SyncManager } = loadModule();
        storage.set('endowus', JSON.stringify({
            goalTargets: { 'goal-1': 25 },
            goalFixed: { 'goal-1': true },
            goalBuckets: {},
            clearedGoalBuckets: {}
        }));

        const config = SyncManager.collectConfigData();

        expect(config.version).toBe(4);
        expect(config.platforms.endowus.allocation.goalTargets).toEqual({});
        expect(config.platforms.endowus.allocation.goalFixed).toEqual({ 'goal-1': true });
        expect(config.platforms.endowus.allocation.allocationModel).toEqual(expect.objectContaining({
            version: 1,
            targets: {
                'goal-1': expect.objectContaining({ fixed: true, targetPercent: null })
            }
        }));
        expect(config.platforms.fsm.allocation.targetsByCode).toEqual({});
    });

    test('applyConfigData skips Endowus targets when goal is fixed for v2 payload', () => {
        const { SyncManager } = loadModule();

        SyncManager.applyConfigData({
            version: 2,
            platforms: {
                endowus: {
                    goalTargets: { 'goal-1': 45 },
                    goalFixed: { 'goal-1': true },
                    timestamp: Date.now()
                },
                fsm: {
                    targetsByCode: {},
                    fixedByCode: {},
                    tagsByCode: {},
                    tagCatalog: [],
                    driftSettings: {},
                    timestamp: Date.now()
                }
            },
            timestamp: Date.now()
        });

        expect(JSON.parse(storage.get('endowus')).allocation.goalFixed['goal-1']).toBe(true);
        expect(JSON.parse(storage.get('endowus')).allocation.goalTargets['goal-1']).toBeUndefined();
    });

    test('applyConfigData migrates canonical allocationModel-only payloads into legacy-compatible stores', () => {
        const { SyncManager } = loadModule();

        SyncManager.applyConfigData({
            version: 3,
            platforms: {
                endowus: {
                    allocationModel: {
                        version: 1,
                        scopes: [{ id: 'Core Bucket', label: 'Core Bucket', kind: 'bucket' }],
                        assignments: { 'goal-1': { scopeId: 'Core Bucket' } },
                        targets: { 'goal-1': { targetPercent: 45, fixed: false } }
                    }
                },
                fsm: {
                    allocationModel: {
                        version: 1,
                        scopes: [{ id: 'core', label: 'Core Portfolio', kind: 'portfolio' }],
                        assignments: { AAA: { scopeId: 'core' } },
                        targets: {
                            AAA: { targetPercent: 25, fixed: false },
                            BBB: { targetPercent: null, fixed: true }
                        }
                    }
                },
                ocbc: {
                    allocationModel: {
                        version: 1,
                        scopes: [{
                            id: 'assets|P-1|core',
                            label: 'Core',
                            kind: 'subPortfolio',
                            parentId: 'assets|P-1|',
                            metadata: { viewKey: 'assets', portfolioNo: 'P-1', subPortfolioId: 'core' }
                        }],
                        assignments: { 'P-1:EQ1': { scopeId: 'assets|P-1|core' } },
                        targets: { 'assets|P-1|core|P-1%3AEQ1': { targetPercent: 55, fixed: false } },
                        ordering: { 'assets|P-1|core': ['P-1:EQ1'] }
                    }
                }
            },
            timestamp: Date.now()
        });

        const endowus = JSON.parse(storage.get('endowus'));
        expect(endowus.allocation.goalTargets).toEqual({ 'goal-1': 45 });
        expect(endowus.allocation.goalBuckets).toEqual({ 'goal-1': 'Core Bucket' });
        expect(endowus.allocation.allocationModel.targets['goal-1']).toEqual(expect.objectContaining({ targetPercent: 45, fixed: false }));

        const fsm = JSON.parse(storage.get('fsm'));
        expect(fsm.allocation.targetsByCode).toEqual({ AAA: 25 });
        expect(fsm.allocation.fixedByCode).toEqual({ BBB: true });
        expect(fsm.allocation.portfolios).toEqual([{ id: 'core', name: 'Core Portfolio', archived: false }]);
        expect(fsm.allocation.assignmentByCode).toEqual({ AAA: 'core' });
        expect(fsm.allocation.allocationModel.scopes[0]).toEqual(expect.objectContaining({ id: 'core', kind: 'portfolio' }));

        const ocbc = JSON.parse(storage.get('ocbc'));
        expect(ocbc.allocation.subPortfolios.assets['P-1']).toEqual([expect.objectContaining({ id: 'core', name: 'Core' })]);
        expect(ocbc.allocation.assignmentByCode).toEqual({ 'P-1:EQ1': 'core' });
        expect(ocbc.allocation.targetsByScope).toEqual({ 'assets|P-1|core|P-1%3AEQ1': 55 });
        expect(ocbc.allocation.orderByScope).toEqual({ 'assets|P-1|core': ['P-1:EQ1'] });
        expect(ocbc.allocation.allocationModel.scopes[0]).toEqual(expect.objectContaining({ id: 'assets|P-1|core', kind: 'subPortfolio' }));
    });

    test('applyConfigData updates namespaced stores and ignores flat platform keys', () => {
        const { SyncManager } = loadModule();
        storage.set('goal_target_pct_old-goal', 20);
        storage.set('fsm_target_pct_OLD', 10);

        SyncManager.applyConfigData({
            version: 2,
            platforms: {
                endowus: {
                    goalTargets: { 'kept-goal': 35 },
                    goalFixed: {},
                    goalBuckets: {},
                    clearedGoalBuckets: {},
                    timestamp: Date.now()
                },
                fsm: {
                    targetsByCode: { AAA: 25 },
                    fixedByCode: {},
                    tagsByCode: {},
                    tagCatalog: [],
                    driftSettings: {},
                    portfolios: [],
                    assignmentByCode: {},
                    timestamp: Date.now()
                }
            },
            timestamp: Date.now()
        });

        expect(storage.get('goal_target_pct_old-goal')).toBe(20);
        expect(storage.get('fsm_target_pct_OLD')).toBe(10);
        expect(JSON.parse(storage.get('endowus')).allocation.goalTargets['kept-goal']).toBe(35);
        expect(JSON.parse(storage.get('fsm')).allocation.targetsByCode.AAA).toBe(25);
    });

    test('enable persists remembered master key when remember-key is enabled', async () => {
        const { SyncManager } = loadModule();
        storage.set('sync_remember_key', true);
        storage.set('sync_master_key', btoa(String.fromCharCode(1, 2, 3, 4)));

        await expect(SyncManager.enable({
            serverUrl: 'https://sync.example.com',
            userId: 'user@example.com',
            password: 'password123',
            rememberKey: true
        })).resolves.toBeUndefined();

        const syncStore = getSyncStore();
        expect(syncStore.rememberKey).toBe(true);
        expect(typeof syncStore.rememberedMasterKey).toBe('string');
        expect(SyncManager.getStatus().hasSessionKey).toBe(true);
    });

    test('hydrates session key from remembered storage on module load', () => {
        storage.set('sync_remember_key', true);
        storage.set('sync_master_key', btoa(String.fromCharCode(7, 8, 9, 10)));

        const { SyncManager } = loadModule();

        expect(SyncManager.getStatus().hasSessionKey).toBe(true);
    });

    test('enable clears remembered key when remember-key is disabled', async () => {
        storage.set('sync_remember_key', true);
        storage.set('sync_master_key', btoa(String.fromCharCode(7, 8, 9, 10)));
        const { SyncManager } = loadModule();

        await SyncManager.enable({
            serverUrl: 'https://sync.example.com',
            userId: 'user@example.com',
            password: 'password123',
            rememberKey: false
        });

        const syncStore = getSyncStore();
        expect(syncStore.rememberKey).toBe(false);
        expect(syncStore.rememberedMasterKey).toBeUndefined();
    });

    test('enable clears stale crypto lock error after unlocking session key', async () => {
        seedConfiguredState();
        const { SyncManager } = loadModule();

        SyncManager.scheduleSyncOnChange('target-update');
        expect(SyncManager.getStatus()).toEqual(expect.objectContaining({
            lastError: 'Sync is locked. Enter your password and save settings to unlock encryption key.',
            hasSessionKey: false
        }));
        expect(SyncManager.getStatus().lastErrorMeta).toEqual(expect.objectContaining({
            category: 'crypto'
        }));

        await SyncManager.enable({
            serverUrl: 'https://sync.example.com',
            userId: 'user@example.com',
            password: 'password123'
        });

        expect(SyncManager.getStatus()).toEqual(expect.objectContaining({
            status: 'idle',
            lastError: null,
            lastErrorMeta: null,
            hasSessionKey: true,
            lastSync: null
        }));
    });

    test('enable preserves unrelated auth errors after unlocking session key', async () => {
        seedConfiguredState();
        const { SyncManager } = loadModule();
        unlockSync(SyncManager);
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        global.GM_xmlhttpRequest = jest.fn(({ url, method, onload }) => {
            if (url.includes('/sync/') && method === 'GET') {
                onload({
                    status: 403,
                    responseText: JSON.stringify({
                        error: 'AUTH_LOCKED',
                        message: 'Account locked'
                    }),
                    responseHeaders: ''
                });
                return;
            }
            onload({ status: 200, responseText: '{}', responseHeaders: '' });
        });

        try {
            await expect(SyncManager.performSync({ direction: 'download' })).rejects.toThrow('Account locked');
            expect(consoleErrorSpy).toHaveBeenCalledWith('[Goal Portfolio Viewer] Sync failed:', expect.any(Error));
            expect(SyncManager.getStatus().lastErrorMeta).toEqual(expect.objectContaining({
                category: 'auth'
            }));

            await SyncManager.enable({
                serverUrl: 'https://sync.example.com',
                userId: 'user@example.com',
                password: 'password123'
            });

            expect(SyncManager.getStatus()).toEqual(expect.objectContaining({
                lastError: 'Account locked',
                hasSessionKey: true
            }));
            expect(SyncManager.getStatus().lastErrorMeta).toEqual(expect.objectContaining({
                category: 'auth'
            }));
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });

    test('sync server URLs require HTTPS except localhost development URLs', async () => {
        const { SyncManager, utils } = loadModule();

        expect(utils.isAllowedSyncServerUrl('https://sync.example.com')).toBe(true);
        expect(utils.isAllowedSyncServerUrl('http://localhost:8787')).toBe(true);
        expect(utils.isAllowedSyncServerUrl('http://127.0.0.1:8787')).toBe(true);
        expect(utils.isAllowedSyncServerUrl('http://sync.example.com')).toBe(false);

        await expect(SyncManager.enable({
            serverUrl: 'http://sync.example.com',
            userId: 'user@example.com',
            password: 'password123'
        })).rejects.toThrow('HTTPS');
    });

    test('getStatus treats stored insecure sync URL as unconfigured without throwing', () => {
        storage.set('sync_enabled', true);
        storage.set('sync_server_url', 'http://sync.example.com');
        storage.set('sync_user_id', 'user@example.com');
        storage.set('sync_refresh_token', 'refresh-token');
        storage.set('sync_refresh_token_expiry', Date.now() + 120_000);

        const { SyncManager } = loadModule();

        expect(() => SyncManager.getStatus()).not.toThrow();
        expect(SyncManager.getStatus()).toEqual(expect.objectContaining({
            isConfigured: false
        }));
    });


    test('applyConfigData rejects legacy v1 payload', () => {
        const { SyncManager } = loadModule();
        expect(() => SyncManager.applyConfigData({
            version: 1,
            goalTargets: { 'goal-2': 33 },
            goalFixed: { 'goal-3': true },
            timestamp: Date.now()
        })).toThrow('Invalid config data');
    });

    test('collectConfigData ignores legacy flat platform keys', () => {
        const { SyncManager } = loadModule();
        storage.set('goal_target_pct_goal-1', 25);
        storage.set('fsm_target_pct_AAA', 20);
        storage.set('ocbc_target_pct_assets|P-1|core|P-1%3AEQ1', 50);

        const config = SyncManager.collectConfigData();

        expect(config.platforms.endowus.allocation.goalTargets).toEqual({});
        expect(config.platforms.fsm.allocation.targetsByCode).toEqual({});
        expect(config.platforms.ocbc.allocation.targetsByScope).toEqual({});
    });

    test('collectConfigData persists and exports namespaced Endowus data only', () => {
        const { SyncManager } = loadModule();
        storage.set('endowus', JSON.stringify({ goalTargets: { 'goal-existing': 22 } }));

        const config = SyncManager.collectConfigData();
        const endowusStore = JSON.parse(storage.get('endowus'));

        expect(config.platforms.endowus.allocation.goalTargets).toEqual({ 'goal-existing': 22 });
        expect(endowusStore.version).toBe(4);
    });

    test('collectConfigData includes FSM namespaced sync keys', () => {
        const { SyncManager } = loadModule();
        storage.set('fsm', JSON.stringify({
            targetsByCode: { AAA: 12 },
            fixedByCode: { BBB: true },
            portfolios: [{ id: 'core', name: 'Core', archived: false }],
            assignmentByCode: { AAA: 'core', BBB: 'unknown' }
        }));

        const config = SyncManager.collectConfigData();

        expect(config.platforms.fsm.allocation.targetsByCode).toEqual({ AAA: 12 });
        expect(config.platforms.fsm.allocation.fixedByCode).toEqual({ BBB: true });
        expect(config.platforms.fsm.allocation.portfolios).toEqual([{ id: 'core', name: 'Core', archived: false }]);
        expect(config.platforms.fsm.allocation.assignmentByCode).toEqual({ AAA: 'core', BBB: 'unassigned' });
    });

    test('applyConfigData stores FSM portfolio definitions and assignments', () => {
        const { SyncManager } = loadModule();
        SyncManager.applyConfigData({
            version: 2,
            platforms: {
                endowus: { goalTargets: {}, goalFixed: {}, timestamp: Date.now() },
                fsm: {
                    targetsByCode: {},
                    fixedByCode: {},
                    portfolios: [{ id: 'income', name: 'Income', archived: false }],
                    assignmentByCode: { AAPL: 'income', BOND: 'missing' },
                    timestamp: Date.now()
                }
            },
            timestamp: Date.now()
        });

        const fsm = JSON.parse(storage.get('fsm'));
        expect(fsm.allocation.portfolios).toEqual([{ id: 'income', name: 'Income', archived: false }]);
        expect(fsm.allocation.assignmentByCode).toEqual({ AAPL: 'income', BOND: 'unassigned' });
    });

    test('applyConfigData throws when namespaced store write fails', () => {
        const { SyncManager } = loadModule();
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        global.GM_setValue = jest.fn((key, value) => {
            if (key === 'fsm') {
                throw new Error('Write failed');
            }
            storage.set(key, value);
        });

        try {
            expect(() => SyncManager.applyConfigData({
                version: 2,
                platforms: {
                    endowus: { goalTargets: { 'goal-1': 20 }, goalFixed: {}, timestamp: Date.now() },
                    fsm: { targetsByCode: { AAA: 10 }, fixedByCode: {}, portfolios: [], assignmentByCode: {}, timestamp: Date.now() },
                    ocbc: { allocationBuckets: {}, subPortfolios: {}, assignmentByCode: {}, orderByScope: {}, targetsByScope: {}, timestamp: Date.now() }
                },
                timestamp: Date.now()
            })).toThrow('Failed to save FSM sync config data');
            expect(errorSpy).toHaveBeenCalledWith('[Goal Portfolio Viewer] Error saving FSM store:', expect.any(Error));
        } finally {
            errorSpy.mockRestore();
        }
    });

    test('applyConfigData rolls back earlier namespaced writes when later write fails', () => {
        const { SyncManager } = loadModule();
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        storage.set('endowus', JSON.stringify({
            goalTargets: { legacy: 25 },
            goalFixed: {},
            goalBuckets: {},
            clearedGoalBuckets: {}
        }));
        storage.set('fsm', JSON.stringify({
            targetsByCode: { LEGACY: 10 },
            fixedByCode: {},
            portfolios: [],
            assignmentByCode: {}
        }));

        global.GM_setValue = jest.fn((key, value) => {
            if (key === 'ocbc') {
                throw new Error('Write failed');
            }
            storage.set(key, value);
        });

        try {
            expect(() => SyncManager.applyConfigData({
                version: 2,
                platforms: {
                    endowus: { goalTargets: { 'goal-1': 80 }, goalFixed: {}, timestamp: Date.now() },
                    fsm: { targetsByCode: { AAA: 33 }, fixedByCode: {}, portfolios: [], assignmentByCode: {}, timestamp: Date.now() },
                    ocbc: { allocationBuckets: {}, subPortfolios: { assets: {} }, assignmentByCode: {}, orderByScope: {}, targetsByScope: {}, timestamp: Date.now() }
                },
                timestamp: Date.now()
            })).toThrow('Failed to save OCBC sync config data');
            expect(errorSpy).toHaveBeenCalledWith('[Goal Portfolio Viewer] Error saving OCBC store:', expect.any(Error));

            expect(JSON.parse(storage.get('endowus')).goalTargets).toEqual({ legacy: 25 });
            expect(JSON.parse(storage.get('fsm')).targetsByCode).toEqual({ LEGACY: 10 });
            expect(storage.has('ocbc')).toBe(false);
        } finally {
            errorSpy.mockRestore();
        }
    });

    test('applyConfigData rollback restores only namespaced platform stores', () => {
        const { SyncManager } = loadModule();
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        storage.set('endowus', JSON.stringify({ goalTargets: { keep: 25 }, goalFixed: {}, goalBuckets: {}, clearedGoalBuckets: {} }));
        storage.set('fsm', JSON.stringify({ targetsByCode: {}, fixedByCode: {}, portfolios: [], assignmentByCode: {} }));

        global.GM_setValue = jest.fn((key, value) => {
            if (key === 'ocbc') {
                throw new Error('Write failed');
            }
            storage.set(key, value);
        });

        try {
            expect(() => SyncManager.applyConfigData({
                version: 2,
                platforms: {
                    endowus: { goalTargets: { 'goal-1': 80 }, goalFixed: {}, timestamp: Date.now() },
                    fsm: { targetsByCode: { AAA: 33 }, fixedByCode: {}, portfolios: [], assignmentByCode: {}, timestamp: Date.now() },
                    ocbc: { allocationBuckets: {}, subPortfolios: { assets: {} }, assignmentByCode: {}, orderByScope: {}, targetsByScope: {}, timestamp: Date.now() }
                },
                timestamp: Date.now()
            })).toThrow('Failed to save OCBC sync config data');
            expect(errorSpy).toHaveBeenCalledWith('[Goal Portfolio Viewer] Error saving OCBC store:', expect.any(Error));
            expect(JSON.parse(storage.get('endowus')).goalTargets).toEqual({ keep: 25 });
            expect(storage.has('ocbc')).toBe(false);
        } finally {
            errorSpy.mockRestore();
        }
    });

    test('collectConfigData includes OCBC config and excludes raw holdings', () => {
        const { SyncManager } = loadModule();
        storage.set('ocbc', JSON.stringify({
            allocationBuckets: { assets: [{ id: 'legacy', name: 'Legacy' }] },
            subPortfolios: { assets: { 'P-1': [{ id: 'core', name: 'Core', archived: false, buckets: [{ id: 'legacy' }] }] } },
            assignmentByCode: { 'P-1:EQ1': { subPortfolioId: 'core', bucketId: 'legacy' } },
            orderByScope: { 'assets|P-1|core': ['P-1:EQ2', ' P-1:EQ1 ', 'P-1:EQ2', '', null] },
            targetsByScope: { 'assets|P-1|core|P-1%3AEQ1': 55 },
            holdings: { assets: [{ code: 'P-1:EQ1' }], liabilities: [] }
        }));

        const config = SyncManager.collectConfigData();
        expect(config.platforms.ocbc.allocation.subPortfolios.assets['P-1'][0]).toEqual(expect.objectContaining({ id: 'core', name: 'Core' }));
        expect(config.platforms.ocbc.allocation.subPortfolios.assets['P-1'][0].buckets).toBeUndefined();
        expect(config.platforms.ocbc.allocation.assignmentByCode).toEqual({ 'P-1:EQ1': 'core' });
        expect(config.platforms.ocbc.allocation.orderByScope).toEqual({
            'assets|P-1|core': ['P-1:EQ2', 'P-1:EQ1']
        });
        expect(config.platforms.ocbc.allocation.allocationBuckets).toEqual({ assets: [{ id: 'legacy', name: 'Legacy' }] });
        expect(config.platforms.ocbc.allocation.targetsByScope).toEqual({ 'assets|P-1|core|P-1%3AEQ1': 55 });
        expect(JSON.stringify(config)).not.toContain('api_ocbc_holdings');
        expect(JSON.stringify(config)).not.toContain('marketValueReferenceCcy');
        expect(config.platforms.ocbc.holdings).toBeUndefined();

        storage.clear();
        global.GM_listValues = () => [];
        SyncManager.applyConfigData(config);

        expect(JSON.parse(storage.get('ocbc')).allocation.orderByScope).toEqual({
            'assets|P-1|core': ['P-1:EQ2', 'P-1:EQ1']
        });
        expect(JSON.parse(storage.get('ocbc')).allocation.allocationBuckets).toEqual({ assets: [{ id: 'legacy', name: 'Legacy' }] });
        expect(JSON.parse(storage.get('ocbc')).datasets.holdings).toBeNull();
    });

    test('collectConfigData excludes Endowus raw API payload fields', () => {
        const { SyncManager } = loadModule();
        storage.set('endowus', JSON.stringify({
            performance: [{ goalId: 'goal-1' }],
            investible: [{ goalId: 'goal-1' }],
            summary: [{ goalId: 'goal-1' }],
            goalTargets: { 'goal-1': 50 },
            goalFixed: {},
            goalBuckets: {},
            clearedGoalBuckets: {}
        }));
        global.GM_listValues = () => Array.from(storage.keys());

        const config = SyncManager.collectConfigData();

        expect(config.platforms.endowus.allocation.goalTargets).toEqual({ 'goal-1': 50 });
        expect(config.platforms.endowus.datasets).toBeUndefined();
    });

    test('collectConfigData excludes Endowus local-only fields', () => {
        const { SyncManager } = loadModule();
        storage.set('endowus', JSON.stringify({
            performance: [{ goalId: 'goal-1' }],
            investible: [{ goalId: 'goal-1' }],
            summary: [{ goalId: 'goal-1' }],
            goalTargets: { 'goal-1': 42 },
            goalFixed: {},
            goalBuckets: {},
            clearedGoalBuckets: {},
            performanceCache: {
                'goal-1': { fetchedAt: 1_234, response: { goalId: 'goal-1' } }
            },
            uiPreferences: {
                bucketMode: 'performance',
                collapseState: {
                    'gpv_collapse_Retirement|GENERAL_WEALTH_ACCUMULATION|performance': false
                }
            }
        }));

        const config = SyncManager.collectConfigData();
        expect(config.platforms.endowus.allocation.goalTargets).toEqual({ 'goal-1': 42 });
        expect(config.platforms.endowus.localCache).toBeUndefined();
        expect(config.platforms.endowus.ui).toBeUndefined();
    });

    test('collectConfigData prunes stale Endowus performance cache on store read', () => {
        const { SyncManager } = loadModule();
        const now = 8 * 24 * 60 * 60 * 1000;
        Date.now = jest.fn(() => now);
        storage.set('endowus', JSON.stringify({
            performance: [{ goalId: 'goal-1' }],
            investible: [{ goalId: 'goal-1', goalName: 'Retirement - Goal 1', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' }],
            summary: [{ goalId: 'goal-1', goalName: 'Retirement - Goal 1', investmentGoalType: 'GENERAL_WEALTH_ACCUMULATION' }],
            goalTargets: {},
            goalFixed: {},
            goalBuckets: {},
            clearedGoalBuckets: {},
            performanceCache: {
                'goal-1': { fetchedAt: 1_000, response: { goalId: 'goal-1' } }
            },
            uiPreferences: {
                bucketMode: 'allocation',
                collapseState: {}
            }
        }));

        SyncManager.collectConfigData();

        const endowusStore = JSON.parse(storage.get('endowus'));
        expect(endowusStore.localCache.performanceCache?.['goal-1']).toBeUndefined();
    });

    test('applyConfigData preserves Endowus local-only fields', () => {
        const { SyncManager } = loadModule();
        const freshFetchedAt = Date.now();
        storage.set('endowus', JSON.stringify({
            goalTargets: { legacy: 10 },
            goalFixed: {},
            goalBuckets: {},
            clearedGoalBuckets: {},
            performanceCache: {
                'goal-1': { fetchedAt: freshFetchedAt, response: { goalId: 'goal-1' } }
            },
            uiPreferences: {
                bucketMode: 'performance',
                collapseState: {
                    'gpv_collapse_Retirement|GENERAL_WEALTH_ACCUMULATION|performance': false
                }
            }
        }));

        SyncManager.applyConfigData({
            version: 2,
            platforms: {
                endowus: {
                    goalTargets: { 'goal-new': 55 },
                    goalFixed: {},
                    goalBuckets: {},
                    clearedGoalBuckets: {},
                    timestamp: Date.now()
                },
                fsm: { targetsByCode: {}, fixedByCode: {}, portfolios: [], assignmentByCode: {}, timestamp: Date.now() },
                ocbc: { allocationBuckets: {}, subPortfolios: {}, assignmentByCode: {}, orderByScope: {}, targetsByScope: {}, timestamp: Date.now() }
            },
            timestamp: Date.now()
        });

        const endowusStore = JSON.parse(storage.get('endowus'));
        expect(endowusStore.allocation.goalTargets).toEqual({ 'goal-new': 55 });
        expect(endowusStore.localCache.performanceCache?.['goal-1']).toEqual({ fetchedAt: freshFetchedAt, response: { goalId: 'goal-1' } });
        expect(endowusStore.ui.uiPreferences).toEqual(expect.objectContaining({
            bucketMode: 'performance'
        }));
        expect(endowusStore.ui.uiPreferences.collapseState?.['gpv_collapse_Retirement|GENERAL_WEALTH_ACCUMULATION|performance']).toBe(false);
    });

    test('collectConfigData does not run legacy cleanup repeatedly without legacy keys', () => {
        const { SyncManager } = loadModule();
        const deleteSpy = jest.spyOn(global, 'GM_deleteValue');
        storage.set('endowus', JSON.stringify({ performance: null, investible: null, summary: null, goalTargets: {}, goalFixed: {}, goalBuckets: {}, clearedGoalBuckets: {} }));
        storage.set('fsm', JSON.stringify({ holdings: [], targetsByCode: {}, fixedByCode: {}, portfolios: [], assignmentByCode: {} }));
        storage.set('ocbc', JSON.stringify({ holdings: null, allocationBuckets: {}, subPortfolios: {}, assignmentByCode: {}, orderByScope: {}, targetsByScope: {} }));
        global.GM_listValues = () => ['endowus', 'fsm', 'ocbc'];

        SyncManager.collectConfigData();
        SyncManager.collectConfigData();

        expect(deleteSpy).not.toHaveBeenCalled();
        expect(JSON.parse(storage.get('endowus')).allocation.allocationModel.version).toBe(1);
        expect(JSON.parse(storage.get('fsm')).allocation.allocationModel.version).toBe(1);
        expect(JSON.parse(storage.get('ocbc')).allocation.allocationModel.version).toBe(1);
    });

    test('hashConfigData ignores OCBC timestamp-only differences', async () => {
        const { SyncManager } = loadModule();
        const baseConfig = {
            version: 2,
            platforms: {
                endowus: { goalTargets: {}, goalFixed: {}, timestamp: 100 },
                fsm: { targetsByCode: {}, fixedByCode: {}, portfolios: [], assignmentByCode: {}, timestamp: 100 },
                ocbc: {
                    allocationBuckets: {},
                    subPortfolios: { assets: { 'P-1': [{ id: 'core', name: 'Core', archived: false }] } },
                    assignmentByCode: { 'P-1:gpv-ocbc-deadbeef': 'core' },
                    orderByScope: { 'assets|P-1|core': ['P-1:gpv-ocbc-deadbeef'] },
                    targetsByScope: { 'assets|P-1|core|P-1%3Agpv-ocbc-deadbeef': 40 },
                    timestamp: 111
                }
            },
            metadata: { lastModified: 100 },
            timestamp: 100
        };
        const sameConfigDifferentOcbcTimestamp = {
            ...baseConfig,
            platforms: {
                ...baseConfig.platforms,
                ocbc: {
                    ...baseConfig.platforms.ocbc,
                    timestamp: 222
                }
            },
            metadata: { lastModified: 200 },
            timestamp: 200
        };

        const firstHash = await SyncManager.__test.hashConfigData(baseConfig);
        const secondHash = await SyncManager.__test.hashConfigData(sameConfigDifferentOcbcTimestamp);
        expect(firstHash).toBe(secondHash);
    });

    test('applyConfigData stores OCBC config in namespaced store', () => {
        const { SyncManager } = loadModule();

        SyncManager.applyConfigData({
            version: 2,
            platforms: {
                endowus: { goalTargets: {}, goalFixed: {}, timestamp: Date.now() },
                fsm: { targetsByCode: {}, fixedByCode: {}, portfolios: [], assignmentByCode: {}, timestamp: Date.now() },
                ocbc: {
                    allocationBuckets: {},
                    subPortfolios: { assets: { 'P-1': [{ id: 'core', name: 'Core', archived: false, buckets: [{ id: 'drop-me' }] }] } },
                    assignmentByCode: { 'P-1:EQ1': { subPortfolioId: 'core', bucketId: 'legacy' } },
                    targetsByScope: { 'assets|P-1|core|P-1%3AEQ1': 60 },
                    timestamp: Date.now()
                }
            },
            timestamp: Date.now()
        });

        const ocbc = JSON.parse(storage.get('ocbc'));
        expect(ocbc.allocation.subPortfolios.assets['P-1'][0].buckets).toBeUndefined();
        expect(ocbc.allocation.assignmentByCode).toEqual({ 'P-1:EQ1': 'core' });
        expect(ocbc.allocation.targetsByScope).toEqual({ 'assets|P-1|core|P-1%3AEQ1': 60 });
        expect(ocbc.allocation.allocationBuckets).toEqual({});
    });

    test('collectConfigData uses namespaced OCBC allocation buckets', () => {
        const { SyncManager } = loadModule();
        storage.set('ocbc', JSON.stringify({ allocationBuckets: { assets: [{ id: 'legacy', name: 'Legacy' }] }, subPortfolios: {}, assignmentByCode: {}, orderByScope: {}, targetsByScope: {} }));

        const config = SyncManager.collectConfigData();

        expect(config.platforms.ocbc.allocation.allocationBuckets).toEqual({ assets: [{ id: 'legacy', name: 'Legacy' }] });
        const ocbc = JSON.parse(storage.get('ocbc'));
        expect(ocbc.allocation.allocationBuckets).toEqual({ assets: [{ id: 'legacy', name: 'Legacy' }] });
    });

    describe('multi-device reconciliation', () => {
        test('resolveConflict(local) records attempt time separately from forced data timestamp', async () => {
            seedConfiguredState();
            global.GM_xmlhttpRequest = undefined;
            const { SyncManager } = loadModule();
            unlockSync(SyncManager);

            const serverTimestamp = 2_000_000_000_000;
            const now = serverTimestamp + 5000;
            Date.now = jest.fn(() => now);
            storage.set('sync_refresh_token_expiry', now + 120_000);

            const responsePayload = { success: true, timestamp: serverTimestamp };
            fetchMock = jest.fn((url, options = {}) => {
                if (url.includes('/auth/refresh')) {
                    return Promise.resolve({
                        status: 200,
                        ok: true,
                        json: () => Promise.resolve({
                            success: true,
                            tokens: {
                                accessToken: 'access-token',
                                refreshToken: 'refresh-token',
                                accessExpiresAt: now + 60_000,
                                refreshExpiresAt: now + 120_000
                            }
                        }),
                        text: () => Promise.resolve('{"success":true}'),
                        headers: { get: () => null }
                    });
                }
                if (url.includes('/sync') && options.method === 'POST') {
                    const body = JSON.parse(options.body);
                    expect(body.force).toBe(true);
                    expect(body.timestamp).toBe(now);
                    return Promise.resolve({
                        status: 200,
                        ok: true,
                        json: () => Promise.resolve(responsePayload),
                        text: () => Promise.resolve(JSON.stringify(responsePayload)),
                        headers: { get: () => null }
                    });
                }
                return Promise.resolve({
                    status: 200,
                    ok: true,
                    json: () => Promise.resolve({}),
                    text: () => Promise.resolve('{}'),
                    headers: { get: () => null }
                });
            });
            global.fetch = fetchMock;
            window.fetch = fetchMock;
            document.dispatchEvent = jest.fn();

            const conflict = {
                local: {
                    version: 2,
                    platforms: {
                        endowus: { goalTargets: { 'goal-1': 25 }, goalFixed: {}, timestamp: now - 10_000 },
                        fsm: { targetsByCode: {}, fixedByCode: {}, tagsByCode: {}, tagCatalog: [], portfolios: [], assignmentByCode: {}, driftSettings: {}, timestamp: now - 10_000 }
                    },
                    metadata: { lastModified: now - 10_000 },
                    timestamp: now - 10_000
                },
                remote: {
                    version: 2,
                    platforms: {
                        endowus: { goalTargets: { 'goal-1': 50 }, goalFixed: {}, timestamp: now - 5_000 },
                        fsm: { targetsByCode: {}, fixedByCode: {}, tagsByCode: {}, tagCatalog: [], portfolios: [], assignmentByCode: {}, driftSettings: {}, timestamp: now - 5_000 }
                    },
                    metadata: { lastModified: now - 5_000 },
                    timestamp: now - 5_000
                },
                localTimestamp: now - 10_000,
                remoteTimestamp: now - 5_000
            };

            await expect(SyncManager.resolveConflict('local', conflict)).resolves.toBeUndefined();

            expect(document.dispatchEvent).toHaveBeenCalled();

            const syncStore = getSyncStore();
            expect(syncStore.lastSync).toBe(now);
            expect(syncStore.lastSyncMetadataVersion).toBe(2);
            expect(syncStore.lastDataTimestamp).toBe(serverTimestamp);
            expect(syncStore.lastSyncHash).toEqual(expect.any(String));
        });

        test('resolveConflict(remote) records attempt time separately from remote data timestamp', async () => {
            seedConfiguredState();
            const { SyncManager } = loadModule();
            unlockSync(SyncManager);

            const remoteTimestamp = 2_000_000_000_000;
            const now = remoteTimestamp + 5000;
            Date.now = jest.fn(() => now);
            document.dispatchEvent = jest.fn();

            const conflict = {
                local: {
                    version: 2,
                    platforms: {
                        endowus: { goalTargets: { 'goal-1': 25 }, goalFixed: {}, timestamp: now - 10_000 },
                        fsm: { targetsByCode: {}, fixedByCode: {}, tagsByCode: {}, tagCatalog: [], portfolios: [], assignmentByCode: {}, driftSettings: {}, timestamp: now - 10_000 }
                    },
                    metadata: { lastModified: now - 10_000 },
                    timestamp: now - 10_000
                },
                remote: {
                    version: 2,
                    platforms: {
                        endowus: { goalTargets: { 'goal-1': 50 }, goalFixed: {}, timestamp: remoteTimestamp },
                        fsm: { targetsByCode: {}, fixedByCode: {}, tagsByCode: {}, tagCatalog: [], portfolios: [], assignmentByCode: {}, driftSettings: {}, timestamp: remoteTimestamp }
                    },
                    metadata: { lastModified: remoteTimestamp },
                    timestamp: remoteTimestamp
                },
                localTimestamp: now - 10_000,
                remoteTimestamp
            };

            await expect(SyncManager.resolveConflict('remote', conflict)).resolves.toBeUndefined();

            expect(document.dispatchEvent).toHaveBeenCalled();
            expect(JSON.parse(storage.get('endowus')).allocation.goalTargets['goal-1']).toBe(50);
            const syncStore = getSyncStore();
            expect(syncStore.lastSync).toBe(now);
            expect(syncStore.lastSyncMetadataVersion).toBe(2);
            expect(syncStore.lastDataTimestamp).toBe(remoteTimestamp);
            expect(syncStore.lastSyncHash).toEqual(expect.any(String));
        });

        test('performSync(both) treats identical content from another device as up to date', async () => {
            seedConfiguredState();
            storage.set('sync_access_token_expiry', Date.now() - 1_000);
            global.GM_xmlhttpRequest = undefined;
            const { SyncManager, SyncEncryption } = loadModule();
            unlockSync(SyncManager);
            storage.set('endowus', JSON.stringify({ goalTargets: { 'goal-1': 25 }, goalFixed: {}, goalBuckets: {}, clearedGoalBuckets: {} }));

            const serverTimestamp = Date.now() + 60_000;
            Date.now = jest.fn(() => serverTimestamp + 1);
            storage.set('sync', JSON.stringify({
                ...getSyncStore(),
                enabled: true,
                serverUrl: 'https://sync.example.com',
                userId: 'user@example.com',
                refreshToken: 'refresh-token',
                refreshTokenExpiry: serverTimestamp + 120_000,
                accessToken: 'access-token',
                accessTokenExpiry: Date.now() - 1_000
            }));
            const serverUrl = 'https://sync.example.com';
            const serverConfig = {
                version: 2,
                platforms: {
                    endowus: {
                        goalTargets: { 'goal-1': 25 },
                        goalFixed: {},
                        timestamp: serverTimestamp
                    },
                    fsm: {
                        targetsByCode: {},
                        fixedByCode: {},
                        tagsByCode: {},
                        tagCatalog: [],
                        driftSettings: {},
                        timestamp: serverTimestamp
                    }
                },
                timestamp: serverTimestamp
            };
            const encryptedData = await SyncEncryption.encryptWithMasterKey(
                JSON.stringify(serverConfig),
                new Uint8Array([1, 2, 3, 4])
            );

            fetchMock = jest.fn((url, options = {}) => {
                if (url === `${serverUrl}/auth/refresh`) {
                    return Promise.resolve({
                        status: 200,
                        ok: true,
                        json: () => Promise.resolve({
                            success: true,
                            tokens: {
                                accessToken: 'access-token',
                                refreshToken: 'refresh-token',
                                accessExpiresAt: Date.now() + 60_000,
                                refreshExpiresAt: Date.now() + 120_000
                            }
                        }),
                        text: () => Promise.resolve(JSON.stringify({
                            success: true,
                            tokens: {
                                accessToken: 'access-token',
                                refreshToken: 'refresh-token',
                                accessExpiresAt: Date.now() + 60_000,
                                refreshExpiresAt: Date.now() + 120_000
                            }
                        })),
                        headers: { get: () => null }
                    });
                }
                if (url.includes('/sync/') && options.method === 'GET') {
                    return Promise.resolve({
                        status: 200,
                        ok: true,
                        json: () => Promise.resolve({
                            success: true,
                            data: {
                                encryptedData,
                                deviceId: 'other-device-id',
                                timestamp: serverTimestamp,
                                version: 2
                            }
                        }),
                        text: () => Promise.resolve(JSON.stringify({
                            success: true,
                            data: {
                                encryptedData,
                                deviceId: 'other-device-id',
                                timestamp: serverTimestamp,
                                version: 2
                            }
                        })),
                        headers: { get: () => null }
                    });
                }
                if (url.includes('/sync') && options.method === 'POST') {
                    return Promise.resolve({
                        status: 200,
                        ok: true,
                        json: () => Promise.resolve({ success: true }),
                        text: () => Promise.resolve('{"success":true}'),
                        headers: { get: () => null }
                    });
                }
                return Promise.resolve({
                    status: 200,
                    ok: true,
                    json: () => Promise.resolve({}),
                    text: () => Promise.resolve('{}'),
                    headers: { get: () => null }
                });
            });
            global.fetch = fetchMock;
            window.fetch = fetchMock;

            await expect(SyncManager.performSync({ direction: 'both' })).resolves.toEqual({ status: 'success' });

            const syncPostCalls = fetchMock.mock.calls.filter(([url, options = {}]) => options.method === 'POST' && url.includes('/sync') && !url.includes('/auth'));
            expect(syncPostCalls).toHaveLength(0);
            const syncStore = getSyncStore();
            expect(syncStore.lastSync).toBe(serverTimestamp + 1);
            expect(syncStore.lastDataTimestamp).toBe(serverTimestamp);
            expect(syncStore.lastSyncHash).toEqual(expect.any(String));
        });

        test('performSync(both) bootstraps from remote when local sync metadata is missing', async () => {
            seedConfiguredState();
            storage.delete('sync_last_sync');
            storage.delete('sync_last_hash');
            storage.set('sync_access_token_expiry', Date.now() - 1_000);
            global.GM_xmlhttpRequest = undefined;
            const { SyncManager, SyncEncryption } = loadModule();
            unlockSync(SyncManager);
            storage.set('endowus', JSON.stringify({ goalTargets: { 'local-goal': 25 }, goalFixed: {}, goalBuckets: {}, clearedGoalBuckets: {} }));

            const serverTimestamp = Date.now() + 60_000;
            Date.now = jest.fn(() => serverTimestamp + 1);
            storage.set('sync', JSON.stringify({
                ...getSyncStore(),
                enabled: true,
                serverUrl: 'https://sync.example.com',
                userId: 'user@example.com',
                refreshToken: 'refresh-token',
                refreshTokenExpiry: serverTimestamp + 120_000,
                accessToken: 'access-token',
                accessTokenExpiry: Date.now() - 1_000
            }));
            const serverUrl = 'https://sync.example.com';
            const serverConfig = {
                version: 2,
                platforms: {
                    endowus: {
                        goalTargets: { 'remote-goal': 45 },
                        goalFixed: {},
                        timestamp: serverTimestamp
                    },
                    fsm: {
                        targetsByCode: {},
                        fixedByCode: {},
                        tagsByCode: {},
                        tagCatalog: [],
                        driftSettings: {},
                        timestamp: serverTimestamp
                    }
                },
                timestamp: serverTimestamp
            };
            const encryptedData = await SyncEncryption.encryptWithMasterKey(
                JSON.stringify(serverConfig),
                new Uint8Array([1, 2, 3, 4])
            );

            fetchMock = jest.fn((url, options = {}) => {
                if (url === `${serverUrl}/auth/refresh`) {
                    return Promise.resolve({
                        status: 200,
                        ok: true,
                        json: () => Promise.resolve({
                            success: true,
                            tokens: {
                                accessToken: 'access-token',
                                refreshToken: 'refresh-token',
                                accessExpiresAt: Date.now() + 60_000,
                                refreshExpiresAt: Date.now() + 120_000
                            }
                        }),
                        text: () => Promise.resolve(JSON.stringify({
                            success: true,
                            tokens: {
                                accessToken: 'access-token',
                                refreshToken: 'refresh-token',
                                accessExpiresAt: Date.now() + 60_000,
                                refreshExpiresAt: Date.now() + 120_000
                            }
                        })),
                        headers: { get: () => null }
                    });
                }
                if (url.includes('/sync/') && options.method === 'GET') {
                    return Promise.resolve({
                        status: 200,
                        ok: true,
                        json: () => Promise.resolve({
                            success: true,
                            data: {
                                encryptedData,
                                deviceId: 'other-device-id',
                                timestamp: serverTimestamp,
                                version: 2
                            }
                        }),
                        text: () => Promise.resolve(JSON.stringify({
                            success: true,
                            data: {
                                encryptedData,
                                deviceId: 'other-device-id',
                                timestamp: serverTimestamp,
                                version: 2
                            }
                        })),
                        headers: { get: () => null }
                    });
                }
                if (url.includes('/sync') && options.method === 'POST') {
                    return Promise.resolve({
                        status: 200,
                        ok: true,
                        json: () => Promise.resolve({ success: true }),
                        text: () => Promise.resolve('{"success":true}'),
                        headers: { get: () => null }
                    });
                }
                return Promise.resolve({
                    status: 200,
                    ok: true,
                    json: () => Promise.resolve({}),
                    text: () => Promise.resolve('{}'),
                    headers: { get: () => null }
                });
            });
            global.fetch = fetchMock;
            window.fetch = fetchMock;

            await expect(SyncManager.performSync({ direction: 'both' })).resolves.toEqual({ status: 'success' });

            const syncPostCalls = fetchMock.mock.calls.filter(([url, options = {}]) => options.method === 'POST' && url.includes('/sync') && !url.includes('/auth'));
            expect(syncPostCalls).toHaveLength(0);
            expect(JSON.parse(storage.get('endowus')).allocation.goalTargets['local-goal']).toBeUndefined();
            expect(JSON.parse(storage.get('endowus')).allocation.goalTargets['remote-goal']).toBe(45);
            const syncStore = getSyncStore();
            expect(syncStore.lastSync).toBe(serverTimestamp + 1);
            expect(syncStore.lastDataTimestamp).toBe(serverTimestamp);
            expect(syncStore.lastSyncHash).toEqual(expect.any(String));
        });

        test('attempt-only sync after partial migration metadata does not become data freshness', async () => {
            seedConfiguredState();
            global.GM_xmlhttpRequest = undefined;
            const { SyncManager, SyncEncryption } = loadModule();
            unlockSync(SyncManager);
            storage.set('endowus', JSON.stringify({ goalTargets: { 'goal-1': 25 }, goalFixed: {}, goalBuckets: {}, clearedGoalBuckets: {} }));

            const initialTimestamp = 2_000_000_000_000;
            const attemptTimestamp = initialTimestamp + 60_000;
            const serverTimestamp = initialTimestamp + 30_000;
            const serverUrl = 'https://sync.example.com';
            const serverConfig = {
                version: 2,
                platforms: {
                    endowus: {
                        goalTargets: { 'goal-1': 50 },
                        goalFixed: {},
                        timestamp: serverTimestamp
                    },
                    fsm: {
                        targetsByCode: {},
                        fixedByCode: {},
                        tagsByCode: {},
                        tagCatalog: [],
                        driftSettings: {},
                        timestamp: serverTimestamp
                    }
                },
                timestamp: serverTimestamp
            };
            const encryptedData = await SyncEncryption.encryptWithMasterKey(
                JSON.stringify(serverConfig),
                new Uint8Array([1, 2, 3, 4])
            );

            let phase = 'initial-upload';
            Date.now = jest.fn(() => initialTimestamp);
            storage.set('sync', JSON.stringify({
                ...getSyncStore(),
                enabled: true,
                serverUrl: 'https://sync.example.com',
                userId: 'user@example.com',
                refreshToken: 'refresh-token',
                refreshTokenExpiry: attemptTimestamp + 120_000,
                accessToken: 'access-token',
                accessTokenExpiry: attemptTimestamp + 120_000
            }));
            fetchMock = jest.fn((url, options = {}) => {
                if (url === `${serverUrl}/auth/refresh`) {
                    return Promise.resolve({
                        status: 200,
                        ok: true,
                        json: () => Promise.resolve({
                            success: true,
                            tokens: {
                                accessToken: 'access-token',
                                refreshToken: 'refresh-token',
                                accessExpiresAt: Date.now() + 60_000,
                                refreshExpiresAt: Date.now() + 120_000
                            }
                        }),
                        text: () => Promise.resolve('{"success":true}'),
                        headers: { get: () => null }
                    });
                }
                if (url.includes('/sync/') && options.method === 'GET') {
                    if (phase === 'remote-available') {
                        return Promise.resolve({
                            status: 200,
                            ok: true,
                            json: () => Promise.resolve({
                                success: true,
                                data: {
                                    encryptedData,
                                    deviceId: 'other-device-id',
                                    timestamp: serverTimestamp,
                                    version: 2
                                }
                            }),
                            text: () => Promise.resolve(JSON.stringify({
                                success: true,
                                data: {
                                    encryptedData,
                                    deviceId: 'other-device-id',
                                    timestamp: serverTimestamp,
                                    version: 2
                                }
                            })),
                            headers: { get: () => null }
                        });
                    }
                    return Promise.resolve({
                        status: 404,
                        ok: false,
                        json: () => Promise.resolve({}),
                        text: () => Promise.resolve('{}'),
                        headers: { get: () => null }
                    });
                }
                if (url.includes('/sync') && options.method === 'POST') {
                    return Promise.resolve({
                        status: 200,
                        ok: true,
                        json: () => Promise.resolve({ success: true }),
                        text: () => Promise.resolve('{"success":true}'),
                        headers: { get: () => null }
                    });
                }
                return Promise.resolve({
                    status: 200,
                    ok: true,
                    json: () => Promise.resolve({}),
                    text: () => Promise.resolve('{}'),
                    headers: { get: () => null }
                });
            });
            global.fetch = fetchMock;
            window.fetch = fetchMock;

            await expect(SyncManager.performSync({ direction: 'both' })).resolves.toEqual({ status: 'success' });
            expect(getSyncStore().lastSyncHash).toEqual(expect.any(String));

            const syncStoreBeforeAttempt = getSyncStore();
            delete syncStoreBeforeAttempt.lastDataTimestamp;
            delete syncStoreBeforeAttempt.lastSyncMetadataVersion;
            storage.set('sync', JSON.stringify(syncStoreBeforeAttempt));
            Date.now = jest.fn(() => attemptTimestamp);
            phase = 'attempt-only';
            await expect(SyncManager.performSync({ direction: 'download' })).resolves.toEqual({ status: 'success' });
            const syncStore = getSyncStore();
            expect(syncStore.lastSync).toBe(attemptTimestamp);
            expect(syncStore.lastSyncMetadataVersion).toBe(2);
            expect(syncStore.lastDataTimestamp).toBeUndefined();

            phase = 'remote-available';
            const postCountBeforeRemoteSync = fetchMock.mock.calls.filter(([url, options = {}]) => options.method === 'POST' && url.includes('/sync') && !url.includes('/auth')).length;

            await expect(SyncManager.performSync({ direction: 'both' })).resolves.toEqual({ status: 'success' });

            const postCountAfterRemoteSync = fetchMock.mock.calls.filter(([url, options = {}]) => options.method === 'POST' && url.includes('/sync') && !url.includes('/auth')).length;
            expect(postCountAfterRemoteSync).toBe(postCountBeforeRemoteSync);
            expect(JSON.parse(storage.get('endowus')).allocation.goalTargets['goal-1']).toBe(50);
            const syncStoreAfterRemote = getSyncStore();
            expect(syncStoreAfterRemote.lastSync).toBe(attemptTimestamp);
            expect(syncStoreAfterRemote.lastDataTimestamp).toBe(serverTimestamp);
        });

        test('performSync(download) stores attempt and data timestamps separately', async () => {
            seedConfiguredState();
            storage.set('sync_access_token_expiry', Date.now() - 1_000);
            global.GM_xmlhttpRequest = undefined;
            const { SyncManager, SyncEncryption } = loadModule();
            unlockSync(SyncManager);

            const serverUrl = 'https://sync.example.com';

            const serverTimestamp = 1_700_000_000_000;
            Date.now = jest.fn(() => serverTimestamp + 1);
            storage.set('sync_refresh_token_expiry', serverTimestamp + 120_000);
            const serverConfig = {
                version: 2,
                platforms: {
                    endowus: {
                        goalTargets: { 'goal-2': 40 },
                        goalFixed: {},
                        timestamp: serverTimestamp
                    },
                    fsm: {
                        targetsByCode: {},
                        fixedByCode: {},
                        portfolios: [],
                        assignmentByCode: {},
                        timestamp: serverTimestamp
                    }
                },
                timestamp: serverTimestamp
            };
            const encryptedData = await SyncEncryption.encryptWithMasterKey(
                JSON.stringify(serverConfig),
                new Uint8Array([1, 2, 3, 4])
            );

            fetchMock = jest.fn((url, options = {}) => {
                if (url === `${serverUrl}/auth/refresh`) {
                    return Promise.resolve({
                        status: 200,
                        ok: true,
                        json: () => Promise.resolve({
                            success: true,
                            tokens: {
                                accessToken: 'access-token',
                                refreshToken: 'refresh-token',
                                accessExpiresAt: Date.now() + 60_000,
                                refreshExpiresAt: Date.now() + 120_000
                            }
                        }),
                        text: () => Promise.resolve(JSON.stringify({
                            success: true,
                            tokens: {
                                accessToken: 'access-token',
                                refreshToken: 'refresh-token',
                                accessExpiresAt: Date.now() + 60_000,
                                refreshExpiresAt: Date.now() + 120_000
                            }
                        })),
                        headers: { get: () => null }
                    });
                }
                if (url.includes('/sync/') && options.method === 'GET') {
                    return Promise.resolve({
                        status: 200,
                        ok: true,
                        json: () => Promise.resolve({
                            success: true,
                            data: {
                                encryptedData,
                                deviceId: 'other-device-id',
                                timestamp: serverTimestamp,
                                version: 2
                            }
                        }),
                        text: () => Promise.resolve(JSON.stringify({
                            success: true,
                            data: {
                                encryptedData,
                                deviceId: 'other-device-id',
                                timestamp: serverTimestamp,
                                version: 2
                            }
                        })),
                        headers: { get: () => null }
                    });
                }
                if (url.includes('/sync') && options.method === 'POST') {
                    return Promise.resolve({
                        status: 200,
                        ok: true,
                        json: () => Promise.resolve({ success: true }),
                        text: () => Promise.resolve('{"success":true}'),
                        headers: { get: () => null }
                    });
                }
                return Promise.resolve({
                    status: 200,
                    ok: true,
                    json: () => Promise.resolve({}),
                    text: () => Promise.resolve('{}'),
                    headers: { get: () => null }
                });
            });
            global.fetch = fetchMock;
            window.fetch = fetchMock;

            await expect(SyncManager.performSync({ direction: 'download' })).resolves.toEqual({ status: 'success' });

            const syncStore = getSyncStore();
            expect(syncStore.lastSync).toBe(serverTimestamp + 1);
            expect(syncStore.lastDataTimestamp).toBe(serverTimestamp);
            expect(syncStore.lastSyncHash).toEqual(expect.any(String));
            expect(JSON.parse(storage.get('endowus')).allocation.goalTargets['goal-2']).toBe(40);
        });
    });

    test('register uses GM_xmlhttpRequest transport when available', async () => {
        global.GM_xmlhttpRequest = jest.fn(({ onload }) => {
            onload({
                status: 200,
                responseText: JSON.stringify({ success: true })
            });
        });
        fetchMock.mockImplementation(() => {
            throw new Error('fetch should not be called when GM_xmlhttpRequest is available');
        });

        const { SyncManager } = loadModule();
        await expect(SyncManager.register('https://sync.example.com', 'user@example.com', 'password123')).resolves.toEqual({ success: true });
        expect(global.GM_xmlhttpRequest).toHaveBeenCalled();
    });

    describe('token helpers', () => {
        const ACCESS_EXPIRY_KEY = 'sync_access_token_expiry';

        function createJwt(payload) {
            const base64 = Buffer.from(JSON.stringify(payload))
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/g, '');
            return `header.${base64}.signature`;
        }

        test('parseJwtPayload handles valid and invalid tokens', () => {
            const { SyncManager } = loadModule();
            const { parseJwtPayload } = SyncManager.__test;
            const payload = { exp: Math.floor(Date.now() / 1000) + 120, sub: 'user-1' };
            const token = createJwt(payload);

            expect(parseJwtPayload(token)).toEqual(payload);
            expect(parseJwtPayload('header.invalid%%.signature')).toBeNull();
            expect(parseJwtPayload('not-a-jwt')).toBeNull();
            expect(parseJwtPayload('one.two')).toBeNull();
        });

        test('getStoredTokenExpiry returns stored expiry or parses exp', () => {
            const { SyncManager } = loadModule();
            const { getStoredTokenExpiry } = SyncManager.__test;
            const storedExpiry = Date.now() + 300_000;
            const token = createJwt({ exp: Math.floor(Date.now() / 1000) + 120 });
            const noExpToken = createJwt({ sub: 'user-2' });

            storage.set(ACCESS_EXPIRY_KEY, storedExpiry);
            expect(getStoredTokenExpiry(ACCESS_EXPIRY_KEY, token)).toBe(storedExpiry);

            storage.delete(ACCESS_EXPIRY_KEY);
            expect(getStoredTokenExpiry(ACCESS_EXPIRY_KEY, token)).toBeGreaterThan(Date.now());
            expect(getStoredTokenExpiry(ACCESS_EXPIRY_KEY, noExpToken)).toBeNull();
        });

        test('isTokenValid handles expired, near-expiry, and missing expiry', () => {
            const { SyncManager } = loadModule();
            const { isTokenValid } = SyncManager.__test;
            const now = Date.now();
            Date.now = jest.fn(() => now);

            const expiredToken = createJwt({ exp: Math.floor((now - 5_000) / 1000) });
            const nearExpiryToken = createJwt({ exp: Math.floor((now + 30_000) / 1000) });
            const noExpToken = createJwt({ sub: 'user-3' });

            expect(isTokenValid(expiredToken, ACCESS_EXPIRY_KEY)).toBe(false);
            expect(isTokenValid(nearExpiryToken, ACCESS_EXPIRY_KEY)).toBe(false);
            expect(isTokenValid(noExpToken, ACCESS_EXPIRY_KEY)).toBe(false);
        });

        test('refreshAccessToken clears tokens and surfaces error on failure', async () => {
            seedConfiguredWithoutAccessToken();
            const { SyncManager } = loadModule();
            const { refreshAccessToken } = SyncManager.__test;

            storage.set('sync', JSON.stringify({
                ...getSyncStore(),
                refreshToken: 'refresh-token',
                accessToken: 'access-token',
                accessTokenExpiry: Date.now() + 120_000,
                refreshTokenExpiry: Date.now() + 240_000
            }));

            const errorMock = jest.fn(() => Promise.resolve({
                ok: false,
                status: 401,
                json: () => Promise.resolve({ success: false, message: 'Session expired.' }),
                text: () => Promise.resolve('{"success":false,"message":"Session expired."}'),
                headers: { get: () => null }
            }));
            fetchMock = errorMock;
            global.fetch = errorMock;
            window.fetch = errorMock;
            global.GM_xmlhttpRequest = undefined;

            await expect(refreshAccessToken()).rejects.toThrow('Session expired.');
            const syncStore = getSyncStore();
            expect(syncStore.accessToken).toBeUndefined();
            expect(syncStore.refreshToken).toBeUndefined();
            expect(syncStore.accessTokenExpiry).toBeUndefined();
            expect(syncStore.refreshTokenExpiry).toBeUndefined();
        });

        test('refreshAccessToken stores new tokens on success', async () => {
            seedConfiguredWithoutAccessToken();
            const { SyncManager } = loadModule();
            const { refreshAccessToken } = SyncManager.__test;
            const now = Date.now();

            storage.set('sync', JSON.stringify({
                ...getSyncStore(),
                refreshToken: 'refresh-token'
            }));

            const successMock = jest.fn(() => Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    success: true,
                    tokens: {
                        accessToken: 'new-access',
                        refreshToken: 'new-refresh',
                        accessExpiresAt: now + 60_000,
                        refreshExpiresAt: now + 120_000
                    }
                }),
                text: () => Promise.resolve('{"success":true}'),
                headers: { get: () => null }
            }));
            global.GM_xmlhttpRequest = ({ url, onload }) => {
                if (url.includes('/auth/refresh')) {
                    onload({ status: 200, responseText: JSON.stringify({
                        success: true,
                        tokens: {
                            accessToken: 'new-access',
                            refreshToken: 'new-refresh',
                            accessExpiresAt: now + 60_000,
                            refreshExpiresAt: now + 120_000
                        }
                    }), responseHeaders: '' });
                    return;
                }
                onload({ status: 200, responseText: '{}', responseHeaders: '' });
            };
            fetchMock = successMock;
            global.fetch = successMock;
            window.fetch = successMock;

            await expect(refreshAccessToken()).resolves.toBe('new-access');
            const syncStore = getSyncStore();
            expect(syncStore.accessToken).toBe('new-access');
            expect(syncStore.refreshToken).toBe('new-refresh');
            expect(syncStore.accessTokenExpiry).toBe(now + 60_000);
            expect(syncStore.refreshTokenExpiry).toBe(now + 120_000);
        });

        test('getAccessToken refreshes expired access tokens and preserves valid ones', async () => {
            seedConfiguredWithoutAccessToken();
            const { SyncManager } = loadModule();
            const { getAccessToken } = SyncManager.__test;
            const now = Date.now();
            Date.now = jest.fn(() => now);

            storage.set('sync_access_token', 'valid-access');
            storage.set(ACCESS_EXPIRY_KEY, now + 120_000);

            await expect(getAccessToken()).resolves.toBe('valid-access');
            expect(fetchMock).not.toHaveBeenCalled();

            storage.set('sync_access_token', 'expired-access');
            storage.set(ACCESS_EXPIRY_KEY, now - 1_000);
            storage.set('sync_refresh_token', 'refresh-token');

            const refreshMock = jest.fn(() => Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    success: true,
                    tokens: {
                        accessToken: 'refreshed-access',
                        refreshToken: 'refreshed-refresh',
                        accessExpiresAt: now + 60_000,
                        refreshExpiresAt: now + 120_000
                    }
                }),
                text: () => Promise.resolve('{"success":true}'),
                headers: { get: () => null }
            }));
            global.GM_xmlhttpRequest = ({ url, onload }) => {
                if (url.includes('/auth/refresh')) {
                    onload({ status: 200, responseText: JSON.stringify({
                        success: true,
                        tokens: {
                            accessToken: 'refreshed-access',
                            refreshToken: 'refreshed-refresh',
                            accessExpiresAt: now + 60_000,
                            refreshExpiresAt: now + 120_000
                        }
                    }), responseHeaders: '' });
                    return;
                }
                onload({ status: 200, responseText: '{}', responseHeaders: '' });
            };
            fetchMock = refreshMock;
            global.fetch = refreshMock;
            window.fetch = refreshMock;

            await expect(getAccessToken()).resolves.toBe('refreshed-access');
            const syncStore = getSyncStore();
            expect(syncStore.accessToken).toBe('refreshed-access');
            expect(syncStore.refreshToken).toBe('refreshed-refresh');
        });
    });
});
