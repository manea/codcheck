import type {
  CurrencyCode,
  DiscrepancySeverity,
  DiscrepancyType,
  Locale,
  OrderStatus,
} from '../core/types.ts';

export interface CopyBundle {
  brandName: string;
  brandTagline: string;
  navAudits: string;
  navUpload: string;
  navCalculator: string;
  themeIvory: string;
  themeVault: string;
  langSwitch: string;
  heroBadge: string;
  heroTitle: string;
  heroSubtitle: string;
  heroUploadCta: string;
  heroCalcCta: string;
  statTotalAudits: string;
  statLockedReports: string;
  statLeakageFound: string;
  statAvgRto: string;
  presetsTitle: string;
  presetsSubtitle: string;
  createPresetBtn: string;
  auditsListTitle: string;
  filterAll: string;
  filterDraft: string;
  filterLocked: string;
  noAudits: string;
  openAuditBtn: string;
  openPublicBtn: string;
  duplicateBtn: string;
  deleteBtn: string;
  backToStudio: string;
  loadingLabel: string;
  notFoundTitle: string;
  notFoundBody: string;
  copiedLabel: string;
  // Audit Workspace
  statusDraft: string;
  statusLocked: string;
  finalizeBtn: string;
  finalizingBtn: string;
  exportCsvBtn: string;
  copyDisputeBtn: string;
  copyPublicLinkBtn: string;
  printPdfBtn: string;
  verifiedSealText: string;
  tamperWarningText: string;
  kpiLeakage: string;
  kpiMissingRemittance: string;
  kpiOvercharges: string;
  kpiDeliveryRto: string;
  kpiNetPayout: string;
  kpiNetProfit: string;
  tariffTitle: string;
  shippingFeeLabel: string;
  rtoFeeLabel: string;
  codFeePctLabel: string;
  codFeeFixedLabel: string;
  vatPctLabel: string;
  slaDaysLabel: string;
  recalcTariffBtn: string;
  disputeTitle: string;
  tabDiscrepancies: string;
  tabCities: string;
  tabSkus: string;
  tabOrders: string;
  sevAll: string;
  sevCritical: string;
  sevWarning: string;
  noDiscrepancies: string;
  colAwb: string;
  colOrder: string;
  colType: string;
  colCity: string;
  colExpected: string;
  colActual: string;
  colVariance: string;
  colDetails: string;
  colOrdersTotal: string;
  colDelivered: string;
  colRto: string;
  colRtoRate: string;
  colNetPayout: string;
  colNetProfit: string;
  colStatus: string;
  colCollected: string;
  colFees: string;
  // CSV Upload Modal / Panel
  uploadPanelTitle: string;
  uploadPanelSubtitle: string;
  auditTitleLabel: string;
  storeNameLabel: string;
  courierNameLabel: string;
  currencyLabel: string;
  refDateLabel: string;
  storeCsvTitle: string;
  courierCsvTitle: string;
  uploadCsvFileBtn: string;
  pasteCsvHint: string;
  mapAwbLabel: string;
  mapStatusLabel: string;
  mapCodLabel: string;
  mapCityLabel: string;
  mapSkuLabel: string;
  mapCollectedLabel: string;
  mapShippingLabel: string;
  mapRtoFeeLabel: string;
  mapCodFeeLabel: string;
  runAuditBtn: string;
  runningAuditBtn: string;
  // Unit Economics Calculator
  calcTitle: string;
  calcSubtitle: string;
  sellingPriceLabel: string;
  cogsLabel: string;
  packagingLabel: string;
  deliveryRateLabel: string;
  actualCpaLabel: string;
  breakEvenRoasLabel: string;
  breakEvenCpaLabel: string;
  rtoBurnLabel: string;
  netDeliveredLabel: string;
  netShippedLabel: string;
  compareTitle: string;
  compareRealistic: string;
  comparePerfect: string;
  impossibleBreakEven: string;
}

const AR_COPY: CopyBundle = {
  brandName: 'CODCheck',
  brandTagline: 'تدقيق تسويات الشحن · حاسبة صافي ربح الدفع عند الاستلام',
  navAudits: 'سجل التدقيقات',
  navUpload: 'تدقيق ملفات CSV',
  navCalculator: 'حاسبة ROAS والمرتجعات',
  themeIvory: 'نهاري دافئ',
  themeVault: 'ليلي داكن',
  langSwitch: 'English',
  heroBadge: 'معالجة محلية 100% بالمتصفح · كشف خصومات الشحن · تقارير مطالبة SHA-256',
  heroTitle: 'اكتشف كل ريال ودرهم وجنيه مفقود في تسويات شركات الشحن خلال 60 ثانية',
  heroSubtitle:
    'قارن ملف طلبات متجرك (سلة، شوبيفاي، إيزي أوردرز) بكشف شركة الشحن (سمسا، أرامكس، بوسطة، ناقل) لاكتشاف التحويلات المفقودة ورسوم المرتجع غير المبررة واحسب Break-Even ROAS الحقيقي.',
  heroUploadCta: 'رفع أو لصق ملفات CSV',
  heroCalcCta: 'حاسبة ربحية COD',
  statTotalAudits: 'إجمالي عمليات التدقيق',
  statLockedReports: 'تقارير مطالبة معتمدة',
  statLeakageFound: 'فروقات مالية مكتشفة',
  statAvgRto: 'متوسط نسبة المرتجع RTO',
  presetsTitle: 'جرّب فوراً من قوالب المتاجر وشركات الشحن',
  presetsSubtitle: 'عيّنات حقيقية بأخطاء تسوية متعمّدة لتجربة فحص المتجر الخليجي والمصري بضغطة واحدة.',
  createPresetBtn: 'تشغيل هذا القالب',
  auditsListTitle: 'التدقيقات والتقارير المحفوظة',
  filterAll: 'الكل',
  filterDraft: 'مسودات قيد المراجعة',
  filterLocked: 'تقارير مطالبة معتمدة',
  noAudits: 'لا توجد تدقيقات مطابقة بعد — ارفع ملفات CSV أو شغّل أحد القوالب الجاهزة أعلاه.',
  openAuditBtn: 'فتح لوحة التدقيق',
  openPublicBtn: 'رابط التقرير العام',
  duplicateBtn: 'نسخ كمسودة جديدة',
  deleteBtn: 'حذف',
  backToStudio: 'العودة للوحة التدقيقات',
  loadingLabel: 'جاري التحميل والمعالجة...',
  notFoundTitle: 'لم يتم العثور على تقرير التدقيق',
  notFoundBody: 'قد يكون الرابط غير صحيح أو تم حذف المسودة.',
  copiedLabel: 'تم النسخ',
  statusDraft: 'مسودة قابلة للتعديل',
  statusLocked: 'تقرير مطالبة موثّق',
  finalizeBtn: 'اعتماد وإصدار رقم مطالبة SHA-256',
  finalizingBtn: 'جاري الاعتماد...',
  exportCsvBtn: 'تصدير الفروقات CSV',
  copyDisputeBtn: 'نسخ رسالة المطالبة',
  copyPublicLinkBtn: 'نسخ الرابط العام',
  printPdfBtn: 'طباعة / حفظ PDF',
  verifiedSealText: 'تم التحقق من سلامة تقرير المطالبة SHA-256 — البيانات غير معدّلة',
  tamperWarningText: 'تنبيه: البصمة لا تطابق محتوى التقرير الحالي!',
  kpiLeakage: 'إجمالي التسرّب المستحق للمطالبة',
  kpiMissingRemittance: 'تحويلات مسلّمة مفقودة',
  kpiOvercharges: 'خصومات ونقص تحصيل',
  kpiDeliveryRto: 'نسبة التسليم / المرتجع RTO',
  kpiNetPayout: 'صافي التحويل الفعلي / المتوقع',
  kpiNetProfit: 'صافي الربح التقديري بعد المصاريف',
  tariffTitle: 'شروط العقد والتعريفة المتفق عليها مع شركة الشحن',
  shippingFeeLabel: 'رسوم الشحن الأساسي',
  rtoFeeLabel: 'رسوم المرتجع RTO',
  codFeePctLabel: 'عمولة التحصيل (%)',
  codFeeFixedLabel: 'رسوم تحصيل ثابتة',
  vatPctLabel: 'ضريبة الرسوم (%)',
  slaDaysLabel: 'مهلة التحويل (أيام)',
  recalcTariffBtn: 'تحديث التعريفة وإعادة المطابقة',
  disputeTitle: 'نص مطالبة جاهز لشركة الشحن (واتساب / بريد)',
  tabDiscrepancies: 'الفروقات والأخطاء',
  tabCities: 'تحليل المدن والمحافظات',
  tabSkus: 'ربحية المنتجات SKU',
  tabOrders: 'سجل البوالص الكامل',
  sevAll: 'كل الحالات',
  sevCritical: 'حرجة (تحويل/تحصيل)',
  sevWarning: 'تنبيهات رسوم وتأخير',
  noDiscrepancies: 'ممتاز! لا توجد فروقات في هذه الفئة.',
  colAwb: 'البوليصة',
  colOrder: 'الطلب',
  colType: 'نوع الفرق',
  colCity: 'المدينة',
  colExpected: 'المتوقع',
  colActual: 'الفعلي',
  colVariance: 'الفرق المستحق',
  colDetails: 'التفاصيل',
  colOrdersTotal: 'الطلبات',
  colDelivered: 'مسلّم',
  colRto: 'مرتجع',
  colRtoRate: 'نسبة RTO',
  colNetPayout: 'صافي التحويل',
  colNetProfit: 'صافي الربح',
  colStatus: 'الحالة',
  colCollected: 'المحصّل',
  colFees: 'الرسوم',
  uploadPanelTitle: 'مطابقة ملفات CSV الجديدة (المتجر × شركة الشحن)',
  uploadPanelSubtitle: 'ارفع ملفات CSV/TSV أو الصق البيانات مباشرة — يكتشف النظام الأعمدة العربية والإنجليزية تلقائياً.',
  auditTitleLabel: 'عنوان المراجعة',
  storeNameLabel: 'اسم المتجر',
  courierNameLabel: 'شركة الشحن',
  currencyLabel: 'العملة',
  refDateLabel: 'تاريخ المرجع (لحساب تأخير SLA)',
  storeCsvTitle: '1) ملف طلبات المتجر (Salla / Shopify / EasyOrders)',
  courierCsvTitle: '2) كشف تسوية شركة الشحن (SMSA / Aramex / Bosta)',
  uploadCsvFileBtn: 'اختيار ملف CSV',
  pasteCsvHint: 'أو الصق نص الجدول المفصول بفواصل هنا...',
  mapAwbLabel: 'عمود البوليصة',
  mapStatusLabel: 'عمود الحالة',
  mapCodLabel: 'مبلغ COD',
  mapCityLabel: 'المدينة',
  mapSkuLabel: 'المنتج / SKU',
  mapCollectedLabel: 'المبلغ المحصّل',
  mapShippingLabel: 'رسوم الشحن',
  mapRtoFeeLabel: 'رسوم المرتجع',
  mapCodFeeLabel: 'عمولة التحصيل',
  runAuditBtn: 'تشغيل المطابقة واكتشاف الفروقات',
  runningAuditBtn: 'جاري المطابقة...',
  calcTitle: 'حاسبة ربحية الدفع عند الاستلام المعدّلة بالمرتجعات (RTO)',
  calcSubtitle: 'شاهد أثر نسبة فشل التسليم على نقطة التعادل الإعلاني Break-Even ROAS وCPA قبل زيادة ميزانية الإعلانات.',
  sellingPriceLabel: 'سعر البيع (COD)',
  cogsLabel: 'تكلفة المنتج COGS',
  packagingLabel: 'تكلفة التغليف',
  deliveryRateLabel: 'نسبة التسليم الفعلية (%)',
  actualCpaLabel: 'تكلفة الإعلان الفعلية للطلب CPA',
  breakEvenRoasLabel: 'نقطة التعادل Break-Even ROAS',
  breakEvenCpaLabel: 'أقصى CPA قبل الخسارة',
  rtoBurnLabel: 'عبء المرتجعات لكل طلب مسلّم',
  netDeliveredLabel: 'صافي الربح لكل طلب مسلّم',
  netShippedLabel: 'صافي الربح لكل طلب مشحون',
  compareTitle: 'مقارنة أثر المرتجعات على التسعير والإعلانات',
  compareRealistic: 'عند نسبة التسليم الحالية',
  comparePerfect: 'لو كانت نسبة التسليم 100%',
  impossibleBreakEven: 'خسارة قبل الإعلانات!',
};

const EN_COPY: CopyBundle = {
  brandName: 'CODCheck',
  brandTagline: 'COD Settlement Auditor · RTO-Adjusted Profit Calculator',
  navAudits: 'Audit Runs',
  navUpload: 'Audit CSV Files',
  navCalculator: 'ROAS & RTO Calculator',
  themeIvory: 'Ivory Light',
  themeVault: 'Vault Dark',
  langSwitch: 'العربية',
  heroBadge: '100% Browser-Capable Privacy · Courier Fee Detection · SHA-256 Claim Reports',
  heroTitle: 'Catch every missing COD remittance & hidden courier overcharge in 60 seconds',
  heroSubtitle:
    'Reconcile Salla, Shopify, or EasyOrders exports against SMSA, Aramex, Bosta, or Naqel settlement sheets to recover missing payouts, expose illegal RTO charges, and calculate true Break-Even ROAS.',
  heroUploadCta: 'Upload / Paste CSV Batch',
  heroCalcCta: 'RTO Unit Economics',
  statTotalAudits: 'Total Audits',
  statLockedReports: 'Finalized Claim Reports',
  statLeakageFound: 'Claimable Leakage Found',
  statAvgRto: 'Average RTO Rate',
  presetsTitle: 'Start instantly from a realistic MENA/GCC preset',
  presetsSubtitle: 'Pre-loaded courier batches containing deliberate missing payouts & overcharges.',
  createPresetBtn: 'Run Preset Audit',
  auditsListTitle: 'Saved Reconciliation Audits',
  filterAll: 'All',
  filterDraft: 'Drafts',
  filterLocked: 'Locked Claim Reports',
  noAudits: 'No matching audits yet. Upload CSV files or launch a starter preset above.',
  openAuditBtn: 'Open Audit Board',
  openPublicBtn: 'Public Claim View',
  duplicateBtn: 'Duplicate as Draft',
  deleteBtn: 'Delete',
  backToStudio: 'Back to Audits Studio',
  loadingLabel: 'Loading & reconciling...',
  notFoundTitle: 'Audit Report Not Found',
  notFoundBody: 'This report link is invalid or the draft was deleted.',
  copiedLabel: 'Copied',
  statusDraft: 'Editable Draft',
  statusLocked: 'Locked SHA-256 Claim Report',
  finalizeBtn: 'Finalize & Lock Claim Report',
  finalizingBtn: 'Finalizing...',
  exportCsvBtn: 'Export Discrepancies CSV',
  copyDisputeBtn: 'Copy Claim Message',
  copyPublicLinkBtn: 'Copy Public Link',
  printPdfBtn: 'Print / Save PDF',
  verifiedSealText: 'SHA-256 Integrity Verified — Zero Post-Finalization Tampering',
  tamperWarningText: 'Warning: Report digest does not match current payload!',
  kpiLeakage: 'Total Claimable Leakage',
  kpiMissingRemittance: 'Missing Delivered Remittances',
  kpiOvercharges: 'Fee Overcharges & Shortfalls',
  kpiDeliveryRto: 'Delivery / RTO Rate',
  kpiNetPayout: 'Actual vs Expected Net Payout',
  kpiNetProfit: 'Estimated Net Profit',
  tariffTitle: 'Contracted Courier Tariff Rules',
  shippingFeeLabel: 'Base Shipping Fee',
  rtoFeeLabel: 'Contract RTO Fee',
  codFeePctLabel: 'COD Collection Fee (%)',
  codFeeFixedLabel: 'Fixed COD Fee',
  vatPctLabel: 'VAT on Fees (%)',
  slaDaysLabel: 'Settlement SLA (Days)',
  recalcTariffBtn: 'Update Tariff & Re-Reconcile',
  disputeTitle: 'Ready-to-Send Courier Claim Message (WhatsApp / Email)',
  tabDiscrepancies: 'Discrepancies',
  tabCities: 'City RTO Breakdown',
  tabSkus: 'SKU Profit Breakdown',
  tabOrders: 'All Shipments Ledger',
  sevAll: 'All Severities',
  sevCritical: 'Critical (Cash/Missing)',
  sevWarning: 'Fee & SLA Warnings',
  noDiscrepancies: 'No discrepancies matched this filter.',
  colAwb: 'AWB',
  colOrder: 'Order',
  colType: 'Discrepancy Type',
  colCity: 'City',
  colExpected: 'Expected',
  colActual: 'Actual',
  colVariance: 'Variance',
  colDetails: 'Details',
  colOrdersTotal: 'Orders',
  colDelivered: 'Delivered',
  colRto: 'RTO',
  colRtoRate: 'RTO %',
  colNetPayout: 'Net Payout',
  colNetProfit: 'Net Profit',
  colStatus: 'Status',
  colCollected: 'Collected',
  colFees: 'Fees',
  uploadPanelTitle: 'Reconcile New Store × Courier CSV Files',
  uploadPanelSubtitle: 'Drop CSV/TSV files or paste tabular text — Arabic and English headers auto-detect.',
  auditTitleLabel: 'Audit Title',
  storeNameLabel: 'Store Name',
  courierNameLabel: 'Courier Partner',
  currencyLabel: 'Currency',
  refDateLabel: 'Reference Date (for SLA aging)',
  storeCsvTitle: '1) Store Orders Export (Shopify / Salla / EasyOrders)',
  courierCsvTitle: '2) Courier Settlement Sheet (Aramex / SMSA / Bosta)',
  uploadCsvFileBtn: 'Choose CSV File',
  pasteCsvHint: 'Or paste CSV/TSV data here...',
  mapAwbLabel: 'AWB Column',
  mapStatusLabel: 'Status Column',
  mapCodLabel: 'COD Amount Column',
  mapCityLabel: 'City Column',
  mapSkuLabel: 'SKU Column',
  mapCollectedLabel: 'Collected COD Column',
  mapShippingLabel: 'Shipping Fee Column',
  mapRtoFeeLabel: 'RTO Fee Column',
  mapCodFeeLabel: 'COD Fee Column',
  runAuditBtn: 'Run Reconciliation Audit',
  runningAuditBtn: 'Reconciling...',
  calcTitle: 'RTO-Adjusted COD Profit & Break-Even ROAS Simulator',
  calcSubtitle: 'Measure how delivery failure rate shifts your true Break-Even CPA and Break-Even ROAS before scaling ads.',
  sellingPriceLabel: 'COD Selling Price (AOV)',
  cogsLabel: 'Product COGS',
  packagingLabel: 'Packaging Cost',
  deliveryRateLabel: 'Actual Delivery Rate (%)',
  actualCpaLabel: 'Actual Ad CPA per Shipped Order',
  breakEvenRoasLabel: 'Break-Even ROAS',
  breakEvenCpaLabel: 'Max Break-Even CPA',
  rtoBurnLabel: 'RTO Burn per Delivered Order',
  netDeliveredLabel: 'Net Profit per Delivered',
  netShippedLabel: 'Net Profit per Shipped',
  compareTitle: 'Impact of RTO on Break-Even Advertising Thresholds',
  compareRealistic: 'At current delivery rate',
  comparePerfect: 'If 100% delivered',
  impossibleBreakEven: 'Unprofitable before ads!',
};

export function getCopy(locale: Locale): CopyBundle {
  return locale === 'ar' ? AR_COPY : EN_COPY;
}

export function formatMoney(amount: number, currency: CurrencyCode, locale: Locale): string {
  const num = Number.isFinite(amount) ? amount : 0;
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (locale === 'ar') {
    const arCur: Record<CurrencyCode, string> = {
      SAR: 'ر.س',
      AED: 'د.إ',
      EGP: 'ج.م',
      USD: '$',
    };
    return `${formatted} ${arCur[currency] ?? currency}`;
  }
  return `${currency} ${formatted}`;
}

export function formatShortDate(iso: string, locale: Locale): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(locale === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function discrepancyLabel(type: DiscrepancyType, locale: Locale): string {
  const map: Record<DiscrepancyType, { ar: string; en: string }> = {
    missing_remittance: { ar: 'تحويل طلب مسلّم مفقود', en: 'Missing Remittance' },
    short_cod_collected: { ar: 'نقص تحصيل مبلغ COD', en: 'Short COD Collected' },
    overcharged_shipping: { ar: 'زيادة رسوم الشحن', en: 'Shipping Overcharge' },
    overcharged_rto: { ar: 'زيادة/خطأ رسوم مرتجع', en: 'RTO Fee Overcharge' },
    overcharged_cod_fee: { ar: 'زيادة عمولة التحصيل', en: 'COD Fee Overcharge' },
    aging_cod: { ar: 'شحنة متأخرة التسوية SLA', en: 'Aging COD (Past SLA)' },
    duplicate_awb_settlement: { ar: 'تكرار بوليصة بالتسوية', en: 'Duplicate AWB Row' },
    unmatched_courier_awb: { ar: 'بوليصة غير موجودة بالمتجر', en: 'Unmatched Courier AWB' },
  };
  return map[type][locale];
}

export function orderStatusLabel(status: OrderStatus, locale: Locale): string {
  const map: Record<OrderStatus, { ar: string; en: string }> = {
    delivered: { ar: 'تم التسليم', en: 'Delivered' },
    rto: { ar: 'مرتجع RTO', en: 'RTO' },
    in_transit: { ar: 'قيد التوصيل', en: 'In Transit' },
    cancelled: { ar: 'ملغي', en: 'Cancelled' },
    partial_return: { ar: 'تسليم جزئي', en: 'Partial Return' },
  };
  return map[status][locale];
}

export function severityLabel(sev: DiscrepancySeverity, locale: Locale): string {
  const map: Record<DiscrepancySeverity, { ar: string; en: string }> = {
    critical: { ar: 'حرج', en: 'Critical' },
    warning: { ar: 'تحذير', en: 'Warning' },
    info: { ar: 'معلومة', en: 'Info' },
  };
  return map[sev][locale];
}
