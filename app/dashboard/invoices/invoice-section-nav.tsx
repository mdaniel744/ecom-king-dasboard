import Link from "next/link";
import { cn } from "@/lib/utils";

export function InvoiceSectionNav({ active }: { active: "register" | "settings" }) {
  const links = [
    { id: "register" as const, label: "Invoices", href: "/dashboard/invoices" },
    { id: "settings" as const, label: "Layout & Settings", href: "/dashboard/invoices/settings" },
  ];

  return (
    <div className="mt-5 inline-flex rounded-lg border border-border bg-muted/40 p-1">
      {links.map((link) => (
        <Link
          key={link.id}
          href={link.href}
          aria-current={active === link.id ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-2 text-sm font-medium transition-colors",
            active === link.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
