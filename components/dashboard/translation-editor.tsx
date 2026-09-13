"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Pencil, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CONTENT_LANGUAGE_OPTIONS } from "@/lib/merchant-locales";
import {
  getEntityTranslations,
  saveManualTranslation,
  resetTranslationToAI,
} from "@/app/dashboard/translations/actions";
import { retryProductTranslations } from "@/app/dashboard/products/actions";

type EntityType = "product" | "category" | "attribute_name" | "attribute_value" | "brand" | "collection" | "guide" | "faq" | "legal_page" | "website_string";

type FieldDef = {
  name: string;
  label: string;
  multiline?: boolean;
};

type Props = {
  entityType: EntityType;
  entityId?: string;
  enabledLocales: string[];
  fields: FieldDef[];
};

type TranslationsByLocale = Record<
  string,
  Record<string, { value: string; translator: "ai" | "human"; needsReview: boolean }>
>;

function localeLabel(code: string): string {
  return CONTENT_LANGUAGE_OPTIONS.find((o) => o.value === code)?.label ?? code;
}

export function TranslationEditor({ entityType, entityId, enabledLocales, fields }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TranslationsByLocale>({});
  const [activeLocale, setActiveLocale] = useState(enabledLocales[0] ?? "");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingField, setSavingField] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!entityId || enabledLocales.length === 0) {
      setLoading(false);
      return;
    }
    getEntityTranslations(entityType, entityId).then((result) => {
      setData(result);
      setLoading(false);
    });
  }, [entityType, entityId, enabledLocales.length]);

  if (enabledLocales.length === 0) return null;

  if (!entityId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Translations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Save this first — translations into {enabledLocales.map(localeLabel).join(", ")} are
            generated automatically once it exists, and you can review or correct them here
            afterward.
          </p>
        </CardContent>
      </Card>
    );
  }

  function draftKey(locale: string, field: string) {
    return `${locale}:${field}`;
  }

  function getValue(locale: string, field: string): string {
    const key = draftKey(locale, field);
    if (key in drafts) return drafts[key];
    return data[locale]?.[field]?.value ?? "";
  }

  function isHuman(locale: string, field: string): boolean {
    return data[locale]?.[field]?.translator === "human";
  }

  function hasTranslation(locale: string, field: string): boolean {
    return Boolean(data[locale]?.[field]);
  }

  async function handleSave(locale: string, field: string) {
    const value = getValue(locale, field).trim();
    if (!value) {
      toast.error("Can't save an empty translation — use Reset instead to hand it back to AI.");
      return;
    }
    const key = draftKey(locale, field);
    setSavingField(key);
    const result = await saveManualTranslation({
      entityType,
      entityId: entityId!,
      fieldName: field,
      locale,
      value,
    });
    setSavingField(null);
    if (result.success) {
      setData((prev) => ({
        ...prev,
        [locale]: {
          ...prev[locale],
          [field]: { value, translator: "human", needsReview: false },
        },
      }));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      toast.success("Translation saved — AI won't overwrite this anymore.");
    } else {
      toast.error(result.error);
    }
  }

  async function handleReset(locale: string, field: string) {
    const key = draftKey(locale, field);
    setSavingField(key);
    const result = await resetTranslationToAI({ entityType, entityId: entityId!, fieldName: field, locale });
    setSavingField(null);
    if (result.success) {
      setData((prev) => {
        const next = { ...prev, [locale]: { ...prev[locale] } };
        delete next[locale][field];
        return next;
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      toast.success("Reset — AI will re-translate this the next time you save.");
    } else {
      toast.error(result.error);
    }
  }

  async function handleRetry() {
    if (!entityId || entityType !== "product") return;
    setRetrying(true);
    const result = await retryProductTranslations(entityId);
    setRetrying(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    const refreshed = await getEntityTranslations(entityType, entityId);
    setData(refreshed);
    if (result.data.failed > 0) {
      toast.error(`${result.data.failed} translation field(s) still failed. Check the translation service and retry.`);
    } else if (result.data.succeeded > 0) {
      toast.success(`${result.data.succeeded} translation field(s) completed.`);
    } else {
      toast.success("Translations are already complete or protected by human edits.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Translations</CardTitle>
          {entityType === "product" && (
            <Button type="button" variant="outline" size="sm" onClick={handleRetry} disabled={retrying}>
              {retrying ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
              {retrying ? "Retrying…" : "Retry missing"}
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Auto-translated on save. Fix anything wrong here — once you save a correction, AI won&apos;t
          touch that field/language again.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {enabledLocales.map((locale) => (
            <button
              key={locale}
              type="button"
              onClick={() => setActiveLocale(locale)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                activeLocale === locale
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {localeLabel(locale)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading translations...
          </div>
        ) : (
          <div className="space-y-4">
            {fields.map((field) => {
              const key = draftKey(activeLocale, field.name);
              const human = isHuman(activeLocale, field.name);
              const exists = hasTranslation(activeLocale, field.name);
              const needsReview = Boolean(data[activeLocale]?.[field.name]?.needsReview);
              const InputComponent = field.multiline ? Textarea : Input;
              return (
                <div key={field.name} className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{field.label}</span>
                    {exists ? (
                      human ? (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <Pencil className="h-2.5 w-2.5" /> Human-edited
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Sparkles className="h-2.5 w-2.5" /> AI
                        </Badge>
                      )
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        Not translated yet — showing source text on the storefront
                      </span>
                    )}
                    {needsReview && (
                      <Badge className="gap-1 border-amber-300 bg-amber-100 text-[10px] text-amber-900">
                        <AlertTriangle className="h-2.5 w-2.5" /> English changed — review
                      </Badge>
                    )}
                  </div>
                  <InputComponent
                    value={getValue(activeLocale, field.name)}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    rows={field.multiline ? 3 : undefined}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={savingField === key}
                      onClick={() => handleSave(activeLocale, field.name)}
                      className="h-7 text-xs"
                    >
                      {savingField === key ? "Saving..." : "Save correction"}
                    </Button>
                    {human && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={savingField === key}
                        onClick={() => handleReset(activeLocale, field.name)}
                        className="h-7 gap-1 text-xs text-muted-foreground"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reset to AI
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
