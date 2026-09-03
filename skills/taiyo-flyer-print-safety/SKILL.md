---
name: taiyo-flyer-print-safety
description: Audit or change the Taiyo consumables flyer app when A4 print/PDF output, product-card pagination, office footers, or product-image consistency is involved.
---

# Taiyo Flyer Print Safety

Preserve these as hard print invariants for every fixed or user-built flyer:

- Every printed A4 page contains exactly four complete product cards.
- A product card never continues, repeats, or splits onto another page.
- Every page contains the full company and selected office footer.
- Do not print clipped text, failed images, or an incomplete page.
- Product photo frames are the same height within a page and use `object-fit: contain`; do not crop or generate altered package artwork to force visual uniformity.

## Implementation rules

Keep each `.page` and its wrapper at A4 portrait size in print media (`210mm × 297mm`). Apply `break-inside: avoid` and `page-break-inside: avoid` to the page, cards, header, and footer. A fixed height plus `overflow: hidden` is only a containment boundary; it is not proof that content fits.

Before calling `window.print()`:

1. Require four selected products on every printable page. If any page is incomplete, fail closed. Direct browser printing must hide the incomplete flyer and show an explanatory warning.
2. Wait for every printable product image to finish loading and require positive `naturalWidth` and `naturalHeight`.
3. Require exactly four `.tss-card` elements and a `.tss-footer-office` on every printable page.
4. Reject printing when a page overflows, a footer extends below the page, a card body scrolls, or a card body extends below its card.

For automatic pagination, preserve category order but flatten the printable items before slicing into groups of four. Carry a category remainder into the next category. If the final printable total is not divisible by four, stop rendering and printing instead of creating a partial page. Keep legitimately selectable but non-flyer products available with `fixedFlyer: false`.

When data, images, CSS, or renderer code changes, update the cache-busting version consistently in every consumer.

## Required verification

Run the repository checks when available:

```powershell
node validate.cjs
node audit-images.cjs --compact
```

Then verify the rendered DOM for every flyer:

- expected page and product totals;
- four cards and a company footer on every page;
- no page, footer, or card-body overflow;
- identical photo-frame height among the four cards;
- every product image loaded successfully;
- no console errors.

Also produce a real browser PDF with print backgrounds and CSS page size enabled. The PDF page count must equal the printable DOM page count. Render and inspect at least the first page, last page, mixed-category pages, and pages containing the longest product names. Confirm the footer is visibly present at the bottom of each inspected page.

For user-built flyers, test a complete four-product page, a disabled fifth selection, and a one-to-three-product page reached through direct print. The incomplete case must print only the warning, never the partial flyer.

## Image and product-data integrity

Use manufacturer product pages or official catalogs as the primary source for package images, JAN/model numbers, sizes, and quantities. Never infer an unpublished code or regenerate package artwork. If the best official image is low resolution, retain the accurate source, record the limitation, and avoid claiming that resampling restores detail.
