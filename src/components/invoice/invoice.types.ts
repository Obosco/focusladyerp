export type InvoiceSupplyType = "INTRA" | "INTER";

export type InvoiceSeller = {
  name: string;
  logoUrl: string;
  addressLines: string[];
  phone: string;
  email: string;
  gstin: string;
  stateCode: string;
  stateName: string;
};

export type InvoiceHeader = {
  type: string;
  category: string;
  copyLabel: string;
  number: string;
  date: string;
  placeOfSupply: string;
  paymentMode: string;
  supplyType: InvoiceSupplyType;
};

export type InvoiceCustomer = {
  name: string;
  address: string;
  phone: string;
  gstin: string;
};

export type InvoiceItem = {
  description: string;
  hsn: string;
  qty: number;
  rate: number;
  gstPercent: number;
};

export type Invoice = {
  seller: InvoiceSeller;
  invoice: InvoiceHeader;
  customer: InvoiceCustomer;
  items: InvoiceItem[];
  discount: number;
  terms: string[];
  footerNote: string;
};
