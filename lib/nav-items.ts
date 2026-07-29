import {
  LayoutDashboard,
  Package,
  FolderTree,
  SlidersHorizontal,
  Inbox,
  Settings,
  Tag,
  Layers,
  BookOpen,
  HelpCircle,
  Languages,
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
  { label: "Brands", href: "/dashboard/brands", icon: Tag },
  { label: "Collections", href: "/dashboard/collections", icon: Layers },
  { label: "Attributes", href: "/dashboard/attributes", icon: SlidersHorizontal },
  { label: "Guides", href: "/dashboard/guides", icon: BookOpen },
  { label: "FAQ", href: "/dashboard/faqs", icon: HelpCircle },
  { label: "Glossary", href: "/dashboard/glossary", icon: Languages },
  { label: "Inquiries", href: "/dashboard/inquiries", icon: Inbox },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];
