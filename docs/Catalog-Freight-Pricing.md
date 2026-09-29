# Catalog Prices and Freight

This guide explains how vehicle prices and freight estimates work in ANSHA. Admin pages are under `/admin`; access is restricted by staff role.

## Public vehicle prices

Vehicle records have three export prices:

- **FOB**: the vehicle price at the export point. ANSHA uses FOB as the public listing price when a positive FOB value is set.
- **C&F**: cost and freight.
- **CIF**: cost, insurance, and freight.

The public vehicle card and detail page show the available FOB, C&F, and CIF values. A missing or zero value is not shown as a quote. Public price visibility is controlled by the vehicle's `show_price` flag; saving a positive term price through the bulk price tool turns price visibility on. FOB is synchronized to the legacy listing `price` field so older catalog features stay aligned. When FOB is absent, the public page may fall back to the legacy listing price.

### Change many vehicle prices at once

Open **Admin → Bulk vehicle prices** (`/admin/bulk-vehicle-prices`).

1. Search the inventory and narrow it with make, model, year, stock origin, currency, and price-status filters.
2. Select the vehicles to change. Check the visible result count before applying the change.
3. Choose **FOB (listing price)**, **C&F**, or **CIF**.
4. Choose whether to set a new amount or increase/decrease the selected price by a percentage.
5. Review the selection and apply.

FOB updates also update the listing price. C&F and CIF remain separate export quotes. Enter amounts in the vehicle's configured currency. The bulk operation supports up to 5,000 selected vehicles.

## Vehicle model dimensions and M³

Open **Admin → Vehicle make/model M³** (`/admin/vehicle-model-config`). Add or edit a make/model with length, width, and height in **metres**. ANSHA calculates M³ from the dimensions when dimensions are supplied. You can also save an M³ value directly when dimensions are unavailable. Weight is optional and is not used by the freight calculator.

The page supports make and dimension filters, text search, a result count, and a bounded scrolling results area. Saved make/model specifications are reused for freight estimates and matching vehicle imports. Keep the make/model spelling consistent with the vehicle listing; punctuation is normalized for matching.

## Freight charge setup

Open **Admin → Freight charges** (`/admin/freight-charges`) and add an active rate for a route.

For each rate, enter:

- Origin country and optional origin port
- Destination country and destination port
- Shipment type: RoRo or 40-ft container for the vehicle freight calculator
- Currency and configured freight charge
- Optional shipping company and contact details

Enter a **RoRo** charge as the price per cubic metre. Enter a **40-ft container** charge as the total price for one container. These units matter: the calculator multiplies RoRo rate × vehicle M³, while a 40-ft total is divided by the selected vehicle share: 6 small vehicles, 4 large vehicles, or 3 XL vehicles.

Only active rate rows appear in the calculator suggestions. If multiple active rates match a country and port, the calculator shows each matching RoRo or 40-ft option.

## Use the freight calculator

Open **Admin → Freight calculator** (`/admin/freight-calculator`).

1. Type a make or model in **Saved vehicle make/model** and choose a suggestion. The saved M³ value is used.
2. If the vehicle is not configured, enter length, width, and height in metres instead.
3. Type a destination country and choose a suggestion. The port suggestions narrow to ports configured for that country.
4. Type or choose a destination port, then calculate.
5. Compare the per-vehicle RoRo estimate with the 40-ft per-vehicle share. The calculator shows both the shared amount and the full container total.

The country, port, and saved make/model fields support typing to search and dropdown suggestions. A custom typed destination is accepted, but the calculator returns a rate only when an active freight row matches that country and port.

**Estimate only:** the displayed freight amount does not include handling, insurance, duties, taxes, or additional surcharges unless those costs are part of the configured rate.

## Troubleshooting

- **No country or port suggestions:** confirm an active freight row exists and that destination country and port are filled in.
- **No matching rate:** make sure the selected country and port exactly match an active freight charge. Check the shipment type and currency in Freight charges.
- **No saved model suggestion:** add the make/model under Vehicle make/model M³, or enter the dimensions manually.
- **A price is missing publicly:** confirm a positive FOB, C&F, or CIF value is saved and that public price visibility is enabled. FOB controls the listing price when present.

## Related docs

- [User manual](./User-Manual.md)
- [Database schema and migrations](./Database.md)
- [API and Supabase RPCs](./API.md)
- [Deployment and release checks](./Deployment.md)
