import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function loadTypeScript(filename, imports) {
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require(name) {
      if (!Object.hasOwn(imports, name)) throw new Error(`Unexpected dependency: ${name}`);
      return imports[name];
    },
  }, { filename });
  return exports;
}

const { sanitizeBlogHtml } = loadTypeScript('lib/sanitize-html.ts', {
  'sanitize-html': require('sanitize-html'),
});

const dirty = '<h2>Heading</h2><p class="intro">Keep <strong>formatting</strong>.</p>'
  + '<script>window.infected = true</script><svg onload="alert(1)"></svg>'
  + '<img src="https://images.example.test/photo.jpg" alt="Vehicle" onerror="alert(1)" />'
  + '<img src="data:image/svg+xml,malicious" />'
  + '<a href="javascript:alert(1)" onclick="alert(2)">Unsafe link</a>'
  + '<a href="https://example.test/article" target="_blank">Safe link</a>'
  + '<iframe src="https://example.test/embed"></iframe>'
  + '<table><tbody><tr><td colspan="2">Detail</td></tr></tbody></table>';
const safe = sanitizeBlogHtml(dirty);
assert.match(safe, /<h2>Heading<\/h2>/);
assert.match(safe, /<strong>formatting<\/strong>/);
assert.match(safe, /class="intro"/);
assert.match(safe, /src="https:\/\/images\.example\.test\/photo\.jpg"/);
assert.match(safe, /alt="Vehicle"/);
assert.match(safe, /rel="noopener noreferrer"/);
assert.match(safe, /colspan="2"/);
assert.doesNotMatch(safe, /script|svg|iframe|onerror|onclick|onload|javascript:|data:image/i);
assert.equal(sanitizeBlogHtml(safe), safe, 'Repeated render sanitization preserves approved formatting');
assert.equal(sanitizeBlogHtml(undefined), '');

const { JsonLd } = loadTypeScript('components/seo/json-ld.tsx', {
  'react/jsx-runtime': require('react/jsx-runtime'),
});
const review = {
  '@context': 'https://schema.org',
  '@type': 'Review',
  reviewBody: '</script><script>window.infected=true</script> <img src=x onerror=alert(1)>',
  author: { name: 'Customer <name> & quotation "example"' },
};
const element = JsonLd({ data: review });
assert.equal(element.type, 'script');
assert.equal(element.props.type, 'application/ld+json');
const json = element.props.dangerouslySetInnerHTML.__html;
assert.doesNotMatch(json, /</, 'Review text must not terminate its containing script element');
assert.match(json, /\\u003c\/script>/);
assert.deepEqual(JSON.parse(json), review, 'Escaping preserves the structured data content');

const { default: ReviewsPage } = loadTypeScript('app/(public)/reviews/page.tsx', {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': () => null,
  'lucide-react': { ArrowRight: () => null },
  '@/components/public/testimonials-section': { TestimonialsSection: () => null },
  '@/lib/reviews': { getPublishedReviews: async () => [{ name: review.author.name, quote: review.reviewBody, rating: 5 }] },
  '@/components/ui/button': { Button: () => null },
  '@/lib/site-config': { siteConfig: { name: 'Fixture company', url: 'https://example.test' } },
  '@/lib/seo': { buildPageMetadata: () => ({}) },
  '@/components/public/whatsapp-button': { WhatsAppButton: () => null },
  '@/components/seo/json-ld': { JsonLd },
});
const page = await ReviewsPage();
const markup = require('react-dom/server').renderToStaticMarkup(page);
assert.equal((markup.match(/<script/g) || []).length, 1, 'A malicious published review cannot create another script');
const publishedJson = markup.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1];
assert.ok(publishedJson, 'The reviews route emits structured data');
assert.equal(JSON.parse(publishedJson).mainEntity.itemListElement[0].item.reviewBody, review.reviewBody);
assert.doesNotMatch(publishedJson, /</);

console.log('PASS rendering safety: HTML allowlist removes executable markup and preserves formatting; JSON-LD escapes script-breaking review text without changing data.');
