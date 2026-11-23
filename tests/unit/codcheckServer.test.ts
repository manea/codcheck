import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCodCheckServer } from '../../server/app.mjs';
import { verifyAuditIntegrity } from '../../src/core/auditDigest.ts';
import type { CodUnitEconomicsResult, ReconciliationAuditRun } from '../../src/core/types.ts';

describe('CODCheck HTTP Server, SQLite WAL, Reconciliation API & Atomic Reports', () => {
  let tmpDir = '';
  let server: http.Server;
  let closeDb: () => void;
  let baseUrl = '';
  const currentYear = new Date().getUTCFullYear();

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codcheck-srv-test-'));
    const instance = createCodCheckServer({ dataDir: tmpDir });
    closeDb = instance.close;
    server = http.createServer(instance.handler);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to bind ephemeral port');
    }
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    if (closeDb) closeDb();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  async function apiJson(route: string, init?: RequestInit) {
    const res = await fetch(`${baseUrl}${route}`, init);
    const data = (await res.json()) as Record<string, unknown>;
    return { res, data };
  }

  it('serves health check with security headers, lists 3 presets, runs unit economics & CRUDs tariff profiles', async () => {
    const health = await apiJson('/api/health');
    expect(health.res.status).toBe(200);
    expect(health.res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(health.res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(health.data.ok).toBe(true);
    expect(health.data.service).toBe('codcheck');
    const pkgVersion = (
      JSON.parse(
        fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
      ) as { version: string }
    ).version;
    expect(health.data.version).toBe(pkgVersion);

    const presets = await apiJson('/api/presets');
    expect(presets.res.status).toBe(200);
    expect(Array.isArray(presets.data.presets)).toBe(true);
    expect(presets.data.presets).toHaveLength(3);

    const econ = await apiJson('/api/unit-economics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sellingPrice: 240,
        cogsPerUnit: 65,
        packagingCost: 5,
        shippingFee: 20,
        rtoFee: 10,
        codFeePercent: 2,
        codFeeFixed: 5,
        vatOnFeesPercent: 15,
        deliveryRatePct: 72,
        adCpaActual: 30,
      }),
    });
    expect(econ.res.status).toBe(200);
    const ue = econ.data.unitEconomics as CodUnitEconomicsResult;
    expect(ue.effectiveRtoRatePct).toBe(28);
    expect(ue.breakEvenCpa).toBeGreaterThan(0);

    // Reject negative shippingFee tariff with 400 INVALID_TARIFF
    const badTariff = await apiJson('/api/tariffs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Broken Tariff',
        shippingFee: -5,
      }),
    });
    expect(badTariff.res.status).toBe(400);
    expect(badTariff.data.code).toBe('INVALID_TARIFF');

    // Create valid tariff profile, list, then delete
    const goodTariff = await apiJson('/api/tariffs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'SMSA KSA Standard Contract',
        courier: 'smsa',
        currency: 'SAR',
        tariff: {
          shippingFee: 24,
          rtoFee: 12,
          codFeePercent: 2,
          codFeeFixed: 5,
          vatOnFeesPercent: 15,
          settlementSlaDays: 7,
          feeTolerance: 0.25,
        },
      }),
    });
    expect(goodTariff.res.status).toBe(201);
    const createdTariffId = (goodTariff.data.tariffProfile as { id: string }).id;

    const listTariffs = await apiJson('/api/tariffs');
    expect(listTariffs.res.status).toBe(200);
    expect((listTariffs.data.tariffs as unknown[]).length).toBe(1);

    const delTariff = await apiJson(`/api/tariffs/${createdTariffId}`, { method: 'DELETE' });
    expect(delTariff.res.status).toBe(200);
    expect(delTariff.data.deleted).toBe(true);
  });

  it('creates custom audit from Store + Courier CSV, recalculates on tariff PATCH, and exports BOM CSV + dispute message', async () => {
    const storeCsv = [
      'AWB,Order ID,Status,COD Amount,City,SKU,Product Cost,Packaging,Ad Spend,Ship Date',
      'SHP-101,ORD-1,Delivered,200,Dubai,SKU-1,50,4,20,2026-11-18',
      'SHP-102,ORD-2,Delivered,150,Abu Dhabi,SKU-2,40,4,15,2026-11-18',
    ].join('\n');
    const courierCsv = [
      'AWB,Status,Collected COD,Shipping Fee,RTO Fee,COD Fee,VAT',
      'SHP-101,Delivered,200,20,0,7,1.35',
      // SHP-102 omitted -> missing remittance
    ].join('\n');

    const created = await apiJson('/api/audits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Custom UAE Batch',
        storeName: 'Oasis Store',
        courierName: 'Aramex',
        platform: 'shopify',
        courier: 'aramex',
        currency: 'AED',
        defaultLocale: 'en',
        referenceDate: '2026-11-24',
        tariff: {
          shippingFee: 20, // matches SHP-101
          rtoFee: 10,
          codFeePercent: 2,
          codFeeFixed: 3, // 200*2%+3 = 7
          vatOnFeesPercent: 5,
          settlementSlaDays: 5,
          feeTolerance: 0.25,
        },
        storeCsv,
        courierCsv,
      }),
    });
    expect(created.res.status).toBe(201);
    const audit1 = created.data.audit as ReconciliationAuditRun;
    expect(audit1.summary.totalStoreOrders).toBe(2);
    expect(audit1.discrepancies.map((d) => d.type)).toEqual(['missing_remittance']);

    // Lower contracted shippingFee to 15 AED via PATCH -> overcharged_shipping appears on SHP-101 too!
    const patched = await apiJson(`/api/audits/${audit1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tariff: { shippingFee: 15 },
      }),
    });
    expect(patched.res.status).toBe(200);
    const audit2 = patched.data.audit as ReconciliationAuditRun;
    expect(audit2.discrepancies.map((d) => d.type)).toContain('overcharged_shipping');
    expect(audit2.discrepancies.map((d) => d.type)).toContain('missing_remittance');

    // CSV export starts with UTF-8 BOM
    const csvRes = await fetch(`${baseUrl}/api/audits/${audit1.id}/export.csv?locale=ar`);
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get('content-type') ?? '').toContain('text/csv');
    const rawBytes = new Uint8Array(await csvRes.arrayBuffer());
    // UTF-8 BOM: 0xEF, 0xBB, 0xBF
    expect(rawBytes[0]).toBe(0xef);
    expect(rawBytes[1]).toBe(0xbb);
    expect(rawBytes[2]).toBe(0xbf);
    const csvText = new TextDecoder('utf-8').decode(rawBytes);
    expect(csvText).toContain('SHP-101');
    expect(csvText).toContain('SHP-102');

    const msgEn = await apiJson(`/api/audits/${audit1.id}/dispute-message?locale=en`);
    expect(msgEn.res.status).toBe(200);
    expect(String(msgEn.data.message)).toContain('SHP-102');

    const msgAr = await apiJson(`/api/audits/${audit1.id}/dispute-message?locale=ar`);
    expect(msgAr.res.status).toBe(200);
    expect(String(msgAr.data.message)).toContain('SHP-102');
  });

  it('finalizes preset audit atomically with COD-YYYY-0001 + SHA-256 digest and increments public viewCount', async () => {
    const created = await apiJson('/api/audits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        presetId: 'ksa-salla-smsa',
        overrides: { slug: 'al-baha-week-47' },
      }),
    });
    expect(created.res.status).toBe(201);
    const draft = created.data.audit as ReconciliationAuditRun;
    expect(draft.status).toBe('draft');

    const finalized = await apiJson(`/api/audits/${draft.id}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'Finance Manager' }),
    });
    expect(finalized.res.status).toBe(201);
    const locked = finalized.data.audit as ReconciliationAuditRun;
    const expectedNum = `COD-${currentYear}-0001`;
    expect(locked.status).toBe('locked');
    expect(locked.auditNumber).toBe(expectedNum);
    expect(locked.scopeDigestHex).toMatch(/^[0-9a-f]{64}$/);

    const integrity = await verifyAuditIntegrity(locked);
    expect(integrity.valid).toBe(true);

    // Fetch public report by slug and by auditNumber -> viewCount increments twice
    const pubBySlug = await apiJson('/api/public/reports/al-baha-week-47');
    expect(pubBySlug.res.status).toBe(200);
    expect(pubBySlug.data.viewCount).toBe(1);
    expect(String(pubBySlug.data.disputeMessageAr)).toContain(expectedNum);

    const pubByNum = await apiJson(`/api/public/reports/${expectedNum}`);
    expect(pubByNum.res.status).toBe(200);
    expect(pubByNum.data.viewCount).toBe(2);
    expect((pubByNum.data.audit as ReconciliationAuditRun).auditNumber).toBe(expectedNum);
  });

  it('enforces 409 lock immutability after finalization and clones cleanly via duplicate', async () => {
    const pub = await apiJson('/api/public/reports/al-baha-week-47');
    const lockedId = (pub.data.audit as ReconciliationAuditRun).id;

    const patchRes = await apiJson(`/api/audits/${lockedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Mutate Locked Audit' }),
    });
    expect(patchRes.res.status).toBe(409);
    expect(patchRes.data.code).toBe('AUDIT_LOCKED');

    const delRes = await apiJson(`/api/audits/${lockedId}`, { method: 'DELETE' });
    expect(delRes.res.status).toBe(409);
    expect(delRes.data.code).toBe('AUDIT_LOCKED');

    const reFinalize = await apiJson(`/api/audits/${lockedId}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(reFinalize.res.status).toBe(409);
    expect(reFinalize.data.code).toBe('ALREADY_LOCKED');

    const dupRes = await apiJson(`/api/audits/${lockedId}/duplicate`, { method: 'POST' });
    expect(dupRes.res.status).toBe(201);
    const cloned = dupRes.data.audit as ReconciliationAuditRun;
    expect(cloned.id).not.toBe(lockedId);
    expect(cloned.slug).not.toBe('al-baha-week-47');
    expect(cloned.status).toBe('draft');
    expect(cloned.auditNumber).toBeUndefined();
    expect(cloned.scopeDigestHex).toBeUndefined();
  });

  it('supports subpath hosting (BASE_PATH=/codcheck) for health and HTML base injection', async () => {
    const subDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codcheck-sub-data-'));
    const subDistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codcheck-sub-dist-'));
    fs.writeFileSync(
      path.join(subDistDir, 'index.html'),
      '<!doctype html><html><head><link rel="icon" href="/favicon.svg" /><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>',
      'utf8',
    );

    const subInstance = createCodCheckServer({
      dataDir: subDataDir,
      distDir: subDistDir,
      appOrigin: 'https://example.test/codcheck',
      basePath: '/codcheck',
    });
    const subServer = http.createServer(subInstance.handler);
    await new Promise<void>((resolve) => subServer.listen(0, '127.0.0.1', () => resolve()));

    try {
      const addr = subServer.address();
      if (!addr || typeof addr === 'string') throw new Error('Failed to bind port');
      const subBaseUrl = `http://127.0.0.1:${addr.port}`;

      const preHealth = await fetch(`${subBaseUrl}/codcheck/api/health`);
      expect(preHealth.status).toBe(200);
      expect(((await preHealth.json()) as { basePath: string }).basePath).toBe('/codcheck');

      const stripHealth = await fetch(`${subBaseUrl}/api/health`);
      expect(stripHealth.status).toBe(200);
      expect(((await stripHealth.json()) as { basePath: string }).basePath).toBe('/codcheck');

      const htmlRes = await fetch(`${subBaseUrl}/codcheck/`);
      expect(htmlRes.status).toBe(200);
      const html = await htmlRes.text();
      expect(html).toContain('window.__CODCHECK_BASE__="/codcheck"');
      expect(html).toContain('src="/codcheck/assets/app.js"');
      expect(html).toContain('href="/codcheck/favicon.svg"');
    } finally {
      subInstance.close();
      await new Promise<void>((resolve) => subServer.close(() => resolve()));
      fs.rmSync(subDataDir, { recursive: true, force: true });
      fs.rmSync(subDistDir, { recursive: true, force: true });
    }
  });
});
