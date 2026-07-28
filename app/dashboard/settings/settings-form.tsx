"use client";

import { useState, useTransition, useEffect } from "react";
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
import { CONTENT_LANGUAGE_OPTIONS, FEED_LABEL_OPTIONS } from "@/lib/merchant-locales";
import { FieldInfo } from "@/components/ui/field-info";
import type { Store } from "@/lib/types";

export function SettingsForm({ store }: { store: Store }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateStoreSettings(formData);
      if (result.success) {
        toast.success("Settings saved");
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="mt-6 max-w-xl space-y-6">
      <ActionErrorBanner message={error} />

      <Card>
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
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                {option.label}
              </label>
            ))}
          </div>
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="product_url_path">Product Page Word</Label>
              <FieldInfo
                title="Product Page Word"
                description={
                  'This is NOT a link — just one plain word, no slashes, no "https://". We already know your domain and each product\'s own name, so this is the one missing piece: the single word your own website puts between them.\n\n' +
                  'Example: if a real product page on your site is diecontainers.com/produkt/10-fus-container, the word is "produkt". We build every link we send Google the same way: domain + this word + product name — automatically.\n\n' +
                  'Make sure you\'re actually looking at a single product\'s page (not the shop list, home, or a category page). Copy the one word right after the domain — or, if there\'s a language code first (like /de/ or /nl/), the one word right after that. Example: domain.com/de/WORD/product-name → copy WORD. If you\'re not sure, ask whoever built your storefront.'
                }
              />
            </div>
            <Input
              id="product_url_path"
              name="product_url_path"
              placeholder="e.g. produkt"
              defaultValue={store.product_url_path ?? "products"}
            />
            <p className="text-xs text-muted-foreground">
              Not a link — just the one word. See diecontainers.com/<strong>produkt</strong>/some-item
              → the word is <code>produkt</code>.
            </p>
          </div>
          <div className="mt-4 space-y-1.5">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="source_locale_has_prefix"
                defaultChecked={store.source_locale_has_prefix}
                className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inquiry Notifications</CardTitle>
          <p className="text-sm text-muted-foreground">
            When a customer submits an inquiry on your storefront, we&apos;ll email it here
            automatically.
          </p>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="notification_email">Notification Email</Label>
            <FieldInfo
              title="Notification Email"
              description="The email address that receives a message every time a customer submits an inquiry through your storefront. Leave blank to turn off email notifications — inquiries will still appear in the Inquiries page either way."
            />
          </div>
          <Input
            id="notification_email"
            name="notification_email"
            type="email"
            placeholder="e.g. you@yourbusiness.com"
            defaultValue={store.notification_email ?? ""}
          />
        </CardContent>
      </Card>

      <FeedUrlCard store={store} />

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
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                {option.label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save"}
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
    <Card>
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
