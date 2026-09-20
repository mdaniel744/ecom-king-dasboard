export type TranslationSourceValues = Record<string, string | null | undefined>;

/** The editor must distinguish an empty saved source from a new unsaved draft. */
export function translationSourceState(
  field: string,
  current: TranslationSourceValues,
  saved?: TranslationSourceValues
): "empty" | "unsaved" | "saved" {
  const value = (current[field] ?? "").trim();
  if (saved && value !== (saved[field] ?? "").trim()) return "unsaved";
  return value ? "saved" : "empty";
}
