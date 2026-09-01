"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { navItems } from "@/lib/nav-items";
import { cn } from "@/lib/utils";

function isRouteActive(pathname: string, href: string) {
  return href === "/dashboard"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  return (
    <nav className="flex flex-col gap-1 px-3">
      {navItems.map((item) => {
        if ("children" in item) {
          const hasActiveChild = item.children.some((child) =>
            isRouteActive(pathname, child.href)
          );
          const isExpanded = hasActiveChild || (!item.href && expandedGroups[item.label] === true);
          const submenuId = `${item.label.toLowerCase().replaceAll(" ", "-")}-submenu`;

          const toggleGroup = () =>
            setExpandedGroups((groups) => ({
              ...groups,
              [item.label]: !isExpanded,
            }));

          return (
            <div key={item.label}>
              <div
                className={cn(
                  "flex w-full items-center rounded-lg text-sm font-medium transition-colors",
                  hasActiveChild
                    ? "bg-accent text-foreground"
                    : "text-foreground/70 hover:bg-accent hover:text-foreground"
                )}
              >
                {item.href ? (
                  <Link
                    href={item.href}
                    aria-expanded={isExpanded}
                    aria-controls={submenuId}
                    onClick={onNavigate}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5"
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        isExpanded && "rotate-180"
                      )}
                    />
                  </Link>
                ) : (
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={submenuId}
                    onClick={toggleGroup}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        isExpanded && "rotate-180"
                      )}
                    />
                  </button>
                )}
              </div>

              {isExpanded && (
                <div id={submenuId} className="ml-5 mt-1 flex flex-col gap-1 border-l border-border pl-2">
                  {item.children.map((child) => {
                    const isActive = isRouteActive(pathname, child.href);

                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground/70 hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <child.icon className="h-3.5 w-3.5 shrink-0" />
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        const isActive = isRouteActive(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-foreground/70 hover:bg-accent hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
