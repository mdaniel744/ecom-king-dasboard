import { auth } from "@clerk/nextjs/server";
import { getCurrentStore } from "@/lib/get-current-store";
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
import { updateStoreSettings } from "@/app/dashboard/settings/actions";
import { getTeamMembers } from "@/app/dashboard/settings/team-actions";
import { TeamSection } from "@/app/dashboard/settings/team-section";
import { CONTENT_LANGUAGE_OPTIONS, FEED_LABEL_OPTIONS } from "@/lib/merchant-locales";

export default async function SettingsPage() {
  const { userId } = await auth();
  const store = await getCurrentStore();
  const members = await getTeamMembers();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Store profile and integrations
      </p>

      <form action={updateStoreSettings} className="mt-6 max-w-xl space-y-6">
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
                Used to build each product&apos;s public page link for Google
                Merchant sync.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Google Merchant Center</CardTitle>
            <p className="text-sm text-muted-foreground">
              Each store connects to its own Merchant Center account — these
              values are specific to your business, not shared across other
              stores on this platform.
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
              <Label htmlFor="google_merchant_datasource_id">
                API Data Source ID
              </Label>
              <Input
                id="google_merchant_datasource_id"
                name="google_merchant_datasource_id"
                placeholder="e.g. 104628"
                defaultValue={store.google_merchant_datasource_id ?? ""}
              />
              <p className="text-xs text-muted-foreground">
                From Merchant Center: Settings → Data sources → Primary
                sources → Add product source → API.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="google_content_language">Content Language</Label>
                <Select
                  name="google_content_language"
                  defaultValue={store.google_content_language}
                >
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
              Must match the actual language/market of your product titles
              and descriptions — e.g. a German-language store should use{" "}
              <code>de</code> / <code>DE</code>, not the default{" "}
              <code>en</code> / <code>US</code>, or Google may flag a
              language mismatch.
            </p>
          </CardContent>
        </Card>

        <Button type="submit">Save</Button>
      </form>

      <div className="mt-6 max-w-xl">
        <TeamSection members={members} isCurrentUserOwner={userId === store.owner_user_id} />
      </div>
    </div>
  );
}
