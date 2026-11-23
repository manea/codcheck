import { useMemo, useState } from 'react';
import { FileUp, Play, Sparkles } from 'lucide-react';
import {
  autoDetectCourierMapping,
  autoDetectStoreMapping,
  parseDelimitedText,
} from '../core/csvParser.ts';
import type {
  CourierColumnMapping,
  CurrencyCode,
  Locale,
  StoreColumnMapping,
  TariffRule,
} from '../core/types.ts';
import { createCsvAuditApi } from '../lib/api.ts';
import { getCopy } from '../lib/i18n.ts';

interface CsvUploadModalProps {
  locale: Locale;
  onCreatedAudit: (auditId: string) => void;
}

const SAMPLE_STORE_CSV = [
  'AWB,Order ID,Status,COD Amount,City,SKU,Product Cost,Packaging,Ad Spend,Ship Date',
  'TRK-201,ORD-901,Delivered,240,Riyadh,PERFUME-OUD,60,5,25,2026-11-18',
  'TRK-202,ORD-902,Delivered,190,Jeddah,MUSK-OIL,45,5,22,2026-11-18',
  'TRK-203,ORD-903,RTO,240,Dammam,PERFUME-OUD,60,5,25,2026-11-18',
].join('\n');

const SAMPLE_COURIER_CSV = [
  'AWB,Status,Collected COD,Shipping Fee,RTO Fee,COD Fee,VAT',
  'TRK-201,Delivered,240,32,0,9.80,6.27',
  'TRK-203,Returned,0,22,12,0,5.10',
].join('\n');

export function CsvUploadModal({ locale, onCreatedAudit }: CsvUploadModalProps) {
  const copy = getCopy(locale);

  const [title, setTitle] = useState(
    locale === 'ar' ? 'مطابقة كشف شحن مخصص' : 'Custom Courier Settlement Audit',
  );
  const [storeName, setStoreName] = useState(locale === 'ar' ? 'متجر العزم' : 'Al-Azm Store');
  const [courierName, setCourierName] = useState('SMSA Express');
  const [currency, setCurrency] = useState<CurrencyCode>('SAR');
  const [referenceDate, setReferenceDate] = useState('2026-11-24');

  const [storeCsv, setStoreCsv] = useState('');
  const [courierCsv, setCourierCsv] = useState('');

  const [customStoreMap, setCustomStoreMap] = useState<Partial<StoreColumnMapping>>({});
  const [customCourierMap, setCustomCourierMap] = useState<Partial<CourierColumnMapping>>({});

  const [tariff, setTariff] = useState<TariffRule>({
    shippingFee: 22,
    rtoFee: 12,
    codFeePercent: 2,
    codFeeFixed: 5,
    vatOnFeesPercent: 15,
    settlementSlaDays: 7,
    feeTolerance: 0.25,
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const parsedStore = useMemo(() => parseDelimitedText(storeCsv), [storeCsv]);
  const parsedCourier = useMemo(() => parseDelimitedText(courierCsv), [courierCsv]);

  const effectiveStoreMap = useMemo(
    () => ({ ...autoDetectStoreMapping(parsedStore.headers), ...customStoreMap }),
    [parsedStore.headers, customStoreMap],
  );
  const effectiveCourierMap = useMemo(
    () => ({ ...autoDetectCourierMapping(parsedCourier.headers), ...customCourierMap }),
    [parsedCourier.headers, customCourierMap],
  );

  async function handleFileSelect(
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'store' | 'courier',
  ) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    if (target === 'store') {
      setStoreCsv(text);
      setCustomStoreMap({});
    } else {
      setCourierCsv(text);
      setCustomCourierMap({});
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!storeCsv.trim()) {
      setErrorMsg(
        locale === 'ar'
          ? 'يرجى رفع أو لصق بيانات طلبات المتجر أولاً.'
          : 'Please upload or paste store orders CSV data first.',
      );
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const created = await createCsvAuditApi({
        title: title.trim() || 'Custom COD Audit',
        titleAr: title.trim() || 'تدقيق COD مخصص',
        storeName: storeName.trim() || 'Merchant Store',
        courierName: courierName.trim() || 'Courier',
        platform: 'custom',
        courier: 'custom',
        currency,
        defaultLocale: locale,
        referenceDate,
        tariff,
        storeCsv,
        courierCsv,
        storeMapping: effectiveStoreMap,
        courierMapping: effectiveCourierMap,
      });
      onCreatedAudit(created.audit.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process CSV batch');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="cod-card rounded-2xl p-5 sm:p-6 space-y-5" data-testid="csv-upload-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="cod-display text-xl font-extrabold text-[var(--text-primary)]">
            {copy.uploadPanelTitle}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[var(--text-secondary)]">
            {copy.uploadPanelSubtitle}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setStoreCsv(SAMPLE_STORE_CSV);
            setCourierCsv(SAMPLE_COURIER_CSV);
            setCustomStoreMap({});
            setCustomCourierMap({});
          }}
          data-testid="load-sample-csv-btn"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-bold text-[var(--accent-teal)] hover:border-[var(--accent-teal)]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {locale === 'ar' ? 'تعبئة مثال CSV تجريبي' : 'Load Sample CSV Pair'}
        </button>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              {copy.auditTitleLabel}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="csv-title-input"
              className="cod-input text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              {copy.storeNameLabel}
            </label>
            <input
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="cod-input text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              {copy.courierNameLabel}
            </label>
            <input
              type="text"
              value={courierName}
              onChange={(e) => setCourierName(e.target.value)}
              className="cod-input text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                {copy.currencyLabel}
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="cod-input text-xs"
              >
                <option value="SAR">SAR</option>
                <option value="AED">AED</option>
                <option value="EGP">EGP</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                {copy.refDateLabel}
              </label>
              <input
                type="date"
                value={referenceDate}
                onChange={(e) => setReferenceDate(e.target.value)}
                className="cod-input text-xs"
                dir="ltr"
              />
            </div>
          </div>
        </div>

        {/* Store + Courier CSV Inputs Side by Side */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Store CSV */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                {copy.storeCsvTitle}
              </h2>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-bold text-[var(--accent-teal)]">
                <FileUp className="h-3.5 w-3.5" />
                {copy.uploadCsvFileBtn}
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv"
                  className="hidden"
                  onChange={(e) => void handleFileSelect(e, 'store')}
                  data-testid="store-csv-file"
                />
              </label>
            </div>

            <textarea
              rows={5}
              value={storeCsv}
              onChange={(e) => setStoreCsv(e.target.value)}
              placeholder={copy.pasteCsvHint}
              data-testid="store-csv-textarea"
              className="cod-input font-mono text-xs"
              dir="ltr"
            />

            {parsedStore.headers.length > 0 && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-[var(--text-secondary)]">{copy.mapAwbLabel}</span>
                  <select
                    value={effectiveStoreMap.awb}
                    onChange={(e) => setCustomStoreMap({ ...customStoreMap, awb: e.target.value })}
                    className="cod-input text-xs py-1"
                  >
                    {parsedStore.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--text-secondary)]">{copy.mapStatusLabel}</span>
                  <select
                    value={effectiveStoreMap.status}
                    onChange={(e) =>
                      setCustomStoreMap({ ...customStoreMap, status: e.target.value })
                    }
                    className="cod-input text-xs py-1"
                  >
                    {parsedStore.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--text-secondary)]">{copy.mapCodLabel}</span>
                  <select
                    value={effectiveStoreMap.codAmount}
                    onChange={(e) =>
                      setCustomStoreMap({ ...customStoreMap, codAmount: e.target.value })
                    }
                    className="cod-input text-xs py-1"
                  >
                    {parsedStore.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--text-secondary)]">{copy.mapCityLabel}</span>
                  <select
                    value={effectiveStoreMap.city ?? ''}
                    onChange={(e) =>
                      setCustomStoreMap({
                        ...customStoreMap,
                        city: e.target.value || undefined,
                      })
                    }
                    className="cod-input text-xs py-1"
                  >
                    <option value="">—</option>
                    {parsedStore.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Courier CSV */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                {copy.courierCsvTitle}
              </h2>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-bold text-[var(--accent-teal)]">
                <FileUp className="h-3.5 w-3.5" />
                {copy.uploadCsvFileBtn}
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv"
                  className="hidden"
                  onChange={(e) => void handleFileSelect(e, 'courier')}
                  data-testid="courier-csv-file"
                />
              </label>
            </div>

            <textarea
              rows={5}
              value={courierCsv}
              onChange={(e) => setCourierCsv(e.target.value)}
              placeholder={copy.pasteCsvHint}
              data-testid="courier-csv-textarea"
              className="cod-input font-mono text-xs"
              dir="ltr"
            />

            {parsedCourier.headers.length > 0 && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-[var(--text-secondary)]">{copy.mapAwbLabel}</span>
                  <select
                    value={effectiveCourierMap.awb}
                    onChange={(e) =>
                      setCustomCourierMap({ ...customCourierMap, awb: e.target.value })
                    }
                    className="cod-input text-xs py-1"
                  >
                    {parsedCourier.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {copy.mapCollectedLabel}
                  </span>
                  <select
                    value={effectiveCourierMap.collectedCod}
                    onChange={(e) =>
                      setCustomCourierMap({ ...customCourierMap, collectedCod: e.target.value })
                    }
                    className="cod-input text-xs py-1"
                  >
                    {parsedCourier.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {copy.mapShippingLabel}
                  </span>
                  <select
                    value={effectiveCourierMap.shippingFee}
                    onChange={(e) =>
                      setCustomCourierMap({ ...customCourierMap, shippingFee: e.target.value })
                    }
                    className="cod-input text-xs py-1"
                  >
                    {parsedCourier.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {copy.mapRtoFeeLabel}
                  </span>
                  <select
                    value={effectiveCourierMap.rtoFee ?? ''}
                    onChange={(e) =>
                      setCustomCourierMap({
                        ...customCourierMap,
                        rtoFee: e.target.value || undefined,
                      })
                    }
                    className="cod-input text-xs py-1"
                  >
                    <option value="">—</option>
                    {parsedCourier.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tariff Inputs Row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[var(--text-secondary)]">
              {copy.shippingFeeLabel}
            </label>
            <input
              type="number"
              min={0}
              step="0.5"
              value={tariff.shippingFee}
              onChange={(e) => setTariff({ ...tariff, shippingFee: Number(e.target.value) || 0 })}
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
              min={0}
              step="0.5"
              value={tariff.rtoFee}
              onChange={(e) => setTariff({ ...tariff, rtoFee: Number(e.target.value) || 0 })}
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
              min={0}
              step="0.1"
              value={tariff.codFeePercent}
              onChange={(e) => setTariff({ ...tariff, codFeePercent: Number(e.target.value) || 0 })}
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
              min={0}
              step="0.5"
              value={tariff.codFeeFixed}
              onChange={(e) => setTariff({ ...tariff, codFeeFixed: Number(e.target.value) || 0 })}
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
              min={0}
              step="0.5"
              value={tariff.vatOnFeesPercent}
              onChange={(e) =>
                setTariff({ ...tariff, vatOnFeesPercent: Number(e.target.value) || 0 })
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
              min={1}
              step="1"
              value={tariff.settlementSlaDays}
              onChange={(e) =>
                setTariff({
                  ...tariff,
                  settlementSlaDays: Math.max(1, Number(e.target.value) || 1),
                })
              }
              className="cod-input text-xs"
              dir="ltr"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-[var(--accent-crimson-soft)] px-3.5 py-2 text-xs font-bold text-[var(--accent-crimson)]">
            {errorMsg}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            data-testid="run-csv-audit-btn"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-teal)] px-5 py-2.5 text-sm font-bold text-[var(--accent-teal-fg)] hover:bg-[var(--accent-teal-hover)] disabled:opacity-60"
          >
            <Play className="h-4 w-4" />
            {submitting ? copy.runningAuditBtn : copy.runAuditBtn}
          </button>
        </div>
      </form>
    </section>
  );
}
