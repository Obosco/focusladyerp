import type { Invoice } from "./invoice.types";
import {
  amountInWords,
  calculateInvoice,
  dateFormat,
  formatINR,
  normalizeInvoice,
} from "./invoice.utils";

const ITEMS_PER_PAGE = 10;
const MINIMUM_ROWS = 7;

function detail(label: string, value: string, emphasized = false) {
  return (
    <div className="gst-invoice-detail">
      <span className="gst-invoice-detail-label">{label}</span>
      <span className={`gst-invoice-detail-value${emphasized ? " gst-bold" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );
}

export function InvoiceTemplate({ invoice: input }: { invoice: Invoice }) {
  const invoice = normalizeInvoice(input);
  if (!invoice) return <div className="invoice-preview-error">Invoice data is unavailable.</div>;

  const totals = calculateInvoice(invoice);
  const pages: (typeof totals.lines)[] = [];
  const sourceLines = totals.lines.length ? totals.lines : [];
  for (let index = 0; index < sourceLines.length; index += ITEMS_PER_PAGE) {
    pages.push(sourceLines.slice(index, index + ITEMS_PER_PAGE));
  }
  if (!pages.length) pages.push([]);

  return (
    <>
      {pages.map((lines, pageIndex) => (
        <InvoiceSheet
          key={pageIndex}
          invoice={invoice}
          lines={lines}
          totals={totals}
          page={pageIndex + 1}
          pageCount={pages.length}
        />
      ))}
    </>
  );
}

function InvoiceSheet({
  invoice,
  lines,
  totals,
  page,
  pageCount,
}: {
  invoice: Invoice;
  lines: ReturnType<typeof calculateInvoice>["lines"];
  totals: ReturnType<typeof calculateInvoice>;
  page: number;
  pageCount: number;
}) {
  const isFinalPage = page === pageCount;
  const columnCount = invoice.invoice.supplyType === "INTRA" ? 10 : 9;
  const blankRows = isFinalPage ? Math.max(0, MINIMUM_ROWS - lines.length) : 0;

  return (
    <article
      className="invoice-sheet invoice-root"
      aria-label={`Tax invoice ${invoice.invoice.number}, page ${page} of ${pageCount}`}
    >
      <header className="gst-invoice-header">
        <div className="gst-invoice-logo-wrap">
          <img className="gst-invoice-logo" src={invoice.seller.logoUrl} alt="Focus Lady" />
        </div>
        <div className="gst-invoice-seller">
          <h1>{invoice.seller.name}</h1>
          <p>
            {invoice.seller.addressLines.map((line, index) => (
              <span key={`${line}-${index}`}>
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
            {detail("Invoice No", invoice.invoice.number, true)}
            {detail("Invoice Date", dateFormat(invoice.invoice.date))}
            {detail("Place of Supply", invoice.invoice.placeOfSupply)}
            {detail("Payment Mode", invoice.invoice.paymentMode)}
          </div>
        </div>
        <div className="gst-invoice-panel">
          <h3>Billing Details</h3>
          <div className="gst-invoice-panel-body">
            {detail("Bill To (M/S)", invoice.customer.name, true)}
            {detail("Address", invoice.customer.address)}
            {detail("Phone", invoice.customer.phone)}
            {detail("GSTIN", invoice.customer.gstin)}
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
          {lines.map((line, index) => {
            const itemNumber = (page - 1) * ITEMS_PER_PAGE + index + 1;
            return (
              <tr key={`${line.description}-${itemNumber}`}>
                <td className="gst-center">{itemNumber}</td>
                <td>{line.description}</td>
                <td className="gst-center">{line.hsn || "—"}</td>
                <td className="gst-center">{formatINR(line.qty).replace(/\.00$/, "")}</td>
                <td className="gst-number">{formatINR(line.rate)}</td>
                <td className="gst-number">{formatINR(line.taxable)}</td>
                <td className="gst-center">{formatINR(line.gstPercent).replace(/\.00$/, "")}%</td>
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
            );
          })}
          {Array.from({ length: blankRows }, (_, index) => (
            <tr className="gst-blank-row" key={`blank-${page}-${index}`} aria-hidden="true">
              {Array.from({ length: columnCount }, (_, cellIndex) => (
                <td key={cellIndex} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {isFinalPage ? (
        <>
          <section className="gst-invoice-summary">
            <div className="gst-invoice-words-box">
              <h3>Amount in Words</h3>
              <p>{amountInWords(totals.finalTotal)}</p>
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
                <span>
                  {totals.roundOff > 0 ? "+" : ""}
                  {formatINR(totals.roundOff)}
                </span>
              </div>
              <div className="gst-total-grand">
                <span>Grand Total</span>
                <strong>Rs. {formatINR(totals.finalTotal)}</strong>
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
        </>
      ) : null}

      <footer className="gst-invoice-footer">
        <span>{invoice.footerNote}</span>
        <span>
          Page {page} of {pageCount}
        </span>
      </footer>
    </article>
  );
}
