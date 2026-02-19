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
                    json: () => Promise.resolve({})
                });
            }
            if (url.includes('/sync') && options.method === 'POST') {
                return Promise.resolve({
                    status: 200,
                    ok: true,
                    json: () => Promise.resolve({ success: true })
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
                    })
                });
            }
            return Promise.resolve({
                status: 200,
                ok: true,
                json: () => Promise.resolve({})
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

    });

    afterEach(() => {
        if (exportsModule?.SyncManager?.stopAutoSync) {
            exportsModule.SyncManager.stopAutoSync();
        }
        jest.useRealTimers();
        teardownDom();
        delete global.GM_setValue;
        delete global.GM_getValue;
        delete global.GM_deleteValue;
        delete global.GM_listValues;
        delete global.GM_cookie;
        delete global.GM_xmlhttpRequest;
        delete global.XMLHttpRequest;
        Date.now = originalDateNow;
        jest.useRealTimers();
    });

    function loadModule() {
        exportsModule = require('../goal_portfolio_viewer.user.js');
        return exportsModule;
    }

    function seedRememberedKey() {
        storage.set('sync_remember_key', true);
        storage.set('sync_master_key', btoa(String.fromCharCode(1, 2, 3, 4)));
    }

    function seedConfiguredState() {
        storage.set('sync_enabled', true);
        storage.set('sync_server_url', 'https://sync.example.com');
        storage.set('sync_user_id', 'user@example.com');
        storage.set('sync_refresh_token', 'refresh-token');
        storage.set('sync_refresh_token_expiry', Date.now() + 120_000);
        storage.set('sync_access_token', 'access-token');
        storage.set('sync_access_token_expiry', Date.now() + 120_000);
    }

    test('startAutoSync does not schedule when auto-sync disabled', () => {
        jest.spyOn(global, 'setInterval');
        seedConfiguredState();
        seedRememberedKey();
        storage.set('sync_auto_sync', false);
        const { SyncManager } = loadModule();

        SyncManager.startAutoSync();

        expect(global.setInterval).not.toHaveBeenCalled();
    });

    test('scheduleSyncOnChange schedules a buffered sync', () => {
        jest.useFakeTimers();
        seedRememberedKey();
        const { SyncManager } = loadModule();
        seedConfiguredState();
        storage.set('sync_auto_sync', true);

        jest.spyOn(global, 'setTimeout');
        SyncManager.scheduleSyncOnChange('target-update');

        expect(global.setTimeout).toHaveBeenCalled();
    });

    test('GoalTargetStore methods call scheduleSyncOnChange when available', () => {
        seedRememberedKey();
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

    test('collectConfigData emits v2 payload and excludes Endowus targets for fixed goals', () => {
        const { SyncManager, storageKeys } = loadModule();
        const targetKey = storageKeys.goalTarget('goal-1');
        const fixedKey = storageKeys.goalFixed('goal-1');

        storage.set(targetKey, 25);
        storage.set(fixedKey, true);
        global.GM_listValues = () => [targetKey, fixedKey];

        const config = SyncManager.collectConfigData();

        expect(config.version).toBe(2);
        expect(config.platforms.endowus.goalTargets).toEqual({});
        expect(config.platforms.endowus.goalFixed).toEqual({ 'goal-1': true });
        expect(config.platforms.fsm.targetsByCode).toEqual({});
    });

    test('applyConfigData skips Endowus targets when goal is fixed for v2 payload', () => {
        const { SyncManager, storageKeys } = loadModule();
        const targetKey = storageKeys.goalTarget('goal-1');
        const fixedKey = storageKeys.goalFixed('goal-1');

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

        expect(storage.has(targetKey)).toBe(false);
        expect(storage.get(fixedKey)).toBe(true);
    });


    test('applyConfigData migrates legacy v1 payload to Endowus keys', () => {
        const { SyncManager, storageKeys } = loadModule();
        SyncManager.applyConfigData({
            version: 1,
            goalTargets: { 'goal-2': 33 },
            goalFixed: { 'goal-3': true },
            timestamp: Date.now()
        });

        expect(storage.get(storageKeys.goalTarget('goal-2'))).toBe(33);
        expect(storage.get(storageKeys.goalFixed('goal-3'))).toBe(true);
    });

    test('collectConfigData includes FSM namespaced sync keys', () => {
        const { SyncManager, storageKeys } = loadModule();
        const fsmTarget = storageKeys.fsmTarget('AAA');
        const fsmFixed = storageKeys.fsmFixed('BBB');
        const fsmTag = storageKeys.fsmTag('AAA');
        const fsmSetting = storageKeys.fsmDriftSetting('warningPct');

        storage.set(fsmTarget, 12);
        storage.set(fsmFixed, true);
        storage.set(fsmTag, 'cash');
        storage.set(fsmSetting, 10);
        storage.set('fsm_portfolios', JSON.stringify([{ id: 'core', name: 'Core', archived: false }]));
        storage.set('fsm_assignment_by_code', JSON.stringify({ AAA: 'core', BBB: 'unknown' }));
        storage.set('fsm_tag_catalog', JSON.stringify(['cash']));
        global.GM_listValues = () => [fsmTarget, fsmFixed, fsmTag, fsmSetting, 'fsm_tag_catalog', 'fsm_portfolios', 'fsm_assignment_by_code'];

        const config = SyncManager.collectConfigData();

        expect(config.platforms.fsm.targetsByCode).toEqual({ AAA: 12 });
        expect(config.platforms.fsm.fixedByCode).toEqual({ BBB: true });
        expect(config.platforms.fsm.tagsByCode).toEqual({ AAA: 'cash' });
        expect(config.platforms.fsm.tagCatalog).toEqual(['cash']);
        expect(config.platforms.fsm.driftSettings).toEqual({ warningPct: 10 });
        expect(config.platforms.fsm.portfolios).toEqual([{ id: 'core', name: 'Core', archived: false }]);
        expect(config.platforms.fsm.assignmentByCode).toEqual({ AAA: 'core', BBB: 'unassigned' });
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
                    tagsByCode: {},
                    tagCatalog: [],
                    portfolios: [{ id: 'income', name: 'Income', archived: false }],
                    assignmentByCode: { AAPL: 'income', BOND: 'missing' },
                    driftSettings: {},
                    timestamp: Date.now()
                }
            },
            timestamp: Date.now()
        });

        expect(JSON.parse(storage.get('fsm_portfolios'))).toEqual([{ id: 'income', name: 'Income', archived: false }]);
        expect(JSON.parse(storage.get('fsm_assignment_by_code'))).toEqual({ AAPL: 'income', BOND: 'unassigned' });
    });

    describe('multi-device reconciliation', () => {
        test('performSync(both) treats identical content from another device as up to date', async () => {
            seedConfiguredState();
            seedRememberedKey();
            const { SyncManager, SyncEncryption, storageKeys } = loadModule();

            const targetKey = storageKeys.goalTarget('goal-1');
            storage.set(targetKey, 25);
            global.GM_listValues = () => [targetKey];

            const serverTimestamp = Date.now() + 60_000;
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

            fetchMock.mockImplementation((url, options = {}) => {
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
                        })
                    });
                }
                if (url.includes('/sync') && options.method === 'POST') {
                    return Promise.resolve({
                        status: 200,
                        ok: true,
                        json: () => Promise.resolve({ success: true })
                    });
                }
                return Promise.resolve({
                    status: 200,
                    ok: true,
                    json: () => Promise.resolve({})
                });
            });

            await expect(SyncManager.performSync({ direction: 'both' })).resolves.toEqual({ status: 'success' });

            const postCalls = fetchMock.mock.calls.filter(([, options = {}]) => options.method === 'POST');
            expect(postCalls).toHaveLength(0);
            expect(storage.get('sync_last_sync')).toBe(serverTimestamp);
            expect(storage.get('sync_last_hash')).toEqual(expect.any(String));
        });

        test('performSync(download) stores server timestamp as lastSync metadata', async () => {
            seedConfiguredState();
            seedRememberedKey();
            const { SyncManager, SyncEncryption, storageKeys } = loadModule();

            const serverTimestamp = 1_700_000_000_000;
            const serverConfig = {
                version: 1,
                goalTargets: { 'goal-2': 40 },
                goalFixed: {},
                timestamp: serverTimestamp
            };
            const encryptedData = await SyncEncryption.encryptWithMasterKey(
                JSON.stringify(serverConfig),
                new Uint8Array([1, 2, 3, 4])
            );

            fetchMock.mockImplementation((url, options = {}) => {
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
                        })
                    });
                }
                return Promise.resolve({
                    status: 200,
                    ok: true,
                    json: () => Promise.resolve({})
                });
            });

            await expect(SyncManager.performSync({ direction: 'download' })).resolves.toEqual({ status: 'success' });

            expect(storage.get('sync_last_sync')).toBe(serverTimestamp);
            expect(storage.get('sync_last_hash')).toEqual(expect.any(String));
            expect(storage.get(storageKeys.goalTarget('goal-2'))).toBe(40);
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
        const REFRESH_EXPIRY_KEY = 'sync_refresh_token_expiry';

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
            const { SyncManager } = loadModule();
            const { refreshAccessToken } = SyncManager.__test;

            storage.set('sync_refresh_token', 'refresh-token');
            storage.set('sync_access_token', 'access-token');
            storage.set(ACCESS_EXPIRY_KEY, Date.now() + 120_000);
            storage.set(REFRESH_EXPIRY_KEY, Date.now() + 240_000);

            fetchMock.mockImplementationOnce(() => Promise.resolve({
                ok: false,
                status: 401,
                json: () => Promise.resolve({ success: false, message: 'Session expired.' })
            }));

            await expect(refreshAccessToken()).rejects.toThrow('Session expired.');
            expect(storage.has('sync_access_token')).toBe(false);
            expect(storage.has('sync_refresh_token')).toBe(false);
            expect(storage.has(ACCESS_EXPIRY_KEY)).toBe(false);
            expect(storage.has(REFRESH_EXPIRY_KEY)).toBe(false);
        });

        test('refreshAccessToken stores new tokens on success', async () => {
            const { SyncManager } = loadModule();
            const { refreshAccessToken } = SyncManager.__test;
            const now = Date.now();

            storage.set('sync_refresh_token', 'refresh-token');

            fetchMock.mockImplementationOnce(() => Promise.resolve({
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
                })
            }));

            await expect(refreshAccessToken()).resolves.toBe('new-access');
            expect(storage.get('sync_access_token')).toBe('new-access');
            expect(storage.get('sync_refresh_token')).toBe('new-refresh');
            expect(storage.get(ACCESS_EXPIRY_KEY)).toBe(now + 60_000);
            expect(storage.get(REFRESH_EXPIRY_KEY)).toBe(now + 120_000);
        });

        test('getAccessToken refreshes expired access tokens and preserves valid ones', async () => {
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

            fetchMock.mockImplementationOnce(() => Promise.resolve({
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
                })
            }));

            await expect(getAccessToken()).resolves.toBe('refreshed-access');
            expect(storage.get('sync_access_token')).toBe('refreshed-access');
            expect(storage.get('sync_refresh_token')).toBe('refreshed-refresh');
        });
    });
});
