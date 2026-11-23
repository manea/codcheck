# سجل التغييرات — «CODCheck»

يُوثَّق في هذا الملف كل تغيير برمجي أو معماري في مشروع **«CODCheck»** (`projects/codcheck/`).

---

## [0.5.0] — 2026-11-24 — المرحلة 5: الإطلاق الإنتاجي المفتوح المصدر والمصدر المفتوح (`GitHub`)

### المضاف والمحدّث
- ترقية إصدار المشروع في `package.json` و`server/app.mjs` إلى `0.5.0` لتجهيز الإطلاق العام عبر المسار الفرعي `/codcheck` (`BASE_PATH=/codcheck`).
- إعداد قوالب النشر المستقل (`Docker Compose` و`systemd` و`Caddy` و`Cloudflare Workers`) وإطلاق المستودع المفتوح المصدر.
- تجهيز حزمة المصدر المفتوح برخصة `MIT` ([`LICENSE`](LICENSE)، سير عمل [`ci.yml`](.github/workflows/ci.yml)، لقطات الواجهة الست في `docs/screenshots/`، وسكربت التصدير المنقّى [`deploy/export-public-github.sh`](deploy/export-public-github.sh) مع بوابة منع التسريب `EXPORT_CLEAN_OK`).
- **التحقق**: اجتياز `typecheck`، **13/13** Vitest، `vite build`، فحص النشر الحي عبر HTTPS العام، ونجاح تصدير GitHub النظيف مع سير عمل CI الأخضر.

## [0.4.0] — 2026-11-24 — المرحلة 4: اختبارات Playwright E2E والفحص البصري وتحسينات BiDi والجوال وحزمة النشر $0

### المضاف والمحسّن
- **اختبارات المتصفح الشاملة (`tests/e2e/codcheck.spec.ts`)**: 3 مسارات E2E متكاملة على سطح المكتب (`1280x800`) والجوال (`390x844`) تغطي افتراضي `AR RTL / Ledger Ivory` وتبديل `EN LTR / Vault Slate` مع الثبات بعد إعادة التحميل، ومسار القالب الجاهز (`ksa-salla-smsa`)، وتعديل التعريفة وإعادة الحساب، والتبويبات الأربع، وتنزيل `UTF-8 BOM CSV`، ورسالة الاعتراض، والاعتماد الذري `COD-YYYY-0001` ببصمة `SHA-256`، ورابط التقرير العام `/r/COD-YYYY-0001`، واستيراد CSV التفاعلي، وحاسبة `Break-Even ROAS` بدون أي خطأ في وحدة التحكم أو تمرير أفقي.
- **تحسينات الفحص البصري (`src/index.css`, `src/App.tsx`, `src/components/AuditWorkspace.tsx`, `src/components/UnitEconomicsCalc.tsx`)**:
  - تغليف `.cod-display` و`.num-tabular` و`.cod-card` و`.cod-input` داخل `@layer components` كي تعمل أدوات Tailwind مثل `w-auto` على قائمة اختيار العملة بدل تمددها بكامل العرض.
  - عزل القيم المالية في `<bdi dir="ltr" className="inline-block whitespace-nowrap">` وإلغاء تداخل BiDi في بطاقة `صافي التحويل الفعلي / المتوقع`، ومواءمة اتجاه بطاقات المؤشرات تحت عناوينها.
  - منع التفاف رمز العملة (`ر.س`) في سطر مستقل ضمن صفوف المقارنة على شاشة `390x844`.
- **حزمة النشر المجانية `$0` والتوثيق**: ترقية الإصدار في `package.json` و`server/app.mjs` إلى `0.4.0`، وإنشاء `wrangler.jsonc` و`Dockerfile` و`docker-compose.yml` و`deploy/{.env.example,Caddyfile,codcheck.service,backup-sqlite.sh}` و`README.md` و`launch/DEPLOY-AND-SHARE.md`.
- **التحقق بعد آخر تعديل**: `bash -n deploy/backup-sqlite.sh`، `tsc --noEmit` (`0` أخطاء)، **13/13** Vitest، `vite build` (`2142 modules`)، **3/3** Playwright E2E (`14.2s`)، ومعاينة اللقطات المحدثة (`01`, `03`, `05`, `06`).

## [0.3.0] — 2026-11-24 — المرحلة 3: واجهة Ledger Ivory & Vault Slate (AR/EN) وتدقيق CSV التفاعلي وحاسبة Break-Even ROAS

### المضاف والمحدّث
- ترقية إصدار الحزمة والخادم في `package.json` و`server/app.mjs` إلى `0.3.0` وإضافة `public/favicon.svg` و`index.html` (`lang="ar" dir="rtl" data-theme="ivory"`) و`src/vite-env.d.ts` و`src/main.tsx`.
- تصميم الهوية البصرية المزدوجة في `src/index.css`: مظهر **Ledger Ivory** النهاري (`#FBF9F5`) ومظهر **Vault Slate** الليلي مع `.cod-card` و`.cod-input` و`.cod-display` و`.num-tabular` ودعم الطباعة `A4 @media print`.
- طبقة الترجمة والتشغيل المرن في `src/lib/{basePath,i18n,api}.ts`: دعم اللغة العربية `AR RTL` افتراضياً والإنجليزية `EN LTR`، قراءة `window.__CODCHECK_BASE__`، عميل REST مع بديل محلي كامل في `localStorage['codcheck_local_store_v1']`، وتصدير CSV الآمن `triggerAuditCsvDownload`.
- المكونات التفاعلية في `src/components/`:
  - `AuditWorkspace.tsx` (`data-testid="audit-workspace"`, وضع `studio` و`public`): فحص بصمة النزاهة `SHA-256` (`verifyAuditIntegrity`)، محرر التعريفات الحية، نص رسالة الاعتراض الجاهز لشركة الشحن، وعرض متجاوب (بطاقات الجوال `<sm` وجداول سطح المكتب والطباعة عبر الفروقات/المدن/المنتجات/الطلبات).
  - `CsvUploadModal.tsx` (`data-testid="csv-upload-panel"`): رفع أو لصق ملفات CSV مع كشف تلقائي للأعمدة.
  - `UnitEconomicsCalc.tsx` (`data-testid="unit-economics-calc"`): حاسبة فورية لـ `Break-Even ROAS` و`Break-Even CPA` و`RTO Burn` ومقارنة الأداء بنسبة تسليم `100%`.
- ربط التطبيق الكامل في `src/App.tsx`: مسارات `/` و`/r/:slugOrNumber` مع 3 سيناريوهات جاهزة وسجل تقارير التدقيق المحفوظة.
- **التحقق بعد آخر تعديل**: `tsc --noEmit` (`0` أخطاء)، `13/13` Vitest، `vite build` (`2142 modules`)، وفحص خادم SPA الحي على المنفذ `4188` (`/api/health` + `/` + `/r/demo` + `/r/COD-2026-0001`).

## [0.2.0] — 2026-11-24 — المرحلة 2: خادم Node 22 + SQLite WAL وواجهات API وتقارير المطالبة الذرية
- **طبقة قاعدة البيانات الدائمة (`server/db.mjs`)**: إعداد `SQLite WAL` (`codcheck.sqlite`) بأربعة جداول (`audits`, `tariff_profiles`, `audit_counters`, `audit_events`) مع معاملة ذرية متزامنة `BEGIN IMMEDIATE ... COMMIT` لإصدار تقارير المطالبة برقم متسلسل `COD-YYYY-0001` وبصمة تثبيت `SHA-256`، وفرض قفل التعديل والحذف بعد التثبيت (`409 AUDIT_LOCKED` و`409 ALREADY_LOCKED`) مع الاستنساخ إلى مسودة جديدة (`duplicateAudit`).
- **خادم HTTP وواجهات API (`server/app.mjs`, `server/app.d.mts`, `server/index.mjs`)**:
  - إعادة استخدام `src/core/*.ts` مباشرة على المنفذ `4185` مع دعم المسار الفرعي `BASE_PATH` (`window.__CODCHECK_BASE__`) وترويسات الأمان.
  - واجهات إنشاء التدقيقات من ملفات CSV الخام أو القوالب الجاهزة، وإعادة الحساب تلقائياً عند تعديل التعريفة `PATCH /api/audits/:id`، وحاسبة ربحية الوحدة `/api/unit-economics`، وملفات تعريفات شركات الشحن `/api/tariffs`.
  - تصدير CSV محمي ضد Formula Injection بـ `UTF-8 BOM` (`/api/audits/:id/export.csv`)، ورسائل المطالبة ثنائية اللغة (`/api/audits/:id/dispute-message`)، وبوابة التقرير العام `/api/public/reports/:slugOrNumber` مع عدّاد المشاهدات.
- **التحقق (`tests/unit/codcheckServer.test.ts`)**: `npm run typecheck` (`0` أخطاء)، **13/13** اختبارات Vitest (`8` نواة + `5` تكامل خادم)، وفحص التشغيل الحي على `4187` (`/api/health` و`/api/presets`).

## [0.1.0] — 2026-11-24 — المرحلة 1: التوثيق وهيكلة المشروع والمحرك الأساسي للمطابقة والربحية
- إعداد وثيقة المواصفات والمعمارية [`research/06-codcheck-spec-and-architecture.md`](../../research/06-codcheck-spec-and-architecture.md) لتموضع **CODCheck** كمدقق تسويات شركات الشحن (`Aramex / SMSA / Bosta / Naqel`) وحاسبة ربحية الدفع عند الاستلام المعدّلة بالمرتجعات `RTO` لمتاجر `Salla / Shopify / EasyOrders / WooCommerce`.
- تأسيس هيكل المشروع المستقل `projects/codcheck/` (`package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.gitignore`) على المنفذين `4185` (التطبيق) و`4186` (Playwright E2E).
- بناء المحرك الأساسي المتماثل الصفري الاعتماديات (Browser + Node 22) في `src/core/`:
  - [`src/core/types.ts`](src/core/types.ts): عقود طلبات المتجر، أسطر التسوية، تعريفات شركات الشحن، حالات الفروقات الثمانية (`DiscrepancyType`)، مخرجات المدينة/المنتج، وحساب `Break-Even CPA / ROAS`.
  - [`src/core/csvParser.ts`](src/core/csvParser.ts): محلّل RFC 4180 المتسامح مع `UTF-8 BOM` وفواصل `,` / `;` / `\t` والأرقام العربية، تطبيع بوالص الشحن `normalizeAwb`، الاكتشاف التلقائي لأعمدة المنصات العربية والإنجليزية، وتصدير CSV محمي ضد `Formula Injection`.
  - [`src/core/reconcile.ts`](src/core/reconcile.ts): مطابقة بوالص الشحن واكتشاف التحويلات المفقودة (`missing_remittance`)، نقص التحصيل، تضخّم رسوم الشحن أو فرض رسوم مرتجع `RTO` على شحنات مسلّمة، الشحنات العالقة `aging_cod`، التكرار، وتحليلات `byCity` و`bySku` وحاسبة `computeCodUnitEconomics`.
  - [`src/core/auditDigest.ts`](src/core/auditDigest.ts): توليد والتحقق من بصمة النزاهة `SHA-256` لتقرير المطابقة وصياغة رسائل المطالبة الرسمية لشركة الشحن باللغتين العربية والإنجليزية.
  - [`src/core/presets.ts`](src/core/presets.ts): 3 قوالب خليجية وعربية واقعية جاهزة للتشغيل الفوري (`ksa-salla-smsa`, `uae-shopify-aramex`, `eg-easyorders-bosta`) تتضمن فروقات تسوية محسوبة بدقة.
- التحقق المستقل عبر `npm run typecheck` واختبارات `Vitest` (`tests/unit/codcheckCore.test.ts`).
