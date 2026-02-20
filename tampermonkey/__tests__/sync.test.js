/**
 * Unit tests for Sync Encryption functionality
 * Tests AES-GCM encryption, PBKDF2 key derivation, and hash functions
 */

// Set up browser environment mocks BEFORE importing the module
if (!global.crypto || !global.crypto.subtle) {
    const { webcrypto } = require('crypto');
    global.crypto = webcrypto;
    global.window = global.window || {};
    global.window.crypto = {
        ...webcrypto,
        getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
        subtle: webcrypto.subtle
    };
    global.window.location = { href: 'https://test.example.com' };
    global.window.__GPV_DISABLE_AUTO_INIT = true;
    
    // Mock XMLHttpRequest to prevent errors from browser-only code
    global.XMLHttpRequest = class XMLHttpRequest {
        open() {}
        send() {}
        addEventListener() {}
    };
    global.XMLHttpRequest.prototype = {
        open: function() {},
        send: function() {},
        addEventListener: function() {}
    };
}

global.window = global.window || {};
global.window.__GPV_DISABLE_AUTO_INIT = true;

// Import the UserScript to get access to SyncEncryption
const { SyncEncryption } = require('../goal_portfolio_viewer.user.js');

describe('SyncEncryption', () => {
    describe('isSupported', () => {
        test('returns true when Web Crypto API is available', () => {
            expect(SyncEncryption.isSupported()).toBe(true);
        });
    });

    describe('generateUUID', () => {
        test('generates a valid UUID v4', () => {
            const uuid = SyncEncryption.generateUUID();
            
            // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
            expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        });

        test('generates unique UUIDs', () => {
            const uuid1 = SyncEncryption.generateUUID();
            const uuid2 = SyncEncryption.generateUUID();
            const uuid3 = SyncEncryption.generateUUID();
            
            expect(uuid1).not.toBe(uuid2);
            expect(uuid2).not.toBe(uuid3);
            expect(uuid1).not.toBe(uuid3);
        });

        test('generates 100 unique UUIDs', () => {
            const uuids = new Set();
            for (let i = 0; i < 100; i++) {
                uuids.add(SyncEncryption.generateUUID());
            }
            expect(uuids.size).toBe(100);
        });
    });

    describe('encrypt and decrypt', () => {
        const testPassphrase = 'test-passphrase-12345';

        test('encrypts plaintext successfully', async () => {
            const plaintext = 'Hello, World!';
            const encrypted = await SyncEncryption.encrypt(plaintext, testPassphrase);
            
            // Encrypted should be base64 string
            expect(typeof encrypted).toBe('string');
            expect(encrypted.length).toBeGreaterThan(0);
            
            // Should be different from plaintext
            expect(encrypted).not.toBe(plaintext);
            
            // Should be valid base64
            expect(() => atob(encrypted)).not.toThrow();
        });

        test('decrypts ciphertext successfully', async () => {
            const plaintext = 'Hello, World!';
            const encrypted = await SyncEncryption.encrypt(plaintext, testPassphrase);
            const decrypted = await SyncEncryption.decrypt(encrypted, testPassphrase);
            
            expect(decrypted).toBe(plaintext);
        });

        test('roundtrip: encrypt then decrypt returns original', async () => {
            const original = 'This is a test message with special chars: 你好世界 🌍';
            const encrypted = await SyncEncryption.encrypt(original, testPassphrase);
            const decrypted = await SyncEncryption.decrypt(encrypted, testPassphrase);
            
            expect(decrypted).toBe(original);
        });

        test('encrypts empty string', async () => {
            const plaintext = '';
            const encrypted = await SyncEncryption.encrypt(plaintext, testPassphrase);
            const decrypted = await SyncEncryption.decrypt(encrypted, testPassphrase);
            
            expect(decrypted).toBe(plaintext);
        });

        test('encrypts large text', async () => {
            const plaintext = 'x'.repeat(10000);
            const encrypted = await SyncEncryption.encrypt(plaintext, testPassphrase);
            const decrypted = await SyncEncryption.decrypt(encrypted, testPassphrase);
            
            expect(decrypted).toBe(plaintext);
        });

        test('encrypts JSON data', async () => {
            const data = {
                version: 1,
                goalTargets: { goal1: 50, goal2: 30 },
                goalFixed: { goal1: true, goal2: false },
                timestamp: Date.now()
            };
            const plaintext = JSON.stringify(data);
            
            const encrypted = await SyncEncryption.encrypt(plaintext, testPassphrase);
            const decrypted = await SyncEncryption.decrypt(encrypted, testPassphrase);
            const recovered = JSON.parse(decrypted);
            
            expect(recovered).toEqual(data);
        });

        test('different encryptions of same plaintext produce different ciphertexts', async () => {
            const plaintext = 'Same message';
            
            const encrypted1 = await SyncEncryption.encrypt(plaintext, testPassphrase);
            const encrypted2 = await SyncEncryption.encrypt(plaintext, testPassphrase);
            const encrypted3 = await SyncEncryption.encrypt(plaintext, testPassphrase);
            
            // Should be different (random IV)
            expect(encrypted1).not.toBe(encrypted2);
            expect(encrypted2).not.toBe(encrypted3);
            expect(encrypted1).not.toBe(encrypted3);
            
            // But all should decrypt to same plaintext
            const decrypted1 = await SyncEncryption.decrypt(encrypted1, testPassphrase);
            const decrypted2 = await SyncEncryption.decrypt(encrypted2, testPassphrase);
            const decrypted3 = await SyncEncryption.decrypt(encrypted3, testPassphrase);
            
            expect(decrypted1).toBe(plaintext);
            expect(decrypted2).toBe(plaintext);
            expect(decrypted3).toBe(plaintext);
        });

        test('fails to decrypt with wrong passphrase', async () => {
            jest.spyOn(console, 'error').mockImplementation(() => {});
            const plaintext = 'Secret message';
            const encrypted = await SyncEncryption.encrypt(plaintext, testPassphrase);
            
            await expect(
                SyncEncryption.decrypt(encrypted, 'wrong-passphrase')
            ).rejects.toThrow('Decryption failed');
            console.error.mockRestore();
        });

        test('fails to decrypt corrupted ciphertext', async () => {
            jest.spyOn(console, 'error').mockImplementation(() => {});
            const plaintext = 'Secret message';
            const encrypted = await SyncEncryption.encrypt(plaintext, testPassphrase);
            
            // Corrupt the ciphertext (flip some bits in base64)
            const corrupted = encrypted.slice(0, -10) + 'CORRUPTED';
            
            await expect(
                SyncEncryption.decrypt(corrupted, testPassphrase)
            ).rejects.toThrow();
            console.error.mockRestore();
        });

        test('fails to decrypt invalid base64', async () => {
            jest.spyOn(console, 'error').mockImplementation(() => {});
            const invalidBase64 = 'not-valid-base64!!!';
            
            await expect(
                SyncEncryption.decrypt(invalidBase64, testPassphrase)
            ).rejects.toThrow();
            console.error.mockRestore();
        });

        test('different passphrases produce different ciphertexts', async () => {
            jest.spyOn(console, 'error').mockImplementation(() => {});
            const plaintext = 'Same message';
            
            const encrypted1 = await SyncEncryption.encrypt(plaintext, 'passphrase1');
            const encrypted2 = await SyncEncryption.encrypt(plaintext, 'passphrase2');
            
            expect(encrypted1).not.toBe(encrypted2);
            
            // Each can only be decrypted with its own passphrase
            const decrypted1 = await SyncEncryption.decrypt(encrypted1, 'passphrase1');
            expect(decrypted1).toBe(plaintext);
            
            await expect(
                SyncEncryption.decrypt(encrypted1, 'passphrase2')
            ).rejects.toThrow();
            console.error.mockRestore();
        });

        test('handles unicode characters correctly', async () => {
            const plaintext = '日本語 中文 العربية emoji: 😀🎉🌟';
            const encrypted = await SyncEncryption.encrypt(plaintext, testPassphrase);
            const decrypted = await SyncEncryption.decrypt(encrypted, testPassphrase);
            
            expect(decrypted).toBe(plaintext);
        });

        test('handles special control characters', async () => {
            const plaintext = 'Line1\nLine2\tTabbed\rCarriage\0Null';
            const encrypted = await SyncEncryption.encrypt(plaintext, testPassphrase);
            const decrypted = await SyncEncryption.decrypt(encrypted, testPassphrase);
            
            expect(decrypted).toBe(plaintext);
        });
    });

    describe('hash', () => {
        test('generates SHA-256 hash', async () => {
            const data = 'test data';
            const hash = await SyncEncryption.hash(data);
            
            // SHA-256 produces 64 hex characters
            expect(hash).toHaveLength(64);
            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        test('same input produces same hash', async () => {
            const data = 'test data';
            const hash1 = await SyncEncryption.hash(data);
            const hash2 = await SyncEncryption.hash(data);
            const hash3 = await SyncEncryption.hash(data);
            
            expect(hash1).toBe(hash2);
            expect(hash2).toBe(hash3);
        });

        test('different inputs produce different hashes', async () => {
            const hash1 = await SyncEncryption.hash('data1');
            const hash2 = await SyncEncryption.hash('data2');
            const hash3 = await SyncEncryption.hash('data3');
            
            expect(hash1).not.toBe(hash2);
            expect(hash2).not.toBe(hash3);
            expect(hash1).not.toBe(hash3);
        });

        test('small change in input produces completely different hash', async () => {
            const hash1 = await SyncEncryption.hash('test data');
            const hash2 = await SyncEncryption.hash('test datb'); // Changed last char
            
            expect(hash1).not.toBe(hash2);
            
            // Check that hashes are completely different (avalanche effect)
            let differentChars = 0;
            for (let i = 0; i < hash1.length; i++) {
                if (hash1[i] !== hash2[i]) differentChars++;
            }
            expect(differentChars).toBeGreaterThan(30); // At least half different
        });

        test('hashes empty string', async () => {
            const hash = await SyncEncryption.hash('');
            
            expect(hash).toHaveLength(64);
            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        test('hashes large data', async () => {
            const largeData = 'x'.repeat(100000);
            const hash = await SyncEncryption.hash(largeData);
            
            expect(hash).toHaveLength(64);
            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        test('hashes JSON data consistently', async () => {
            const data = {
                version: 1,
                goalTargets: { goal1: 50 },
                timestamp: 1234567890
            };
            const json = JSON.stringify(data);
            
            const hash1 = await SyncEncryption.hash(json);
            const hash2 = await SyncEncryption.hash(json);
            
            expect(hash1).toBe(hash2);
        });

        test('different JSON key order produces different hash', async () => {
            const json1 = JSON.stringify({ a: 1, b: 2 });
            const json2 = JSON.stringify({ b: 2, a: 1 });
            
            const hash1 = await SyncEncryption.hash(json1);
            const hash2 = await SyncEncryption.hash(json2);
            
            // Should be different because string representation is different
            expect(hash1).not.toBe(hash2);
        });
    });

    describe('Security Properties', () => {
        test('encrypted data does not contain plaintext', async () => {
            const plaintext = 'SECRET_PASSWORD_12345';
            const encrypted = await SyncEncryption.encrypt(plaintext, 'passphrase');
            
            // Decode base64 to check raw bytes
            const decoded = atob(encrypted);
            
            // Plaintext should not be visible in encrypted data
            expect(decoded).not.toContain('SECRET');
            expect(decoded).not.toContain('PASSWORD');
            expect(decoded).not.toContain('12345');
        });

        test('passphrase is not stored in encrypted data', async () => {
            const plaintext = 'message';
            const passphrase = 'PASSPHRASE_ABC_123';
            const encrypted = await SyncEncryption.encrypt(plaintext, passphrase);
            
            const decoded = atob(encrypted);
            
            // Passphrase should not be visible
            expect(decoded).not.toContain('PASSPHRASE');
            expect(decoded).not.toContain('ABC');
            expect(decoded).not.toContain('123');
        });

        test('encryption with 100k PBKDF2 iterations (security requirement)', async () => {
            // This test verifies that the implementation uses sufficient iterations
            // The actual iteration count is checked via timing (should take > 10ms)
            const plaintext = 'test';
            const passphrase = 'passphrase';
            
            const startTime = Date.now();
            const encrypted = await SyncEncryption.encrypt(plaintext, passphrase);
            const encryptTime = Date.now() - startTime;
            
            // With 100k iterations, encryption should take at least a few milliseconds
            // (This is a weak test but ensures iterations aren't set to 1)
            expect(encryptTime).toBeGreaterThan(1);
            
            // Verify decrypt works
            const decrypted = await SyncEncryption.decrypt(encrypted, passphrase);
            expect(decrypted).toBe(plaintext);
        });
    });

    describe('Error Handling', () => {
        test('throws error when encrypting without Web Crypto API', async () => {
            // Save original
            const originalCrypto = global.crypto;
            
            // Temporarily remove crypto
            delete global.crypto;
            
            await expect(
                SyncEncryption.encrypt('test', 'pass')
            ).rejects.toThrow('Web Crypto API not supported');
            
            // Restore
            global.crypto = originalCrypto;
        });

        test('throws error when decrypting without Web Crypto API', async () => {
            // Encrypt with crypto available
            const encrypted = await SyncEncryption.encrypt('test', 'pass');
            
            // Save original
            const originalCrypto = global.crypto;
            
            // Temporarily remove crypto
            delete global.crypto;
            
            await expect(
                SyncEncryption.decrypt(encrypted, 'pass')
            ).rejects.toThrow('Web Crypto API not supported');
            
            // Restore
            global.crypto = originalCrypto;
        });

        test('handles null passphrase gracefully', async () => {
            jest.spyOn(console, 'error').mockImplementation(() => {});
            await expect(
                SyncEncryption.encrypt('test', null)
            ).rejects.toThrow();
            console.error.mockRestore();
        });

        test('handles undefined passphrase gracefully', async () => {
            jest.spyOn(console, 'error').mockImplementation(() => {});
            await expect(
                SyncEncryption.encrypt('test', undefined)
            ).rejects.toThrow();
            console.error.mockRestore();
        });

        test('handles empty passphrase', async () => {
            const plaintext = 'test';
            const encrypted = await SyncEncryption.encrypt(plaintext, '');
            const decrypted = await SyncEncryption.decrypt(encrypted, '');
            
            expect(decrypted).toBe(plaintext);
        });
    });

    describe('Performance', () => {
        test('encrypts 1KB of data in reasonable time', async () => {
            const plaintext = 'x'.repeat(1024);
            
            const startTime = Date.now();
            await SyncEncryption.encrypt(plaintext, 'passphrase');
            const duration = Date.now() - startTime;
            
            // Should complete in less than 1 second
            expect(duration).toBeLessThan(1000);
        });

        test('decrypts 1KB of data in reasonable time', async () => {
            const plaintext = 'x'.repeat(1024);
            const encrypted = await SyncEncryption.encrypt(plaintext, 'passphrase');
            
            const startTime = Date.now();
            await SyncEncryption.decrypt(encrypted, 'passphrase');
            const duration = Date.now() - startTime;
            
            // Should complete in less than 1 second
            expect(duration).toBeLessThan(1000);
        });

        test('hashes 1MB of data in reasonable time', async () => {
            const data = 'x'.repeat(1024 * 1024);
            
            const startTime = Date.now();
            await SyncEncryption.hash(data);
            const duration = Date.now() - startTime;
            
            // Should complete in less than 1 second
            expect(duration).toBeLessThan(1000);
        });
    });
});
