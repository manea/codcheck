import type {
  CourierColumnMapping,
  CourierSettlementRow,
  CurrencyCode,
  DiscrepancyItem,
  Locale,
  OrderStatus,
  StoreColumnMapping,
  StoreOrderRow,
} from './types.ts';

const ARABIC_INDIC_MAP: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

export function toAsciiDigits(value: string): string {
  return String(value ?? '').replace(/[٠-٩۰-۹]/g, (ch) => ARABIC_INDIC_MAP[ch] ?? ch);
}

function detectDelimiter(headerSample: string): ',' | ';' | '\t' {
  const candidates: Array<',' | ';' | '\t'> = [',', ';', '\t'];
  const counts: Record<',' | ';' | '\t', number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;

  for (let i = 0; i < headerSample.length; i++) {
    const ch = headerSample[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes) {
      if (ch === '\n' || ch === '\r') break;
      if (ch === ',' || ch === ';' || ch === '\t') {
        counts[ch] += 1;
      }
    }
  }

  let best: ',' | ';' | '\t' = ',';
  for (const delim of candidates) {
    if (counts[delim] > counts[best]) {
      best = delim;
    }
  }
  return best;
}

export function parseDelimitedText(rawText: string): {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: ',' | ';' | '\t';
} {
  const cleaned = String(rawText ?? '').replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(cleaned);

  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      row.push(cell);
      matrix.push(row);
      row = [];
      cell = '';
      if (cleaned[i + 1] === '\n') {
        i += 1;
      }
    } else if (ch === '\n') {
      row.push(cell);
      matrix.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    matrix.push(row);
  }

  const nonEmptyRows = matrix.filter((r) => r.some((c) => c.trim().length > 0));
  if (nonEmptyRows.length === 0) {
    return { headers: [], rows: [], delimiter };
  }

  const rawHeaders = nonEmptyRows[0] ?? [];
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h, idx) => {
    const base = h.trim() || `column_${idx + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < nonEmptyRows.length; r++) {
    const lineCells = nonEmptyRows[r] ?? [];
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c]!;
      obj[key] = (lineCells[c] ?? '').trim();
    }
    rows.push(obj);
  }

  return { headers, rows, delimiter };
}

export function normalizeAwb(value: string): string {
  const ascii = toAsciiDigits(String(value ?? '').trim());
  return ascii.replace(/^[#\s]+/, '').replace(/[\s\-_/]+/g, '').toUpperCase();
}

export function parseMoneyCell(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const raw = toAsciiDigits(String(value ?? '').trim());
  if (!raw) return 0;

  let negative = false;
  let cleaned = raw
    .replace(/(AED|SAR|EGP|USD|د\.إ|ر\.س|ج\.م|ريال|درهم|جنيه|\$)/gi, '')
    .trim();

  if (/^\(.*\)$/.test(cleaned)) {
    negative = true;
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (cleaned.startsWith('-')) {
    negative = true;
    cleaned = cleaned.slice(1).trim();
  }

  cleaned = cleaned
    .replace(/٫/g, '.')
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '');

  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  const result = negative ? -Math.abs(parsed) : parsed;
  return Object.is(result, -0) ? 0 : result;
}

export function normalizeOrderStatus(value: string): OrderStatus {
  const normalized = toAsciiDigits(String(value ?? '').trim().toLowerCase());
  if (!normalized) return 'in_transit';

  if (
    normalized.includes('partial') ||
    normalized.includes('مرتجع جزئي') ||
    normalized.includes('تسليم جزئي')
  ) {
    return 'partial_return';
  }
  if (
    normalized === 'rto' ||
    normalized.includes('return') ||
    normalized.includes('refused') ||
    normalized.includes('rejected') ||
    normalized.includes('failed') ||
    normalized.includes('undelivered') ||
    normalized.includes('مرتجع') ||
    normalized.includes('مرتد') ||
    normalized.includes('رافض') ||
    normalized.includes('فشل التسليم') ||
    normalized.includes('رجيع')
  ) {
    return 'rto';
  }
  if (
    normalized.includes('delivered') ||
    normalized.includes('completed') ||
    normalized.includes('settled') ||
    normalized.includes('تم التسليم') ||
    normalized.includes('مسلم') ||
    normalized.includes('مكتمل') ||
    normalized.includes('تم التوصيل')
  ) {
    return 'delivered';
  }
  if (
    normalized.includes('cancel') ||
    normalized.includes('void') ||
    normalized.includes('ملغي') ||
    normalized.includes('تم الإلغاء')
  ) {
    return 'cancelled';
  }
  return 'in_transit';
}

function matchHeader(headers: string[], aliases: string[]): string | undefined {
  const lowerMap = headers.map((h) => ({
    raw: h,
    norm: h
      .trim()
      .toLowerCase()
      .replace(/[_\-]+/g, ' ')
      .replace(/\s+/g, ' '),
  }));

  for (const alias of aliases) {
    const exact = lowerMap.find((entry) => entry.norm === alias);
    if (exact) return exact.raw;
  }
  for (const alias of aliases) {
    const partial = lowerMap.find((entry) => entry.norm.includes(alias));
    if (partial) return partial.raw;
  }
  return undefined;
}

export function autoDetectStoreMapping(headers: string[]): StoreColumnMapping {
  return {
    awb:
      matchHeader(headers, [
        'awb',
        'tracking number',
        'tracking_number',
        'tracking',
        'waybill',
        'رقم البوليصة',
        'رقم التتبع',
        'البوليصة',
        'رقم الشحنة',
      ]) ?? headers[0] ?? 'awb',
    orderId: matchHeader(headers, [
      'order id',
      'order_id',
      'order number',
      'name',
      'رقم الطلب',
      'مرجع الطلب',
    ]),
    status:
      matchHeader(headers, [
        'status',
        'order status',
        'fulfillment status',
        'حالة الطلب',
        'الحالة',
        'حالة الشحنة',
      ]) ?? 'status',
    codAmount:
      matchHeader(headers, [
        'cod amount',
        'cod_amount',
        'total',
        'order total',
        'amount',
        'قيمة الدفع عند الاستلام',
        'الإجمالي',
        'مبلغ التحصيل',
        'المبلغ المطلوب',
      ]) ?? 'cod_amount',
    city: matchHeader(headers, ['city', 'governorate', 'emirate', 'المدينة', 'المحافظة', 'الإمارة']),
    sku: matchHeader(headers, ['sku', 'product', 'item', 'المنتج', 'رمز المنتج']),
    productCost: matchHeader(headers, ['cogs', 'product cost', 'cost', 'التكلفة', 'تكلفة المنتج']),
    packagingCost: matchHeader(headers, ['packaging', 'pack cost', 'التغليف', 'تكلفة التغليف']),
    adSpend: matchHeader(headers, ['ad spend', 'cpa', 'ads', 'تكلفة الإعلان', 'الإعلان']),
    shipDate: matchHeader(headers, [
      'ship date',
      'created at',
      'order date',
      'تاريخ الشحن',
      'تاريخ الطلب',
      'التاريخ',
    ]),
  };
}

export function autoDetectCourierMapping(headers: string[]): CourierColumnMapping {
  return {
    awb:
      matchHeader(headers, [
        'awb',
        'tracking',
        'waybill',
        'shipment number',
        'رقم البوليصة',
        'رقم الشحنة',
        'رقم التتبع',
        'البوليصة',
      ]) ?? headers[0] ?? 'awb',
    status: matchHeader(headers, [
      'status',
      'delivery status',
      'courier status',
      'حالة الشحنة',
      'الحالة',
      'حالة التسليم',
    ]),
    collectedCod:
      matchHeader(headers, [
        'collected cod',
        'cod collected',
        'cash collected',
        'collected amount',
        'cod',
        'المبلغ المحصل',
        'قيمة التحصيل',
        'التحصيل الفعلي',
      ]) ?? 'collected_cod',
    shippingFee:
      matchHeader(headers, [
        'shipping fee',
        'delivery fee',
        'freight',
        'رسوم الشحن',
        'تكلفة الشحن',
        'أجرة التوصيل',
      ]) ?? 'shipping_fee',
    rtoFee: matchHeader(headers, ['rto fee', 'return fee', 'رسوم المرتجع', 'رسوم الإرجاع']),
    codFee: matchHeader(headers, ['cod fee', 'collection fee', 'رسوم التحصيل', 'عمولة الدفع عند الاستلام']),
    vatFee: matchHeader(headers, ['vat', 'tax', 'ضريبة القيمة المضافة', 'الضريبة']),
    netPayout: matchHeader(headers, ['net payout', 'net remitted', 'net amount', 'صافي التحويل', 'صافي المستحق']),
    settlementDate: matchHeader(headers, ['settlement date', 'remittance date', 'تاريخ التسوية', 'تاريخ التحويل']),
  };
}

export function mapStoreRows(
  rows: Record<string, string>[],
  mapping: StoreColumnMapping,
  defaults: { defaultPackagingCost?: number; defaultShipDate?: string } = {},
): StoreOrderRow[] {
  const defaultPack = Number.isFinite(defaults.defaultPackagingCost)
    ? Math.max(0, defaults.defaultPackagingCost ?? 0)
    : 0;
  const fallbackDate = defaults.defaultShipDate ?? '';

  const mapped: StoreOrderRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rawAwb = (row[mapping.awb] ?? '').trim();
    const orderId = (mapping.orderId ? row[mapping.orderId] : '')?.trim() || rawAwb || `ORD-${i + 1}`;
    const awb = rawAwb || orderId;
    if (!awb) continue;

    mapped.push({
      awb,
      normalizedAwb: normalizeAwb(awb),
      orderId,
      status: normalizeOrderStatus(row[mapping.status] ?? ''),
      codAmount: Math.max(0, parseMoneyCell(row[mapping.codAmount])),
      city: (mapping.city ? row[mapping.city] : '')?.trim() || 'Unspecified',
      sku: (mapping.sku ? row[mapping.sku] : '')?.trim() || 'SKU-DEFAULT',
      productCost: Math.max(0, mapping.productCost ? parseMoneyCell(row[mapping.productCost]) : 0),
      packagingCost:
        mapping.packagingCost && (row[mapping.packagingCost] ?? '').trim() !== ''
          ? Math.max(0, parseMoneyCell(row[mapping.packagingCost]))
          : defaultPack,
      adSpend: Math.max(0, mapping.adSpend ? parseMoneyCell(row[mapping.adSpend]) : 0),
      shipDate: (mapping.shipDate ? row[mapping.shipDate] : '')?.trim() || fallbackDate,
    });
  }
  return mapped;
}

export function mapCourierRows(
  rows: Record<string, string>[],
  mapping: CourierColumnMapping,
): CourierSettlementRow[] {
  const mapped: CourierSettlementRow[] = [];
  for (const row of rows) {
    const rawAwb = (row[mapping.awb] ?? '').trim();
    if (!rawAwb) continue;

    const netRaw = mapping.netPayout ? (row[mapping.netPayout] ?? '').trim() : '';
    mapped.push({
      awb: rawAwb,
      normalizedAwb: normalizeAwb(rawAwb),
      status: mapping.status ? normalizeOrderStatus(row[mapping.status] ?? '') : undefined,
      collectedCod: Math.max(0, parseMoneyCell(row[mapping.collectedCod])),
      shippingFee: Math.max(0, parseMoneyCell(row[mapping.shippingFee])),
      rtoFee: Math.max(0, mapping.rtoFee ? parseMoneyCell(row[mapping.rtoFee]) : 0),
      codFee: Math.max(0, mapping.codFee ? parseMoneyCell(row[mapping.codFee]) : 0),
      vatFee: Math.max(0, mapping.vatFee ? parseMoneyCell(row[mapping.vatFee]) : 0),
      netPayout: netRaw !== '' ? parseMoneyCell(netRaw) : undefined,
      settlementDate: mapping.settlementDate ? (row[mapping.settlementDate] ?? '').trim() : undefined,
    });
  }
  return mapped;
}

function escapeSafeCsvCell(value: unknown): string {
  let str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportDiscrepanciesToCsv(
  discrepancies: DiscrepancyItem[],
  currency: CurrencyCode,
  locale: Locale,
): string {
  const header =
    locale === 'ar'
      ? [
          'رقم البوليصة',
          'رقم الطلب',
          'النوع',
          'الشدة',
          'المدينة',
          `المتوقع (${currency})`,
          `الفعلي (${currency})`,
          `الفرق المستحق (${currency})`,
          'التفاصيل',
        ]
      : [
          'AWB',
          'Order ID',
          'Type',
          'Severity',
          'City',
          `Expected (${currency})`,
          `Actual (${currency})`,
          `Variance (${currency})`,
          'Details',
        ];

  const lines = [header.map(escapeSafeCsvCell).join(',')];
  for (const item of discrepancies) {
    lines.push(
      [
        item.awb,
        item.orderId ?? '',
        item.type,
        item.severity,
        item.city ?? '',
        item.expectedAmount.toFixed(2),
        item.actualAmount.toFixed(2),
        item.varianceAmount.toFixed(2),
        locale === 'ar' ? item.messageAr : item.messageEn,
      ]
        .map(escapeSafeCsvCell)
        .join(','),
    );
  }

  return `\uFEFF${lines.join('\r\n')}`;
}
