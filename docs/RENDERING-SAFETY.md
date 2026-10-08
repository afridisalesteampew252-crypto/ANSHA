# Rendering safety and dependency review

Reviewed on 2026-10-08 for the admin reliability audit.

## HTML and structured data

- `RichTextEditor` uses the existing `sanitizeBlogHtml` allowlist before assigning stored HTML to its editable DOM, before rendering Preview, and before inserting HTML from paste/drop. Toolbar links accept HTTP/HTTPS/mailto/tel; image URLs accept HTTP/HTTPS. HTML source remains editable as text. Saving and public blog rendering retain their existing sanitizer.
- `/reviews` renders its structured data through `JsonLd`, which escapes `<` before inserting JSON into a script element. Published review text cannot close the script tag.
- Other public structured data routes use the same helper. Public blog HTML and admin save already use the allowlist. `components/ui/chart.tsx` inserts generated chart CSS; its current configurations are defined by application code, rather than stored HTML.
- `lib/banking-details.ts` supplies both invoices and `/banking`. Public formatting and copy values derive from the same canonical account details. A comparison against the preceding revision verified every invoice value and every public display/copy value was preserved.

`node scripts/test-rendering-safety.mjs` checks executable-markup removal, preserved formatting, sanitizer idempotence, JSON-LD content preservation, and the actual reviews route with script-breaking review text. A temporary Chromium fixture also verified the actual editor's Write/Preview/HTML transitions, paste/drop, and unsafe toolbar-link rejection without database requests or writes.

## Dependency audit snapshot

The fresh `npm audit --json` snapshot reported 14 affected package entries (8 high, 6 moderate, no critical), tracing to four underlying advisories. Updating sharp to 0.35.5 reduced this to 13 entries (7 high, 6 moderate). Parent packages and peers are counted separately; these are not 13 independently demonstrated application defects.

| Dependency at review | Advisory and exposure | Precise follow-up |
| --- | --- | --- |
| `sharp` 0.35.4 through Next | [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), high, librsvg memory safety. The app has `images.unoptimized: true` and no direct sharp imports; an application SVG-decoding path was not confirmed. | `sharp` 0.35.5 is a published patch, with the same Node `>=20.9.0` requirement and within Next's existing optional dependency range. Completed: the lockfile now resolves 0.35.5 and its matching optional binaries. A real SVG-to-PNG conversion and production build passed; the final audit no longer reports this advisory. |
| `braces` 3.0.3 through Tailwind glob tooling | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), high, deeply nested glob stack exhaustion. These paths are build/watch tooling. | The registry's latest version remains 3.0.3; 3.0.4 does not exist. No patched version was available at review. Avoid feeding untrusted glob patterns into build/watch tooling; follow the upstream fix. |
| `postcss-selector-parser` 6.1.4 through Tailwind / postcss-nested | [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), moderate, parser CPU exhaustion on hostile selectors. These are CSS build paths. | The published patched version is 7.1.6. Current consumers require major 6; a scoped override crosses a major version and requires a real Tailwind/CSS build check. It is not a routine patch bump. |
| `uuid` 8.3.2 through ExcelJS, 7.0.3 through xcode/Capacitor CLI | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), moderate, bounds handling in v3/v5/v6 with an explicit output buffer. The installed ExcelJS and xcode call sites use v4; that affected path was not found in application usage. xcode is native development tooling. | 11.1.1 is published and retains CommonJS/browser exports. Overriding these older consumers crosses major versions; verify Excel generation and native project generation before accepting it. |

This review updated sharp and its matching optional image binaries. The other entries above remain open; crossing dependency major versions requires separate compatibility work. Do not use an unreviewed `npm audit fix --force` or claim an advisory is resolved merely because its parent package was upgraded.

## Firebase client configuration

The public Android source config contains the expected `com.anshatrading.app` client. The admin source config contains `com.anshatrading.admin` and a public-app client entry; the preparation script selects the exact admin package. The reviewed config objects are client identifiers, without a top-level service-account private key. No API key values were printed.

Google Cloud API key restrictions cannot be verified from these JSON files. An operator should check each corresponding key's Android application restrictions against its package name and signing SHA-1, including the Play App Signing certificate where applicable. Check API restrictions against the required Firebase services using [Firebase's API key guidance](https://firebase.google.com/docs/projects/api-keys) before changing them, and verify the resulting signed APK's Firebase behavior. [App Check](https://firebase.google.com/docs/app-check) can protect supported Firebase products; it does not replace authorization of the FCM sender.

Firebase service-account JSON and `FCM_SERVICE_ACCOUNT_JSON` remain server-side secrets, as documented in `docs/Mobile.md`. Repository inspection does not prove that Console restrictions, App Check enforcement, quotas, or production delivery are configured.
