"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/dashboard/field-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MERCHANT_GENDER_OPTIONS, MERCHANT_AGE_GROUP_OPTIONS, readMerchantApparel, type MerchantApparelField } from "@/lib/merchant-apparel";

type Props = {
  attributes: [string, string][];
  onChange: (field: MerchantApparelField, value: string) => void;
  errors: Record<string, string>;
};

export function MerchantApparelFields({ attributes, onChange, errors }: Props) {
  const values = readMerchantApparel(attributes);
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div>
        <h3 className="text-sm font-semibold">Apparel details</h3>
        <p className="mt-1 text-xs text-muted-foreground">Fill in the details that apply to this product. Included in Google sync and XML feeds.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="google_color">Color</Label>
        <Input id="google_color" name="google_color" value={values.color} maxLength={100}
          onChange={(event) => onChange("color", event.target.value)} placeholder="Enter product color" aria-describedby="google-color-help" />
        <p id="google-color-help" className="text-xs text-muted-foreground">Use the color names shown on the product page. Separate multiple colors with / (up to three).</p>
        <FieldError name="google_color" errors={errors} />
      </div>
      {([
        { field: "gender", label: "Gender", options: MERCHANT_GENDER_OPTIONS },
        { field: "age_group", label: "Age group", options: MERCHANT_AGE_GROUP_OPTIONS },
      ] as const).map(({ field, label, options }) => (
        <div key={field} className="space-y-1.5">
          <Label htmlFor={`google_${field}`}>{label}</Label>
          <Select name={`google_${field}`} value={values[field] || "none"} onValueChange={(value) => onChange(field, value === "none" ? "" : value)}>
            <SelectTrigger id={`google_${field}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not specified</SelectItem>
              {values[field] && !options.some((option) => option.value === values[field]) && (
                <SelectItem value={values[field]}>Choose a valid value ({values[field]})</SelectItem>
              )}
              {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldError name={`google_${field}`} errors={errors} />
        </div>
      ))}
      <div className="space-y-1.5">
        <Label htmlFor="google_material">Material</Label>
        <Input id="google_material" name="google_material" value={values.material} maxLength={200}
          onChange={(event) => onChange("material", event.target.value)} placeholder="Cotton or Cotton/Polyester" />
        <FieldError name="google_material" errors={errors} />
      </div>
    </div>
  );
}
