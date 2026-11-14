import assert from 'node:assert/strict';
import {
  buildHistoricalProfile,
  buildHistoricalComparisonReport,
  formatHistoricalComparisonContext,
  buildHistoricalComparisonRecord
} from './historical-comparisons.mjs';

const current = buildHistoricalProfile({
  id: 'new-2', type: 'game', name: 'New Entry', date: '2026-11-01',
  franchise: 'Example Saga',
  genres: ['Action', 'Adventure'],
  developers: ['Studio North'],
  metadata: { creators: ['A. Creator'], productionCompanies: ['North Group'] }
}, { selected: { id: 'combat-systems' } }, { questions: [{ id: 'core-loop' }] });

const previous = [
  {
    workId: 'game:old-1', workType: 'game', title: 'First Entry', releaseDate: '2020-01-01',
    franchise: 'Example Saga', genres: ['Action', 'Adventure'], developers: ['Studio North'],
    creators: ['A. Creator'], directors: [], companies: ['North Group']
  },
  {
    workId: 'game:old-2', workType: 'game', title: 'Same Genre Only', releaseDate: '2022-01-01',
    franchise: '', genres: ['Action', 'Adventure'], developers: ['Other Studio'],
    creators: [], directors: [], companies: []
  },
  {
    workId: 'game:old-3', workType: 'game', title: 'Shared Studio', releaseDate: '2024-01-01',
    franchise: '', genres: ['Action'], developers: ['Studio North'],
    creators: [], directors: [], companies: []
  },
  {
    workId: 'movie:old-4', workType: 'movie', title: 'Wrong Type',
    franchise: 'Example Saga', genres: ['Action'], developers: ['Studio North']
  }
];
const report = buildHistoricalComparisonReport(current, previous);
assert.equal(report.status, 'historical-context-found');
assert.equal(report.comparedCount, 3);
assert.equal(report.matchCount, 2);
assert.equal(report.matches[0].title, 'First Entry');
assert.equal(report.matches[0].chronology, 'earlier-work');
assert.equal(report.earlierWorks, 2);
assert.ok(report.matches[0].shared.franchise);
assert.ok(report.matches[0].shared.developers.includes('Studio North'));
assert.ok(!report.matches.some(match => match.title === 'Same Genre Only'));
assert.match(formatHistoricalComparisonContext(report), /لا يثبت التأثير أو الاقتباس/);

const noHistory = buildHistoricalComparisonReport(
  buildHistoricalProfile({ id: 'solo', type: 'movie', name: 'Solo', genres: ['Drama'] }),
  previous
);
assert.equal(noHistory.status, 'no-linked-history');
assert.equal(noHistory.matchCount, 0);
assert.match(formatHistoricalComparisonContext(noHistory), /لا توجد في الذاكرة الحالية/);

const later = buildHistoricalComparisonReport(current, [{
  workId: 'game:future', workType: 'game', title: 'Later Entry', releaseDate: '2028-01-01',
  franchise: 'Example Saga', genres: ['Action'], developers: [], creators: [], directors: [], companies: []
}]);
assert.equal(later.matches[0].chronology, 'later-work');
assert.equal(later.laterWorks, 1);

const record = buildHistoricalComparisonRecord(report);
assert.equal(record.matchCount, 2);
assert.equal(record.matches[0].workId, 'game:old-1');

console.log('Historical comparison tests passed.');
