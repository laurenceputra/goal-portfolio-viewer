#!/usr/bin/env node

import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT_MARKDOWN_DIRECTORIES = ['.agents', '.github', 'demo', 'docs', 'tampermonkey', 'workers'];
const IGNORED_DIRECTORIES = new Set([
    '.git',
    '.review-audit-branch',
    'coverage',
    'node_modules',
    'spec'
]);
const WORKSPACE_PACKAGE_PATHS = {
    root: 'package.json',
    demo: 'demo/package.json',
    tampermonkey: 'tampermonkey/package.json',
    workers: 'workers/package.json'
};
const WORKSPACE_DIRECTORIES = {
    root: '',
    demo: 'demo',
    tampermonkey: 'tampermonkey',
    workers: 'workers'
};
const NON_SCRIPT_PNPM_COMMANDS = new Set([
    'add',
    'approve-builds',
    'audit',
    'bin',
    'config',
    'create',
    'deploy',
    'dlx',
    'env',
    'exec',
    'fetch',
    'help',
    'i',
    'import',
    'info',
    'init',
    'install',
    'link',
    'list',
    'ln',
    'outdated',
    'pack',
    'patch',
    'patch-commit',
    'prune',
    'publish',
    'remove',
    'root',
    'setup',
    'store',
    'unlink',
    'update',
    'up',
    'why'
]);
const NON_SCRIPT_NPM_COMMANDS = new Set([
    'access',
    'adduser',
    'audit',
    'bin',
    'cache',
    'ci',
    'config',
    'dedupe',
    'dist-tag',
    'doctor',
    'exec',
    'explain',
    'help',
    'help-search',
    'init',
    'install',
    'link',
    'login',
    'logout',
    'ls',
    'outdated',
    'owner',
    'pack',
    'ping',
    'prefix',
    'profile',
    'prune',
    'publish',
    'query',
    'rebuild',
    'repo',
    'root',
    'search',
    'shrinkwrap',
    'team',
    'uninstall',
    'unpublish',
    'version',
    'view',
    'whoami'
]);

function compareIssues(left, right) {
    return (
        left.file.localeCompare(right.file) ||
        (left.line ?? 0) - (right.line ?? 0) ||
        left.kind.localeCompare(right.kind) ||
        left.message.localeCompare(right.message)
    );
}

async function pathExists(targetPath) {
    try {
        await access(targetPath);
        return true;
    } catch {
        return false;
    }
}

function cleanLinkTarget(rawTarget) {
    const trimmed = rawTarget.trim();
    const withoutAngles =
        trimmed.startsWith('<') && trimmed.endsWith('>')
            ? trimmed.slice(1, -1).trim()
            : trimmed;
    const match = withoutAngles.match(/^(\S+)(?:\s+["'][^"']*["'])?$/);

    return match ? match[1] : withoutAngles;
}

function isIgnoredLinkTarget(target) {
    return (
        !target ||
        target.startsWith('#') ||
        /^[a-z][a-z0-9+.-]*:/i.test(target)
    );
}

function stripLinkDecorators(target) {
    return target.replace(/[?#].*$/, '');
}

function inferPackageKey(docPath) {
    if (docPath.startsWith('demo/')) {
        return 'demo';
    }

    if (docPath.startsWith('tampermonkey/')) {
        return 'tampermonkey';
    }

    if (docPath.startsWith('workers/')) {
        return 'workers';
    }

    return 'root';
}

function resolveWorkspaceFilter(filterValue) {
    if (!filterValue) {
        return null;
    }

    const normalized = filterValue
        .replace(/\/+$/, '')
        .replace(/^\.\//, '');

    if (!normalized || normalized === '.') {
        return 'root';
    }

    if (normalized === 'demo') {
        return 'demo';
    }

    if (normalized === 'tampermonkey') {
        return 'tampermonkey';
    }

    if (normalized === 'workers') {
        return 'workers';
    }

    return null;
}

function stripCommandComment(command) {
    return command.replace(/\s+#.*$/, '').trim();
}

function normalizeShellToken(token) {
    if (
        (token.startsWith('"') && token.endsWith('"')) ||
        (token.startsWith('\'') && token.endsWith('\''))
    ) {
        return token.slice(1, -1);
    }

    return token;
}

function tokenizeShellCommand(command) {
    return (command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []).map(normalizeShellToken);
}

function splitShellChain(command) {
    return stripCommandComment(command)
        .split(/\s*(?:&&|;)\s*/)
        .map(segment => segment.trim())
        .filter(Boolean);
}

function resolveWorkspaceDirectory(directoryValue, currentPackageKey) {
    if (!directoryValue) {
        return currentPackageKey;
    }

    const currentDirectory = WORKSPACE_DIRECTORIES[currentPackageKey] || '.';
    const normalizedPath = path.posix
        .normalize(path.posix.join(currentDirectory, directoryValue))
        .replace(/\/+$/, '')
        .replace(/^\.\//, '');

    return resolveWorkspaceFilter(normalizedPath) || currentPackageKey;
}

function parsePnpmCommand(tokens, defaultPackageKey) {
    let packageKey = defaultPackageKey;
    let index = 1;

    while (index < tokens.length) {
        const token = tokens[index];

        if (token === '--filter' || token === '-F') {
            packageKey = resolveWorkspaceFilter(tokens[index + 1]) || packageKey;
            index += 2;
            continue;
        }

        if (token.startsWith('--filter=')) {
            packageKey = resolveWorkspaceFilter(token.slice('--filter='.length)) || packageKey;
            index += 1;
            continue;
        }

        if (token.startsWith('-')) {
            index += 1;
            continue;
        }

        break;
    }

    const subcommand = tokens[index];

    if (!subcommand) {
        return null;
    }

    if (subcommand === 'run') {
        const scriptName = tokens[index + 1];

        return scriptName ? { packageKey, scriptName } : null;
    }

    if (NON_SCRIPT_PNPM_COMMANDS.has(subcommand)) {
        return null;
    }

    return { packageKey, scriptName: subcommand };
}

function parseNpmCommand(tokens, defaultPackageKey) {
    const subcommand = tokens[1];

    if (!subcommand) {
        return null;
    }

    if (subcommand === 'run') {
        const scriptName = tokens[2];

        return scriptName ? { packageKey: defaultPackageKey, scriptName } : null;
    }

    if (['restart', 'start', 'stop', 'test'].includes(subcommand)) {
        return { packageKey: defaultPackageKey, scriptName: subcommand };
    }

    if (NON_SCRIPT_NPM_COMMANDS.has(subcommand)) {
        return null;
    }

    return null;
}

export function parseDocumentedCommand(command, defaultPackageKey) {
    return parseDocumentedCommands(command, defaultPackageKey)[0] || null;
}

export function parseDocumentedCommands(command, defaultPackageKey) {
    const parsedCommands = [];
    let activePackageKey = defaultPackageKey;

    for (const segment of splitShellChain(command)) {
        const tokens = tokenizeShellCommand(segment);

        if (tokens.length === 0) {
            continue;
        }

        if (tokens[0] === 'cd') {
            activePackageKey = resolveWorkspaceDirectory(tokens[1], activePackageKey);
            continue;
        }

        if (tokens[0] === 'pnpm') {
            const parsed = parsePnpmCommand(tokens, activePackageKey);

            if (parsed) {
                parsedCommands.push(parsed);
            }

            continue;
        }

        if (tokens[0] === 'npm') {
            const parsed = parseNpmCommand(tokens, activePackageKey);

            if (parsed) {
                parsedCommands.push(parsed);
            }
        }
    }

    return parsedCommands;
}

function addDocumentedCommand(commands, seen, command, line) {
    const normalizedCommand = stripCommandComment(command);

    if (!normalizedCommand) {
        return;
    }

    const key = `${line}:${normalizedCommand}`;

    if (seen.has(key)) {
        return;
    }

    seen.add(key);
    commands.push({ command: normalizedCommand, line });
}

export function extractDocumentedCommands(content) {
    const commands = [];
    const seen = new Set();
    const lines = content.split(/\r?\n/);
    let activeFence = null;

    lines.forEach((line, lineIndex) => {
        const trimmed = line.trim();

        const fenceMatch = trimmed.match(/^(```+|~~~+)/);

        if (fenceMatch) {
            const fenceMarker = fenceMatch[1];

            if (!activeFence) {
                activeFence = fenceMarker;
            } else if (trimmed.startsWith(activeFence)) {
                activeFence = null;
            }

            return;
        }

        if (activeFence && /\b(?:pnpm|npm)\b/.test(trimmed)) {
            addDocumentedCommand(commands, seen, trimmed, lineIndex + 1);
        }

        if (/^(?:pnpm|npm|cd)\b/.test(trimmed) && /\b(?:pnpm|npm)\b/.test(trimmed)) {
            addDocumentedCommand(commands, seen, trimmed, lineIndex + 1);
        }

        for (const match of line.matchAll(/`([^`\n]+)`/g)) {
            const command = match[1].trim();

            if (!/\b(?:pnpm|npm)\b/.test(command)) {
                continue;
            }

            addDocumentedCommand(commands, seen, command, lineIndex + 1);
        }
    });

    return commands;
}

export function extractMarkdownTargets(content) {
    const targets = [];
    const lines = content.split(/\r?\n/);

    lines.forEach((line, lineIndex) => {
        for (const match of line.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g)) {
            targets.push({
                line: lineIndex + 1,
                target: cleanLinkTarget(match[1])
            });
        }
    });

    return targets;
}

async function loadJson(filePath) {
    return JSON.parse(await readFile(filePath, 'utf8'));
}

async function loadWorkspacePackages(rootDir) {
    const entries = await Promise.all(
        Object.entries(WORKSPACE_PACKAGE_PATHS).map(async ([packageKey, relativePath]) => {
            const absolutePath = path.join(rootDir, relativePath);
            const data = await loadJson(absolutePath);

            return [
                packageKey,
                {
                    path: relativePath,
                    version: String(data.version || ''),
                    scripts: data.scripts || {}
                }
            ];
        })
    );

    return Object.fromEntries(entries);
}

async function listRootMarkdownFiles(rootDir) {
    const entries = await readdir(rootDir, { withFileTypes: true });

    return entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
        .map(entry => entry.name)
        .sort((left, right) => left.localeCompare(right));
}

async function walkMarkdownDirectory(rootDir, directory) {
    const absoluteDirectory = path.join(rootDir, directory);
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    const files = [];

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (entry.isDirectory()) {
            if (IGNORED_DIRECTORIES.has(entry.name)) {
                continue;
            }

            const nestedDirectory = path.posix.join(directory, entry.name);
            files.push(...await walkMarkdownDirectory(rootDir, nestedDirectory));
            continue;
        }

        if (entry.isFile() && entry.name.endsWith('.md')) {
            files.push(path.posix.join(directory, entry.name));
        }
    }

    return files;
}

export async function listMarkdownFiles(rootDir) {
    const files = await listRootMarkdownFiles(rootDir);

    for (const directory of ROOT_MARKDOWN_DIRECTORIES) {
        const absoluteDirectory = path.join(rootDir, directory);

        if (!await pathExists(absoluteDirectory)) {
            continue;
        }

        files.push(...await walkMarkdownDirectory(rootDir, directory));
    }

    return files.sort((left, right) => left.localeCompare(right));
}

async function checkRelativeLinks(rootDir, docPath, content) {
    const issues = [];

    for (const link of extractMarkdownTargets(content)) {
        if (isIgnoredLinkTarget(link.target)) {
            continue;
        }

        const strippedTarget = stripLinkDecorators(link.target);

        if (!strippedTarget) {
            continue;
        }

        const resolvedPath = path.resolve(rootDir, path.dirname(docPath), strippedTarget);

        if (await pathExists(resolvedPath)) {
            continue;
        }

        issues.push({
            kind: 'broken-link',
            file: docPath,
            line: link.line,
            message: `Missing relative target "${link.target}".`
        });
    }

    return issues;
}

function checkCommandsInDocument(docPath, content, packages) {
    const issues = [];
    const defaultPackageKey = inferPackageKey(docPath);

    for (const entry of extractDocumentedCommands(content)) {
        for (const parsed of parseDocumentedCommands(entry.command, defaultPackageKey)) {
            const packageState = packages[parsed.packageKey];

            if (!packageState) {
                issues.push({
                    kind: 'missing-script',
                    file: docPath,
                    line: entry.line,
                    message: `Command "${entry.command}" targets unknown workspace "${parsed.packageKey}".`
                });
                continue;
            }

            if (packageState.scripts[parsed.scriptName]) {
                continue;
            }

            issues.push({
                kind: 'missing-script',
                file: docPath,
                line: entry.line,
                message: `Command "${entry.command}" references missing script "${parsed.scriptName}" in ${packageState.path}.`
            });
        }
    }

    return issues;
}

async function checkVersionTouchpoints(rootDir, packages) {
    const issues = [];
    const rootVersion = packages.root.version;
    const userscriptPath = 'tampermonkey/goal_portfolio_viewer.user.js';
    const userscriptContent = await readFile(path.join(rootDir, userscriptPath), 'utf8');
    const metadataVersion = userscriptContent.match(/^\s*\/\/\s*@version\s+([^\s]+)\s*$/m)?.[1] || '';

    if (packages.tampermonkey.version !== rootVersion) {
        issues.push({
            kind: 'version-mismatch',
            file: WORKSPACE_PACKAGE_PATHS.tampermonkey,
            message: `Version "${packages.tampermonkey.version}" does not match root package version "${rootVersion}".`
        });
    }

    if (metadataVersion !== rootVersion) {
        issues.push({
            kind: 'version-mismatch',
            file: userscriptPath,
            message: `Userscript metadata version "${metadataVersion}" does not match root package version "${rootVersion}".`
        });
    }

    return issues;
}

export async function checkDocDrift({ rootDir = process.cwd() } = {}) {
    const packages = await loadWorkspacePackages(rootDir);
    const files = await listMarkdownFiles(rootDir);
    const issues = [];

    for (const docPath of files) {
        const absolutePath = path.join(rootDir, docPath);
        const content = await readFile(absolutePath, 'utf8');

        issues.push(...await checkRelativeLinks(rootDir, docPath, content));
        issues.push(...checkCommandsInDocument(docPath, content, packages));
    }

    issues.push(...await checkVersionTouchpoints(rootDir, packages));
    issues.sort(compareIssues);

    return {
        files,
        issues
    };
}

export function formatIssues(issues) {
    return issues.map(issue => {
        const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
        return `- [${issue.kind}] ${location} ${issue.message}`;
    }).join('\n');
}

async function main() {
    const result = await checkDocDrift({ rootDir: process.cwd() });

    if (result.issues.length === 0) {
        console.log(`No documentation drift detected across ${result.files.length} markdown files.`);
        return;
    }

    console.error('Documentation drift detected:\n');
    console.error(formatIssues(result.issues));
    process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
