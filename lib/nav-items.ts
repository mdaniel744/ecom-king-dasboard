import {
  LayoutDashboard,
  Package,
  FolderTree,
  SlidersHorizontal,
  Inbox,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Products", href: "/dashboard/products", icon: Package },
  { label: "Categories", href: "/dashboard/categories", icon: FolderTree },
  { label: "Attributes", href: "/dashboard/attributes", icon: SlidersHorizontal },
  { label: "Inquiries", href: "/dashboard/inquiries", icon: Inbox },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];
