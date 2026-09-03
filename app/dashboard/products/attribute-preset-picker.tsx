"use client";

import { useState } from "react";
import { ChevronDown, MemoryStick, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AttributePreset } from "@/lib/types";

type Props = {
  presets: AttributePreset[];
  onSelect: (preset: AttributePreset) => void;
};

export function AttributePresetPicker({ presets, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between font-normal sm:w-72"
        >
          <span className="flex min-w-0 items-center gap-2 truncate text-muted-foreground">
            <Search className="h-3.5 w-3.5 shrink-0" />
            Load saved attributes
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Search presets..." />
          <CommandList>
            <CommandEmpty>No saved presets.</CommandEmpty>
            <CommandGroup>
              {presets.map((preset) => (
                <CommandItem
                  key={preset.id}
                  value={`${preset.name} ${Object.keys(preset.attributes).join(" ")} ${Object.values(
                    preset.attributes
                  ).join(" ")}`}
                  onSelect={() => {
                    onSelect(preset);
                    setOpen(false);
                  }}
                >
                  <MemoryStick className="h-4 w-4" />
                  <span className="min-w-0 flex-1 truncate">{preset.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {Object.keys(preset.attributes).length}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
