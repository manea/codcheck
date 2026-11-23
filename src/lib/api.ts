import {
  buildCourierDisputeMessage,
  computeAuditDigestHex,
} from '../core/auditDigest.ts';
import {
  autoDetectCourierMapping,
  autoDetectStoreMapping,
  exportDiscrepanciesToCsv,
  mapCourierRows,
  mapStoreRows,
  parseDelimitedText,
} from '../core/csvParser.ts';
import {
  CODCHECK_PRESETS,
  createAuditFromPreset,
  type CodCheckPresetMeta,
} from '../core/presets.ts';
import {
  computeCodUnitEconomics,
  reconcileCodBatch,
  round2,
  validateTariff,
} from '../core/reconcile.ts';
import type {
  CourierColumnMapping,
  CourierProvider,
  CurrencyCode,
  Locale,
  ReconciliationAuditRun,
  StoreColumnMapping,
  StorePlatform,
  TariffRule,
} from '../core/types.ts';
import { withBase } from './basePath.ts';

export interface PresetSummary {
  id: CodCheckPresetMeta['id'];
  nameEn: string;
  nameAr: string;
  badgeEn: string;
  badgeAr: string;
  currency: CurrencyCode;
  platform: StorePlatform;
  courier: CourierProvider;
  defaultLocale: Locale;
  tariff: TariffRule;
}

export interface AuditListRecord {
  id: string;
  slug: string;
  auditNumber: string | null;
  status: 'draft' | 'locked';
  currency: CurrencyCode;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  audit: ReconciliationAuditRun;
}

export interface AuditStats {
  totalAudits: number;
  draftAudits: number;
  lockedAudits: number;
  tariffProfilesCount: number;
}

export interface AuditBundle {
  audit: ReconciliationAuditRun;
  viewCount: number;
  publicReportUrl?: string;
  disputeMessageAr?: string;
  disputeMessageEn?: string;
}

export interface CreateCsvAuditPayload {
  title: string;
  titleAr?: string;
  storeName: string;
  courierName: string;
  platform: StorePlatform;
  courier: CourierProvider;
  currency: CurrencyCode;
  defaultLocale: Locale;
  referenceDate: string;
  tariff: TariffRule;
  storeCsv: string;
  courierCsv: string;
  storeMapping?: Partial<StoreColumnMapping>;
  courierMapping?: Partial<CourierColumnMapping>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const LOCAL_STORE_KEY = 'codcheck_local_store_v1';

interface LocalStoreState {
  seqByYear: Record<string, number>;
  audits: Array<{ audit: ReconciliationAuditRun; viewCount: number }>;
}

function readLocalStore(): LocalStoreState {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalStoreState;
      if (parsed && Array.isArray(parsed.audits)) {
        return {
          seqByYear: parsed.seqByYear || {},
          audits: parsed.audits,
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  return { seqByYear: {}, audits: [] };
}

function writeLocalStore(state: LocalStoreState): void {
  try {
    window.localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

function buildLocalStats(state: LocalStoreState): AuditStats {
  let draftAudits = 0;
  let lockedAudits = 0;
  for (const item of state.audits) {
    if (item.audit.status === 'locked') lockedAudits += 1;
    else draftAudits += 1;
  }
  return {
    totalAudits: state.audits.length,
    draftAudits,
    lockedAudits,
    tariffProfilesCount: 0,
  };
}

async function requestJson<T>(apiPath: string, init?: RequestInit): Promise<T> {
  const res = await fetch(withBase(apiPath), init);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new ApiError('API unavailable (static demo mode)', 404, 'STATIC_MODE');
  }
  const data = (await res.json()) as T & { error?: string; code?: string };
  if (!res.ok) {
    throw new ApiError(data.error || `HTTP ${res.status}`, res.status, data.code);
  }
  return data;
}

function shouldFallback(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 404 && err.code === 'STATIC_MODE';
  }
  return err instanceof TypeError;
}

export async function fetchPresets(): Promise<PresetSummary[]> {
  try {
    const data = await requestJson<{ presets: PresetSummary[] }>('/api/presets');
    return data.presets;
  } catch (err) {
    if (!shouldFallback(err)) throw err;
    return CODCHECK_PRESETS.map(
      ({ id, nameEn, nameAr, badgeEn, badgeAr, currency, platform, courier, defaultLocale, tariff }) => ({
        id,
        nameEn,
        nameAr,
        badgeEn,
        badgeAr,
        currency,
        platform,
        courier,
        defaultLocale,
        tariff,
      }),
    );
  }
}

export async function listAudits(): Promise<{ audits: AuditListRecord[]; stats: AuditStats }> {
  try {
    return await requestJson<{ audits: AuditListRecord[]; stats: AuditStats }>('/api/audits');
  } catch (err) {
    if (!shouldFallback(err)) throw err;
    const state = readLocalStore();
    const audits: AuditListRecord[] = [...state.audits]
      .sort((a, b) => b.audit.updatedAt.localeCompare(a.audit.updatedAt))
      .map((entry) => ({
        id: entry.audit.id,
        slug: entry.audit.slug,
        auditNumber: entry.audit.auditNumber ?? null,
        status: entry.audit.status,
        currency: entry.audit.currency,
        viewCount: entry.viewCount,
        createdAt: entry.audit.createdAt,
        updatedAt: entry.audit.updatedAt,
        audit: entry.audit,
      }));
    return { audits, stats: buildLocalStats(state) };
  }
}

export async function createAuditFromPresetApi(
  presetId: CodCheckPresetMeta['id'],
): Promise<AuditBundle> {
  try {
    return await requestJson<AuditBundle>('/api/audits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetId }),
    });
  } catch (err) {
    if (!shouldFallback(err)) throw err;
    const audit = createAuditFromPreset(presetId);
    const state = readLocalStore();
    state.audits.unshift({ audit, viewCount: 0 });
    writeLocalStore(state);
    return { audit, viewCount: 0 };
  }
}

export async function createCsvAuditApi(payload: CreateCsvAuditPayload): Promise<AuditBundle> {
  try {
    return await requestJson<AuditBundle>('/api/audits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    if (!shouldFallback(err)) throw err;
    validateTariff(payload.tariff);
    const parsedStore = parseDelimitedText(payload.storeCsv);
    const storeMap = { ...autoDetectStoreMapping(parsedStore.headers), ...payload.storeMapping };
    const storeOrders = mapStoreRows(parsedStore.rows, storeMap, {
      defaultShipDate: payload.referenceDate,
    });
    const parsedCourier = parseDelimitedText(payload.courierCsv);
    const courierMap = {
      ...autoDetectCourierMapping(parsedCourier.headers),
      ...payload.courierMapping,
    };
    const courierRows = mapCourierRows(parsedCourier.rows, courierMap);
    const reconciled = reconcileCodBatch({
      storeOrders,
      courierRows,
      tariff: payload.tariff,
      referenceDate: payload.referenceDate,
    });
    const deliveredOrRto = reconciled.summary.deliveredOrders + reconciled.summary.rtoOrders;
    const deliveryRatePct = deliveredOrRto > 0 ? reconciled.summary.deliveryRatePct : 75;
    const avgSelling =
      storeOrders.length > 0
        ? round2(storeOrders.reduce((s, o) => s + o.codAmount, 0) / storeOrders.length)
        : 200;
    const avgCogs =
      storeOrders.length > 0
        ? round2(storeOrders.reduce((s, o) => s + o.productCost, 0) / storeOrders.length)
        : 50;
    const avgAd =
      storeOrders.length > 0
        ? round2(storeOrders.reduce((s, o) => s + o.adSpend, 0) / storeOrders.length)
        : 0;
    const unitEconomics = computeCodUnitEconomics({
      sellingPrice: avgSelling,
      cogsPerUnit: avgCogs,
      packagingCost: 0,
      shippingFee: payload.tariff.shippingFee,
      rtoFee: payload.tariff.rtoFee,
      codFeePercent: payload.tariff.codFeePercent,
      codFeeFixed: payload.tariff.codFeeFixed,
      vatOnFeesPercent: payload.tariff.vatOnFeesPercent,
      deliveryRatePct,
      adCpaActual: avgAd,
    });
    const now = new Date().toISOString();
    const rand = Math.random().toString(36).slice(2, 7);
    const audit: ReconciliationAuditRun = {
      id: `aud-${Date.now().toString(36)}-${rand}`,
      slug: `audit-${rand}`,
      defaultLocale: payload.defaultLocale,
      title: payload.title,
      titleAr: payload.titleAr || payload.title,
      storeName: payload.storeName,
      courierName: payload.courierName,
      platform: payload.platform,
      courier: payload.courier,
      currency: payload.currency,
      referenceDate: payload.referenceDate,
      tariff: { ...payload.tariff },
      summary: reconciled.summary,
      lines: reconciled.lines,
      discrepancies: reconciled.discrepancies,
      byCity: reconciled.byCity,
      bySku: reconciled.bySku,
      unitEconomics,
      storeCsvSample: payload.storeCsv,
      courierCsvSample: payload.courierCsv,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
    const state = readLocalStore();
    state.audits.unshift({ audit, viewCount: 0 });
    writeLocalStore(state);
    return { audit, viewCount: 0 };
  }
}

export async function getAudit(id: string): Promise<AuditBundle> {
  try {
    return await requestJson<AuditBundle>(`/api/audits/${encodeURIComponent(id)}`);
  } catch (err) {
    if (!shouldFallback(err)) throw err;
    const state = readLocalStore();
    const found = state.audits.find((entry) => entry.audit.id === id);
    if (!found) throw new ApiError('Audit not found', 404);
    return found;
  }
}

export async function patchAuditTariffApi(
  id: string,
  tariff: TariffRule,
): Promise<AuditBundle> {
  try {
    return await requestJson<AuditBundle>(`/api/audits/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tariff }),
    });
  } catch (err) {
    if (!shouldFallback(err)) throw err;
    validateTariff(tariff);
    const state = readLocalStore();
    const idx = state.audits.findIndex((e) => e.audit.id === id);
    if (idx === -1) throw new ApiError('Audit not found', 404);
    const cur = state.audits[idx]!;
    if (cur.audit.status === 'locked') {
      throw new ApiError('Audit is locked', 409, 'AUDIT_LOCKED');
    }
    const parsedStore = parseDelimitedText(cur.audit.storeCsvSample || '');
    const storeOrders = mapStoreRows(parsedStore.rows, autoDetectStoreMapping(parsedStore.headers), {
      defaultShipDate: cur.audit.referenceDate,
    });
    const parsedCourier = parseDelimitedText(cur.audit.courierCsvSample || '');
    const courierRows = mapCourierRows(
      parsedCourier.rows,
      autoDetectCourierMapping(parsedCourier.headers),
    );
    const reconciled = reconcileCodBatch({
      storeOrders,
      courierRows,
      tariff,
      referenceDate: cur.audit.referenceDate,
    });
    const updatedAudit: ReconciliationAuditRun = {
      ...cur.audit,
      tariff: { ...tariff },
      summary: reconciled.summary,
      lines: reconciled.lines,
      discrepancies: reconciled.discrepancies,
      byCity: reconciled.byCity,
      bySku: reconciled.bySku,
      updatedAt: new Date().toISOString(),
    };
    state.audits[idx] = { audit: updatedAudit, viewCount: cur.viewCount };
    writeLocalStore(state);
    return state.audits[idx]!;
  }
}

export async function finalizeAuditApi(id: string): Promise<AuditBundle> {
  try {
    return await requestJson<AuditBundle>(`/api/audits/${encodeURIComponent(id)}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'merchant' }),
    });
  } catch (err) {
    if (!shouldFallback(err)) throw err;
    const state = readLocalStore();
    const idx = state.audits.findIndex((e) => e.audit.id === id);
    if (idx === -1) throw new ApiError('Audit not found', 404);
    const cur = state.audits[idx]!;
    if (cur.audit.status === 'locked') {
      throw new ApiError('Audit already finalized', 409, 'ALREADY_LOCKED');
    }
    const year = String(new Date().getUTCFullYear());
    const nextSeq = (state.seqByYear[year] || 0) + 1;
    state.seqByYear[year] = nextSeq;
    const auditNumber = `COD-${year}-${String(nextSeq).padStart(4, '0')}`;
    const scopeDigestHex = await computeAuditDigestHex(cur.audit);
    const lockedAudit: ReconciliationAuditRun = {
      ...cur.audit,
      auditNumber,
      scopeDigestHex,
      status: 'locked',
      updatedAt: new Date().toISOString(),
    };
    state.audits[idx] = { audit: lockedAudit, viewCount: cur.viewCount };
    writeLocalStore(state);
    return state.audits[idx]!;
  }
}

export async function duplicateAuditApi(id: string): Promise<AuditBundle> {
  try {
    return await requestJson<AuditBundle>(`/api/audits/${encodeURIComponent(id)}/duplicate`, {
      method: 'POST',
    });
  } catch (err) {
    if (!shouldFallback(err)) throw err;
    const state = readLocalStore();
    const found = state.audits.find((e) => e.audit.id === id);
    if (!found) throw new ApiError('Audit not found', 404);
    const now = new Date().toISOString();
    const rand = Math.random().toString(36).slice(2, 6);
    const cloned: ReconciliationAuditRun = {
      ...found.audit,
      id: `aud-${Date.now().toString(36)}-${rand}`,
      slug: `${found.audit.slug}-copy-${rand}`,
      auditNumber: undefined,
      scopeDigestHex: undefined,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
    state.audits.unshift({ audit: cloned, viewCount: 0 });
    writeLocalStore(state);
    return { audit: cloned, viewCount: 0 };
  }
}

export async function deleteAuditApi(id: string): Promise<void> {
  try {
    await requestJson<{ deleted: boolean }>(`/api/audits/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    if (!shouldFallback(err)) throw err;
    const state = readLocalStore();
    const found = state.audits.find((e) => e.audit.id === id);
    if (found?.audit.status === 'locked') {
      throw new ApiError('Locked audit cannot be deleted', 409, 'AUDIT_LOCKED');
    }
    state.audits = state.audits.filter((e) => e.audit.id !== id);
    writeLocalStore(state);
  }
}

export async function getPublicReport(slugOrNumber: string): Promise<AuditBundle> {
  try {
    return await requestJson<AuditBundle>(
      `/api/public/reports/${encodeURIComponent(slugOrNumber)}`,
    );
  } catch (err) {
    if (!shouldFallback(err)) throw err;
    const state = readLocalStore();
    const idx = state.audits.findIndex(
      (e) => e.audit.slug === slugOrNumber || e.audit.auditNumber === slugOrNumber,
    );
    if (idx === -1) throw new ApiError('Audit report not found', 404);
    const entry = state.audits[idx]!;
    entry.viewCount += 1;
    writeLocalStore(state);
    return {
      audit: entry.audit,
      viewCount: entry.viewCount,
      disputeMessageAr: buildCourierDisputeMessage(entry.audit, 'ar'),
      disputeMessageEn: buildCourierDisputeMessage(entry.audit, 'en'),
    };
  }
}

export function triggerAuditCsvDownload(audit: ReconciliationAuditRun, locale: Locale): void {
  const csvText = exportDiscrepanciesToCsv(audit.discrepancies, audit.currency, locale);
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeRef = (audit.auditNumber || audit.slug || 'audit').replace(/[^a-zA-Z0-9-_]/g, '_');
  a.href = url;
  a.download = `codcheck-${safeRef}-discrepancies.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
