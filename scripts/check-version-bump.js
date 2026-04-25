const { execFileSync } = require('child_process');
const fs = require('fs');

const VERSION_FILES = [
    {
        label: 'workspace package',
        path: 'package.json',
        readVersion: contents => JSON.parse(contents).version
    },
    {
        label: 'userscript package',
        path: 'tampermonkey/package.json',
        readVersion: contents => JSON.parse(contents).version
    },
    {
        label: 'userscript metadata',
        path: 'tampermonkey/goal_portfolio_viewer.user.js',
        readVersion: contents => {
            const match = contents.match(/^\/\/\s*@version\s+(\S+)\s*$/m);
            return match ? match[1] : undefined;
        }
    }
];

function parseSemver(version) {
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version || '');
    if (!match) {
        return null;
    }
    const prerelease = match[4] ? match[4].split('.') : [];
    const invalidNumericPrerelease = prerelease.some(identifier => /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith('0'));
    if (invalidNumericPrerelease) {
        return null;
    }
    return {
        core: match.slice(1, 4).map(Number),
        prerelease
    };
}

function comparePrerelease(left, right) {
    if (!left.length && !right.length) return 0;
    if (!left.length) return 1;
    if (!right.length) return -1;

    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        if (left[index] === undefined) return -1;
        if (right[index] === undefined) return 1;
        if (left[index] === right[index]) continue;

        const leftNumeric = /^\d+$/.test(left[index]);
        const rightNumeric = /^\d+$/.test(right[index]);
        if (leftNumeric && rightNumeric) {
            return Number(left[index]) > Number(right[index]) ? 1 : -1;
        }
        if (leftNumeric) return -1;
        if (rightNumeric) return 1;
        return left[index] > right[index] ? 1 : -1;
    }

    return 0;
}

function compareSemver(left, right) {
    const leftParts = parseSemver(left);
    const rightParts = parseSemver(right);

    if (!leftParts || !rightParts) {
        throw new Error(`Cannot compare invalid semver values: ${left || '<empty>'} and ${right || '<empty>'}`);
    }

    for (let index = 0; index < leftParts.core.length; index += 1) {
        if (leftParts.core[index] > rightParts.core[index]) return 1;
        if (leftParts.core[index] < rightParts.core[index]) return -1;
    }
    return comparePrerelease(leftParts.prerelease, rightParts.prerelease);
}

function readBaseFile(baseRef, filePath) {
    return execFileSync('git', ['show', `${baseRef}:${filePath}`], { encoding: 'utf8' });
}

function collectVersions(baseRef) {
    return VERSION_FILES.map(file => {
        const currentContents = fs.readFileSync(file.path, 'utf8');
        const baseContents = readBaseFile(baseRef, file.path);
        return {
            ...file,
            currentVersion: file.readVersion(currentContents),
            baseVersion: file.readVersion(baseContents)
        };
    });
}

function getValidationErrors(versions) {
    const errors = [];

    versions.forEach(({ label, currentVersion, baseVersion }) => {
        if (!parseSemver(currentVersion)) {
            errors.push(`${label} has invalid current semver: ${currentVersion || '<missing>'}`);
        }
        if (!parseSemver(baseVersion)) {
            errors.push(`${label} has invalid base semver: ${baseVersion || '<missing>'}`);
        }
    });

    const currentVersions = new Set(versions.map(({ currentVersion }) => currentVersion));
    if (currentVersions.size > 1) {
        errors.push(`Current versions must stay aligned: ${versions.map(({ label, currentVersion }) => `${label}=${currentVersion || '<missing>'}`).join(', ')}`);
    }

    const baseVersions = new Set(versions.map(({ baseVersion }) => baseVersion));
    if (baseVersions.size > 1) {
        errors.push(`Base versions are not aligned: ${versions.map(({ label, baseVersion }) => `${label}=${baseVersion || '<missing>'}`).join(', ')}`);
    }

    if (!errors.length) {
        const currentVersion = versions[0].currentVersion;
        const baseVersion = versions[0].baseVersion;
        if (compareSemver(currentVersion, baseVersion) <= 0) {
            errors.push(`Version must be bumped above ${baseVersion}; current version is ${currentVersion}.`);
        }
    }

    return errors;
}

function validateVersions(baseRef) {
    const versions = collectVersions(baseRef);
    const errors = getValidationErrors(versions);

    if (errors.length) {
        console.error('Version bump validation failed.');
        errors.forEach(error => console.error(`- ${error}`));
        process.exit(1);
    }

    const currentVersion = versions[0].currentVersion;
    const baseVersion = versions[0].baseVersion;
    console.log(`Version bump validation passed: ${baseVersion} -> ${currentVersion}.`);
}

const baseRef = process.argv[2] || 'origin/main';
if (require.main === module) {
    validateVersions(baseRef);
}

module.exports = {
    comparePrerelease,
    compareSemver,
    getValidationErrors,
    parseSemver,
    validateVersions
};
