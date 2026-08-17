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
  type LucideIcon,
} from "lucide-react";

export type ErpModule = {
  slug: string;
  sheet: string; // exact Google Sheet tab title
  label: string;
  group: "Overview" | "Masters" | "Transactions" | "Accounts";
  icon: LucideIcon;
};

export const SPREADSHEET_ID = "1awYVw19Y0gT8RhTBpmBSrkJF_1SiEtraNYgT0_DGgnc";

export const MODULES: ErpModule[] = [
  { slug: "dashboard", sheet: "Dashboard", label: "Dashboard", group: "Overview", icon: LayoutDashboard },
  { slug: "company", sheet: "Company", label: "Companies", group: "Overview", icon: Building2 },

  { slug: "products", sheet: "Products", label: "Products", group: "Masters", icon: Package },
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
export const HIDDEN_SHEETS = ["Sale Items", "Download History"];


export const getModuleBySlug = (slug: string) => MODULES.find((m) => m.slug === slug);
export const getModuleBySheet = (sheet: string) => MODULES.find((m) => m.sheet === sheet);

export const GROUPS: ErpModule["group"][] = ["Overview", "Masters", "Transactions", "Accounts"];
