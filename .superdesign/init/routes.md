# Routes — public App Router (`app/(public)/`)

| Path | File | Summary |
|------|------|---------|
| `/` | `app/(public)/page.tsx` → `home-page-client.tsx` | Hero, deals strip, parts finder, trust row, categories, export markets, featured parts/vehicles/machinery, brands, testimonials, blog, part request |
| `/vehicles` | `vehicles/page.tsx` + `vehicles-catalog.tsx` | Vehicle inventory listing + filters |
| `/vehicles/[slug]` | `vehicles/[slug]/` + `vehicle-detail-client.tsx` | Gallery, specs, price/inquiry, WhatsApp, related |
| `/machinery` | `machinery/page.tsx` | Machinery/truck catalog (vehicles class filter) |
| `/parts` | `parts/page.tsx` | Parts catalog + filters |
| `/parts/[slug]` | `parts/[slug]/page.tsx` | Part detail + fitment |
| `/categories` | `categories/page.tsx` | Parts category hub |
| `/categories/[slug]` | `categories/[slug]/page.tsx` | Category listing |
| `/markets/[code]` | `markets/[code]/page.tsx` | Export destination / market page |
| `/offers` | `offers/page.tsx` | Published deals |
| `/contact` | `contact/page.tsx` | Contact / quote inquiry |
| `/about` | `about/page.tsx` | Company |
| `/blog` | `blog/page.tsx` | Insights |
| `/cart` | `cart/page.tsx` | Inquiry cart |
| `/favorites` | `favorites/page.tsx` | Saved items |
| `/banking` | `banking/page.tsx` | Banking details |
| `/reviews` | `reviews/page.tsx` | Reviews |

Admin routes under `app/(admin)/` are out of redesign scope.
