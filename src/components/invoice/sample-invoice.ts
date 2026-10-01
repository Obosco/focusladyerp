import type { Invoice } from "./invoice.types";

export const SAMPLE_INVOICE: Invoice = {
  seller: {
    name: "OBOSCO CLOTHING INDUSTRIES",
    logoUrl: "/focus%20lady%20logo.png",
    addressLines: [
      "Near Police Station Tanur, First Floor 22/242",
      "Tanur, Malappuram, Kerala - 676302",
    ],
    phone: "+91 80894 57918",
    email: "info@focuslady.in",
    gstin: "32XXXXXXXXXXXZ5",
    stateCode: "32",
    stateName: "Kerala",
  },
  invoice: {
    type: "TAX INVOICE",
    category: "B2C",
    copyLabel: "ORIGINAL FOR RECIPIENT",
    number: "FLB-20261001-002",
    date: "2026-10-01",
    placeOfSupply: "Kerala (32)",
    paymentMode: "Cash / UPI / Card",
    supplyType: "INTRA",
  },
  customer: {
    name: "Customer Name",
    address: "House / Street, Town, District, Kerala - PIN",
    phone: "+91 00000 00000",
    gstin: "",
  },
  items: [
    {
      description: "Focus Lady Padded Bra - Skin, 34B",
      hsn: "6212",
      qty: 2,
      rate: 299,
      gstPercent: 5,
    },
    {
      description: "Focus Lady Non-Padded Bra - Black, 36C",
      hsn: "6212",
      qty: 1,
      rate: 249,
      gstPercent: 5,
    },
  ],
  discount: 50,
  bank: {
    accountName: "OBOSCO CLOTHING INDUSTRIES",
    bankName: "",
    accountNo: "",
    ifsc: "",
    upi: "",
  },
  terms: [
    "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
    "Goods once sold will not be taken back or exchanged except for manufacturing defects, within 7 days with this invoice.",
    "Subject to Tanur (Kerala) jurisdiction only.",
  ],
  footerNote: "Thank you for shopping with Focus Lady! | This is a computer-generated invoice.",
};
