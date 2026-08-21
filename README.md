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

Google Sheets access uses a Google Cloud service account (JSON key referenced by
`GOOGLE_SERVICE_ACCOUNT_FILE` in `.env`). The spreadsheet must be shared with the
service account email as Editor.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
