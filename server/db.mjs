import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function makeError(message, code, statusCode) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

export function slugify(input, fallback = 'audit') {
  const cleaned = String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function parseJsonSafe(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function openCodCheckDatabase(dataDir) {
  const resolvedDataDir = path.resolve(dataDir);
  fs.mkdirSync(resolvedDataDir, { recursive: true });

  const dbPath = path.join(resolvedDataDir, 'codcheck.sqlite');
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS audits (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      audit_number TEXT UNIQUE,
      status TEXT NOT NULL,
      currency TEXT NOT NULL,
      audit_json TEXT NOT NULL,
      view_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audits_status ON audits(status);
    CREATE INDEX IF NOT EXISTS idx_audits_updated ON audits(updated_at DESC);

    CREATE TABLE IF NOT EXISTS tariff_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      courier TEXT NOT NULL,
      currency TEXT NOT NULL,
      tariff_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tariffs_updated ON tariff_profiles(updated_at DESC);

    CREATE TABLE IF NOT EXISTS audit_counters (
      year INTEGER PRIMARY KEY,
      last_seq INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      meta_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_events ON audit_events(audit_id, id DESC);
  `);

  function ensureUniqueSlug(desiredSlug, excludeId = null) {
    const base = slugify(desiredSlug, 'audit');
    let candidate = base;
    let suffix = 2;
    const checkStmt = db.prepare('SELECT id FROM audits WHERE slug = ?');
    while (true) {
      const existing = checkStmt.get(candidate);
      if (!existing || (excludeId && existing.id === excludeId)) {
        return candidate;
      }
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
  }

  function insertEvent(auditId, eventType, actor, meta = {}, createdAt = new Date().toISOString()) {
    db.prepare(
      'INSERT INTO audit_events (audit_id, event_type, actor, meta_json, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(auditId, eventType, actor, JSON.stringify(meta), createdAt);
  }

  function hydrateBundle(row) {
    if (!row) return null;
    const audit = parseJsonSafe(row.audit_json, null);
    if (!audit) return null;

    const events = db
      .prepare(
        'SELECT id, audit_id, event_type, actor, meta_json, created_at FROM audit_events WHERE audit_id = ? ORDER BY id DESC LIMIT 30',
      )
      .all(audit.id)
      .map((ev) => ({
        id: ev.id,
        auditId: ev.audit_id,
        eventType: ev.event_type,
        actor: ev.actor,
        meta: parseJsonSafe(ev.meta_json, {}),
        createdAt: ev.created_at,
      }));

    return {
      audit,
      viewCount: Number(row.view_count || 0),
      auditEvents: events,
    };
  }

  function getStats() {
    const totalRow = db.prepare('SELECT COUNT(*) AS cnt FROM audits').get();
    const byStatusRows = db.prepare('SELECT status, COUNT(*) AS cnt FROM audits GROUP BY status').all();
    const tariffRow = db.prepare('SELECT COUNT(*) AS cnt FROM tariff_profiles').get();
    let draftCount = 0;
    let lockedCount = 0;
    for (const row of byStatusRows) {
      if (row.status === 'draft') draftCount = Number(row.cnt || 0);
      if (row.status === 'locked') lockedCount = Number(row.cnt || 0);
    }
    return {
      totalAudits: Number(totalRow?.cnt || 0),
      draftAudits: draftCount,
      lockedAudits: lockedCount,
      tariffProfilesCount: Number(tariffRow?.cnt || 0),
    };
  }

  function listAudits() {
    const rows = db
      .prepare('SELECT id, slug, audit_number, status, currency, audit_json, view_count, created_at, updated_at FROM audits ORDER BY updated_at DESC')
      .all();

    return rows
      .map((row) => {
        const audit = parseJsonSafe(row.audit_json, null);
        if (!audit) return null;
        return {
          id: row.id,
          slug: row.slug,
          auditNumber: row.audit_number ?? audit.auditNumber ?? null,
          status: row.status,
          currency: row.currency,
          viewCount: Number(row.view_count || 0),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          audit,
        };
      })
      .filter((entry) => entry !== null);
  }

  function getAuditById(id) {
    const row = db.prepare('SELECT * FROM audits WHERE id = ?').get(id);
    return hydrateBundle(row);
  }

  function getAuditBySlug(slug) {
    const row = db.prepare('SELECT * FROM audits WHERE slug = ?').get(slug);
    return hydrateBundle(row);
  }

  function getAuditByNumber(auditNumber) {
    const row = db.prepare('SELECT * FROM audits WHERE audit_number = ?').get(auditNumber);
    return hydrateBundle(row);
  }

  function recordPublicView(slugOrNumber) {
    const row = db
      .prepare('SELECT * FROM audits WHERE slug = ? OR audit_number = ?')
      .get(slugOrNumber, slugOrNumber);
    if (!row) return null;
    db.prepare('UPDATE audits SET view_count = view_count + 1 WHERE id = ?').run(row.id);
    return getAuditById(row.id);
  }

  function createAudit(auditInput, actor = 'merchant') {
    const now = auditInput.createdAt || new Date().toISOString();
    const id = auditInput.id || `aud-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const uniqueSlug = ensureUniqueSlug(auditInput.slug || auditInput.title || id, id);
    const audit = {
      ...auditInput,
      id,
      slug: uniqueSlug,
      status: 'draft',
      createdAt: now,
      updatedAt: auditInput.updatedAt || now,
    };

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `INSERT INTO audits
         (id, slug, audit_number, status, currency, audit_json, view_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      ).run(
        audit.id,
        audit.slug,
        audit.auditNumber ?? null,
        audit.status,
        audit.currency,
        JSON.stringify(audit),
        audit.createdAt,
        audit.updatedAt,
      );

      insertEvent(
        audit.id,
        'AUDIT_CREATED',
        actor,
        { slug: audit.slug, currency: audit.currency, discrepancies: audit.summary?.discrepancyCount ?? 0 },
        now,
      );
      db.exec('COMMIT');
      return getAuditById(audit.id);
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      throw err;
    }
  }

  function updateAuditAtomic(id, mutator, actor = 'merchant', eventType = 'AUDIT_UPDATED') {
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare('SELECT * FROM audits WHERE id = ?').get(id);
      if (!row) {
        db.exec('ROLLBACK');
        return null;
      }
      const current = parseJsonSafe(row.audit_json, null);
      if (!current) {
        db.exec('ROLLBACK');
        return null;
      }
      if (current.status === 'locked' || row.status === 'locked') {
        throw makeError(
          'Finalized COD dispute audit report is cryptographically locked against edits.',
          'AUDIT_LOCKED',
          409,
        );
      }

      const next = mutator(current);
      if (!next) {
        db.exec('ROLLBACK');
        return null;
      }

      const uniqueSlug = ensureUniqueSlug(next.slug || current.slug, current.id);
      const now = new Date().toISOString();
      const updated = {
        ...next,
        id: current.id,
        slug: uniqueSlug,
        status: 'draft',
        auditNumber: undefined,
        scopeDigestHex: undefined,
        createdAt: current.createdAt,
        updatedAt: now,
      };

      db.prepare('UPDATE audits SET slug = ?, currency = ?, audit_json = ?, updated_at = ? WHERE id = ?').run(
        updated.slug,
        updated.currency,
        JSON.stringify(updated),
        updated.updatedAt,
        current.id,
      );

      insertEvent(
        current.id,
        eventType,
        actor,
        { discrepancies: updated.summary?.discrepancyCount ?? 0, totalClaimableLeakage: updated.summary?.totalClaimableLeakage ?? 0 },
        now,
      );
      db.exec('COMMIT');
      return getAuditById(current.id);
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      throw err;
    }
  }

  function deleteAudit(id) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare('SELECT id, status FROM audits WHERE id = ?').get(id);
      if (!row) {
        db.exec('ROLLBACK');
        return { deleted: false };
      }
      if (row.status === 'locked') {
        throw makeError(
          'Locked COD dispute report cannot be deleted; duplicate it instead.',
          'AUDIT_LOCKED',
          409,
        );
      }
      db.prepare('DELETE FROM audits WHERE id = ?').run(id);
      db.exec('COMMIT');
      return { deleted: true };
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      throw err;
    }
  }

  function duplicateAudit(id, actor = 'merchant') {
    const sourceBundle = getAuditById(id);
    if (!sourceBundle) return null;
    const src = sourceBundle.audit;
    const now = new Date().toISOString();
    const suffix = crypto.randomBytes(2).toString('hex');
    const newId = `aud-${Date.now().toString(36)}-${suffix}`;
    const cloned = {
      ...src,
      id: newId,
      slug: `${slugify(src.slug, 'audit')}-copy-${suffix}`,
      auditNumber: undefined,
      scopeDigestHex: undefined,
      title: `${src.title} (Copy)`,
      titleAr: src.titleAr ? `${src.titleAr} (نسخة)` : '',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
    return createAudit(cloned, actor);
  }

  function finalizeAuditAtomic({ id, buildCanonicalText, actor = 'merchant' }) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare('SELECT * FROM audits WHERE id = ?').get(id);
      if (!row) {
        db.exec('ROLLBACK');
        return null;
      }
      const current = parseJsonSafe(row.audit_json, null);
      if (!current) {
        db.exec('ROLLBACK');
        return null;
      }
      if (current.status === 'locked' || row.status === 'locked') {
        throw makeError('Audit report is already finalized and locked.', 'ALREADY_LOCKED', 409);
      }

      const now = new Date().toISOString();
      const year = new Date().getUTCFullYear();
      db.prepare(
        'INSERT INTO audit_counters (year, last_seq) VALUES (?, 1) ON CONFLICT(year) DO UPDATE SET last_seq = last_seq + 1',
      ).run(year);
      const seqRow = db.prepare('SELECT last_seq FROM audit_counters WHERE year = ?').get(year);
      const seq = Number(seqRow?.last_seq || 1);
      const auditNumber = `COD-${year}-${String(seq).padStart(4, '0')}`;

      const canonical = buildCanonicalText(current);
      const scopeDigestHex = sha256Hex(canonical);

      const lockedAudit = {
        ...current,
        auditNumber,
        scopeDigestHex,
        status: 'locked',
        updatedAt: now,
      };

      db.prepare(
        'UPDATE audits SET audit_number = ?, status = ?, audit_json = ?, updated_at = ? WHERE id = ?',
      ).run(
        auditNumber,
        'locked',
        JSON.stringify(lockedAudit),
        now,
        current.id,
      );

      insertEvent(
        current.id,
        'AUDIT_FINALIZED',
        actor,
        { auditNumber, scopeDigestHex },
        now,
      );

      db.exec('COMMIT');
      return getAuditById(current.id);
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      throw err;
    }
  }

  function listTariffProfiles() {
    return db
      .prepare('SELECT id, name, courier, currency, tariff_json, created_at, updated_at FROM tariff_profiles ORDER BY updated_at DESC')
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name,
        courier: row.courier,
        currency: row.currency,
        tariff: parseJsonSafe(row.tariff_json, {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
  }

  function saveTariffProfile(profile) {
    const now = new Date().toISOString();
    const id = profile.id || `trf-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
    const name = String(profile.name || 'Custom Courier Tariff').trim();
    const courier = String(profile.courier || 'custom').trim();
    const currency = String(profile.currency || 'SAR').trim();
    const tariffJson = JSON.stringify(profile.tariff);

    db.prepare(
      `INSERT INTO tariff_profiles (id, name, courier, currency, tariff_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         courier = excluded.courier,
         currency = excluded.currency,
         tariff_json = excluded.tariff_json,
         updated_at = excluded.updated_at`,
    ).run(id, name, courier, currency, tariffJson, now, now);

    const saved = db.prepare('SELECT * FROM tariff_profiles WHERE id = ?').get(id);
    return {
      id: saved.id,
      name: saved.name,
      courier: saved.courier,
      currency: saved.currency,
      tariff: parseJsonSafe(saved.tariff_json, {}),
      createdAt: saved.created_at,
      updatedAt: saved.updated_at,
    };
  }

  function deleteTariffProfile(id) {
    const info = db.prepare('DELETE FROM tariff_profiles WHERE id = ?').run(id);
    return { deleted: Number(info.changes || 0) > 0 };
  }

  return {
    sha256Hex,
    getStats,
    listAudits,
    getAuditById,
    getAuditBySlug,
    getAuditByNumber,
    recordPublicView,
    createAudit,
    updateAuditAtomic,
    deleteAudit,
    duplicateAudit,
    finalizeAuditAtomic,
    listTariffProfiles,
    saveTariffProfile,
    deleteTariffProfile,
    close: () => db.close(),
  };
}
