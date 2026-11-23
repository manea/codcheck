import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Languages,
  Lock,
  Moon,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { buildCourierDisputeMessage, verifyAuditIntegrity } from '../core/auditDigest.ts';
import type { DiscrepancySeverity, Locale, TariffRule } from '../core/types.ts';
import {
  ApiError,
  duplicateAuditApi,
  finalizeAuditApi,
  getAudit,
  getPublicReport,
  patchAuditTariffApi,
  triggerAuditCsvDownload,
  type AuditBundle,
} from '../lib/api.ts';
import { withBase } from '../lib/basePath.ts';
import {
  discrepancyLabel,
  formatMoney,
  formatShortDate,
  getCopy,
  orderStatusLabel,
  severityLabel,
} from '../lib/i18n.ts';

interface AuditWorkspaceProps {
  mode: 'studio' | 'public';
  auditIdOrSlug: string;
  locale: Locale;
  theme: 'ivory' | 'vault';
  onToggleLocale?: () => void;
  onToggleTheme?: () => void;
  onBackToStudio?: () => void;
  onAuditChanged?: () => void;
  onOpenClonedAudit?: (newId: string) => void;
}

type DetailTab = 'discrepancies' | 'cities' | 'skus' | 'orders';
type SevFilter = 'all' | 'critical' | 'warning';

export function AuditWorkspace({
  mode,
  auditIdOrSlug,
  locale,
  theme,
  onToggleLocale,
  onToggleTheme,
  onBackToStudio,
  onAuditChanged,
  onOpenClonedAudit,
}: AuditWorkspaceProps) {
  const copy = getCopy(locale);
  const [bundle, setBundle] = useState<AuditBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [busyAction, setBusyAction] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');

  const [detailTab, setDetailTab] = useState<DetailTab>('discrepancies');
  const [sevFilter, setSevFilter] = useState<SevFilter>('all');
  const [integrityValid, setIntegrityValid] = useState<boolean | null>(null);

  const [tariffDraft, setTariffDraft] = useState<TariffRule | null>(null);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res =
        mode === 'studio' ? await getAudit(auditIdOrSlug) : await getPublicReport(auditIdOrSlug);
      setBundle(res);
      setTariffDraft({ ...res.audit.tariff });
    } catch (err) {
      setBundle(null);
      setErrorMsg(err instanceof Error ? err.message : copy.notFoundBody);
    } finally {
      setLoading(false);
    }
  }, [auditIdOrSlug, copy.notFoundBody, mode]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  useEffect(() => {
    let active = true;
    if (!bundle || bundle.audit.status !== 'locked') {
      setIntegrityValid(null);
      return;
    }
    void verifyAuditIntegrity(bundle.audit).then((res) => {
      if (active) setIntegrityValid(res.valid);
    });
    return () => {
      active = false;
    };
  }, [bundle]);

  const filteredDiscrepancies = useMemo(() => {
    if (!bundle) return [];
    if (sevFilter === 'all') return bundle.audit.discrepancies;
    if (sevFilter === 'critical') {
      return bundle.audit.discrepancies.filter((d) => d.severity === 'critical');
    }
    return bundle.audit.discrepancies.filter((d) => d.severity !== 'critical');
  }, [bundle, sevFilter]);

  function flashCopied(key: string, text: string) {
    try {
      void navigator.clipboard.writeText(text);
    } catch {
      // ignore clipboard errors in headless mode
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? '' : prev)), 2000);
  }

  async function handleRecalculateTariff(e: React.FormEvent) {
    e.preventDefault();
    if (!bundle || !tariffDraft || busyAction) return;
    setBusyAction(true);
    setErrorMsg('');
    try {
      const updated = await patchAuditTariffApi(bundle.audit.id, tariffDraft);
      setBundle(updated);
      setTariffDraft({ ...updated.audit.tariff });
      onAuditChanged?.();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to recalculate tariff';
      setErrorMsg(msg);
    } finally {
      setBusyAction(false);
    }
  }

  async function handleFinalize() {
    if (!bundle || busyAction) return;
    setBusyAction(true);
    setErrorMsg('');
    try {
      const locked = await finalizeAuditApi(bundle.audit.id);
      setBundle(locked);
      onAuditChanged?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Finalization failed');
    } finally {
      setBusyAction(false);
    }
  }

  async function handleDuplicate() {
    if (!bundle || busyAction) return;
    setBusyAction(true);
    setErrorMsg('');
    try {
      const cloned = await duplicateAuditApi(bundle.audit.id);
      onAuditChanged?.();
      if (onOpenClonedAudit) {
        onOpenClonedAudit(cloned.audit.id);
      } else {
        setBundle(cloned);
        setTariffDraft({ ...cloned.audit.tariff });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to duplicate');
    } finally {
      setBusyAction(false);
    }
  }

  const BackIcon = locale === 'ar' ? ArrowRight : ArrowLeft;

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-[var(--text-secondary)]">
        {copy.loadingLabel}
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="cod-card mx-auto max-w-xl rounded-2xl p-8 text-center space-y-4">
        <AlertTriangle className="mx-auto h-10 w-10 text-[var(--accent-amber)]" />
        <h1 className="cod-display text-xl font-bold text-[var(--text-primary)]">{copy.notFoundTitle}</h1>
        <p className="text-sm text-[var(--text-secondary)]">{errorMsg || copy.notFoundBody}</p>
        {onBackToStudio && (
          <button
            type="button"
            onClick={onBackToStudio}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-teal)] px-4 py-2 text-sm font-bold text-[var(--accent-teal-fg)]"
          >
            <BackIcon className="h-4 w-4" />
            {copy.backToStudio}
          </button>
        )}
      </div>
    );
  }

  const { audit } = bundle;
  const s = audit.summary;
  const localizedTitle = locale === 'ar' ? audit.titleAr || audit.title : audit.title;
  const disputeMsg =
    locale === 'ar'
      ? bundle.disputeMessageAr || buildCourierDisputeMessage(audit, 'ar')
      : bundle.disputeMessageEn || buildCourierDisputeMessage(audit, 'en');
  const publicUrl =
    bundle.publicReportUrl ||
    `${window.location.origin}${withBase(`/r/${encodeURIComponent(audit.auditNumber || audit.slug)}`)}`;

  const severityPill = (sev: DiscrepancySeverity) => {
    if (sev === 'critical') {
      return 'bg-[var(--accent-crimson-soft)] text-[var(--accent-crimson)]';
    }
    if (sev === 'warning') {
      return 'bg-[var(--accent-amber-soft)] text-[var(--accent-amber)]';
    }
    return 'bg-[var(--accent-cobalt-soft)] text-[var(--accent-cobalt)]';
  };

  return (
    <div className="space-y-5" data-testid="audit-workspace">
      {/* Action Header Bar */}
      <section className="cod-card rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            {onBackToStudio && (
              <button
                type="button"
                onClick={onBackToStudio}
                data-testid="audit-back-studio-btn"
                className="no-print inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
              >
                <BackIcon className="h-3.5 w-3.5" />
                {copy.backToStudio}
              </button>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    audit.status === 'locked'
                      ? 'bg-[var(--accent-emerald-soft)] text-[var(--accent-emerald)]'
                      : 'bg-[var(--accent-amber-soft)] text-[var(--accent-amber)]'
                  }`}
                >
                  {audit.status === 'locked' && <Lock className="h-3 w-3" />}
                  {audit.status === 'locked' ? copy.statusLocked : copy.statusDraft}
                </span>
                {audit.auditNumber && (
                  <span
                    dir="ltr"
                    className="num-tabular inline-block rounded-full bg-[var(--bg-elevated)] px-2.5 py-0.5 font-mono text-xs font-bold text-[var(--text-primary)]"
                  >
                    {audit.auditNumber}
                  </span>
                )}
              </div>
              <h1 className="cod-display mt-1 text-lg sm:text-xl font-extrabold text-[var(--text-primary)]">
                {localizedTitle}
              </h1>
              <p className="text-xs text-[var(--text-secondary)]">
                {audit.storeName} · {audit.courierName} · {formatShortDate(audit.referenceDate, locale)}
              </p>
            </div>
          </div>

          <div className="no-print flex flex-wrap items-center gap-2">
            {mode === 'public' && onToggleLocale && (
              <button
                type="button"
                onClick={onToggleLocale}
                data-testid="toggle-locale-btn"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]"
              >
                <Languages className="h-3.5 w-3.5" />
                {copy.langSwitch}
              </button>
            )}
            {mode === 'public' && onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                data-testid="toggle-theme-btn"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]"
              >
                {theme === 'ivory' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                {theme === 'ivory' ? copy.themeVault : copy.themeIvory}
              </button>
            )}

            <button
              type="button"
              onClick={() => triggerAuditCsvDownload(audit, locale)}
              data-testid="export-csv-btn"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              <Download className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
              {copy.exportCsvBtn}
            </button>

            <button
              type="button"
              onClick={() => flashCopied('dispute', disputeMsg)}
              data-testid="copy-dispute-btn"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              {copiedKey === 'dispute' ? <Check className="h-3.5 w-3.5 text-[var(--accent-emerald)]" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedKey === 'dispute' ? copy.copiedLabel : copy.copyDisputeBtn}
            </button>

            <button
              type="button"
              onClick={() => flashCopied('link', publicUrl)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              {copiedKey === 'link' ? <Check className="h-3.5 w-3.5 text-[var(--accent-emerald)]" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedKey === 'link' ? copy.copiedLabel : copy.copyPublicLinkBtn}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              data-testid="print-report-btn"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              <Printer className="h-3.5 w-3.5" />
              {copy.printPdfBtn}
            </button>

            {mode === 'studio' && (
              <button
                type="button"
                disabled={busyAction}
                onClick={() => void handleDuplicate()}
                data-testid="duplicate-audit-btn"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {copy.duplicateBtn}
              </button>
            )}

            {mode === 'studio' && audit.status === 'draft' && (
              <button
                type="button"
                disabled={busyAction}
                onClick={() => void handleFinalize()}
                data-testid="finalize-audit-btn"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-teal)] px-4 py-2 text-xs font-bold text-[var(--accent-teal-fg)] hover:bg-[var(--accent-teal-hover)] disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4" />
                {busyAction ? copy.finalizingBtn : copy.finalizeBtn}
              </button>
            )}
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-[var(--accent-crimson)]/40 bg-[var(--accent-crimson-soft)] px-3.5 py-2 text-xs font-bold text-[var(--accent-crimson)]"
          >
            {errorMsg}
          </div>
        )}

        {audit.status === 'locked' && audit.scopeDigestHex && (
          <div className="print-avoid-break rounded-xl border border-[var(--accent-emerald)]/35 bg-[var(--accent-emerald-soft)] p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[var(--accent-emerald)]">
              <span className="inline-flex items-center gap-1.5">
                {integrityValid === false ? (
                  <AlertTriangle className="h-4 w-4 text-[var(--accent-crimson)]" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {integrityValid === false ? copy.tamperWarningText : copy.verifiedSealText}
              </span>
              {audit.auditNumber && (
                <span dir="ltr" className="num-tabular font-mono">
                  {audit.auditNumber}
                </span>
              )}
            </div>
            <code
              dir="ltr"
              data-testid="audit-scope-digest"
              className="block break-all rounded-lg bg-[var(--bg-surface)] px-3 py-1.5 font-mono text-[11px] text-[var(--text-primary)]"
            >
              {audit.scopeDigestHex}
            </code>
          </div>
        )}
      </section>

      {/* 6 Audit KPI Cards */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="cod-card rounded-2xl p-4 space-y-1">
          <div className="text-xs font-semibold text-[var(--text-secondary)]">{copy.kpiLeakage}</div>
          <div
            data-testid="kpi-leakage"
            className="num-tabular text-2xl font-extrabold text-[var(--accent-crimson)]"
          >
            <bdi dir="ltr" className="inline-block whitespace-nowrap">
              {formatMoney(s.totalClaimableLeakage, audit.currency, locale)}
            </bdi>
          </div>
        </div>

        <div className="cod-card rounded-2xl p-4 space-y-1">
          <div className="text-xs font-semibold text-[var(--text-secondary)]">{copy.kpiMissingRemittance}</div>
          <div className="num-tabular text-2xl font-extrabold text-[var(--text-primary)]">
            <bdi dir="ltr" className="inline-block whitespace-nowrap">
              {formatMoney(s.missingRemittanceTotal, audit.currency, locale)}
            </bdi>
          </div>
        </div>

        <div className="cod-card rounded-2xl p-4 space-y-1">
          <div className="text-xs font-semibold text-[var(--text-secondary)]">{copy.kpiOvercharges}</div>
          <div className="num-tabular text-2xl font-extrabold text-[var(--accent-amber)]">
            <bdi dir="ltr" className="inline-block whitespace-nowrap">
              {formatMoney(s.totalOvercharges, audit.currency, locale)}
            </bdi>
          </div>
        </div>

        <div className="cod-card rounded-2xl p-4 space-y-1">
          <div className="text-xs font-semibold text-[var(--text-secondary)]">{copy.kpiDeliveryRto}</div>
          <div className="num-tabular text-xl font-extrabold text-[var(--text-primary)]">
            <bdi dir="ltr" className="inline-block whitespace-nowrap">
              {s.deliveryRatePct}% / {s.rtoRatePct}% RTO
            </bdi>
          </div>
        </div>

        <div className="cod-card rounded-2xl p-4 space-y-1">
          <div className="text-xs font-semibold text-[var(--text-secondary)]">{copy.kpiNetPayout}</div>
          <div className="num-tabular flex flex-wrap items-baseline gap-1.5 text-lg font-extrabold text-[var(--accent-teal)]">
            <bdi dir="ltr" className="inline-block whitespace-nowrap">
              {formatMoney(s.actualNetPayout, audit.currency, locale)}
            </bdi>
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              / <bdi dir="ltr" className="inline-block whitespace-nowrap">{formatMoney(s.expectedNetPayout, audit.currency, locale)}</bdi>
            </span>
          </div>
        </div>

        <div className="cod-card rounded-2xl p-4 space-y-1">
          <div className="text-xs font-semibold text-[var(--text-secondary)]">{copy.kpiNetProfit}</div>
          <div
            className={`num-tabular text-2xl font-extrabold ${
              s.estimatedNetProfit >= 0 ? 'text-[var(--accent-emerald)]' : 'text-[var(--accent-crimson)]'
            }`}
          >
            <bdi dir="ltr" className="inline-block whitespace-nowrap">
              {formatMoney(s.estimatedNetProfit, audit.currency, locale)}
            </bdi>
          </div>
        </div>
      </section>

      {/* Editable Contract Tariff Panel (Studio Draft Only) */}
      {mode === 'studio' && audit.status === 'draft' && tariffDraft && (
        <form
          onSubmit={(e) => void handleRecalculateTariff(e)}
          className="no-print cod-card rounded-2xl p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="cod-display text-sm font-extrabold text-[var(--text-primary)]">
              {copy.tariffTitle}
            </h2>
            <button
              type="submit"
              disabled={busyAction}
              data-testid="recalculate-tariff-btn"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-teal)] px-3.5 py-2 text-xs font-bold text-[var(--accent-teal-fg)] hover:bg-[var(--accent-teal-hover)] disabled:opacity-60"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {copy.recalcTariffBtn}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[var(--text-secondary)]">
                {copy.shippingFeeLabel}
              </label>
              <input
                type="number"
                step="0.5"
                min={0}
                value={tariffDraft.shippingFee}
                onChange={(e) =>
                  setTariffDraft({ ...tariffDraft, shippingFee: Number(e.target.value) || 0 })
                }
                data-testid="tariff-shipping-input"
                className="cod-input text-xs"
                dir="ltr"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[var(--text-secondary)]">
                {copy.rtoFeeLabel}
              </label>
              <input
                type="number"
                step="0.5"
                min={0}
                value={tariffDraft.rtoFee}
                onChange={(e) =>
                  setTariffDraft({ ...tariffDraft, rtoFee: Number(e.target.value) || 0 })
                }
                className="cod-input text-xs"
                dir="ltr"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[var(--text-secondary)]">
                {copy.codFeePctLabel}
              </label>
              <input
                type="number"
                step="0.1"
                min={0}
                value={tariffDraft.codFeePercent}
                onChange={(e) =>
                  setTariffDraft({ ...tariffDraft, codFeePercent: Number(e.target.value) || 0 })
                }
                className="cod-input text-xs"
                dir="ltr"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[var(--text-secondary)]">
                {copy.codFeeFixedLabel}
              </label>
              <input
                type="number"
                step="0.5"
                min={0}
                value={tariffDraft.codFeeFixed}
                onChange={(e) =>
                  setTariffDraft({ ...tariffDraft, codFeeFixed: Number(e.target.value) || 0 })
                }
                className="cod-input text-xs"
                dir="ltr"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[var(--text-secondary)]">
                {copy.vatPctLabel}
              </label>
              <input
                type="number"
                step="0.5"
                min={0}
                value={tariffDraft.vatOnFeesPercent}
                onChange={(e) =>
                  setTariffDraft({ ...tariffDraft, vatOnFeesPercent: Number(e.target.value) || 0 })
                }
                className="cod-input text-xs"
                dir="ltr"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[var(--text-secondary)]">
                {copy.slaDaysLabel}
              </label>
              <input
                type="number"
                step="1"
                min={1}
                value={tariffDraft.settlementSlaDays}
                onChange={(e) =>
                  setTariffDraft({
                    ...tariffDraft,
                    settlementSlaDays: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                className="cod-input text-xs"
                dir="ltr"
              />
            </div>
          </div>
        </form>
      )}

      {/* Breakdown Tabs Section */}
      <section className="cod-card rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { key: 'discrepancies', label: `${copy.tabDiscrepancies} (${audit.discrepancies.length})` },
                { key: 'cities', label: `${copy.tabCities} (${audit.byCity.length})` },
                { key: 'skus', label: `${copy.tabSkus} (${audit.bySku.length})` },
                { key: 'orders', label: `${copy.tabOrders} (${audit.lines.length})` },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setDetailTab(t.key)}
                data-testid={`tab-${t.key}`}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  detailTab === t.key
                    ? 'bg-[var(--accent-teal)] text-[var(--accent-teal-fg)]'
                    : 'border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {detailTab === 'discrepancies' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { key: 'all', label: copy.sevAll },
                  { key: 'critical', label: copy.sevCritical },
                  { key: 'warning', label: copy.sevWarning },
                ] as const
              ).map((pill) => (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => setSevFilter(pill.key)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                    sevFilter === pill.key
                      ? 'bg-[var(--text-primary)] text-[var(--bg-surface)]'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 1. Discrepancies View */}
        {detailTab === 'discrepancies' && (
          filteredDiscrepancies.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--text-secondary)]">
              {copy.noDiscrepancies}
            </div>
          ) : (
            <>
              {/* Mobile Cards (<sm, hidden on print) */}
              <div className="space-y-2.5 sm:hidden print:hidden">
                {filteredDiscrepancies.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5 space-y-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span dir="ltr" className="num-tabular font-mono font-bold text-[var(--text-primary)]">
                        {item.awb}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${severityPill(item.severity)}`}>
                        {severityLabel(item.severity, locale)} · {discrepancyLabel(item.type, locale)}
                      </span>
                    </div>
                    <p className="leading-relaxed text-[var(--text-primary)]">
                      {locale === 'ar' ? item.messageAr : item.messageEn}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2">
                      <span className="text-[var(--text-secondary)]">
                        {item.orderId || '—'} {item.city ? `· ${item.city}` : ''}
                      </span>
                      <span dir="ltr" className="num-tabular font-extrabold text-[var(--accent-crimson)]">
                        {formatMoney(item.varianceAmount, audit.currency, locale)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop & Print Table */}
              <div className="hidden sm:block print:block overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
                <table className="w-full min-w-[680px] border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
                      <th className="px-3 py-2.5 text-start font-bold whitespace-nowrap">{copy.colAwb}</th>
                      <th className="px-3 py-2.5 text-start font-bold whitespace-nowrap">{copy.colType}</th>
                      <th className="px-3 py-2.5 text-end font-bold whitespace-nowrap">{copy.colExpected}</th>
                      <th className="px-3 py-2.5 text-end font-bold whitespace-nowrap">{copy.colActual}</th>
                      <th className="px-3 py-2.5 text-end font-bold whitespace-nowrap">{copy.colVariance}</th>
                      <th className="px-3 py-2.5 text-start font-bold">{copy.colDetails}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {filteredDiscrepancies.map((item) => (
                      <tr key={item.id}>
                        <td className="num-tabular px-3 py-2.5 font-mono font-bold text-[var(--text-primary)]" dir="ltr">
                          {item.awb}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${severityPill(item.severity)}`}>
                            {discrepancyLabel(item.type, locale)}
                          </span>
                        </td>
                        <td className="num-tabular px-3 py-2.5 text-end whitespace-nowrap text-[var(--text-secondary)]" dir="ltr">
                          {item.expectedAmount.toFixed(2)}
                        </td>
                        <td className="num-tabular px-3 py-2.5 text-end whitespace-nowrap text-[var(--text-secondary)]" dir="ltr">
                          {item.actualAmount.toFixed(2)}
                        </td>
                        <td className="num-tabular px-3 py-2.5 text-end whitespace-nowrap font-extrabold text-[var(--accent-crimson)]" dir="ltr">
                          {formatMoney(item.varianceAmount, audit.currency, locale)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-[var(--text-primary)]">
                          {locale === 'ar' ? item.messageAr : item.messageEn}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}

        {/* 2. Cities Breakdown */}
        {detailTab === 'cities' && (
          <>
            <div className="space-y-2.5 sm:hidden print:hidden">
              {audit.byCity.map((c) => (
                <div
                  key={c.key}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between font-bold text-[var(--text-primary)]">
                    <span>{c.key}</span>
                    <span dir="ltr" className="num-tabular text-[var(--accent-amber)]">
                      {c.rtoRatePct}% RTO
                    </span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-[var(--text-secondary)]">
                    <span>
                      {copy.colOrdersTotal}: <span dir="ltr">{c.totalOrders}</span> ({c.deliveredOrders}✓ / {c.rtoOrders}✗)
                    </span>
                    <span dir="ltr" className="num-tabular font-bold text-[var(--text-primary)]">
                      {formatMoney(c.netProfit, audit.currency, locale)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden sm:block print:block overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full min-w-[600px] border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
                    <th className="px-3 py-2.5 text-start font-bold">{copy.colCity}</th>
                    <th className="px-3 py-2.5 text-center font-bold">{copy.colOrdersTotal}</th>
                    <th className="px-3 py-2.5 text-center font-bold">{copy.colDelivered}</th>
                    <th className="px-3 py-2.5 text-center font-bold">{copy.colRto}</th>
                    <th className="px-3 py-2.5 text-end font-bold">{copy.colRtoRate}</th>
                    <th className="px-3 py-2.5 text-end font-bold">{copy.colNetPayout}</th>
                    <th className="px-3 py-2.5 text-end font-bold">{copy.colNetProfit}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {audit.byCity.map((c) => (
                    <tr key={c.key}>
                      <td className="px-3 py-2.5 font-bold text-[var(--text-primary)]">{c.key}</td>
                      <td className="num-tabular px-3 py-2.5 text-center">{c.totalOrders}</td>
                      <td className="num-tabular px-3 py-2.5 text-center text-[var(--accent-emerald)] font-bold">
                        {c.deliveredOrders}
                      </td>
                      <td className="num-tabular px-3 py-2.5 text-center text-[var(--accent-crimson)] font-bold">
                        {c.rtoOrders}
                      </td>
                      <td className="num-tabular px-3 py-2.5 text-end font-bold" dir="ltr">
                        {c.rtoRatePct}%
                      </td>
                      <td className="num-tabular px-3 py-2.5 text-end" dir="ltr">
                        {formatMoney(c.actualNetPayout, audit.currency, locale)}
                      </td>
                      <td className="num-tabular px-3 py-2.5 text-end font-bold" dir="ltr">
                        {formatMoney(c.netProfit, audit.currency, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 3. SKU Breakdown */}
        {detailTab === 'skus' && (
          <>
            <div className="space-y-2.5 sm:hidden print:hidden">
              {audit.bySku.map((skuRow) => (
                <div
                  key={skuRow.key}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between font-bold text-[var(--text-primary)]">
                    <span>{skuRow.key}</span>
                    <span dir="ltr" className="num-tabular text-[var(--accent-teal)]">
                      {formatMoney(skuRow.netProfit, audit.currency, locale)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>
                      {skuRow.deliveredOrders}✓ / {skuRow.rtoOrders}✗
                    </span>
                    <span dir="ltr">{skuRow.rtoRatePct}% RTO</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden sm:block print:block overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full min-w-[600px] border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
                    <th className="px-3 py-2.5 text-start font-bold">SKU</th>
                    <th className="px-3 py-2.5 text-center font-bold">{copy.colOrdersTotal}</th>
                    <th className="px-3 py-2.5 text-center font-bold">{copy.colDelivered}</th>
                    <th className="px-3 py-2.5 text-center font-bold">{copy.colRto}</th>
                    <th className="px-3 py-2.5 text-end font-bold">{copy.colRtoRate}</th>
                    <th className="px-3 py-2.5 text-end font-bold">{copy.colNetProfit}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {audit.bySku.map((skuRow) => (
                    <tr key={skuRow.key}>
                      <td className="px-3 py-2.5 font-bold text-[var(--text-primary)]">{skuRow.key}</td>
                      <td className="num-tabular px-3 py-2.5 text-center">{skuRow.totalOrders}</td>
                      <td className="num-tabular px-3 py-2.5 text-center text-[var(--accent-emerald)] font-bold">
                        {skuRow.deliveredOrders}
                      </td>
                      <td className="num-tabular px-3 py-2.5 text-center text-[var(--accent-crimson)] font-bold">
                        {skuRow.rtoOrders}
                      </td>
                      <td className="num-tabular px-3 py-2.5 text-end font-bold" dir="ltr">
                        {skuRow.rtoRatePct}%
                      </td>
                      <td className="num-tabular px-3 py-2.5 text-end font-bold" dir="ltr">
                        {formatMoney(skuRow.netProfit, audit.currency, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 4. All Shipments Ledger */}
        {detailTab === 'orders' && (
          <>
            <div className="space-y-2.5 sm:hidden print:hidden">
              {audit.lines.map((line) => (
                <div
                  key={line.awb}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span dir="ltr" className="num-tabular font-mono font-bold text-[var(--text-primary)]">
                      {line.awb}
                    </span>
                    <span className="rounded bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] font-bold">
                      {orderStatusLabel(line.storeStatus, locale)}
                    </span>
                  </div>
                  <div className="text-[var(--text-secondary)]">
                    {line.orderId} · {line.city} · {line.sku}
                  </div>
                  <div className="flex justify-between pt-1">
                    <span>{copy.colNetPayout}</span>
                    <span dir="ltr" className="num-tabular font-bold text-[var(--text-primary)]">
                      {formatMoney(line.actualNetPayout, audit.currency, locale)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden sm:block print:block overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full min-w-[660px] border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
                    <th className="px-3 py-2.5 text-start font-bold">{copy.colAwb}</th>
                    <th className="px-3 py-2.5 text-start font-bold">{copy.colOrder}</th>
                    <th className="px-3 py-2.5 text-start font-bold">{copy.colStatus}</th>
                    <th className="px-3 py-2.5 text-start font-bold">{copy.colCity}</th>
                    <th className="px-3 py-2.5 text-end font-bold">{copy.colCollected}</th>
                    <th className="px-3 py-2.5 text-end font-bold">{copy.colFees}</th>
                    <th className="px-3 py-2.5 text-end font-bold">{copy.colNetPayout}</th>
                    <th className="px-3 py-2.5 text-end font-bold">{copy.colVariance}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {audit.lines.map((line) => (
                    <tr key={line.awb}>
                      <td className="num-tabular px-3 py-2.5 font-mono font-bold text-[var(--text-primary)]" dir="ltr">
                        {line.awb}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--text-secondary)]">{line.orderId}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-semibold">
                        {orderStatusLabel(line.storeStatus, locale)}
                      </td>
                      <td className="px-3 py-2.5">{line.city}</td>
                      <td className="num-tabular px-3 py-2.5 text-end" dir="ltr">
                        {line.collectedCod.toFixed(2)}
                      </td>
                      <td className="num-tabular px-3 py-2.5 text-end" dir="ltr">
                        {line.chargedTotalFees.toFixed(2)}
                      </td>
                      <td className="num-tabular px-3 py-2.5 text-end font-bold" dir="ltr">
                        {line.actualNetPayout.toFixed(2)}
                      </td>
                      <td
                        className={`num-tabular px-3 py-2.5 text-end font-bold ${
                          line.claimableVariance > 0 ? 'text-[var(--accent-crimson)]' : 'text-[var(--text-secondary)]'
                        }`}
                        dir="ltr"
                      >
                        {line.claimableVariance > 0 ? line.claimableVariance.toFixed(2) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Ready-to-Send Courier Dispute Letter */}
      <section className="cod-card rounded-2xl p-4 sm:p-5 space-y-3" data-testid="dispute-message-box">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="cod-display text-sm font-extrabold text-[var(--text-primary)]">
            {copy.disputeTitle}
          </h2>
          <button
            type="button"
            onClick={() => flashCopied('dispute-box', disputeMsg)}
            className="no-print inline-flex items-center gap-1.5 rounded-lg bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)]"
          >
            {copiedKey === 'dispute-box' ? <Check className="h-3.5 w-3.5 text-[var(--accent-emerald)]" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedKey === 'dispute-box' ? copy.copiedLabel : copy.copyDisputeBtn}
          </button>
        </div>
        <textarea
          readOnly
          rows={7}
          value={disputeMsg}
          className="cod-input font-mono text-xs leading-relaxed"
        />
      </section>
    </div>
  );
}
