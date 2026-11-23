import { describe, expect, it } from 'vitest';
import {
  buildCourierDisputeMessage,
  computeAuditDigestHex,
  verifyAuditIntegrity,
} from '../../src/core/auditDigest.ts';
import {
  autoDetectCourierMapping,
  autoDetectStoreMapping,
  exportDiscrepanciesToCsv,
  mapCourierRows,
  mapStoreRows,
  normalizeAwb,
  normalizeOrderStatus,
  parseDelimitedText,
  parseMoneyCell,
} from '../../src/core/csvParser.ts';
import { CODCHECK_PRESETS, createAuditFromPreset } from '../../src/core/presets.ts';
import {
  CodCheckCoreError,
  computeCodUnitEconomics,
  reconcileCodBatch,
} from '../../src/core/reconcile.ts';
import type { DiscrepancyItem, TariffRule } from '../../src/core/types.ts';

const STANDARD_TARIFF: TariffRule = {
  shippingFee: 20,
  rtoFee: 10,
  codFeePercent: 2,
  codFeeFixed: 5,
  vatOnFeesPercent: 15,
  settlementSlaDays: 5,
  feeTolerance: 0.25,
};

describe('CODCheck CSV Parser, Reconciliation Engine, Unit Economics & Audit Digest', () => {
  it('parses RFC 4180 delimited text with BOM, semicolons, quoted commas, Arabic numerals, AWB normalization & statuses', () => {
    const csv = [
      '\uFEFFAWB;Order ID;Status;COD Amount;City',
      '"#arx- ٧٧١٠١";"ORD-1";"تم التسليم";"٢٥٠.٥٠ د.إ";"Dubai, Marina"',
      '"arx_77102";"ORD-2";"مرتجع";"(199.00) AED";"Riyadh ""North"""',
      '"arx 77103";"ORD-3";"تسليم جزئي";"120.00";Jeddah',
      '"arx-77104";"ORD-4";"قيد التوصيل";"180";Dammam',
      '"arx-77105";"ORD-5";"تم الإلغاء";"100";Cairo',
    ].join('\r\n');

    const parsed = parseDelimitedText(csv);
    expect(parsed.delimiter).toBe(';');
    expect(parsed.headers).toEqual(['AWB', 'Order ID', 'Status', 'COD Amount', 'City']);
    expect(parsed.rows).toHaveLength(5);
    expect(parsed.rows[0]?.City).toBe('Dubai, Marina');
    expect(parsed.rows[1]?.City).toBe('Riyadh "North"');

    expect(normalizeAwb(parsed.rows[0]?.AWB ?? '')).toBe('ARX77101');
    expect(parseMoneyCell(parsed.rows[0]?.['COD Amount'])).toBe(250.5);
    expect(parseMoneyCell(parsed.rows[1]?.['COD Amount'])).toBe(-199);

    expect(normalizeOrderStatus(parsed.rows[0]?.Status ?? '')).toBe('delivered');
    expect(normalizeOrderStatus(parsed.rows[1]?.Status ?? '')).toBe('rto');
    expect(normalizeOrderStatus(parsed.rows[2]?.Status ?? '')).toBe('partial_return');
    expect(normalizeOrderStatus(parsed.rows[3]?.Status ?? '')).toBe('in_transit');
    expect(normalizeOrderStatus(parsed.rows[4]?.Status ?? '')).toBe('cancelled');
  });

  it('auto-detects Arabic Salla/EasyOrders & English Shopify/Courier headers and maps rows accurately', () => {
    const storeHeaders = ['رقم التتبع', 'مرجع الطلب', 'حالة الطلب', 'الإجمالي', 'المدينة', 'المنتج', 'التكلفة', 'التاريخ'];
    const storeMap = autoDetectStoreMapping(storeHeaders);
    expect(storeMap.awb).toBe('رقم التتبع');
    expect(storeMap.orderId).toBe('مرجع الطلب');
    expect(storeMap.status).toBe('حالة الطلب');
    expect(storeMap.codAmount).toBe('الإجمالي');
    expect(storeMap.city).toBe('المدينة');
    expect(storeMap.sku).toBe('المنتج');
    expect(storeMap.productCost).toBe('التكلفة');
    expect(storeMap.shipDate).toBe('التاريخ');

    const courierHeaders = ['Tracking Number', 'Delivery Status', 'Collected COD', 'Shipping Fee', 'RTO Fee', 'COD Fee', 'VAT', 'Net Payout'];
    const courierMap = autoDetectCourierMapping(courierHeaders);
    expect(courierMap.awb).toBe('Tracking Number');
    expect(courierMap.status).toBe('Delivery Status');
    expect(courierMap.collectedCod).toBe('Collected COD');
    expect(courierMap.shippingFee).toBe('Shipping Fee');
    expect(courierMap.rtoFee).toBe('RTO Fee');
    expect(courierMap.codFee).toBe('COD Fee');
    expect(courierMap.vatFee).toBe('VAT');
    expect(courierMap.netPayout).toBe('Net Payout');

    const storeRows = mapStoreRows(
      [{
        'رقم التتبع': 'SM-100',
        'مرجع الطلب': 'S-1',
        'حالة الطلب': 'تم التسليم',
        'الإجمالي': '250 ر.س',
        'المدينة': 'الرياض',
        'المنتج': 'SKU-1',
        'التكلفة': '60',
        'التاريخ': '2026-11-10',
      }],
      storeMap,
      { defaultPackagingCost: 5 },
    );
    expect(storeRows[0]?.packagingCost).toBe(5);
    expect(storeRows[0]?.codAmount).toBe(250);

    const courierRows = mapCourierRows(
      [{
        'Tracking Number': 'SM-100',
        'Delivery Status': 'Delivered',
        'Collected COD': '250',
        'Shipping Fee': '20',
        'RTO Fee': '0',
        'COD Fee': '10',
        'VAT': '4.50',
        'Net Payout': '215.50',
      }],
      courierMap,
    );
    expect(courierRows[0]?.netPayout).toBe(215.5);
  });

  it('detects missing remittance on delivered orders and aging COD past SLA days', () => {
    const result = reconcileCodBatch({
      referenceDate: '2026-11-24',
      tariff: STANDARD_TARIFF,
      storeOrders: [
        {
          awb: 'AWB-DEL-MISS',
          orderId: 'ORD-101',
          status: 'delivered',
          codAmount: 300,
          city: 'Riyadh',
          sku: 'OUD-01',
          productCost: 80,
          packagingCost: 5,
          adSpend: 25,
          shipDate: '2026-11-18',
        },
        {
          awb: 'AWB-OLD-TRANSIT',
          orderId: 'ORD-102',
          status: 'in_transit',
          codAmount: 220,
          city: 'Jeddah',
          sku: 'OUD-02',
          productCost: 60,
          packagingCost: 5,
          adSpend: 20,
          shipDate: '2026-11-10', // 14 days > 5 SLA
        },
      ],
      courierRows: [],
    });

    expect(result.discrepancies.map((d) => d.type)).toEqual(['missing_remittance', 'aging_cod']);
    expect(result.summary.missingRemittanceTotal).toBeGreaterThan(250);
    expect(result.summary.agingCodCount).toBe(1);
    expect(result.summary.agingCodAmount).toBe(220);
    expect(result.summary.criticalCount).toBe(1);
  });

  it('catches short COD collection, shipping/RTO/COD fee overcharges, illegal RTO on delivered, duplicate AWBs & unmatched courier rows', () => {
    const result = reconcileCodBatch({
      referenceDate: '2026-11-24',
      tariff: STANDARD_TARIFF,
      storeOrders: [
        // 1) Short COD + illegal RTO fee on delivered + overcharged shipping + overcharged COD fee
        {
          awb: 'AWB-1',
          orderId: 'O-1',
          status: 'delivered',
          codAmount: 200, // expected COD fee: 200*2%+5 = 9.00, shipping 20, vat 4.35 -> net 166.65
          city: 'Dubai',
          sku: 'SKU-A',
          productCost: 50,
          packagingCost: 4,
          adSpend: 20,
          shipDate: '2026-11-15',
        },
        // 2) Duplicate AWB in courier sheet
        {
          awb: 'AWB-2',
          orderId: 'O-2',
          status: 'delivered',
          codAmount: 100, // expected COD fee: 100*2%+5 = 7.00, shipping 20, vat 4.05 -> net 68.95
          city: 'Sharjah',
          sku: 'SKU-A',
          productCost: 30,
          packagingCost: 4,
          adSpend: 10,
          shipDate: '2026-11-15',
        },
        // 3) True RTO order overcharged RTO fee (25 instead of 10)
        {
          awb: 'AWB-3',
          orderId: 'O-3',
          status: 'rto',
          codAmount: 200,
          city: 'Dubai',
          sku: 'SKU-B',
          productCost: 50,
          packagingCost: 4,
          adSpend: 15,
          shipDate: '2026-11-16',
        },
      ],
      courierRows: [
        {
          awb: 'AWB-1',
          status: 'delivered',
          collectedCod: 180, // short by 20
          shippingFee: 28, // over by 8
          rtoFee: 10, // illegal RTO on delivered
          codFee: 14, // over by 5
          vatFee: 7.8,
        },
        {
          awb: 'AWB-2',
          status: 'delivered',
          collectedCod: 100,
          shippingFee: 20,
          rtoFee: 0,
          codFee: 7,
          vatFee: 4.05,
        },
        {
          awb: 'AWB-2',
          status: 'delivered',
          collectedCod: 0,
          shippingFee: 20,
          rtoFee: 0,
          codFee: 0,
          vatFee: 3.0,
        },
        {
          awb: 'AWB-3',
          status: 'rto',
          collectedCod: 0,
          shippingFee: 20,
          rtoFee: 25, // over by 15
          codFee: 0,
          vatFee: 6.75,
        },
        {
          awb: 'UNKNOWN-999',
          status: 'rto',
          collectedCod: 0,
          shippingFee: 20,
          rtoFee: 10,
          codFee: 0,
          vatFee: 4.5,
        },
      ],
    });

    const types = result.discrepancies.map((d) => d.type);
    expect(types).toContain('short_cod_collected');
    expect(types).toContain('overcharged_shipping');
    expect(types).toContain('overcharged_rto');
    expect(types).toContain('overcharged_cod_fee');
    expect(types).toContain('duplicate_awb_settlement');
    expect(types).toContain('unmatched_courier_awb');
    expect(result.summary.totalClaimableLeakage).toBeGreaterThan(0);

    expect(() =>
      reconcileCodBatch({
        storeOrders: [],
        courierRows: [],
        tariff: STANDARD_TARIFF,
      }),
    ).toThrow(CodCheckCoreError);
  });

  it('computes RTO-adjusted unit economics showing higher RTO raises Break-Even ROAS and cuts Break-Even CPA', () => {
    const perfectDelivery = computeCodUnitEconomics({
      sellingPrice: 250,
      cogsPerUnit: 70,
      packagingCost: 5,
      shippingFee: 22,
      rtoFee: 12,
      codFeePercent: 2,
      codFeeFixed: 5,
      vatOnFeesPercent: 15,
      deliveryRatePct: 100,
      adCpaActual: 35,
    });

    const realisticHighRto = computeCodUnitEconomics({
      sellingPrice: 250,
      cogsPerUnit: 70,
      packagingCost: 5,
      shippingFee: 22,
      rtoFee: 12,
      codFeePercent: 2,
      codFeeFixed: 5,
      vatOnFeesPercent: 15,
      deliveryRatePct: 68,
      adCpaActual: 35,
    });

    expect(realisticHighRto.effectiveRtoRatePct).toBe(32);
    expect(realisticHighRto.breakEvenCpa).toBeLessThan(perfectDelivery.breakEvenCpa);
    expect(realisticHighRto.breakEvenRoas).not.toBeNull();
    expect(perfectDelivery.breakEvenRoas).not.toBeNull();
    expect(realisticHighRto.breakEvenRoas!).toBeGreaterThan(perfectDelivery.breakEvenRoas!);
    expect(realisticHighRto.rtoCostBurnPerDelivered).toBeGreaterThan(0);
  });

  it('reconciles all 3 MENA/GCC presets cleanly with claimable leakage, city RTO and SKU breakdowns', () => {
    for (const preset of CODCHECK_PRESETS) {
      const run = createAuditFromPreset(preset.id);
      expect(run.summary.totalStoreOrders).toBeGreaterThanOrEqual(5);
      expect(run.summary.totalClaimableLeakage).toBeGreaterThan(0);
      expect(run.discrepancies.length).toBeGreaterThan(0);
      expect(run.byCity.length).toBeGreaterThan(0);
      expect(run.bySku.length).toBeGreaterThan(0);
      expect(run.unitEconomics.breakEvenCpa).toBeGreaterThan(0);
    }
  });

  it('generates deterministic 64-hex SHA-256 audit digests and detects post-audit tampering', async () => {
    const run = createAuditFromPreset('ksa-salla-smsa', {
      id: 'aud-fixed',
      slug: 'ksa-fixed',
    });
    const digest = await computeAuditDigestHex(run);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);

    run.scopeDigestHex = digest;
    const okCheck = await verifyAuditIntegrity(run);
    expect(okCheck.valid).toBe(true);
    expect(okCheck.actualDigest).toBe(digest);

    const tampered = {
      ...run,
      summary: {
        ...run.summary,
        totalClaimableLeakage: run.summary.totalClaimableLeakage + 100,
      },
    };
    const failCheck = await verifyAuditIntegrity(tampered);
    expect(failCheck.valid).toBe(false);
    expect(failCheck.actualDigest).not.toBe(digest);
  });

  it('exports formula-safe UTF-8 BOM discrepancy CSV and builds bilingual EN/AR courier claim messages', () => {
    const injectionItems: DiscrepancyItem[] = [
      {
        id: 'disc-1',
        type: 'missing_remittance',
        severity: 'critical',
        awb: '=HYPERLINK("http://evil")',
        orderId: '+SUM(A1)',
        city: '@Dubai',
        expectedAmount: 200,
        actualAmount: 0,
        varianceAmount: 200,
        messageEn: '-cmd|calc',
        messageAr: '=1+1',
      },
    ];

    const csv = exportDiscrepanciesToCsv(injectionItems, 'AED', 'en');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).toContain("'+SUM(A1)");
    expect(csv).toContain("'@Dubai");
    expect(csv).toContain("'-cmd|calc");

    const run = createAuditFromPreset('uae-shopify-aramex');
    run.auditNumber = 'COD-2026-0001';
    const msgEn = buildCourierDisputeMessage(run, 'en');
    const msgAr = buildCourierDisputeMessage(run, 'ar');

    expect(msgEn).toContain('COD-2026-0001');
    expect(msgEn).toContain('ARX-77104');
    expect(msgEn).toContain(run.summary.totalClaimableLeakage.toFixed(2));
    expect(msgAr).toContain('COD-2026-0001');
    expect(msgAr).toContain('ARX-77104');
    expect(msgAr).toContain('AED');
  });
});
