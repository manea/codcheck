import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

async function assertNoHorizontalOverflow(page: Page) {
  const dims = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(dims.scrollWidth).toBeLessThanOrEqual(dims.innerWidth);
}

test.describe('CODCheck — Courier COD Reconciliation, CSV Auditor & Break-Even ROAS E2E', () => {
  test('defaults to Arabic RTL / Ledger Ivory, toggles English LTR / Vault Slate, and persists across reload', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await expect(page.getByTestId('create-preset-ksa-salla-smsa')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ivory');

    await page.screenshot({
      path: 'test-results/qa-screenshots/01-studio-ar-ivory.png',
    });

    await page.getByTestId('toggle-locale-btn').click();
    await page.getByTestId('toggle-theme-btn').click();

    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'vault');

    await page.screenshot({
      path: 'test-results/qa-screenshots/02-studio-en-vault.png',
    });

    await page.reload();
    await expect(page.getByTestId('create-preset-ksa-salla-smsa')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'vault');

    // Restore Arabic RTL / Ledger Ivory defaults
    await page.getByTestId('toggle-locale-btn').click();
    await page.getByTestId('toggle-theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ivory');

    expect(errors).toEqual([]);
  });

  test('executes full settlement audit: preset creation, tariff recalculation, tabs, BOM CSV export, SHA-256 finalization & /r/COD-YYYY-0001 public view', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    const year = new Date().getUTCFullYear();
    const expectedAuditNum = `COD-${year}-0001`;

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await page.getByTestId('create-preset-ksa-salla-smsa').click();
    await expect(page.getByTestId('audit-workspace')).toBeVisible();

    const initialLeakage = (await page.getByTestId('kpi-leakage').textContent()) ?? '';
    expect(initialLeakage.trim().length).toBeGreaterThan(0);

    // Lower contracted shipping fee from 24 to 18 and recalculate -> leakage increases as overcharged shipping triggers across delivered orders
    await page.getByTestId('tariff-shipping-input').fill('18');
    await page.getByTestId('recalculate-tariff-btn').click();
    await expect(page.getByTestId('kpi-leakage')).not.toHaveText(initialLeakage);

    // Verify all breakdown tabs work cleanly
    await page.getByTestId('tab-cities').click();
    await expect(page.getByTestId('audit-workspace')).toContainText('الرياض');

    await page.getByTestId('tab-skus').click();
    await expect(page.getByTestId('audit-workspace')).toContainText('عطر دهن ملكي');

    await page.getByTestId('tab-orders').click();
    await expect(page.getByTestId('audit-workspace')).toContainText('SMSA-9011');

    await page.getByTestId('tab-discrepancies').click();

    await page.screenshot({
      path: 'test-results/qa-screenshots/03-audit-workspace-desktop.png',
      fullPage: true,
    });

    // Verify UTF-8 BOM CSV export download
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-csv-btn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('codcheck-');
    expect(download.suggestedFilename()).toContain('.csv');
    const dlPath = await download.path();
    expect(dlPath).toBeTruthy();
    if (dlPath) {
      const bytes = fs.readFileSync(dlPath);
      expect(bytes[0]).toBe(0xef);
      expect(bytes[1]).toBe(0xbb);
      expect(bytes[2]).toBe(0xbf);
      const csvText = bytes.toString('utf8');
      expect(csvText).toContain('SMSA-9013');
    }

    // Verify courier dispute message box contains actionable evidence
    await expect(page.getByTestId('dispute-message-box')).toContainText('SMSA-9013');

    // Finalize atomically with COD-YYYY-0001 + SHA-256 integrity seal
    await page.getByTestId('finalize-audit-btn').click();
    await expect(page.getByTestId('audit-scope-digest')).toHaveText(/^[0-9a-f]{64}$/);
    await expect(page.getByTestId('audit-workspace')).toContainText(expectedAuditNum);
    await expect(page.getByTestId('finalize-audit-btn')).toHaveCount(0);

    // Return to studio dashboard and open public report (/r/COD-YYYY-0001)
    await page.getByTestId('audit-back-studio-btn').click();
    await expect(page.getByTestId('audits-list')).toBeVisible();
    await expect(page.getByTestId('audits-list')).toContainText(expectedAuditNum);

    await page.locator('[data-testid^="open-public-"]').first().click();
    await expect(page).toHaveURL(new RegExp(`/r/${expectedAuditNum}$`));
    await expect(page.getByTestId('audit-workspace')).toBeVisible();
    await expect(page.getByTestId('audit-scope-digest')).toHaveText(/^[0-9a-f]{64}$/);
    await expect(page.getByTestId('finalize-audit-btn')).toHaveCount(0);

    await page.screenshot({
      path: 'test-results/qa-screenshots/04-locked-public-report-desktop.png',
      fullPage: true,
    });

    // Reload public link directly -> stays intact and locked
    await page.reload();
    await expect(page.getByTestId('audit-scope-digest')).toHaveText(/^[0-9a-f]{64}$/);

    expect(errors).toEqual([]);
  });

  test('runs custom CSV batch auditor & Break-Even ROAS calculator with zero horizontal overflow on 390x844 mobile across all views', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // 1. Custom CSV upload & interactive column mapping
    await page.getByTestId('nav-upload-btn').click();
    await expect(page.getByTestId('csv-upload-panel')).toBeVisible();

    await page.getByTestId('load-sample-csv-btn').click();
    await page.getByTestId('csv-title-input').fill('تدقيق سمسا المخصص — دفعة تجريبية');
    await page.getByTestId('run-csv-audit-btn').click();

    await expect(page.getByTestId('audit-workspace')).toBeVisible();
    await expect(page.getByTestId('audit-workspace')).toContainText('TRK-202');

    // Switch to Mobile Viewport (390x844) and check zero horizontal overflow across views
    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(page); // (a) Mobile Audit Workspace

    await page.screenshot({
      path: 'test-results/qa-screenshots/05-audit-mobile-ar.png',
      fullPage: true,
    });

    // Check all mobile breakdown tabs stay within viewport width
    await page.getByTestId('tab-cities').click();
    await assertNoHorizontalOverflow(page);
    await page.getByTestId('tab-skus').click();
    await assertNoHorizontalOverflow(page);
    await page.getByTestId('tab-orders').click();
    await assertNoHorizontalOverflow(page);

    // Return to Studio Dashboard on mobile
    await page.getByTestId('audit-back-studio-btn').click();
    await expect(page.getByTestId('audits-list')).toBeVisible();
    await assertNoHorizontalOverflow(page); // (b) Mobile Studio Dashboard

    // Check CSV Upload panel on mobile
    await page.getByTestId('nav-upload-btn').click();
    await expect(page.getByTestId('csv-upload-panel')).toBeVisible();
    await assertNoHorizontalOverflow(page); // (c) Mobile CSV Upload

    // Check Break-Even ROAS Calculator on mobile and live slider reactivity
    await page.getByTestId('nav-calc-btn').click();
    await expect(page.getByTestId('unit-economics-calc')).toBeVisible();
    const roasBefore = ((await page.getByTestId('calc-breakeven-roas').textContent()) ?? '').trim();

    await page.getByTestId('calc-delivery-slider').fill('55');
    const roasAfter = ((await page.getByTestId('calc-breakeven-roas').textContent()) ?? '').trim();
    expect(roasAfter).not.toBe(roasBefore);

    await assertNoHorizontalOverflow(page); // (d) Mobile ROAS Calculator
    await page.screenshot({
      path: 'test-results/qa-screenshots/06-roas-calc-mobile-ar.png',
      fullPage: true,
    });

    expect(errors).toEqual([]);
  });
});
