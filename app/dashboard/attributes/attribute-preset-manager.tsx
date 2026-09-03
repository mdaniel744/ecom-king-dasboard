"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MemoryStick, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";
import { ActionErrorBanner } from "@/components/dashboard/action-error-banner";
import {
  createAttributePreset,
  deleteAttributePreset,
} from "@/app/dashboard/attributes/actions";
import type { AttributeDef } from "@/lib/attribute-defs";
import type { AttributePreset } from "@/lib/types";

type PresetRow = {
  id: number;
  key: string;
  value: string;
};

type Props = {
  attributeDefs: AttributeDef[];
  presets: AttributePreset[];
};

export function AttributePresetManager({ attributeDefs, presets }: Props) {
  const router = useRouter();
  const nextRowId = useRef(1);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<PresetRow[]>([{ id: 0, key: "", value: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateRow(id: number, field: "key" | "value", value: string) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  }

  function valueSuggestionsFor(key: string) {
    return (
      attributeDefs.find(
        (definition) => definition.name.toLowerCase() === key.trim().toLowerCase()
      )?.values ?? []
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const completeAttributes = rows
      .map(({ key, value }) => ({ key: key.trim(), value: value.trim() }))
      .filter(({ key, value }) => key && value);

    if (!name.trim()) {
      setError("Give this preset a name.");
      return;
    }
    if (completeAttributes.length === 0) {
      setError("Add at least one complete attribute.");
      return;
    }

    startTransition(async () => {
      const result = await createAttributePreset({
        name: name.trim(),
        attributes: completeAttributes,
      });

      if (result.success) {
        toast.success("Attribute preset saved");
        setName("");
        setRows([{ id: nextRowId.current++, key: "", value: "" }]);
        router.refresh();
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  function handleDelete(preset: AttributePreset) {
    setError(null);
    setDeletingId(preset.id);
    startTransition(async () => {
      const result = await deleteAttributePreset(preset.id);
      setDeletingId(null);
      if (result.success) {
        toast.success("Attribute preset deleted");
        router.refresh();
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="Manage saved attribute presets"
          title="Saved attribute presets"
        >
          <MemoryStick className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Attribute Presets</DialogTitle>
          <DialogDescription>Save common combinations for faster product uploads.</DialogDescription>
        </DialogHeader>

        <ActionErrorBanner message={error} />

        {presets.length > 0 && (
          <div className="space-y-2">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{preset.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {Object.keys(preset.attributes).length} attribute
                    {Object.keys(preset.attributes).length === 1 ? "" : "s"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isPending}
                  aria-label={`Delete ${preset.name}`}
                  onClick={() => handleDelete(preset)}
                >
                  {deletingId === preset.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-destructive" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 border-t pt-4">
          <div className="space-y-1.5">
            <Label htmlFor="attribute-preset-name">Preset name</Label>
            <Input
              id="attribute-preset-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. 20ft high cube"
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <CreatableCombobox
                    name="preset_attr_key"
                    value={row.key}
                    onChange={(value) => updateRow(row.id, "key", value)}
                    options={attributeDefs.map((definition) => definition.name)}
                    placeholder="Attribute"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <CreatableCombobox
                    name="preset_attr_value"
                    value={row.value}
                    onChange={(value) => updateRow(row.id, "value", value)}
                    options={valueSuggestionsFor(row.key)}
                    placeholder="Value"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove attribute"
                  onClick={() =>
                    setRows((current) =>
                      current.length === 1
                        ? [{ ...current[0], key: "", value: "" }]
                        : current.filter((item) => item.id !== row.id)
                    )
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setRows((current) => [
                  ...current,
                  { id: nextRowId.current++, key: "", value: "" },
                ])
              }
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add attribute
            </Button>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending && !deletingId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save preset
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
