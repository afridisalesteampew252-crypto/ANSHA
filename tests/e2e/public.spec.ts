import { expect, test } from '@playwright/test';

// Optional cloud transport: Node uses the environment's existing trusted proxy
// CA. No browser trust settings change; rendered bytes are fetched with TLS
// verification from the actual public storage URL, rather than fixture images.
test.beforeEach(async ({ page }) => {
  if (process.env.PLAYWRIGHT_PROXY_PUBLIC_IMAGES !== '1') return;
  const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
  await page.route(`${origin}/storage/v1/object/public/**`, async (route) => {
    if (route.request().resourceType() !== 'image' || route.request().method() !== 'GET') return route.continue();
    const response = await fetch(route.request().url(), { signal: AbortSignal.timeout(15_000) });
    await route.fulfill({
      status: response.status,
      contentType: response.headers.get('content-type') || 'application/octet-stream',
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
});

const pages = [
  ['home', '/', /smarter way to source vehicles & parts/i],
  ['parts', '/parts', /Automotive parts catalog/i],
  ['vehicles', '/vehicles', /vehicles for global markets/i],
  ['machinery', '/machinery', /Heavy machinery|commercial vehicles/i],
  ['insights', '/blog', /Used Japanese cars, parts & export insights/i],
  ['search', '/search', /Find vehicles and parts/i],
] as const;

for (const [name, path, heading] of pages) {
  test(`public ${name} page loads`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.ok(), `${path} returned ${response?.status()}`).toBeTruthy();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  });
}

test('mobile navigation keeps catalog search and public support one tap away', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/about');
  const navigation = page.getByRole('navigation', { name: 'ANSHA mobile app navigation' });
  await expect(navigation.getByRole('link', { name: 'Search' })).toHaveAttribute('href', '/search');
  await expect(navigation.getByRole('link', { name: /Chat with ANSHA on WhatsApp/ })).toHaveAttribute('href', /^https:\/\/wa\.me\//);
});

test('keyboard users can skip repeated navigation', async ({ page }) => {
  await page.goto('/about');
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skipLink).toBeFocused();
  await skipLink.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('header search uses the combined catalog search', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/about');
  await page.getByRole('searchbox', { name: 'Search catalog' }).fill('Toyota');
  await page.getByRole('button', { name: 'Search', exact: true }).first().click();
  await expect(page).toHaveURL(/\/search\?q=Toyota$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Find vehicles and parts' })).toBeVisible();
});

test('desktop More menu toggles on click', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/about');
  const more = page.locator('summary').filter({ hasText: 'More' });
  await more.click();
  await expect(page.getByRole('menuitem', { name: 'Insights' })).toBeVisible();
  await more.click();
  await expect(page.getByRole('menuitem', { name: 'Insights' })).not.toBeVisible();
});

function imageKey(src: string) {
  const url = new URL(src, 'http://playwright.local');
  return url.pathname === '/_next/image' ? url.searchParams.get('url') || src : url.pathname;
}

test('updated blog images match on Insights and Home', async ({ page }) => {
  await page.goto('/');
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Latest from ANSHA' }) });
  const cards = section.locator('a[href^="/blog/"]:has(img)');
  await expect(cards.first()).toBeVisible();
  const articles = await cards.evaluateAll((nodes) => nodes.map((node) => ({
    href: node.getAttribute('href'),
    src: node.querySelector('img')?.getAttribute('src'),
  })));
  expect(articles.length).toBeGreaterThan(0);

  await page.goto('/blog');
  for (const article of articles) {
    const image = page.locator(`a[href="${article.href}"] img`).first();
    await expect(image).toBeVisible();
    await image.scrollIntoViewIfNeeded();
    expect(imageKey((await image.getAttribute('src'))!)).toBe(imageKey(article.src!));
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);
  }
});
