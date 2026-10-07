import { expect, test, type Page, type Route } from '@playwright/test';
import type { PublicPartCard } from '@/lib/public-card-data';

type StockReply = { items: PublicPartCard[]; count: number; error?: string };

function parts(label: string, length = 2): PublicPartCard[] {
  return Array.from({ length }, (_, index) => ({
    id: `88000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name: `${label} part ${index + 1}`, slug: `refresh-fixture-${index + 1}`,
    part_code: `REFRESH-${index + 1}`, part_number: null, oem_number: null,
    brand: 'Toyota', condition: 'used', price: null, price_fob: null, price_cf: null,
    price_cif: null, currency: 'AED', quantity: 1, is_featured: false, show_price: false,
    stock_origin: 'dubai', stock_status: 'available', categories: null,
    part_photos: [], part_compatibility: [],
  }));
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function mockPartsReads(page: Page, reply: (url: URL, index: number) => StockReply | Promise<StockReply>) {
  const requests: URL[] = [];
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info,prefer,range,range-unit',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Range',
  };
  await page.route('**/rest/v1/parts?**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    expect(route.request().method()).toBe('GET');
    const url = new URL(route.request().url());
    expect(url.searchParams.get('is_published')).toBe('eq.true');
    expect(url.searchParams.get('stock_status')).toBe('eq.available');
    expect(url.searchParams.get('select')).not.toMatch(/\*|purchase_price|landed_cost|reserved_customer_id/);
    expect(route.request().headers().prefer).toContain('count=exact');
    requests.push(url);
    const result = await reply(url, requests.length);
    await route.fulfill({
      // The SDK automatically retries 503/520. Use a terminal server error to
      // exercise the UI error/retry state without waiting through SDK backoff.
      status: result.error ? 500 : 200,
      contentType: 'application/json',
      headers: { ...headers, 'Content-Range': `${result.items.length ? `0-${result.items.length - 1}` : '*'}/${result.count}` },
      body: JSON.stringify(result.error
        ? { code: 'PGRST000', message: result.error, details: null, hint: null }
        : result.items),
    });
  });
  return requests;
}

function catalog(page: Page) {
  // React's hidden streaming fragments and Next's route announcer live outside
  // the active public page. Assertions must target the customer-visible catalog.
  return page.locator('#main-content');
}

async function refreshAndWaitForRead(page: Page, status = 200) {
  const completed = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/rest/v1/parts') && response.status() === status);
  const refresh = catalog(page).getByRole('button', { name: 'Refresh stock', exact: true });
  await refresh.click();
  await (await completed).finished();
  // An SSR zero count alone is insufficient evidence that a new read finished.
  await expect(refresh).toBeEnabled();
}

async function expectStock(page: Page, count: number, label: string, length = 2) {
  await expect(catalog(page).getByText(`${count} results`, { exact: true })).toBeVisible();
  await expect(catalog(page).getByText(`Showing ${length} of ${count}`, { exact: true })).toBeVisible();
  await expect(catalog(page).getByRole('heading', { name: `${label} part 1`, exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.setItem('ansha-cookie-consent-v1', JSON.stringify({ analytics: false, functional: false }));
  });
});

test('open parts catalog refreshes its count and cards through manual, same-search and deduplicated focus reads', async ({ page }) => {
  let current: StockReply = { items: parts('Updated 182'), count: 182 };
  let holdFocus: ReturnType<typeof deferred> | undefined;
  const requests = await mockPartsReads(page, async () => {
    if (holdFocus) await holdFocus.promise;
    return current;
  });
  // SSR remains the actual public page; fixtures affect only subsequent browser reads.
  await page.goto('/parts');
  await expect(catalog(page).getByRole('heading', { level: 1, name: 'Automotive parts catalog' })).toBeVisible();
  await expect(catalog(page).getByText(/^\d+ results$/)).toBeVisible();
  const refresh = catalog(page).getByRole('button', { name: 'Refresh stock', exact: true });
  await refresh.click();
  await expectStock(page, 182, 'Updated 182');

  current = { items: parts('Updated 183', 3), count: 183 };
  await refresh.click();
  await expectStock(page, 183, 'Updated 183', 3);
  await expect(page).toHaveURL(/\/parts$/);

  current = { items: parts('Same query 184'), count: 184 };
  await catalog(page).locator('#catalog-search').getByRole('button', { name: 'Search', exact: true }).click();
  await expectStock(page, 184, 'Same query 184');
  await expect(page).toHaveURL(/\/parts$/);

  const beforeFocus = requests.length;
  current = { items: parts('Returned focus 185'), count: 185 };
  holdFocus = deferred();
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
  });
  try {
    await expect.poll(() => requests.length).toBe(beforeFocus + 1);
    await expect(refresh).toBeDisabled();
    await expect(catalog(page).getByText('Checking stock', { exact: true })).toBeVisible();
  } finally { holdFocus.resolve(); }
  await expectStock(page, 185, 'Returned focus 185');
  expect(requests.length).toBe(beforeFocus + 1);
});

test('refresh preserves applied filters and draft search, distinguishes read errors from zero matches, and clears filters', async ({ page }) => {
  let fail = false;
  const requests = await mockPartsReads(page, (url) => {
    if (fail) return { items: [], count: 0, error: 'Stock refresh fixture unavailable' };
    return url.searchParams.has('or')
      ? { items: [], count: 0 }
      : { items: parts('All stock 183'), count: 183 };
  });
  const appliedQuery = 'REFRESH-E2E-NO-MATCH';
  await page.goto(`/parts?q=${appliedQuery}&brand=Toyota&condition=used&stock=dubai&sort=price-high`);
  const search = catalog(page).getByPlaceholder('Search product, OEM number or part code');
  await expect(search).toHaveValue(appliedQuery);
  await search.fill('Unsaved search draft');
  await refreshAndWaitForRead(page);
  await expect(catalog(page).getByText('0 results', { exact: true })).toBeVisible();
  await expect(catalog(page).getByText('Showing 0 of 0', { exact: true })).toBeVisible();
  await expect(catalog(page).getByRole('heading', { name: 'No matching parts found' })).toBeVisible();
  await expect(search).toHaveValue('Unsaved search draft');
  const filtered = requests.at(-1)!;
  expect(filtered.searchParams.get('or')).toContain(appliedQuery);
  expect(filtered.searchParams.get('or')).not.toContain('Unsaved');
  expect(filtered.searchParams.get('brand')).toBe('eq.Toyota');
  expect(filtered.searchParams.get('condition')).toBe('eq.used');
  expect(filtered.searchParams.get('stock_origin')).toBe('eq.dubai');
  expect(filtered.searchParams.get('order')).toContain('price.desc');

  fail = true;
  await refreshAndWaitForRead(page, 500);
  await expect(catalog(page).getByRole('alert')).toContainText('Could not refresh stock');
  await expect(catalog(page).getByText('Stock unavailable', { exact: true })).toBeVisible();
  await expect(catalog(page).getByRole('heading', { name: 'No matching parts found' })).toHaveCount(0);
  await expect(search).toHaveValue('Unsaved search draft');
  await expect(page).toHaveURL(new RegExp(`q=${appliedQuery}.*stock=dubai`));

  fail = false;
  await refreshAndWaitForRead(page);
  await expect(catalog(page).getByText('0 results', { exact: true })).toBeVisible();
  await expect(catalog(page).getByRole('alert')).toHaveCount(0);
  await catalog(page).getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page).toHaveURL(/\/parts$/);
  await expect(search).toHaveValue('');
  await refreshAndWaitForRead(page);
  await expectStock(page, 183, 'All stock 183');
  expect(requests.at(-1)!.searchParams.has('or')).toBe(false);
  expect(requests.at(-1)!.searchParams.has('brand')).toBe(false);
  expect(requests.at(-1)!.searchParams.has('stock_origin')).toBe(false);
});

test('an older in-flight stock refresh cannot replace newer filtered results', async ({ page }) => {
  const oldResponse = deferred();
  let holdOld = false;
  const requests = await mockPartsReads(page, async (url) => {
    if (holdOld && !url.searchParams.has('or')) {
      await oldResponse.promise;
      return { items: parts('Stale unfiltered 999'), count: 999 };
    }
    return { items: [], count: 0 };
  });
  await page.goto('/parts');
  await expect(catalog(page).getByText(/^\d+ results$/)).toBeVisible();
  const before = requests.length;
  holdOld = true;
  const oldDelivered = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/rest/v1/parts') &&
    response.headers()['content-range']?.endsWith('/999') === true);
  await catalog(page).getByRole('button', { name: 'Refresh stock', exact: true }).click();
  await expect.poll(() => requests.length).toBe(before + 1);
  try {
    await catalog(page).getByPlaceholder('Search product, OEM number or part code').fill('REFRESH-E2E-LATEST-EMPTY');
    await catalog(page).locator('#catalog-search').getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/q=REFRESH-E2E-LATEST-EMPTY/);
    await expect(catalog(page).getByText('0 results', { exact: true })).toBeVisible();
    await expect(catalog(page).getByRole('heading', { name: 'No matching parts found' })).toBeVisible();
  } finally { oldResponse.resolve(); }
  await (await oldDelivered).finished();
  // Let fetch parsing and React rendering consume the delivered old payload
  // before checking that its count/cards never replaced the newer result.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect(catalog(page).getByText('999 results', { exact: true })).toHaveCount(0);
  await expect(catalog(page).getByRole('heading', { name: 'Stale unfiltered 999 part 1', exact: true })).toHaveCount(0);
  await expect(catalog(page).getByText('0 results', { exact: true })).toBeVisible();
  await expect(catalog(page).getByRole('heading', { name: 'No matching parts found' })).toBeVisible();
});
