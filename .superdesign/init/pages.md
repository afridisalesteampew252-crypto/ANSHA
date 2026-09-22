# Page dependency trees (candidate context)

## `/` Home
Entry: `app/(public)/page.tsx` → `app/(public)/home-page-client.tsx`
Dependencies:
- `components/public/catalog-image.tsx`
- `components/ui/button.tsx`
- `components/ui/input.tsx`
- `components/public/part-card.tsx`
- `components/public/vehicle-card.tsx`
- `components/public/blog-card.tsx`
- `components/public/export-markets-strip.tsx`
- `components/public/part-request-form.tsx`
- `components/public/testimonials-section.tsx`
- `components/public/whatsapp-button.tsx`
- Shell: `components/public/site-header.tsx`, `components/public/site-footer.tsx`
- Tokens: `app/globals.css` (:root), `.superdesign/design-system.md`

## `/vehicles` Listing
Entry: `app/(public)/vehicles/page.tsx` → `vehicles-catalog.tsx`
Dependencies:
- `components/public/vehicle-card.tsx`
- filter UI inside catalog
- Shell + tokens as above

## `/vehicles/[slug]` Detail
Entry: `vehicle-detail-client.tsx`
Dependencies:
- `components/public/vehicle-photo-gallery.tsx`
- `components/public/inquiry-dialog.tsx`
- `components/public/whatsapp-button.tsx`
- `components/public/incoterm-quote-strip.tsx`
- `components/public/save-item-actions.tsx`
- `components/public/inventory-deal-banner.tsx`
- `components/public/vehicle-card.tsx`

## `/parts` / `/parts/[slug]`
Entry: parts pages + part cards / detail components

## `/markets/[code]`
Entry: market destination page + export framing

## `/contact`
Entry: contact page + inquiry forms
