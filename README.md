# Focus Lady Bra Cloud

Here's an expanded, enterprise-grade Google Sheets integration specification customized for Focus Lady Bra ERP with additional HR, payroll, finance, manufacturing, and management features.





---



Focus Lady Bra ERP



Google Sheets Cloud Database & Real-Time Synchronization



Company



Focus Lady Bra



The ERP system uses Google Sheets as the secure cloud database for SMEs while delivering the speed and experience of a professional ERP through local caching, offline mode, intelligent synchronization, and automated backups.





---



Authentication & Security



Google OAuth 2.0 Login



Secure JWT Session



Multi-user Login



Admin Dashboard



Branch-wise Login



Warehouse Login



Sales Executive Login



Accountant Login



HR Login



Production Manager Login



Store Manager Login



Cashier Login



Read-only Auditor Login



Role-based Permissions



User Activity Logs



Two-Factor Authentication (Optional)



Device Authorization



IP Restriction (Optional)



Login History



Password Reset



Session Timeout





---



Company Management



Company Profile



GST Details



Logo



Address



Branches



Warehouses



Financial Year



Tax Settings



Invoice Settings



Barcode Settings



QR Settings



WhatsApp Settings



Email Settings



SMS Settings



Printer Settings





---



Google Sheets Database Structure



Automatically create worksheets:



Dashboard



Products



Categories



Brands



Product Variants



Size



Cup Size



Color



Fabric



Design



Stock



Warehouse Stock



Stock Transfers



Stock Adjustments



Barcode Database



QR Code Database



Customers



Customer Groups



Suppliers



Purchase Orders



Purchases



Purchase Returns



Sales Orders



Sales



Sales Returns



Quotations



Invoices



Payments



Due Payments



Customer Ledger



Supplier Ledger



Cash Book



Bank Book



Expenses



Expense Categories



Assets



Liabilities



Fixed Assets



Depreciation



Journal Entries



Trial Balance



Profit & Loss



Balance Sheet



Cash Flow



GST Reports



Tax Reports



Audit Logs





---



Employee Management (New)



Employees



Employee ID



Photo



Aadhaar



PAN



Mobile



Address



Joining Date



Department



Designation



Branch



Salary



Allowances



Incentives



PF



ESI



Bank Details



UPI



Emergency Contact



Documents





---



Salary & Payroll (New)



Salary Register



Basic Salary



HRA



DA



Incentives



Sales Commission



Overtime



Bonus



Attendance



Leave Deduction



Advance Salary



Loan Deduction



PF



ESI



Professional Tax



Net Salary



Payslip Generator



Salary History



Bank Transfer Status





---



Attendance



Daily Attendance



Check In



Check Out



GPS Attendance



Face Verification (Optional)



Shift Management



Weekly Off



Holiday Calendar



Leave Management





---



Sales Commission



Sales Executive Commission



Target Achievement



Monthly Incentive



Branch Incentive



Product-wise Commission





---



Company Expenses (Expanded)



Office Rent



Electricity



Water



Internet



Telephone



Fuel



Vehicle Maintenance



Courier



Packing Materials



Printing



Marketing



Facebook Ads



Instagram Ads



Google Ads



Staff Salary



Bonus



Commission



Loan EMI



GST Payment



TDS



Office Supplies



Cleaning



Repairs



Software Subscription



Travel



Miscellaneous Expenses





---



Manufacturing (New)



For Focus Lady Bra production:



Raw Materials



Fabric Stock



Elastic Stock



Hook Stock



Strap Stock



Foam Stock



Lace Stock



Accessories



Bill of Materials (BOM)



Production Orders



Cutting



Stitching



Finishing



Packing



Quality Check



Production Cost



Wastage Tracking



Batch Tracking





---



Inventory Features



Low Stock Alert



Dead Stock Report



Fast Moving Products



Slow Moving Products



ABC Analysis



Batch Number



Expiry Tracking (if applicable)



Barcode Printing



QR Code Printing



Stock Aging





---



CRM



Leads



Customers



Follow-ups



WhatsApp Chat Logs



Call Logs



Email Logs



Visit Reports



Customer Feedback



Loyalty Points



Membership Plans





---



Financial Dashboard



Automatically calculate:



Daily Sales



Weekly Sales



Monthly Sales



Yearly Sales



Gross Profit



Net Profit



Total Expenses



Salary Expense



Marketing Expense



Outstanding Receivables



Outstanding Payables



Cash Balance



Bank Balance



Inventory Value



Warehouse Stock Value



Customer Balance



Supplier Balance



Employee Salary Due



Branch Performance



Product Performance



Top Customers



Top Suppliers





---



Real-Time Sync



Instant Google Sheets Sync



Local SQLite/IndexedDB Cache



Offline Mode



Auto Sync



Conflict Resolution



Background Sync



Incremental Sync



Retry Failed Sync



Queue Processing



Sync Status Indicator





---



Google Sheets Features



Auto Sheet Creation



Read



Write



Update



Safe Delete



Bulk Import



Bulk Export



CSV Import



Excel Import



Formula Support



Search



Sorting



Filters



Conditional Formatting



Pivot Table Compatible



Protected Ranges





---



Backup & Recovery



Google Drive Backup



Daily Backup



Weekly Backup



Monthly Backup



Manual Backup



One-click Restore



Version History



Backup Verification





---



Reports



Generate reports for:



Sales



Purchases



Inventory



Product Profitability



Customer Ledger



Supplier Ledger



Employee Salary



Payroll Summary



Attendance



Commission



Expenses



Cash Flow



GST



Trial Balance



Profit & Loss



Balance Sheet



Manufacturing Cost



Branch Performance



Warehouse Performance



Tax Reports





---



Google Apps Script Automation



WhatsApp Payment Reminder



WhatsApp Invoice Sharing



Email Invoice



Salary Slip Email



Employee Salary Reminder



Low Stock Alert



Daily Sales Report



Weekly Sales Report



Monthly MIS Report



PDF Invoice Generation



Automatic Backup



Scheduled Reports



Branch Alerts



Admin Notifications





---



API Integration



Google Sheets API v4



Google Drive API



Google OAuth 2.0



Google Apps Script Web Apps



Gmail API



Google Calendar API (task reminders)



Google Maps API (delivery & attendance)



WhatsApp Business API



Barcode & QR Code API



PDF Generation Service





---



AI & Smart Features (New)



AI Sales Forecasting



Demand Prediction



Inventory Forecast



Smart Reorder Suggestions



Customer Purchase Prediction



Expense Trend Analysis



Profit Insights



Employee Performance Score



Branch Performance Ranking



AI Chat Assistant for ERP



Natural Language Report Search (e.g., "Show today's sales")





---



Notifications



Low Stock



High Sales



Due Payments



Supplier Payments



Employee Salary Due



New Lead



Follow-up Reminder



Purchase Approval



Expense Approval



Backup Success/Failure



Failed Synchronization



Daily Business Summary





---



This design gives Focus Lady Bra ERP a complete cloud-based business management platform covering sales, wholesale, retail, manufacturing, inventory, HR, payroll, accounting, CRM, analytics, AI insights, and Google Sheets synchronization, making it suitable for a growing multi-branch business with fast, reliable, and secure operations.



Add more futures downloading options pdf , print options, customdate filter ,Digital signature support, autofile name invoice also dowload history,

Google Sheets access uses a Google Cloud service account. Point
`GOOGLE_SERVICE_ACCOUNT_FILE` at the JSON key on disk for local development, or set
`GOOGLE_SERVICE_ACCOUNT_JSON` to the key itself (raw JSON or base64) on hosts with no
filesystem, such as Vercel. The spreadsheet must be shared with the service account
email as Editor.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Deploying to Vercel

`vercel.json` pins the install and build commands; everything else is inferred.

```sh
npm i -g vercel
vercel link
vercel --prod
```

Set these in **Project Settings → Environment Variables** before the first deploy.
The `VITE_*` values are inlined into the browser bundle at build time, so they must be
available to the Build step, not just the runtime:

| Variable | Notes |
| --- | --- |
| `VITE_SUPABASE_URL`, `SUPABASE_URL` | Same value; the second is what SSR reads. |
| `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEY` | Same value. |
| `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_PROJECT_ID` | Same value. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account key. `base64 -i key.json` avoids newline mangling. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional — only for server code that bypasses RLS. |

See `.env.example` for the full list.

### How the build resolves

`vite.config.ts` picks the Nitro preset from the environment: `vercel` when `VERCEL=1`
is set (or `NITRO_PRESET=vercel`), otherwise `node-server` — the plain Node output that
`electron.cjs` spawns for the desktop build. So `npm run build` still produces
`.output/` locally, and Vercel gets `.vercel/output/` (Build Output API v3) with the
SSR handler as a Node 22 function and `/assets/*` served immutably from the CDN.

Because Nitro writes `.vercel/output/config.json` itself, a `headers` block in
`vercel.json` would be ignored. Response headers are declared in `vite.config.ts`
instead and merged into that file.

## Progressive Web App

The app installs to the desktop and home screen and runs standalone.

- `public/manifest.webmanifest` — name, theme, icon set, and shortcuts to New Invoice,
  Invoices and Statistics.
- `public/sw.js` — the service worker. Hashed `/assets/*` bundles are cache-first, so
  repeat launches render without touching the network. Navigations are network-first,
  falling back to the last-seen page and then `public/offline.html`; HTML is never
  served stale, because a stale document can reference asset hashes a newer deploy no
  longer has. Server function calls (`/_serverFn/*`) and Supabase traffic are never
  cached.
- `src/lib/pwa.ts` — registers the worker after `load`, raises a toast offering a reload
  when a new version has been installed, and shows the install prompt.

Chrome never shows an install banner on desktop by itself; it only puts a small icon in
the omnibox. So the app handles `beforeinstallprompt` and shows its own toast with an
**Install** button. The event is captured by an inline script in the document head
(`src/routes/__root.tsx`) because on a repeat visit Chrome can fire it before React
hydrates, and it is not replayed.

The prompt does not appear when the app is already installed, when the user previously
chose *Not now* (cleared by removing the `flb-erp-install-dismissed` key in
localStorage), or in Safari and on iOS — WebKit never fires the event, so installing
there is done manually through **Share → Add to Home Screen**.

Icons are generated from `public/favicon.ico`. To regenerate after a logo change:

```sh
sips -s format png -z 192 192 public/favicon.ico --out public/icon-192.png
sips -s format png -z 512 512 public/favicon.ico --out public/icon-512.png
sips -s format png -z 384 384 public/favicon.ico --out /tmp/mask.png
sips --padToHeightWidth 512 512 --padColor FFFFFF /tmp/mask.png --out public/icon-maskable-512.png
sips -s format png -z 176 176 public/favicon.ico --out /tmp/apple.png
sips --padToHeightWidth 180 180 --padColor FFFFFF /tmp/apple.png --out public/apple-touch-icon.png
```

Bump `VERSION` in `public/sw.js` if the caching strategy itself changes; hashed asset
names already handle ordinary content updates.
