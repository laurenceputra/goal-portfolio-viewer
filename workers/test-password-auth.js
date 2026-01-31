/**
 * Test script for password-based authentication
 * 
 * Run with: node test-password-auth.js
 * 
 * This tests the complete password authentication flow:
 * 1. Register a new user
 * 2. Login with credentials
 * 3. Upload encrypted data
 * 4. Download encrypted data
 * 5. Delete data
 */

const crypto = require('crypto');

// Configuration
const BASE_URL = process.env.SYNC_SERVER_URL || 'http://localhost:8787';
const TEST_USER_ID = `test-user-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';

/**
 * Hash password for authentication (matches frontend implementation)
 */
function hashPasswordForAuth(password, userId) {
    const data = password + '|' + userId;
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Test registration endpoint
 */
async function testRegister() {
    console.log('\n=== Testing Registration ===');
    console.log(`User ID: ${TEST_USER_ID}`);
    console.log(`Password: ${TEST_PASSWORD}`);
    
    const passwordHash = hashPasswordForAuth(TEST_PASSWORD, TEST_USER_ID);
    console.log(`Password Hash: ${passwordHash.substring(0, 20)}...`);
    
    const response = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            userId: TEST_USER_ID,
            passwordHash
        })
    });
    
    const result = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Result:`, result);
    
    if (!result.success) {
        throw new Error(`Registration failed: ${result.message}`);
    }
    
    console.log('✅ Registration successful!');
    return passwordHash;
}

/**
 * Test login endpoint
 */
async function testLogin(passwordHash) {
    console.log('\n=== Testing Login ===');
    
    const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            userId: TEST_USER_ID,
            passwordHash
        })
    });
    
    const result = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Result:`, result);
    
    if (!result.success) {
        throw new Error(`Login failed: ${result.message}`);
    }
    
    console.log('✅ Login successful!');
}

/**
 * Test upload with password authentication
 */
async function testUpload(passwordHash) {
    console.log('\n=== Testing Upload ===');
    
    const testData = {
        userId: TEST_USER_ID,
        deviceId: 'test-device-123',
        encryptedData: Buffer.from('encrypted_test_data').toString('base64'),
        timestamp: Date.now(),
        version: 1
    };
    
    const response = await fetch(`${BASE_URL}/sync`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Password-Hash': passwordHash,
            'X-User-Id': TEST_USER_ID
        },
        body: JSON.stringify(testData)
    });
    
    const result = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Result:`, result);
    
    if (!result.success) {
        throw new Error(`Upload failed: ${result.error || 'Unknown error'}`);
    }
    
    console.log('✅ Upload successful!');
}

/**
 * Test download with password authentication
 */
async function testDownload(passwordHash) {
    console.log('\n=== Testing Download ===');
    
    const response = await fetch(`${BASE_URL}/sync/${TEST_USER_ID}`, {
        method: 'GET',
        headers: {
            'X-Password-Hash': passwordHash,
            'X-User-Id': TEST_USER_ID
        }
    });
    
    const result = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Result:`, JSON.stringify(result, null, 2));
    
    if (!result.success) {
        throw new Error(`Download failed: ${result.error || 'Unknown error'}`);
    }
    
    console.log('✅ Download successful!');
}

/**
 * Test delete with password authentication
 */
async function testDelete(passwordHash) {
    console.log('\n=== Testing Delete ===');
    
    const response = await fetch(`${BASE_URL}/sync/${TEST_USER_ID}`, {
        method: 'DELETE',
        headers: {
            'X-Password-Hash': passwordHash,
            'X-User-Id': TEST_USER_ID
        }
    });
    
    const result = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Result:`, result);
    
    if (!result.success) {
        throw new Error(`Delete failed: ${result.error || 'Unknown error'}`);
    }
    
    console.log('✅ Delete successful!');
}

/**
 * Test invalid credentials
 */
async function testInvalidCredentials() {
    console.log('\n=== Testing Invalid Credentials ===');
    
    const wrongPasswordHash = hashPasswordForAuth('WrongPassword', TEST_USER_ID);
    
    const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            userId: TEST_USER_ID,
            passwordHash: wrongPasswordHash
        })
    });
    
    const result = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Result:`, result);
    
    if (result.success) {
        throw new Error('Expected login to fail with wrong password!');
    }
    
    console.log('✅ Invalid credentials correctly rejected!');
}

/**
 * Run all tests
 */
async function runTests() {
    console.log('==========================================');
    console.log('Password Authentication Test Suite');
    console.log('==========================================');
    console.log(`Server: ${BASE_URL}`);
    console.log(`Test User: ${TEST_USER_ID}`);
    
    try {
        // Test registration
        const passwordHash = await testRegister();
        
        // Test login
        await testLogin(passwordHash);
        
        // Test upload with password auth
        await testUpload(passwordHash);
        
        // Test download with password auth
        await testDownload(passwordHash);
        
        // Test delete with password auth
        await testDelete(passwordHash);
        
        // Test invalid credentials
        await testInvalidCredentials();
        
        console.log('\n==========================================');
        console.log('✅ ALL TESTS PASSED!');
        console.log('==========================================');
        
    } catch (error) {
        console.error('\n==========================================');
        console.error('❌ TEST FAILED!');
        console.error('==========================================');
        console.error(error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run tests
runTests();
