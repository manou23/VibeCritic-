import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'vibecritic-quality-'));
const root = path.join(temp, 'reviews');
const out = path.join(temp, 'out');
await fs.mkdir(root);
const repeated = 'This paragraph describes the same critical point with enough detail to test repeated content detection. It discusses the structure, evidence, and implications of the work in nearly identical language.';
await fs.writeFile(path.join(root, 'review.md'), [
  '---', 'title: "Test Review"', 'reviewMode: review', 'score: 7.5', 'sourceRating: 8.1', 'sourceVoteCount: 1200', '---', '',
  '## First angle', repeated, '', '## Second angle', repeated,
  '', 'The same sentence explains the central argument with enough words to be detected by the repeated sentence checker. The same sentence explains the central argument with enough words to be detected by the repeated sentence checker.',
  '', '[Source one](https://example.com/one)', '[Source two](https://example.org/two)'
].join('\n'));
await fs.writeFile(path.join(root, 'preview.md'), '---\ntitle: Preview\nreviewMode: preview\n---\nPreview content.');
const result = spawnSync(process.execPath, ['scripts/quality-engine/run.mjs', '--root', root, '--out', out], { encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr);
const report = JSON.parse(await fs.readFile(path.join(out, 'quality-report.json'), 'utf8'));
assert.equal(report.counts.scanned, 1);
assert.equal(report.counts.skippedNonReview, 1);
assert.ok(report.reports[0].flags.some(flag => flag.code === 'repeated-paragraphs'));
assert.ok(report.reports[0].flags.some(flag => flag.code === 'repeated-sentences'));
const original = await fs.readFile(path.join(root, 'review.md'), 'utf8');
assert.match(original, /score: 7.5/);
assert.match(original, /sourceRating: 8.1/);
assert.match(original, /sourceVoteCount: 1200/);
await fs.rm(temp, { recursive: true, force: true });
console.log('Quality Engine report-only tests passed.');
