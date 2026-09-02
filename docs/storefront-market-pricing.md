# Storefront market pricing

The dashboard keeps one base price and currency on each product. Storefronts
must request customer-facing prices whenever their language/market selection
changes instead of saving converted copies that become stale.

## Endpoint

```text
GET /api/storefront/prices/{store-id-or-slug}?locale=pl&productIds=id-1,id-2
```

The `locale` is resolved only through **Market → Delivery Markets → Storefront
language routing**. When a store has several markets, an unlinked locale is
rejected rather than guessed. Several locales may point to one market, so a
Czech-only store can route both `cs` and `en` to `CZ`; both receive CZK.

An explicit `market=PL` may be sent instead of `locale=pl`. The market must be
enabled for the store. Omit product IDs to retrieve a paginated active-product
price list with `page` and `limit` (maximum 100).

## Language-switcher integration

```ts
async function pricesForLocale(
  dashboardOrigin: string,
  storeId: string,
  locale: string,
  productIds: string[]
) {
  const query = new URLSearchParams({
    locale,
    productIds: productIds.join(","),
  });
  const response = await fetch(
    `${dashboardOrigin}/api/storefront/prices/${storeId}?${query}`
  );
  if (!response.ok) throw new Error("Market prices could not be loaded");
  return response.json();
}
```

After a language switch, replace each product card's displayed value with
`marketPrice.price`, `marketPrice.salePrice`, and `marketPrice.currency` from
the response. The same market values must be copied into cart line items and
checkout totals. Never convert the last displayed value again; every request
starts from the stored source price.

`selection.multiCurrencyEnabled` is true only when the configured delivery
markets contain more than one distinct customer currency. Translation remains
independent: several languages can use the same market and currency.

Market prices are returned VAT-inclusive when that market has a configured VAT
rate. Conversion uses the latest available ECB reference-rate observation,
then VAT is applied, and the final value is rounded for the target currency.
