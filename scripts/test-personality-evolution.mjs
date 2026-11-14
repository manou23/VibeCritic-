import assert from 'node:assert/strict';
import {
  buildPersonalityEvolutionGuidance,
  assessPersonalityEvolution,
  formatPersonalityEvolutionReport
} from './personality-evolution.mjs';

const item = { id: 'sample-1', type: 'game' };
const reasoning = { selected: { id: 'game-systems', anchors: ['open world', 'vehicle missions', 'player progression'] } };
const questions = { unanswered: 2 };
const repetition = { status: 'distinct-thinking' };
const balancedReview = {
  headline: 'كيف تصنع الأنظمة حرية اللاعب؟',
  hook: 'الحرية هنا مرتبطة بقرارات اللاعب لا بحجم الخريطة فقط.',
  summary: 'تحليل يربط الأنظمة بالاختيارات والنتائج.',
  verdict: 'الحكم مشروط بما تثبته التفاصيل.',
  review: 'تظهر open world في بنية الاستكشاف، بينما vehicle missions تضيف إيقاعاً مختلفاً. وتكشف player progression عن أثر قرارات اللاعب. لا تكفي المعلومات المتاحة للحكم على الأداء التقني، ولا يمكن الجزم بثباته على كل منصة.\\n\\n### الأنظمة\\nتحليل مفصل.\\n\\n### العالم\\nتحليل مفصل.\\n\\n### التقدم\\nتحليل مفصل.\\n\\n### السرد\\nتحليل مفصل.\\n\\n### الحكم\\nتحليل مفصل.',
  pros: ['استكشاف واضح', 'ترابط الأنظمة', 'تنوع المهام'],
  cons: ['توازن التقدم يحتاج تدقيقاً', 'الأداء غير محسوم']
};
const clean = assessPersonalityEvolution(item, balancedReview, reasoning, questions, repetition, []);
assert.equal(clean.status, 'core-aligned');
assert.equal(clean.driftScore, 0);
assert.equal(clean.principles.independence, true);
assert.equal(clean.principles.evidenceHumility, true);
assert.match(formatPersonalityEvolutionReport(clean), /لم يرصد الفحص مؤشرات انحراف/);

const drifted = assessPersonalityEvolution(item, {
  ...balancedReview,
  review: balancedReview.review + ' لقد لعبت هذه اللعبة وكانت تجربة لا مثيل لها. شعبيتها تثبت جودتها.'
}, reasoning, questions, { status: 'high-repetition-risk' }, []);
assert.equal(drifted.status, 'identity-drift-risk');
assert.ok(drifted.driftScore >= 45);
assert.ok(drifted.violations.includes('falseFirstHandClaim'));
assert.ok(drifted.violations.includes('popularityAsQuality'));
assert.ok(drifted.violations.includes('repeatedThinking'));

const history = [
  { coreVersion: 1, workType: 'game', driftScore: 40, angleId: 'old-angle' },
  { coreVersion: 1, workType: 'game', driftScore: 30, angleId: 'another-angle' },
  { coreVersion: 1, workType: 'movie', driftScore: 90, angleId: 'film-angle' }
];
const improving = assessPersonalityEvolution(item, balancedReview, reasoning, questions, repetition, history);
assert.equal(improving.trend, 'improving');
assert.equal(improving.evolution.comparedProfiles, 2);
assert.equal(improving.evolution.distinctAnglesInWindow, 3);

const guidance = buildPersonalityEvolutionGuidance(history);
assert.match(guidance, /النواة ثابتة والتعبير قابل للتطور/);
assert.match(guidance, /متوسط انحراف النواة/);

console.log('Personality evolution tests passed.');
