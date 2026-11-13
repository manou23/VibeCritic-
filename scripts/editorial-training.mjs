import {
  addEditorialPrinciple,
  assessEditorialCandidate,
  listEditorialCandidates
} from './editorial-intelligence.mjs';

const [command, ...args] = process.argv.slice(2);

try {
  if (command === 'list') {
    const candidates = await listEditorialCandidates();
    if (!candidates.length) {
      console.log('لا توجد عينات بانتظار المراجعة البشرية.');
    } else {
      for (const item of candidates) {
        console.log([
          item.id,
          '[' + item.type + ']',
          item.headline,
          '|' + item.wordCount + ' كلمة',
          '| الدرجة الآلية: ' + item.score
        ].join(' '));
      }
    }
  } else if (command === 'approve') {
    const [id, rawRating, ...noteParts] = args;
    const rating = Number(rawRating);
    const item = await assessEditorialCandidate(id, 'approve', rating, noteParts.join(' '));
    console.log('اعتمدت العينة بتقييم بشري ' + item.humanRating + '/5: ' + item.id);
  } else if (command === 'reject') {
    const [id, ...noteParts] = args;
    const item = await assessEditorialCandidate(id, 'reject', 0, noteParts.join(' '));
    console.log('رُفضت العينة ولن تدخل مجموعة التدريب: ' + item.id);
  } else if (command === 'principle') {
    const added = await addEditorialPrinciple(args.join(' '));
    console.log(added ? 'تمت إضافة المبدأ التحريري.' : 'المبدأ موجود مسبقاً.');
  } else {
    console.log('الأوامر: list | approve <type:id> <1-5> <notes> | reject <type:id> <notes> | principle <text>');
    process.exitCode = 1;
  }
} catch (error) {
  console.error('تعذر تنفيذ أمر التدريب التحريري:', error.message);
  process.exitCode = 1;
}
