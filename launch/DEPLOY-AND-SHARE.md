# دليل النشر المجاني ($0) والمشاركة الأخلاقية — CODCheck

يوفّر هذا الدليل مسارَي نشر عمليين بميزانية ابتدائية **\$0** لتشغيل **CODCheck** لمتاجر سلة وشوبيفاي وإيزي أوردرز، إلى جانب مسودات مشاركة مجتمعية أخلاقية للتجارة الإلكترونية في الخليج ومصر.

---

## المسار أ: النشر الساكن المجاني والآمن تجارياً ($0 — Cloudflare Workers Static Assets)

> **تنبيه التراخيص التجارية**: يعتمد الاستوديو حصراً على **Cloudflare Workers Static Assets / Pages** للنشر المجاني الآمن تجارياً؛ ويُحظر تماماً استخدام **Vercel Hobby** (غير تجاري فقط) أو **GitHub Pages** (مقيد تجارياً).

في وضع الاستضافة الساكنة يعمل **CODCheck** 100% داخل المتصفح مع تخزين تلقائي في `localStorage` (`codcheck_local_store_v1` عبر آلية fallback في `src/lib/api.ts`)، دون رفع ملفات الطلبات الحساسة أو أرقام هواتف العملاء لأي خادم خارجي.

```bash
cd projects/codcheck
npm ci
npm run build
npx wrangler login
npx wrangler deploy
```

ملف التهيئة الجاهز: [`wrangler.jsonc`](../wrangler.jsonc) (`assets.directory = "./dist"`, `not_found_handling = "single-page-application"`).

---

## المسار ب: التشغيل المتكامل الكامل (Node 22 + SQLite WAL + روابط `/r/COD-YYYY-0001`)

لتفعيل الحفظ المشترك في SQLite، وإصدار تقارير المطالبة الذرية المرقمة (`COD-YYYY-0001`) الموثقة ببصمة `SHA-256`، والروابط العامة القابلة للمشاركة مع فريق المالية وشركة الشحن (`/r/:slugOrNumber`):

### 1) عبر Docker Compose (خادم شخصي أو VPS اقتصادي)
```bash
cd projects/codcheck
cp deploy/.env.example .env
# عدّل APP_ORIGIN و BASE_PATH عند الحاجة
docker compose up -d --build
curl -sf http://127.0.0.1:4185/api/health
```

### 2) عبر Node 22 + systemd + Caddy HTTPS (:4185)
1. انسخ [`deploy/.env.example`](../deploy/.env.example) إلى مجلد البيانات (مثلاً `~/srv-data/codcheck/.env`) واضبط `CODCHECK_DATA_DIR` و`BASE_PATH` و`APP_ORIGIN`.
2. ابْنِ الواجهة الإنتاجية:
   ```bash
   npm ci && npm run build
   ```
3. ثبّت وحدة الخدمة [`deploy/codcheck.service`](../deploy/codcheck.service) وربطها خلف [`deploy/Caddyfile`](../deploy/Caddyfile).
4. جدوِل النسخ الاحتياطي الآمن عبر `VACUUM INTO` باستخدام [`deploy/backup-sqlite.sh`](../deploy/backup-sqlite.sh):
   ```bash
   CODCHECK_DATA_DIR=/path/to/data ./deploy/backup-sqlite.sh
   ```

---

## مسودات المشاركة الأخلاقية ($0 Zero-Budget Community Sharing)

### 1) منشور LinkedIn / X (عربي — لتجار سلة وشوبيفاي وإيزي أوردرز في الخليج ومصر)
> كثير من متاجر الدفع عند الاستلام (`COD`) يعتقدون أن الحملة رابحة لأن المتجر يحقق عائد إعلاني `ROAS 2.2x` — لكن بعد مطابقة كشف شركة الشحن آخر الشهر يكتشفون المفاجأة:
> - طلبات مسلّمة لم يتحوّل مبلغها من شركة الشحن أصلاً.
> - خصم رسوم مرتجع (`RTO Fee`) بالخطأ على شحنات مسلّمة أو رسوم شحن أعلى من العقد.
> - وحرق إعلاني بسبب نسبة المرتجع يجعل الـ `Break-Even ROAS` الحقيقي أعلى بكثير من المتوقع!
>
> بنينا أداة **CODCheck** المجانية لهذا الغرض:
> - طابق ملف طلبات المتجر (سلة / شوبيفاي / إيزي أوردرز) مع شيت شركة الشحن (سمسا / أرامكس / بوسطة / ناقل) داخل المتصفح.
> - استخرج قائمة الفروقات ورسالة مطالبة رسمية جاهزة للإرسال، بالإضافة لحاسبة `Break-Even ROAS` المعدّلة بالمرتجعات.
>
> إذا تشتغلون بـ COD، جرّبوا الأمثلة الجاهزة وأعطونا ملاحظاتكم على الحالات التي تصادفونها مع شركات الشحن!

### 2) LinkedIn / X Post (English — MENA & GCC E-commerce Operators & Media Buyers)
> Two silent profit killers in GCC/MENA Cash-on-Delivery (`COD`) e-commerce:
> 1. Missing COD remittances & billing overcharges buried inside weekly Aramex / SMSA / Bosta settlement spreadsheets.
> 2. Scaling ad spend against a 100%-delivery `Break-Even ROAS` formula when actual delivery rates sit at `65%–75%`.
>
> We built **CODCheck**:
> - Drop your store orders CSV + courier settlement CSV to surface missing remittances, duplicate AWB billing, overcharged shipping/RTO fees, and aging SLA shipments.
> - Generate a `SHA-256` verified claim report (`COD-YYYY-0001`), CSV export, and ready-to-send Arabic/English courier dispute letter.
> - Simulate true **RTO-adjusted Break-Even ROAS & CPA** before scaling ad budgets.
>
> Runs `100%` in-browser (`localStorage`) or self-hosted (`Node 22 + SQLite WAL`). Would love feedback from e-commerce founders & media buyers!
