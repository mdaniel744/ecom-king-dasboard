"use client";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  title: string;
  description: string;
  link?: { label: string; href: string };
};

export function FieldInfo({ title, description, link }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Info: ${title}`}
          className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" side="top" align="start">
        <p className="font-medium mb-1">{title}</p>
        <p className="text-muted-foreground leading-relaxed">{description}</p>
        {link && (
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-xs text-primary underline underline-offset-2"
          >
            {link.label} →
          </a>
        )}
      </PopoverContent>
    </Popover>
  );
}
