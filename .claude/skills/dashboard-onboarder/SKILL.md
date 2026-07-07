---
name: Dashboard Onboarder
description: Complete step-by-step onboarding guide for adding a new store to the Ecom King dashboard platform. Use when a new client store needs to be set up, a new storefront agent needs to be briefed, or the user says anything like "new store", "new site to onboard", "new client", "onboard a store", or "add a storefront".
when_to_use: Trigger when the user mentions setting up a new store, connecting a new storefront, onboarding a new client, or asking what steps are needed to bring a new site onto the platform.
---

# Dashboard Onboarder — Ecom King Platform

When this skill runs, guide the user through the following phases in order. Ask for the answers to Phase C questions before proceeding to content setup. Confirm each phase is complete before moving to the next.

---

## PART 1 — Dashboard Agent Side (your job)

### Phase A — Account Creation

The platform has no self-signup. Every account is created by the platform admin manually.

1. Go to the **Clerk dashboard** → Users → **Create user**
2. Enter the new store owner's email and set a password
3. Hand them the dashboard URL + email + password directly
4. No invitation from an existing store, no signup link needed

### Phase B — First Login and Store Provisioning

Once the store owner logs in for the first time:
- System detects they are new — no store exists yet
- A brand new empty store is created automatically just for them
- It defaults to "My Store" — they rename it in Settings
- They can see nothing from any other store — isolation is automatic
- Background: system creates a `stores` row and a `store_members` row tied to their Clerk user ID

### Phase C — Initial Configuration

**Ask these questions before any content is created:**

1. What language will the store owner write all content in? *(source language — must match what they type)*
2. What is the storefront domain? *(e.g. mystore.de)*
3. What other languages should the site support? *(target locales for DeepSeek translation)*
4. Google Merchant Center account ID and data source ID? *(can be added later if not ready)*
5. What niche/industry is this store? *(guides Attribute vocabulary recommendations)*

**Settings to configure in the dashboard:**

| Setting | Location | Purpose |
|---|---|---|
| Store Name | Settings → Store Profile | Shown top-left of dashboard |
| Domain | Settings → Store Profile | Required for Google Merchant product links |
| Content Language | Settings → Google Merchant | Source language — must match what they write in |
| Feed Label | Settings → Google Merchant | Market/country code (e.g. DE, US) |
| Translation targets | Settings → Translation | Languages DeepSeek will translate into |

### Phase D — Database Migration Check

Before creating any products, confirm this column exists in Supabase. Run in the SQL editor:

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_alts text[] NOT NULL DEFAULT '{}';
```

This is safe to run multiple times. If it was already run, it does nothing.

### Phase E — Content Build Order

Always in this order — each step depends on the previous:

1. **Attributes first** — before products, because products reference attribute values. Create the niche-specific vocabulary (size, material, color, type, etc.). Enrich each attribute value with `label`, `image_url`, and `description` via the pencil icon if they will appear as visual cards on the storefront homepage.
2. **Categories second** — create the category structure. Add `image_url`, `description`, SEO fields. Mark homepage categories as `is_featured = true` and set `display_order`.
3. **Products last** — assign categories and attributes that already exist. Write all text in the source language. For each product:
   - Fill **Brand** and use **Generate** on MPN — gives Google a verified product identifier
   - Use **AI Suggest** on Google Product Category — DeepSeek picks the correct taxonomy path
   - Add at least one image URL, then use **Generate** on each image's alt text — critical for image SEO
   - Set status to **Active** only when price, image, and title are all filled — the form will block saving as Active otherwise

### Phase F — Language Activation and Backfill

Once initial content exists:

1. Settings → Translation → tick target language(s) → Save
2. `enabled_locales` is now set — DeepSeek auto-translates all future saves
3. **Backfill required:** re-save every existing product, category, and attribute value once to trigger translation of pre-existing content
4. Confirm: query `translations` table — rows should exist for every key entity in the target locale

### Phase G — Verification Checklist Before Storefront Handoff

- [ ] `image_alts` column exists in products table (SQL migration confirmed run)
- [ ] `translations` table has rows for products, categories, attribute names, attribute values in target locale
- [ ] Domain set correctly in Settings → points to storefront, not dashboard
- [ ] `google_content_language` matches actual content language
- [ ] `enabled_locales` reflects all intended target languages
- [ ] Each product has Brand + MPN (use Generate), Google Product Category (use AI Suggest), and image alt text (use Generate per image)
- [ ] Store ID noted for handoff

**Pull the store ID:** query `stores` table filtered by the new owner's Clerk user ID.

---

## HANDOFF — Generate First-Time Storefront Agent Onboarding Prompt

At this point, generate and deliver the **First-Time Storefront Agent Onboarding Prompt**.

Use `storefront-agent-template.md` (in this skill's directory) as the base. Fill in every `{{PLACEHOLDER}}` with the real values for this store before handing it over. Do NOT hand over a prompt with unfilled placeholders — the storefront agent must be able to copy-paste it and start immediately.

| Placeholder | Where to get it |
|---|---|
| `{{STORE_NAME}}` | Store's name from Settings |
| `{{SUPABASE_URL}}` | Dashboard `.env`: NEXT_PUBLIC_SUPABASE_URL |
| `{{SUPABASE_ANON_KEY}}` | Dashboard `.env`: NEXT_PUBLIC_SUPABASE_ANON_KEY |
| `{{STORE_ID}}` | Query `stores` table after first login |
| `{{SOURCE_LANGUAGE_CODE}}` | `stores.google_content_language` |
| `{{ENABLED_LOCALES}}` | `stores.enabled_locales` |
| `{{DOMAIN}}` | `stores.domain` from Settings |

---

## PART 2 — Storefront Agent Side

*This is what the storefront agent must deliver. Preserve exactly.*

### What This System Does

Two agents work together:
- **Dashboard** — back office. Store owner manages products, categories, prices, settings.
- **Storefront** — the website visitors see. Reads from the dashboard, shows it to the world.

When a second language is added, two separate jobs happen:
- DeepSeek (via dashboard) translates all product and category content
- Storefront Agent translates all buttons, menus, labels and site text

Both must be done. One without the other = half-translated site.

### Step 1 — Write Everything in the Main Language

Store owner writes all content in the source language. For a German site, everything goes in German.

**The rule:** Always write in the source language. Never write product content in the target language — that is DeepSeek's job.

✅ Product name in German: "Glassonion Container"
✅ Description in German: "Kompakt und vielseitig..."
❌ Do not enter the English translation yourself

### Step 2 — Turn On the Second Language in Settings

Settings → Translation → tick target language → Save.

`enabled_locales: ["en"]` is now in the database — the official on/off switch. Every future save auto-translates.

**Backfill rule:** Pre-existing content is not translated until re-saved. Re-save all existing products and categories once after ticking.

### Step 3 — DeepSeek Translates All Content Automatically

What gets translated (automatic, no action needed):
- Product names, descriptions, short descriptions, badges
- Category names, descriptions, SEO titles
- Attribute names and values
- Attribute card labels and descriptions

Stored in: `translations` table. Each row = one field, one entity, one locale.

Storefront fallback rule: if no translation row exists → show source-language value. Never blank.

### Step 4 — Storefront Agent Builds the Site Frame

Done once when a new language is added.

**A. URL structure**
- `domain.de` → source language (no prefix, preserves existing SEO)
- `domain.de/en` → English homepage
- `domain.de/en/shop` → English shop
- `domain.de/en/produkt/slug` → English product page

**B. Site frame dictionary (i18n.js)**
Every button, heading, nav label, footer word in every language side by side:
- "Angebot anfordern" → "Request a quote"
- "Alle Container" → "All containers"
Written once. Only changes when new UI elements are added.

**C. Language switcher button**
DE/EN in the header. Reads `stores.enabled_locales` to know which languages to show.

**D. Google signposts (hreflang)**
Invisible tags on every page telling Google the German and English versions are the same content. Required for correct multilingual SEO indexing.

---

## Division of Responsibilities

| What | Who | Where |
|---|---|---|
| Product names, descriptions | DeepSeek (automatic) | translations table |
| Category names, descriptions | DeepSeek (automatic) | translations table |
| Attribute names and values | DeepSeek (automatic) | translations table |
| Nav labels, buttons, headings | Storefront agent (once) | i18n.js |
| Footer text, form labels | Storefront agent (once) | i18n.js |
| URL structure /en/ | Storefront agent (once) | Next.js routes |
| Language switcher | Storefront agent (once) | Header component |
| Google hreflang tags | Storefront agent (once) | seo.js |

---

## Full Checklist

**Dashboard side:**
- [ ] Create Clerk user, hand over credentials
- [ ] Store owner logs in — confirm store auto-provisioned
- [ ] Pull and note the store ID
- [ ] Run SQL migration: `ALTER TABLE products ADD COLUMN IF NOT EXISTS image_alts text[] NOT NULL DEFAULT '{}';`
- [ ] Set source language in Settings → Content Language
- [ ] Set domain in Settings → Store Profile (storefront domain, not dashboard domain)
- [ ] Set Feed Label (market country code e.g. DE)
- [ ] Create all Attributes for this niche; enrich values with label/image/description if needed
- [ ] Create categories with image_url, description, is_featured, display_order, meta_title, meta_description
- [ ] Enter all products in source language — for each: use Generate on MPN, AI Suggest on Google Product Category, Generate on each image alt text
- [ ] Tick target languages in Settings → Translation
- [ ] Re-save all existing content once (backfill)
- [ ] Verify translations table has rows for all entities in target locale
- [ ] **Generate and deliver First-Time Storefront Agent Onboarding Prompt**

**Storefront side:**
- [ ] Add target language strings to i18n.js
- [ ] Build /[locale]/ URL routes
- [ ] Wire language switcher to stores.enabled_locales
- [ ] Add hreflang tags to all pages
- [ ] Test: toggling language shows no source-language leakage
- [ ] Test: filter sidebar shows translated attribute values
- [ ] Test: original language site unchanged

---

## The Golden Rule

**The dashboard owns the content. The storefront owns the frame. DeepSeek connects them.**

- In the database (products, categories, attributes) → DeepSeek handles it
- Hardcoded in website design (buttons, menus, headings) → storefront agent handles it
- Never mix them up
