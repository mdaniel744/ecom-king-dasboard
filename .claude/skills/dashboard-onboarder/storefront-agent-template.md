# New Storefront Agent — Full Onboarding Handover Prompt

> TEMPLATE: When generating this prompt for a real store, replace all {{PLACEHOLDER}} values with actual data before handing it to the storefront agent. Do not hand over a prompt with unfilled placeholders.

---

**Store being onboarded:** {{STORE_NAME}}
**Supabase URL:** {{SUPABASE_URL}}
**Supabase anon key:** {{SUPABASE_ANON_KEY}}
**Store ID:** {{STORE_ID}}
**Source language:** {{SOURCE_LANGUAGE_CODE}} (e.g. de)
**Target locales enabled:** {{ENABLED_LOCALES}} (e.g. ["en"])
**Domain:** {{DOMAIN}}

---

You are the storefront agent for a new ecommerce store being onboarded onto a shared multi-tenant platform. This document contains everything you need to wire up the storefront from scratch. Read it fully before touching a single file.

## 1. What You Are Working With

This platform has two separate parts:

**The Dashboard** — a shared admin app (owned by a separate agent/team). Every store on the platform uses the same dashboard. It writes products, categories, attributes, translations and settings to a shared Supabase database, scoped by `store_id`.

**The Storefront** — a per-store Next.js App Router site (your job). It is read-only against the database. It never writes except to the `inquiries` table (quote/contact form submissions). It identifies itself to the database using a fixed `NEXT_PUBLIC_STORE_ID` env var.

You are the storefront agent. You do not touch the dashboard codebase. You do not write to the database except `inquiries`. Everything else is a read.

## 2. First Things — Before Touching Any Code

Before writing a single line, do all of the following:

**A. Read the env vars** — Check `.env.local` for:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_STORE_ID`

If any are missing, stop and ask for them. Nothing works without these.

**B. Verify the database connection is live** — Run this curl with actual values:
```bash
curl "$SUPABASE_URL/rest/v1/products?store_id=eq.$STORE_ID&select=id,name&limit=3" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
```
If you get rows back, the connection works. If you get `[]`, either the store has no products yet (fine) or `store_id` is wrong (fix it first).

**C. Read every table** — Run SELECT * or REST calls against each table below. Understand what columns exist before assuming anything. The schema evolves — do not assume columns exist; verify them.

**D. Audit the existing site for hardcoded data** — Scan every component for arrays, objects or string literals that should be coming from the database instead. These are your first wiring jobs.

**E. Flag these things before starting work** — ask the user to confirm:
- What is the store's source/main language?
- Which target languages (if any) are enabled in Settings → Translation?
- Is the site already deployed or still local?
- Are there any design files or brand guidelines to follow?

## 3. The Database Tables — Know These Cold

All tables are in the `public` schema. All are accessible via the anon key after RLS policies are applied. The anon key is shared across all tenants — RLS here does NOT enforce tenant isolation by itself. Every query must explicitly filter by `store_id`. Never omit it.

**stores**
```
id, name, enabled_locales (array), google_content_language, google_feed_label
```
- Readable by anon key for exactly: `id`, `enabled_locales`, `google_content_language`
- `enabled_locales` is an array like `["en", "fr"]` — signals which language routes to build
- `google_content_language` is the source/main language code (e.g. `"de"`) — never hardcode this
- Do NOT query `owner_user_id`, `google_merchant_id` — those columns are blocked by column-level grant and will 401

**products**
```
id, store_id, category_id, name, slug, description, short_description,
price, sale_price, currency, sku, stock_quantity, status,
images (array), image_alts (array), attributes (JSON),
brand, mpn, gtin, condition, badge,
is_featured, google_product_category,
google_sync_status, google_sync_error, created_at, updated_at
```
- Filter: always `store_id=eq.$STORE_ID` AND `status='active'` for public queries
- `images` is an array: `[0]` is the primary image, `[1:]` are gallery images
- `image_alts` is a parallel array to `images` — `image_alts[i]` is the SEO alt text for `images[i]`. Use as `alt` on every `<img>` tag rendering a product image. Fallback: `product.name`. Never leave alt blank. Applies to product cards, detail gallery, everywhere.
- `attributes` is a free-form JSON object: `{"Size": "20ft", "Color": "Blau"}`. Keys match `attributes.name` values — never hardcode
- `brand` — manufacturer/brand name, show on product detail if set
- `mpn` — manufacturer part number, show on product detail if set
- `gtin` — barcode, usually null for custom/industrial products
- `google_product_category` — Google taxonomy path. **Do NOT display** in any storefront UI. Use only in JSON-LD `category` field (see SEO section)
- `condition` stores English codes: `"new"`, `"used"`, `"refurbished"`. Map to source-language display labels. Also maps to JSON-LD itemCondition (see SEO section)
- `slug` — URL identifier for product detail pages: `/produkt/[slug]` or equivalent

**categories**
```
id, store_id, parent_id, name, slug, description,
image_url, is_featured, display_order, meta_title, meta_description, created_at
```
- Filter: always `store_id=eq.$STORE_ID`
- `is_featured: true` = show in homepage category grid. Sort by `display_order` ascending
- `image_url`, `description` control the visual card on the homepage and nav dropdown

**attributes**
```
id, store_id, name, created_at
```
- Filter: always `store_id=eq.$STORE_ID`
- These are attribute TYPES: "Size", "Color", "Container Type", "Material", etc.
- Used to build filter sidebars and homepage size/type sections

**attribute_values**
```
id, attribute_id, value, label, image_url, description, created_at
```
- No `store_id` on this table. Scoped indirectly — only fetch values whose `attribute_id` belongs to this store's attributes
- `value` = raw filter key (always source language). NEVER translate or override for matching. It must match what's stored in `products.attributes`
- `label`, `image_url`, `description` = presentation fields for display (can be null — handle gracefully)

**translations**
```
store_id, entity_type, entity_id, field_name, locale, value
```
- DeepSeek writes here automatically when the store owner saves content after enabling a target language
- `entity_type` values: `"product"`, `"category"`, `"attribute_name"`, `"attribute_value"`
- `entity_id` = the UUID of the product/category/attribute/attribute_value row
- `field_name` = which field: `"name"`, `"description"`, `"short_description"`, `"badge"`, `"label"` etc.
- `locale` = target language code: `"en"`, `"fr"`, etc.
- Fetch pattern: `entity_type=eq.product&entity_id=eq.<id>&locale=eq.en`
- **Fallback rule:** if no translation row exists for a field, show the source language value. Never blank.

**inquiries**
```
id, store_id, product_id, customer_name, customer_email,
customer_phone, message, details (JSON), status, created_at
```
- This is the **only table you INSERT into**. Anon key has insert-only access — no SELECT
- **Critical:** Never chain `.select()` or `.single()` after `.insert()` — will fail silently or throw RLS error
- `details` is a JSON blob for structured form data (container size, condition, quantity, delivery date, etc.)

## 4. The Data Access Layer Pattern

Create a central file (e.g. `src/api/base44Client.js`) that exports entities matching the shape the app uses. Components never import `@supabase/supabase-js` directly.

Always provide a local mock fallback for when Supabase env vars are not set. The site must still run locally without credentials.

## 5. RLS — The Access Model

One shared anon key serves every tenant. Tenant isolation is enforced entirely by your explicit `store_id` filter — not RLS alone. If you ever omit `store_id`, you will read other stores' data.

| Table | Anon access |
|---|---|
| products | SELECT where active ✓ |
| categories | SELECT ✓ |
| attributes | SELECT ✓ |
| attribute_values | SELECT ✓ (via join scoping) |
| translations | SELECT ✓ |
| stores | SELECT only: id, enabled_locales, google_content_language |
| inquiries | INSERT only, no SELECT |

If you query a table and get `[]` unexpectedly, test with curl immediately. RLS blocks silently — report the exact table name to the dashboard agent, they add the policy, you verify with curl.

## 6. What to Wire — In Priority Order

**Priority 1:** Products showing live — map products table to product cards and detail pages, wire images, name, price, condition, slug, attributes, is_featured

**Priority 2:** Categories showing live — wire `is_featured=true` categories sorted by `display_order` to homepage grid; wire nav dropdown; remove ALL hardcoded category arrays

**Priority 3:** Attributes and filters showing live — wire attributes + attribute_values to shop filter sidebar. Critical: filter matching uses `attribute_values.value` (source language raw string) against `products.attributes[key]`. Never use translated labels for matching.

**Priority 4:** Homepage size/type sections live — wire to `attribute_values` for the relevant attribute using `label`, `image_url`, `description` fields; fall back gracefully when null

**Priority 5:** Quote/inquiry form — INSERT into inquiries, never chain `.select()`, always include `store_id`

**Priority 6:** Translation overlay — fetch from `translations` table for current locale, overlay field by field, always `translatedValue ?? sourceValue`

**Priority 7:** SEO — `<head>` tags and JSON-LD structured data on every product and category page (see Section 9 below)

## 7. The Translation System — Two Separate Jobs

**Job A — Content Translation (DeepSeek, automatic)**
Covers: product names/descriptions, category names/descriptions, attribute names/values

Your code pattern:
```js
if (locale === sourceLocale) return sourceData;
// fetch translations for these entity IDs and locale
// overlay: translatedField ?? sourceField (never blank)
```

Backfill note for store owner: products saved before a language was enabled must be re-saved once to trigger translation.

**Job B — Site Frame Translation (you, one-time)**
Covers: nav labels, buttons, filter headings, footer text, form labels — everything not in the database.

Create an `i18n.js` file with every static UI string in every supported language. Every component reads from this file. Read `stores.enabled_locales` to know which languages to include.

**Rule: if a string is in the database → Job A. If it is hardcoded in a component → Job B. Never mix them.**

## 8. Locale Routing

- Default locale gets no URL prefix (preserves all existing SEO URLs)
- Every other locale gets a prefix: `/en/`, `/fr/`, etc.

```
/                    → source language (no prefix)
/en                  → English homepage
/en/shop             → English shop
/en/produkt/[slug]   → English product detail (named segment, NOT catch-all — catch-all returns an array breaking useParams())
```

Update the Link component shim so every `<Link to="/shop">` automatically becomes `/en/shop` when already under `/en/`. One change, zero individual component updates.

`isLocalizablePath` — whitelist of paths with real locale-specific pages. Source-language-only SEO pages must NOT get prefixed — they would 404.

## 9. SEO — `<head>` Tags and JSON-LD Structured Data

Every product detail page and category landing page must have: a canonical URL, Open Graph tags, hreflang alternates, and JSON-LD structured data injected as `<script type="application/ld+json">` in `<head>`. This is additive — do not remove existing head tags.

### All pages — universal

```html
<!-- Canonical: always the current page's own URL, no trailing slash -->
<link rel="canonical" href="https://{{DOMAIN}}/[current-path]" />

<!-- hreflang: one per locale + x-default pointing to source language -->
<link rel="alternate" hreflang="{{SOURCE_LANGUAGE_CODE}}" href="https://{{DOMAIN}}/[path]" />
<link rel="alternate" hreflang="en" href="https://{{DOMAIN}}/en/[path]" />
<!-- repeat for every locale in enabled_locales -->
<link rel="alternate" hreflang="x-default" href="https://{{DOMAIN}}/[path-in-source-language]" />
```

Only add hreflang for pages that actually have a translated route. `x-default` always points to the source language version.

---

### Product detail page — `<head>`

```html
<title>{product.name} | {{STORE_NAME}}</title>
<meta name="description" content="{product.short_description ?? product.description?.slice(0,160)}" />
<meta property="og:type" content="product" />
<meta property="og:title" content="{product.name}" />
<meta property="og:description" content="{product.short_description ?? product.description?.slice(0,160)}" />
<meta property="og:image" content="{product.images[0]}" />
<meta property="og:url" content="https://{{DOMAIN}}/produkt/{product.slug}" />
```

### Product detail page — JSON-LD

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "{product.name}",
  "description": "{product.description ?? product.short_description}",
  "image": ["{product.images[0]}", "{product.images[1]}"],
  "sku": "{product.sku — omit key entirely if null}",
  "mpn": "{product.mpn — omit if null}",
  "gtin": "{product.gtin — omit if null}",
  "category": "{product.google_product_category — omit if null}",
  "brand": {
    "@type": "Brand",
    "name": "{product.brand — omit entire brand block if null}"
  },
  "offers": {
    "@type": "Offer",
    "url": "https://{{DOMAIN}}/produkt/{product.slug}",
    "priceCurrency": "{product.currency}",
    "price": "{product.sale_price ?? product.price}",
    "availability": "{product.status === 'active' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'}",
    "itemCondition": "{
      new          → https://schema.org/NewCondition
      used         → https://schema.org/UsedCondition
      refurbished  → https://schema.org/RefurbishedCondition
    }"
  }
}
```

Also inject a BreadcrumbList on every product page:

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://{{DOMAIN}}" },
    { "@type": "ListItem", "position": 2, "name": "{category.name}", "item": "https://{{DOMAIN}}/kategorie/{category.slug}" },
    { "@type": "ListItem", "position": 3, "name": "{product.name}", "item": "https://{{DOMAIN}}/produkt/{product.slug}" }
  ]
}
```

If the product has no category, omit position 2 and renumber. Never include null values in JSON-LD output — omit the key entirely.

---

### Category landing page — `<head>`

```html
<title>{category.meta_title ?? category.name} | {{STORE_NAME}}</title>
<meta name="description" content="{category.meta_description ?? category.description}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="{category.meta_title ?? category.name}" />
<meta property="og:description" content="{category.meta_description ?? category.description}" />
<meta property="og:image" content="{category.image_url — omit if null}" />
<meta property="og:url" content="https://{{DOMAIN}}/kategorie/{category.slug}" />
```

### Category landing page — JSON-LD

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://{{DOMAIN}}" },
    { "@type": "ListItem", "position": 2, "name": "{parent.name}", "item": "https://{{DOMAIN}}/kategorie/{parent.slug}" },
    { "@type": "ListItem", "position": 3, "name": "{category.name}", "item": "https://{{DOMAIN}}/kategorie/{category.slug}" }
  ]
}
```

If the category has no `parent_id`, omit position 2 and keep only Home → Category.

---

## 10. The Language Switcher

Read `stores.enabled_locales` on startup. Build the switcher dynamically — never hardcode which languages exist. Use `NextLink` directly (NOT the locale-aware Link shim) for the switcher.

## 10. hreflang — Tell Google About Both Versions

```js
alternates.languages = {
  "de": "https://domain.com/path",
  "en": "https://domain.com/en/path",
  "x-default": "https://domain.com/path"
}
```

Only add the English alternate for pages that actually have an English route. `x-default` always points to the source language version.

## 11. hreflang — Tell Google About Both Versions

*(Already covered in Section 9 above — the pattern is defined there. Apply it to every page type.)*

## 12. Condition Labels — A Common Trap

`products.condition` stores English codes: `"new"`, `"used"`, `"refurbished"`. Your data layer maps these to source-language display labels. Filter matching must use the mapped source-language label — never English.

Every filter option needs two fields: `value` (for matching, source-language) and `label` (for display, translated).

## 13. Verification Checklist

- [ ] `product.image_alts[i]` used as `alt` on every `<img>` rendering a product image — fallback to `product.name`
- [ ] `product.short_description` shown on product cards (distinct from full `description`)
- [ ] `product.badge` rendered as ribbon/chip on product cards when non-null
- [ ] `product.sale_price` shown with strikethrough on `product.price` when set
- [ ] `product.brand` and `product.mpn` shown on product detail if set
- [ ] `product.google_product_category` not displayed anywhere in storefront UI
- [ ] `category.meta_title` / `category.meta_description` in `<head>` on category pages
- [ ] `category.image_url` on category cards with placeholder fallback
- [ ] `category.description` on category cards and landing pages
- [ ] `category.is_featured` + `category.display_order` build homepage category grid
- [ ] JSON-LD Product schema on every product detail page
- [ ] JSON-LD BreadcrumbList on every product detail and category page
- [ ] `og:title`, `og:description`, `og:image`, `og:url` on all pages
- [ ] `<link rel="canonical">` on every page
- [ ] hreflang alternates on all pages with translated mirrors
- [ ] Null fields omitted from JSON-LD (no null values in output)
- [ ] Source language homepage loads live products, categories, sizes — no hardcoded arrays
- [ ] English `/en/` homepage shows translated product names, headings, nav, buttons
- [ ] DE→EN switch: all nav/footer/buttons change language
- [ ] EN→DE switch: everything reverts correctly
- [ ] Shop filter sidebar: source language on main site, translated labels on `/en/` site
- [ ] Filter matching works: clicking translated filter correctly filters products
- [ ] Product detail: name/description in correct language, UI labels also translate
- [ ] Internal links on `/en/` stay within `/en/`
- [ ] Links to source-language-only SEO pages do NOT get `/en/` prefix
- [ ] Quote form submits without `.select()` after `.insert()`
- [ ] No hardcoded source-language strings remain in component files
- [ ] `stores.google_content_language` matches actual content language
- [ ] hreflang tags on all pages with translated mirrors
- [ ] Source language site unchanged after adding new locale
- [ ] CLAUDE.md updated with table schemas used, RLS gaps discovered, i18n coverage, known gaps

## 14. The Golden Rules

1. Every query includes `store_id` — without it you read other tenants' data
2. Never `.select()` after `.insert()` on inquiries — insert-only access
3. `attribute_values.value` is sacred — it is the filter key and must always match `products.attributes`. Never translate for matching
4. Source language in database, other languages in translations table — the store owner writes in source language, DeepSeek generates everything else
5. Site frame strings in `i18n.js`, content strings from database — never mix
6. Default locale has no URL prefix — changing this breaks all existing SEO
7. Verify with curl before assuming RLS is fine — silent `[]` results hide access bugs
8. CLAUDE.md is always up to date — the next agent reading it must continue without asking anything

## 15. What to Check and Confirm Before Starting

Do not begin wiring until you have verified all of the following yourself — read the codebase, query the database, and confirm. Do not ask the user for things you can find yourself.

1. **What is the store's source language?** Read existing component files — what language are hardcoded strings in? Check `<html lang="">` in root layout. Cross-check with `stores.google_content_language` via curl. These must match.
2. **Is the Supabase connection working?** Read `.env.local` for the three env vars. Run the curl test against `products?store_id=eq.$STORE_ID&limit=3` immediately. Confirm you get rows or a valid empty array.
3. **What is hardcoded that should be live?** Scan the entire `src/` directory. List every hardcoded array, object, or string that belongs in the database.
4. **Which languages does the store currently support?** Query `stores?id=eq.$STORE_ID&select=id,enabled_locales,google_content_language` with the anon key.
5. **What routing structure already exists?** Read `src/app/` directory. Is there already a `[locale]` folder, a catch-all, a react-router shim?
6. **Which pages should stay source-language only?** Identify SEO landing pages or long-form content with no database equivalent — these must NOT get locale-prefixed routes.
7. **Does a quote/contact form exist?** Search for form components or inquiries references. Verify it uses INSERT without `.select()`. If not, fix this first.
8. **Are there brand assets or design references?** Check README.md, CLAUDE.md, public folder, Figma links. Understand what exists before adding new UI.

Write a one-line summary of each finding at the top of CLAUDE.md before your first code change.
