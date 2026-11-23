import { useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import { computeCodUnitEconomics } from '../core/reconcile.ts';
import type { CurrencyCode, Locale } from '../core/types.ts';
import { formatMoney, getCopy } from '../lib/i18n.ts';

interface UnitEconomicsCalcProps {
  locale: Locale;
}

export function UnitEconomicsCalc({ locale }: UnitEconomicsCalcProps) {
  const copy = getCopy(locale);

  const [currency, setCurrency] = useState<CurrencyCode>('SAR');
  const [sellingPrice, setSellingPrice] = useState(249);
  const [cogsPerUnit, setCogsPerUnit] = useState(68);
  const [packagingCost, setPackagingCost] = useState(5);
  const [shippingFee, setShippingFee] = useState(24);
  const [rtoFee, setRtoFee] = useState(12);
  const [codFeePercent, setCodFeePercent] = useState(2);
  const [codFeeFixed, setCodFeeFixed] = useState(5);
  const [vatOnFeesPercent, setVatOnFeesPercent] = useState(15);
  const [deliveryRatePct, setDeliveryRatePct] = useState(70);
  const [adCpaActual, setAdCpaActual] = useState(32);

  const realistic = useMemo(
    () =>
      computeCodUnitEconomics({
        sellingPrice,
        cogsPerUnit,
        packagingCost,
        shippingFee,
        rtoFee,
        codFeePercent,
        codFeeFixed,
        vatOnFeesPercent,
        deliveryRatePct,
        adCpaActual,
      }),
    [
      sellingPrice,
      cogsPerUnit,
      packagingCost,
      shippingFee,
      rtoFee,
      codFeePercent,
      codFeeFixed,
      vatOnFeesPercent,
      deliveryRatePct,
      adCpaActual,
    ],
  );

  const perfect = useMemo(
    () =>
      computeCodUnitEconomics({
        sellingPrice,
        cogsPerUnit,
        packagingCost,
        shippingFee,
        rtoFee,
        codFeePercent,
        codFeeFixed,
        vatOnFeesPercent,
        deliveryRatePct: 100,
        adCpaActual,
      }),
    [
      sellingPrice,
      cogsPerUnit,
      packagingCost,
      shippingFee,
      rtoFee,
      codFeePercent,
      codFeeFixed,
      vatOnFeesPercent,
      adCpaActual,
    ],
  );

  return (
    <section className="cod-card rounded-2xl p-5 sm:p-6 space-y-6" data-testid="unit-economics-calc">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="cod-display flex items-center gap-2 text-xl font-extrabold text-[var(--text-primary)]">
            <Calculator className="h-5 w-5 text-[var(--accent-teal)]" />
            {copy.calcTitle}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[var(--text-secondary)]">{copy.calcSubtitle}</p>
        </div>

        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
          className="cod-input w-auto min-w-[5.5rem] text-xs font-bold"
        >
          <option value="SAR">SAR</option>
          <option value="AED">AED</option>
          <option value="EGP">EGP</option>
          <option value="USD">USD</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Inputs Grid */}
        <div className="lg:col-span-6 space-y-4">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-[var(--text-primary)]">{copy.deliveryRateLabel}</span>
              <span dir="ltr" className="num-tabular text-sm text-[var(--accent-teal)]">
                {deliveryRatePct}% (RTO {100 - deliveryRatePct}%)
              </span>
            </div>
            <input
              type="range"
              min={30}
              max={100}
              step={1}
              value={deliveryRatePct}
              onChange={(e) => setDeliveryRatePct(Number(e.target.value))}
              data-testid="calc-delivery-slider"
              className="w-full accent-[var(--accent-teal)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                {copy.sellingPriceLabel}
              </label>
              <input
                type="number"
                min={0}
                value={sellingPrice}
                onChange={(e) => setSellingPrice(Number(e.target.value) || 0)}
                data-testid="calc-selling-input"
                className="cod-input text-xs"
                dir="ltr"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                {copy.cogsLabel}
              </label>
              <input
                type="number"
                min={0}
                value={cogsPerUnit}
                onChange={(e) => setCogsPerUnit(Number(e.target.value) || 0)}
                className="cod-input text-xs"
                dir="ltr"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                {copy.packagingLabel}
              </label>
              <input
                type="number"
                min={0}
                value={packagingCost}
                onChange={(e) => setPackagingCost(Number(e.target.value) || 0)}
                className="cod-input text-xs"
                dir="ltr"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                {copy.actualCpaLabel}
              </label>
              <input
                type="number"
                min={0}
                value={adCpaActual}
                onChange={(e) => setAdCpaActual(Number(e.target.value) || 0)}
                className="cod-input text-xs"
                dir="ltr"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                {copy.shippingFeeLabel}
              </label>
              <input
                type="number"
                min={0}
                value={shippingFee}
                onChange={(e) => setShippingFee(Number(e.target.value) || 0)}
                className="cod-input text-xs"
                dir="ltr"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                {copy.rtoFeeLabel}
              </label>
              <input
                type="number"
                min={0}
                value={rtoFee}
                onChange={(e) => setRtoFee(Number(e.target.value) || 0)}
                className="cod-input text-xs"
                dir="ltr"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                {copy.codFeePctLabel}
              </label>
              <input
                type="number"
                min={0}
                step="0.1"
                value={codFeePercent}
                onChange={(e) => setCodFeePercent(Number(e.target.value) || 0)}
                className="cod-input text-xs"
                dir="ltr"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                {copy.codFeeFixedLabel} & {copy.vatPctLabel}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={0}
                  value={codFeeFixed}
                  onChange={(e) => setCodFeeFixed(Number(e.target.value) || 0)}
                  className="cod-input text-xs"
                  dir="ltr"
                />
                <input
                  type="number"
                  min={0}
                  value={vatOnFeesPercent}
                  onChange={(e) => setVatOnFeesPercent(Number(e.target.value) || 0)}
                  className="cod-input text-xs"
                  dir="ltr"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Outputs & RTO Comparison */}
        <div className="lg:col-span-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 space-y-1">
              <div className="text-xs text-[var(--text-secondary)]">{copy.breakEvenRoasLabel}</div>
              <div
                data-testid="calc-breakeven-roas"
                className="num-tabular text-2xl font-extrabold text-[var(--accent-teal)]"
              >
                <bdi dir="ltr" className="inline-block whitespace-nowrap">
                  {realistic.breakEvenRoas !== null ? `${realistic.breakEvenRoas}x` : copy.impossibleBreakEven}
                </bdi>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 space-y-1">
              <div className="text-xs text-[var(--text-secondary)]">{copy.breakEvenCpaLabel}</div>
              <div
                data-testid="calc-breakeven-cpa"
                className="num-tabular text-2xl font-extrabold text-[var(--text-primary)]"
              >
                <bdi dir="ltr" className="inline-block whitespace-nowrap">
                  {formatMoney(realistic.breakEvenCpa, currency, locale)}
                </bdi>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 space-y-1">
              <div className="text-xs text-[var(--text-secondary)]">{copy.rtoBurnLabel}</div>
              <div
                data-testid="calc-rto-burn"
                className="num-tabular text-xl font-extrabold text-[var(--accent-amber)]"
              >
                <bdi dir="ltr" className="inline-block whitespace-nowrap">
                  {formatMoney(realistic.rtoCostBurnPerDelivered, currency, locale)}
                </bdi>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 space-y-1">
              <div className="text-xs text-[var(--text-secondary)]">{copy.netDeliveredLabel}</div>
              <div
                data-testid="calc-net-delivered"
                className={`num-tabular text-xl font-extrabold ${
                  realistic.netProfitPerDelivered >= 0
                    ? 'text-[var(--accent-emerald)]'
                    : 'text-[var(--accent-crimson)]'
                }`}
              >
                <bdi dir="ltr" className="inline-block whitespace-nowrap">
                  {formatMoney(realistic.netProfitPerDelivered, currency, locale)}
                </bdi>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 space-y-2.5 text-xs">
            <h2 className="font-bold text-[var(--text-primary)]">{copy.compareTitle}</h2>
            <div className="flex flex-col gap-1 border-b border-[var(--border-subtle)] pb-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[var(--text-secondary)]">
                {copy.compareRealistic} (<bdi dir="ltr">{deliveryRatePct}%</bdi>)
              </span>
              <span className="num-tabular flex flex-wrap items-center gap-x-2 font-bold text-[var(--accent-teal)]">
                <bdi dir="ltr" className="inline-block whitespace-nowrap">
                  ROAS {realistic.breakEvenRoas !== null ? `${realistic.breakEvenRoas}x` : '—'}
                </bdi>
                <span aria-hidden="true">·</span>
                <bdi dir="ltr" className="inline-block whitespace-nowrap">
                  CPA {formatMoney(realistic.breakEvenCpa, currency, locale)}
                </bdi>
              </span>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[var(--text-secondary)]">{copy.comparePerfect} (100%)</span>
              <span className="num-tabular flex flex-wrap items-center gap-x-2 font-semibold text-[var(--text-secondary)]">
                <bdi dir="ltr" className="inline-block whitespace-nowrap">
                  ROAS {perfect.breakEvenRoas !== null ? `${perfect.breakEvenRoas}x` : '—'}
                </bdi>
                <span aria-hidden="true">·</span>
                <bdi dir="ltr" className="inline-block whitespace-nowrap">
                  CPA {formatMoney(perfect.breakEvenCpa, currency, locale)}
                </bdi>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
