// Client-safe module registry (no secrets). Sidebar + dynamic route both use this.
import {
  LayoutDashboard,
  Building2,
  Package,
  Users,
  Truck,
  Receipt,
  ShoppingCart,
  Wallet,
  BookOpen,
  CreditCard,
  Boxes,
  UserCheck,
  UserCog,
  TrendingUp,
  Barcode,
  ScanLine,
  Printer,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type ErpModule = {
  slug: string;
  sheet: string; // exact Google Sheet tab title
  label: string;
  group: "Overview" | "Masters" | "Transactions" | "Accounts";
  icon: LucideIcon;
  path?: string;
};

export const MODULES: ErpModule[] = [
  { slug: "dashboard", sheet: "Dashboard", label: "Dashboard", group: "Overview", icon: LayoutDashboard },
  { slug: "company", sheet: "Company", label: "Companies", group: "Overview", icon: Building2 },

  { slug: "products", sheet: "Products", label: "Products", group: "Masters", icon: Package },
  { slug: "barcode-management", sheet: "Barcode Database", label: "Barcode Management", group: "Masters", icon: Barcode, path: "/barcode-management" },
  { slug: "barcode-generator", sheet: "Barcode Templates", label: "Barcode Generator", group: "Masters", icon: Sparkles, path: "/barcode-generator" },
  { slug: "barcode-scanner", sheet: "Barcode Database", label: "Barcode Scanner", group: "Masters", icon: ScanLine, path: "/barcode-scanner" },
  { slug: "barcode-print-history", sheet: "Barcode Print History", label: "Barcode Print History", group: "Masters", icon: Printer, path: "/barcode-print-history" },
  { slug: "stock", sheet: "Stock", label: "Stock", group: "Masters", icon: Boxes },
  { slug: "customers", sheet: "Customers", label: "Customers", group: "Masters", icon: Users },
  { slug: "suppliers", sheet: "Suppliers", label: "Suppliers", group: "Masters", icon: Truck },

  { slug: "sales", sheet: "Sales", label: "Sales", group: "Transactions", icon: Receipt },
  { slug: "purchases", sheet: "Purchases", label: "Purchases", group: "Transactions", icon: ShoppingCart },
  { slug: "collection", sheet: "Daily Collection", label: "Daily Collection", group: "Transactions", icon: Wallet },
  { slug: "expenses", sheet: "Expenses", label: "Expenses", group: "Transactions", icon: CreditCard },

  { slug: "cash-book", sheet: "Cash Book", label: "Cash Book", group: "Accounts", icon: BookOpen },
  { slug: "customer-ledger", sheet: "Customer Ledger", label: "Customer Ledger", group: "Accounts", icon: UserCheck },
  { slug: "supplier-ledger", sheet: "Supplier Ledger", label: "Supplier Ledger", group: "Accounts", icon: UserCog },
  { slug: "profit-loss", sheet: "Profit & Loss", label: "Profit & Loss", group: "Accounts", icon: TrendingUp },
];

// Sheets still written/read by the invoice + stock workflow but hidden from navigation.
export const HIDDEN_SHEETS = [
  "Sale Items",
  "Download History",
  "Settings",
  "Returns",
  "Users",
  "Barcode Database",
  "Barcode Templates",
  "Barcode Print History",
  "Product Variants",
  "Barcode Sequences",
  "POS Held Bills",
  "POS Payments",
  "Audit History",
];

export const ALLOWED_SHEET_TITLES = [
  ...new Set([...MODULES.map((module) => module.sheet), ...HIDDEN_SHEETS]),
];


const SLUG_ALIASES: Record<string, string> = {
  "daily-collection": "collection",
  "dailycollection": "collection",
  "daily_collection": "collection",
};

export const normalizeModuleSlug = (slug: string) => {
  const cleaned = String(slug ?? "").trim().toLowerCase();
  return SLUG_ALIASES[cleaned] ?? cleaned;
};

export const getModuleBySlug = (slug: string) =>
  MODULES.find((m) => normalizeModuleSlug(m.slug) === normalizeModuleSlug(slug));
export const getModuleBySheet = (sheet: string) => MODULES.find((m) => m.sheet === sheet);

export const GROUPS: ErpModule["group"][] = ["Overview", "Masters", "Transactions", "Accounts"];
