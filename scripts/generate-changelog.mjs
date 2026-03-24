#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);

const FIELD_SEPARATOR = '\x1f';
const RECORD_SEPARATOR = '\x1e';
const DEFAULT_OUTPUT_PATH = 'CHANGELOG.md';
const DEFAULT_TO_REF = 'HEAD';
const SECTION_ORDER = [
    'feat',
    'fix',
    'docs',
    'refactor',
    'perf',
    'test',
    'chore',
    'security',
    'other'
];
const SECTION_TITLES = {
    feat: 'Features',
    fix: 'Fixes',
    docs: 'Documentation',
    refactor: 'Refactors',
    perf: 'Performance',
    test: 'Tests',
    chore: 'Chores',
    security: 'Security',
    other: 'Other'
};
const CONVENTIONAL_SUBJECT_PATTERN = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<description>.+)$/i;
const REVERT_SUBJECT_PATTERN = /^Revert\s+"(?<subject>.+)"$/i;

const USAGE = `Usage: node scripts/generate-changelog.mjs [options]

Generate changelog markdown from git history.

Options:
  --from <ref>     Start ref (defaults to latest reachable tag)
  --to <ref>       End ref (defaults to HEAD)
  --write [path]   Write markdown to a file (defaults to CHANGELOG.md)
  --help           Show this message
`;

export {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_TO_REF,
    SECTION_ORDER,
    SECTION_TITLES
};

export function parseArgs(argv) {
    const options = {
        from: undefined,
        to: DEFAULT_TO_REF,
        writePath: null,
        help: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];

        if (argument === '--help' || argument === '-h') {
            options.help = true;
            continue;
        }

        if (argument === '--from') {
            const value = argv[index + 1];
            if (!value || value.startsWith('--')) {
                throw new Error('Missing value for --from.');
            }

            options.from = value;
            index += 1;
            continue;
        }

        if (argument === '--to') {
            const value = argv[index + 1];
            if (!value || value.startsWith('--')) {
                throw new Error('Missing value for --to.');
            }

            options.to = value;
            index += 1;
            continue;
        }

        if (argument === '--write') {
            const value = argv[index + 1];
            if (value && !value.startsWith('--')) {
                options.writePath = value;
                index += 1;
            } else {
                options.writePath = DEFAULT_OUTPUT_PATH;
            }

            continue;
        }

        throw new Error(`Unknown argument: ${argument}`);
    }

    return options;
}

export async function runGit(args, { cwd = process.cwd(), execFileImpl = execFile } = {}) {
    const { stdout } = await execFileImpl('git', args, {
        cwd,
        maxBuffer: 10 * 1024 * 1024
    });

    return stdout;
}

export async function getLatestReachableTag({ cwd = process.cwd(), to = DEFAULT_TO_REF, git = runGit } = {}) {
    try {
        const stdout = await git(['describe', '--tags', '--abbrev=0', to], { cwd });
        const tag = stdout.trim();

        return tag || null;
    } catch (error) {
        const stderr = String(error?.stderr || '');
        const missingTag =
            error?.code === 128 &&
            (
                stderr.includes('No names found') ||
                stderr.includes('No tags can describe')
            );

        if (missingTag) {
            return null;
        }

        throw error;
    }
}

export async function resolveRange(options = {}, { cwd = process.cwd(), git = runGit } = {}) {
    const to = options.to || DEFAULT_TO_REF;
    const explicitFrom = options.from;

    if (explicitFrom) {
        return {
            from: explicitFrom,
            to
        };
    }

    return {
        from: await getLatestReachableTag({ cwd, to, git }),
        to
    };
}

export function buildGitLogArgs({ from, to = DEFAULT_TO_REF } = {}) {
    const range = from ? `${from}..${to}` : to;

    return [
        'log',
        '--no-merges',
        `--format=%H${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b${RECORD_SEPARATOR}`,
        range
    ];
}

export function parseConventionalSubject(subject) {
    const revertedSubject = subject.match(REVERT_SUBJECT_PATTERN)?.groups?.subject ?? null;
    const candidate = (revertedSubject || subject).trim();
    const match = candidate.match(CONVENTIONAL_SUBJECT_PATTERN);

    if (!match?.groups) {
        return {
            type: null,
            scope: null,
            description: subject.trim(),
            revertedSubject
        };
    }

    return {
        type: match.groups.type.toLowerCase(),
        scope: match.groups.scope ? match.groups.scope.toLowerCase() : null,
        description: revertedSubject
            ? `Revert: ${match.groups.description.trim()}`
            : match.groups.description.trim(),
        revertedSubject
    };
}

export function classifySection(type, scope) {
    if (!type) {
        return 'other';
    }

    if (type === 'security' || scope === 'security') {
        return 'security';
    }

    if (type === 'feat' || type === 'feature') {
        return 'feat';
    }

    if (type === 'fix') {
        return 'fix';
    }

    if (type === 'docs' || type === 'doc') {
        return 'docs';
    }

    if (type === 'refactor') {
        return 'refactor';
    }

    if (type === 'perf' || type === 'performance') {
        return 'perf';
    }

    if (type === 'test' || type === 'tests') {
        return 'test';
    }

    if (type === 'chore' || type === 'ci' || type === 'build') {
        return 'chore';
    }

    return 'other';
}

export function normalizeCommit(record) {
    if (!record.subject || record.subject.startsWith('Merge ')) {
        return null;
    }

    const parsedSubject = parseConventionalSubject(record.subject);

    return {
        hash: record.hash,
        subject: record.subject.trim(),
        body: record.body.trim(),
        section: classifySection(parsedSubject.type, parsedSubject.scope),
        text: parsedSubject.description
    };
}

export function parseGitLogOutput(stdout) {
    return stdout
        .split(RECORD_SEPARATOR)
        .map(entry => entry.trim())
        .filter(Boolean)
        .map(entry => {
            const [hash = '', subject = '', body = ''] = entry.split(FIELD_SEPARATOR);

            return {
                hash: hash.trim(),
                subject: subject.trim(),
                body
            };
        })
        .map(normalizeCommit)
        .filter(Boolean);
}

export async function readCommits(options = {}, { cwd = process.cwd(), git = runGit } = {}) {
    const stdout = await git(buildGitLogArgs(options), { cwd });

    return parseGitLogOutput(stdout);
}

export function groupCommits(commits) {
    const grouped = Object.fromEntries(SECTION_ORDER.map(section => [section, []]));

    for (const commit of commits) {
        grouped[commit.section].push(commit);
    }

    return grouped;
}

export function shortHash(hash) {
    return hash.slice(0, 7);
}

export function formatRange(from, to) {
    return `${from || 'start'}..${to || DEFAULT_TO_REF}`;
}

export function renderChangelog({ from, to = DEFAULT_TO_REF, commits }) {
    const lines = [
        '# Changelog',
        '',
        `Range: \`${formatRange(from, to)}\``,
        ''
    ];

    if (commits.length === 0) {
        lines.push('- No user-facing changes detected in this range.');

        return `${lines.join('\n')}\n`;
    }

    const grouped = groupCommits(commits);

    for (const section of SECTION_ORDER) {
        if (grouped[section].length === 0) {
            continue;
        }

        lines.push(`### ${SECTION_TITLES[section]}`, '');

        for (const commit of grouped[section]) {
            lines.push(`- ${commit.text} (\`${shortHash(commit.hash)}\`)`);
        }

        lines.push('');
    }

    while (lines.at(-1) === '') {
        lines.pop();
    }

    return `${lines.join('\n')}\n`;
}

export async function generateChangelog(options = {}, dependencies = {}) {
    const cwd = dependencies.cwd || process.cwd();
    const git = dependencies.git || runGit;
    const range = await resolveRange(options, { cwd, git });
    const commits = await readCommits(range, { cwd, git });
    const markdown = renderChangelog({
        from: range.from,
        to: range.to,
        commits
    });

    return {
        ...range,
        commits,
        markdown
    };
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
    const options = parseArgs(argv);

    if (options.help) {
        (dependencies.stdout || process.stdout).write(USAGE);
        return;
    }

    const { markdown } = await generateChangelog(options, dependencies);

    if (options.writePath) {
        const targetPath = resolvePath(dependencies.cwd || process.cwd(), options.writePath);
        await writeFile(targetPath, markdown, 'utf8');
        (dependencies.stdout || process.stdout).write(`Wrote changelog to ${options.writePath}\n`);
        return;
    }

    (dependencies.stdout || process.stdout).write(markdown);
}

const isDirectExecution =
    process.argv[1] &&
    pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
    main().catch(error => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    });
}
