// ============================================
// CHUNK 4: SYNC SETTINGS UI
// ============================================
// Add this in the UI section, after the main modal styles

/**
 * Create sync settings panel HTML
 */
function createSyncSettingsHTML() {
    const syncStatus = SyncManager.getStatus();
    const isEnabled = syncStatus.isEnabled;
    const isConfigured = syncStatus.isConfigured;
    const cryptoSupported = syncStatus.cryptoSupported;
    
    const serverUrl = Storage.get(SYNC_STORAGE_KEYS.serverUrl, SYNC_DEFAULTS.serverUrl);
    const userId = Storage.get(SYNC_STORAGE_KEYS.userId, '');
    const apiKey = Storage.get(SYNC_STORAGE_KEYS.apiKey, '');
    const passphrase = Storage.get(SYNC_STORAGE_KEYS.passphrase, '');
    const autoSync = Storage.get(SYNC_STORAGE_KEYS.autoSync, SYNC_DEFAULTS.autoSync);
    const syncInterval = Storage.get(SYNC_STORAGE_KEYS.syncInterval, SYNC_DEFAULTS.syncInterval);
    
    const lastSyncTimestamp = syncStatus.lastSync;
    const lastSyncText = lastSyncTimestamp 
        ? new Date(lastSyncTimestamp).toLocaleString()
        : 'Never';

    return `
        <div class="gpv-sync-settings">
            <div class="gpv-sync-header">
                <h3>Sync Settings</h3>
                ${!cryptoSupported ? `
                    <div class="gpv-sync-warning">
                        ⚠️ Web Crypto API not supported in this browser. Sync requires a modern browser.
                    </div>
                ` : ''}
            </div>

            <div class="gpv-sync-status-bar">
                <div class="gpv-sync-status-item">
                    <span class="gpv-sync-label">Status:</span>
                    <span class="gpv-sync-value gpv-sync-status-${syncStatus.status}">
                        ${syncStatus.status.toUpperCase()}
                    </span>
                </div>
                <div class="gpv-sync-status-item">
                    <span class="gpv-sync-label">Last Sync:</span>
                    <span class="gpv-sync-value">${lastSyncText}</span>
                </div>
                ${syncStatus.lastError ? `
                    <div class="gpv-sync-status-item gpv-sync-error">
                        <span class="gpv-sync-label">Error:</span>
                        <span class="gpv-sync-value">${escapeHtml(syncStatus.lastError)}</span>
                    </div>
                ` : ''}
            </div>

            <div class="gpv-sync-form">
                <div class="gpv-sync-form-group">
                    <label class="gpv-sync-toggle">
                        <input 
                            type="checkbox" 
                            id="gpv-sync-enabled"
                            ${isEnabled ? 'checked' : ''}
                            ${!cryptoSupported ? 'disabled' : ''}
                        />
                        <span>Enable Sync</span>
                    </label>
                    <p class="gpv-sync-help">
                        Sync your goal configurations across devices using encrypted cloud storage.
                        <a href="https://github.com/laurenceputra/goal-portfolio-viewer/blob/main/SYNC_ARCHITECTURE.md" 
                           target="_blank" 
                           rel="noopener noreferrer">Learn more</a>
                    </p>
                </div>

                <div class="gpv-sync-form-group">
                    <label for="gpv-sync-server-url">Server URL</label>
                    <input 
                        type="text" 
                        id="gpv-sync-server-url"
                        class="gpv-sync-input"
                        value="${escapeHtml(serverUrl)}"
                        placeholder="${SYNC_DEFAULTS.serverUrl}"
                        ${!isEnabled || !cryptoSupported ? 'disabled' : ''}
                    />
                    <p class="gpv-sync-help">
                        Default: ${SYNC_DEFAULTS.serverUrl} (or use your self-hosted instance)
                    </p>
                </div>

                <div class="gpv-sync-form-group">
                    <label for="gpv-sync-user-id">User ID</label>
                    <input 
                        type="text" 
                        id="gpv-sync-user-id"
                        class="gpv-sync-input"
                        value="${escapeHtml(userId)}"
                        placeholder="your-unique-user-id"
                        ${!isEnabled || !cryptoSupported ? 'disabled' : ''}
                    />
                    <p class="gpv-sync-help">
                        A unique identifier for your account (e.g., email address or custom ID)
                    </p>
                </div>

                <div class="gpv-sync-form-group">
                    <label for="gpv-sync-api-key">API Key</label>
                    <input 
                        type="password" 
                        id="gpv-sync-api-key"
                        class="gpv-sync-input"
                        value="${escapeHtml(apiKey)}"
                        placeholder="Your API key from the sync server"
                        ${!isEnabled || !cryptoSupported ? 'disabled' : ''}
                    />
                    <p class="gpv-sync-help">
                        API key for authentication with the sync server
                    </p>
                </div>

                <div class="gpv-sync-form-group">
                    <label for="gpv-sync-passphrase">Encryption Passphrase</label>
                    <input 
                        type="password" 
                        id="gpv-sync-passphrase"
                        class="gpv-sync-input"
                        value="${escapeHtml(passphrase)}"
                        placeholder="Strong passphrase for encryption"
                        ${!isEnabled || !cryptoSupported ? 'disabled' : ''}
                    />
                    <p class="gpv-sync-help">
                        ⚠️ Keep this safe! Your data is encrypted with this passphrase. If lost, data cannot be recovered.
                    </p>
                </div>

                <div class="gpv-sync-form-group">
                    <label class="gpv-sync-toggle">
                        <input 
                            type="checkbox" 
                            id="gpv-sync-auto"
                            ${autoSync ? 'checked' : ''}
                            ${!isEnabled || !cryptoSupported ? 'disabled' : ''}
                        />
                        <span>Automatic Sync</span>
                    </label>
                </div>

                <div class="gpv-sync-form-group">
                    <label for="gpv-sync-interval">Sync Interval (minutes)</label>
                    <input 
                        type="number" 
                        id="gpv-sync-interval"
                        class="gpv-sync-input"
                        value="${syncInterval}"
                        min="5"
                        max="1440"
                        ${!isEnabled || !autoSync || !cryptoSupported ? 'disabled' : ''}
                    />
                    <p class="gpv-sync-help">
                        How often to automatically sync (5-1440 minutes)
                    </p>
                </div>

                <div class="gpv-sync-actions">
                    <button 
                        class="gpv-sync-btn gpv-sync-btn-primary"
                        id="gpv-sync-save-btn"
                        ${!cryptoSupported ? 'disabled' : ''}
                    >
                        Save Settings
                    </button>
                    <button 
                        class="gpv-sync-btn gpv-sync-btn-secondary"
                        id="gpv-sync-test-btn"
                        ${!isEnabled || !isConfigured || !cryptoSupported ? 'disabled' : ''}
                    >
                        Test Connection
                    </button>
                    <button 
                        class="gpv-sync-btn gpv-sync-btn-secondary"
                        id="gpv-sync-now-btn"
                        ${!isEnabled || !isConfigured || !cryptoSupported ? 'disabled' : ''}
                    >
                        Sync Now
                    </button>
                    <button 
                        class="gpv-sync-btn gpv-sync-btn-danger"
                        id="gpv-sync-clear-btn"
                    >
                        Clear Configuration
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Setup sync settings event listeners
 */
function setupSyncSettingsListeners() {
    // Enable/disable sync
    const enabledCheckbox = document.getElementById('gpv-sync-enabled');
    if (enabledCheckbox) {
        enabledCheckbox.addEventListener('change', (e) => {
            const inputs = document.querySelectorAll('.gpv-sync-input, #gpv-sync-auto, #gpv-sync-interval');
            inputs.forEach(input => {
                input.disabled = !e.target.checked;
            });
            
            const buttons = document.querySelectorAll('#gpv-sync-test-btn, #gpv-sync-now-btn');
            buttons.forEach(btn => {
                btn.disabled = !e.target.checked;
            });
        });
    }

    // Auto-sync toggle
    const autoSyncCheckbox = document.getElementById('gpv-sync-auto');
    if (autoSyncCheckbox) {
        autoSyncCheckbox.addEventListener('change', (e) => {
            const intervalInput = document.getElementById('gpv-sync-interval');
            if (intervalInput) {
                intervalInput.disabled = !e.target.checked;
            }
        });
    }

    // Save settings
    const saveBtn = document.getElementById('gpv-sync-save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            try {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';

                const enabled = document.getElementById('gpv-sync-enabled').checked;
                const serverUrl = document.getElementById('gpv-sync-server-url').value.trim();
                const userId = document.getElementById('gpv-sync-user-id').value.trim();
                const apiKey = document.getElementById('gpv-sync-api-key').value.trim();
                const passphrase = document.getElementById('gpv-sync-passphrase').value;
                const autoSync = document.getElementById('gpv-sync-auto').checked;
                const syncInterval = parseInt(document.getElementById('gpv-sync-interval').value) || SYNC_DEFAULTS.syncInterval;

                // Validation
                if (enabled) {
                    if (!serverUrl || !userId || !apiKey || !passphrase) {
                        throw new Error('All fields are required when sync is enabled');
                    }
                    if (passphrase.length < 8) {
                        throw new Error('Passphrase must be at least 8 characters');
                    }
                    if (syncInterval < 5 || syncInterval > 1440) {
                        throw new Error('Sync interval must be between 5 and 1440 minutes');
                    }
                }

                if (enabled) {
                    SyncManager.enable({
                        serverUrl,
                        userId,
                        apiKey,
                        passphrase,
                        autoSync,
                        syncInterval
                    });
                    showSuccessMessage('Sync settings saved successfully!');
                } else {
                    SyncManager.disable();
                    showSuccessMessage('Sync disabled');
                }

                // Refresh the settings panel
                setTimeout(() => {
                    const settingsPanel = document.querySelector('.gpv-sync-settings');
                    if (settingsPanel) {
                        settingsPanel.outerHTML = createSyncSettingsHTML();
                        setupSyncSettingsListeners();
                    }
                }, 1000);
            } catch (error) {
                console.error('[Goal Portfolio Viewer] Save sync settings failed:', error);
                showErrorMessage(`Failed to save settings: ${error.message}`);
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Settings';
            }
        });
    }

    // Test connection
    const testBtn = document.getElementById('gpv-sync-test-btn');
    if (testBtn) {
        testBtn.addEventListener('click', async () => {
            try {
                testBtn.disabled = true;
                testBtn.textContent = 'Testing...';

                const serverUrl = Storage.get(SYNC_STORAGE_KEYS.serverUrl, SYNC_DEFAULTS.serverUrl);
                const response = await fetch(`${serverUrl}/health`);
                const data = await response.json();

                if (response.ok && data.status === 'ok') {
                    showSuccessMessage(`Connection successful! Server version: ${data.version}`);
                } else {
                    throw new Error('Server returned unexpected response');
                }
            } catch (error) {
                console.error('[Goal Portfolio Viewer] Test connection failed:', error);
                showErrorMessage(`Connection failed: ${error.message}`);
            } finally {
                testBtn.disabled = false;
                testBtn.textContent = 'Test Connection';
            }
        });
    }

    // Sync now
    const syncNowBtn = document.getElementById('gpv-sync-now-btn');
    if (syncNowBtn) {
        syncNowBtn.addEventListener('click', async () => {
            try {
                syncNowBtn.disabled = true;
                syncNowBtn.textContent = 'Syncing...';

                const result = await SyncManager.performSync({ direction: 'both' });
                
                if (result.status === 'conflict') {
                    showInfoMessage('Sync conflict detected. Please resolve the conflict.');
                } else {
                    showSuccessMessage('Sync completed successfully!');
                    
                    // Refresh the portfolio view
                    if (typeof renderPortfolioView === 'function') {
                        renderPortfolioView();
                    }
                }

                // Refresh the settings panel
                setTimeout(() => {
                    const settingsPanel = document.querySelector('.gpv-sync-settings');
                    if (settingsPanel) {
                        settingsPanel.outerHTML = createSyncSettingsHTML();
                        setupSyncSettingsListeners();
                    }
                }, 1000);
            } catch (error) {
                console.error('[Goal Portfolio Viewer] Sync failed:', error);
                showErrorMessage(`Sync failed: ${error.message}`);
            } finally {
                syncNowBtn.disabled = false;
                syncNowBtn.textContent = 'Sync Now';
            }
        });
    }

    // Clear configuration
    const clearBtn = document.getElementById('gpv-sync-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear sync configuration? This will not delete data from the server.')) {
                SyncManager.clearConfig();
                showInfoMessage('Sync configuration cleared');
                
                // Refresh the settings panel
                const settingsPanel = document.querySelector('.gpv-sync-settings');
                if (settingsPanel) {
                    settingsPanel.outerHTML = createSyncSettingsHTML();
                    setupSyncSettingsListeners();
                }
            }
        });
    }
}

/**
 * Show sync settings modal
 */
function showSyncSettings() {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'gpv-modal-overlay';
    overlay.innerHTML = `
        <div class="gpv-modal gpv-sync-modal">
            <div class="gpv-modal-header">
                <h2>Sync Settings</h2>
                <button class="gpv-modal-close" id="gpv-sync-modal-close">&times;</button>
            </div>
            <div class="gpv-modal-body">
                ${createSyncSettingsHTML()}
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);

    // Setup listeners
    setupSyncSettingsListeners();

    // Close button
    const closeBtn = document.getElementById('gpv-sync-modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            overlay.remove();
        });
    }

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
}

// ============================================
// CHUNK 5: CONFLICT RESOLUTION UI
// ============================================

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleString();
}

/**
 * Create conflict resolution dialog HTML
 */
function createConflictDialogHTML(conflict) {
    const localTargets = Object.keys(conflict.local.goalTargets || {}).length;
    const remoteTargets = Object.keys(conflict.remote.goalTargets || {}).length;
    const localFixed = Object.keys(conflict.local.goalFixed || {}).length;
    const remoteFixed = Object.keys(conflict.remote.goalFixed || {}).length;

    return `
        <div class="gpv-conflict-dialog">
            <h3>⚠️ Sync Conflict Detected</h3>
            <p class="gpv-conflict-description">
                Your local configuration conflicts with the data on the server. 
                This typically happens when you've made changes on multiple devices.
            </p>

            <div class="gpv-conflict-comparison">
                <div class="gpv-conflict-option">
                    <h4>📱 Local (This Device)</h4>
                    <ul class="gpv-conflict-details">
                        <li><strong>Last Modified:</strong> ${formatTimestamp(conflict.localTimestamp)}</li>
                        <li><strong>Goal Targets:</strong> ${localTargets} configured</li>
                        <li><strong>Fixed Goals:</strong> ${localFixed} configured</li>
                    </ul>
                    <button class="gpv-sync-btn gpv-sync-btn-primary" id="gpv-conflict-keep-local">
                        Keep Local
                    </button>
                </div>

                <div class="gpv-conflict-divider">OR</div>

                <div class="gpv-conflict-option">
                    <h4>☁️ Remote (Server)</h4>
                    <ul class="gpv-conflict-details">
                        <li><strong>Last Modified:</strong> ${formatTimestamp(conflict.remoteTimestamp)}</li>
                        <li><strong>Goal Targets:</strong> ${remoteTargets} configured</li>
                        <li><strong>Fixed Goals:</strong> ${remoteFixed} configured</li>
                        <li><strong>Device:</strong> ${conflict.remoteDeviceId.substring(0, 8)}...</li>
                    </ul>
                    <button class="gpv-sync-btn gpv-sync-btn-primary" id="gpv-conflict-use-remote">
                        Use Remote
                    </button>
                </div>
            </div>

            <div class="gpv-conflict-warning">
                <p><strong>⚠️ Warning:</strong> Choosing one option will overwrite the other. Make sure to choose carefully.</p>
            </div>

            <div class="gpv-conflict-actions">
                <button class="gpv-sync-btn gpv-sync-btn-secondary" id="gpv-conflict-cancel">
                    Cancel (Resolve Later)
                </button>
            </div>
        </div>
    `;
}

/**
 * Show conflict resolution UI
 */
function showConflictResolutionUI(conflict) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'gpv-modal-overlay gpv-conflict-overlay';
    overlay.innerHTML = `
        <div class="gpv-modal gpv-conflict-modal">
            ${createConflictDialogHTML(conflict)}
        </div>
    `;
    
    document.body.appendChild(overlay);

    // Keep local button
    const keepLocalBtn = document.getElementById('gpv-conflict-keep-local');
    if (keepLocalBtn) {
        keepLocalBtn.addEventListener('click', async () => {
            try {
                keepLocalBtn.disabled = true;
                keepLocalBtn.textContent = 'Resolving...';
                
                await SyncManager.resolveConflict('local', conflict);
                showSuccessMessage('Conflict resolved! Local data uploaded to server.');
                overlay.remove();
            } catch (error) {
                console.error('[Goal Portfolio Viewer] Conflict resolution failed:', error);
                showErrorMessage(`Failed to resolve conflict: ${error.message}`);
                keepLocalBtn.disabled = false;
                keepLocalBtn.textContent = 'Keep Local';
            }
        });
    }

    // Use remote button
    const useRemoteBtn = document.getElementById('gpv-conflict-use-remote');
    if (useRemoteBtn) {
        useRemoteBtn.addEventListener('click', async () => {
            try {
                useRemoteBtn.disabled = true;
                useRemoteBtn.textContent = 'Resolving...';
                
                await SyncManager.resolveConflict('remote', conflict);
                showSuccessMessage('Conflict resolved! Remote data applied locally.');
                overlay.remove();
            } catch (error) {
                console.error('[Goal Portfolio Viewer] Conflict resolution failed:', error);
                showErrorMessage(`Failed to resolve conflict: ${error.message}`);
                useRemoteBtn.disabled = false;
                useRemoteBtn.textContent = 'Use Remote';
            }
        });
    }

    // Cancel button
    const cancelBtn = document.getElementById('gpv-conflict-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            overlay.remove();
            showInfoMessage('Conflict resolution postponed. Sync will retry later.');
        });
    }

    // Prevent closing on overlay click for conflicts
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            showInfoMessage('Please choose an option to resolve the conflict.');
        }
    });
}

// ============================================
// CHUNK 6: SYNC STATUS INDICATOR
// ============================================

/**
 * Create sync status indicator HTML
 */
function createSyncIndicatorHTML() {
    const syncStatus = SyncManager.getStatus();
    
    if (!syncStatus.isEnabled) {
        return ''; // Don't show indicator if sync is disabled
    }

    const statusIcons = {
        idle: '⚪',
        syncing: '🔄',
        success: '✅',
        error: '❌',
        conflict: '⚠️'
    };

    const statusTexts = {
        idle: 'Sync Idle',
        syncing: 'Syncing...',
        success: 'Synced',
        error: 'Sync Error',
        conflict: 'Sync Conflict'
    };

    const icon = statusIcons[syncStatus.status] || statusIcons.idle;
    const text = statusTexts[syncStatus.status] || statusTexts.idle;

    return `
        <div class="gpv-sync-indicator gpv-sync-status-${syncStatus.status}" 
             id="gpv-sync-indicator"
             title="${text}${syncStatus.lastError ? ': ' + syncStatus.lastError : ''}">
            <span class="gpv-sync-icon">${icon}</span>
            <span class="gpv-sync-text">${text}</span>
        </div>
    `;
}

/**
 * Update sync UI elements
 */
function updateSyncUI() {
    // Update sync indicator
    const indicator = document.getElementById('gpv-sync-indicator');
    if (indicator) {
        const parent = indicator.parentElement;
        indicator.outerHTML = createSyncIndicatorHTML();
        
        // Re-attach click listener
        const newIndicator = parent.querySelector('#gpv-sync-indicator');
        if (newIndicator) {
            newIndicator.addEventListener('click', showSyncSettings);
        }
    }

    // Update sync settings panel if open
    const settingsPanel = document.querySelector('.gpv-sync-settings');
    if (settingsPanel) {
        settingsPanel.outerHTML = createSyncSettingsHTML();
        setupSyncSettingsListeners();
    }
}

// ============================================
// CHUNK 7: HELPER FUNCTIONS
// ============================================

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Show success message
 */
function showSuccessMessage(message) {
    showNotification(message, 'success');
}

/**
 * Show error message
 */
function showErrorMessage(message) {
    showNotification(message, 'error');
}

/**
 * Show info message
 */
function showInfoMessage(message) {
    showNotification(message, 'info');
}

/**
 * Show notification (toast)
 */
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `gpv-notification gpv-notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Fade in
    setTimeout(() => {
        notification.classList.add('gpv-notification-show');
    }, 10);
    
    // Fade out and remove
    setTimeout(() => {
        notification.classList.remove('gpv-notification-show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// ============================================
// CHUNK 8: SYNC STYLES
// ============================================
// Add these styles to the existing style section

const SYNC_STYLES = `
    /* Sync Settings Modal */
    .gpv-sync-modal {
        max-width: 700px;
        max-height: 90vh;
        overflow-y: auto;
    }

    .gpv-sync-settings {
        padding: 20px;
    }

    .gpv-sync-header h3 {
        margin: 0 0 15px 0;
        font-size: 20px;
        font-weight: 600;
    }

    .gpv-sync-warning {
        background-color: #fff3cd;
        border: 1px solid #ffc107;
        border-radius: 4px;
        padding: 12px;
        margin-bottom: 15px;
        color: #856404;
    }

    .gpv-sync-status-bar {
        background-color: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        padding: 12px;
        margin-bottom: 20px;
    }

    .gpv-sync-status-item {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
    }

    .gpv-sync-status-item:last-child {
        margin-bottom: 0;
    }

    .gpv-sync-label {
        font-weight: 600;
        margin-right: 8px;
        min-width: 100px;
    }

    .gpv-sync-value {
        flex: 1;
    }

    .gpv-sync-status-idle {
        color: #6c757d;
    }

    .gpv-sync-status-syncing {
        color: #007bff;
        font-weight: 600;
    }

    .gpv-sync-status-success {
        color: #28a745;
        font-weight: 600;
    }

    .gpv-sync-status-error {
        color: #dc3545;
        font-weight: 600;
    }

    .gpv-sync-status-conflict {
        color: #ffc107;
        font-weight: 600;
    }

    .gpv-sync-error {
        color: #dc3545;
    }

    .gpv-sync-form {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .gpv-sync-form-group {
        display: flex;
        flex-direction: column;
    }

    .gpv-sync-form-group label {
        font-weight: 600;
        margin-bottom: 6px;
        font-size: 14px;
    }

    .gpv-sync-input {
        padding: 8px 12px;
        border: 1px solid #ced4da;
        border-radius: 4px;
        font-size: 14px;
        font-family: inherit;
    }

    .gpv-sync-input:disabled {
        background-color: #e9ecef;
        cursor: not-allowed;
    }

    .gpv-sync-input:focus {
        outline: none;
        border-color: #007bff;
        box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
    }

    .gpv-sync-toggle {
        display: flex;
        align-items: center;
        cursor: pointer;
        user-select: none;
    }

    .gpv-sync-toggle input[type="checkbox"] {
        margin-right: 8px;
        cursor: pointer;
    }

    .gpv-sync-toggle input[type="checkbox"]:disabled {
        cursor: not-allowed;
    }

    .gpv-sync-help {
        margin: 6px 0 0 0;
        font-size: 12px;
        color: #6c757d;
    }

    .gpv-sync-help a {
        color: #007bff;
        text-decoration: none;
    }

    .gpv-sync-help a:hover {
        text-decoration: underline;
    }

    .gpv-sync-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 10px;
    }

    .gpv-sync-btn {
        padding: 10px 20px;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .gpv-sync-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .gpv-sync-btn-primary {
        background-color: #007bff;
        color: white;
    }

    .gpv-sync-btn-primary:hover:not(:disabled) {
        background-color: #0056b3;
    }

    .gpv-sync-btn-secondary {
        background-color: #6c757d;
        color: white;
    }

    .gpv-sync-btn-secondary:hover:not(:disabled) {
        background-color: #545b62;
    }

    .gpv-sync-btn-danger {
        background-color: #dc3545;
        color: white;
    }

    .gpv-sync-btn-danger:hover:not(:disabled) {
        background-color: #c82333;
    }

    /* Conflict Dialog */
    .gpv-conflict-modal {
        max-width: 800px;
    }

    .gpv-conflict-dialog {
        padding: 20px;
    }

    .gpv-conflict-dialog h3 {
        margin: 0 0 15px 0;
        font-size: 20px;
        font-weight: 600;
    }

    .gpv-conflict-description {
        margin: 0 0 20px 0;
        color: #6c757d;
    }

    .gpv-conflict-comparison {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 20px;
        margin-bottom: 20px;
        align-items: center;
    }

    .gpv-conflict-option {
        border: 2px solid #dee2e6;
        border-radius: 8px;
        padding: 20px;
    }

    .gpv-conflict-option h4 {
        margin: 0 0 15px 0;
        font-size: 16px;
        font-weight: 600;
    }

    .gpv-conflict-details {
        list-style: none;
        padding: 0;
        margin: 0 0 15px 0;
    }

    .gpv-conflict-details li {
        padding: 6px 0;
        font-size: 14px;
    }

    .gpv-conflict-divider {
        font-weight: 600;
        color: #6c757d;
        text-align: center;
    }

    .gpv-conflict-warning {
        background-color: #fff3cd;
        border: 1px solid #ffc107;
        border-radius: 4px;
        padding: 12px;
        margin-bottom: 15px;
    }

    .gpv-conflict-warning p {
        margin: 0;
        color: #856404;
        font-size: 14px;
    }

    .gpv-conflict-actions {
        display: flex;
        justify-content: center;
    }

    /* Sync Indicator */
    .gpv-sync-indicator {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: white;
        border: 1px solid #dee2e6;
        border-radius: 20px;
        padding: 8px 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        transition: all 0.2s;
        z-index: 9999;
    }

    .gpv-sync-indicator:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .gpv-sync-icon {
        font-size: 16px;
    }

    .gpv-sync-text {
        font-size: 13px;
        font-weight: 600;
    }

    .gpv-sync-indicator.gpv-sync-status-syncing .gpv-sync-icon {
        animation: gpv-spin 1s linear infinite;
    }

    @keyframes gpv-spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }

    /* Notifications */
    .gpv-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: white;
        border-radius: 4px;
        padding: 12px 16px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        opacity: 0;
        transform: translateY(-20px);
        transition: all 0.3s;
        max-width: 400px;
    }

    .gpv-notification-show {
        opacity: 1;
        transform: translateY(0);
    }

    .gpv-notification-success {
        border-left: 4px solid #28a745;
    }

    .gpv-notification-error {
        border-left: 4px solid #dc3545;
    }

    .gpv-notification-info {
        border-left: 4px solid #007bff;
    }

    /* Responsive adjustments */
    @media (max-width: 768px) {
        .gpv-conflict-comparison {
            grid-template-columns: 1fr;
        }

        .gpv-conflict-divider {
            display: none;
        }

        .gpv-sync-indicator {
            bottom: 10px;
            right: 10px;
        }

        .gpv-sync-text {
            display: none;
        }
    }
`;
