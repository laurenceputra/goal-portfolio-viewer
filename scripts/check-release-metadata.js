#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ROOT_PACKAGE_PATH = path.join(ROOT_DIR, 'package.json');
const TAMERMONKEY_PACKAGE_PATH = path.join(ROOT_DIR, 'tampermonkey', 'package.json');
const USERSCRIPT_PATH = path.join(ROOT_DIR, 'tampermonkey', 'goal_portfolio_viewer.user.js');
const README_PATH = path.join(ROOT_DIR, 'tampermonkey', 'README.md');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readText(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function getVersionFromUserscript(contents) {
    const match = contents.match(/^\s*\/\/\s*@version\s+([0-9]+\.[0-9]+\.[0-9]+)\s*$/m);
    return match ? match[1] : null;
}

function getLatestChangelogVersion(readmeContents) {
    const match = readmeContents.match(/^###\s+Version\s+([0-9]+\.[0-9]+\.[0-9]+)\s*$/m);
    return match ? match[1] : null;
}

function fail(messages) {
    console.error('Release metadata check failed.');
    messages.forEach(message => console.error(`- ${message}`));
    process.exit(1);
}

function main() {
    const rootPackage = readJson(ROOT_PACKAGE_PATH);
    const tampermonkeyPackage = readJson(TAMERMONKEY_PACKAGE_PATH);
    const userscript = readText(USERSCRIPT_PATH);
    const readme = readText(README_PATH);

    const rootVersion = rootPackage.version;
    const tampermonkeyVersion = tampermonkeyPackage.version;
    const userscriptVersion = getVersionFromUserscript(userscript);
    const readmeVersion = getLatestChangelogVersion(readme);

    const errors = [];
    if (!rootVersion) {
        errors.push('root package.json version is missing');
    }
    if (!tampermonkeyVersion) {
        errors.push('tampermonkey/package.json version is missing');
    }
    if (!userscriptVersion) {
        errors.push('userscript @version header is missing or malformed');
    }
    if (!readmeVersion) {
        errors.push('tampermonkey/README.md is missing a Version heading');
    }

    if (rootVersion && tampermonkeyVersion && rootVersion !== tampermonkeyVersion) {
        errors.push(`package versions differ: root=${rootVersion}, tampermonkey=${tampermonkeyVersion}`);
    }
    if (rootVersion && userscriptVersion && rootVersion !== userscriptVersion) {
        errors.push(`userscript version differs from package version: package=${rootVersion}, userscript=${userscriptVersion}`);
    }
    if (rootVersion && readmeVersion && rootVersion !== readmeVersion) {
        errors.push(`README changelog version differs from package version: package=${rootVersion}, README=${readmeVersion}`);
    }

    if (errors.length) {
        fail(errors);
    }

    console.log('Release metadata check passed.');
    console.log(`Version: ${rootVersion}`);
}

if (require.main === module) {
    main();
}

module.exports = {
    main,
    getVersionFromUserscript,
    getLatestChangelogVersion
};
