import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAuditCanonicalText,
  buildCourierDisputeMessage,
} from '../src/core/auditDigest.ts';
import {
  autoDetectCourierMapping,
  autoDetectStoreMapping,
  exportDiscrepanciesToCsv,
  mapCourierRows,
  mapStoreRows,
  normalizeOrderStatus,
  parseDelimitedText,
  parseMoneyCell,
} from '../src/core/csvParser.ts';
import { CODCHECK_PRESETS, createAuditFromPreset } from '../src/core/presets.ts';
import {
  CodCheckCoreError,
  computeCodUnitEconomics,
  reconcileCodBatch,
  round2,
  validateTariff,
} from '../src/core/reconcile.ts';
import { openCodCheckDatabase, slugify } from './db.mjs';

const __serverDir = path.dirname(fileURLToPath(import.meta.url));
let APP_VERSION = '0.5.0';
try {
  const pkgJson = JSON.parse(
    fs.readFileSync(path.resolve(__serverDir, '../package.json'), 'utf8'),
  );
  if (typeof pkgJson.version === 'string' && pkgJson.version.trim()) {
    APP_VERSION = pkgJson.version.trim();
  }
} catch {
  // fallback version
}

const MAX_JSON_BODY = 5 * 1024 * 1024; // 5 MB CSV batch upload cap
const VALID_CURRENCIES = new Set(['AED', 'SAR', 'EGP', 'USD']);
const VALID_PLATFORMS = new Set(['salla', 'shopify', 'easyorders', 'woocommerce', 'custom']);
const VALID_COURIERS = new Set(['aramex', 'smsa', 'bosta', 'naqel', 'custom']);

const DEFAULT_TARIFF = {
  shippingFee: 20,
  rtoFee: 10,
  codFeePercent: 2,
  codFeeFixed: 5,
  vatOnFeesPercent: 15,
  settlementSlaDays: 7,
  feeTolerance: 0.25,
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN',
};

const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_JSON_BODY) {
      const err = new Error('JSON payload exceeds 5 MB limit');
      err.statusCode = 413;
      err.code = 'PAYLOAD_TOO_LARGE';
      throw err;
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error('Invalid JSON payload');
    err.statusCode = 400;
    err.code = 'INVALID_JSON';
    throw err;
  }
}

function normalizeBasePath(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let trimmed = raw.trim();
  if (!trimmed || trimmed === '/') return '';
  if (!trimmed.startsWith('/')) trimmed = `/${trimmed}`;
  return trimmed.replace(/\/+$/, '');
}

function resolveBaseUrl(req, normalizedAppOrigin, normalizedBasePath = '') {
  if (normalizedAppOrigin) return normalizedAppOrigin;
  const protoHeader = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const proto = protoHeader || (req.socket?.encrypted ? 'https' : 'http');
  const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '127.0.0.1:4185')
    .split(',')[0]
    .trim();
  return `${proto}://${hostHeader}${normalizedBasePath}`;
}

function normalizeTariff(rawTariff, fallback = DEFAULT_TARIFF) {
  const src = rawTariff && typeof rawTariff === 'object' ? rawTariff : {};
  const next = {
    shippingFee: Number(src.shippingFee ?? fallback.shippingFee),
    rtoFee: Number(src.rtoFee ?? fallback.rtoFee),
    codFeePercent: Number(src.codFeePercent ?? fallback.codFeePercent),
    codFeeFixed: Number(src.codFeeFixed ?? fallback.codFeeFixed),
    vatOnFeesPercent: Number(src.vatOnFeesPercent ?? fallback.vatOnFeesPercent),
    settlementSlaDays: Number(src.settlementSlaDays ?? fallback.settlementSlaDays),
    feeTolerance: Number(src.feeTolerance ?? fallback.feeTolerance),
  };
  validateTariff(next);
  return next;
}

function normalizeDirectStoreOrders(rawOrders, defaultPackagingCost = 0, defaultShipDate = '') {
  return rawOrders
    .filter((o) => o && typeof o === 'object' && String(o.awb || o.orderId || '').trim() !== '')
    .map((o, idx) => ({
      awb: String(o.awb || o.orderId || `ORD-${idx + 1}`).trim(),
      orderId: String(o.orderId || o.awb || `ORD-${idx + 1}`).trim(),
      status: normalizeOrderStatus(String(o.status ?? 'delivered')),
      codAmount: Math.max(0, parseMoneyCell(o.codAmount ?? 0)),
      city: String(o.city || 'Unspecified').trim(),
      sku: String(o.sku || 'SKU-DEFAULT').trim(),
      productCost: Math.max(0, parseMoneyCell(o.productCost ?? 0)),
      packagingCost:
        o.packagingCost !== undefined && o.packagingCost !== null
          ? Math.max(0, parseMoneyCell(o.packagingCost))
          : defaultPackagingCost,
      adSpend: Math.max(0, parseMoneyCell(o.adSpend ?? 0)),
      shipDate: String(o.shipDate || defaultShipDate || '').trim(),
    }));
}

function normalizeDirectCourierRows(rawRows) {
  return rawRows
    .filter((r) => r && typeof r === 'object' && String(r.awb || '').trim() !== '')
    .map((r) => ({
      awb: String(r.awb).trim(),
      status: r.status ? normalizeOrderStatus(String(r.status)) : undefined,
      collectedCod: Math.max(0, parseMoneyCell(r.collectedCod ?? 0)),
      shippingFee: Math.max(0, parseMoneyCell(r.shippingFee ?? 0)),
      rtoFee: Math.max(0, parseMoneyCell(r.rtoFee ?? 0)),
      codFee: Math.max(0, parseMoneyCell(r.codFee ?? 0)),
      vatFee: Math.max(0, parseMoneyCell(r.vatFee ?? 0)),
      netPayout:
        r.netPayout !== undefined && r.netPayout !== null && r.netPayout !== ''
          ? parseMoneyCell(r.netPayout)
          : undefined,
      settlementDate: r.settlementDate ? String(r.settlementDate).trim() : undefined,
    }));
}

function deriveBatchUnitEconomics(storeOrders, summary, tariff, explicitInput = null, defaultPackagingCost = 0) {
  if (explicitInput && typeof explicitInput === 'object') {
    return computeCodUnitEconomics({
      sellingPrice: Number(explicitInput.sellingPrice ?? 200),
      cogsPerUnit: Number(explicitInput.cogsPerUnit ?? 60),
      packagingCost: Number(explicitInput.packagingCost ?? defaultPackagingCost),
      shippingFee: Number(explicitInput.shippingFee ?? tariff.shippingFee),
      rtoFee: Number(explicitInput.rtoFee ?? tariff.rtoFee),
      codFeePercent: Number(explicitInput.codFeePercent ?? tariff.codFeePercent),
      codFeeFixed: Number(explicitInput.codFeeFixed ?? tariff.codFeeFixed),
      vatOnFeesPercent: Number(explicitInput.vatOnFeesPercent ?? tariff.vatOnFeesPercent),
      deliveryRatePct: Number(explicitInput.deliveryRatePct ?? (summary.deliveryRatePct || 75)),
      adCpaActual: explicitInput.adCpaActual !== undefined ? Number(explicitInput.adCpaActual) : 0,
    });
  }

  const count = storeOrders.length;
  const deliveredOrdersList = storeOrders.filter(
    (o) => o.status === 'delivered' || o.status === 'partial_return',
  );
  const avgSellingPrice =
    deliveredOrdersList.length > 0
      ? round2(
          deliveredOrdersList.reduce((acc, o) => acc + o.codAmount, 0) / deliveredOrdersList.length,
        )
      : count > 0
        ? round2(storeOrders.reduce((acc, o) => acc + o.codAmount, 0) / count)
        : 200;
  const avgCogs =
    count > 0 ? round2(storeOrders.reduce((acc, o) => acc + o.productCost, 0) / count) : 50;
  const avgPack =
    count > 0
      ? round2(storeOrders.reduce((acc, o) => acc + (o.packagingCost || defaultPackagingCost), 0) / count)
      : defaultPackagingCost;
  const avgAdCpa =
    count > 0 ? round2(storeOrders.reduce((acc, o) => acc + o.adSpend, 0) / count) : 0;
  const denom = summary.deliveredOrders + summary.rtoOrders;
  const deliveryRatePct = denom > 0 ? summary.deliveryRatePct : 75;

  return computeCodUnitEconomics({
    sellingPrice: avgSellingPrice,
    cogsPerUnit: avgCogs,
    packagingCost: avgPack,
    shippingFee: tariff.shippingFee,
    rtoFee: tariff.rtoFee,
    codFeePercent: tariff.codFeePercent,
    codFeeFixed: tariff.codFeeFixed,
    vatOnFeesPercent: tariff.vatOnFeesPercent,
    deliveryRatePct,
    adCpaActual: avgAdCpa,
  });
}

function extractInputsForReconcile(body, fallbackAudit = null) {
  const defaultPack = Math.max(0, Number(body?.defaultPackagingCost ?? 0));
  const referenceDate = String(
    body?.referenceDate || fallbackAudit?.referenceDate || new Date().toISOString().slice(0, 10),
  ).slice(0, 10);

  let storeOrders = [];
  let storeCsvSample = fallbackAudit?.storeCsvSample;
  if (Array.isArray(body?.storeOrders)) {
    storeOrders = normalizeDirectStoreOrders(body.storeOrders, defaultPack, referenceDate);
  } else if (typeof body?.storeCsv === 'string' && body.storeCsv.trim()) {
    storeCsvSample = body.storeCsv;
    const parsedStore = parseDelimitedText(body.storeCsv);
    const detectedStore = autoDetectStoreMapping(parsedStore.headers);
    const mapping =
      body.storeMapping && typeof body.storeMapping === 'object'
        ? { ...detectedStore, ...body.storeMapping }
        : detectedStore;
    storeOrders = mapStoreRows(parsedStore.rows, mapping, {
      defaultPackagingCost: defaultPack,
      defaultShipDate: referenceDate,
    });
  } else if (typeof fallbackAudit?.storeCsvSample === 'string' && fallbackAudit.storeCsvSample.trim()) {
    const parsedStore = parseDelimitedText(fallbackAudit.storeCsvSample);
    const detectedStore = autoDetectStoreMapping(parsedStore.headers);
    storeOrders = mapStoreRows(parsedStore.rows, detectedStore, {
      defaultPackagingCost: defaultPack,
      defaultShipDate: referenceDate,
    });
  } else if (Array.isArray(fallbackAudit?.lines)) {
    storeOrders = fallbackAudit.lines.map((line) => ({
      awb: line.awb,
      orderId: line.orderId,
      status: line.storeStatus,
      codAmount: line.expectedCod,
      city: line.city,
      sku: line.sku,
      productCost: line.productCost,
      packagingCost: line.packagingCost,
      adSpend: line.adSpend,
      shipDate: referenceDate,
    }));
  }

  let courierRows = [];
  let courierCsvSample = fallbackAudit?.courierCsvSample;
  if (Array.isArray(body?.courierRows)) {
    courierRows = normalizeDirectCourierRows(body.courierRows);
  } else if (typeof body?.courierCsv === 'string') {
    courierCsvSample = body.courierCsv;
    if (body.courierCsv.trim()) {
      const parsedCourier = parseDelimitedText(body.courierCsv);
      const detectedCourier = autoDetectCourierMapping(parsedCourier.headers);
      const mapping =
        body.courierMapping && typeof body.courierMapping === 'object'
          ? { ...detectedCourier, ...body.courierMapping }
          : detectedCourier;
      courierRows = mapCourierRows(parsedCourier.rows, mapping);
    }
  } else if (
    typeof fallbackAudit?.courierCsvSample === 'string' &&
    fallbackAudit.courierCsvSample.trim()
  ) {
    const parsedCourier = parseDelimitedText(fallbackAudit.courierCsvSample);
    const detectedCourier = autoDetectCourierMapping(parsedCourier.headers);
    courierRows = mapCourierRows(parsedCourier.rows, detectedCourier);
  }

  return {
    storeOrders,
    courierRows,
    storeCsvSample,
    courierCsvSample,
    referenceDate,
    defaultPack,
  };
}

function serveStaticAsset(res, pathname, resolvedDist, method = 'GET', normalizedBasePath = '') {
  if (!resolvedDist || !fs.existsSync(resolvedDist)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  let decodedPath = '/';
  try {
    decodedPath = decodeURIComponent(pathname || '/');
  } catch {
    sendJson(res, 400, { error: 'Malformed path' });
    return;
  }

  const cleanRel = decodedPath.replace(/^\/+/, '');
  const candidate = path.resolve(resolvedDist, cleanRel || 'index.html');
  if (candidate !== resolvedDist && !candidate.startsWith(resolvedDist + path.sep)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  let fileToServe = null;
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    fileToServe = candidate;
  } else {
    const indexFallback = path.join(resolvedDist, 'index.html');
    if (fs.existsSync(indexFallback) && fs.statSync(indexFallback).isFile()) {
      fileToServe = indexFallback;
    }
  }

  if (!fileToServe) {
    sendJson(res, 404, { error: 'Static asset not found' });
    return;
  }

  const ext = path.extname(fileToServe).toLowerCase();
  const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';

  if (ext === '.html' && normalizedBasePath) {
    let html = fs.readFileSync(fileToServe, 'utf8');
    html = html
      .replaceAll('href="/', `href="${normalizedBasePath}/`)
      .replaceAll('src="/', `src="${normalizedBasePath}/`);
    const baseScript = `<script>window.__CODCHECK_BASE__=${JSON.stringify(normalizedBasePath)};</script>`;
    html = html.includes('</head>') ? html.replace('</head>', `${baseScript}</head>`) : `${baseScript}${html}`;
    const bodyBuf = Buffer.from(html, 'utf8');
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': bodyBuf.byteLength,
      'Cache-Control': 'no-cache',
      ...SECURITY_HEADERS,
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    res.end(bodyBuf);
    return;
  }

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    ...SECURITY_HEADERS,
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(fileToServe).pipe(res);
}

function mapCoreErrorStatus(err) {
  if (err?.statusCode) return err.statusCode;
  if (err instanceof CodCheckCoreError) {
    if (err.code === 'AUDIT_LOCKED') return 409;
    return 400;
  }
  return 500;
}

export function createCodCheckServer({ dataDir, distDir = '', appOrigin = '', basePath = '' }) {
  const db = openCodCheckDatabase(dataDir);
  const resolvedDist = distDir ? path.resolve(distDir) : null;
  const normalizedAppOrigin = String(appOrigin || '').replace(/\/+$/, '');
  const normalizedBasePath = normalizeBasePath(basePath);

  function buildPublicReportUrl(req, slugOrNum) {
    return `${resolveBaseUrl(req, normalizedAppOrigin, normalizedBasePath)}/r/${encodeURIComponent(slugOrNum)}`;
  }

  async function handleApiRequest(req, res, method, pathname, searchParams) {
    // 1. Health & Presets
    if (method === 'GET' && pathname === '/api/health') {
      const stats = db.getStats();
      return sendJson(res, 200, {
        ok: true,
        service: 'codcheck',
        version: APP_VERSION,
        basePath: normalizedBasePath || '/',
        ...stats,
        timestamp: new Date().toISOString(),
      });
    }

    if (method === 'GET' && pathname === '/api/presets') {
      return sendJson(res, 200, {
        presets: CODCHECK_PRESETS.map(
          ({
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
          }) => ({
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
        ),
      });
    }

    // 2. Unit Economics Simulator Endpoint
    if (method === 'POST' && pathname === '/api/unit-economics') {
      const body = await readJsonBody(req);
      const unitEconomics = computeCodUnitEconomics({
        sellingPrice: Number(body?.sellingPrice ?? 200),
        cogsPerUnit: Number(body?.cogsPerUnit ?? 60),
        packagingCost: Number(body?.packagingCost ?? 5),
        shippingFee: Number(body?.shippingFee ?? 20),
        rtoFee: Number(body?.rtoFee ?? 10),
        codFeePercent: Number(body?.codFeePercent ?? 2),
        codFeeFixed: Number(body?.codFeeFixed ?? 5),
        vatOnFeesPercent: Number(body?.vatOnFeesPercent ?? 15),
        confirmationRatePct:
          body?.confirmationRatePct !== undefined ? Number(body.confirmationRatePct) : undefined,
        deliveryRatePct: Number(body?.deliveryRatePct ?? 75),
        adCpaActual: body?.adCpaActual !== undefined ? Number(body.adCpaActual) : 0,
      });
      return sendJson(res, 200, { unitEconomics });
    }

    // 3. Saved Courier Tariff Profiles
    if (method === 'GET' && pathname === '/api/tariffs') {
      return sendJson(res, 200, { tariffs: db.listTariffProfiles() });
    }

    if (method === 'POST' && pathname === '/api/tariffs') {
      const body = await readJsonBody(req);
      const tariff = normalizeTariff(body?.tariff ?? body);
      const saved = db.saveTariffProfile({
        id: typeof body?.id === 'string' && body.id.trim() ? body.id.trim() : undefined,
        name: String(body?.name ?? 'Courier Tariff'),
        courier: VALID_COURIERS.has(body?.courier) ? body.courier : 'custom',
        currency: VALID_CURRENCIES.has(body?.currency) ? body.currency : 'SAR',
        tariff,
      });
      return sendJson(res, 201, { tariffProfile: saved });
    }

    const tariffMatch = pathname.match(/^\/api\/tariffs\/([^/]+)$/);
    if (method === 'DELETE' && tariffMatch) {
      const id = decodeURIComponent(tariffMatch[1] || '');
      const del = db.deleteTariffProfile(id);
      if (!del.deleted) return sendJson(res, 404, { error: 'Tariff profile not found' });
      return sendJson(res, 200, { deleted: true, id });
    }

    // 4. Audits Collection (/api/audits)
    if (method === 'GET' && pathname === '/api/audits') {
      return sendJson(res, 200, {
        audits: db.listAudits(),
        stats: db.getStats(),
      });
    }

    if (method === 'POST' && pathname === '/api/audits') {
      const body = await readJsonBody(req);
      const hasCustomBatch =
        (typeof body?.storeCsv === 'string' && body.storeCsv.trim().length > 0) ||
        Array.isArray(body?.storeOrders) ||
        Array.isArray(body?.courierRows);

      let auditObj;
      if (hasCustomBatch) {
        const extracted = extractInputsForReconcile(body);
        const tariff = normalizeTariff(body?.tariff, DEFAULT_TARIFF);
        const reconciled = reconcileCodBatch({
          storeOrders: extracted.storeOrders,
          courierRows: extracted.courierRows,
          tariff,
          referenceDate: extracted.referenceDate,
          defaultPackagingCost: extracted.defaultPack,
        });
        const unitEconomics = deriveBatchUnitEconomics(
          extracted.storeOrders,
          reconciled.summary,
          tariff,
          body?.unitEconomicsInput ?? null,
          extracted.defaultPack,
        );
        const now = new Date().toISOString();
        const title = String(body?.title || 'COD Settlement Audit').trim();
        const titleAr = String(body?.titleAr || title).trim();
        const currency = VALID_CURRENCIES.has(body?.currency) ? body.currency : 'SAR';
        const platform = VALID_PLATFORMS.has(body?.platform) ? body.platform : 'custom';
        const courier = VALID_COURIERS.has(body?.courier) ? body.courier : 'custom';
        const defaultLocale = body?.defaultLocale === 'en' ? 'en' : 'ar';

        auditObj = {
          id: `aud-${Date.now().toString(36)}-${slugify(title, 'cod').slice(0, 8)}`,
          slug: typeof body?.slug === 'string' && body.slug.trim() ? body.slug.trim() : slugify(title, 'audit'),
          defaultLocale,
          title,
          titleAr,
          storeName: String(body?.storeName || 'Merchant Store').trim(),
          courierName: String(body?.courierName || 'Courier Partner').trim(),
          platform,
          courier,
          currency,
          referenceDate: extracted.referenceDate,
          tariff,
          summary: reconciled.summary,
          lines: reconciled.lines,
          discrepancies: reconciled.discrepancies,
          byCity: reconciled.byCity,
          bySku: reconciled.bySku,
          unitEconomics,
          storeCsvSample: extracted.storeCsvSample,
          courierCsvSample: extracted.courierCsvSample,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        };
      } else {
        const presetId = CODCHECK_PRESETS.some((p) => p.id === body?.presetId)
          ? body.presetId
          : 'ksa-salla-smsa';
        const overrides = body?.overrides && typeof body.overrides === 'object' ? body.overrides : {};
        auditObj = createAuditFromPreset(presetId, overrides);
      }

      const created = db.createAudit(auditObj, String(body?.actor || 'merchant'));
      return sendJson(res, 201, {
        ...created,
        publicReportUrl: buildPublicReportUrl(req, created.audit.slug),
      });
    }

    // 5. Audit Sub-Resources (/api/audits/:id/*)
    const dupMatch = pathname.match(/^\/api\/audits\/([^/]+)\/duplicate$/);
    if (method === 'POST' && dupMatch) {
      const id = decodeURIComponent(dupMatch[1] || '');
      const cloned = db.duplicateAudit(id);
      if (!cloned) return sendJson(res, 404, { error: 'Audit not found' });
      return sendJson(res, 201, {
        ...cloned,
        publicReportUrl: buildPublicReportUrl(req, cloned.audit.slug),
      });
    }

    const finalizeMatch = pathname.match(/^\/api\/audits\/([^/]+)\/finalize$/);
    if (method === 'POST' && finalizeMatch) {
      const id = decodeURIComponent(finalizeMatch[1] || '');
      const body = await readJsonBody(req);
      const finalized = db.finalizeAuditAtomic({
        id,
        buildCanonicalText: buildAuditCanonicalText,
        actor: String(body?.actor || 'merchant').trim() || 'merchant',
      });
      if (!finalized) return sendJson(res, 404, { error: 'Audit not found' });
      return sendJson(res, 201, {
        ...finalized,
        publicReportUrl: buildPublicReportUrl(req, finalized.audit.auditNumber || finalized.audit.slug),
      });
    }

    const csvMatch = pathname.match(/^\/api\/audits\/([^/]+)\/export\.csv$/);
    if (method === 'GET' && csvMatch) {
      const id = decodeURIComponent(csvMatch[1] || '');
      const bundle = db.getAuditById(id);
      if (!bundle) return sendJson(res, 404, { error: 'Audit not found' });
      const localeParam = searchParams.get('locale');
      const locale = localeParam === 'en' || localeParam === 'ar' ? localeParam : bundle.audit.defaultLocale;
      const csvText = exportDiscrepanciesToCsv(bundle.audit.discrepancies, bundle.audit.currency, locale);
      const buf = Buffer.from(csvText, 'utf8');
      const safeRef = slugify(bundle.audit.auditNumber || bundle.audit.slug, 'audit');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Length': buf.byteLength,
        'Content-Disposition': `attachment; filename="codcheck-${safeRef}-discrepancies.csv"`,
        'Cache-Control': 'no-store',
        ...SECURITY_HEADERS,
      });
      res.end(buf);
      return;
    }

    const msgMatch = pathname.match(/^\/api\/audits\/([^/]+)\/dispute-message$/);
    if (method === 'GET' && msgMatch) {
      const id = decodeURIComponent(msgMatch[1] || '');
      const bundle = db.getAuditById(id);
      if (!bundle) return sendJson(res, 404, { error: 'Audit not found' });
      const localeParam = searchParams.get('locale');
      const locale = localeParam === 'en' || localeParam === 'ar' ? localeParam : bundle.audit.defaultLocale;
      return sendJson(res, 200, {
        locale,
        message: buildCourierDisputeMessage(bundle.audit, locale),
      });
    }

    // 6. Single Audit CRUD (/api/audits/:id)
    const auditMatch = pathname.match(/^\/api\/audits\/([^/]+)$/);
    if (auditMatch) {
      const id = decodeURIComponent(auditMatch[1] || '');
      if (method === 'GET') {
        const bundle = db.getAuditById(id);
        if (!bundle) return sendJson(res, 404, { error: 'Audit not found' });
        return sendJson(res, 200, {
          ...bundle,
          publicReportUrl: buildPublicReportUrl(req, bundle.audit.auditNumber || bundle.audit.slug),
        });
      }
      if (method === 'PATCH') {
        const patch = await readJsonBody(req);
        const updated = db.updateAuditAtomic(id, (current) => {
          const nextTariff = patch?.tariff
            ? normalizeTariff(patch.tariff, current.tariff)
            : normalizeTariff(current.tariff, DEFAULT_TARIFF);
          const extracted = extractInputsForReconcile(patch, current);
          const reconciled = reconcileCodBatch({
            storeOrders: extracted.storeOrders,
            courierRows: extracted.courierRows,
            tariff: nextTariff,
            referenceDate: extracted.referenceDate,
            defaultPackagingCost: extracted.defaultPack,
          });
          const nextUnitEcon = deriveBatchUnitEconomics(
            extracted.storeOrders,
            reconciled.summary,
            nextTariff,
            patch?.unitEconomicsInput ?? null,
            extracted.defaultPack,
          );

          return {
            ...current,
            ...(typeof patch?.title === 'string' && patch.title.trim() ? { title: patch.title.trim() } : {}),
            ...(typeof patch?.titleAr === 'string' ? { titleAr: patch.titleAr.trim() } : {}),
            ...(typeof patch?.storeName === 'string' && patch.storeName.trim()
              ? { storeName: patch.storeName.trim() }
              : {}),
            ...(typeof patch?.courierName === 'string' && patch.courierName.trim()
              ? { courierName: patch.courierName.trim() }
              : {}),
            ...(VALID_CURRENCIES.has(patch?.currency) ? { currency: patch.currency } : {}),
            ...(VALID_PLATFORMS.has(patch?.platform) ? { platform: patch.platform } : {}),
            ...(VALID_COURIERS.has(patch?.courier) ? { courier: patch.courier } : {}),
            ...(patch?.defaultLocale === 'en' || patch?.defaultLocale === 'ar'
              ? { defaultLocale: patch.defaultLocale }
              : {}),
            ...(typeof patch?.slug === 'string' && patch.slug.trim() ? { slug: patch.slug.trim() } : {}),
            referenceDate: extracted.referenceDate,
            tariff: nextTariff,
            summary: reconciled.summary,
            lines: reconciled.lines,
            discrepancies: reconciled.discrepancies,
            byCity: reconciled.byCity,
            bySku: reconciled.bySku,
            unitEconomics: nextUnitEcon,
            storeCsvSample: extracted.storeCsvSample,
            courierCsvSample: extracted.courierCsvSample,
          };
        });
        if (!updated) return sendJson(res, 404, { error: 'Audit not found' });
        return sendJson(res, 200, {
          ...updated,
          publicReportUrl: buildPublicReportUrl(req, updated.audit.slug),
        });
      }
      if (method === 'DELETE') {
        const del = db.deleteAudit(id);
        if (!del.deleted) return sendJson(res, 404, { error: 'Audit not found' });
        return sendJson(res, 200, { deleted: true, id });
      }
    }

    // 7. Public Shareable Courier Dispute Report (/api/public/reports/:slugOrNumber)
    const pubReportMatch = pathname.match(/^\/api\/public\/reports\/([^/]+)$/);
    if (method === 'GET' && pubReportMatch) {
      const slugOrNumber = decodeURIComponent(pubReportMatch[1] || '');
      const bundle = db.recordPublicView(slugOrNumber);
      if (!bundle) return sendJson(res, 404, { error: 'Audit report not found' });
      return sendJson(res, 200, {
        ...bundle,
        disputeMessageAr: buildCourierDisputeMessage(bundle.audit, 'ar'),
        disputeMessageEn: buildCourierDisputeMessage(bundle.audit, 'en'),
        publicReportUrl: buildPublicReportUrl(req, bundle.audit.auditNumber || bundle.audit.slug),
      });
    }

    return sendJson(res, 404, { error: 'API endpoint not found' });
  }

  async function handler(req, res) {
    try {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      let pathname = parsedUrl.pathname;
      if (
        normalizedBasePath &&
        (pathname === normalizedBasePath || pathname.startsWith(`${normalizedBasePath}/`))
      ) {
        pathname = pathname.slice(normalizedBasePath.length) || '/';
      }
      const method = String(req.method || 'GET').toUpperCase();

      if (pathname.startsWith('/api/')) {
        await handleApiRequest(req, res, method, pathname, parsedUrl.searchParams);
        return;
      }

      if (method !== 'GET' && method !== 'HEAD') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }

      serveStaticAsset(res, pathname, resolvedDist, method, normalizedBasePath);
    } catch (err) {
      const statusCode = mapCoreErrorStatus(err);
      const payload = {
        error: err?.message || 'Internal server error',
        ...(err?.code ? { code: err.code } : {}),
      };
      if (!res.headersSent) {
        sendJson(res, statusCode, payload);
      } else {
        res.end();
      }
    }
  }

  return {
    handler,
    close: () => db.close(),
  };
}
