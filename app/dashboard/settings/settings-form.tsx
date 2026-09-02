"use client";

import Link from "next/link";
import { useState, useTransition, useEffect, useRef } from "react";
import { MessageSquareText, ShieldCheck, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActionErrorBanner } from "@/components/dashboard/action-error-banner";
import { updateStoreSettings } from "@/app/dashboard/settings/actions";
import {
  testProductLinks,
  updateDeliveryMarketSettings,
  updateGoogleMerchantSettings,
} from "@/app/dashboard/market/actions";
import {
  CONTENT_LANGUAGE_OPTIONS,
  FEED_LABEL_OPTIONS,
  defaultCurrencyForMarket,
  defaultLocaleForMarket,
} from "@/lib/merchant-locales";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { FieldInfo } from "@/components/ui/field-info";
import type { Store } from "@/lib/types";
import type { LinkCheckResult } from "@/lib/google-merchant";

type ParsedProductUrl = { word: string; detectedLocale: string | null; isSourceLocale: boolean };

function initialLocaleMarketSelection(
  store: Store,
  markets: string[],
  availableLocales: string[]
): Record<string, string> {
  const byLocale: Record<string, string> = {};

  for (const [locale, market] of Object.entries(store.locale_markets ?? {})) {
    if (markets.includes(market) && availableLocales.includes(locale)) {
      byLocale[locale] = market;
    }
  }

  for (const locale of availableLocales) {
    if (byLocale[locale]) continue;
    if (markets.length === 1) {
      byLocale[locale] = markets[0];
      continue;
    }
    const matchingMarket = markets.find(
      (market) => defaultLocaleForMarket(market, availableLocales) === locale
    );
    if (matchingMarket) {
      byLocale[locale] = matchingMarket;
    }
  }

  const primaryMarket = markets[0];
  const sourceLocale = store.google_content_language.toLowerCase();
  if (primaryMarket && !byLocale[sourceLocale]) {
    byLocale[sourceLocale] = primaryMarket;
  }

  return byLocale;
}

/**
 * Extracts Product Page Word (and, when possible, a source-locale-prefix
 * signal) from one real pasted product URL instead of asking someone to
 * read it off by eye — that manual step is exactly what drifted wrong for
 * STF (word was "products", the real site used "containers"). Domain +
 * last path segment (the product's own slug) are stripped; a recognized
 * locale code leading the remaining path is treated as the language
 * prefix, not part of the word — whatever's left is the word, joined back
 * with "/" in the rare case the real path has more than one segment there.
 */
function parseProductUrlWord(rawUrl: string, store: Store): ParsedProductUrl | { error: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { error: "Paste a URL first." };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { error: "That doesn't look like a valid URL." };
  }

  const normalizeHost = (h: string) => h.replace(/^www\./i, "").toLowerCase();
  const pastedHost = normalizeHost(url.hostname);
  const storeHost = store.domain
    ? normalizeHost(
        store.domain
          .replace(/^https?:\/\//i, "")
          .replace(/\/.*$/, "")
      )
    : "";
  if (storeHost && pastedHost !== storeHost) {
    return {
      error: `That URL's domain (${pastedHost || "none"}) doesn't match this store's domain (${storeHost}). Paste a link from this store's own site.`,
    };
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    return {
      error:
        "That doesn't look like a single product page — make sure it points to one specific product, not the homepage or a list page.",
    };
  }

  // Last segment is the product's own slug — every product has a different
  // one, so it's never part of the word and is always ignored here.
  const pathSegments = segments.slice(0, -1);

  const knownLocales = new Set(
    [store.google_content_language, ...(store.enabled_locales ?? []), ...CONTENT_LANGUAGE_OPTIONS.map((o) => o.value)]
      .filter(Boolean)
      .map((l) => l!.toLowerCase())
  );

  let detectedLocale: string | null = null;
  let wordSegments = pathSegments;
  if (pathSegments.length > 0 && knownLocales.has(pathSegments[0].toLowerCase())) {
    detectedLocale = pathSegments[0].toLowerCase();
    wordSegments = pathSegments.slice(1);
  }

  if (wordSegments.length === 0) {
    return {
      error:
        "Couldn't find a word between the language code and the product name — double check this is a real single-product page.",
    };
  }

  return {
    word: wordSegments.join("/"),
    detectedLocale,
    isSourceLocale: detectedLocale !== null && detectedLocale === store.google_content_language.toLowerCase(),
  };
}

export type SettingsSection =
  | "general"
  | "google-merchant-center"
  | "delivery-markets"
  | "xml-feed-urls";

export function SettingsForm({
  store,
  section = "general",
}: {
  store: Store;
  section?: SettingsSection;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enabledLocales, setEnabledLocales] = useState<string[]>(store.enabled_locales ?? []);
  const configuredMarkets = store.google_feed_labels?.length
    ? store.google_feed_labels
    : [store.google_feed_label];
  const availableStorefrontLocales = Array.from(
    new Set([
      store.google_content_language.toLowerCase(),
      ...(store.enabled_locales ?? []).map((locale) => locale.toLowerCase()),
    ])
  );
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(configuredMarkets);
  const [localeMarkets, setLocaleMarkets] = useState<Record<string, string>>(() =>
    initialLocaleMarketSelection(store, configuredMarkets, availableStorefrontLocales)
  );
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteFeedback, setPasteFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const productUrlPathRef = useRef<HTMLInputElement>(null);
  const sourceLocalePrefixRef = useRef<HTMLInputElement>(null);
  const wordOverrideRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function handleExtractWord() {
    const result = parseProductUrlWord(pasteUrl, store);
    if ("error" in result) {
      setPasteFeedback({ kind: "error", text: result.error });
      return;
    }

    // No locale in the URL, or it matches the source language: this is the
    // shared default word, not a per-language exception -- fill the main
    // field, same as before.
    if (!result.detectedLocale || result.isSourceLocale) {
      if (productUrlPathRef.current) productUrlPathRef.current.value = result.word;

      if (result.detectedLocale && sourceLocalePrefixRef.current) {
        sourceLocalePrefixRef.current.checked = true;
        setPasteFeedback({
          kind: "success",
          text: `Set to "${result.word}". Also detected "${result.detectedLocale}" (your Content Language) right in the URL, so "My site keeps a language code..." below is now checked too.`,
        });
      } else {
        setPasteFeedback({ kind: "success", text: `Set to "${result.word}". No language code found in this URL.` });
      }
      return;
    }

    // A non-source language was detected -- this word only belongs to that
    // one language, not every language, so it goes into that language's own
    // exception field instead of overwriting the shared word above.
    const overrideInput = wordOverrideRefs.current[result.detectedLocale];
    if (!overrideInput) {
      setPasteFeedback({
        kind: "error",
        text: `Detected "${result.detectedLocale}" with word "${result.word}", but "${result.detectedLocale}" isn't checked under Translation yet — enable it there first, then paste this link again.`,
      });
      return;
    }
    overrideInput.value = result.word;
    setPasteFeedback({
      kind: "success",
      text: `Detected "${result.detectedLocale}" → set its word exception to "${result.word}" below, without touching the main word above (which still applies to every other language).`,
    });
  }

  function handleMarketToggle(market: string, checked: boolean) {
    const nextMarkets = checked
      ? selectedMarkets.includes(market)
        ? selectedMarkets
        : [...selectedMarkets, market]
      : selectedMarkets.filter((selectedMarket) => selectedMarket !== market);
    setSelectedMarkets(nextMarkets);

    setLocaleMarkets((previousMappings) => {
      const nextMappings = Object.fromEntries(
        Object.entries(previousMappings).filter(([, selectedMarket]) =>
          nextMarkets.includes(selectedMarket)
        )
      );

      // A language switcher does not imply multi-currency when there is only
      // one delivery market: every enabled language remains routed to that
      // same country and therefore the same currency.
      if (nextMarkets.length === 1) {
        for (const locale of availableStorefrontLocales) {
          nextMappings[locale] = nextMarkets[0];
        }
        return nextMappings;
      }

      if (checked) {
        const suggestedLocale = defaultLocaleForMarket(market, availableStorefrontLocales);
        if (suggestedLocale && !nextMappings[suggestedLocale]) {
          nextMappings[suggestedLocale] = market;
        }
      }
      return nextMappings;
    });
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await (
        section === "google-merchant-center"
          ? updateGoogleMerchantSettings
          : section === "delivery-markets"
            ? updateDeliveryMarketSettings
            : updateStoreSettings
      )(formData);
      if (result.success) {
        toast.success(
          section === "google-merchant-center"
            ? "Google Merchant Center settings saved"
            : section === "delivery-markets"
              ? "Delivery markets saved"
              : "Settings saved"
        );
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  if (section === "xml-feed-urls") {
    return (
      <div className="mt-6 max-w-xl">
        <FeedUrlCard store={store} />
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="mt-6 max-w-3xl space-y-6">
      <ActionErrorBanner message={error} />

      {section === "general" && (
        <Card id="store-profile" className="scroll-mt-6">
          <CardHeader>
            <CardTitle className="text-base">Store Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="name">Store Name</Label>
              <FieldInfo
                title="Store Name"
                description="Your business or store name as it appears in the dashboard. Used as the feed title in your Google Shopping XML feed."
              />
            </div>
            <Input id="name" name="name" required defaultValue={store.name} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="domain">Storefront Domain</Label>
              <FieldInfo
                title="Storefront Domain"
                description="The web address of your public store — e.g. mystore.com or shop.mystore.com. Used to build the product page links sent to Google Shopping. Without this set, Google sync will not work."
              />
            </div>
            <Input
              id="domain"
              name="domain"
              placeholder="e.g. mystore.com"
              defaultValue={store.domain ?? ""}
            />
          </div>
        </CardContent>
        </Card>
      )}

      {section === "google-merchant-center" && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Merchant Center</CardTitle>
          <p className="text-sm text-muted-foreground">
            Each store connects to its own Merchant Center account — these values are
            specific to your business, not shared across other stores on this platform.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="google_merchant_id">Merchant Center ID</Label>
              <FieldInfo
                title="Merchant Center ID"
                description="Your Google Merchant Center account number. You can find it in the top-right corner of merchants.google.com — it's the number shown below your account name. Each store on this platform connects to its own separate Merchant Center account."
                link={{ label: "Open Merchant Center", href: "https://merchants.google.com" }}
              />
            </div>
            <Input
              id="google_merchant_id"
              name="google_merchant_id"
              placeholder="e.g. 123456789"
              defaultValue={store.google_merchant_id ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="google_merchant_datasource_id">API Data Source ID</Label>
              <FieldInfo
                title="API Data Source ID"
                description="The ID of the API data source you created inside your Merchant Center account. This is how Google knows which product feed to associate your API uploads with. Get it from: Merchant Center → Settings → Data sources → Add product source → API."
              />
            </div>
            <Input
              id="google_merchant_datasource_id"
              name="google_merchant_datasource_id"
              placeholder="e.g. 104628"
              defaultValue={store.google_merchant_datasource_id ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              From Merchant Center: Settings → Data sources → Primary sources → Add product source → API.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="google_content_language">Content Language</Label>
              <FieldInfo
                title="Content Language"
                description="The language you actually write your product titles and descriptions in — your store's source language. Not a list: this is the one language everything starts in, before translation. To also submit listings in other languages, check them under Translation below; to sell into more countries, use Delivery Markets below."
              />
            </div>
            <Select name="google_content_language" defaultValue={store.google_content_language}>
              <SelectTrigger id="google_content_language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_LANGUAGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Must match the actual language of your product titles and descriptions — e.g. a
            German-language store should use <code>de</code>, not the default <code>en</code>, or
            Google may flag a language mismatch. Which countries you sell into is configured
            separately under Delivery Markets below.
          </p>
        </CardContent>
      </Card>
      )}

      {section === "delivery-markets" && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery Markets</CardTitle>
          <p className="text-sm text-muted-foreground">
            Every country you can actually deliver a product to. Each product gets submitted to
            Google once per market, in every language checked below under Translation — so a store
            with 2 markets and 3 languages sends 6 listings per product. Base your markets on where
            you physically deliver, not on which languages your customers happen to speak — a
            language doesn&apos;t need its own market, it just rides along inside markets you
            already serve.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {FEED_LABEL_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="google_feed_labels"
                  value={option.value}
                  defaultChecked={
                    (store.google_feed_labels?.length
                      ? store.google_feed_labels
                      : [store.google_feed_label]
                    ).includes(option.value)
                  }
                   onChange={(event) => handleMarketToggle(option.value, event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                {option.label}
              </label>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm">Currency and VAT per Market</Label>
              <FieldInfo
                title="Market Pricing"
                description={
                  "Choose the currency customers use in each delivery market. Product prices are converted automatically from their stored currency using the latest available ECB reference rate, then that market's VAT is added.\n\n" +
                  "Leave VAT blank to keep the converted price tax-exclusive. Exchange rates are refreshed automatically and should not be treated as a substitute for a fixed-price or hedging policy."
                }
              />
            </div>
            {selectedMarkets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Check at least one market above first.</p>
            ) : (
              <div className="space-y-3">
                {FEED_LABEL_OPTIONS.filter((option) => selectedMarkets.includes(option.value)).map((option) => (
                  <div
                    key={option.value}
                    className="grid gap-3 rounded-lg border bg-muted/15 p-4 sm:grid-cols-[minmax(150px,1fr)_minmax(180px,1fr)_140px] sm:items-end"
                  >
                    <div>
                      <p className="text-sm font-semibold">{option.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Automatic reference-rate conversion
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`market_currency_${option.value}`} className="text-xs">
                        Customer currency
                      </Label>
                      <Select
                        name={`market_currency_${option.value}`}
                        defaultValue={
                          store.market_currencies?.[option.value] ??
                          defaultCurrencyForMarket(option.value)
                        }
                      >
                        <SelectTrigger id={`market_currency_${option.value}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCY_OPTIONS.map((currency) => (
                            <SelectItem key={currency.value} value={currency.value}>
                              {currency.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`vat_rate_${option.value}`} className="text-xs">
                        VAT rate
                      </Label>
                      <div className="relative">
                        <Input
                          id={`vat_rate_${option.value}`}
                          name={`vat_rate_${option.value}`}
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          placeholder="e.g. 19"
                          defaultValue={store.vat_rates?.[option.value] ?? ""}
                          className="pr-8 text-sm"
                        />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-lg border border-dashed p-4">
              <div className="flex items-center gap-1.5">
                <Label className="text-sm">Storefront language routing</Label>
                <FieldInfo
                  title="Language and Market"
                  description="Link each enabled storefront language to the delivery market it represents. Several languages can point to the same market and will therefore keep the same currency. For example, Czech and English can both point to Czech Republic and both display CZK. If you serve several markets, leave ambiguous languages unlinked until you choose the intended market."
                />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {availableStorefrontLocales.map((locale) => {
                  const label =
                    CONTENT_LANGUAGE_OPTIONS.find((item) => item.value === locale)?.label ?? locale;
                  return (
                    <div key={locale} className="space-y-1.5">
                      <Label htmlFor={`locale_market_${locale}`} className="text-xs">
                        {label}
                      </Label>
                      <Select
                        name={`locale_market_${locale}`}
                        value={localeMarkets[locale] ?? "__unlinked"}
                        onValueChange={(market) =>
                          setLocaleMarkets((prev) => {
                            const next = { ...prev };
                            if (market === "__unlinked") delete next[locale];
                            else next[locale] = market;
                            return next;
                          })
                        }
                      >
                        <SelectTrigger id={`locale_market_${locale}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unlinked">Not active in Delivery Markets</SelectItem>
                          {FEED_LABEL_OPTIONS.filter((market) =>
                            selectedMarkets.includes(market.value)
                          ).map((market) => (
                            <SelectItem key={market.value} value={market.value}>
                              {market.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Calculation order: stored product price → market currency conversion → market VAT.
              Germany defaults to EUR; Poland defaults to PLN. You can override either currency.
              Currency switching activates only when the selected delivery markets contain more
              than one distinct customer currency. Extra languages linked to the same market keep
              that market&apos;s currency.
            </p>
          </div>
          <div className="mt-4 space-y-1.5 rounded-md border border-dashed border-border p-3">
            <Label htmlFor="paste_product_url" className="text-xs">
              Not sure? Paste a real product page URL instead
            </Label>
            <div className="flex gap-2">
              <Input
                id="paste_product_url"
                value={pasteUrl}
                onChange={(e) => setPasteUrl(e.target.value)}
                placeholder="e.g. https://diecontainers.com/produkt/10-fuss-container"
                className="text-sm"
              />
              <Button type="button" variant="outline" onClick={handleExtractWord} className="shrink-0">
                Extract
              </Button>
            </div>
            {pasteFeedback && (
              <p className={pasteFeedback.kind === "error" ? "text-xs text-destructive" : "text-xs text-emerald-700"}>
                {pasteFeedback.text}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Fills in the word below (and the language prefix setting, if detected) automatically — no need to read
              the URL apart by eye.
            </p>
          </div>
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="product_url_path">Product Page Word</Label>
              <FieldInfo
                title="Product Page Word"
                description={
                  'This is NOT a link — just one plain word, no slashes, no "https://". We already know your domain and each product\'s own name, so this is the one missing piece: the single word your own website puts between them.\n\n' +
                  'Example: if a real product page on your site is diecontainers.com/produkt/10-fus-container, the word is "produkt". We build every link we send Google the same way: domain + this word + product name — automatically.\n\n' +
                  'Make sure you\'re actually looking at a single product\'s page (not the shop list, home, or a category page). Copy the one word right after the domain — or, if there\'s a language code first (like /de/ or /nl/), the one word right after that. Example: domain.com/de/WORD/product-name → copy WORD. Easier: use "Paste a real product page URL" above and let it fill this in for you.'
                }
              />
            </div>
            <Input
              id="product_url_path"
              name="product_url_path"
              placeholder="e.g. produkt"
              defaultValue={store.product_url_path ?? "products"}
              ref={productUrlPathRef}
            />
            <p className="text-xs text-muted-foreground">
              Not a link — just the one word. See diecontainers.com/<strong>produkt</strong>/some-item
              → the word is <code>produkt</code>.
            </p>
          </div>

          {enabledLocales.filter((l) => l !== store.google_content_language).length > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label className="text-sm">Per-Language Word Exceptions</Label>
                <FieldInfo
                  title="Per-Language Word Exceptions"
                  description={
                    'Most sites use the same word for every language, just with a different language code in front — leave these blank for that (the common case).\n\n' +
                    'Some sites translate the word itself too, e.g. stfcontainer.com uses "containers" for English but "conteneurs" for French, "container" for German, and "contenedores" for Spanish, confirmed live. Fill in a language\'s box below only if its real product pages use a different word than the main "Product Page Word" above.\n\n' +
                    'Easiest way: paste a real product URL in that language into "Paste a real product page URL" above — if it detects a non-source language, it fills in that language\'s box here automatically instead of the main word.'
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                {enabledLocales
                  .filter((l) => l !== store.google_content_language)
                  .map((locale) => (
                    <div key={locale} className="flex items-center gap-2">
                      <Label htmlFor={`product_url_path_override_${locale}`} className="w-10 shrink-0 text-xs">
                        {locale}
                      </Label>
                      <Input
                        id={`product_url_path_override_${locale}`}
                        name={`product_url_path_override_${locale}`}
                        placeholder="same as above"
                        defaultValue={store.product_url_path_overrides?.[locale] ?? ""}
                        className="text-sm"
                        ref={(el) => {
                          wordOverrideRefs.current[locale] = el;
                        }}
                      />
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="mt-4 space-y-1.5">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="source_locale_has_prefix"
                defaultChecked={store.source_locale_has_prefix}
                className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                ref={sourceLocalePrefixRef}
              />
              <span>
                My site keeps a language code in the address even on its main/default language
                <FieldInfo
                  title="Source Language Prefix"
                  description={
                    'Most sites drop the language code for their main language — e.g. diecontainers.com/produkt/... has no /de/, even though German is the site\'s main language. Leave this UNCHECKED for that (the common case).\n\n' +
                    'Some sites keep it everywhere, even for the main language — e.g. stfcontainer.com/nl/containers/... keeps /nl/ even though Dutch is that site\'s main language. CHECK this box for that case.\n\n' +
                    'Test it yourself: open a real product page in your site\'s own main language and see if the address bar has a language code (like /nl/ or /de/) right after the domain, or not.'
                  }
                />
              </span>
            </label>
          </div>
        </CardContent>
      </Card>
      )}

      {section === "delivery-markets" && <TestLinksCard store={store} />}

      {section === "general" && (
      <Card id="email-notifications" className="scroll-mt-6">
        <CardHeader>
          <CardTitle className="text-base">Email Notifications</CardTitle>
          <p className="text-sm text-muted-foreground">
            Receive staff alerts for each storefront submission type while keeping inquiries,
            normal orders, and protected orders in their correct dashboard sections.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="notification_email">Notification Email</Label>
                <FieldInfo
                  title="Notification Email"
                  description="The staff inbox that receives new-submission alerts. Leave blank to turn off email alerts. Customer submissions still appear in the correct dashboard section even when email is disabled."
                />
              </div>
              <Input
                id="notification_email"
                name="notification_email"
                type="email"
                placeholder="e.g. orders@yourbusiness.com"
                defaultValue={store.notification_email ?? ""}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="notification_sender_name">Email Sender Name</Label>
                <FieldInfo
                  title="Email Sender Name"
                  description={
                    'The name customers and staff see as the sender on emails from your store (e.g. "Kariv Glamour" instead of a generic platform name). Leave blank to use your Store Name.'
                  }
                />
              </div>
              <Input
                id="notification_sender_name"
                name="notification_sender_name"
                placeholder={store.name || "e.g. Kariv Glamour"}
                defaultValue={store.notification_sender_name ?? ""}
              />
            </div>
          </div>

          <div>
            <div className="mb-3">
              <p className="text-sm font-semibold">Storefront submission routing</p>
              <p className="mt-1 text-xs text-muted-foreground">
                These routes are fixed. The checkboxes control staff email alerts only; they never
                move or hide customer submissions.
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              {[
                {
                  name: "notify_inquiries",
                  enabled: store.notify_inquiries,
                  icon: MessageSquareText,
                  source: "Inquiry / request a quote",
                  detail: "Product questions, price requests, and configurable quote forms.",
                  destination: "Inquiries",
                  href: "/dashboard/inquiries",
                },
                {
                  name: "notify_checkout_orders",
                  enabled: store.notify_checkout_orders,
                  icon: ShoppingCart,
                  source: "Buy Now / cart checkout",
                  detail: "Standard purchases after customer, delivery, and payment details.",
                  destination: "Orders",
                  href: "/dashboard/store-orders",
                },
                {
                  name: "notify_escrow_orders",
                  enabled: store.notify_escrow_orders,
                  icon: ShieldCheck,
                  source: "Buy with Protection",
                  detail: "Authenticated purchases using customer protection or escrow.",
                  destination: "Escrow Orders",
                  href: "/dashboard/orders",
                },
              ].map(({ name, enabled, icon: Icon, source, detail, destination, href }) => (
                <div key={name} className="flex flex-col rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">{source}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
                    <Link href={href} className="text-xs font-medium text-primary hover:underline">
                      → {destination}
                    </Link>
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <input
                        type="checkbox"
                        name={name}
                        defaultChecked={enabled}
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      Email me
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {section === "google-merchant-center" && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Translation</CardTitle>
          <p className="text-sm text-muted-foreground">
            When you save a product or category, it&apos;s automatically translated (via AI) into
            every language checked below, in addition to your Content Language above.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {CONTENT_LANGUAGE_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="enabled_locales"
                  value={option.value}
                  defaultChecked={store.enabled_locales?.includes(option.value)}
                  onChange={(e) => {
                    setEnabledLocales((prev) =>
                      e.target.checked
                        ? [...prev, option.value]
                        : prev.filter((l) => l !== option.value)
                    );
                  }}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                {option.label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
      )}

      {section === "google-merchant-center" && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Push to Google</CardTitle>
          <p className="text-sm text-muted-foreground">
            Which translated languages actually go live on Google — via the Sync button and the
            live API push — right now. This is separate from Translation above: uncheck a
            language here to keep translating it for your storefront without submitting it to
            Google yet. Your Content Language ({store.google_content_language}) is always
            submitted regardless of what&apos;s checked below. Leave everything below unchecked
            to submit only your Content Language listing — nothing else goes to Google until you
            check it here.
          </p>
        </CardHeader>
        <CardContent>
          {enabledLocales.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Check at least one language above under Translation first.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {CONTENT_LANGUAGE_OPTIONS.filter((option) => enabledLocales.includes(option.value)).map(
                (option) => (
                  <label key={option.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="google_push_locales"
                      value={option.value}
                      defaultChecked={store.google_push_locales.includes(option.value)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    {option.label}
                  </label>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending
          ? "Saving..."
          : section === "google-merchant-center"
            ? "Save Google Merchant Settings"
            : section === "delivery-markets"
              ? "Save Delivery Markets"
              : "Save Settings"}
      </Button>
    </form>
  );
}

function FeedUrlCard({ store }: { store: Store }) {
  const [origin, setOrigin] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const markets = store.google_feed_labels?.length ? store.google_feed_labels : [store.google_feed_label];
  const locales = Array.from(new Set([store.google_content_language, ...(store.enabled_locales ?? [])]));

  const rows = markets.flatMap((market) =>
    locales.map((locale) => ({
      key: `${market}-${locale}`,
      market,
      locale,
      url: origin
        ? `${origin}/api/feeds/${store.id}/google.xml?market=${market}&locale=${locale}`
        : "",
    }))
  );

  function copy(key: string, url: string) {
    navigator.clipboard.writeText(url);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  return (
    <Card id="xml-feed-urls" className="scroll-mt-6">
      <CardHeader>
        <CardTitle className="text-base">XML Feed URLs</CardTitle>
        <p className="text-sm text-muted-foreground">
          Alternative to the API sync — matches it exactly, including translated text and correct
          links per language. One URL per market/language combination below; add each one as its
          own separate data source in Google Merchant Center → Settings → Data sources → Add
          product source → Scheduled fetch. No GCP registration required for this method.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              {row.market} / {row.locale}
              {row.locale === store.google_content_language ? " (source)" : ""}
            </p>
            <div className="flex gap-2">
              <Input readOnly value={row.url} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                onClick={() => copy(row.key, row.url)}
                className="shrink-0"
              >
                {copiedKey === row.key ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const STATUS_STYLE: Record<LinkCheckResult["status"], string> = {
  ok: "bg-emerald-100 text-emerald-700",
  not_found: "bg-red-100 text-red-700",
  error: "bg-amber-100 text-amber-700",
};

function statusLabel(r: LinkCheckResult) {
  if (r.status === "ok") return `✅ ${r.httpStatus}`;
  if (r.status === "not_found") return `❌ ${r.httpStatus ?? "Not found"}`;
  return "⚠️ Error";
}

function TestLinksCard({ store }: { store: Store }) {
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<LinkCheckResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleTest() {
    setError(null);
    startTransition(async () => {
      const result = await testProductLinks();
      if (result.success) {
        setResults(result.data);
      } else {
        setResults(null);
        setError(result.error);
      }
    });
  }

  return (
    <Card className="border-emerald-200 bg-emerald-50/60">
      <CardHeader>
        <CardTitle className="text-base text-emerald-900">Test My Links</CardTitle>
        <p className="text-sm text-emerald-800/80">
          Live-checks the exact link every configured market/language combination would send to
          Google, against one of your real products — catches a broken Product Page Word or
          Language Prefix setting the moment you change it, instead of finding out from a 404
          later. Click a result to open it and see for yourself.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleTest}
          disabled={isPending || !store.domain}
          className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
        >
          {isPending ? "Testing..." : "Test My Links"}
        </Button>
        {!store.domain && (
          <p className="text-xs text-emerald-800/70">Add your store&apos;s domain above first.</p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {results && (
          <div className="space-y-2">
            {results.map((r) => (
              <a
                key={`${r.market}-${r.locale}`}
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-white px-3 py-2 hover:border-emerald-400"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {r.market} / {r.locale}
                    {r.locale === store.google_content_language ? " (source)" : ""}
                  </p>
                  <p className="truncate text-xs text-primary underline">{r.url}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}
                >
                  {statusLabel(r)}
                </span>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
