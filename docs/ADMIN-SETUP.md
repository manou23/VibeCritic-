# إعداد لوحة إدارة VibeCritic

تعمل لوحة الإدارة على `vibecritic.pages.dev` دون Cloudflare Access. تسجيل الدخول محمي بكلمة مرور محفوظة كـ Cloudflare Secret، وتُنشأ جلسة موقعة من الخادم داخل Cookie بخصائص HttpOnly وSecure وSameSite=Strict. لا تضع أي قيمة سرية في ملفات المستودع أو في المحادثة.

## متغيرات Cloudflare Pages المطلوبة

من Workers & Pages ← مشروع vibecritic ← Settings ← Variables and Secrets، أضف القيم التالية في بيئة Production:

- `ADMIN_PASSWORD` — اختر كلمة مرور طويلة وفريدة (20 حرفاً أو أكثر). أضفها كـ Secret، وليس Text.
- `ADMIN_SESSION_SECRET` — سلسلة عشوائية قوية لا تقل عن 32 بايت. أضفها كـ Secret.
- `GITHUB_ADMIN_TOKEN` — GitHub fine-grained personal access token مقيد بالمستودع `manou23/VibeCritic-` فقط. الصلاحيات: Contents Read and write، Actions Read and write، Metadata Read-only. أضفه كـ Secret.
- `GITHUB_REPOSITORY` — القيمة `manou23/VibeCritic-` كـ Text (اختياري لأن الكود يستخدمها افتراضياً).

لا تضف `CF_ACCESS_TEAM_DOMAIN` أو `CF_ACCESS_AUD` أو `ADMIN_EMAIL`؛ لم تعد مطلوبة في هذا التصميم.

## النشر والتحقق

1. أضف المتغيرات إلى Production بعد دمج التعديلات ونشرها.
2. أعد نشر Pages حتى تُحمّل المتغيرات الجديدة.
3. افتح `https://vibecritic.pages.dev/admin/`.
4. أدخل كلمة مرور الإدارة التي حفظتها في `ADMIN_PASSWORD`.
5. تأكد من ظهور حالة الناشر وسجل GitHub Actions.

## الصلاحيات والخصوصية

- كلمة المرور ومفتاح الجلسات ورمز GitHub أسرار خادمية لا تُرسل إلى المتصفح.
- جلسة الإدارة صالحة لمدة 8 ساعات، وتُحفظ في Cookie من نوع HttpOnly وSecure وSameSite=Strict.
- لا تشارك كلمة المرور أو GitHub token مع أي شخص.
- تغيير الإعدادات يكتب إلى `data/publisher-v2-settings.json` في فرع `main`، وتشغيل دورة يرسل dispatch إلى workflow `publishing-v2-schedule.yml`.
- إعدادات الناشر الآلي ومحرك V2 والنشر اليدوي تبقى منفصلة؛ لا تغيّر هذه اللوحة مسار النشر اليدوي.
