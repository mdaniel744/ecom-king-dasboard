---
name: Dashboard Onboarder
description: Complete step-by-step onboarding guide for adding a new store to the Ecom King dashboard platform. Use when a new client store needs to be set up, a new storefront agent needs to be briefed, or the user says anything like "new store", "new site to onboard", "new client", "onboard a store", or "add a storefront".
when_to_use: Trigger when the user mentions setting up a new store, connecting a new storefront, onboarding a new client, or asking what steps are needed to bring a new site onto the platform.
---

# Dashboard Onboarder — Ecom King Platform

When this skill runs, guide the user through the following phases in order. Ask for the answers to Phase C questions before proceeding to content setup. Confirm each phase is complete before moving to the next.

---

## PART 1 — Dashboard Agent Side (your job)

### Phase 0 — Discovery Relay to the Storefront Agent (do this first, before creating any account)

If the new store already has a storefront/site agent working on its own codebase (this is the normal case, not the exception), send them a discovery relay prompt **before** creating the Clerk account or touching the database — their answers determine whether this store needs the Product Families/variant structure from day one, and surface integration gaps (rich text, RLS scoping, URL conventions) while they're still cheap to fix.

**What's safe to hand them immediately, even before a `STORE_ID` exists:** the Supabase URL and anon key. These are one shared, publicly-embeddable credential for the entire platform (every live storefront already ships it client-side) — handing it over early lets the site agent start read-only schema exploration right away. **Never send the service-role key** — that one stays dashboard-only, always. `STORE_ID` genuinely doesn't exist yet at this point (see Phase B) — say so plainly rather than inventing a placeholder.

**Copy-paste relay prompt** (fill in the store name, then send as-is):

> Hi — I'm the dashboard-side engineering agent for Ecom King, a multi-tenant e-commerce backend. We're onboarding your site, **{{STORE_NAME}}**, onto it. Two systems work together: the dashboard (shared admin backend, our side) where the store owner manages products/prices/categories, and the storefront (your codebase) which reads from the same database.
>
> **Connection details you can start with:**
> ```
> Supabase URL: {{SUPABASE_URL}}
> Supabase anon key: {{SUPABASE_ANON_KEY}}
> ```
> Shared across every tenant — safe client-side, but every query must filter by `store_id`. Your own `STORE_ID` doesn't exist yet (issued once the owner's account is created and they first log in) — you can still explore schema/RLS shape against real tables (`products`, `categories`, `attributes`, `attribute_values`, `translations`) in the meantime.
>
> Please answer:
>
> **1. Basic setup** — source language (what the owner writes in), target languages, live domain, Google Merchant Center status/IDs (fine if not ready yet).
>
> **2. Product catalog structure — the important one** — roughly how many products total? Is this a catalog where the *same physical item* comes in multiple sizes/conditions/colours? If yes: list the actual variant axes, and roughly how many *distinct base items* (families) vs. *total variant rows* that produces. Does your product page already have a size/condition/colour picker built — and if so, does it read a generic attributes object per product, or is it hardcoded to specific field names, or does it assume one shared URL per base item with variants switched via query string (WooCommerce-style)?
>
> **3. Rich text** — do product descriptions need formatting (bold, lists, tables)? `products.description` on our side is Tiptap-generated HTML, not plain text — flagging this now so it's built as sanitized HTML rendering (DOMPurify + `dangerouslySetInnerHTML`) from the start instead of a plain-string bug found later.
>
> **4. Existing content** — do you have real or placeholder/sample product data already built for your own testing? If yes, send it over (export, JSON, spreadsheet) — we'll use it as literal seed content in the dashboard instead of starting empty.
>
> **5. URL conventions** — exact URL word for product pages (and family/group pages if any), and whether the source language gets its own URL prefix or none.
>
> Reply with all of this and we'll create the account, wire up the dashboard, and send the full connection handoff with real credentials right after.

**Why this order matters:** the variant-structure and rich-text answers directly change what gets built in Phase C/E below (whether Product Families gets used, whether attribute vocabulary needs a Condition/Size/Type split) — asking after content exists means redoing work. Missing the rich-text question specifically has caused a real bug before (a storefront rendering `<p>{product.description}</p>` as a raw string) — always ask it explicitly, don't wait for it to surface as a visible bug on a live site.

### Phase A — Account Creation

The platform has no self-signup. Every account is created by the platform admin manually.

1. Find the correct **production** Clerk app/instance first — run `clerk apps list --json` and pick the entry named "ecom dashboard" (not Kariv Glamour's separate dealer app), its `environment_type: "production"` instance. Using the wrong instance (e.g. the dev/keyless default) creates a login that won't work against the real deployed site.
2. **Check the email isn't already a user in that instance** before creating — `clerk users list --email-address <email> --app <app_id> --instance <instance_id> --json`. This matters because one Clerk user can only own one store; reusing an email tied to a different store's owner silently logs into *that* store instead of creating a new one, rather than erroring.
3. Create the user: `clerk users create --email <email> --password <generated> --app <app_id> --instance <instance_id> --yes --json` (dry-run first with `--dry-run`). Generate a strong random temporary password — don't ask the owner to pick one over chat.
4. Hand them the dashboard URL + email + password directly. No invitation from an existing store, no signup link needed.

### Phase B — First Login and Store Provisioning

Once the store owner logs in for the first time:
- System detects they are new — no store exists yet
- A brand new empty store is created automatically just for them
- It defaults to "My Store" — they rename it in Settings
- They can see nothing from any other store — isolation is automatic
- Background: system creates a `stores` row and a `store_members` row tied to their Clerk user ID (see `lib/get-current-store.ts` for the exact upsert logic)

**If you need to hand the storefront agent a real `STORE_ID` before the owner has actually logged in** (common — the site agent is often ready to start wiring before the owner gets around to it), provision the rows yourself via SQL, mirroring `getCurrentStore()`'s logic exactly rather than inventing a different shape:

```sql
insert into stores (name, slug, owner_user_id)
values ('<Store Name>', 'store-<8 random hex chars>', '<clerk_user_id>')
returning id;

insert into store_members (store_id, user_id, role)
values ('<store id from above>', '<clerk_user_id>', 'owner');
```

This produces byte-for-byte the same result as the app's own first-login auto-provisioning — functionally identical, just not waiting on the owner's calendar. Feel free to also set the store's real name (instead of leaving "My Store") if you already know it, saving the owner a step.

### Phase C — Initial Configuration

If you ran the Phase 0 discovery relay, most of these are already answered — cross-check rather than re-asking:

1. What language will the store owner write all content in? *(source language — must match what they type)*
2. What is the storefront domain? *(e.g. mystore.de)* — **this is a plain Settings field, not code.** It's used only for Google Merchant product links (`buildProductLink()`) and the storefront's own SEO tags (canonical/hreflang/og:url) — nothing in the dashboard codebase needs to be touched to set it, and nothing about the database connection depends on it being filled in yet.
3. What other languages should the site support? *(target locales for DeepSeek translation)*
4. Google Merchant Center account ID and data source ID? *(can be added later if not ready — never a blocker for connecting the dashboard)*
5. What niche/industry is this store? *(guides Attribute vocabulary recommendations)*
6. **Product catalog structure** (from Phase 0's answer): does this store need **Product Families** (see the dedicated section in `CLAUDE.md`)? Decide now, before Phase E — if products are the same physical item in different sizes/conditions/colours, build the attribute vocabulary and family structure from the start rather than retrofitting after products already exist as unrelated standalone rows. If a family/variant mapping isn't obvious from the site agent's answer, work it out explicitly (e.g. "family = base item with size/type baked into the name; variant axis = whatever the site agent said actually toggles on their product page") and confirm it back to them before they build against it.
7. **Real product count and Merchant readiness are never gating.** Don't wait to hear "47 products, ready to go" before creating the account or wiring the connection — the whole point of the dashboard is that the owner adds/edits this themselves, at any pace, after the connection exists. If the store is empty when the storefront agent first connects, that's the correct, expected state, not a problem to solve before handoff (see "Onboarding a new store" in `CLAUDE.md` for the fuller reasoning on this).

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

**If the storefront being onboarded already has content — real inventory, or even placeholder/sample content the storefront agent built for their own testing — treat it as the source material for this phase, not something to leave for "later."** Explicitly ask the storefront agent to send the actual raw file/export (their sample data file — e.g. a `catalog.js`, JSON export, or spreadsheet — not just a description of what fields exist) as soon as it exists, and enter it into the dashboard as the initial attributes/categories/products rather than starting from a blank dashboard and waiting. A dashboard with zero products right after onboarding is not more "correct" than one seeded from the storefront's own existing content — it's just slower to get to something both sides can actually verify against, and seeing the storefront's real products land in the dashboard, editable, is the clearest possible confirmation the connection is genuinely live (not just plumbed). The owner can always edit or replace it afterward from the dashboard, same as any other content — this is a starting point, not a one-way door.

If the storefront's content is deliberately fictional/placeholder (confirm this explicitly with whoever's driving the onboarding rather than assuming), still enter it as-is — it becomes the literal starting template the owner edits from, which is usually preferred over an empty state.

Always in this order — each step depends on the previous:

1. **Attributes first** — before products, because products reference attribute values. Create the niche-specific vocabulary (size, material, color, type, etc.). Enrich each attribute value with `label`, `image_url`, and `description` via the pencil icon if they will appear as visual cards on the storefront homepage.
2. **Categories second** — create the category structure. Add `image_url`, `description`, SEO fields. Mark homepage categories as `is_featured = true` and set `display_order`.
3. **Products last** — assign categories and attributes that already exist. Write all text in the source language. For each product:
   - Fill **Brand** and use **Generate** on MPN — gives Google a verified product identifier
   - Use **AI Suggest** on Google Product Category — DeepSeek picks the correct taxonomy path
   - Add at least one image URL, then use **Generate** on each image's alt text — critical for image SEO
   - Set status to **Active** only when price, image, and title are all filled — the form will block saving as Active otherwise

**If Phase C decided this store needs Product Families**, build it in this order instead of hand-creating every row: create the attribute(s) that represent the actual variant axis/axes first (e.g. Condition: New/Used), create one family per distinct base item, then use **Generate Variants** (`/dashboard/product-families/[id]/generate`) to bulk-create the variant rows in one pass — check the boxes for the axis values that apply, confirm the live count matches what the site agent reported (e.g. "5 families → 9 variant rows"), then fill in whatever real/placeholder name, description, price, and images came from the seed content per generated draft row. This is faster and less error-prone than hand-creating each variant individually, and running it again later only creates newly-missing combinations.

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

**Phase 0 — before account creation:**
- [ ] Sent discovery relay prompt to the storefront agent (languages, domain, Merchant status, product count/variant structure, rich text, existing content, URL conventions)
- [ ] Decided whether this store needs Product Families based on their variant-structure answer
- [ ] Confirmed with the site agent whether their product picker is already attribute-driven, hardcoded, or needs a rewrite to match our model

**Dashboard side:**
- [ ] Identified the correct production Clerk app/instance (`clerk apps list`) — not the dev/keyless default
- [ ] Confirmed the owner's email isn't already a Clerk user tied to a different store
- [ ] Create Clerk user (dry-run first), hand over credentials
- [ ] Store provisioned — either via real first login, or manually via SQL (see Phase B) if the storefront agent needs a `STORE_ID` before the owner logs in
- [ ] Pull and note the store ID
- [ ] Run SQL migration: `ALTER TABLE products ADD COLUMN IF NOT EXISTS image_alts text[] NOT NULL DEFAULT '{}';`
- [ ] Set source language in Settings → Content Language
- [ ] Set domain in Settings → Store Profile (storefront domain, not dashboard domain) — plain Settings field, not a code change
- [ ] Set Feed Label (market country code e.g. DE)
- [ ] Create all Attributes for this niche; enrich values with label/image/description if needed; if Product Families applies, make sure the variant-axis attribute(s) are created before families
- [ ] Create categories with image_url, description, is_featured, display_order, meta_title, meta_description
- [ ] If seed content was sent, enter it as real products/families (via Generate Variants if applicable) rather than leaving the dashboard empty
- [ ] Otherwise, enter all products in source language — for each: use Generate on MPN, AI Suggest on Google Product Category, Generate on each image alt text
- [ ] Tick target languages in Settings → Translation
- [ ] Re-save all existing content once (backfill)
- [ ] Verify translations table has rows for all entities in target locale
- [ ] **Generate and deliver First-Time Storefront Agent Onboarding Prompt**

**Storefront side:**
- [ ] Add target language strings to i18n.js
- [ ] Build /[locale]/ URL routes
- [ ] Wire language switcher to stores.enabled_locales
- [ ] Add hreflang tags to all pages
- [ ] Render `products.description` (and its translation rows) as sanitized HTML, not a raw string
- [ ] If Product Families applies: picker reads `product.attributes.<axis>` and enumerates siblings by `family_id`, not hardcoded field names
- [ ] `attribute_values` queries are always scoped through a store-scoped `attributes` query first, never queried directly unscoped (its RLS policy only checks referential existence, not tenant match)
- [ ] Test: toggling language shows no source-language leakage
- [ ] Test: filter sidebar shows translated attribute values
- [ ] Test: original language site unchanged
- [ ] Test: once real/seed products exist, family/variant picker actually renders and toggles correctly on the live site — verify this yourself, don't just trust the code review

---

## The Golden Rule

**The dashboard owns the content. The storefront owns the frame. DeepSeek connects them.**

- In the database (products, categories, attributes) → DeepSeek handles it
- Hardcoded in website design (buttons, menus, headings) → storefront agent handles it
- Never mix them up
