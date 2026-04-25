const assert = require('node:assert/strict');
const test = require('node:test');

const { compareSemver, getValidationErrors, parseSemver } = require('./check-version-bump');

function versionRecord(label, currentVersion, baseVersion) {
    return { label, currentVersion, baseVersion };
}

test('parseSemver accepts stable, prerelease, and build metadata versions', () => {
    assert.deepEqual(parseSemver('2.14.5'), {
        core: [2, 14, 5],
        prerelease: []
    });
    assert.deepEqual(parseSemver('2.14.5-rc.1+build.7'), {
        core: [2, 14, 5],
        prerelease: ['rc', '1']
    });
});

test('parseSemver rejects invalid versions', () => {
    assert.equal(parseSemver('2.14'), null);
    assert.equal(parseSemver('2.14.05'), null);
    assert.equal(parseSemver('2.14.5-01'), null);
});

test('compareSemver orders core versions', () => {
    assert.equal(compareSemver('2.14.5', '2.14.4'), 1);
    assert.equal(compareSemver('2.14.5', '2.15.0'), -1);
    assert.equal(compareSemver('2.14.5', '2.14.5'), 0);
});

test('compareSemver orders prerelease versions before stable versions', () => {
    assert.equal(compareSemver('2.14.5-rc.1', '2.14.5'), -1);
    assert.equal(compareSemver('2.14.5', '2.14.5-rc.1'), 1);
    assert.equal(compareSemver('2.14.5-rc.2', '2.14.5-rc.1'), 1);
});

test('compareSemver ignores build metadata precedence', () => {
    assert.equal(compareSemver('2.14.5+build.2', '2.14.5+build.1'), 0);
});

test('getValidationErrors accepts aligned versions bumped above base', () => {
    const errors = getValidationErrors([
        versionRecord('workspace package', '2.14.5', '2.14.4'),
        versionRecord('userscript package', '2.14.5', '2.14.4'),
        versionRecord('userscript metadata', '2.14.5', '2.14.4')
    ]);

    assert.deepEqual(errors, []);
});

test('getValidationErrors rejects unchanged versions', () => {
    const errors = getValidationErrors([
        versionRecord('workspace package', '2.14.4', '2.14.4'),
        versionRecord('userscript package', '2.14.4', '2.14.4'),
        versionRecord('userscript metadata', '2.14.4', '2.14.4')
    ]);

    assert.match(errors.join('\n'), /Version must be bumped above 2\.14\.4/);
});

test('getValidationErrors rejects misaligned current versions', () => {
    const errors = getValidationErrors([
        versionRecord('workspace package', '2.14.5', '2.14.4'),
        versionRecord('userscript package', '2.14.4', '2.14.4'),
        versionRecord('userscript metadata', '2.14.5', '2.14.4')
    ]);

    assert.match(errors.join('\n'), /Current versions must stay aligned/);
});

test('getValidationErrors rejects missing userscript metadata version', () => {
    const errors = getValidationErrors([
        versionRecord('workspace package', '2.14.5', '2.14.4'),
        versionRecord('userscript package', '2.14.5', '2.14.4'),
        versionRecord('userscript metadata', undefined, '2.14.4')
    ]);

    assert.match(errors.join('\n'), /userscript metadata has invalid current semver: <missing>/);
});
