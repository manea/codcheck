import { normalizeAwb } from './csvParser.ts';
import type {
  BreakdownMetrics,
  CodUnitEconomicsInput,
  CodUnitEconomicsResult,
  CourierSettlementRow,
  DiscrepancyItem,
  DiscrepancyType,
  ExpectedFeeBreakdown,
  OrderReconciliationLine,
  ReconciliationBatchInput,
  ReconciliationBatchResult,
  ReconciliationSummary,
  StoreOrderRow,
  TariffRule,
} from './types.ts';

export class CodCheckCoreError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CodCheckCoreError';
    this.code = code;
  }
}

export function round2(value: number): number {
  const rounded = Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function validateTariff(tariff: TariffRule): void {
  if (
    !Number.isFinite(tariff.shippingFee) ||
    tariff.shippingFee < 0 ||
    !Number.isFinite(tariff.rtoFee) ||
    tariff.rtoFee < 0 ||
    !Number.isFinite(tariff.codFeePercent) ||
    tariff.codFeePercent < 0 ||
    !Number.isFinite(tariff.codFeeFixed) ||
    tariff.codFeeFixed < 0 ||
    !Number.isFinite(tariff.vatOnFeesPercent) ||
    tariff.vatOnFeesPercent < 0 ||
    !Number.isFinite(tariff.settlementSlaDays) ||
    tariff.settlementSlaDays < 1 ||
    !Number.isFinite(tariff.feeTolerance) ||
    tariff.feeTolerance < 0
  ) {
    throw new CodCheckCoreError('INVALID_TARIFF', 'Tariff fees, percentages, and SLA days must be valid non-negative numbers.');
  }
}

export function computeExpectedCourierFees(
  order: StoreOrderRow,
  tariff: TariffRule,
): ExpectedFeeBreakdown {
  validateTariff(tariff);
  const cod = Math.max(0, order.codAmount);

  if (order.status === 'delivered' || order.status === 'partial_return') {
    const expectedShippingFee = round2(tariff.shippingFee);
    const expectedRtoFee = 0;
    const expectedCodFee = round2(
      (cod * tariff.codFeePercent) / 100 + (cod > 0 ? tariff.codFeeFixed : 0),
    );
    const expectedVat = round2(((expectedShippingFee + expectedCodFee) * tariff.vatOnFeesPercent) / 100);
    const expectedTotalFees = round2(expectedShippingFee + expectedRtoFee + expectedCodFee + expectedVat);
    const expectedNetPayout = round2(cod - expectedTotalFees);
    return {
      expectedShippingFee,
      expectedRtoFee,
      expectedCodFee,
      expectedVat,
      expectedTotalFees,
      expectedNetPayout,
    };
  }

  if (order.status === 'rto') {
    const expectedShippingFee = round2(tariff.shippingFee);
    const expectedRtoFee = round2(tariff.rtoFee);
    const expectedCodFee = 0;
    const expectedVat = round2(((expectedShippingFee + expectedRtoFee) * tariff.vatOnFeesPercent) / 100);
    const expectedTotalFees = round2(expectedShippingFee + expectedRtoFee + expectedVat);
    const expectedNetPayout = round2(-expectedTotalFees);
    return {
      expectedShippingFee,
      expectedRtoFee,
      expectedCodFee,
      expectedVat,
      expectedTotalFees,
      expectedNetPayout,
    };
  }

  if (order.status === 'in_transit') {
    const expectedShippingFee = round2(tariff.shippingFee);
    const expectedRtoFee = 0;
    const expectedCodFee = 0;
    const expectedVat = round2((expectedShippingFee * tariff.vatOnFeesPercent) / 100);
    const expectedTotalFees = round2(expectedShippingFee + expectedVat);
    return {
      expectedShippingFee,
      expectedRtoFee,
      expectedCodFee,
      expectedVat,
      expectedTotalFees,
      expectedNetPayout: round2(-expectedTotalFees),
    };
  }

  return {
    expectedShippingFee: 0,
    expectedRtoFee: 0,
    expectedCodFee: 0,
    expectedVat: 0,
    expectedTotalFees: 0,
    expectedNetPayout: 0,
  };
}

export function computeCodUnitEconomics(input: CodUnitEconomicsInput): CodUnitEconomicsResult {
  const sellingPrice = Math.max(0, input.sellingPrice);
  const cogs = Math.max(0, input.cogsPerUnit);
  const packaging = Math.max(0, input.packagingCost);
  const shipping = Math.max(0, input.shippingFee);
  const rtoFee = Math.max(0, input.rtoFee);
  const codPct = Math.max(0, input.codFeePercent);
  const codFixed = Math.max(0, input.codFeeFixed);
  const vatPct = Math.max(0, input.vatOnFeesPercent);
  const confirmRatePct =
    input.confirmationRatePct !== undefined
      ? Math.min(100, Math.max(1, input.confirmationRatePct))
      : 100;
  const deliveryRateOnConfirmedPct = Math.min(100, Math.max(1, input.deliveryRatePct));

  const d = (deliveryRateOnConfirmedPct / 100) * (confirmRatePct === 100 ? 1 : 1);
  const r = 1 - d;

  const deliveredCodFee = (sellingPrice * codPct) / 100 + (sellingPrice > 0 ? codFixed : 0);
  const deliveredVat = ((shipping + deliveredCodFee) * vatPct) / 100;
  const deliveredTotalFees = shipping + deliveredCodFee + deliveredVat;

  const rtoVat = ((shipping + rtoFee) * vatPct) / 100;
  const rtoTotalFees = shipping + rtoFee + rtoVat;

  const expectedRevenuePerShipped = round2(d * sellingPrice);
  const expectedFeesPerShipped = round2(d * deliveredTotalFees + r * rtoTotalFees);
  const expectedProductAndPackPerShipped = round2(d * cogs + packaging);
  const expectedContributionBeforeAds = round2(
    expectedRevenuePerShipped - expectedFeesPerShipped - expectedProductAndPackPerShipped,
  );

  const breakEvenCpa = round2(Math.max(0, expectedContributionBeforeAds));
  const breakEvenRoas =
    expectedContributionBeforeAds > 0
      ? round2(expectedRevenuePerShipped / expectedContributionBeforeAds)
      : null;

  const adCpa = Math.max(0, input.adCpaActual ?? 0);
  const netProfitPerShipped = round2(expectedContributionBeforeAds - adCpa);
  const netProfitPerDelivered = d > 0 ? round2(netProfitPerShipped / d) : 0;
  const rtoCostBurnPerDelivered = d > 0 ? round2((r * (rtoTotalFees + packaging)) / d) : 0;

  return {
    effectiveRtoRatePct: round2(r * 100),
    deliveryRateOnConfirmedPct: round2(deliveryRateOnConfirmedPct),
    expectedRevenuePerShipped,
    expectedFeesPerShipped,
    expectedProductAndPackPerShipped,
    expectedContributionBeforeAds,
    breakEvenCpa,
    breakEvenRoas,
    netProfitPerShipped,
    netProfitPerDelivered,
    rtoCostBurnPerDelivered,
  };
}

function diffIsoDays(earlierDate: string, laterDate: string): number | null {
  const a = Date.parse(`${earlierDate.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${laterDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / 86_400_000);
}

interface MutableBreakdown {
  key: string;
  totalOrders: number;
  deliveredOrders: number;
  rtoOrders: number;
  inTransitOrders: number;
  grossCod: number;
  actualNetPayout: number;
  leakageAmount: number;
  netProfit: number;
}

function recordBreakdown(
  map: Map<string, MutableBreakdown>,
  key: string,
  line: OrderReconciliationLine,
): void {
  const existing = map.get(key) ?? {
    key,
    totalOrders: 0,
    deliveredOrders: 0,
    rtoOrders: 0,
    inTransitOrders: 0,
    grossCod: 0,
    actualNetPayout: 0,
    leakageAmount: 0,
    netProfit: 0,
  };

  existing.totalOrders += 1;
  if (line.storeStatus === 'delivered' || line.storeStatus === 'partial_return') {
    existing.deliveredOrders += 1;
    existing.grossCod = round2(existing.grossCod + line.expectedCod);
  } else if (line.storeStatus === 'rto') {
    existing.rtoOrders += 1;
  } else if (line.storeStatus === 'in_transit') {
    existing.inTransitOrders += 1;
  }
  existing.actualNetPayout = round2(existing.actualNetPayout + line.actualNetPayout);
  existing.leakageAmount = round2(existing.leakageAmount + line.claimableVariance);
  existing.netProfit = round2(existing.netProfit + line.netProfit);
  map.set(key, existing);
}

function finalizeBreakdowns(map: Map<string, MutableBreakdown>): BreakdownMetrics[] {
  return Array.from(map.values()).map((entry) => {
    const finalizedDenominator = entry.deliveredOrders + entry.rtoOrders;
    const deliveryRatePct =
      finalizedDenominator > 0 ? round2((entry.deliveredOrders / finalizedDenominator) * 100) : 0;
    const rtoRatePct =
      finalizedDenominator > 0 ? round2((entry.rtoOrders / finalizedDenominator) * 100) : 0;

    return {
      ...entry,
      deliveryRatePct,
      rtoRatePct,
    };
  });
}

export function reconcileCodBatch(input: ReconciliationBatchInput): ReconciliationBatchResult {
  const { storeOrders, courierRows, tariff } = input;
  validateTariff(tariff);

  if (storeOrders.length === 0 && courierRows.length === 0) {
    throw new CodCheckCoreError('EMPTY_BATCH', 'Provide at least one store order or courier settlement row.');
  }

  const refDate = (input.referenceDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const defaultPack = Math.max(0, input.defaultPackagingCost ?? 0);
  const tol = Math.max(0.01, tariff.feeTolerance || 0.25);

  const courierByAwb = new Map<string, CourierSettlementRow[]>();
  for (const row of courierRows) {
    const key = row.normalizedAwb || normalizeAwb(row.awb);
    if (!key) continue;
    const bucket = courierByAwb.get(key) ?? [];
    bucket.push(row);
    courierByAwb.set(key, bucket);
  }

  const matchedKeys = new Set<string>();
  const lines: OrderReconciliationLine[] = [];
  const discrepancies: DiscrepancyItem[] = [];
  const cityMap = new Map<string, MutableBreakdown>();
  const skuMap = new Map<string, MutableBreakdown>();

  let deliveredOrders = 0;
  let rtoOrders = 0;
  let inTransitOrders = 0;
  let cancelledOrders = 0;
  let matchedOrders = 0;

  let expectedDeliveredCod = 0;
  let totalCollectedCod = 0;
  let expectedTotalFeesSum = 0;
  let chargedTotalFeesSum = 0;
  let expectedNetPayoutSum = 0;
  let actualNetPayoutSum = 0;
  let totalClaimableLeakage = 0;
  let totalOvercharges = 0;
  let missingRemittanceTotal = 0;
  let agingCodAmount = 0;
  let agingCodCount = 0;
  let totalProductCost = 0;
  let totalPackagingCost = 0;
  let totalAdSpend = 0;

  let discSeq = 1;
  const pushDisc = (item: Omit<DiscrepancyItem, 'id'>) => {
    discrepancies.push({
      id: `disc-${discSeq++}`,
      ...item,
    });
  };

  for (const order of storeOrders) {
    const key = order.normalizedAwb || normalizeAwb(order.awb);
    const settledRows = key ? courierByAwb.get(key) ?? [] : [];
    const expected = computeExpectedCourierFees(order, tariff);
    const packaging = order.packagingCost > 0 ? order.packagingCost : defaultPack;
    const effectivePack = order.status === 'cancelled' ? 0 : packaging;
    const effectiveCogs =
      order.status === 'delivered' || order.status === 'partial_return' ? order.productCost : 0;

    if (order.status === 'delivered' || order.status === 'partial_return') {
      deliveredOrders += 1;
      expectedDeliveredCod = round2(expectedDeliveredCod + order.codAmount);
    } else if (order.status === 'rto') {
      rtoOrders += 1;
    } else if (order.status === 'in_transit') {
      inTransitOrders += 1;
    } else {
      cancelledOrders += 1;
    }

    totalProductCost = round2(totalProductCost + effectiveCogs);
    totalPackagingCost = round2(totalPackagingCost + effectivePack);
    totalAdSpend = round2(totalAdSpend + order.adSpend);
    expectedTotalFeesSum = round2(expectedTotalFeesSum + expected.expectedTotalFees);

    const lineTypes: DiscrepancyType[] = [];
    let actualCollectedCod = 0;
    let chargedFees = 0;
    let actualNetPayout = 0;
    let courierStatus: CourierSettlementRow['status'] = undefined;

    if (settledRows.length > 0) {
      matchedOrders += 1;
      matchedKeys.add(key);
      courierStatus = settledRows[settledRows.length - 1]?.status;

      let actualShipping = 0;
      let actualRto = 0;
      let actualCodFee = 0;
      let actualVat = 0;
      let explicitNetTotal = 0;
      let allHaveNet = true;

      for (const sr of settledRows) {
        actualCollectedCod += Math.max(0, sr.collectedCod);
        actualShipping += Math.max(0, sr.shippingFee);
        actualRto += Math.max(0, sr.rtoFee);
        actualCodFee += Math.max(0, sr.codFee);
        actualVat += Math.max(0, sr.vatFee);
        if (typeof sr.netPayout === 'number' && Number.isFinite(sr.netPayout)) {
          explicitNetTotal += sr.netPayout;
        } else {
          allHaveNet = false;
        }
      }

      actualCollectedCod = round2(actualCollectedCod);
      actualShipping = round2(actualShipping);
      actualRto = round2(actualRto);
      actualCodFee = round2(actualCodFee);
      actualVat = round2(actualVat);
      chargedFees = round2(actualShipping + actualRto + actualCodFee + actualVat);
      actualNetPayout = allHaveNet
        ? round2(explicitNetTotal)
        : round2(actualCollectedCod - chargedFees);

      if (settledRows.length > 1) {
        lineTypes.push('duplicate_awb_settlement');
        const extraShipEst = round2(Math.max(0, actualShipping - expected.expectedShippingFee));
        pushDisc({
          type: 'duplicate_awb_settlement',
          severity: 'warning',
          awb: order.awb,
          orderId: order.orderId,
          city: order.city,
          expectedAmount: 1,
          actualAmount: settledRows.length,
          varianceAmount: extraShipEst,
          messageEn: `AWB ${order.awb} appears ${settledRows.length} times in courier settlement sheet.`,
          messageAr: `تكرار رقم البوليصة ${order.awb} عدد ${settledRows.length} مرات في كشف شركة الشحن.`,
        });
      }

      if (
        (order.status === 'delivered' || order.status === 'partial_return') &&
        order.codAmount - actualCollectedCod > tol
      ) {
        const diff = round2(order.codAmount - actualCollectedCod);
        lineTypes.push('short_cod_collected');
        totalOvercharges = round2(totalOvercharges + diff);
        pushDisc({
          type: 'short_cod_collected',
          severity: 'critical',
          awb: order.awb,
          orderId: order.orderId,
          city: order.city,
          expectedAmount: round2(order.codAmount),
          actualAmount: actualCollectedCod,
          varianceAmount: diff,
          messageEn: `Short COD collected on ${order.awb}: expected ${order.codAmount.toFixed(2)}, courier collected ${actualCollectedCod.toFixed(2)}.`,
          messageAr: `نقص تحصيل مبلغ الدفع عند الاستلام للبوليصة ${order.awb}: المتوقع ${order.codAmount.toFixed(2)} والمحصّل ${actualCollectedCod.toFixed(2)}.`,
        });
      }

      if (actualShipping - expected.expectedShippingFee > tol) {
        const diff = round2(actualShipping - expected.expectedShippingFee);
        lineTypes.push('overcharged_shipping');
        totalOvercharges = round2(totalOvercharges + diff);
        pushDisc({
          type: 'overcharged_shipping',
          severity: 'warning',
          awb: order.awb,
          orderId: order.orderId,
          city: order.city,
          expectedAmount: expected.expectedShippingFee,
          actualAmount: actualShipping,
          varianceAmount: diff,
          messageEn: `Shipping fee overcharged on ${order.awb}: billed ${actualShipping.toFixed(2)} vs contract ${expected.expectedShippingFee.toFixed(2)}.`,
          messageAr: `زيادة رسوم الشحن على البوليصة ${order.awb}: المخصوم ${actualShipping.toFixed(2)} مقابل المتفق عليه ${expected.expectedShippingFee.toFixed(2)}.`,
        });
      }

      if ((order.status === 'delivered' || order.status === 'partial_return') && actualRto > tol) {
        lineTypes.push('overcharged_rto');
        totalOvercharges = round2(totalOvercharges + actualRto);
        pushDisc({
          type: 'overcharged_rto',
          severity: 'critical',
          awb: order.awb,
          orderId: order.orderId,
          city: order.city,
          expectedAmount: 0,
          actualAmount: actualRto,
          varianceAmount: actualRto,
          messageEn: `RTO return fee (${actualRto.toFixed(2)}) charged on delivered order ${order.awb}.`,
          messageAr: `خصم رسوم مرتجع (${actualRto.toFixed(2)}) على شحنة تم تسليمها فعلاً (${order.awb}).`,
        });
      } else if (actualRto - expected.expectedRtoFee > tol) {
        const diff = round2(actualRto - expected.expectedRtoFee);
        lineTypes.push('overcharged_rto');
        totalOvercharges = round2(totalOvercharges + diff);
        pushDisc({
          type: 'overcharged_rto',
          severity: 'warning',
          awb: order.awb,
          orderId: order.orderId,
          city: order.city,
          expectedAmount: expected.expectedRtoFee,
          actualAmount: actualRto,
          varianceAmount: diff,
          messageEn: `RTO fee overcharged on ${order.awb}: billed ${actualRto.toFixed(2)} vs contract ${expected.expectedRtoFee.toFixed(2)}.`,
          messageAr: `زيادة رسوم المرتجع للبوليصة ${order.awb}: المخصوم ${actualRto.toFixed(2)} مقابل المتعاقد عليه ${expected.expectedRtoFee.toFixed(2)}.`,
        });
      }

      if (actualCodFee - expected.expectedCodFee > tol) {
        const diff = round2(actualCodFee - expected.expectedCodFee);
        lineTypes.push('overcharged_cod_fee');
        totalOvercharges = round2(totalOvercharges + diff);
        pushDisc({
          type: 'overcharged_cod_fee',
          severity: 'warning',
          awb: order.awb,
          orderId: order.orderId,
          city: order.city,
          expectedAmount: expected.expectedCodFee,
          actualAmount: actualCodFee,
          varianceAmount: diff,
          messageEn: `COD collection fee overcharged on ${order.awb}: billed ${actualCodFee.toFixed(2)} vs expected ${expected.expectedCodFee.toFixed(2)}.`,
          messageAr: `زيادة عمولة تحصيل COD للبوليصة ${order.awb}: المخصوم ${actualCodFee.toFixed(2)} مقابل المتوقع ${expected.expectedCodFee.toFixed(2)}.`,
        });
      }
    } else {
      if (order.status === 'delivered' || order.status === 'partial_return') {
        const missingPayout = round2(Math.max(0, expected.expectedNetPayout));
        lineTypes.push('missing_remittance');
        missingRemittanceTotal = round2(missingRemittanceTotal + missingPayout);
        pushDisc({
          type: 'missing_remittance',
          severity: 'critical',
          awb: order.awb,
          orderId: order.orderId,
          city: order.city,
          expectedAmount: missingPayout,
          actualAmount: 0,
          varianceAmount: missingPayout,
          messageEn: `Delivered order ${order.orderId} (${order.awb}) is missing from courier settlement sheet.`,
          messageAr: `الطلب المسلّم ${order.orderId} (${order.awb}) مفقود من كشف تحويل شركة الشحن.`,
        });
      } else if (order.status === 'in_transit' && order.shipDate) {
        const ageDays = diffIsoDays(order.shipDate, refDate);
        if (ageDays !== null && ageDays > tariff.settlementSlaDays) {
          lineTypes.push('aging_cod');
          agingCodCount += 1;
          agingCodAmount = round2(agingCodAmount + order.codAmount);
          pushDisc({
            type: 'aging_cod',
            severity: 'warning',
            awb: order.awb,
            orderId: order.orderId,
            city: order.city,
            expectedAmount: tariff.settlementSlaDays,
            actualAmount: ageDays,
            varianceAmount: round2(order.codAmount),
            messageEn: `In-transit COD shipment ${order.awb} is ${ageDays} days old (SLA: ${tariff.settlementSlaDays} days).`,
            messageAr: `شحنة معلقة منذ ${ageDays} يوماً دون تسوية (${order.awb}) وتجاوزت مهلة العقد (${tariff.settlementSlaDays} أيام).`,
          });
        }
      }
    }

    totalCollectedCod = round2(totalCollectedCod + actualCollectedCod);
    chargedTotalFeesSum = round2(chargedTotalFeesSum + chargedFees);

    const isPayableOrSettledRto =
      order.status === 'delivered' ||
      order.status === 'partial_return' ||
      (order.status === 'rto' && settledRows.length > 0);

    if (isPayableOrSettledRto) {
      expectedNetPayoutSum = round2(expectedNetPayoutSum + expected.expectedNetPayout);
    }
    actualNetPayoutSum = round2(actualNetPayoutSum + actualNetPayout);

    const rawVariance = isPayableOrSettledRto
      ? round2(Math.max(0, expected.expectedNetPayout - actualNetPayout))
      : 0;
    const claimableVariance = rawVariance > tol ? rawVariance : 0;
    totalClaimableLeakage = round2(totalClaimableLeakage + claimableVariance);

    const netProfit = round2(actualNetPayout - effectiveCogs - effectivePack - order.adSpend);

    const line: OrderReconciliationLine = {
      awb: order.awb,
      orderId: order.orderId,
      storeStatus: order.status,
      courierStatus,
      city: order.city,
      sku: order.sku,
      expectedCod: round2(order.codAmount),
      collectedCod: actualCollectedCod,
      expectedTotalFees: expected.expectedTotalFees,
      chargedTotalFees: chargedFees,
      expectedNetPayout: expected.expectedNetPayout,
      actualNetPayout,
      claimableVariance,
      productCost: effectiveCogs,
      packagingCost: effectivePack,
      adSpend: order.adSpend,
      netProfit,
      discrepancyTypes: lineTypes,
      matchedSettlementCount: settledRows.length,
    };
    lines.push(line);

    recordBreakdown(cityMap, order.city, line);
    recordBreakdown(skuMap, order.sku, line);
  }

  for (const row of courierRows) {
    const key = row.normalizedAwb || normalizeAwb(row.awb);
    if (!key || matchedKeys.has(key)) continue;

    const feesCharged = round2(row.shippingFee + row.rtoFee + row.codFee + row.vatFee);
    const rowNet =
      typeof row.netPayout === 'number' && Number.isFinite(row.netPayout)
        ? round2(row.netPayout)
        : round2(row.collectedCod - feesCharged);
    totalCollectedCod = round2(totalCollectedCod + Math.max(0, row.collectedCod));
    chargedTotalFeesSum = round2(chargedTotalFeesSum + feesCharged);
    actualNetPayoutSum = round2(actualNetPayoutSum + rowNet);

    pushDisc({
      type: 'unmatched_courier_awb',
      severity: 'warning',
      awb: row.awb,
      expectedAmount: 0,
      actualAmount: feesCharged,
      varianceAmount: feesCharged,
      messageEn: `Courier AWB ${row.awb} billed (${feesCharged.toFixed(2)} fees) does not exist in store orders export.`,
      messageAr: `البوليصة ${row.awb} مفوترة في كشف الشحن (رسوم ${feesCharged.toFixed(2)}) ولا تقابلها طلبات في المتجر.`,
    });
  }

  const finalizedDenom = deliveredOrders + rtoOrders;
  const deliveryRatePct = finalizedDenom > 0 ? round2((deliveredOrders / finalizedDenom) * 100) : 0;
  const rtoRatePct = finalizedDenom > 0 ? round2((rtoOrders / finalizedDenom) * 100) : 0;
  const estimatedNetProfit = round2(
    actualNetPayoutSum - totalProductCost - totalPackagingCost - totalAdSpend,
  );

  const byCity = finalizeBreakdowns(cityMap).sort(
    (a, b) => b.rtoRatePct - a.rtoRatePct || b.totalOrders - a.totalOrders,
  );
  const bySku = finalizeBreakdowns(skuMap).sort(
    (a, b) => b.netProfit - a.netProfit || b.totalOrders - a.totalOrders,
  );

  const summary: ReconciliationSummary = {
    totalStoreOrders: storeOrders.length,
    deliveredOrders,
    rtoOrders,
    inTransitOrders,
    cancelledOrders,
    matchedOrders,
    totalCourierRows: courierRows.length,
    deliveryRatePct,
    rtoRatePct,
    expectedDeliveredCod,
    totalCollectedCod,
    expectedTotalFees: expectedTotalFeesSum,
    chargedTotalFees: chargedTotalFeesSum,
    expectedNetPayout: expectedNetPayoutSum,
    actualNetPayout: actualNetPayoutSum,
    totalClaimableLeakage,
    totalOvercharges,
    missingRemittanceTotal,
    agingCodAmount,
    agingCodCount,
    totalProductCost,
    totalPackagingCost,
    totalAdSpend,
    estimatedNetProfit,
    discrepancyCount: discrepancies.length,
    criticalCount: discrepancies.filter((d) => d.severity === 'critical').length,
  };

  return {
    summary,
    lines,
    discrepancies,
    byCity,
    bySku,
  };
}
