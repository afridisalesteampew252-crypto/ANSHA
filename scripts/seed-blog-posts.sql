-- Seed ANSHA blog categories and SEO posts

INSERT INTO blog_categories (name, slug, description)
VALUES ('Vehicles & Auctions', 'vehicles-auctions', 'Japanese used cars, auction sheets, and stock buying tips.')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO blog_categories (name, slug, description)
VALUES ('Auto Parts', 'auto-parts', 'OEM remotes, sensors, and parts fitment guidance.')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO blog_categories (name, slug, description)
VALUES ('Export & Shipping', 'export-shipping', 'High-level guides for moving vehicles and parts from Dubai / Japan.')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO blog_categories (name, slug, description)
VALUES ('Machinery & Trucks', 'machinery-trucks', 'Heavy equipment and commercial truck sourcing.')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO blog_categories (name, slug, description)
VALUES ('Buying Guides', 'buying-guides', 'Practical checklists for importers and workshops.')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO blog_posts (title, slug, excerpt, content, category_id, status, is_featured, meta_title, meta_description, published_at)
VALUES (
  'Buying Used Cars from Japan: Auction Sheets Explained Simply',
  'buying-used-cars-japan-auction-sheets',
  'Learn what a Japan auction sheet actually tells you — grades, defects, and red flags — before you commit to a used Japanese car for export.',
  $html_buying_used_cars_japan_auction_sheets$<p>If you are buying <strong>used Japanese cars</strong> for export, the auction sheet is often more important than a glossy photo set. It is the yard’s shorthand for how the car looked on inspection day — and it is one of the first documents our team checks when sourcing stock for buyers in the UAE, Africa, and beyond.</p>

<p>This guide keeps the jargon practical. You do not need to memorize every code. You need a process that stops you from paying for surprises.</p>

<h2>What an auction sheet is (and is not)</h2>
<p>A Japan auction sheet is an inspection summary from the auction house: exterior grade, interior grade, mileage reading, options, and written notes about damage or repair. It is not a full mechanical warranty, and it is not a substitute for a post-purchase check at the port or yard.</p>
<p>Treat it as a decision filter. Strong sheet + clear photos = proceed. Vague notes + missing panels in photos = ask more questions or walk away.</p>

<h2>Grades: use them as a filter, not a trophy</h2>
<p>Auction grades vary slightly by house, but the idea is consistent: higher grades mean cleaner body and interior condition. A mid-grade car with honest notes can still be the right buy for a destination market that prices durability over showroom shine.</p>
<ul>
  <li><strong>Higher grades</strong> — usually fewer body issues; still verify undercarriage photos if available.</li>
  <li><strong>Mid grades</strong> — common for export; read the defect notes carefully.</li>
  <li><strong>Lower grades / accident flags</strong> — only if you understand repair cost in your market.</li>
</ul>

<h2>Notes and abbreviations that actually matter</h2>
<p>The free-text notes are where serious issues hide: replaced panels, rust, airbag deployment history, flood indicators, or mismatched odometer comments. If a note is unclear, ask the exporter to interpret it against the photos before you lock a bid or purchase.</p>
<p>Also confirm whether the sheet mileage matches what you expect for that model year. Large gaps deserve an explanation.</p>

<h2>Photos vs sheet: do not skip either</h2>
<p>Sheets miss context. Photos miss measurement. Cross-check: if the sheet mentions a dent on the rear quarter, you should see it (or a repair) in images. If photos look perfect but the sheet lists multiple panel issues, ask why.</p>

<h2>A simple buying checklist for importers</h2>
<ol>
  <li>Decide destination rules early (age, steering, emissions, left/right hand drive).</li>
  <li>Lock make, model, year range, engine, and budget — then search <a href="/vehicles">vehicle stock</a>.</li>
  <li>Review auction sheet + photos together.</li>
  <li>Confirm export timeline and documents with your trader.</li>
  <li>Plan a local inspection on arrival before retail resale.</li>
</ol>

<p>ANSHA helps buyers source used Japanese cars and related stock with clear condition communication — not hype. Browse current <a href="/vehicles">vehicles</a> or <a href="/contact">ask for a quote</a> with your make, model, year, and destination.</p>$html_buying_used_cars_japan_auction_sheets$,
  (SELECT id FROM blog_categories WHERE slug = 'vehicles-auctions'),
  'published',
  true,
  'Buying Used Cars from Japan | Auction Sheet Basics | ANSHA',
  'Practical guide to Japan auction sheets for used Japanese cars: grades, notes, photos, and what importers should verify before buying for export.',
  '2026-09-12T08:00:00+00'
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  excerpt = EXCLUDED.excerpt,
  content = EXCLUDED.content,
  category_id = EXCLUDED.category_id,
  status = 'published',
  is_featured = EXCLUDED.is_featured,
  meta_title = EXCLUDED.meta_title,
  meta_description = EXCLUDED.meta_description,
  published_at = EXCLUDED.published_at,
  updated_at = now();

INSERT INTO blog_posts (title, slug, excerpt, content, category_id, status, is_featured, meta_title, meta_description, published_at)
VALUES (
  'OEM vs Aftermarket Auto Parts: How to Choose Without Guesswork',
  'oem-vs-aftermarket-auto-parts',
  'OEM, genuine, and aftermarket parts each have a place. Here is how workshops and importers decide — especially when ordering from Dubai stock.',
  $html_oem_vs_aftermarket_auto_parts$<p>Buyers searching <strong>auto parts Dubai</strong> usually face the same fork in the road: pay for OEM (or genuine) parts, or save with aftermarket. The right answer depends on the part’s job, the vehicle’s age, and how expensive a wrong fitment becomes later.</p>

<p>At ANSHA we stock and source both paths — but we start with identification, not slogans.</p>

<h2>Quick definitions that keep teams aligned</h2>
<ul>
  <li><strong>OEM / genuine</strong> — built to the vehicle maker’s specification; usually the safest match for electronics and safety systems.</li>
  <li><strong>Aftermarket</strong> — third-party production; quality ranges from excellent to poor. Brand reputation and packaging matter.</li>
  <li><strong>Used OEM</strong> — removed from donor vehicles; useful when new OEM lead times or prices do not make sense.</li>
</ul>

<h2>When OEM is usually worth it</h2>
<p>Prefer OEM (or carefully verified used OEM) for airbags, ABS modules, ECU-related sensors, immobilizer and key systems, and anything that talks to the vehicle’s security network. A cheap aftermarket remote that never programs is not a bargain.</p>
<p>Also lean OEM when the customer expects dealer-level reliability, or when the vehicle is still under a program that cares about part provenance.</p>

<h2>When aftermarket can be smart</h2>
<p>Body clips, certain filters, lighting for older models, and wear items on high-mileage work vehicles can be good aftermarket candidates — if the supplier can show fitment against make, model, year, and chassis where relevant.</p>
<p>Ask for the cross-reference: OEM number → aftermarket number. If nobody can produce it, pause.</p>

<h2>How to order so you get the right part first time</h2>
<ol>
  <li>Share OEM part number when you have it.</li>
  <li>Add make, model, year, and chassis/VIN if the part is model-sensitive.</li>
  <li>Say whether you need new OEM, used OEM, or aftermarket.</li>
  <li>Confirm return rules before payment on electrical parts.</li>
</ol>

<p>Search published inventory on our <a href="/parts">parts catalog</a>, or send a sourcing request if you cannot find the number. For keyless systems specifically, read our guide on <a href="/blog/keyless-entry-smart-keys-buyers-guide">smart keys and remotes</a>.</p>$html_oem_vs_aftermarket_auto_parts$,
  (SELECT id FROM blog_categories WHERE slug = 'auto-parts'),
  'published',
  false,
  'OEM vs Aftermarket Auto Parts | Buyer Guide | ANSHA',
  'How to choose OEM vs aftermarket auto parts in Dubai: fitment, safety-critical parts, cost trade-offs, and when to insist on OEM numbers.',
  '2026-09-13T08:00:00+00'
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  excerpt = EXCLUDED.excerpt,
  content = EXCLUDED.content,
  category_id = EXCLUDED.category_id,
  status = 'published',
  is_featured = EXCLUDED.is_featured,
  meta_title = EXCLUDED.meta_title,
  meta_description = EXCLUDED.meta_description,
  published_at = EXCLUDED.published_at,
  updated_at = now();

INSERT INTO blog_posts (title, slug, excerpt, content, category_id, status, is_featured, meta_title, meta_description, published_at)
VALUES (
  'Shipping Used Vehicles from Dubai: A Practical High-Level Guide',
  'shipping-used-vehicles-dubai-export-guide',
  'A realistic overview of exporting used vehicles via Dubai — documents, timelines, and what buyers in Africa and the Middle East should prepare.',
  $html_shipping_used_vehicles_dubai_export_guide$<p>Shipping a used vehicle is less about “finding a container” and more about sequencing: correct unit, correct documents, correct destination rules, then booking. Whether the car originated from a <strong>Japan auction</strong> lane or local UAE stock, the export conversation should start with destination requirements — not with a sailing date alone.</p>

<p>This is a high-level guide for importers. Exact customs rules change by country; always confirm with your local clearing agent.</p>

<h2>Decide destination constraints before you buy</h2>
<p>Age limits, left- vs right-hand drive, emission standards, and prohibited models can kill a deal after money moves. Share your port and country with the exporter early. If you are still choosing between units, browse <a href="/vehicles">available vehicles</a> with those constraints in mind.</p>

<h2>Documents you will usually hear about</h2>
<ul>
  <li>Export invoice / commercial invoice</li>
  <li>Bill of lading (or equivalent transport document)</li>
  <li>Export title / export certificate chain appropriate to origin</li>
  <li>Inspection certificates when the destination requires them</li>
</ul>
<p>Names of documents vary by origin country. What matters is a clean chain that matches the VIN/chassis on the vehicle.</p>

<h2>Japan stock vs Dubai stock — why the path differs</h2>
<p>Japan-sourced cars may involve auction purchase, domestic transport, export inspection, and ocean freight to your region — sometimes via Dubai consolidation. UAE stock can move faster when the unit is already here, but you still need destination compliance and booking space.</p>
<p>Ask for a written outline: where the car is today, what must happen next, and a realistic window — not a guaranteed miracle date.</p>

<h2>Cost buckets to budget for</h2>
<ol>
  <li>Vehicle price</li>
  <li>Inland transport and yard fees</li>
  <li>Ocean freight and insurance</li>
  <li>Destination duties, clearing, and local transport</li>
</ol>
<p>Importers who only compare “FOB car price” get surprised later. Ask which costs are included in the quote.</p>

<h2>How ANSHA typically works with buyers</h2>
<p>We confirm the unit, share condition details, align on destination, then coordinate export steps from our Dubai base. If you also need parts for the same fleet, use the <a href="/parts">parts catalog</a> or <a href="/contact">contact the team</a> for a combined ask-for-quote.</p>$html_shipping_used_vehicles_dubai_export_guide$,
  (SELECT id FROM blog_categories WHERE slug = 'export-shipping'),
  'published',
  false,
  'Shipping Used Vehicles from Dubai | Export Guide | ANSHA',
  'High-level guide to shipping used vehicles from Dubai: documents, destination prep, timelines, and how exporters coordinate Japan and UAE stock.',
  '2026-09-14T08:00:00+00'
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  excerpt = EXCLUDED.excerpt,
  content = EXCLUDED.content,
  category_id = EXCLUDED.category_id,
  status = 'published',
  is_featured = EXCLUDED.is_featured,
  meta_title = EXCLUDED.meta_title,
  meta_description = EXCLUDED.meta_description,
  published_at = EXCLUDED.published_at,
  updated_at = now();

INSERT INTO blog_posts (title, slug, excerpt, content, category_id, status, is_featured, meta_title, meta_description, published_at)
VALUES (
  'Keyless Entry and Smart Keys: What Buyers Should Know Before Ordering',
  'keyless-entry-smart-keys-buyers-guide',
  'OEM remotes and smart keys fail often when ordered by guesswork. Here is what to send your supplier so programming succeeds the first time.',
  $html_keyless_entry_smart_keys_buyers_guide$<p><strong>OEM remotes</strong> and smart keys look similar in photos and behave very differently in the workshop. Frequency, chip, blade profile, and immobilizer pairing all have to line up. That is why “Toyota key 2018” is not a complete order.</p>

<p>If you buy keyless parts through Dubai or Japan stock channels, treat identification as part of the product.</p>

<h2>Send these details with every key or remote request</h2>
<ul>
  <li>Make, model, and year (and generation if you know it)</li>
  <li>Chassis / VIN when possible</li>
  <li>Photos of the existing key (front, back, and circuit board if opened by a locksmith)</li>
  <li>FCC ID / OEM part number printed on the remote</li>
  <li>Whether the car uses a smart key, proximity fob, or simple RF remote</li>
</ul>

<h2>Why aftermarket keys disappoint</h2>
<p>Some aftermarket remotes never complete immobilizer teaching on certain ECUs. Others match the button layout but not the chip. For security-related parts, many workshops prefer OEM or used OEM pulled from the same model family.</p>
<p>Read our broader take on <a href="/blog/oem-vs-aftermarket-auto-parts">OEM vs aftermarket</a> if you are deciding budget vs risk.</p>

<h2>Programming expectations</h2>
<p>A correct remote still needs programming tools and, for some models, all existing keys present. Confirm with your locksmith before you promise a same-day drive-away to a retail customer.</p>

<h2>Stock search tip</h2>
<p>When you browse our <a href="/parts">auto parts</a> inventory, use OEM numbers and precise model naming. If nothing matches, send a part request — guessing from a blurry WhatsApp photo is how wrong keys get shipped.</p>

<p>Need a remote urgently for a Japanese model in the UAE? <a href="/contact">Ask ANSHA for a quote</a> with the checklist above attached.</p>$html_keyless_entry_smart_keys_buyers_guide$,
  (SELECT id FROM blog_categories WHERE slug = 'auto-parts'),
  'published',
  false,
  'Keyless Entry & Smart Keys Guide | OEM Remotes | ANSHA',
  'Buyer guide to keyless entry and OEM remotes: chip types, FCC IDs, chassis matching, and how to order smart keys that actually program.',
  '2026-09-15T08:00:00+00'
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  excerpt = EXCLUDED.excerpt,
  content = EXCLUDED.content,
  category_id = EXCLUDED.category_id,
  status = 'published',
  is_featured = EXCLUDED.is_featured,
  meta_title = EXCLUDED.meta_title,
  meta_description = EXCLUDED.meta_description,
  published_at = EXCLUDED.published_at,
  updated_at = now();

INSERT INTO blog_posts (title, slug, excerpt, content, category_id, status, is_featured, meta_title, meta_description, published_at)
VALUES (
  'Sourcing Heavy Machinery and Trucks: What Specs Actually Matter',
  'sourcing-heavy-machinery-trucks',
  'Hours, undercarriage, attachment fitment, and export readiness — a practical checklist for excavators, loaders, and commercial trucks.',
  $html_sourcing_heavy_machinery_trucks$<p>Buying <strong>heavy machinery</strong> is not the same as buying a passenger car. Hours, undercarriage wear, hydraulic health, and attachment compatibility decide whether the machine works on day one or sits in a yard eating demurrage.</p>

<p>ANSHA lists construction and commercial equipment alongside vehicles — start at <a href="/machinery">machinery &amp; trucks</a> when you know the type you need.</p>

<h2>Specs to put in the first message</h2>
<ul>
  <li>Machine type (excavator, wheel loader, dump truck, etc.)</li>
  <li>Preferred brand and model range</li>
  <li>Maximum hours / kilometer target</li>
  <li>Required attachments (bucket size, forks, crane spec)</li>
  <li>Destination port and any age or emission limits</li>
</ul>

<h2>Condition signals that deserve photos</h2>
<p>Ask for hours meter shots, undercarriage or tire condition, boom/arm play indicators, cabin interior, and any leak stains. For trucks, check frame rails, bed condition, and engine bay cleanliness as clues — not proof — of care.</p>

<h2>Japan and Dubai sourcing lanes</h2>
<p>Some machines move through Japanese used equipment channels; others sit in regional stock. Timelines differ. A clear “where is it now” answer should come before you discuss freight.</p>

<h2>Export reality check</h2>
<p>Oversize cargo, special lashing, and destination permits can dominate cost. Get a freight indication early for unusual dimensions. Pair machinery purchases with parts planning if you run a remote site — filters and wear parts are easier to ship with the first move when planned.</p>

<p>Ready to shortlist? Browse <a href="/machinery">machinery stock</a> or <a href="/contact">request sourcing</a> with your hours cap and destination.</p>$html_sourcing_heavy_machinery_trucks$,
  (SELECT id FROM blog_categories WHERE slug = 'machinery-trucks'),
  'published',
  false,
  'Sourcing Heavy Machinery & Trucks | Export Checklist | ANSHA',
  'How to source heavy machinery and trucks for export: hours, condition, attachments, documents, and what to tell your Dubai exporter.',
  '2026-09-16T08:00:00+00'
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  excerpt = EXCLUDED.excerpt,
  content = EXCLUDED.content,
  category_id = EXCLUDED.category_id,
  status = 'published',
  is_featured = EXCLUDED.is_featured,
  meta_title = EXCLUDED.meta_title,
  meta_description = EXCLUDED.meta_description,
  published_at = EXCLUDED.published_at,
  updated_at = now();

INSERT INTO blog_posts (title, slug, excerpt, content, category_id, status, is_featured, meta_title, meta_description, published_at)
VALUES (
  'Why Make, Model, Year, and Color Naming Matters in Stock Search',
  'make-model-year-color-stock-search',
  'Messy naming wastes days in export trade. Here is how precise Make / Model / Year / Color labels help you find the right vehicle or part faster.',
  $html_make_model_year_color_stock_search$<p>In used vehicle and parts trading, vague labels create expensive delays. “Honda 2015 white” might mean three different cars and a dozen incompatible remotes. That is why serious exporters standardize on <strong>Make, Model, Year, Color</strong> — and add chassis or OEM numbers when the part demands it.</p>

<p>ANSHA’s catalog and sourcing workflow lean on that naming so buyers in the UAE, Africa, and other markets can search without decoding slang.</p>

<h2>What each field is for</h2>
<ul>
  <li><strong>Make</strong> — manufacturer family (Toyota, Nissan, Komatsu…).</li>
  <li><strong>Model</strong> — the actual product line (Hilux, Land Cruiser Prado, PC200).</li>
  <li><strong>Year</strong> — model year or first registration year; say which one you mean.</li>
  <li><strong>Color</strong> — useful for body parts, mirrors, bumpers, and retail presentation.</li>
</ul>

<h2>When you must go deeper than color</h2>
<p>Electronics, engines, and transmissions need chassis codes, engine codes, or OEM part numbers. Color will not save a wrong ECU. For remotes, see our <a href="/blog/keyless-entry-smart-keys-buyers-guide">smart key guide</a>.</p>

<h2>How clean naming speeds Japan and Dubai stock checks</h2>
<p>When a buyer sends precise fields, we can match against published <a href="/vehicles">vehicles</a>, <a href="/parts">parts</a>, and <a href="/machinery">machinery</a> without a long clarification chain. That matters when auction windows or vessel cutoffs are tight.</p>

<h2>A message template you can copy</h2>
<p><em>Make: Toyota · Model: Hilux · Year: 2018 · Color: White · Destination: Tema · Need: Double cab, automatic, under 100,000 km · Also need: OEM remote if available</em></p>

<p>Send that structure to <a href="/contact">ANSHA</a> and you will get a clearer yes/no on stock — which is the point of good naming in the first place.</p>$html_make_model_year_color_stock_search$,
  (SELECT id FROM blog_categories WHERE slug = 'buying-guides'),
  'published',
  false,
  'Make Model Year Color Stock Search | ANSHA Buying Tip',
  'Why Make Model Year Color naming matters for Japanese used cars and auto parts search — and how clean labels speed up Dubai export sourcing.',
  '2026-09-17T08:00:00+00'
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  excerpt = EXCLUDED.excerpt,
  content = EXCLUDED.content,
  category_id = EXCLUDED.category_id,
  status = 'published',
  is_featured = EXCLUDED.is_featured,
  meta_title = EXCLUDED.meta_title,
  meta_description = EXCLUDED.meta_description,
  published_at = EXCLUDED.published_at,
  updated_at = now();

UPDATE blog_posts SET
  meta_description = 'ANSHA TRADING supplies Japanese used cars, auto parts, OEM remotes, and machinery for export from Dubai. Browse stock or ask for a quote.',
  excerpt = 'ANSHA TRADING sources Japanese used cars, automotive parts, and machinery for export buyers — from Dubai, with ask-for-quote support.'
WHERE slug = 'japanese-auto-parts-supplier';

UPDATE blog_posts SET is_featured = false WHERE slug <> 'buying-used-cars-japan-auction-sheets';

UPDATE blog_posts SET is_featured = true WHERE slug = 'buying-used-cars-japan-auction-sheets';
UPDATE blog_posts SET featured_image = '/images/blog/' || slug || '.svg'
WHERE slug IN (
  'buying-used-cars-japan-auction-sheets',
  'oem-vs-aftermarket-auto-parts',
  'shipping-used-vehicles-dubai-export-guide',
  'keyless-entry-smart-keys-buyers-guide',
  'sourcing-heavy-machinery-trucks',
  'make-model-year-color-stock-search'
)
AND (featured_image IS NULL OR featured_image = '' OR featured_image LIKE '/images/blog/%');
