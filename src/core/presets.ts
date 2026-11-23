import {
  autoDetectCourierMapping,
  autoDetectStoreMapping,
  mapCourierRows,
  mapStoreRows,
  parseDelimitedText,
} from './csvParser.ts';
import { computeCodUnitEconomics, reconcileCodBatch, round2 } from './reconcile.ts';
import type {
  CourierProvider,
  CurrencyCode,
  Locale,
  ReconciliationAuditRun,
  StorePlatform,
  TariffRule,
} from './types.ts';

export interface CodCheckPresetMeta {
  id: 'ksa-salla-smsa' | 'uae-shopify-aramex' | 'eg-easyorders-bosta';
  nameEn: string;
  nameAr: string;
  badgeEn: string;
  badgeAr: string;
  currency: CurrencyCode;
  platform: StorePlatform;
  courier: CourierProvider;
  defaultLocale: Locale;
  title: string;
  titleAr: string;
  storeName: string;
  courierName: string;
  referenceDate: string;
  defaultPackagingCost: number;
  defaultUnitSellingPrice: number;
  defaultUnitCogs: number;
  tariff: TariffRule;
  storeCsv: string;
  courierCsv: string;
}

export const CODCHECK_PRESETS: CodCheckPresetMeta[] = [
  {
    id: 'ksa-salla-smsa',
    nameEn: 'Salla Store + SMSA Express (KSA 15% VAT)',
    nameAr: 'متجر سلة + سمسا إكسبريس (السعودية — ضريبة 15%)',
    badgeEn: 'SAR · Salla / SMSA',
    badgeAr: 'ر.س · سلة / سمسا',
    currency: 'SAR',
    platform: 'salla',
    courier: 'smsa',
    defaultLocale: 'ar',
    title: 'Al-Baha Oud — SMSA Weekly COD Settlement Audit',
    titleAr: 'متجر عود الباحة — تدقيق تسوية سمسا الأسبوعية',
    storeName: 'متجر عود الباحة | Al-Baha Oud',
    courierName: 'SMSA Express (سمسا)',
    referenceDate: '2026-11-24',
    defaultPackagingCost: 4,
    defaultUnitSellingPrice: 249,
    defaultUnitCogs: 68,
    tariff: {
      shippingFee: 24,
      rtoFee: 12,
      codFeePercent: 2,
      codFeeFixed: 5,
      vatOnFeesPercent: 15,
      settlementSlaDays: 7,
      feeTolerance: 0.25,
    },
    storeCsv: [
      'رقم التتبع,رقم الطلب,حالة الطلب,الإجمالي,المدينة,المنتج,التكلفة,التغليف,تكلفة الإعلان,تاريخ الشحن',
      'SMSA-9011,SA-4401,تم التسليم,250,الرياض,عطر دهن ملكي,70,4,28,2026-11-12',
      'SMSA-9012,SA-4402,تم التسليم,320,جدة,مبخرة فاخرة,95,5,32,2026-11-12',
      'SMSA-9013,SA-4403,تم التسليم,200,الدمام,عطر مسك أبيض,55,4,25,2026-11-13',
      'SMSA-9014,SA-4404,مرتجع,250,الرياض,عطر دهن ملكي,70,4,28,2026-11-13',
      'SMSA-9015,SA-4405,قيد التوصيل,280,أبها,طقم هدايا نجد,85,5,30,2026-11-10',
      'SMSA-9016,SA-4406,تم التسليم,249,مكة,عطر دهن ملكي,68,4,28,2026-11-14',
    ].join('\n'),
    courierCsv: [
      'رقم البوليصة,حالة الشحنة,المبلغ المحصل,رسوم الشحن,رسوم المرتجع,رسوم التحصيل,ضريبة القيمة المضافة,تاريخ التسوية',
      // 9011 normal delivered: ship 24, codFee 5+5=10, vat (24+10)*0.15=5.10 -> fees 39.10, net 210.90
      'SMSA-9011,Delivered,250,24,0,10,5.10,2026-11-20',
      // 9012 DELIVERED but overcharged shipping (34 instead of 24) + illegal RTO fee 12 charged!
      'SMSA-9012,Delivered,320,34,12,11.40,8.61,2026-11-20',
      // 9013 MISSING REMITTANCE (intentionally omitted from courier sheet!)
      // 9014 RTO normal fees (ship 24 + rto 12 + vat 5.40 = 41.40)
      'SMSA-9014,Returned,0,24,12,0,5.40,2026-11-20',
      // 9016 normal delivered: ship 24, codFee 2%*249+5=9.98, vat 33.98*0.15=5.10
      'SMSA-9016,Delivered,249,24,0,9.98,5.10,2026-11-20',
    ].join('\n'),
  },
  {
    id: 'uae-shopify-aramex',
    nameEn: 'Shopify Store + Aramex UAE (5% VAT)',
    nameAr: 'متجر شوبيفاي + أرامكس الإمارات (ضريبة 5%)',
    badgeEn: 'AED · Shopify / Aramex',
    badgeAr: 'د.إ · شوبيفاي / أرامكس',
    currency: 'AED',
    platform: 'shopify',
    courier: 'aramex',
    defaultLocale: 'en',
    title: 'Dune Botanics — Aramex COD Settlement Audit',
    titleAr: 'ديون بوتانيكس — تدقيق تسويات أرامكس الإمارات',
    storeName: 'Dune Botanics LLC',
    courierName: 'Aramex UAE',
    referenceDate: '2026-11-24',
    defaultPackagingCost: 3,
    defaultUnitSellingPrice: 199,
    defaultUnitCogs: 48,
    tariff: {
      shippingFee: 18,
      rtoFee: 10,
      codFeePercent: 1.5,
      codFeeFixed: 3,
      vatOnFeesPercent: 5,
      settlementSlaDays: 5,
      feeTolerance: 0.25,
    },
    storeCsv: [
      'AWB,Order ID,Status,COD Amount,City,SKU,Product Cost,Packaging,Ad Spend,Ship Date',
      'ARX-77101,SH-1001,Delivered,199,Dubai,SERUM-30ML,48,3,24,2026-11-15',
      'ARX-77102,SH-1002,Delivered,350,Abu Dhabi,GLOW-BUNDLE,92,4,35,2026-11-15',
      'ARX-77103,SH-1003,RTO,199,Sharjah,SERUM-30ML,48,3,24,2026-11-16',
      'ARX-77104,SH-1004,Delivered,220,Al Ain,MIST-DUO,58,3,26,2026-11-16',
      'ARX-77105,SH-1005,In Transit,199,Dubai,SERUM-30ML,48,3,24,2026-11-17',
    ].join('\n'),
    courierCsv: [
      'AWB,Delivery Status,Collected COD,Shipping Fee,RTO Fee,COD Fee,VAT,Settlement Date',
      // 77101 short COD collected: 180 instead of 199 (19 AED shortage)
      'ARX-77101,Delivered,180,18,0,5.99,1.20,2026-11-21',
      // 77102 duplicate row billed twice for shipping!
      'ARX-77102,Delivered,350,18,0,8.25,1.31,2026-11-21',
      'ARX-77102,Delivered,0,18,0,0,0.90,2026-11-22',
      // 77103 RTO normal
      'ARX-77103,Returned,0,18,10,0,1.40,2026-11-21',
      // 77104 MISSING REMITTANCE (absent!)
    ].join('\n'),
  },
  {
    id: 'eg-easyorders-bosta',
    nameEn: 'EasyOrders + Bosta Egypt (14% VAT, High RTO)',
    nameAr: 'إيزي أوردرز + بوسطة مصر (ضريبة 14% ومرتجعات مرتفعة)',
    badgeEn: 'EGP · EasyOrders / Bosta',
    badgeAr: 'ج.م · إيزي أوردرز / بوسطة',
    currency: 'EGP',
    platform: 'easyorders',
    courier: 'bosta',
    defaultLocale: 'ar',
    title: 'Nile Gear — Bosta Weekly Reconciliation',
    titleAr: 'نايل جير — تدقيق تسوية بوسطة الأسبوعي',
    storeName: 'نايل جير للتجارة',
    courierName: 'Bosta Egypt (بوسطة)',
    referenceDate: '2026-11-24',
    defaultPackagingCost: 15,
    defaultUnitSellingPrice: 750,
    defaultUnitCogs: 260,
    tariff: {
      shippingFee: 65,
      rtoFee: 35,
      codFeePercent: 1.5,
      codFeeFixed: 10,
      vatOnFeesPercent: 14,
      settlementSlaDays: 4,
      feeTolerance: 0.5,
    },
    storeCsv: [
      'Tracking Number,Order ID,Status,COD Amount,City,Product,COGS,Packaging,Ads,Ship Date',
      'BST-501,EO-801,تم التسليم,750,القاهرة,ساعة ذكية برو,260,15,95,2026-11-16',
      'BST-502,EO-802,مرتجع,750,الإسكندرية,ساعة ذكية برو,260,15,95,2026-11-16',
      'BST-503,EO-803,تم التسليم,900,الجيزة,سماعة رياضية X,310,15,110,2026-11-17',
      'BST-504,EO-804,مرتجع,750,المنصورة,ساعة ذكية برو,260,15,95,2026-11-17',
      'BST-505,EO-805,تم التسليم,750,القاهرة,ساعة ذكية برو,260,15,95,2026-11-18',
    ].join('\n'),
    courierCsv: [
      'AWB,Status,Collected COD,Shipping Fee,RTO Fee,COD Fee,VAT,Settlement Date',
      'BST-501,Delivered,750,65,0,21.25,12.08,2026-11-21',
      // 502 RTO overcharged RTO fee (65 instead of 35 contract RTO fee)
      'BST-502,Returned,0,65,65,0,18.20,2026-11-21',
      // 503 MISSING REMITTANCE
      'BST-504,Returned,0,65,35,0,14.00,2026-11-21',
      'BST-505,Delivered,750,65,0,21.25,12.08,2026-11-22',
    ].join('\n'),
  },
];

export function createAuditFromPreset(
  presetId: CodCheckPresetMeta['id'],
  overrides: Partial<
    Pick<
      ReconciliationAuditRun,
      'id' | 'slug' | 'title' | 'titleAr' | 'storeName' | 'courierName' | 'defaultLocale' | 'referenceDate'
    >
  > = {},
): ReconciliationAuditRun {
  const preset = CODCHECK_PRESETS.find((p) => p.id === presetId) ?? CODCHECK_PRESETS[0]!;
  const now = new Date().toISOString();
  const rand = Math.random().toString(36).slice(2, 7);

  const parsedStore = parseDelimitedText(preset.storeCsv);
  const storeMap = autoDetectStoreMapping(parsedStore.headers);
  const storeOrders = mapStoreRows(parsedStore.rows, storeMap, {
    defaultPackagingCost: preset.defaultPackagingCost,
  });

  const parsedCourier = parseDelimitedText(preset.courierCsv);
  const courierMap = autoDetectCourierMapping(parsedCourier.headers);
  const courierRows = mapCourierRows(parsedCourier.rows, courierMap);

  const refDate = overrides.referenceDate ?? preset.referenceDate;
  const reconciled = reconcileCodBatch({
    storeOrders,
    courierRows,
    tariff: preset.tariff,
    referenceDate: refDate,
    defaultPackagingCost: preset.defaultPackagingCost,
  });

  const deliveredOrRto = reconciled.summary.deliveredOrders + reconciled.summary.rtoOrders;
  const deliveryPct =
    deliveredOrRto > 0
      ? round2((reconciled.summary.deliveredOrders / deliveredOrRto) * 100)
      : 75;
  const avgAdCpa =
    storeOrders.length > 0
      ? round2(reconciled.summary.totalAdSpend / storeOrders.length)
      : 0;

  const unitEconomics = computeCodUnitEconomics({
    sellingPrice: preset.defaultUnitSellingPrice,
    cogsPerUnit: preset.defaultUnitCogs,
    packagingCost: preset.defaultPackagingCost,
    shippingFee: preset.tariff.shippingFee,
    rtoFee: preset.tariff.rtoFee,
    codFeePercent: preset.tariff.codFeePercent,
    codFeeFixed: preset.tariff.codFeeFixed,
    vatOnFeesPercent: preset.tariff.vatOnFeesPercent,
    deliveryRatePct: deliveryPct,
    adCpaActual: avgAdCpa,
  });

  return {
    id: overrides.id ?? `aud-${Date.now().toString(36)}-${rand}`,
    slug: overrides.slug ?? `${preset.id}-${rand}`,
    presetId: preset.id,
    defaultLocale: overrides.defaultLocale ?? preset.defaultLocale,
    title: overrides.title ?? preset.title,
    titleAr: overrides.titleAr ?? preset.titleAr,
    storeName: overrides.storeName ?? preset.storeName,
    courierName: overrides.courierName ?? preset.courierName,
    platform: preset.platform,
    courier: preset.courier,
    currency: preset.currency,
    referenceDate: refDate,
    tariff: { ...preset.tariff },
    summary: reconciled.summary,
    lines: reconciled.lines,
    discrepancies: reconciled.discrepancies,
    byCity: reconciled.byCity,
    bySku: reconciled.bySku,
    unitEconomics,
    storeCsvSample: preset.storeCsv,
    courierCsvSample: preset.courierCsv,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}
