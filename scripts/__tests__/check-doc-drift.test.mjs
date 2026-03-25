import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    checkDocDrift,
    extractDocumentedCommands,
    extractMarkdownTargets,
    parseDocumentedCommands,
    parseDocumentedCommand
} from '../check-doc-drift.mjs';

async function createFixture(structure, rootDir) {
    for (const [relativePath, content] of Object.entries(structure)) {
        const absolutePath = path.join(rootDir, relativePath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, content);
    }
}

async function createWorkspaceFixture(overrides = {}) {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'doc-drift-'));
    const baseStructure = {
        'package.json': JSON.stringify({
            name: 'root',
            version: '1.0.0',
            scripts: {
                'doc:drift': 'node scripts/check-doc-drift.mjs',
                lint: 'eslint .',
                test: 'node --test'
            }
        }, null, 2),
        'README.md': [
            '# Workspace',
            '',
            '[Guide](docs/guide.md)',
            '![Diagram](docs/diagram.png)',
            '',
            '```bash',
            'pnpm test',
            'pnpm run lint',
            'cd workers && pnpm install --frozen-lockfile',
            'pnpm --filter ./workers test:unit',
            '```',
            '',
            '`pnpm run doc:drift`',
            '`cd tampermonkey && npm run lint`',
            '',
            '[External](https://example.com)',
            '[Section](#local-anchor)'
        ].join('\n'),
        'docs/guide.md': '# Guide\n',
        'docs/diagram.png': 'png',
        '.agents/skills/example/SKILL.md': '# Example\n\n[Guide](references/guide.md)\n',
        '.agents/skills/example/references/guide.md': '# Example Guide\n',
        'tampermonkey/package.json': JSON.stringify({
            name: 'tampermonkey',
            version: '1.0.0',
            scripts: {
                lint: 'eslint .',
                test: 'jest'
            }
        }, null, 2),
        'tampermonkey/goal_portfolio_viewer.user.js': [
            '// ==UserScript==',
            '// @name Goal Portfolio Viewer',
            '// @version      1.0.0',
            '// ==/UserScript=='
        ].join('\n'),
        'workers/package.json': JSON.stringify({
            name: 'workers',
            version: '1.2.0',
            scripts: {
                dev: 'wrangler dev',
                test: 'node --test',
                'test:unit': 'node --test'
            }
        }, null, 2),
        'workers/README.md': [
            '# Workers',
            '',
            'Run `pnpm run dev` before deployment.',
            '',
            '```bash',
            'pnpm test',
            '```'
        ].join('\n'),
        'demo/package.json': JSON.stringify({
            name: 'demo',
            version: '1.0.0',
            scripts: {
                'test:e2e': 'node e2e-tests.js'
            }
        }, null, 2),
        '.review-audit-branch/README.md': [
            '# Ignored',
            '',
            '[Missing](docs/nope.md)',
            '`pnpm run missing`'
        ].join('\n')
    };

    await createFixture({ ...baseStructure, ...overrides }, rootDir);
    return rootDir;
}

test('extract helpers keep command and target parsing deterministic', () => {
    assert.deepEqual(
        extractDocumentedCommands([
            '```bash',
            'cd tampermonkey && npm run lint',
            'pnpm test # comment',
            '```',
            'Use `pnpm run lint` and `cd workers && pnpm test:unit` after changes.'
        ].join('\n')),
        [
            { command: 'cd tampermonkey && npm run lint', line: 2 },
            { command: 'pnpm test', line: 3 },
            { command: 'pnpm run lint', line: 5 },
            { command: 'cd workers && pnpm test:unit', line: 5 }
        ]
    );

    assert.deepEqual(
        extractMarkdownTargets('[Guide](docs/guide.md) and ![Diagram](docs/diagram.png#v2)'),
        [
            { line: 1, target: 'docs/guide.md' },
            { line: 1, target: 'docs/diagram.png#v2' }
        ]
    );

    assert.deepEqual(
        parseDocumentedCommand('pnpm --filter ./workers test:unit', 'root'),
        { packageKey: 'workers', scriptName: 'test:unit' }
    );

    assert.deepEqual(
        parseDocumentedCommands('cd tampermonkey && npm run lint', 'root'),
        [{ packageKey: 'tampermonkey', scriptName: 'lint' }]
    );
});

test('checkDocDrift passes for valid links, commands, versions, and ignored paths', async () => {
    const rootDir = await createWorkspaceFixture();
    const result = await checkDocDrift({ rootDir });

    assert.equal(result.issues.length, 0);
    assert.ok(result.files.includes('.agents/skills/example/SKILL.md'));
    assert.ok(result.files.includes('README.md'));
    assert.ok(result.files.includes('workers/README.md'));
    assert.ok(!result.files.some(file => file.startsWith('.review-audit-branch/')));
});

test('checkDocDrift reports broken markdown targets', async () => {
    const rootDir = await createWorkspaceFixture({
        'README.md': '# Workspace\n\n[Broken](docs/missing.md)\n'
    });
    const result = await checkDocDrift({ rootDir });

    assert.deepEqual(
        result.issues.map(issue => issue.kind),
        ['broken-link']
    );
    assert.match(result.issues[0].message, /Missing relative target "docs\/missing\.md"/);
});

test('checkDocDrift reports missing documented scripts in the resolved workspace', async () => {
    const rootDir = await createWorkspaceFixture({
        'README.md': '# Workspace\n\n`cd tampermonkey && npm run missing-script`\n'
    });
    const result = await checkDocDrift({ rootDir });

    assert.deepEqual(
        result.issues.map(issue => issue.kind),
        ['missing-script']
    );
    assert.equal(result.issues[0].file, 'README.md');
    assert.match(result.issues[0].message, /missing script "missing-script" in tampermonkey\/package\.json/);
});

test('checkDocDrift reports version mismatches across release touchpoints', async () => {
    const rootDir = await createWorkspaceFixture({
        'tampermonkey/package.json': JSON.stringify({
            name: 'tampermonkey',
            version: '1.0.1',
            scripts: {
                lint: 'eslint .',
                test: 'jest'
            }
        }, null, 2)
    });
    const result = await checkDocDrift({ rootDir });

    assert.deepEqual(
        result.issues.map(issue => issue.kind),
        ['version-mismatch']
    );
    assert.equal(result.issues[0].file, 'tampermonkey/package.json');
});

test('ignored paths and external URLs do not produce findings', async () => {
    const rootDir = await createWorkspaceFixture({
        'README.md': [
            '# Workspace',
            '',
            '[External](https://example.com)',
            '[Mail](mailto:test@example.com)',
            '[Anchor](#top)'
        ].join('\n'),
        '.review-audit-branch/README.md': [
            '# Ignored',
            '',
            '[Broken](docs/nope.md)',
            '`pnpm run missing-script`'
        ].join('\n')
    });
    const result = await checkDocDrift({ rootDir });

    assert.equal(result.issues.length, 0);
});

test('checkDocDrift scans .agents markdown for broken relative links', async () => {
    const rootDir = await createWorkspaceFixture({
        '.agents/skills/example/SKILL.md': '# Example\n\n[Broken](references/missing.md)\n'
    });
    const result = await checkDocDrift({ rootDir });

    assert.deepEqual(
        result.issues.map(issue => issue.kind),
        ['broken-link']
    );
    assert.equal(result.issues[0].file, '.agents/skills/example/SKILL.md');
    assert.match(result.issues[0].message, /references\/missing\.md/);
});
