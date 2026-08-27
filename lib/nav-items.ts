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
  Scale,
  UserCheck,
  Type,
  PackageSearch,
  Boxes,
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
  { label: "Product Families", href: "/dashboard/product-families", icon: Boxes },
  { label: "Categories", href: "/dashboard/categories", icon: FolderTree },
  { label: "Brands", href: "/dashboard/brands", icon: Tag },
  { label: "Collections", href: "/dashboard/collections", icon: Layers },
  { label: "Attributes", href: "/dashboard/attributes", icon: SlidersHorizontal },
  { label: "Guides", href: "/dashboard/guides", icon: BookOpen },
  { label: "FAQ", href: "/dashboard/faqs", icon: HelpCircle },
  { label: "Glossary", href: "/dashboard/glossary", icon: Languages },
  { label: "Legal Pages", href: "/dashboard/legal-pages", icon: Scale },
  { label: "Dealer Applications", href: "/dashboard/dealer-applications", icon: UserCheck },
  { label: "Orders & Escrow", href: "/dashboard/orders", icon: PackageSearch },
  { label: "Strings", href: "/dashboard/website-strings", icon: Type },
  { label: "Inquiries", href: "/dashboard/inquiries", icon: Inbox },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];
