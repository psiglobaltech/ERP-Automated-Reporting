import { chromium } from "playwright";
import { DocumentData, DocumentLineGroup, OdooSaleOrder, OdooSaleOrderLine, OdooInvoice, OdooInvoiceLine, OdooMany2One, OdooPartner, OdooCompany, OdooPurchaseOrder, OdooPurchaseOrderLine, SaleOrderData } from "../types/document.type";

export async function generateSaleOrderPdf(quoteData: SaleOrderData, isSale: boolean): Promise<Buffer> {
  const html = renderQuoteHtml(quoteData, isSale);
  return renderHtmlToPdf(html);
}

export async function generateInvoicePdf(invoiceData: DocumentData<OdooInvoice, OdooInvoiceLine>): Promise<Buffer> {
  const html = renderInvoiceHtml(invoiceData);
  return renderHtmlToPdf(html);
}

export async function generatePurchasePdf(purchaseOrderData: DocumentData<OdooPurchaseOrder, OdooPurchaseOrderLine>): Promise<Buffer> {
  const html = renderPurchaseOrderHtml(purchaseOrderData);
  return renderHtmlToPdf(html);
}

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch({
    args: ["--no-sandbox"],
  });

  try {
    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle",
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function renderDocumentHeader(logoSrc: string, companyAddressLines: string[]): string {
  return `
  <header class="doc-header">
    <img class="logo" src="${logoSrc}" />
    <div class="company-top-address">
      ${companyAddressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
    </div>
  </header>`;
}

function renderDocumentFooter(): string {
  return `
  <footer class="doc-footer">
    <div class="footer-left">
      ${
        /*
      <div class="company-name">PT PCBA Semiconductor International</div>
      <div><span class="label">NPWP:</span> 053077610321500</div>
      <div><span class="label">Bank:</span> OCBC</div>
      <div><span class="label">Account:</span> 090800031321</div>
      <div><span class="label">Swift Code:</span> NISPIDJA</div>
      */ ""
      }
    </div>
    <div class="footer-right">
      <div><a class="website">www.psiglobaltech.com</a></div>
      <div class="page-number"></div>
    </div>
  </footer>`;
}

function renderQuoteHtml(data: SaleOrderData, isSale: boolean): string {
  const { document, partner, company, groupedLines } = data;
  // Cast to OdooSaleOrder to access sale-order-specific fields
  const order = document as OdooSaleOrder;

  // const quotationLabel = order.state === "draft" || order.state === "sent" ? "Quotation #" : "Order #";
  const quotationLabel = isSale ? "Sale Order #" : "Quotation #";

  const companyName = company?.name || "PT PCBA Semiconductor International";

  const logoSrc = company?.logo ? `data:image/png;base64,${company.logo}` : "/assets/psi-logo.png";

  const companyAddressLines = [companyName, company?.street || "Jl Raden Fatah No 6&7", `${company?.city || "Batam City"} ${company?.zip || "29444"}, Indonesia`];

  const partnerAddressLines = getPartnerAddressLines(partner);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(document.name)}</title>

  <style>
    @page {
      size: A4;
      margin: 0;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      color: #222;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px;
      line-height: 1.25;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: #ffffff;
    }

    /* --- FIXED HEADERS AND FOOTERS --- */
    .doc-header {
      position: fixed;
      top: 8mm;
      left: 4mm;
      right: 4mm;
      height: 28mm;
      z-index: 20;
    }

    .doc-footer {
      position: fixed;
      left: 4mm;
      right: 4mm;
      bottom: 4mm;
      height: 22mm;
      z-index: 20;
      font-size: 12px;
      background: #fff;
      border-top: 1px solid #ddd;
      padding-top: 2mm;
    }

    /* --- TABLE STRUCTURAL SPACERS */
    .page-container {
      width: 100%;
      border-collapse: collapse;
      border: none;
    }
    
    .page-container > thead > tr > td, 
    .page-container > tbody > tr > td, 
    .page-container > tfoot > tr > td {
      padding: 0;
      border: none;
    }

    .header-space {
      height: 40mm; /* 8mm top + 28mm height + 4mm breathing room */
    }

    .footer-space {
      height: 30mm; /* 4mm bottom + 22mm height + 4mm breathing room */
    }

    .document-body {
      padding: 0 4mm; /* Top/Bottom padding removed; handled by spacers */
    }

    /* --- REMAINING STYLES --- */
    .logo {
      position: absolute;
      top: 0;
      left: 0;
      width: 48mm;
      height: auto;
      max-height: 14mm;
      object-fit: contain;
    }

    .company-top-address {
      position: absolute;
      top: 0;
      right: 0;
      width: 78mm;
      text-align: right;
      font-size: 13px;
      line-height: 1.35;
    }

    .footer-left {
      position: absolute;
      left: 0;
      bottom: 0;
      width: 95mm;
      line-height: 1.45;
    }

    .footer-left .company-name {
      font-weight: 700;
      letter-spacing: 0.2px;
    }

    .footer-left .label {
      font-weight: 700;
    }

    .footer-right {
      position: absolute;
      right: 0;
      bottom: 1mm;
      width: 60mm;
      text-align: right;
      line-height: 1.45;
    }

    .website {
      color: #0000aa;
      font-weight: 700;
      text-decoration: none;
    }

    .page-number::after {
      content: "Page " counter(page) " / " counter(pages);
      color: #777;
    }

    .intro-grid {
      display: grid;
      grid-template-columns: 1fr 86mm;
      column-gap: 10mm;
      min-height: 36mm;
      margin-bottom: 5mm;
    }

    .quote-title {
      align-self: end;
      padding-bottom: 1mm;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 24px;
      line-height: 1.2;
      letter-spacing: 1px;
      color: #223247;
      font-weight: 400;
    }

    .customer-address {
      padding-top: 0;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13.5px;
      font-weight: 400;
      line-height: 1.28;
      white-space: pre-line;
    }

    
    .info-row { display: grid; grid-template-columns: repeat(4, 1fr); column-gap: 6mm; margin-bottom: 7mm; width: 100%; }

    .info-label {
      color: #9b3a3a;
      font-weight: 700;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      margin-bottom: 2px;
    }

    .info-value {
      font-size: 12.5px;
      line-height: 1.4;
      white-space: pre-line;
    }

    .quote-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      border: 1px solid #0f2b5b;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
    }

    .quote-table thead {
      display: table-header-group;
    }

    .quote-table th {
      border: 1px solid #0f2b5b;
      padding: 6px 8px;
      text-align: left;
      font-weight: 700;
      color: #fff;
      background: #0f2b5b;
    }

    .quote-table td {
      border: 1px solid #ddd;
      padding: 8px;
      vertical-align: top;
    }

    .quote-table .description-col { width: 58%; }
    .quote-table .qty-col { width: 14%; }
    .quote-table .unit-col { 
      width: 14%; 
      white-space: normal; 
      overflow-wrap: break-word; 
      word-wrap: break-word; 
      word-break: break-word;
    }
    .quote-table .amount-col { 
      width: 14%; 
      white-space: normal; 
      overflow-wrap: break-word; 
      word-wrap: break-word; 
      word-break: break-word;
    }

    .text-right { text-align: right; white-space: nowrap; }
    .text-center { text-align: center; }

    .product-main-row { background: #fff; }

    .product-title {
      font-weight: 700;
      font-size: 13px;
      color: #000;
      margin-bottom: 4px;
    }

    .product-description, .product-notes {
      white-space: pre-line;
      font-size: 12px;
      color: #333;
      margin-top: 4px;
      line-height: 1.45;
      overflow-wrap: break-word; 
      word-wrap: break-word;
    }

    .section-row td {
      font-weight: 700;
      background: #f2f2f2;
      border: 1px solid #ddd;
    }

    .line-block {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .totals-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000000;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
    }

    .totals-table td {
      padding: 8px 12px;
      border: 1px solid #000000;
    }

    .totals-table .total-label {  
      font-weight: 600;
      color: #223247;
    }

    .totals-table .value {
      text-align: right;
      white-space: nowrap;
    }

    .totals-table .grand-total-label {
      background: #0f2b5b;
      color: #fff;
      font-weight: 700;
      border-top: 1px solid #ffffff;
      border-bottom: 1px solid #ffffff;
      border-left: 1px solid #000000;
      border-right: 1px solid #ffffff;
    }

      .totals-table .grand-total-value {
      background: #0f2b5b;
      color: #fff;
      font-weight: 700;
      text-align: right;
      border-top: 1px solid #ffffff;
      border-bottom: 1px solid #ffffff;
      border-left: 1px solid #ffffff;
      border-right: 1px solid #000000;
    }

    .totals-table tr:last-child .grand-total-label {
      border-top: 1px solid #ffffff;
      border-bottom: 1px solid #000000;
      border-left: 1px solid #000000;
      border-right: 1px solid #ffffff;
    }

    .totals-table tr:last-child .grand-total-value {
      border-top: 1px solid #ffffff;
      border-bottom: 1px solid #000000;
      border-left: 1px solid #ffffff;
      border-right: 1px solid #000000;
    }

    .terms {
      margin-top: 7mm;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.45;
      white-space: normal; /* Changed from pre-line to fix unwanted line breaks */
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .terms p { margin: 0 0 3px 0; }

    @media print {
      .line-block {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
  </style>
</head>

<body>
  <header class="doc-header">
    <img class="logo" src="${logoSrc}" />
    <div class="company-top-address">
      ${companyAddressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
    </div>
  </header>

  <footer class="doc-footer">
    <div class="footer-left">
      ${
        /*
      <div class="company-name">PT PCBA Semiconductor International</div>
      <div><span class="label">NPWP:</span> 053077610321500</div>
      <div><span class="label">Bank:</span> OCBC</div>
      <div><span class="label">Account:</span> 090800031321</div>
      <div><span class="label">Swift Code:</span> NISPIDJA</div>
      */ ""
      }
    </div>

    <div class="footer-right">
      <div><a class="website">www.psiglobaltech.com</a></div>
      <div class="page-number"></div>
    </div>
  </footer>

  <table class="page-container">
    <thead>
      <tr>
        <td>
          <div class="header-space"></div>
        </td>
      </tr>
    </thead>
    
    <tbody>
      <tr>
        <td>
          <main class="document-body">
            <section class="intro-grid">
              <div class="quote-title">
                ${escapeHtml(quotationLabel)} ${escapeHtml(document.name)}
              </div>
              <div class="customer-address">
                ${partnerAddressLines.map((line) => escapeHtml(line)).join("\n")}
              </div>
            </section>

            <section class="info-row">
              <div>
                <div class="info-label">Quotation Date</div>
                <div class="info-value">${escapeHtml(formatDate(order.date_order))}</div>
              </div>
              <div>
                <div class="info-label">Expiration</div>
                <div class="info-value">${escapeHtml(formatDate(order.validity_date))}</div>
              </div>
              <div>
                <div class="info-label">Salesperson</div>
                <div class="info-value">${escapeHtml(m2oName(order.user_id))}</div>
              </div>
              <div>
                  <div class="info-label">Incoterm</div>
                  <div class="info-value">${escapeHtml(m2oName(order.incoterm) || "—")}</div>
              </div> 
            </section>

            <div class="quote-lines-container">
              ${(() => {
                const hasDiscount = groupedLines.some((g) => g.type === "product" && g.line && g.line.discount);
                const hasTaxes = groupedLines.some((g) => g.type === "product" && g.line && g.line.tax_names && g.line.tax_names.length > 0);
                return `
              <table class="quote-table">
                <thead>
                  <tr>
                    <th class="description-col">Description</th>
                    <th class="qty-col text-center">Quantity</th>
                    <th class="unit-col text-right">Unit Price</th>
                    ${hasDiscount ? `<th class="unit-col text-right">Disc</th>` : ""}
                    ${hasTaxes ? `<th class="unit-col text-right">Taxes</th>` : ""}
                    <th class="amount-col text-right">Amount</th>
                  </tr>
                </thead>
                ${groupedLines.map((group, index) => renderLineGroup(group, index + 1, document.currency_id, hasDiscount, hasTaxes)).join("")}
              </table>`;
              })()}
            </div>


            <table style="width: 100%; border: none; border-collapse: collapse; margin-top: 6mm; page-break-inside: avoid;">
              <tr>
                <td style="width: 58%; border: none; padding: 0;"></td>
                <td style="width: 42%; border: none; padding: 0; vertical-align: top;">
                  <table class="totals-table">
                    <tr>
                      <td class="label">Untaxed Amount</td>
                      <td class="value">${formatCurrency(document.amount_untaxed, document.currency_id)}</td>
                    </tr>

                    <tr>
                      <td class="label">Taxes</td>
                      <td class="value">${formatCurrency(document.amount_tax, document.currency_id)}</td>
                    </tr>

                  ${(() => {
                    const airLine = groupedLines.find((g) => g.type === "product" && "line" in g && /\bshipping\b.*\bair\b|\bair\b.*\bshipping\b/i.test((g as any).line?.name || ""));

                    const seaLine = groupedLines.find((g) => g.type === "product" && "line" in g && /\bshipping\b.*\bsea\b|\bsea\b.*\bshipping\b/i.test((g as any).line?.name || ""));

                    // 1. If neither Air nor Sea exist, render ONLY the standard Total row
                    if (!airLine && !seaLine) {
                      return `<tr>
                        <td class="grand-total-label">Total</td>
                        <td class="grand-total-value">
                          ${formatCurrency(document.amount_total, document.currency_id)}
                        </td>
                      </tr>`;
                    }

                    // 2. Otherwise, calculate Air/Sea and render ONLY those (omitting standard Total)
                    const airPrice = airLine && airLine.type === "product" ? airLine.line.price_total || 0 : 0;
                    const seaPrice = seaLine && seaLine.type === "product" ? seaLine.line.price_total || 0 : 0;
                    const baseTotal = document.amount_total - airPrice - seaPrice;

                    let html = "";

                    if (airLine) {
                      html += `<tr>
                        <td class="grand-total-label">Total by Air</td>
                        <td class="grand-total-value">
                          ${formatCurrency(baseTotal + airPrice, document.currency_id)}
                        </td>
                      </tr>`;
                    }

                    if (seaLine) {
                      html += `<tr>
                        <td class="grand-total-label">Total by Sea</td>
                        <td class="grand-total-value">
                          ${formatCurrency(baseTotal + seaPrice, document.currency_id)}
                        </td>
                      </tr>`;
                    }

                    return html;
                  })()}
                  </table>
                </td>
              </tr>
            </table>

            ${renderTerms(order.note)}
          </main>
        </td>
      </tr>
    </tbody>
    
    <tfoot>
      <tr>
        <td>
          <div class="footer-space"></div>
        </td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
}

function renderInvoiceHtml(data: DocumentData<OdooInvoice, OdooInvoiceLine>): string {
  const { document, partner, company, groupedLines } = data;

  const companyName = company?.name || "PT PCBA Semiconductor International";
  const logoSrc = company?.logo ? `data:image/png;base64,${company.logo}` : "/assets/psi-logo.png";
  const companyAddressLines = [companyName, company?.street || "Jl Raden Fatah No 6&7", `${company?.city || "Batam City"} ${company?.zip || "29444"}, Indonesia`];
  const partnerAddressLines = getPartnerAddressLines(partner);

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(document.name)}</title>
      <style>
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; }
        html, body {
          margin: 0; padding: 0; color: #222;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 13px; line-height: 1.25;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          background: #ffffff;
        }
        .doc-header { position: fixed; top: 8mm; left: 4mm; right: 4mm; height: 28mm; z-index: 20; }
        .doc-footer { position: fixed; left: 4mm; right: 4mm; bottom: 4mm; height: 22mm; z-index: 20; font-size: 12px; background: #fff; border-top: 1px solid #ddd; padding-top: 2mm; }
        .page-container { width: 100%; border-collapse: collapse; border: none; }
        .page-container > thead > tr > td,
        .page-container > tbody > tr > td,
        .page-container > tfoot > tr > td { padding: 0; border: none; }
        .header-space { height: 40mm; }
        .footer-space { height: 30mm; }
        .document-body { padding: 0 4mm; }
        .logo { position: absolute; top: 0; left: 0; width: 48mm; height: auto; max-height: 14mm; object-fit: contain; }
        .company-top-address { position: absolute; top: 0; right: 0; width: 78mm; text-align: right; font-size: 13px; line-height: 1.35; }
        .footer-left { position: absolute; left: 0; bottom: 0; width: 95mm; line-height: 1.45; }
        .footer-left .company-name { font-weight: 700; letter-spacing: 0.2px; }
        .footer-left .label { font-weight: 700; }
        .footer-right { position: absolute; right: 0; bottom: 1mm; width: 60mm; text-align: right; line-height: 1.45; }
        .website { color: #0000aa; font-weight: 700; text-decoration: none; }
        .page-number::after { content: "Page " counter(page) " / " counter(pages); color: #777; }
        .intro-grid { display: grid; grid-template-columns: 1fr 86mm; column-gap: 10mm; min-height: 36mm; margin-bottom: 5mm; }
        .quote-title { align-self: end; padding-bottom: 1mm; font-family: Arial, Helvetica, sans-serif; font-size: 24px; line-height: 1.2; letter-spacing: 1px; color: #223247; font-weight: 400; }
        .customer-address { padding-top: 0; font-family: Arial, Helvetica, sans-serif; font-size: 13.5px; font-weight: 400; line-height: 1.28; white-space: pre-line; }
        /* 5-column info row for invoices */
        .info-row { display: grid; grid-template-columns: repeat(4, 1fr); column-gap: 6mm; margin-bottom: 7mm; width: 100%; }
        .info-label { color: #9b3a3a; font-weight: 700; font-family: Arial, Helvetica, sans-serif; font-size: 12px; margin-bottom: 2px; }
        .info-value { font-size: 12.5px; line-height: 1.4; white-space: pre-line; }
        .quote-table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #0f2b5b; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
        .quote-table thead { display: table-header-group; }
        .quote-table th { border: 1px solid #0f2b5b; padding: 6px 8px; text-align: left; font-weight: 700; color: #fff; background: #0f2b5b; }
        .quote-table td { border: 1px solid #ddd; padding: 8px; vertical-align: top; }
        .quote-table .description-col { width: 58%; }
        .quote-table .qty-col { width: 14%; }
        .quote-table .unit-col { 
          width: 14%; 
          white-space: normal; 
          overflow-wrap: break-word; 
          word-wrap: break-word; 
          word-break: break-word;
        }
        .quote-table .amount-col { 
          width: 14%; 
          white-space: normal; 
          overflow-wrap: break-word; 
          word-wrap: break-word; 
          word-break: break-word;
        }
        .text-right { text-align: right; white-space: nowrap; }
        .text-center { text-align: center; }
        .product-main-row { background: #fff; }
        .product-title { font-weight: 700; font-size: 13px; color: #000; margin-bottom: 4px; }
        .product-description, .product-notes { white-space: pre-line; font-size: 12px; color: #333; margin-top: 4px; line-height: 1.45; overflow-wrap: break-word; 
      word-wrap: break-word; }
        .section-row td { font-weight: 700; background: #f2f2f2; border: 1px solid #ddd; }
        .line-block { break-inside: avoid; page-break-inside: avoid; margin-bottom: 6mm; }
        .totals-table { width: 100%; border-collapse: collapse; border: 1px solid #0f2b5b; }
        .totals-table td { padding: 8px 12px; border: 1px solid #0f2b5b; }
        .totals-table .total-label { font-weight: 600; color: #223247; }
        .totals-table .value { text-align: right; white-space: nowrap; }
        .totals-table .grand-total-label, .totals-table .grand-total-value { background: #0f2b5b; color: #fff; font-weight: 700; }
        .totals-table .grand-total-value { text-align: right; }
        .terms { margin-top: 7mm; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.45; white-space: pre-line; break-inside: avoid; page-break-inside: avoid; }
        .terms p { margin: 0 0 3px 0; }
        .summary-section {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12mm;
          margin-top: 6mm;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .summary-left {
          flex: 1;
          font-size: 12px;
          line-height: 1.55;
        }

        .summary-left .company-name {
          font-weight: 700;
          margin-bottom: 4px;
        }

        .summary-left .label {
          font-weight: 700;
        }

        .summary-right {
          width: 42%;
        }

        .summary-right .totals-table {
          width: 100%;
        }
        @media print { .line-block { break-inside: avoid; page-break-inside: avoid; } }
      </style>
    </head>
    <body>
      ${renderDocumentHeader(logoSrc, companyAddressLines)}
      ${renderDocumentFooter()}
      <table class="page-container">
        <thead><tr><td><div class="header-space"></div></td></tr></thead>
        <tbody>
          <tr><td>
            <main class="document-body">
              <section class="intro-grid">
                <div class="quote-title">Invoice ${escapeHtml(document.name)}</div>
                <div class="customer-address">
                  ${partnerAddressLines.map((line) => escapeHtml(line)).join("\n")}
                </div>
              </section>

              <section class="info-row">
                <div>
                  <div class="info-label">Invoice Date</div>
                  <div class="info-value">${escapeHtml(formatDate(document.invoice_date))}</div>
                </div>
                <div>
                  <div class="info-label">Due Date</div>
                  <div class="info-value">${escapeHtml(formatDate(document.invoice_date_due))}</div>
                </div>
                <div>
                  <div class="info-label">Source</div>
                  <div class="info-value">${escapeHtml(document.invoice_origin || "—")}</div>
                </div>
                <div>
                  <div class="info-label">Reference</div>
                  <div class="info-value">${escapeHtml(document.ref || "—")}</div>
                </div>
                ${
                  /* <div>
                  <div class="info-label">Incoterm</div>
                  <div class="info-value">${escapeHtml(m2oName(document.invoice_incoterm_id) || "—")}</div>
                </div> */ ""
                }
                
              </section>

              <div class="quote-lines-container">
                ${(() => {
                  const hasDiscount = groupedLines.some((g) => g.type === "product" && g.line && g.line.discount);
                  const hasTaxes = groupedLines.some((g) => g.type === "product" && g.line && g.line.tax_names && g.line.tax_names.length > 0);
                  return `
                <table class="quote-table">
                  <thead>
                    <tr>
                      <th class="description-col">Description</th>
                      <th class="qty-col text-center">Quantity</th>
                      <th class="unit-col text-right">Unit Price</th>
                      ${hasDiscount ? `<th class="unit-col text-right">Disc</th>` : ""}
                      ${hasTaxes ? `<th class="unit-col text-right">Taxes</th>` : ""}
                      <th class="amount-col text-right">Amount</th>
                    </tr>
                  </thead>
                  ${groupedLines.map((group, index) => renderInvoiceLineGroup(group, index + 1, document.currency_id, hasDiscount, hasTaxes)).join("")}
                </table>`;
                })()}
              </div>


              <section class="summary-section">
                <div class="summary-left">

                  <div class="company-name">
                    PT PCBA Semiconductor International
                  </div>

                  <div><span class="label">NPWP:</span> 053077610321500</div>
                  <div><span class="label">Bank:</span> OCBC</div>
                  <div><span class="label">Account:</span> 090800031321</div>
                  <div><span class="label">Swift Code:</span> NISPIDJA</div>

                  ${renderTerms(document.narration)}

                </div>

                <div class="summary-right">
                  <table class="totals-table">
                    <tr>
                      <td class="label">Untaxed Amount</td>
                      <td class="value">${formatCurrency(document.amount_untaxed, document.currency_id)}</td>
                    </tr>

                    <tr>
                      <td class="label">Taxes</td>
                      <td class="value">${formatCurrency(document.amount_tax, document.currency_id)}</td>
                    </tr>

                    <tr>
                      <td class="grand-total-label">Total</td>
                      <td class="grand-total-value">${formatCurrency(document.amount_total, document.currency_id)}</td>
                    </tr>
                  </table>
                </div>

              </section>

              ${/* renderTerms(document.narration) */ ""}
            </main>
          </td></tr>
        </tbody>
        <tfoot><tr><td><div class="footer-space"></div></td></tr></tfoot>
      </table>
    </body>
  </html>`;
}

function renderPurchaseOrderHtml(data: DocumentData<OdooPurchaseOrder, OdooPurchaseOrderLine>): string {
  const { document, partner, company, groupedLines } = data;

  const companyName = company?.name || "PT PCBA Semiconductor International";
  const logoSrc = company?.logo ? `data:image/png;base64,${company.logo}` : "/assets/psi-logo.png";
  const companyAddressLines = [companyName, company?.street || "Jl Raden Fatah No 6&7", `${company?.city || "Batam City"} ${company?.zip || "29444"}, Indonesia`];
  const partnerAddressLines = getPartnerAddressLines(partner);

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(document.name)}</title>
      <style>
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; }
        html, body {
          margin: 0; padding: 0; color: #222;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 13px; line-height: 1.25;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          background: #ffffff;
        }
        .doc-header { position: fixed; top: 8mm; left: 4mm; right: 4mm; height: 28mm; z-index: 20; }
        .doc-footer { position: fixed; left: 4mm; right: 4mm; bottom: 4mm; height: 22mm; z-index: 20; font-size: 12px; background: #fff; border-top: 1px solid #ddd; padding-top: 2mm; }
        .page-container { width: 100%; border-collapse: collapse; border: none; }
        .page-container > thead > tr > td,
        .page-container > tbody > tr > td,
        .page-container > tfoot > tr > td { padding: 0; border: none; }
        .header-space { height: 40mm; }
        .footer-space { height: 30mm; }
        .document-body { padding: 0 4mm; }
        .logo { position: absolute; top: 0; left: 0; width: 48mm; height: auto; max-height: 14mm; object-fit: contain; }
        .company-top-address { position: absolute; top: 0; right: 0; width: 78mm; text-align: right; font-size: 13px; line-height: 1.35; }
        .footer-left { position: absolute; left: 0; bottom: 0; width: 95mm; line-height: 1.45; }
        .footer-left .company-name { font-weight: 700; letter-spacing: 0.2px; }
        .footer-left .label { font-weight: 700; }
        .footer-right { position: absolute; right: 0; bottom: 1mm; width: 60mm; text-align: right; line-height: 1.45; }
        .website { color: #0000aa; font-weight: 700; text-decoration: none; }
        .page-number::after { content: "Page " counter(page) " / " counter(pages); color: #777; }
        .intro-grid { display: grid; grid-template-columns: 1fr 86mm; column-gap: 10mm; min-height: 36mm; margin-bottom: 5mm; }
        .left-grid {
          align-self: start; 
          display: flex; 
          flex-direction: column;
          justify-content: space-between; 
          min-height: 36mm;
        }
        .quote-title { 
          padding-bottom: 1mm; 
          font-family: Arial, Helvetica, sans-serif; 
          font-size: 24px; 
          line-height: 1.2; 
          letter-spacing: 1px; 
          color: #223247; 
          font-weight: 400; 
        }
        .customer-address { 
          padding-top: 0; 
          font-family: Arial, Helvetica, sans-serif; 
          font-size: 13.5px; 
          font-weight: 400; 
          line-height: 1.28; 
          white-space: pre-line; 
        }
        .shipping-address { 
          padding-top: 0; 
          font-family: Arial, Helvetica, sans-serif; 
          font-size: 13.5px; 
          font-weight: 400; 
          line-height: 1.28; 
          white-space: pre-line; 
        }
        /* 5-column info row for invoices */
        .info-row { display: grid; grid-template-columns: repeat(4, 1fr); column-gap: 6mm; margin-bottom: 7mm; width: 100%; }
        .info-label { color: #9b3a3a; font-weight: 700; font-family: Arial, Helvetica, sans-serif; font-size: 12px; margin-bottom: 2px; }
        .info-value { font-size: 12.5px; line-height: 1.4; white-space: pre-line; }
        .quote-table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #0f2b5b; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
        .quote-table thead { display: table-header-group; }
        .quote-table th { border: 1px solid #0f2b5b; padding: 6px 8px; text-align: left; font-weight: 700; color: #fff; background: #0f2b5b; }
        .quote-table td { border: 1px solid #ddd; padding: 8px; vertical-align: top; }
        .quote-table .description-col { width: 58%; }
        .quote-table .qty-col { width: 14%; }
        .quote-table .unit-col {
          width: 14%;
          white-space: normal;
          overflow-wrap: break-word;
          word-wrap: break-word;
          word-break: break-word;
        }
        .quote-table .amount-col {
          width: 14%;
          white-space: normal;
          overflow-wrap: break-word;
          word-wrap: break-word;
          word-break: break-word;
        }
        .summary-section {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12mm;
          margin-top: 6mm;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .text-right { text-align: right; white-space: nowrap; }
        .text-center { text-align: center; }
        .product-main-row { background: #fff; }
        .product-title { font-weight: 700; font-size: 13px; color: #000; margin-bottom: 4px; }
        .product-description, .product-notes { white-space: pre-line; font-size: 12px; color: #333; margin-top: 4px; line-height: 1.45; overflow-wrap: break-word;
      word-wrap: break-word; }
        .section-row td { font-weight: 700; background: #f2f2f2; border: 1px solid #ddd; }
        .line-block { break-inside: avoid; page-break-inside: avoid; margin-bottom: 6mm; }
        .totals-table { width: 100%; border-collapse: collapse; border: 1px solid #0f2b5b; }
        .totals-table td { padding: 8px 12px; border: 1px solid #0f2b5b; }
        .totals-table .total-label { font-weight: 600; color: #223247; }
        .totals-table .value { text-align: right; white-space: nowrap; }
        .totals-table .grand-total-label, .totals-table .grand-total-value { background: #0f2b5b; color: #fff; font-weight: 700; }
        .totals-table .grand-total-value { text-align: right; }
        .terms { margin-top: 7mm; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.45; white-space: pre-line; break-inside: avoid; page-break-inside: avoid; }
        .terms p { margin: 0 0 3px 0; }
        .summary-section {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12mm;
          margin-top: 6mm;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .summary-left {
          flex: 1;
          font-size: 12px;
          line-height: 1.55;
        }

        .summary-left .company-name {
          font-weight: 700;
          margin-bottom: 4px;
        }

        .summary-left .label {
          font-weight: 700;
        }

        .summary-right {
          width: 42%;
        }

        .summary-right .totals-table {
          width: 100%;
        }
        @media print { .line-block { break-inside: avoid; page-break-inside: avoid; } }
      </style>
    </head>
    <body>
      ${renderDocumentHeader(logoSrc, companyAddressLines)}
      ${renderDocumentFooter()}
      <table class="page-container">
        <thead><tr><td><div class="header-space"></div></td></tr></thead>
        <tbody>
          <tr><td>
            <main class="document-body">
              <section class="intro-grid">
                <div class="left-grid">
                  <div class="shipping-address"><b>Shipping Address</b> ${"\n" + companyAddressLines.map((line) => escapeHtml(line)).join("\n")} </div>          
                  <div class="quote-title">Purchase Order #${escapeHtml(document.name)}</div>
                </div>
                <div class="customer-address">
                  ${partnerAddressLines.map((line) => escapeHtml(line)).join("\n")}
                </div>
              </section>

              <section class="info-row">
                <div>
                  <div class="info-label">Buyer</div>
                  <div class="info-value">${escapeHtml(m2oName(document.user_id))}</div>
                </div>
                <div>
                  <div class="info-label">Order Date</div>
                  <div class="info-value">${escapeHtml(formatDate(document.date_order))}</div>
                </div>
                <div>
                  <div class="info-label">Expected Arrival</div>
                  <div class="info-value">${escapeHtml(formatDate(document.date_planned || "—"))}</div>
                </div>
              </section>

              <div class="quote-lines-container">
                ${(() => {
                  const hasDiscount = groupedLines.some((g) => g.type === "product" && g.line && g.line.discount);
                  const hasTaxes = groupedLines.some((g) => g.type === "product" && g.line && g.line.tax_names && g.line.tax_names.length > 0);
                  return `
                <table class="quote-table">
                  <thead>
                    <tr>
                      <th class="description-col">Description</th>
                      <th class="qty-col text-center">Quantity</th>
                      <th class="unit-col text-right">Unit Price</th>
                      ${hasDiscount ? `<th class="unit-col text-right">Disc</th>` : ""}
                      ${hasTaxes ? `<th class="unit-col text-right">Taxes</th>` : ""}
                      <th class="amount-col text-right">Amount</th>
                    </tr>
                  </thead>
                  ${groupedLines.map((group, index) => renderPurchaseOrderLineGroup(group, index + 1, document.currency_id, hasDiscount, hasTaxes)).join("")}
                </table>`;
                })()}
              </div>


              <section class="summary-section">
                <div class="summary-left">
                  <div class="company-name">
                    PT PCBA Semiconductor International
                  </div>
                  <div><span class="label">NPWP:</span> 053077610321500</div>
                  <div><span class="label">Bank:</span> OCBC</div>
                  <div><span class="label">Account:</span> 090800031321</div>
                  <div><span class="label">Swift Code:</span> NISPIDJA</div>
                  ${renderTerms(document.notes)}
                </div>
                <div class="summary-right">
                  <table class="totals-table">
                    <tr>
                      <td class="label">Untaxed Amount</td>
                      <td class="value">${formatCurrency(document.amount_untaxed, document.currency_id)}</td>
                    </tr>
                    <tr>
                      <td class="label">Taxes</td>
                      <td class="value">${formatCurrency(document.amount_tax, document.currency_id)}</td>
                    </tr>
                    <tr>
                      <td class="grand-total-label">Total</td>
                      <td class="grand-total-value">${formatCurrency(document.amount_total, document.currency_id)}</td>
                    </tr>
                  </table>
                </div>
              </section>
            </main>
          </td></tr>
        </tbody>
        <tfoot><tr><td><div class="footer-space"></div></td></tr></tfoot>
      </table>
    </body>
  </html>`;
}

function renderInvoiceLineGroup(group: DocumentLineGroup<OdooInvoiceLine>, displayNumber: number, currency: OdooMany2One, hasDiscount: boolean, hasTaxes: boolean): string {
  const colSpan = 4 + (hasDiscount ? 1 : 0) + (hasTaxes ? 1 : 0);
  if (group.type === "section") {
    return `
      <tbody class="line-block">
        <tr class="section-row">
          <td colspan="${colSpan}">${escapeHtml(group.title)}</td>
        </tr>
      </tbody>
    `;
  }

  const line = group.line;
  const unitName = line.product_uom_id && Array.isArray(line.product_uom_id) ? line.product_uom_id[1] : "Units";

  const nameParts = line.name.split("\n");
  const title = nameParts[0];
  const description = nameParts.length > 1 ? nameParts.slice(1).join("\n") : "";
  const extraNotes = group.notes.length > 0 ? group.notes.map((n) => formatNoteText(n.name)).join("\n\n") : "";

  return `
    <tbody class="line-block">
      <tr class="product-main-row">
        <td class="description-cell">
          <div class="product-title">${escapeHtml(title)}</div>
          ${description ? `<div class="product-description">${formatNoteText(description)}</div>` : ""}
          ${extraNotes ? `<div class="product-notes">${extraNotes}</div>` : ""}
        </td>
        <td class="qty-col text-center">${formatQty(line.quantity)} ${escapeHtml(unitName)}</td>
        <td class="unit-col text-right">${formatCurrency(line.price_unit, currency)}</td>
        ${hasDiscount ? `<td class="unit-col text-right">${line.discount ? escapeHtml(line.discount + "%") : "-"}</td>` : ""}
        ${hasTaxes ? `<td class="unit-col text-right">${line.tax_names && line.tax_names.length > 0 ? escapeHtml(line.tax_names.join(", ")) : "-"}</td>` : ""}
        <td class="amount-col text-right">${formatCurrency(line.price_subtotal, currency)}</td>
      </tr>
    </tbody>
  `;
}

function renderLineGroup(group: DocumentLineGroup<OdooSaleOrderLine>, displayNumber: number, currency: OdooMany2One, hasDiscount: boolean, hasTaxes: boolean): string {
  const colSpan = 4 + (hasDiscount ? 1 : 0) + (hasTaxes ? 1 : 0);
  if (group.type === "section") {
    return `
      <tbody class="line-block">
        <tr class="section-row">
          <td colspan="${colSpan}">${escapeHtml(group.title)}</td>
        </tr>
      </tbody>
    `;
  }

  const line = group.line;
  const unitName = getUomName(line);

  // Split Odoo's line name into the product title and its detailed description
  const nameParts = line.name.split("\n");
  const title = nameParts[0];
  const description = nameParts.length > 1 ? nameParts.slice(1).join("\n") : "";

  // Combine any additional Odoo notes for this line
  const extraNotes = group.notes.length > 0 ? group.notes.map((n) => formatNoteText(n.name)).join("\n\n") : "";

  return `
      <tbody class="line-block">
        <tr class="product-main-row">
          <td class="description-cell">
            <div class="product-title">${escapeHtml(title)}</div>
            ${description ? `<div class="product-description">${formatNoteText(description)}</div>` : ""}
            ${extraNotes ? `<div class="product-notes">${extraNotes}</div>` : ""}
          </td>
          <td class="qty-col text-center">${formatQty(line.product_uom_qty)} ${escapeHtml(unitName)}</td>
          <td class="unit-col text-right">${formatCurrency(line.price_unit, currency)}</td>
          ${hasDiscount ? `<td class="unit-col text-right">${line.discount ? escapeHtml(line.discount + "%") : "-"}</td>` : ""}
          ${hasTaxes ? `<td class="unit-col text-right">${line.tax_names && line.tax_names.length > 0 ? escapeHtml(line.tax_names.join(", ")) : "-"}</td>` : ""}
          <td class="amount-col text-right">${formatCurrency(line.price_subtotal, currency)}</td>
        </tr>
      </tbody>
  `;
}

function renderPurchaseOrderLineGroup(group: DocumentLineGroup<OdooPurchaseOrderLine>, displayNumber: number, currency: OdooMany2One, hasDiscount: boolean, hasTaxes: boolean): string {
  const colSpan = 4 + (hasDiscount ? 1 : 0) + (hasTaxes ? 1 : 0);
  if (group.type === "section") {
    return `
      <tbody class="line-block">
        <tr class="section-row">
          <td colspan="${colSpan}">${escapeHtml(group.title)}</td>
        </tr>
      </tbody>
    `;
  }
  const line = group.line;
  const unitName = line.product_uom && Array.isArray(line.product_uom) ? line.product_uom[1] : "Units";
  const nameParts = line.name.split("\n");
  const title = nameParts[0];
  const description = nameParts.length > 1 ? nameParts.slice(1).join("\n") : "";
  const extraNotes = group.notes.length > 0 ? group.notes.map((n) => formatNoteText(n.name)).join("\n\n") : "";

  const taxesDisplay = line.tax_names && line.tax_names.length > 0 ? line.tax_names.join(", ") : "-";
  const discountDisplay = line.discount ? `${line.discount}%` : "-";

  return `
    <tbody class="line-block">
      <tr class="product-main-row">
        <td class="description-cell">
          <div class="product-title">${escapeHtml(title)}</div>
          ${description ? `<div class="product-description">${formatNoteText(description)}</div>` : ""}
          ${extraNotes ? `<div class="product-notes">${extraNotes}</div>` : ""}
        </td>
        <td class="qty-col text-center">${formatQty(line.product_qty)} ${escapeHtml(unitName)}</td>
        <td class="unit-col text-right">${formatCurrency(line.price_unit, currency)}</td>
        ${hasDiscount ? `<td class="unit-col text-right">${escapeHtml(discountDisplay)}</td>` : ""}
        ${hasTaxes ? `<td class="unit-col text-right">${escapeHtml(taxesDisplay)}</td>` : ""}
        <td class="amount-col text-right">${formatCurrency(line.price_subtotal, currency)}</td>
      </tr>
    </tbody>
  `;
}

function renderTerms(note?: string): string {
  if (!note || !stripHtml(note).trim()) {
    return "";
  }

  return `
    <section class="terms">
      ${sanitizeOdooHtml(note)}
    </section>
  `;
}

function getPartnerAddressLines(partner: OdooPartner | null): string[] {
  if (!partner) return [];

  const lines: string[] = [];

  if (partner.name) lines.push(partner.name);

  if (partner.street) lines.push(partner.street);
  if (partner.street2) lines.push(partner.street2);

  const cityLine = [partner.city, partner.state_id ? m2oName(partner.state_id) : "", partner.zip].filter(Boolean).join(" ");

  if (cityLine) lines.push(cityLine);

  if (partner.country_id) lines.push(m2oName(partner.country_id));

  if (lines.length <= 1 && partner.contact_address) {
    return partner.contact_address
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return lines;
}

function getUomName(line: OdooSaleOrderLine): string {
  if (line.product_uom_id && Array.isArray(line.product_uom_id)) {
    return line.product_uom_id[1];
  }
  return "Units";
}

function m2oName(value: OdooMany2One | undefined): string {
  return Array.isArray(value) ? value[1] : "";
}

function formatQty(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatCurrency(value: number, currency: OdooMany2One): string {
  const currencyName = m2oName(currency);

  let symbol = "$";

  // if (currencyName.toLowerCase().includes("idr")) {
  //   symbol = "Rp";
  // } else if (currencyName.toLowerCase().includes("usd")) {
  //   symbol = "$";
  // }
  switch (currencyName.toLowerCase()) {
    case "idr": {
      symbol = "Rp";
      break;
    }
    case "usd": {
      symbol = "$";
      break;
    }
    case "cny": {
      symbol = "¥";
      break;
    }
    case "myr": {
      symbol = "RM";
      break;
    }
    case "thb": {
      symbol = "฿";
      break;
    }
  }

  return `${symbol} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)}`;
}

function formatDate(value?: string): string {
  if (!value) return "";

  const dateOnly = value.slice(0, 10);
  const [year, month, day] = dateOnly.split("-");

  if (!year || !month || !day) return value;

  return `${day}/${month}/${year}`;
}

function formatNoteText(value: string): string {
  const escaped = escapeHtml(value || "");

  // Keeps Odoo note/spec text readable and close to the uploaded PDF.
  return escaped
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

function sanitizeOdooHtml(value: string): string {
  // Minimal sanitizer for trusted Odoo note HTML.
  // For public/user-entered HTML, use a real sanitizer like sanitize-html.
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "");
}
