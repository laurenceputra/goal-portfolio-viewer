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

    test('renders auth/session status text', () => {
        const { createSyncSettingsHTML } = exportsModule;
        seedStatus();

        const html = createSyncSettingsHTML();
        document.body.innerHTML = html;

        expect(document.body.textContent).toContain('Connected (refresh active)');
        expect(document.body.textContent).toContain('Locked (enter password to unlock this device)');
    });

    test('shows remember-key toggle after valid password input', () => {
        const { createSyncSettingsHTML, setupSyncSettingsListeners } = exportsModule;
        seedStatus();

        document.body.innerHTML = createSyncSettingsHTML();
        setupSyncSettingsListeners();

        const hint = document.getElementById('gpv-sync-remember-hint');
        const wrapper = document.getElementById('gpv-sync-remember-wrapper');
        expect(hint.style.display).toBe('block');
        expect(wrapper.style.display).toBe('none');

        const passwordInput = document.getElementById('gpv-sync-password');
        passwordInput.value = '12345678';
        passwordInput.dispatchEvent(new window.Event('input'));

        expect(hint.style.display).toBe('none');
        expect(wrapper.style.display).toBe('block');
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
                rememberKey: true
            })
        );
    });

    test('login respects remember-key checkbox', async () => {
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

        const rememberCheckbox = document.getElementById('gpv-sync-remember-key');
        rememberCheckbox.checked = false;
        rememberCheckbox.dispatchEvent(new window.Event('change'));

        document.getElementById('gpv-sync-login-btn').click();
        await Promise.resolve();
        jest.runOnlyPendingTimers();
        await Promise.resolve();

        expect(loginSpy).toHaveBeenCalledWith('https://sync.example.com', 'user@example.com', 'supersecure');
        expect(enableSpy).toHaveBeenCalledWith(
            expect.objectContaining({
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
                rememberKey: true
            })
        );
    });
});
