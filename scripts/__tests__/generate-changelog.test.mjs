import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildGitLogArgs,
    formatRange,
    generateChangelog,
    parseGitLogOutput,
    renderChangelog,
    resolveRange
} from '../generate-changelog.mjs';

const record = (hash, subject, body = '') => `${hash}\x1f${subject}\x1f${body}\x1e`;

test('resolveRange falls back to the latest reachable tag', async () => {
    const calls = [];
    const git = async args => {
        calls.push(args);
        return 'v2.0.0\n';
    };

    const range = await resolveRange({}, { cwd: '/repo', git });

    assert.deepEqual(range, { from: 'v2.0.0', to: 'HEAD' });
    assert.deepEqual(calls, [['describe', '--tags', '--abbrev=0', 'HEAD']]);
});

test('generateChangelog honors explicit --from and --to overrides', async () => {
    const calls = [];
    const git = async args => {
        calls.push(args);

        if (args[0] === 'describe') {
            throw new Error('describe should not run when --from is explicit');
        }

        return record('abc1234', 'fix: patch release note output');
    };

    const changelog = await generateChangelog(
        { from: 'v1.2.0', to: 'HEAD~1' },
        { cwd: '/repo', git }
    );

    assert.equal(changelog.from, 'v1.2.0');
    assert.equal(changelog.to, 'HEAD~1');
    assert.match(changelog.markdown, /Range: `v1\.2\.0\.\.HEAD~1`/);
    assert.deepEqual(calls, [buildGitLogArgs({ from: 'v1.2.0', to: 'HEAD~1' })]);
});

test('parseGitLogOutput groups conventional commits and keeps non-conventional subjects', () => {
    const commits = parseGitLogOutput([
        record('1111111', 'feat(ui): add release command'),
        record('2222222', 'fix(security): harden changelog path writes'),
        record('3333333', 'docs: explain release steps'),
        record('4444444', 'Ship it without a prefix')
    ].join(''));

    assert.deepEqual(
        commits.map(commit => ({ section: commit.section, text: commit.text })),
        [
            { section: 'feat', text: 'add release command' },
            { section: 'security', text: 'harden changelog path writes' },
            { section: 'docs', text: 'explain release steps' },
            { section: 'other', text: 'Ship it without a prefix' }
        ]
    );
});

test('parseGitLogOutput skips merge commits and keeps revert commits readable', () => {
    const commits = parseGitLogOutput([
        record('1111111', 'Merge pull request #42 from example/topic'),
        record('2222222', 'Revert "feat(ui): add release command"')
    ].join(''));

    assert.equal(commits.length, 1);
    assert.equal(commits[0].section, 'feat');
    assert.equal(commits[0].text, 'Revert: add release command');
});

test('renderChangelog shows a stable empty-range message', () => {
    const markdown = renderChangelog({
        from: 'v1.0.0',
        to: 'HEAD',
        commits: []
    });

    assert.equal(
        markdown,
        '# Changelog\n\nRange: `v1.0.0..HEAD`\n\n- No user-facing changes detected in this range.\n'
    );
});

test('renderChangelog keeps section ordering deterministic', () => {
    const commits = parseGitLogOutput([
        record('4444444', 'docs: explain release steps'),
        record('1111111', 'fix: patch release note output'),
        record('2222222', 'feat: add changelog command'),
        record('3333333', 'Ship it without a prefix')
    ].join(''));

    const markdown = renderChangelog({
        from: null,
        to: 'HEAD',
        commits
    });

    assert.match(markdown, /### Features[\s\S]*### Fixes[\s\S]*### Documentation[\s\S]*### Other/);
    assert.equal(markdown, renderChangelog({ from: null, to: 'HEAD', commits }));
    assert.equal(formatRange(null, 'HEAD'), 'start..HEAD');
});
