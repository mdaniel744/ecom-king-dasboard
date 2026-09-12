# Kariv Glamour product language correction

## Correct language model

- Supabase store ID: `7efd71bc-0287-4f40-8a2f-1de330c49522`
- Product source language: English (`en`)
- Generated storefront translation: German (`de`)
- Product titles and descriptions entered in English stay in the primary `products` fields.
- German output belongs in `translations` rows with `locale = de`.
- The storefront URL mismatch is separate: the database still has no tenant domain and says `products` with no source prefix, while the live storefront uses `/{locale}/product/{slug}`. This language correction does not change URLs.

## Verified pre-switch catalog (2026-09-12)

- Products: 637
- Existing product translation rows: 1,667
- Products with likely English primary content: 575
- German-primary bilingual products with reusable English rows: 14, including the two protected products
- Ambiguous/brand-heavy product copy: 48
- Orphan product translation rows: 54 (reported, not deleted)
- Dealer-owned products: 0

The switch plan promotes 25 existing English fields into the primary product record while preserving their former German values under `locale = de`. It also relocates 24 existing German fields that were previously stored under `locale = en`. No translation provider is required for this lossless correction.

Detailed local reports and rollback snapshots are written to `reports/` and ignored by Git because they contain catalog text.

## Applied state (2026-09-12)

The tenant switch completed and was verified in Supabase:

- Source language: `en`
- Enabled translation locale: `de`
- Products promoted to an English primary copy: 14
- Promoted fields: 25
- Existing German fields relocated to `locale = de`: 24
- Products already complete in German: 8, plus 2 protected products
- Products awaiting German generation: 627 (1,189 fields)
- Rollback snapshot: `reports/kariv-source-language-backup-2026-09-12T09-53-39-935Z.json`

## Protected manual corrections

These products retain their verified human English and German copies:

- Cartier Coussin: `7375cbf5-5588-4ca9-bd16-baae4be6a0e5`
- Cartier Pasha: `abb40274-aa40-44d7-93d3-6e93c552c51b`

The source-language switch refuses to run unless their authoritative English titles are present. Their old German primary text is copied byte-for-byte to human German translation rows before English becomes primary. Normal sync also treats any `translator = human` row as locked and cannot overwrite it with AI.

## Source-language switch

The command is read-only unless `--apply` is supplied:

```powershell
node scripts\switch-kariv-source-language.mjs
node scripts\switch-kariv-source-language.mjs --apply
```

Apply writes a checksum-protected full catalog snapshot before the first Supabase write. Rollback requires the exact backup plus tenant confirmation:

```powershell
node scripts\switch-kariv-source-language.mjs --rollback reports\kariv-source-language-backup-<timestamp>.json --confirm-rollback 7efd71bc-0287-4f40-8a2f-1de330c49522
```

Rollback restores the three language settings, the source fields, and the affected English/German translation rows. It does not overwrite unrelated store settings.

## German translation backfill

After the switch, missing German rows can be generated from the English primary fields. This process never rewrites English product fields:

```powershell
node scripts\repair-kariv-product-translations.mjs
node scripts\repair-kariv-product-translations.mjs --backup-only
node scripts\repair-kariv-product-translations.mjs --apply --limit 25
node scripts\repair-kariv-product-translations.mjs --apply --limit all --resume
```

Applying requires `DEEPSEEK_API_KEY`. It runs at most two products concurrently, retries transient failures, preserves human German rows, verifies each write, and checkpoints after every batch. Until the provider key is configured and the backfill runs, German pages without a German row may fall back to English.

## Prevention for future listings

- Kariv's product form uses the tenant's configured English source by default and offers German as the alternate writing language.
- English submissions save as the primary product copy; missing German translation work is queued after the response.
- A submission explicitly written in German is translated into English before primary fields change, while the submitted German is preserved as a human translation.
- Imports and exports include `content_language`. Ambiguous legacy copy falls back to the configured English source.
- Import translation concurrency is capped at two, and generated family variants queue work sequentially.
- The translation editor exposes missing fields and a **Retry missing** action.
- The separate dealer storefront must submit through this workflow with `content_language`, or its own write path must implement the same rule.

## Verification checklist

1. Confirm the tenant reports source `en` and enabled locale `de`.
2. Audit all products and confirm primary product text is English.
3. Confirm the protected Cartier English and German values exactly match the backup.
4. Run the German backfill when the translation provider key is available.
5. Check representative `/en/product/...` and `/de/product/...` pages, cards, search metadata, and sitemap output.
6. Purge or revalidate the external storefront cache before judging public results.
