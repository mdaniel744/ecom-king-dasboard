"use client";

import Link from "next/link";
import { Boxes, ChevronDown, PackagePlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AddProductMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Product
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem asChild className="cursor-pointer items-start py-2.5">
          <Link href="/dashboard/products/new">
            <PackagePlus className="mt-0.5" />
            <span className="flex flex-col">
              <span className="font-medium">Single Product</span>
              <span className="text-xs text-muted-foreground">
                Create one standalone product
              </span>
            </span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer items-start py-2.5">
          <Link href="/dashboard/product-families/new">
            <Boxes className="mt-0.5" />
            <span className="flex flex-col">
              <span className="font-medium">Product Family</span>
              <span className="text-xs text-muted-foreground">
                Generate a related group of variants
              </span>
            </span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
