import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('src/content/reviews');
const files = (await fs.readdir(root)).filter(name => name.endsWith('.md')).sort();
const failures = [];

for (const file of files) {
  const fullPath = path.join(root, file);
  const content = await fs.readFile(fullPath, 'utf8');
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    failures.push(file + ': YAML frontmatter is missing or malformed');
    continue;
  }

  const frontmatter = match[1];
  const scoreMatch = frontmatter.match(/^score:\s*(.*?)\s*$/m);
  if (!scoreMatch || !scoreMatch[1]) {
    failures.push(file + ': score is missing');
    continue;
  }

  const score = Number(scoreMatch[1].replace(/^['"]|['"]$/g, ''));
  if (!Number.isFinite(score) || score <= 0 || score > 10) {
    failures.push(file + ': score must be a number greater than 0 and at most 10 (found ' + scoreMatch[1] + ')');
    continue;
  }

  const verdictMatch = frontmatter.match(/^verdict:\s*"(.*)"\s*$/m);
  if (verdictMatch) {
    const statedScores = [...verdictMatch[1].matchAll(/(\d+(?:[.,]\d+)?)\s*(?:\/\s*10|من\s*10)/g)]
      .map(item => Number(item[1].replace(',', '.')));
    if (statedScores.some(value => Math.abs(value - score) > 0.05)) {
      failures.push(file + ': verdict score (' + statedScores.join(', ') + ') does not match frontmatter score (' + score + ')');
    }
  }
}

if (failures.length) {
  console.error('Review score validation failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exitCode = 1;
} else {
  console.log('Review score validation passed for ' + files.length + ' review files: all scores are present, greater than zero, at most 10, and consistent with stated verdict scores.');
}
