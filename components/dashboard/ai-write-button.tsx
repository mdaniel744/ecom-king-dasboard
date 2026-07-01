"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONTENT_LANGUAGE_OPTIONS } from "@/lib/merchant-locales";
import { aiWriteField } from "@/lib/ai-write";

type Props = {
  /** Returns the current text value from the paired field */
  getValue: () => string;
  /** Called with the AI result — updates the paired field */
  onResult: (text: string) => void;
  /** Which field this is ("name", "description", etc.) — drives SEO instructions */
  fieldRole: string;
  /** The store's own language — defaults to this in the dropdown */
  defaultLocale?: string;
};

/**
 * A compact [language dropdown] [✨ AI Write] button pair that sits inline
 * with a field label. The user types in any language, picks a target locale,
 * clicks the button — DeepSeek translates AND SEO-optimises the text and
 * fills the field. The result is always editable before saving.
 */
export function AIWriteButton({ getValue, onResult, fieldRole, defaultLocale = "en" }: Props) {
  const [locale, setLocale] = useState(defaultLocale);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const text = getValue().trim();
    if (!text) {
      toast.error("Type some text in the field first, then click AI Write.");
      return;
    }

    startTransition(async () => {
      // Source is always English when the user is typing in English
      // (we assume the UI writer's language is "en" — they can change
      // the target locale to whatever the store needs).
      const result = await aiWriteField(text, locale, "en", fieldRole);

      if (result.success) {
        onResult(result.data.text);
        const label = CONTENT_LANGUAGE_OPTIONS.find((o) => o.value === locale)?.label ?? locale;
        toast.success(`AI wrote your ${fieldRole.replace(/_/g, " ")} in ${label}`);
      } else {
        toast.error(result.error ?? "AI Write failed — try again.");
      }
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Select value={locale} onValueChange={setLocale}>
        <SelectTrigger className="h-7 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CONTENT_LANGUAGE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/5"
        disabled={isPending}
        onClick={handleClick}
      >
        <Wand2 className={`h-3 w-3 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Writing…" : "AI Write"}
      </Button>
    </div>
  );
}
