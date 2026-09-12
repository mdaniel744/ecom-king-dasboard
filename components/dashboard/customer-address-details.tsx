import { MapPin } from "lucide-react";
import { humanizeKey, readableValue } from "@/lib/inquiry-display";
import type { CustomerAddress } from "@/lib/types";

const knownKeys = new Set([
  "title",
  "first_name",
  "last_name",
  "full_name",
  "company",
  "email",
  "phone",
  "vat_number",
  "tax_id",
  "address_line_1",
  "address_line_2",
  "city",
  "state",
  "county",
  "postal_code",
  "country",
  "country_code",
  "delivery_instructions",
]);

export function CustomerAddressDetails({
  title,
  address,
}: {
  title: string;
  address: CustomerAddress | null | undefined;
}) {
  const fullName =
    address?.full_name || [address?.first_name, address?.last_name].filter(Boolean).join(" ");
  const fields = [
    ["Full name", fullName],
    ["Company", address?.company],
    ["Email", address?.email],
    ["Phone", address?.phone],
    ["VAT number", address?.vat_number],
    ["Tax ID", address?.tax_id],
    ["Address line 1", address?.address_line_1],
    ["Address line 2", address?.address_line_2],
    ["City", address?.city],
    ["State / region", address?.state || address?.county],
    ["Postal code", address?.postal_code],
    ["Country", address?.country || address?.country_code],
    ["Delivery instructions", address?.delivery_instructions],
  ] as const;
  const extraFields = Object.entries(address ?? {}).filter(
    ([key, value]) => !knownKeys.has(key) && readableValue(value)
  );

  return (
    <div className="rounded-md border border-border p-4">
      <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <MapPin className="h-3 w-3" /> {title}
      </p>
      <dl className="mt-3 space-y-2 text-sm">
        {fields.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words">{readableValue(value) || "—"}</dd>
          </div>
        ))}
        {extraFields.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
            <dt className="text-muted-foreground">{humanizeKey(key)}</dt>
            <dd className="break-words">{readableValue(value) || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
