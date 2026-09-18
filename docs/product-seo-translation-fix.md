# Automatic product copy and SEO translations

Product saves include `short_description`, `meta_title`, and `meta_description`
alongside the title and full description. Only non-empty source fields are
translated; this workflow does not invent missing summaries or SEO copy.

## Dashboard changes

- Fill missing/blank translations and retry obvious English copies on save.
- Refresh AI translations when the corresponding source field changes, while
  preserving human corrections and flagging them for review.
- Read all source fields before comparing a product edit; SEO-only edits are
  no longer compared against an incomplete old product record.
- Bound provider requests, retry failures, and give product-edit routes a
  300-second execution budget on hosts supporting `maxDuration`.
- Refresh pending translations in the editor without reloading the page.
- `scripts/setup-kariv-dealer-translation-webhook.sql` also watches SEO changes
  and supports both dealer ownership column names. Reapply this script if
  direct-to-Supabase dealer submissions use the optional webhook. It still
  requires the existing pg_net/Vault deployment configuration.

## Kariv storefront companion change

Repository: `https://github.com/mdaniel744/kariv-glamour.git`.
Local checkout: `tmp/kariv-glamour` (separate Git repository, ignored by this
dashboard repository). Its changes must be committed/deployed separately.

The catalog adapter now maps `meta_title`/`meta_description` to
`metaTitle`/`metaDescription`, including their `de` and `cs` translation rows.
Metadata prefers the requested language's SEO copy, then its translated
summary/description, rather than an English SEO fallback. Product pages render
the translated short description under the title. The storefront's own listing
translation/save flow also includes both SEO fields. Translated dashboard URL
slugs resolve the same product as the original slug.

## Data repair (2026-09-18)

Repaired 35 flagged short-description/SEO translation fields, with source
products and human corrections preserved. Backup:
`reports/kariv-translation-backup-2026-09-18T08-12-10-689Z.json`.
The local reports directory is excluded from Git.

The audit found source text on 148/738 short descriptions and 151/738 SEO
title/description pairs. Blank source fields require content before they can
be translated. One legacy short description is already German in the source
column and is flagged for review rather than rewriting its original text;
its human German correction and saved Czech translation were checked and kept.

## Verification

Dashboard: `npm run test:translations`, `npm run test:feeds`, `npm run build`.
Storefront: `pnpm test`, `pnpm build` in its checkout.
Check German/Czech product-page HTML for its title, description metadata,
visible summary, and matching saved translations after both deployments.

Both production builds passed locally. All 193 storefront tests, 22 dashboard
translation tests, and 9 feed tests passed. A local storefront preview using
public catalog credentials rendered exact matches for the saved German and
Czech SEO titles, SEO descriptions, and visible short descriptions on the
Cartier Santos WSSA0061 page. No production code was deployed and the optional
database webhook SQL was not executed.
