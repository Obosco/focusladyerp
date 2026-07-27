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
  Scale,
  ListChecks,
  ArrowLeftRight,
  Landmark,
  BadgeDollarSign,
  CalendarCheck,
  type LucideIcon,
} from "lucide-react";

export type ErpModule = {
  slug: string;
  sheet: string; // exact Google Sheet tab title
  label: string;
  group: "Overview" | "Masters" | "Transactions" | "Accounts" | "HR";
  icon: LucideIcon;
};

export const SPREADSHEET_ID = "1awYVw19Y0gT8RhTBpmBSrkJF_1SiEtraNYgT0_DGgnc";

export const MODULES: ErpModule[] = [
  { slug: "dashboard", sheet: "Dashboard", label: "Dashboard", group: "Overview", icon: LayoutDashboard },
  { slug: "company", sheet: "Company", label: "Company", group: "Overview", icon: Building2 },

  { slug: "products", sheet: "Products", label: "Products", group: "Masters", icon: Package },
  { slug: "customers", sheet: "Customers", label: "Customers", group: "Masters", icon: Users },
  { slug: "suppliers", sheet: "Suppliers", label: "Suppliers", group: "Masters", icon: Truck },

  { slug: "sales", sheet: "Sales", label: "Sales", group: "Transactions", icon: Receipt },
  { slug: "purchases", sheet: "Purchases", label: "Purchases", group: "Transactions", icon: ShoppingCart },
  { slug: "collection", sheet: "Daily Collection", label: "Daily Collection", group: "Transactions", icon: Wallet },
  { slug: "expenses", sheet: "Expenses", label: "Expenses", group: "Transactions", icon: CreditCard },
  { slug: "stock", sheet: "Stock", label: "Stock", group: "Transactions", icon: Boxes },

  { slug: "cash-book", sheet: "Cash Book", label: "Cash Book", group: "Accounts", icon: BookOpen },
  { slug: "customer-ledger", sheet: "Customer Ledger", label: "Customer Ledger", group: "Accounts", icon: UserCheck },
  { slug: "supplier-ledger", sheet: "Supplier Ledger", label: "Supplier Ledger", group: "Accounts", icon: UserCog },
  { slug: "profit-loss", sheet: "Profit & Loss", label: "Profit & Loss", group: "Accounts", icon: TrendingUp },
  { slug: "balance-sheet", sheet: "Balance Sheet", label: "Balance Sheet", group: "Accounts", icon: Scale },
  { slug: "trial-balance", sheet: "Trial Balance", label: "Trial Balance", group: "Accounts", icon: ListChecks },
  { slug: "cash-flow", sheet: "Cash Flow", label: "Cash Flow", group: "Accounts", icon: ArrowLeftRight },
  { slug: "assets", sheet: "Assets", label: "Assets", group: "Accounts", icon: Landmark },

  { slug: "payroll", sheet: "Payroll", label: "Payroll", group: "HR", icon: BadgeDollarSign },
  { slug: "attendance", sheet: "Attendance", label: "Attendance", group: "HR", icon: CalendarCheck },
];

export const getModuleBySlug = (slug: string) => MODULES.find((m) => m.slug === slug);
export const getModuleBySheet = (sheet: string) => MODULES.find((m) => m.sheet === sheet);

export const GROUPS: ErpModule["group"][] = ["Overview", "Masters", "Transactions", "Accounts", "HR"];
