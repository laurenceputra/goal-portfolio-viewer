const { setupDom, teardownDom } = require('./helpers/domSetup');

describe('sync settings UI', () => {
    let exportsModule;
    let storage;

    beforeEach(() => {
        jest.resetModules();
        setupDom();

        storage = new Map();
        global.GM_setValue = (key, value) => storage.set(key, value);
        global.GM_getValue = (key, fallback = null) => storage.has(key) ? storage.get(key) : fallback;
        global.GM_deleteValue = key => storage.delete(key);
        global.GM_listValues = () => [];
        global.GM_cookie = { list: jest.fn((_, cb) => cb ? cb([]) : []) };

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
        global.GM_xmlhttpRequest = undefined;

        exportsModule = require('../goal_portfolio_viewer.user.js');
    });

    afterEach(() => {
        if (exportsModule?.SyncManager?.stopAutoSync) {
            exportsModule.SyncManager.stopAutoSync();
        }
        jest.useRealTimers();
        teardownDom();
    });

    function seedStatus() {
        storage.set('sync_enabled', true);
        storage.set('sync_server_url', 'https://sync.example.com');
        storage.set('sync_user_id', 'user@example.com');
        storage.set('sync_refresh_token', 'refresh-token');
        storage.set('sync_refresh_token_expiry', Date.now() + 120_000);
    }

    function seedStatusEnabledUnconfigured() {
        storage.set('sync_enabled', true);
        storage.set('sync_server_url', 'https://sync.example.com');
        storage.set('sync_user_id', 'user@example.com');
        storage.set('sync_refresh_token', 'refresh-token');
        storage.set('sync_refresh_token_expiry', Date.now() + 120_000);
    }

    function renderSyncSettingsAndGetElement(selector) {
        const { createSyncSettingsHTML } = exportsModule;
        seedStatus();
        document.body.innerHTML = createSyncSettingsHTML();
        return document.querySelector(selector);
    }

    function expectClassTokens(element, tokens) {
        expect(element).toBeTruthy();
        const classList = Array.from(element.classList || []);
        tokens.forEach(token => {
            expect(classList).toContain(token);
        });
    }

    test('renders auth/session status text', () => {
        const { createSyncSettingsHTML } = exportsModule;
        seedStatus();

        const html = createSyncSettingsHTML();
        document.body.innerHTML = html;

        expect(document.body.textContent).toContain('Connected (refresh active)');
        expect(document.body.textContent).toContain('Locked (enter password to unlock this device)');
        expect(document.body.textContent).toContain('Quick setup');
        expect(document.body.textContent).toContain('Advanced settings');
        expect(document.body.textContent).toContain('Save Settings');
        expect(document.body.textContent).toContain('Login and Sign Up validate credentials immediately');
    });

    test('uses styled sync button classes in settings actions', () => {
        const { createSyncSettingsHTML } = exportsModule;
        seedStatus();

        document.body.innerHTML = createSyncSettingsHTML();

        expect(document.getElementById('gpv-sync-save-btn').className).toContain('gpv-sync-btn');
        expect(document.getElementById('gpv-sync-save-btn').className).toContain('gpv-sync-btn-primary');
        expect(document.getElementById('gpv-sync-test-btn').className).toContain('gpv-sync-btn');
        expect(document.getElementById('gpv-sync-test-btn').className).toContain('gpv-sync-btn-secondary');
        expect(document.getElementById('gpv-sync-now-btn').className).toContain('gpv-sync-btn');
        expect(document.getElementById('gpv-sync-now-btn').className).toContain('gpv-sync-btn-secondary');
        expect(document.getElementById('gpv-sync-clear-btn').className).toContain('gpv-sync-btn');
        expect(document.getElementById('gpv-sync-clear-btn').className).toContain('gpv-sync-btn-danger');
        expect(document.querySelector('.gpv-sync-advanced')).toBeTruthy();
    });

    test('renders sync now outside advanced settings', () => {
        const { createSyncSettingsHTML } = exportsModule;
        seedStatus();

        document.body.innerHTML = createSyncSettingsHTML();

        const syncNowBtn = document.getElementById('gpv-sync-now-btn');
        const advanced = document.querySelector('.gpv-sync-advanced');
        expect(syncNowBtn).toBeTruthy();
        expect(advanced).toBeTruthy();
        expect(advanced.contains(syncNowBtn)).toBe(false);
        expect(syncNowBtn.disabled).toBe(true);
    });

    test('disables sync now when session key is missing after move', () => {
        const { createSyncSettingsHTML } = exportsModule;
        seedStatus();
        storage.delete('sync_session_master_key');

        document.body.innerHTML = createSyncSettingsHTML();

        const syncNowBtn = document.getElementById('gpv-sync-now-btn');
        expect(syncNowBtn).toBeTruthy();
        expect(syncNowBtn.disabled).toBe(true);
    });

    test('renders sync settings containers with required class tokens', () => {
        const root = renderSyncSettingsAndGetElement('.gpv-sync-settings');
        expectClassTokens(root, ['gpv-sync-settings']);

        const header = document.querySelector('.gpv-sync-header');
        expectClassTokens(header, ['gpv-sync-header']);

        const statusBar = document.querySelector('.gpv-sync-status-bar');
        expectClassTokens(statusBar, ['gpv-sync-status-bar']);

        const form = document.querySelector('.gpv-sync-form');
        expectClassTokens(form, ['gpv-sync-form']);

        const formGroups = Array.from(document.querySelectorAll('.gpv-sync-form-group'));
        expect(formGroups.length).toBeGreaterThan(0);
        formGroups.forEach(group => {
            expectClassTokens(group, ['gpv-sync-form-group']);
        });
    });

    test('renders sync inputs and toggles with required classes', () => {
        renderSyncSettingsAndGetElement('.gpv-sync-settings');

        const inputs = ['gpv-sync-server-url', 'gpv-sync-user-id', 'gpv-sync-password', 'gpv-sync-interval'];
        inputs.forEach(id => {
            const input = document.getElementById(id);
            expectClassTokens(input, ['gpv-sync-input']);
        });

        const toggles = Array.from(document.querySelectorAll('.gpv-sync-toggle'));
        expect(toggles.length).toBeGreaterThan(0);
        toggles.forEach(toggle => {
            expectClassTokens(toggle, ['gpv-sync-toggle']);
        });

        const helpText = Array.from(document.querySelectorAll('.gpv-sync-help'));
        expect(helpText.length).toBeGreaterThan(0);
        helpText.forEach(node => {
            expectClassTokens(node, ['gpv-sync-help']);
        });
    });

    test('renders sync auth buttons with styled class tokens when unconfigured', () => {
        const { createSyncSettingsHTML } = exportsModule;
        seedStatusEnabledUnconfigured();
        storage.delete('sync_refresh_token');
        storage.delete('sync_refresh_token_expiry');

        document.body.innerHTML = createSyncSettingsHTML();

        const authContainer = document.querySelector('.gpv-sync-auth-buttons');
        expectClassTokens(authContainer, ['gpv-sync-auth-buttons']);

        const registerBtn = document.getElementById('gpv-sync-register-btn');
        expectClassTokens(registerBtn, ['gpv-sync-btn-primary']);
        const loginBtn = document.getElementById('gpv-sync-login-btn');
        expectClassTokens(loginBtn, ['gpv-sync-btn-secondary']);
    });

    test('renders conflict dialog controls with required class tokens', () => {
        const { createConflictDialogHTML } = exportsModule;
        const localConfig = { goalTargets: { goal_1: 10 }, goalFixed: {} };
        const remoteConfig = { goalTargets: { goal_1: 20 }, goalFixed: {} };
        const localHash = 'local-hash';
        const remoteHash = 'remote-hash';
        const conflict = {
            local: localConfig,
            remote: remoteConfig,
            localHash,
            remoteHash,
            localTimestamp: Date.now() - 5000,
            remoteTimestamp: Date.now()
        };

        document.body.innerHTML = createConflictDialogHTML(conflict);

        const dialog = document.querySelector('.gpv-conflict-dialog');
        expectClassTokens(dialog, ['gpv-conflict-dialog']);

        const stepper = document.querySelector('.gpv-conflict-stepper');
        expectClassTokens(stepper, ['gpv-conflict-stepper']);

        const stepPanels = Array.from(document.querySelectorAll('.gpv-conflict-step-panel'));
        expect(stepPanels.length).toBeGreaterThan(0);
        stepPanels.forEach(panel => {
            expectClassTokens(panel, ['gpv-conflict-step-panel']);
        });

        const actions = Array.from(document.querySelectorAll('.gpv-conflict-actions'));
        expect(actions.length).toBeGreaterThan(0);
        actions.forEach(action => {
            expectClassTokens(action, ['gpv-conflict-actions']);
        });

        const keepLocalBtn = document.getElementById('gpv-conflict-keep-local');
        expectClassTokens(keepLocalBtn, ['gpv-sync-btn', 'gpv-sync-btn-primary']);
        const useRemoteBtn = document.getElementById('gpv-conflict-use-remote');
        expectClassTokens(useRemoteBtn, ['gpv-sync-btn', 'gpv-sync-btn-primary']);
        const prevBtn = document.getElementById('gpv-conflict-prev');
        expectClassTokens(prevBtn, ['gpv-sync-btn', 'gpv-sync-btn-secondary']);
        const nextBtn = document.getElementById('gpv-conflict-next');
        expectClassTokens(nextBtn, ['gpv-sync-btn', 'gpv-sync-btn-secondary']);
        const cancelBtn = document.getElementById('gpv-conflict-cancel');
        expectClassTokens(cancelBtn, ['gpv-sync-btn', 'gpv-sync-btn-secondary']);
    });

    test('renders FSM instrument differences in targets step', () => {
        const { createConflictDialogHTML } = exportsModule;
        const conflict = {
            local: {
                version: 2,
                platforms: {
                    endowus: { goalTargets: {}, goalFixed: {} },
                    fsm: {
                        targetsByCode: { AAA: 15 },
                        fixedByCode: { AAA: true },
                        tagsByCode: {},
                        tagCatalog: [],
                        portfolios: [],
                        assignmentByCode: {},
                        driftSettings: {}
                    }
                }
            },
            remote: {
                version: 2,
                platforms: {
                    endowus: { goalTargets: {}, goalFixed: {} },
                    fsm: {
                        targetsByCode: { AAA: 25 },
                        fixedByCode: { AAA: false },
                        tagsByCode: {},
                        tagCatalog: [],
                        portfolios: [],
                        assignmentByCode: {},
                        driftSettings: {}
                    }
                }
            }
        };

        document.body.innerHTML = createConflictDialogHTML(conflict);

        const summaryPanel = document.querySelector('[data-step-panel="1"]');
        expect(summaryPanel.textContent).toMatch(/FSM differences:\s*1/);

        const targetsPanel = document.querySelector('[data-step-panel="4"]');
        expect(targetsPanel.textContent).toContain('Instrument AAA');
        expect(targetsPanel.textContent).toContain('Target 15.00% · Fixed Yes');
        expect(targetsPanel.textContent).toContain('Target 25.00% · Fixed No');
        expect(targetsPanel.textContent).not.toContain('No differences detected.');
    });

    test('renders remember-key control as explicit opt-in by default', () => {
        const { createSyncSettingsHTML } = exportsModule;
        seedStatus();

        document.body.innerHTML = createSyncSettingsHTML();

        const rememberKey = document.getElementById('gpv-sync-remember-key');
        expect(rememberKey).toBeTruthy();
        expect(rememberKey.checked).toBe(false);
    });

    test('preserves existing remember-key preference in settings', () => {
        const { createSyncSettingsHTML } = exportsModule;
        seedStatus();
        storage.set('sync_remember_key', true);

        document.body.innerHTML = createSyncSettingsHTML();

        expect(document.getElementById('gpv-sync-remember-key').checked).toBe(true);
    });

    test('login and sign up stay disabled when sync activation is off', () => {
        const { createSyncSettingsHTML, setupSyncSettingsListeners } = exportsModule;
        seedStatusEnabledUnconfigured();
        storage.delete('sync_refresh_token');
        storage.delete('sync_refresh_token_expiry');

        document.body.innerHTML = createSyncSettingsHTML();
        setupSyncSettingsListeners();

        const enabledCheckbox = document.getElementById('gpv-sync-enabled');
        enabledCheckbox.checked = false;
        enabledCheckbox.dispatchEvent(new window.Event('change'));

        expect(document.getElementById('gpv-sync-login-btn').disabled).toBe(true);
        expect(document.getElementById('gpv-sync-register-btn').disabled).toBe(true);
    });

    test('login enables sync with encryption by default and saves settings', async () => {
        jest.useFakeTimers();
        const { createSyncSettingsHTML, setupSyncSettingsListeners, SyncManager } = exportsModule;

        seedStatusEnabledUnconfigured();
        storage.delete('sync_refresh_token');
        storage.delete('sync_refresh_token_expiry');

        document.body.innerHTML = createSyncSettingsHTML();
        setupSyncSettingsListeners();

        const loginSpy = jest.spyOn(SyncManager, 'login').mockResolvedValue({});
        const enableSpy = jest.spyOn(SyncManager, 'enable').mockResolvedValue();

        document.getElementById('gpv-sync-server-url').value = 'https://sync.example.com';
        document.getElementById('gpv-sync-user-id').value = 'user@example.com';
        document.getElementById('gpv-sync-password').value = 'supersecure';

        document.getElementById('gpv-sync-login-btn').click();
        await Promise.resolve();
        jest.runOnlyPendingTimers();
        await Promise.resolve();

        expect(loginSpy).toHaveBeenCalledWith('https://sync.example.com', 'user@example.com', 'supersecure');
        expect(enableSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                password: 'supersecure',
                rememberKey: false
            })
        );
    });

    test('sign up enables sync with encryption by default and saves settings', async () => {
        jest.useFakeTimers();
        const { createSyncSettingsHTML, setupSyncSettingsListeners, SyncManager } = exportsModule;

        seedStatusEnabledUnconfigured();
        storage.delete('sync_refresh_token');
        storage.delete('sync_refresh_token_expiry');

        document.body.innerHTML = createSyncSettingsHTML();
        setupSyncSettingsListeners();

        const registerSpy = jest.spyOn(SyncManager, 'register').mockResolvedValue({});
        const loginSpy = jest.spyOn(SyncManager, 'login').mockResolvedValue({});
        const enableSpy = jest.spyOn(SyncManager, 'enable').mockResolvedValue();

        document.getElementById('gpv-sync-server-url').value = 'https://sync.example.com';
        document.getElementById('gpv-sync-user-id').value = 'new@example.com';
        document.getElementById('gpv-sync-password').value = 'supersecure';

        document.getElementById('gpv-sync-register-btn').click();
        await Promise.resolve();
        jest.runOnlyPendingTimers();
        await Promise.resolve();

        expect(registerSpy).toHaveBeenCalledWith('https://sync.example.com', 'new@example.com', 'supersecure');
        expect(loginSpy).toHaveBeenCalledWith('https://sync.example.com', 'new@example.com', 'supersecure');
        expect(enableSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                password: 'supersecure',
                rememberKey: false
            })
        );
    });
});
