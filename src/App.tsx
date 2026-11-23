import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  FileUp,
  Languages,
  Lock,
  Moon,
  Plus,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import { AuditWorkspace } from './components/AuditWorkspace.tsx';
import { CsvUploadModal } from './components/CsvUploadModal.tsx';
import { UnitEconomicsCalc } from './components/UnitEconomicsCalc.tsx';
import type { CodCheckPresetMeta } from './core/presets.ts';
import type { Locale } from './core/types.ts';
import {
  ApiError,
  createAuditFromPresetApi,
  deleteAuditApi,
  duplicateAuditApi,
  fetchPresets,
  listAudits,
  type AuditListRecord,
  type AuditStats,
  type PresetSummary,
} from './lib/api.ts';
import { stripBase, withBase } from './lib/basePath.ts';
import { formatMoney, formatShortDate, getCopy } from './lib/i18n.ts';

type ThemeMode = 'ivory' | 'vault';
type StudioTab = 'audits' | 'upload' | 'calculator';
type AuditFilter = 'all' | 'draft' | 'locked';

type AppRoute =
  | { kind: 'studio' }
  | { kind: 'public'; slugOrNumber: string };

function parseRoute(pathname: string): AppRoute {
  const clean = stripBase(pathname).replace(/\/+$/, '') || '/';
  const match = /^\/r\/([^/]+)$/.exec(clean);
  if (match?.[1]) {
    try {
      return { kind: 'public', slugOrNumber: decodeURIComponent(match[1]) };
    } catch {
      return { kind: 'public', slugOrNumber: match[1] };
    }
  }
  return { kind: 'studio' };
}

function readInitialLocale(): Locale {
  try {
    const saved = window.localStorage.getItem('codcheck_locale');
    if (saved === 'en' || saved === 'ar') return saved;
  } catch {
    // ignore storage restriction
  }
  return 'ar';
}

function readInitialTheme(): ThemeMode {
  try {
    const saved = window.localStorage.getItem('codcheck_theme');
    if (saved === 'vault' || saved === 'ivory') return saved;
  } catch {
    // ignore storage restriction
  }
  return 'ivory';
}

export function App() {
  const [locale, setLocale] = useState<Locale>(readInitialLocale);
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme);
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.pathname));

  const [activeTab, setActiveTab] = useState<StudioTab>('audits');
  const [activeAuditId, setActiveAuditId] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState<AuditFilter>('all');

  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [audits, setAudits] = useState<AuditListRecord[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loadingStudio, setLoadingStudio] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState('');

  const copy = getCopy(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    try {
      window.localStorage.setItem('codcheck_locale', locale);
    } catch {
      // ignore
    }
  }, [locale]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'vault' ? '#0B111E' : '#FBF9F5');
    }
    try {
      window.localStorage.setItem('codcheck_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    const onPopState = () => {
      const next = parseRoute(window.location.pathname);
      setRoute(next);
      if (next.kind === 'studio') {
        setActiveAuditId(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    const fullPath = withBase(to);
    if (window.location.pathname !== fullPath) {
      window.history.pushState({}, '', fullPath);
    }
    const next = parseRoute(fullPath);
    setRoute(next);
    if (next.kind === 'studio') {
      setActiveAuditId(null);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const refreshStudioData = useCallback(async () => {
    setLoadingStudio(true);
    try {
      const [presetList, auditList] = await Promise.all([fetchPresets(), listAudits()]);
      setPresets(presetList);
      setAudits(auditList.audits);
      setStats(auditList.stats);
      setErrorBanner('');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to load workspace');
    } finally {
      setLoadingStudio(false);
    }
  }, []);

  useEffect(() => {
    if (route.kind === 'studio') {
      void refreshStudioData();
    }
  }, [route.kind, refreshStudioData]);

  const toggleLocale = useCallback(() => {
    setLocale((prev) => (prev === 'ar' ? 'en' : 'ar'));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'ivory' ? 'vault' : 'ivory'));
  }, []);

  async function handleRunPreset(presetId: CodCheckPresetMeta['id']) {
    if (busyKey) return;
    setBusyKey(`pre:${presetId}`);
    setErrorBanner('');
    try {
      const created = await createAuditFromPresetApi(presetId);
      await refreshStudioData();
      setActiveTab('audits');
      setActiveAuditId(created.audit.id);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to create audit');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDuplicateAudit(id: string) {
    if (busyKey) return;
    setBusyKey(`dup:${id}`);
    setErrorBanner('');
    try {
      const cloned = await duplicateAuditApi(id);
      await refreshStudioData();
      setActiveTab('audits');
      setActiveAuditId(cloned.audit.id);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to duplicate audit');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDeleteAudit(id: string) {
    if (busyKey) return;
    setBusyKey(`del:${id}`);
    setErrorBanner('');
    try {
      await deleteAuditApi(id);
      await refreshStudioData();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to delete audit';
      setErrorBanner(msg);
    } finally {
      setBusyKey(null);
    }
  }

  const filteredAudits = useMemo(() => {
    if (auditFilter === 'all') return audits;
    return audits.filter((a) => a.status === auditFilter);
  }, [audits, auditFilter]);

  const avgRtoPct = useMemo(() => {
    if (audits.length === 0) return 0;
    const sum = audits.reduce((acc, item) => acc + (item.audit.summary.rtoRatePct || 0), 0);
    return Math.round((sum / audits.length) * 10) / 10;
  }, [audits]);

  const totalDiscrepanciesCount = useMemo(() => {
    return audits.reduce((acc, item) => acc + (item.audit.summary.discrepancyCount || 0), 0);
  }, [audits]);

  if (route.kind === 'public') {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)]">
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <AuditWorkspace
            mode="public"
            auditIdOrSlug={route.slugOrNumber}
            locale={locale}
            theme={theme}
            onToggleLocale={toggleLocale}
            onToggleTheme={toggleTheme}
            onBackToStudio={() => navigate('/')}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Studio Sticky Header */}
      <header className="no-print sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={() => {
              setActiveAuditId(null);
              setActiveTab('audits');
            }}
            className="flex items-center gap-2.5 text-start"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-teal)] text-[var(--accent-teal-fg)] shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span>
              <span className="cod-display block text-base font-extrabold leading-tight text-[var(--text-primary)]">
                {copy.brandName}
              </span>
              <span className="block text-xs text-[var(--text-secondary)]">
                {copy.brandTagline}
              </span>
            </span>
          </button>

          <nav className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1">
            <button
              type="button"
              onClick={() => {
                setActiveAuditId(null);
                setActiveTab('audits');
              }}
              data-testid="nav-audits-btn"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                activeTab === 'audits' && !activeAuditId
                  ? 'bg-[var(--bg-surface)] text-[var(--accent-teal)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {copy.navAudits}
              <span className="num-tabular rounded-full bg-[var(--bg-soft)] px-1.5 py-0.5 text-[10px] text-[var(--accent-teal)]">
                {audits.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveAuditId(null);
                setActiveTab('upload');
              }}
              data-testid="nav-upload-btn"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                activeTab === 'upload' && !activeAuditId
                  ? 'bg-[var(--bg-surface)] text-[var(--accent-teal)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <FileUp className="h-3.5 w-3.5" />
              {copy.navUpload}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveAuditId(null);
                setActiveTab('calculator');
              }}
              data-testid="nav-calc-btn"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                activeTab === 'calculator' && !activeAuditId
                  ? 'bg-[var(--bg-surface)] text-[var(--accent-teal)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Calculator className="h-3.5 w-3.5" />
              {copy.navCalculator}
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleLocale}
              data-testid="toggle-locale-btn"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              <Languages className="h-3.5 w-3.5" />
              {copy.langSwitch}
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              data-testid="toggle-theme-btn"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              {theme === 'ivory' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
              {theme === 'ivory' ? copy.themeVault : copy.themeIvory}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 space-y-6">
        {errorBanner && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--accent-crimson)]/40 bg-[var(--accent-crimson-soft)] px-4 py-3 text-sm text-[var(--accent-crimson)]"
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorBanner}
            </span>
            <button
              type="button"
              onClick={() => setErrorBanner('')}
              className="text-xs font-bold underline"
            >
              ×
            </button>
          </div>
        )}

        {activeAuditId ? (
          <AuditWorkspace
            mode="studio"
            auditIdOrSlug={activeAuditId}
            locale={locale}
            theme={theme}
            onBackToStudio={() => {
              setActiveAuditId(null);
              void refreshStudioData();
            }}
            onAuditChanged={() => {
              void refreshStudioData();
            }}
            onOpenClonedAudit={(newId) => {
              setActiveAuditId(newId);
            }}
          />
        ) : activeTab === 'upload' ? (
          <CsvUploadModal
            locale={locale}
            onCreatedAudit={(newId) => {
              void refreshStudioData();
              setActiveTab('audits');
              setActiveAuditId(newId);
            }}
          />
        ) : activeTab === 'calculator' ? (
          <UnitEconomicsCalc locale={locale} />
        ) : (
          <>
            {/* Hero + KPI Overview */}
            <section className="cod-card rounded-2xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl space-y-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-soft)] px-3 py-1 text-xs font-bold text-[var(--accent-teal)]">
                    <Sparkles className="h-3.5 w-3.5" />
                    {copy.heroBadge}
                  </span>
                  <h1 className="cod-display text-2xl sm:text-3xl font-extrabold leading-snug text-[var(--text-primary)]">
                    {copy.heroTitle}
                  </h1>
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                    {copy.heroSubtitle}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('upload')}
                    data-testid="hero-upload-cta"
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-teal)] px-4 py-2.5 text-xs font-bold text-[var(--accent-teal-fg)] hover:bg-[var(--accent-teal-hover)]"
                  >
                    <FileUp className="h-4 w-4" />
                    {copy.heroUploadCta}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('calculator')}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                  >
                    <Calculator className="h-4 w-4 text-[var(--accent-teal)]" />
                    {copy.heroCalcCta}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span>{copy.statTotalAudits}</span>
                    <FileSpreadsheet className="h-4 w-4 text-[var(--accent-teal)]" />
                  </div>
                  <div className="num-tabular mt-1.5 text-2xl font-extrabold text-[var(--text-primary)]">
                    {stats?.totalAudits ?? audits.length}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span>{copy.statLockedReports}</span>
                    <CheckCircle2 className="h-4 w-4 text-[var(--accent-emerald)]" />
                  </div>
                  <div className="num-tabular mt-1.5 text-2xl font-extrabold text-[var(--text-primary)]">
                    {stats?.lockedAudits ?? audits.filter((a) => a.status === 'locked').length}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span>{copy.statLeakageFound}</span>
                    <AlertCircle className="h-4 w-4 text-[var(--accent-crimson)]" />
                  </div>
                  <div className="num-tabular mt-1.5 text-2xl font-extrabold text-[var(--accent-crimson)]">
                    {totalDiscrepanciesCount}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span>{copy.statAvgRto}</span>
                    <Calculator className="h-4 w-4 text-[var(--accent-amber)]" />
                  </div>
                  <div className="num-tabular mt-1.5 text-2xl font-extrabold text-[var(--text-primary)]">
                    <bdi dir="ltr" className="inline-block whitespace-nowrap">{avgRtoPct}%</bdi>
                  </div>
                </div>
              </div>
            </section>

            {/* Starter MENA/GCC Presets */}
            <section className="space-y-3">
              <div>
                <h2 className="cod-display text-lg font-extrabold text-[var(--text-primary)]">
                  {copy.presetsTitle}
                </h2>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                  {copy.presetsSubtitle}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                {presets.map((preset) => {
                  const creating = busyKey === `pre:${preset.id}`;
                  return (
                    <div
                      key={preset.id}
                      className="cod-card flex flex-col justify-between rounded-2xl p-4 space-y-4"
                    >
                      <div className="space-y-2">
                        <span className="inline-block rounded-full bg-[var(--bg-soft)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--accent-teal)]">
                          {locale === 'ar' ? preset.badgeAr : preset.badgeEn}
                        </span>
                        <h3 className="cod-display text-sm font-bold leading-snug text-[var(--text-primary)]">
                          {locale === 'ar' ? preset.nameAr : preset.nameEn}
                        </h3>
                      </div>
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() => void handleRunPreset(preset.id)}
                        data-testid={`create-preset-${preset.id}`}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-teal)] hover:text-[var(--accent-teal)] disabled:opacity-60"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {creating ? copy.loadingLabel : copy.createPresetBtn}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Saved Audits List */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="cod-display text-lg font-extrabold text-[var(--text-primary)]">
                  {copy.auditsListTitle}
                </h2>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { key: 'all', label: copy.filterAll },
                      { key: 'draft', label: copy.filterDraft },
                      { key: 'locked', label: copy.filterLocked },
                    ] as const
                  ).map((pill) => (
                    <button
                      key={pill.key}
                      type="button"
                      onClick={() => setAuditFilter(pill.key)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                        auditFilter === pill.key
                          ? 'bg-[var(--accent-teal)] text-[var(--accent-teal-fg)]'
                          : 'border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
              </div>

              {loadingStudio ? (
                <div className="py-10 text-center text-sm text-[var(--text-secondary)]">
                  {copy.loadingLabel}
                </div>
              ) : filteredAudits.length === 0 ? (
                <div className="cod-card rounded-2xl p-8 text-center text-sm text-[var(--text-secondary)]">
                  {copy.noAudits}
                </div>
              ) : (
                <div className="space-y-3" data-testid="audits-list">
                  {filteredAudits.map((item) => {
                    const a = item.audit;
                    const title = locale === 'ar' ? a.titleAr || a.title : a.title;
                    return (
                      <article
                        key={a.id}
                        className="cod-card flex flex-col gap-4 rounded-2xl p-5 lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                a.status === 'locked'
                                  ? 'bg-[var(--accent-emerald-soft)] text-[var(--accent-emerald)]'
                                  : 'bg-[var(--accent-amber-soft)] text-[var(--accent-amber)]'
                              }`}
                            >
                              {a.status === 'locked' && <Lock className="h-3 w-3" />}
                              {a.status === 'locked' ? copy.statusLocked : copy.statusDraft}
                            </span>
                            {a.auditNumber && (
                              <span
                                dir="ltr"
                                className="num-tabular rounded-full bg-[var(--accent-emerald-soft)] px-2.5 py-0.5 font-mono text-[11px] font-bold text-[var(--accent-emerald)]"
                              >
                                {a.auditNumber}
                              </span>
                            )}
                            <span dir="ltr" className="num-tabular text-xs font-extrabold text-[var(--accent-crimson)]">
                              {formatMoney(a.summary.totalClaimableLeakage, a.currency, locale)}
                            </span>
                          </div>

                          <h3 className="cod-display text-base font-extrabold text-[var(--text-primary)] truncate">
                            {title}
                          </h3>
                          <p className="text-xs text-[var(--text-secondary)]">
                            {a.storeName} · {a.courierName} ·{' '}
                            <span dir="ltr" className="inline-block">
                              RTO {a.summary.rtoRatePct}%
                            </span>{' '}
                            · {formatShortDate(item.updatedAt, locale)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveAuditId(a.id)}
                            data-testid={`open-audit-${a.slug}`}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-teal)] px-3.5 py-2 text-xs font-bold text-[var(--accent-teal-fg)] hover:bg-[var(--accent-teal-hover)]"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            {copy.openAuditBtn}
                          </button>

                          <button
                            type="button"
                            onClick={() => navigate(`/r/${encodeURIComponent(a.auditNumber || a.slug)}`)}
                            data-testid={`open-public-${a.slug}`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {copy.openPublicBtn}
                          </button>

                          <button
                            type="button"
                            disabled={busyKey !== null}
                            onClick={() => void handleDuplicateAudit(a.id)}
                            title={copy.duplicateBtn}
                            className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>

                          {a.status !== 'locked' && (
                            <button
                              type="button"
                              disabled={busyKey !== null}
                              onClick={() => void handleDeleteAudit(a.id)}
                              title={copy.deleteBtn}
                              className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-2 text-xs font-medium text-[var(--accent-crimson)] hover:bg-[var(--accent-crimson-soft)] disabled:opacity-60"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
