import type { Invoice } from "./invoice.types";
import { amountInWords, calculateInvoice, formatINR } from "./invoice.utils";

function formatInvoiceDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("day")}-${part("month")}-${part("year")}`;
}

function detail(label: string, value: string) {
  return (
    <div className="gst-invoice-detail">
      <span className="gst-invoice-detail-label">{label}</span>
      <span className="gst-invoice-detail-value">{value || "—"}</span>
    </div>
  );
}

export function InvoiceTemplate({ invoice }: { invoice: Invoice }) {
  const totals = calculateInvoice(invoice);
  const hasItems = invoice.items.length > 0 && totals.finalTotal > 0;
  const blankRows = Math.max(0, 8 - (hasItems ? totals.lines.length : 1));

  return (
    <article className="invoice-root" aria-label={`Tax invoice ${invoice.invoice.number}`}>
      <header className="gst-invoice-header">
        <div className="gst-invoice-logo-wrap">
          <img className="gst-invoice-logo" src={invoice.seller.logoUrl} alt="Focus Lady" />
        </div>
        <div className="gst-invoice-seller">
          <h1>{invoice.seller.name}</h1>
          <p>
            {invoice.seller.addressLines.map((line) => (
              <span key={line}>
                {line}
                <br />
              </span>
            ))}
          </p>
          <p>
            Phone: {invoice.seller.phone} <span className="gst-invoice-separator">|</span> Email:{" "}
            {invoice.seller.email}
          </p>
          <p>
            GSTIN: {invoice.seller.gstin} <span className="gst-invoice-separator">|</span> State
            Code: {invoice.seller.stateCode} ({invoice.seller.stateName})
          </p>
        </div>
      </header>

      <div className="gst-invoice-title-row">
        <div className="gst-invoice-title">
          <h2>{invoice.invoice.type}</h2>
          <span>({invoice.invoice.category} - Retail)</span>
        </div>
        <div className="gst-invoice-copy-label">{invoice.invoice.copyLabel}</div>
      </div>

      <section className="gst-invoice-parties" aria-label="Invoice and billing details">
        <div className="gst-invoice-panel">
          <h3>Invoice Details</h3>
          <div className="gst-invoice-panel-body">
            {detail("Invoice No", invoice.invoice.number)}
            {detail("Invoice Date", formatInvoiceDate(invoice.invoice.date))}
            {detail("Place of Supply", invoice.invoice.placeOfSupply)}
            {detail("Payment Mode", invoice.invoice.paymentMode)}
          </div>
        </div>
        <div className="gst-invoice-panel">
          <h3>Billing Details</h3>
          <div className="gst-invoice-panel-body">
            {detail("Bill To (M/S)", invoice.customer.name)}
            {detail("Address", invoice.customer.address)}
            {detail("Phone", invoice.customer.phone)}
            {detail("GSTIN", invoice.customer.gstin.trim() || "N/A (Unregistered)")}
          </div>
        </div>
      </section>

      <table
        className={`gst-invoice-table${invoice.invoice.supplyType === "INTER" ? " gst-invoice-table-inter" : ""}`}
      >
        <thead>
          <tr>
            <th className="gst-center">#</th>
            <th>Description of Goods</th>
            <th className="gst-center">HSN</th>
            <th className="gst-center">Qty</th>
            <th className="gst-number">Rate</th>
            <th className="gst-number">Taxable Value</th>
            <th className="gst-center">GST %</th>
            {invoice.invoice.supplyType === "INTRA" ? (
              <>
                <th className="gst-number">CGST</th>
                <th className="gst-number">SGST</th>
              </>
            ) : (
              <th className="gst-number">IGST</th>
            )}
            <th className="gst-number">Total</th>
          </tr>
        </thead>
        <tbody>
          {hasItems ? (
            totals.lines.map((line, index) => (
              <tr key={`${line.description}-${index}`}>
                <td className="gst-center">{index + 1}</td>
                <td>{line.description}</td>
                <td className="gst-center">{line.hsn || "—"}</td>
                <td className="gst-center">{line.qty}</td>
                <td className="gst-number">{formatINR(line.rate)}</td>
                <td className="gst-number">{formatINR(line.taxable)}</td>
                <td className="gst-center">{line.gstPercent}%</td>
                {invoice.invoice.supplyType === "INTRA" ? (
                  <>
                    <td className="gst-number">{formatINR(line.cgst)}</td>
                    <td className="gst-number">{formatINR(line.sgst)}</td>
                  </>
                ) : (
                  <td className="gst-number">{formatINR(line.igst)}</td>
                )}
                <td className="gst-number gst-bold">{formatINR(line.total)}</td>
              </tr>
            ))
          ) : (
            <tr className="gst-empty-row">
              <td colSpan={invoice.invoice.supplyType === "INTRA" ? 10 : 9}>No items</td>
            </tr>
          )}
          {Array.from({ length: blankRows }, (_, index) => (
            <tr className="gst-blank-row" key={`blank-${index}`} aria-hidden="true">
              <td colSpan={invoice.invoice.supplyType === "INTRA" ? 10 : 9} />
            </tr>
          ))}
        </tbody>
      </table>

      <section className="gst-invoice-summary">
        <div className="gst-invoice-left-summary">
          <div className="gst-invoice-words-box">
            <h3>Amount in Words</h3>
            <p>{amountInWords(totals.finalTotal)}</p>
          </div>
          <div className="gst-invoice-bank-box">
            <h3>Payment / Bank Details</h3>
            <p>
              <span>Account Name:</span> {invoice.bank.accountName || "—"}
            </p>
            <p>
              <span>Bank:</span> {invoice.bank.bankName || "____________"}
              <span className="gst-invoice-separator"> | </span>
              <span>A/C No:</span> {invoice.bank.accountNo || "____________"}
            </p>
            <p>
              <span>IFSC:</span> {invoice.bank.ifsc || "____________"}
              <span className="gst-invoice-separator"> | </span>
              <span>UPI:</span> {invoice.bank.upi || "____________"}
            </p>
          </div>
        </div>
        <div className="gst-invoice-totals">
          <div className="gst-total-row">
            <span>Subtotal (Taxable Value)</span>
            <span>{formatINR(totals.subtotal)}</span>
          </div>
          <div className="gst-total-row">
            <span>Less: Discount</span>
            <span>- {formatINR(totals.discount)}</span>
          </div>
          <div className="gst-total-row">
            <span>Net Taxable Value</span>
            <span>{formatINR(totals.netTaxable)}</span>
          </div>
          {invoice.invoice.supplyType === "INTRA" ? (
            <>
              <div className="gst-total-row">
                <span>CGST</span>
                <span>{formatINR(totals.cgst)}</span>
              </div>
              <div className="gst-total-row">
                <span>SGST</span>
                <span>{formatINR(totals.sgst)}</span>
              </div>
            </>
          ) : (
            <div className="gst-total-row">
              <span>IGST</span>
              <span>{formatINR(totals.igst)}</span>
            </div>
          )}
          <div className="gst-total-row">
            <span>Round Off</span>
            <span>{formatINR(totals.roundOff)}</span>
          </div>
          <div className="gst-total-grand">
            <span>Grand Total</span>
            <strong>Rs. {formatINR(totals.finalTotal).replace(/^₹\s?/, "")}</strong>
          </div>
        </div>
      </section>

      <section className="gst-invoice-bottom">
        <div className="gst-invoice-terms">
          <h3>Terms &amp; Conditions</h3>
          <ol>
            {invoice.terms.map((term, index) => (
              <li key={`${index}-${term}`}>{term}</li>
            ))}
          </ol>
        </div>
        <div className="gst-invoice-signature">
          <strong>For {invoice.seller.name}</strong>
          <div className="gst-signature-space" />
          <div className="gst-signature-line" />
          <span>Authorised Signatory</span>
        </div>
      </section>

      <footer className="gst-invoice-footer">
        <span>{invoice.footerNote}</span>
        <span>Page 1 of 1</span>
      </footer>
    </article>
  );
}
