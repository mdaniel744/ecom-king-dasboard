"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  FileJson,
  FileSpreadsheet,
  FileUp,
  FolderOpen,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ImportError = { row: number; message: string };
type ImportResponse = {
  error?: string;
  created?: number;
  updated?: number;
  warnings?: string[];
  validationErrors?: ImportError[];
};

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProductTransferMenu() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);

  function chooseImportFile() {
    window.setTimeout(() => inputRef.current?.click(), 0);
  }

  function resetImport() {
    setFile(null);
    setErrors([]);
    setGeneralError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function importProducts() {
    if (!file || importing) return;
    setImporting(true);
    setErrors([]);
    setGeneralError(null);

    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/products/import", { method: "POST", body });
      const result = (await response.json()) as ImportResponse;
      if (!response.ok) {
        setErrors(result.validationErrors ?? []);
        setGeneralError(result.error ?? "The products could not be imported.");
        return;
      }

      const created = result.created ?? 0;
      const updated = result.updated ?? 0;
      const warningCount = result.warnings?.length ?? 0;
      toast.success(
        `Import complete: ${created} created, ${updated} updated${
          warningCount ? `, ${warningCount} reference warning${warningCount === 1 ? "" : "s"}` : ""
        }.`
      );
      setDialogOpen(false);
      resetImport();
      router.refresh();
    } catch {
      setGeneralError("The import could not reach the server. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv,.json"
        className="sr-only"
        onChange={(event) => {
          const selected = event.target.files?.[0] ?? null;
          if (!selected) return;
          setFile(selected);
          setErrors([]);
          setGeneralError(null);
          setDialogOpen(true);
        }}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Import or export products"
            title="Import or export products"
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <span className="block">Product files</span>
            <span className="font-normal text-muted-foreground">Back up or restore your catalog</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer py-2.5">
              <Download />
              Export products
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <DropdownMenuItem asChild className="cursor-pointer py-2.5">
                <a href="/api/products/export?format=xlsx" download>
                  <FileSpreadsheet />
                  <span className="flex flex-col">
                    <span>Excel workbook</span>
                    <span className="text-xs text-muted-foreground">.xlsx with instructions</span>
                  </span>
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer py-2.5">
                <a href="/api/products/export?format=csv" download>
                  <FileSpreadsheet />
                  <span className="flex flex-col">
                    <span>CSV table</span>
                    <span className="text-xs text-muted-foreground">Compatible with spreadsheets</span>
                  </span>
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer py-2.5">
                <a href="/api/products/export?format=json" download>
                  <FileJson />
                  <span className="flex flex-col">
                    <span>Product data table</span>
                    <span className="text-xs text-muted-foreground">Structured .json backup</span>
                  </span>
                </a>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem className="cursor-pointer py-2.5" onSelect={chooseImportFile}>
            <Upload />
            <span className="flex flex-col">
              <span>Import products</span>
              <span className="text-xs text-muted-foreground">Excel, CSV, or JSON</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (importing) return;
          setDialogOpen(open);
          if (!open) resetImport();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import products</DialogTitle>
            <DialogDescription>
              The whole file is checked first. Products with a matching ID or slug are updated;
              unmatched products are created.
            </DialogDescription>
          </DialogHeader>

          {file ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background">
                <FileUp className="h-5 w-5 text-primary" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{file.name}</span>
                <span className="text-xs text-muted-foreground">{fileSize(file.size)}</span>
              </span>
            </div>
          ) : null}

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
            Imports include prices, inventory, images and image SEO, attributes, descriptions,
            search metadata, categories, brands, collections, and product-family links.
          </div>

          {generalError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <p className="font-medium">{generalError}</p>
              {errors.length > 0 ? (
                <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5">
                  {errors.map((error, index) => (
                    <li key={`${error.row}-${index}`}>
                      Row {error.row}: {error.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={importing} onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!file || importing} onClick={importProducts}>
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {importing ? "Checking and importing…" : "Import products"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
