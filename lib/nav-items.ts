import {
  LayoutDashboard,
  Package,
  FolderTree,
  SlidersHorizontal,
  Inbox,
  Settings,
  Tag,
  Layers,
  UserCheck,
  PackageSearch,
  Boxes,
  Star,
  Store,
  ShoppingCart,
  Truck,
  FileCode2,
  Building2,
  ReceiptText,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

export type NavLink = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type NavGroup = {
  label: string;
  href?: string;
  icon: LucideIcon;
  children: NavLink[];
};

export type NavItem = NavLink | NavGroup;

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Products",
    icon: Package,
    children: [
      { label: "All Products", href: "/dashboard/products", icon: Package },
      { label: "Variable Products", href: "/dashboard/product-families", icon: Boxes },
      { label: "Product Categories", href: "/dashboard/categories", icon: FolderTree },
      { label: "Collections", href: "/dashboard/collections", icon: Layers },
      { label: "Brands", href: "/dashboard/brands", icon: Tag },
      { label: "Attributes", href: "/dashboard/attributes", icon: SlidersHorizontal },
      { label: "Product Reviews", href: "/dashboard/product-reviews", icon: Star },
    ],
  },
  {
    label: "Market",
    icon: Store,
    children: [
      {
        label: "Google Merchant Center",
        href: "/dashboard/market/google-merchant-center",
        icon: ShoppingCart,
      },
      {
        label: "Delivery Markets",
        href: "/dashboard/market/delivery-markets",
        icon: Truck,
      },
      {
        label: "XML Feed URLs",
        href: "/dashboard/market/xml-feed-urls",
        icon: FileCode2,
      },
    ],
  },
  {
    label: "Bureau",
    icon: Building2,
    children: [
      { label: "Inquiries", href: "/dashboard/inquiries", icon: Inbox },
      { label: "Orders", href: "/dashboard/store-orders", icon: ShoppingCart },
      { label: "Invoices", href: "/dashboard/invoices", icon: ReceiptText },
      { label: "Payments", href: "/dashboard/payments", icon: CreditCard },
      { label: "Escrow Orders", href: "/dashboard/orders", icon: PackageSearch },
      {
        label: "Dealership Management",
        href: "/dashboard/dealer-applications",
        icon: UserCheck,
      },
    ],
  },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];
