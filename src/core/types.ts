export type Locale = 'ar' | 'en';

export type CurrencyCode = 'AED' | 'SAR' | 'EGP' | 'USD';

export type StorePlatform = 'salla' | 'shopify' | 'easyorders' | 'woocommerce' | 'custom';

export type CourierProvider = 'aramex' | 'smsa' | 'bosta' | 'naqel' | 'custom';

export type OrderStatus = 'delivered' | 'rto' | 'in_transit' | 'cancelled' | 'partial_return';

export type DiscrepancyType =
  | 'missing_remittance'
  | 'short_cod_collected'
  | 'overcharged_shipping'
  | 'overcharged_rto'
  | 'overcharged_cod_fee'
  | 'aging_cod'
  | 'duplicate_awb_settlement'
  | 'unmatched_courier_awb';

export type DiscrepancySeverity = 'critical' | 'warning' | 'info';

export interface TariffRule {
  shippingFee: number;
  rtoFee: number;
  codFeePercent: number;
  codFeeFixed: number;
  vatOnFeesPercent: number;
  settlementSlaDays: number;
  feeTolerance: number;
}

export interface StoreColumnMapping {
  awb: string;
  orderId?: string;
  status: string;
  codAmount: string;
  city?: string;
  sku?: string;
  productCost?: string;
  packagingCost?: string;
  adSpend?: string;
  shipDate?: string;
}

export interface CourierColumnMapping {
  awb: string;
  status?: string;
  collectedCod: string;
  shippingFee: string;
  rtoFee?: string;
  codFee?: string;
  vatFee?: string;
  netPayout?: string;
  settlementDate?: string;
}

export interface StoreOrderRow {
  awb: string;
  normalizedAwb?: string;
  orderId: string;
  status: OrderStatus;
  codAmount: number;
  city: string;
  sku: string;
  productCost: number;
  packagingCost: number;
  adSpend: number;
  shipDate: string;
}

export interface CourierSettlementRow {
  awb: string;
  normalizedAwb?: string;
  status?: OrderStatus;
  collectedCod: number;
  shippingFee: number;
  rtoFee: number;
  codFee: number;
  vatFee: number;
  netPayout?: number;
  settlementDate?: string;
}

export interface ExpectedFeeBreakdown {
  expectedShippingFee: number;
  expectedRtoFee: number;
  expectedCodFee: number;
  expectedVat: number;
  expectedTotalFees: number;
  expectedNetPayout: number;
}

export interface DiscrepancyItem {
  id: string;
  type: DiscrepancyType;
  severity: DiscrepancySeverity;
  awb: string;
  orderId?: string;
  city?: string;
  expectedAmount: number;
  actualAmount: number;
  varianceAmount: number;
  messageEn: string;
  messageAr: string;
}

export interface OrderReconciliationLine {
  awb: string;
  orderId: string;
  storeStatus: OrderStatus;
  courierStatus?: OrderStatus;
  city: string;
  sku: string;
  expectedCod: number;
  collectedCod: number;
  expectedTotalFees: number;
  chargedTotalFees: number;
  expectedNetPayout: number;
  actualNetPayout: number;
  claimableVariance: number;
  productCost: number;
  packagingCost: number;
  adSpend: number;
  netProfit: number;
  discrepancyTypes: DiscrepancyType[];
  matchedSettlementCount: number;
}

export interface BreakdownMetrics {
  key: string;
  totalOrders: number;
  deliveredOrders: number;
  rtoOrders: number;
  inTransitOrders: number;
  deliveryRatePct: number;
  rtoRatePct: number;
  grossCod: number;
  actualNetPayout: number;
  leakageAmount: number;
  netProfit: number;
}

export interface ReconciliationSummary {
  totalStoreOrders: number;
  deliveredOrders: number;
  rtoOrders: number;
  inTransitOrders: number;
  cancelledOrders: number;
  matchedOrders: number;
  totalCourierRows: number;
  deliveryRatePct: number;
  rtoRatePct: number;
  expectedDeliveredCod: number;
  totalCollectedCod: number;
  expectedTotalFees: number;
  chargedTotalFees: number;
  expectedNetPayout: number;
  actualNetPayout: number;
  totalClaimableLeakage: number;
  totalOvercharges: number;
  missingRemittanceTotal: number;
  agingCodAmount: number;
  agingCodCount: number;
  totalProductCost: number;
  totalPackagingCost: number;
  totalAdSpend: number;
  estimatedNetProfit: number;
  discrepancyCount: number;
  criticalCount: number;
}

export interface CodUnitEconomicsInput {
  sellingPrice: number;
  cogsPerUnit: number;
  packagingCost: number;
  shippingFee: number;
  rtoFee: number;
  codFeePercent: number;
  codFeeFixed: number;
  vatOnFeesPercent: number;
  confirmationRatePct?: number;
  deliveryRatePct: number;
  adCpaActual?: number;
}

export interface CodUnitEconomicsResult {
  effectiveRtoRatePct: number;
  deliveryRateOnConfirmedPct: number;
  expectedRevenuePerShipped: number;
  expectedFeesPerShipped: number;
  expectedProductAndPackPerShipped: number;
  expectedContributionBeforeAds: number;
  breakEvenCpa: number;
  breakEvenRoas: number | null;
  netProfitPerShipped: number;
  netProfitPerDelivered: number;
  rtoCostBurnPerDelivered: number;
}

export interface ReconciliationBatchInput {
  storeOrders: StoreOrderRow[];
  courierRows: CourierSettlementRow[];
  tariff: TariffRule;
  referenceDate?: string;
  defaultPackagingCost?: number;
}

export interface ReconciliationBatchResult {
  summary: ReconciliationSummary;
  lines: OrderReconciliationLine[];
  discrepancies: DiscrepancyItem[];
  byCity: BreakdownMetrics[];
  bySku: BreakdownMetrics[];
}

export interface ReconciliationAuditRun {
  id: string;
  slug: string;
  auditNumber?: string;
  presetId?: string;
  defaultLocale: Locale;
  title: string;
  titleAr: string;
  storeName: string;
  courierName: string;
  platform: StorePlatform;
  courier: CourierProvider;
  currency: CurrencyCode;
  referenceDate: string;
  tariff: TariffRule;
  summary: ReconciliationSummary;
  lines: OrderReconciliationLine[];
  discrepancies: DiscrepancyItem[];
  byCity: BreakdownMetrics[];
  bySku: BreakdownMetrics[];
  unitEconomics: CodUnitEconomicsResult;
  storeCsvSample?: string;
  courierCsvSample?: string;
  scopeDigestHex?: string;
  status: 'draft' | 'locked';
  createdAt: string;
  updatedAt: string;
}
