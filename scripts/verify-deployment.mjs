const baseUrl = (process.argv[2] || process.env.DEPLOYMENT_URL || '').replace(/\/$/, '');

if (!baseUrl || !baseUrl.startsWith('https://')) {
  console.error('Usage: npm run verify:deployment -- https://deployment.example.com');
  process.exit(1);
}

const checks = [
  { path: '/', expected: [200], includes: 'https://www.anshatradingco.com' },
  { path: '/parts', expected: [200] },
  { path: '/vehicles', expected: [200] },
  { path: '/banking', expected: [200], includes: 'WIO BANK' },
  { path: '/robots.txt', expected: [200], includes: 'https://www.anshatradingco.com/sitemap.xml' },
  { path: '/sitemap.xml', expected: [200], includes: '<urlset' },
  { path: '/api/health', expected: [200], includes: '"status":"healthy"' },
  { path: '/admin/dashboard', expected: [307, 308], location: '/admin' },
];

let failed = false;

for (const check of checks) {
  try {
    const response = await fetch(`${baseUrl}${check.path}`, { redirect: 'manual' });
    const body = await response.text();
    const statusPassed = check.expected.includes(response.status);
    const contentPassed = !check.includes || body.includes(check.includes);
    const location = response.headers.get('location') || '';
    const redirectPassed = !check.location || location.includes(check.location);
    const securityHeadersPassed =
      response.headers.get('x-content-type-options') === 'nosniff' &&
      response.headers.get('referrer-policy') === 'strict-origin-when-cross-origin';
    const passed = statusPassed && contentPassed && redirectPassed && securityHeadersPassed;

    console.log(`${passed ? 'PASS' : 'FAIL'} ${check.path} (${response.status})`);
    failed ||= !passed;
  } catch (error) {
    console.error(`FAIL ${check.path}: ${error instanceof Error ? error.message : error}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log(`Deployment verification passed for ${baseUrl}`);
