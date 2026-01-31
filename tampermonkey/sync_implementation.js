// ============================================
// SYNC IMPLEMENTATION - ADD TO USERSCRIPT
// ============================================
// This file contains all sync-related code to be integrated into
// goal_portfolio_viewer.user.js
//
// Integration Instructions:
// 1. Add CHUNK 1 (Constants) after existing STORAGE_KEY_PREFIXES
// 2. Add CHUNK 2 (Encryption) after Storage Management section
// 3. Add CHUNK 3 (Sync Manager) after Encryption Module
// 4. Add CHUNK 4 (Settings UI) in the UI section
// 5. Add CHUNK 5 (Conflict UI) after Settings UI
// 6. Add CHUNK 6 (Integration) - modify existing functions
// 7. Add CHUNK 7 (Sync Indicator) in UI section
// ============================================

// ============================================
// CHUNK 1: CONSTANTS AND STORAGE KEYS
// ============================================
// Add these constants after the existing STORAGE_KEY_PREFIXES definition

const SYNC_STORAGE_KEYS = {
    enabled: 'sync_enabled',
    serverUrl: 'sync_server_url',
    apiKey: 'sync_api_key',
    passphrase: 'sync_passphrase',
    userId: 'sync_user_id',
    deviceId: 'sync_device_id',
    lastSync: 'sync_last_sync',
    lastSyncHash: 'sync_last_hash',
    autoSync: 'sync_auto_sync',
    syncInterval: 'sync_interval_minutes'
};

const SYNC_DEFAULTS = {
    serverUrl: 'https://goal-sync.workers.dev',
    autoSync: true,
    syncInterval: 30 // minutes
};

const SYNC_STATUS = {
    idle: 'idle',
    syncing: 'syncing',
    success: 'success',
    error: 'error',
    conflict: 'conflict'
};

// ============================================
// CHUNK 2: ENCRYPTION MODULE
// ============================================
// Add this entire section after the Storage Management section

const SyncEncryption = (() => {
    const PBKDF2_ITERATIONS = 100000;
    const KEY_LENGTH = 256;
    const IV_LENGTH = 12; // 96 bits for GCM
    const SALT_LENGTH = 16; // 128 bits

    /**
     * Check if Web Crypto API is available
     */
    function isSupported() {
        return typeof window !== 'undefined' && 
               window.crypto && 
               window.crypto.subtle &&
               typeof window.crypto.getRandomValues === 'function';
    }

    /**
     * Generate a cryptographically secure random buffer
     */
    function generateRandomBuffer(length) {
        return window.crypto.getRandomValues(new Uint8Array(length));
    }

    /**
     * Generate a UUID v4
     */
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Derive encryption key from passphrase using PBKDF2
     */
    async function deriveKey(passphrase, salt) {
        const encoder = new TextEncoder();
        const passphraseKey = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(passphrase),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        return window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            passphraseKey,
            { name: 'AES-GCM', length: KEY_LENGTH },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypt data with AES-GCM
     * Returns: base64(salt + iv + ciphertext + auth_tag)
     */
    async function encrypt(plaintext, passphrase) {
        if (!isSupported()) {
            throw new Error('Web Crypto API not supported');
        }

        try {
            const encoder = new TextEncoder();
            const salt = generateRandomBuffer(SALT_LENGTH);
            const iv = generateRandomBuffer(IV_LENGTH);
            const key = await deriveKey(passphrase, salt);

            const ciphertext = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encoder.encode(plaintext)
            );

            // Concatenate: salt + iv + ciphertext (includes auth tag)
            const combined = new Uint8Array(
                salt.length + iv.length + ciphertext.byteLength
            );
            combined.set(salt, 0);
            combined.set(iv, salt.length);
            combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

            // Convert to base64 for transmission
            return btoa(String.fromCharCode(...combined));
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Encryption failed:', error);
            throw new Error('Encryption failed');
        }
    }

    /**
     * Decrypt data encrypted with encrypt()
     */
    async function decrypt(encryptedBase64, passphrase) {
        if (!isSupported()) {
            throw new Error('Web Crypto API not supported');
        }

        try {
            // Decode from base64
            const combined = new Uint8Array(
                atob(encryptedBase64).split('').map(c => c.charCodeAt(0))
            );

            // Extract components
            const salt = combined.slice(0, SALT_LENGTH);
            const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
            const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

            const key = await deriveKey(passphrase, salt);

            const plaintext = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                ciphertext
            );

            const decoder = new TextDecoder();
            return decoder.decode(plaintext);
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Decryption failed:', error);
            throw new Error('Decryption failed - check passphrase');
        }
    }

    /**
     * Compute SHA-256 hash of data
     */
    async function hash(data) {
        const encoder = new TextEncoder();
        const buffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(data));
        const hashArray = Array.from(new Uint8Array(buffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    return {
        isSupported,
        generateUUID,
        encrypt,
        decrypt,
        hash
    };
})();

// ============================================
// CHUNK 3: SYNC MANAGER
// ============================================
// Add this entire section after the Encryption Module

const SyncManager = (() => {
    let syncStatus = SYNC_STATUS.idle;
    let lastError = null;
    let autoSyncTimer = null;

    /**
     * Check if sync is enabled
     */
    function isEnabled() {
        return Storage.get(SYNC_STORAGE_KEYS.enabled, false) === true;
    }

    /**
     * Check if sync is configured
     */
    function isConfigured() {
        const serverUrl = Storage.get(SYNC_STORAGE_KEYS.serverUrl, null);
        const apiKey = Storage.get(SYNC_STORAGE_KEYS.apiKey, null);
        const passphrase = Storage.get(SYNC_STORAGE_KEYS.passphrase, null);
        const userId = Storage.get(SYNC_STORAGE_KEYS.userId, null);
        return serverUrl && apiKey && passphrase && userId;
    }

    /**
     * Get or create device ID
     */
    function getDeviceId() {
        let deviceId = Storage.get(SYNC_STORAGE_KEYS.deviceId, null);
        if (!deviceId) {
            deviceId = SyncEncryption.generateUUID();
            Storage.set(SYNC_STORAGE_KEYS.deviceId, deviceId);
        }
        return deviceId;
    }

    /**
     * Collect syncable config data
     */
    function collectConfigData() {
        const config = {
            version: 1,
            goalTargets: {},
            goalFixed: {},
            timestamp: Date.now()
        };

        // Collect all goal target percentages
        const allKeys = GM_listValues ? GM_listValues() : [];
        for (const key of allKeys) {
            if (key.startsWith(STORAGE_KEY_PREFIXES.goalTarget)) {
                const goalId = key.substring(STORAGE_KEY_PREFIXES.goalTarget.length);
                const value = Storage.get(key, null);
                if (value !== null) {
                    config.goalTargets[goalId] = value;
                }
            } else if (key.startsWith(STORAGE_KEY_PREFIXES.goalFixed)) {
                const goalId = key.substring(STORAGE_KEY_PREFIXES.goalFixed.length);
                const value = Storage.get(key, false);
                config.goalFixed[goalId] = value;
            }
        }

        return config;
    }

    /**
     * Apply config data to local storage
     */
    function applyConfigData(config) {
        if (!config || typeof config !== 'object') {
            throw new Error('Invalid config data');
        }

        // Apply goal targets
        if (config.goalTargets && typeof config.goalTargets === 'object') {
            for (const [goalId, value] of Object.entries(config.goalTargets)) {
                const key = getGoalTargetKey(goalId);
                Storage.set(key, value);
            }
        }

        // Apply goal fixed states
        if (config.goalFixed && typeof config.goalFixed === 'object') {
            for (const [goalId, value] of Object.entries(config.goalFixed)) {
                const key = getGoalFixedKey(goalId);
                Storage.set(key, value === true);
            }
        }

        logDebug('[Goal Portfolio Viewer] Applied sync config data', {
            targets: Object.keys(config.goalTargets || {}).length,
            fixed: Object.keys(config.goalFixed || {}).length
        });
    }

    /**
     * Upload config to server
     */
    async function uploadConfig(config) {
        const serverUrl = Storage.get(SYNC_STORAGE_KEYS.serverUrl, SYNC_DEFAULTS.serverUrl);
        const apiKey = Storage.get(SYNC_STORAGE_KEYS.apiKey, null);
        const passphrase = Storage.get(SYNC_STORAGE_KEYS.passphrase, null);
        const userId = Storage.get(SYNC_STORAGE_KEYS.userId, null);

        if (!apiKey || !passphrase || !userId) {
            throw new Error('Sync not configured');
        }

        // Encrypt config
        const plaintext = JSON.stringify(config);
        const encryptedData = await SyncEncryption.encrypt(plaintext, passphrase);

        // Prepare payload
        const payload = {
            encryptedData,
            deviceId: getDeviceId(),
            timestamp: config.timestamp,
            version: config.version,
            userId
        };

        // Upload to server (POST /sync)
        const response = await fetch(`${serverUrl}/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Upload failed: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Download config from server
     */
    async function downloadConfig() {
        const serverUrl = Storage.get(SYNC_STORAGE_KEYS.serverUrl, SYNC_DEFAULTS.serverUrl);
        const apiKey = Storage.get(SYNC_STORAGE_KEYS.apiKey, null);
        const passphrase = Storage.get(SYNC_STORAGE_KEYS.passphrase, null);
        const userId = Storage.get(SYNC_STORAGE_KEYS.userId, null);

        if (!apiKey || !passphrase || !userId) {
            throw new Error('Sync not configured');
        }

        // Download from server
        const response = await fetch(`${serverUrl}/sync/${userId}`, {
            method: 'GET',
            headers: {
                'X-API-Key': apiKey
            }
        });

        if (response.status === 404) {
            // No data on server yet
            return null;
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Download failed: ${response.status}`);
        }

        const serverData = await response.json();

        // Decrypt config
        const plaintext = await SyncEncryption.decrypt(serverData.encryptedData, passphrase);
        const config = JSON.parse(plaintext);

        return {
            config,
            metadata: {
                deviceId: serverData.deviceId,
                timestamp: serverData.timestamp,
                version: serverData.version
            }
        };
    }

    /**
     * Check if there's a sync conflict
     */
    async function detectConflict(localConfig, serverData) {
        if (!serverData) {
            return null; // No server data, no conflict
        }

        const localTimestamp = localConfig.timestamp;
        const serverTimestamp = serverData.metadata.timestamp;
        const localDeviceId = getDeviceId();
        const serverDeviceId = serverData.metadata.deviceId;

        // If last sync was from this device, no conflict
        if (serverDeviceId === localDeviceId) {
            return null;
        }

        // If local is older than server, it's a conflict
        if (localTimestamp < serverTimestamp) {
            return {
                local: localConfig,
                remote: serverData.config,
                localTimestamp,
                remoteTimestamp: serverTimestamp,
                remoteDeviceId: serverDeviceId
            };
        }

        return null;
    }

    /**
     * Perform sync operation
     */
    async function performSync(options = {}) {
        const { force = false, direction = 'both' } = options;

        if (!isEnabled() || !isConfigured()) {
            throw new Error('Sync not enabled or configured');
        }

        if (!SyncEncryption.isSupported()) {
            throw new Error('Web Crypto API not supported in this browser');
        }

        syncStatus = SYNC_STATUS.syncing;
        updateSyncUI();

        try {
            const localConfig = collectConfigData();
            
            if (direction === 'upload' || direction === 'both') {
                // Upload local config
                await uploadConfig(localConfig);
                Storage.set(SYNC_STORAGE_KEYS.lastSync, Date.now());
                
                const hash = await SyncEncryption.hash(JSON.stringify(localConfig));
                Storage.set(SYNC_STORAGE_KEYS.lastSyncHash, hash);

                syncStatus = SYNC_STATUS.success;
                lastError = null;
                logDebug('[Goal Portfolio Viewer] Sync upload successful');
            }

            if (direction === 'download' || direction === 'both') {
                // Download and check for conflicts
                const serverData = await downloadConfig();
                
                if (!serverData) {
                    // No server data, upload local
                    if (direction === 'both') {
                        await uploadConfig(localConfig);
                        Storage.set(SYNC_STORAGE_KEYS.lastSync, Date.now());
                    }
                    syncStatus = SYNC_STATUS.success;
                    lastError = null;
                    logDebug('[Goal Portfolio Viewer] No server data, uploaded local config');
                } else {
                    // Check for conflicts
                    const conflict = await detectConflict(localConfig, serverData);
                    
                    if (conflict && !force) {
                        syncStatus = SYNC_STATUS.conflict;
                        showConflictResolutionUI(conflict);
                        return { status: 'conflict', conflict };
                    } else if (serverData) {
                        // Apply server data
                        applyConfigData(serverData.config);
                        Storage.set(SYNC_STORAGE_KEYS.lastSync, Date.now());
                        
                        const hash = await SyncEncryption.hash(JSON.stringify(serverData.config));
                        Storage.set(SYNC_STORAGE_KEYS.lastSyncHash, hash);

                        syncStatus = SYNC_STATUS.success;
                        lastError = null;
                        logDebug('[Goal Portfolio Viewer] Sync download successful');
                    }
                }
            }

            updateSyncUI();
            return { status: 'success' };
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Sync failed:', error);
            syncStatus = SYNC_STATUS.error;
            lastError = error.message;
            updateSyncUI();
            throw error;
        }
    }

    /**
     * Resolve conflict by choosing local or remote
     */
    async function resolveConflict(resolution, conflict) {
        try {
            syncStatus = SYNC_STATUS.syncing;
            updateSyncUI();

            if (resolution === 'local') {
                // Upload local, overwrite server
                await uploadConfig(conflict.local);
                Storage.set(SYNC_STORAGE_KEYS.lastSync, Date.now());
            } else if (resolution === 'remote') {
                // Apply remote, keep server
                applyConfigData(conflict.remote);
                Storage.set(SYNC_STORAGE_KEYS.lastSync, Date.now());
            } else {
                throw new Error('Invalid resolution');
            }

            syncStatus = SYNC_STATUS.success;
            lastError = null;
            updateSyncUI();
            
            // Refresh the portfolio view
            if (typeof renderPortfolioView === 'function') {
                renderPortfolioView();
            }
        } catch (error) {
            console.error('[Goal Portfolio Viewer] Conflict resolution failed:', error);
            syncStatus = SYNC_STATUS.error;
            lastError = error.message;
            updateSyncUI();
            throw error;
        }
    }

    /**
     * Start automatic sync
     */
    function startAutoSync() {
        stopAutoSync(); // Clear any existing timer

        const autoSync = Storage.get(SYNC_STORAGE_KEYS.autoSync, SYNC_DEFAULTS.autoSync);
        const intervalMinutes = Storage.get(SYNC_STORAGE_KEYS.syncInterval, SYNC_DEFAULTS.syncInterval);

        if (!autoSync || !isEnabled() || !isConfigured()) {
            return;
        }

        const intervalMs = intervalMinutes * 60 * 1000;
        autoSyncTimer = setInterval(() => {
            performSync({ direction: 'both' }).catch(error => {
                console.error('[Goal Portfolio Viewer] Auto-sync failed:', error);
            });
        }, intervalMs);

        logDebug(`[Goal Portfolio Viewer] Auto-sync started (interval: ${intervalMinutes} minutes)`);
    }

    /**
     * Stop automatic sync
     */
    function stopAutoSync() {
        if (autoSyncTimer) {
            clearInterval(autoSyncTimer);
            autoSyncTimer = null;
            logDebug('[Goal Portfolio Viewer] Auto-sync stopped');
        }
    }

    /**
     * Get current sync status
     */
    function getStatus() {
        return {
            status: syncStatus,
            lastError,
            lastSync: Storage.get(SYNC_STORAGE_KEYS.lastSync, null),
            isEnabled: isEnabled(),
            isConfigured: isConfigured(),
            cryptoSupported: SyncEncryption.isSupported()
        };
    }

    /**
     * Enable sync
     */
    function enable(config) {
        if (!config || !config.serverUrl || !config.apiKey || !config.passphrase || !config.userId) {
            throw new Error('Invalid sync configuration');
        }

        Storage.set(SYNC_STORAGE_KEYS.enabled, true);
        Storage.set(SYNC_STORAGE_KEYS.serverUrl, config.serverUrl);
        Storage.set(SYNC_STORAGE_KEYS.apiKey, config.apiKey);
        Storage.set(SYNC_STORAGE_KEYS.passphrase, config.passphrase);
        Storage.set(SYNC_STORAGE_KEYS.userId, config.userId);
        
        if (config.autoSync !== undefined) {
            Storage.set(SYNC_STORAGE_KEYS.autoSync, config.autoSync);
        }
        if (config.syncInterval !== undefined) {
            Storage.set(SYNC_STORAGE_KEYS.syncInterval, config.syncInterval);
        }

        startAutoSync();
        logDebug('[Goal Portfolio Viewer] Sync enabled');
    }

    /**
     * Disable sync
     */
    function disable() {
        stopAutoSync();
        Storage.set(SYNC_STORAGE_KEYS.enabled, false);
        logDebug('[Goal Portfolio Viewer] Sync disabled');
    }

    /**
     * Clear sync configuration
     */
    function clearConfig() {
        stopAutoSync();
        
        Object.values(SYNC_STORAGE_KEYS).forEach(key => {
            Storage.remove(key);
        });
        
        syncStatus = SYNC_STATUS.idle;
        lastError = null;
        
        logDebug('[Goal Portfolio Viewer] Sync configuration cleared');
    }

    return {
        isEnabled,
        isConfigured,
        getStatus,
        performSync,
        resolveConflict,
        enable,
        disable,
        clearConfig,
        startAutoSync,
        stopAutoSync,
        collectConfigData,
        applyConfigData
    };
})();

// Export for testing
if (typeof testExports !== 'undefined') {
    testExports.SyncEncryption = SyncEncryption;
    testExports.SyncManager = SyncManager;
}
