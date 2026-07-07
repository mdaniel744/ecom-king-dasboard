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
            <Label htmlFor="name">Store Name</Label>
            <Input id="name" name="name" required defaultValue={store.name} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="domain">Storefront Domain</Label>
            <Input
              id="domain"
              name="domain"
              placeholder="e.g. mystore.com"
              defaultValue={store.domain ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Used to build each product&apos;s public page link for Google Merchant sync.
            </p>
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
            <Label htmlFor="google_merchant_id">Merchant Center ID</Label>
            <Input
              id="google_merchant_id"
              name="google_merchant_id"
              placeholder="e.g. 123456789"
              defaultValue={store.google_merchant_id ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="google_merchant_datasource_id">API Data Source ID</Label>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="google_content_language">Content Language</Label>
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
            <div className="space-y-1.5">
              <Label htmlFor="google_feed_label">Feed Label (market)</Label>
              <Select name="google_feed_label" defaultValue={store.google_feed_label}>
                <SelectTrigger id="google_feed_label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEED_LABEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Must match the actual language/market of your product titles and descriptions — e.g. a
            German-language store should use <code>de</code> / <code>DE</code>, not the default{" "}
            <code>en</code> / <code>US</code>, or Google may flag a language mismatch.
          </p>
        </CardContent>
      </Card>

      <FeedUrlCard storeId={store.id} />

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

function FeedUrlCard({ storeId }: { storeId: string }) {
  const [feedUrl, setFeedUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setFeedUrl(`${window.location.origin}/api/feeds/${storeId}/google.xml`);
  }, [storeId]);

  function copy() {
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">XML Feed URL</CardTitle>
        <p className="text-sm text-muted-foreground">
          Alternative to the API sync. Paste this URL into Google Merchant Center → Settings → Data
          sources → Add product source → Scheduled fetch. Google will pull your active products
          automatically on a schedule — no GCP registration required.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Input readOnly value={feedUrl} className="font-mono text-xs" />
          <Button type="button" variant="outline" onClick={copy} className="shrink-0">
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
