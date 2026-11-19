import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { publishManualInbox } from '../manual-publishing/publisher.mjs';

function article({ aiGenerated = 'false', workflow = 'manual-assisted', words = 620 } = {}) {
  const body = Array.from({ length: words }, (_, i) => 'تحليل نقدي موثق للتجربة الفنية والسردية والتقنية').join(' ');
  return [
    '---',
    'title: "اختبار النشر اليدوي"',
    'headline: "مراجعة نقدية مستقلة"',
    'summary: "ملخص تحريري"',
    'type: series',
    'date: 2026-11-18',
    'sourceId: "series:manual-test-1"',
    'sourceUrl: "https://www.themoviedb.org/tv/1"',
    'poster: "https://image.tmdb.org/t/p/w780/poster.jpg"',
    'backdrop: "https://image.tmdb.org/t/p/w1280/backdrop.jpg"',
    'youtubeVideoId: "AbCdEfGhI12"',
    'youtubeVideoTitle: "Official Trailer"',
    'mediaVerified: true',
    'reviewMode: review',
    'aiGenerated: ' + aiGenerated,
    'editorialWorkflow: ' + workflow,
    'score: 7.4',
    'storyScore: 8',
    'visualsScore: 7',
    'soundScore: 7',
    'pacingScore: 7',
    'pros:',
    '  - قوة البناء الدرامي',
    '  - أداء مقنع',
    '  - صورة متماسكة',
    'cons:',
    '  - إيقاع بطيء',
    '  - نهاية متسرعة',
    '---',
    '## التحليل',
    body,
    '',
    '### المصادر',
    '- https://www.themoviedb.org/tv/1',
    '- https://example.com/review',
    ''
  ].join('\n');
}
async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vibecritic-manual-'));
  await fs.mkdir(path.join(root, 'manual-publishing/inbox'), { recursive: true });
  await fs.mkdir(path.join(root, 'src/content/reviews'), { recursive: true });
  await fs.writeFile(path.join(root, 'manual-publishing/inbox/manual-test-1.md'), article());
  return root;
}
const root = await setup();
try {
  const result = await publishManualInbox({ root, now: () => new Date('2026-11-18T00:00:00.000Z') });
  assert.equal(result.published, true);
  assert.equal(await fs.readFile(path.join(root, 'src/content/reviews/manual-test-1.md'), 'utf8'), article());
  assert.equal(await fs.readFile(path.join(root, 'manual-publishing/archive/manual-test-1.md'), 'utf8'), article());
  const state = JSON.parse(await fs.readFile(path.join(root, 'data/manual-publisher-state.json'), 'utf8'));
  assert.equal(state.published['manual-test-1'].sourceId, 'series:manual-test-1');
  assert.equal((await publishManualInbox({ root })).published, false);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

const libraryRoot = await setup();
try {
  const library = path.join(libraryRoot, 'manual-publishing/library');
  await fs.mkdir(library, { recursive: true });
  // Deliberately make alphabetical order disagree with arrival order.
  await fs.writeFile(path.join(library, '20261120T080000Z--a-later.md'), article().replace('series:manual-test-1','series:library-later'));
  await fs.writeFile(path.join(library, '20261119T080000Z--z-earlier.md'), article().replace('series:manual-test-1','series:library-earlier'));
  const first = await publishManualInbox({ root: libraryRoot, sourceDirectory: 'manual-publishing/library', now: () => new Date('2026-11-19T08:00:00.000Z') });
  assert.equal(first.published, true);
  assert.equal(first.slug, 'z-earlier');
  await fs.access(path.join(library, '20261120T080000Z--a-later.md'));
  await fs.access(path.join(libraryRoot, 'src/content/reviews/z-earlier.md'));
  const next = await publishManualInbox({ root: libraryRoot, sourceDirectory: 'manual-publishing/library' });
  assert.equal(next.published, true);
  assert.equal(next.slug, 'a-later');
} finally {
  await fs.rm(libraryRoot, { recursive: true, force: true });
}

for (const options of [{ aiGenerated: 'true' }, { workflow: 'automated' }, { words: 20 }]) {
  const badRoot = await setup();
  try {
    await fs.writeFile(path.join(badRoot, 'manual-publishing/inbox/manual-test-1.md'), article(options));
    await assert.rejects(() => publishManualInbox({ root: badRoot }));
    await assert.rejects(() => fs.access(path.join(badRoot, 'src/content/reviews/manual-test-1.md')));
  } finally {
    await fs.rm(badRoot, { recursive: true, force: true });
  }
}

for (const [label, mutate] of [
  ['missing video ID', source => source.split('\n').filter(line => !line.startsWith('youtubeVideoId:')).join('\n')],
  ['missing video title', source => source.split('\n').filter(line => !line.startsWith('youtubeVideoTitle:')).join('\n')],
  ['same poster and backdrop', source => source.replace('https://image.tmdb.org/t/p/w1280/backdrop.jpg', 'https://image.tmdb.org/t/p/w780/poster.jpg')],
]) {
  const badRoot = await setup();
  try {
    const inboxFile = path.join(badRoot, 'manual-publishing/inbox/manual-test-1.md');
    await fs.writeFile(inboxFile, mutate(article()));
    await assert.rejects(() => publishManualInbox({ root: badRoot }), undefined, label);
    await assert.rejects(() => fs.access(path.join(badRoot, 'src/content/reviews/manual-test-1.md')));
  } finally {
    await fs.rm(badRoot, { recursive: true, force: true });
  }
}
console.log('Manual publisher tests passed, including mandatory distinct images and embedded official video.');
