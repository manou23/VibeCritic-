# إعداد تعليقات VibeCritic

تستخدم التعليقات قاعدة Cloudflare D1 حتى تُحفظ بين الزوار والأجهزة. لا تُنشر تعليقات الزوار مباشرة؛ تبدأ بحالة `pending` وتحتاج موافقة يدوية.

## 1. إنشاء قاعدة D1

1. افتح Cloudflare Dashboard ثم **Workers & Pages**.
2. من **Storage & databases** افتح **D1 SQL Database** وأنشئ قاعدة باسم `vibecritic-comments`.
3. افتح قاعدة البيانات ثم تبويب **Console**.
4. نفّذ محتوى الملف `migrations/0001_comments.sql` كاملاً.

## 2. ربط قاعدة البيانات بالموقع

1. افتح مشروع Pages باسم `vibecritic`.
2. اذهب إلى **Settings → Functions → D1 database bindings**.
3. أضف binding جديداً:
   - Variable name: `COMMENTS_DB`
   - D1 database: `vibecritic-comments`
4. احفظ الإعدادات ثم أعد نشر آخر إصدار من الموقع.

بعد إعادة النشر، ستُحمّل التعليقات المنشورة وتُتاح استمارة الإرسال. إذا لم تتم إضافة الربط، تبقى أمثلة العرض التجريبية ظاهرة بوضوح وتظل الاستمارة معطلة.

## 3. مراجعة التعليقات

كل تعليق جديد يُحفظ بحالة `pending` ولا يظهر للعامة قبل الموافقة.

لعرض التعليقات المنتظرة في D1 Console:

```sql
SELECT id, review_slug, nickname, body, created_at
FROM comments
WHERE status = 'pending'
ORDER BY created_at DESC;
```

للموافقة على تعليق بعد مراجعته، استبدل `123` بمعرّفه:

```sql
UPDATE comments
SET status = 'approved'
WHERE id = 123 AND status = 'pending';
```

لرفض تعليق:

```sql
UPDATE comments
SET status = 'rejected'
WHERE id = 123 AND status = 'pending';
```

## 4. إيقاف الأمثلة التجريبية لاحقاً

الأمثلة التجريبية موسومة في الواجهة بأنها أمثلة وليست تفاعلاً حقيقياً. عند رغبتك في إزالتها، احذف كتلة `data-demo-comments` من `src/pages/reviews/[...slug].astro` ثم انشر التعديل. سيبقى نظام التعليقات الحقيقية وقاعدة البيانات كما هما.

## ملاحظات الحماية

- التعليقات لا تظهر إلا بعد موافقة الإدارة.
- الاسم المستعار والتعليق محدودان بالطول، والحقول تُعرض كنص عادي لا كـ HTML.
- يوجد حقل honeypot بسيط لتقليل الإرسال الآلي؛ أضف قاعدة Rate Limiting في Cloudflare WAF لمسار `/api/comments` قبل فتح التعليقات على نطاق واسع.
- لا تخزن هذه الميزة عناوين IP في قاعدة البيانات.
