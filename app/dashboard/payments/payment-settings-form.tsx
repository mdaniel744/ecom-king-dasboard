"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Bitcoin, Building2, CreditCard, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { updatePaymentSettings } from "@/app/dashboard/payments/actions";
import { ActionErrorBanner } from "@/components/dashboard/action-error-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { defaultPaymentSettings } from "@/lib/payment-settings-defaults";
import type { CardPaymentProvider, PaymentSettings } from "@/lib/types";

function text(value: string | null) {
  return value ?? "";
}

export function PaymentSettingsForm({ initialSettings }: { initialSettings: PaymentSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const update = <Key extends keyof PaymentSettings>(key: Key, value: PaymentSettings[Key]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const reset = () => {
    setSettings(defaultPaymentSettings(initialSettings.store_id));
    setError(null);
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await updatePaymentSettings({
        bankTransferEnabled: settings.bank_transfer_enabled,
        bankName: text(settings.bank_name),
        bankAccountName: text(settings.bank_account_name),
        bankAccountNumber: text(settings.bank_account_number),
        bankCountry: text(settings.bank_country),
        bankCurrency: settings.bank_currency,
        bankIban: text(settings.bank_iban),
        bankSwiftBic: text(settings.bank_swift_bic),
        bankInstructions: text(settings.bank_instructions),
        cardEnabled: settings.card_enabled,
        cardProvider: settings.card_provider ?? "",
        cardCheckoutLabel: text(settings.card_checkout_label),
        cryptoEnabled: settings.crypto_enabled,
        cryptoAssets: settings.crypto_assets,
        cryptoWalletDetails: text(settings.crypto_wallet_details),
      });

      if (result.success) {
        toast.success("Payment settings saved");
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  };

  return (
    <div id="payment-methods" className="space-y-6 scroll-mt-6">
      <ActionErrorBanner message={error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <MethodCard
          title="Bank transfer"
          description="Show account details for manual transfers."
          icon={Building2}
          enabled={settings.bank_transfer_enabled}
          configured={Boolean(settings.bank_name && settings.bank_account_name && settings.bank_account_number)}
          onChange={(enabled) => update("bank_transfer_enabled", enabled)}
        />
        <MethodCard
          title="Credit or debit card"
          description="Prepare checkout for a connected card provider."
          icon={CreditCard}
          enabled={settings.card_enabled}
          configured={Boolean(settings.card_provider)}
          onChange={(enabled) => update("card_enabled", enabled)}
        />
        <MethodCard
          title="Cryptocurrency"
          description="Publish accepted assets and payment destinations."
          icon={Bitcoin}
          enabled={settings.crypto_enabled}
          configured={settings.crypto_assets.length > 0 && Boolean(settings.crypto_wallet_details)}
          onChange={(enabled) => update("crypto_enabled", enabled)}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Bank account information</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Details customers see after choosing direct bank transfer at checkout.
              </p>
            </div>
            <Badge variant={settings.bank_transfer_enabled ? "default" : "secondary"}>
              {settings.bank_transfer_enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="payment-bank-name">Bank name</Label>
            <Input
              id="payment-bank-name"
              value={text(settings.bank_name)}
              onChange={(event) => update("bank_name", event.target.value || null)}
              placeholder="e.g. Zenith Bank"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-account-name">Account name</Label>
            <Input
              id="payment-account-name"
              value={text(settings.bank_account_name)}
              onChange={(event) => update("bank_account_name", event.target.value || null)}
              placeholder="Registered business name"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-account-number">Account number</Label>
            <Input
              id="payment-account-number"
              value={text(settings.bank_account_number)}
              onChange={(event) => update("bank_account_number", event.target.value || null)}
              placeholder="Account number"
              maxLength={100}
            />
          </div>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <div className="space-y-2">
              <Label htmlFor="payment-bank-country">Bank country</Label>
              <Input
                id="payment-bank-country"
                value={text(settings.bank_country)}
                onChange={(event) => update("bank_country", event.target.value || null)}
                placeholder="Nigeria"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-bank-currency">Currency</Label>
              <Input
                id="payment-bank-currency"
                value={settings.bank_currency}
                onChange={(event) => update("bank_currency", event.target.value.toUpperCase())}
                maxLength={3}
                className="font-mono uppercase"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-iban">IBAN</Label>
            <Input
              id="payment-iban"
              value={text(settings.bank_iban)}
              onChange={(event) => update("bank_iban", event.target.value || null)}
              placeholder="Optional for international transfers"
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-swift">SWIFT / BIC</Label>
            <Input
              id="payment-swift"
              value={text(settings.bank_swift_bic)}
              onChange={(event) => update("bank_swift_bic", event.target.value || null)}
              placeholder="Optional"
              maxLength={50}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="payment-bank-instructions">Customer instructions</Label>
            <Textarea
              id="payment-bank-instructions"
              value={text(settings.bank_instructions)}
              onChange={(event) => update("bank_instructions", event.target.value || null)}
              rows={4}
              maxLength={3000}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Card payments</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Select the provider that will handle secure card checkout for this store.
              </p>
            </div>
            <Badge variant={settings.card_enabled ? "default" : "secondary"}>
              {settings.card_enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Card provider</Label>
            <Select
              value={settings.card_provider ?? "none"}
              onValueChange={(value) => update("card_provider", value === "none" ? null : value as CardPaymentProvider)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not connected</SelectItem>
                <SelectItem value="paystack">Paystack</SelectItem>
                <SelectItem value="flutterwave">Flutterwave</SelectItem>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="other">Other provider</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-card-label">Checkout label</Label>
            <Input
              id="payment-card-label"
              value={text(settings.card_checkout_label)}
              onChange={(event) => update("card_checkout_label", event.target.value || null)}
              placeholder="Pay securely by card"
              maxLength={120}
            />
          </div>
          <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 sm:col-span-2">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              This page stores display preferences only. Provider secret keys must be connected through a secure server environment before card checkout is made available on the storefront.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Cryptocurrency</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Configure accepted assets and public receiving information when crypto is applicable.
              </p>
            </div>
            <Badge variant={settings.crypto_enabled ? "default" : "secondary"}>
              {settings.crypto_enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="payment-crypto-assets">Accepted assets</Label>
            <Input
              id="payment-crypto-assets"
              value={settings.crypto_assets.join(", ")}
              onChange={(event) => update(
                "crypto_assets",
                event.target.value.split(",").map((asset) => asset.trim().toUpperCase()).filter(Boolean)
              )}
              placeholder="USDT, USDC, BTC"
            />
            <p className="text-xs text-muted-foreground">Separate each asset with a comma.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-crypto-wallets">Public wallet and network details</Label>
            <Textarea
              id="payment-crypto-wallets"
              value={text(settings.crypto_wallet_details)}
              onChange={(event) => update("crypto_wallet_details", event.target.value || null)}
              rows={5}
              placeholder={"USDT (TRC20): public-address\nBTC: public-address"}
              maxLength={3000}
            />
            <p className="text-xs text-muted-foreground">Never enter wallet seed phrases or private keys.</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="outline" onClick={reset} disabled={isPending}>
          <RotateCcw className="mr-2 h-4 w-4" /> Reset
        </Button>
        <Button type="button" onClick={save} disabled={isPending}>
          <Save className="mr-2 h-4 w-4" /> {isPending ? "Saving..." : "Save payment settings"}
        </Button>
      </div>
    </div>
  );
}

function MethodCard({
  title,
  description,
  icon: Icon,
  enabled,
  configured,
  onChange,
}: {
  title: string;
  description: string;
  icon: typeof Building2;
  enabled: boolean;
  configured: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <Card className={enabled ? "border-primary/40" : undefined}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></span>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              aria-label={`Enable ${title}`}
              checked={enabled}
              onChange={(event) => onChange(event.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span aria-hidden="true">{enabled ? "Enabled" : "Disabled"}</span>
          </label>
        </div>
        <p className="mt-4 font-semibold">{title}</p>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
        <p className={`mt-3 text-xs font-medium ${configured ? "text-emerald-700" : "text-amber-700"}`}>
          {configured ? "Configuration ready" : "Setup required"}
        </p>
      </CardContent>
    </Card>
  );
}
