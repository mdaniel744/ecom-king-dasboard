import type { Inquiry } from "@/lib/types";

export function inquiryRef(inquiry: Pick<Inquiry, "id" | "inquiry_number" | "created_at">) {
  if (inquiry.inquiry_number) return inquiry.inquiry_number;

  const date = new Date(inquiry.created_at);
  const datePart = Number.isNaN(date.getTime())
    ? "UNKNOWN"
    : date.toISOString().slice(0, 10).replaceAll("-", "");
  return `ENQ-${datePart}-${inquiry.id.replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readableValue(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(readableValue).filter(Boolean).join(", ");
  return JSON.stringify(value);
}

export function humanizeKey(key: string) {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
