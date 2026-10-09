export const MERCHANT_GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "unisex", label: "Unisex" },
] as const;

export const MERCHANT_AGE_GROUP_OPTIONS = [
  { value: "newborn", label: "Newborn (0–3 months)" },
  { value: "infant", label: "Infant (3–12 months)" },
  { value: "toddler", label: "Toddler (1–5 years)" },
  { value: "kids", label: "Kids (5–13 years)" },
  { value: "adult", label: "Adult (13+ years)" },
] as const;

export type MerchantApparelField = "color" | "gender" | "age_group" | "material";
export type MerchantApparelValues = Record<MerchantApparelField, string>;
type AttributeEntries = [string, string][];
type AttributeSource = Record<string, string> | AttributeEntries | null | undefined;

const ATTRIBUTE_NAMES: Record<MerchantApparelField, string> = {
  color: "Color", gender: "Gender", age_group: "Age group", material: "Material",
};

function fieldForAttribute(name: string): MerchantApparelField | undefined {
  switch (name.trim().toLowerCase().replace(/[\s_-]+/g, "")) {
    case "color": case "colour": return "color";
    case "gender": return "gender";
    case "agegroup": return "age_group";
    case "material": return "material";
  }
}

/** Share the same saved attributes with the product form, presets and backups. */
export function readMerchantApparel(source: AttributeSource): MerchantApparelValues {
  const values: MerchantApparelValues = { color: "", gender: "", age_group: "", material: "" };
  for (const [key, value] of Array.isArray(source) ? source : Object.entries(source ?? {})) {
    const field = fieldForAttribute(key);
    if (field && !values[field] && typeof value === "string") values[field] = value;
  }
  values.gender = values.gender.trim().toLowerCase();
  values.age_group = values.age_group.trim().toLowerCase();
  return values;
}

/** Replace aliases together so editing Colour cannot leave a stale Color behind. */
export function updateMerchantApparel(
  entries: AttributeEntries, field: MerchantApparelField, value: string
): AttributeEntries {
  const first = entries.findIndex(([key]) => fieldForAttribute(key) === field);
  const remaining = entries.filter(([key]) => fieldForAttribute(key) !== field);
  if (value) remaining.splice(first < 0 ? remaining.length : first, 0, [ATTRIBUTE_NAMES[field], value]);
  return remaining;
}

function normalizedApparel(source: AttributeSource): MerchantApparelValues {
  const values = readMerchantApparel(source);
  return { ...values, color: values.color.split("/").map((color) => color.trim()).join("/"), material: values.material.trim() };
}

export function merchantApparelIssues(source: AttributeSource): { field: MerchantApparelField; message: string }[] {
  const values = normalizedApparel(source);
  const issues: { field: MerchantApparelField; message: string }[] = [];
  if (values.color) {
    const colors = values.color.split("/");
    if (values.color.length > 100 || colors.some((color) => color.length > 40)) {
      issues.push({ field: "color", message: "Color allows 100 characters total and 40 characters per color." });
    } else if (colors.length > 3 || colors.some((color) => !color) || values.color.includes(",")) {
      issues.push({ field: "color", message: "Enter a primary color and up to two secondary colors separated by /, for example Red/Green/Black." });
    } else if (colors.some((color) => !/\p{L}/u.test(color) || color.includes("#") || /[\u0000-\u001f<>]/.test(color))) {
      issues.push({ field: "color", message: "Use color names, such as Red or Navy Blue, rather than numbers, HTML or hex codes." });
    }
  }
  if (values.gender && !MERCHANT_GENDER_OPTIONS.some((option) => option.value === values.gender)) {
    issues.push({ field: "gender", message: "Choose Male, Female or Unisex." });
  }
  if (values.age_group && !MERCHANT_AGE_GROUP_OPTIONS.some((option) => option.value === values.age_group)) {
    issues.push({ field: "age_group", message: "Choose Newborn, Infant, Toddler, Kids or Adult." });
  }
  if (values.material.length > 200) {
    issues.push({ field: "material", message: "Material allows up to 200 characters." });
  }
  return issues;
}

function validatedApparel(source: AttributeSource): MerchantApparelValues {
  const issues = merchantApparelIssues(source);
  if (issues.length) throw new Error(`Google apparel details: ${issues.map((issue) => issue.message).join(" ")}`);
  return normalizedApparel(source);
}

/** Merchant API v1 uses uppercase enums; XML uses the lowercase feed values. */
export function merchantApparelApiAttributes(source: AttributeSource) {
  const values = validatedApparel(source);
  return {
    ...(values.color ? { color: values.color } : {}),
    ...(values.gender ? { gender: values.gender.toUpperCase() } : {}),
    ...(values.age_group ? { ageGroup: values.age_group.toUpperCase() } : {}),
    ...(values.material ? { material: values.material } : {}),
  };
}

export function merchantApparelXml(source: AttributeSource): string {
  const values = validatedApparel(source);
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return Object.entries(values).filter(([, value]) => value)
    .map(([field, value]) => `<g:${field}>${escape(value)}</g:${field}>`).join("\n    ");
}
