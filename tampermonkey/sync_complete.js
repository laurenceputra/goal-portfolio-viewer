/*
 * ===========================================================================
 * SYNC FUNCTIONALITY - COMPLETE IMPLEMENTATION
 * ===========================================================================
 * 
 * This file contains all sync-related code ready to be integrated into
 * goal_portfolio_viewer.user.js
 * 
 * INTEGRATION INSTRUCTIONS:
 * 
 * 1. ADD TO USERSCRIPT HEADER (line ~11):
 *    // @grant        GM_listValues
 * 
 * 2. ADD AFTER EXISTING CONSTANTS (line ~58, after CLASS_NAMES):
 *    Copy section: "SECTION 1: SYNC CONSTANTS"
 * 
 * 3. ADD AFTER STORAGE MANAGEMENT (line ~1656, after Storage section):
 *    Copy sections: "SECTION 2: ENCRYPTION MODULE" and "SECTION 3: SYNC MANAGER"
 * 
 * 4. ADD IN UI SECTION (line ~2054, in the UI section):
 *    Copy section: "SECTION 4: SYNC UI FUNCTIONS"
 * 
 * 5. ADD TO STYLES (line ~3137, append to existing styles):
 *    Copy section: "SECTION 5: SYNC STYLES"
 * 
 * 6. ADD IN INITIALIZATION (line ~4234, in initialization section):
 *    Copy section: "SECTION 6: SYNC INITIALIZATION"
 * 
 * ===========================================================================
 */


// ===========================================================================
// SECTION 1: SYNC CONSTANTS
// ===========================================================================
// ADD THIS AFTER THE EXISTING "CLASS_NAMES" CONSTANT (around line 58)

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


// NOTE: SECTIONS 2-6 ARE TOO LARGE TO FIT IN ONE MESSAGE
// Please refer to sync_implementation.js and sync_ui.js for the complete code
// Or use the SYNC_INTEGRATION.md guide for step-by-step instructions
