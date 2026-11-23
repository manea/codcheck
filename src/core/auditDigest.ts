import type { Locale, ReconciliationAuditRun } from './types.ts';

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export function buildAuditCanonicalText(
  run: Pick<
    ReconciliationAuditRun,
    | 'id'
    | 'slug'
    | 'storeName'
    | 'courierName'
    | 'currency'
    | 'referenceDate'
    | 'tariff'
    | 'summary'
    | 'discrepancies'
  >,
): string {
  const sortedDiscs = [...run.discrepancies]
    .sort((a, b) => a.awb.localeCompare(b.awb) || a.type.localeCompare(b.type))
    .map(
      (d) =>
        `${d.type}|${d.severity}|${d.awb}|${d.expectedAmount.toFixed(2)}|${d.actualAmount.toFixed(2)}|${d.varianceAmount.toFixed(2)}`,
    );

  return JSON.stringify({
    id: run.id,
    slug: run.slug,
    storeName: run.storeName,
    courierName: run.courierName,
    currency: run.currency,
    referenceDate: run.referenceDate,
    tariff: {
      shippingFee: run.tariff.shippingFee,
      rtoFee: run.tariff.rtoFee,
      codFeePercent: run.tariff.codFeePercent,
      codFeeFixed: run.tariff.codFeeFixed,
      vatOnFeesPercent: run.tariff.vatOnFeesPercent,
      settlementSlaDays: run.tariff.settlementSlaDays,
      feeTolerance: run.tariff.feeTolerance,
    },
    summary: {
      totalStoreOrders: run.summary.totalStoreOrders,
      deliveredOrders: run.summary.deliveredOrders,
      rtoOrders: run.summary.rtoOrders,
      expectedNetPayout: run.summary.expectedNetPayout,
      actualNetPayout: run.summary.actualNetPayout,
      totalClaimableLeakage: run.summary.totalClaimableLeakage,
      missingRemittanceTotal: run.summary.missingRemittanceTotal,
      totalOvercharges: run.summary.totalOvercharges,
    },
    discrepancies: sortedDiscs,
  });
}

export async function computeAuditDigestHex(
  run: Pick<
    ReconciliationAuditRun,
    | 'id'
    | 'slug'
    | 'storeName'
    | 'courierName'
    | 'currency'
    | 'referenceDate'
    | 'tariff'
    | 'summary'
    | 'discrepancies'
  >,
): Promise<string> {
  const canonical = buildAuditCanonicalText(run);
  const encoded = new TextEncoder().encode(canonical);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return toHex(digest);
}

export async function verifyAuditIntegrity(run: ReconciliationAuditRun): Promise<{
  valid: boolean;
  expectedDigest: string;
  actualDigest: string;
}> {
  const expectedDigest = String(run.scopeDigestHex ?? '').trim().toLowerCase();
  const actualDigest = await computeAuditDigestHex(run);
  return {
    valid: /^[0-9a-f]{64}$/.test(expectedDigest) && expectedDigest === actualDigest,
    expectedDigest,
    actualDigest,
  };
}

export function buildCourierDisputeMessage(run: ReconciliationAuditRun, locale: Locale): string {
  const actionable = run.discrepancies.filter(
    (d) => d.varianceAmount > 0 && d.type !== 'aging_cod',
  );
  const topLines = actionable.slice(0, 12).map((d, idx) => {
    const label = locale === 'ar' ? d.messageAr : d.messageEn;
    return `${idx + 1}. AWB ${d.awb} (${d.varianceAmount.toFixed(2)} ${run.currency}) — ${label}`;
  });
  const moreCount = Math.max(0, actionable.length - topLines.length);
  const auditRef = run.auditNumber || run.slug;

  if (locale === 'ar') {
    const rowsBlock = topLines.length > 0 ? topLines.join('\n') : 'لا توجد فروقات مالية مستحقة.';
    const moreLine = moreCount > 0 ? `\n... بالإضافة إلى ${moreCount} بند/بوالص أخرى في التقرير المرفق.` : '';
    return [
      `السلام عليكم فريق المالية في ${run.courierName}،`,
      `مرفق ملخص مراجعة تسوية الدفع عند الاستلام (${auditRef}) لمتجر ${run.storeName} حتى تاريخ ${run.referenceDate}:`,
      `- إجمالي الفروقات والتحويلات المفقودة المستحقة للمطالبة: ${run.summary.totalClaimableLeakage.toFixed(2)} ${run.currency}`,
      `- تحويلات طلبات مسلّمة مفقودة: ${run.summary.missingRemittanceTotal.toFixed(2)} ${run.currency}`,
      `- خصومات رسوم/تحصيل زائدة عن العقد: ${run.summary.totalOvercharges.toFixed(2)} ${run.currency}`,
      '',
      'تفاصيل البوالص المتضررة:',
      rowsBlock + moreLine,
      '',
      'يرجى مراجعة البنود أعلاه وإدراج التسوية التصحيحية في كشف التحويل القادم.',
    ].join('\n');
  }

  const rowsBlock = topLines.length > 0 ? topLines.join('\n') : 'No claimable financial discrepancies.';
  const moreLine = moreCount > 0 ? `\n... plus ${moreCount} additional AWB discrepancy lines in the attached report.` : '';
  return [
    `Hello ${run.courierName} Finance & Settlements Team,`,
    `Please find COD settlement audit claim ${auditRef} for ${run.storeName} (as of ${run.referenceDate}):`,
    `- Total Claimable Leakage: ${run.summary.totalClaimableLeakage.toFixed(2)} ${run.currency}`,
    `- Missing Delivered Remittances: ${run.summary.missingRemittanceTotal.toFixed(2)} ${run.currency}`,
    `- Contract Fee / COD Shortfall Overcharges: ${run.summary.totalOvercharges.toFixed(2)} ${run.currency}`,
    '',
    'Itemized AWBs:',
    rowsBlock + moreLine,
    '',
    'Kindly verify and process the adjustment on the next remittance batch.',
  ].join('\n');
}
