// import { execute, authenticate } from "../odoo/odooRpc";
import { UserSales, DailyReport } from "../types/odoo.type";
import {
  SaleOrderData,
  InvoiceData,
  DocumentLineGroup,
  OdooDocumentLine,
  OdooPartner,
  OdooCompany,
  OdooSaleOrder,
  OdooSaleOrderLine,
  OdooInvoice,
  OdooInvoiceLine,
  PurchaseOrderData,
  OdooPurchaseOrder,
  OdooPurchaseOrderLine,
} from "../types/document.type";

import fetch from "node-fetch";
import { JsonRpcResponse } from "../types/odoo.type";
import { ENV } from "../config/config";
import { getMailSent } from "../utils/main.util";
import { append7DaysDynamic } from "../utils/integration.util";

type ReportsResult = {
  dailyMail: DailyReport[];
  emailSentValues: number[];
};

export async function authenticate(): Promise<number> {
  try {
    return jsonRpc<number>({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "common",
        method: "authenticate",
        args: [ENV.DB, ENV.USER, ENV.API_KEY, {}],
      },
      id: 1,
    });
  } catch (error) {
    console.error("Startup job failed:", error);
    throw error;
  }
}

// export async function startupFunction(): Promise<Number> {
//   try {
//     const uid = await authenticate();

//     // Ensure the result is actually a number
//     const numericUid = Number(uid);

//     if (isNaN(numericUid)) {
//       throw new Error("Authentication returned an invalid UID");
//     }

//     console.log(`Odoo API authenticate success. UID: ${numericUid}`);
//     return numericUid;
//   } catch (error) {
//     console.error("Startup job failed:", error);
//     throw error;
//   }
// }

export async function jsonRpc<T>(payload: object): Promise<T> {
  const res = await fetch(ENV.ODOO_URL as string, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data: JsonRpcResponse<T> = await res.json();
  // console.log(data);

  if (data.error) {
    throw new Error(JSON.stringify(data.error, null, 2));
  }

  return data.result as T;
}

export async function execute<T>(uid: number, model: string, method: string, args: any[] = [], kwargs: object = {}): Promise<T> {
  return jsonRpc<T>({
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [ENV.DB, uid, ENV.API_KEY, model, method, args, kwargs],
    },
    id: 2,
  });
}

export async function getUserTag(userInput: string): Promise<string | null> {
  const uid = await authenticate();

  const users = await execute<UserSales[]>(uid, "x_sales_daily_report", "search_read", [[]], { fields: ["x_studio_salesperson_name"] });

  const found = users.find((u) => u.x_studio_salesperson_name.toLowerCase() === userInput.toLowerCase());

  return found ? found.x_studio_salesperson_name : null;
}

export async function getReports(uid: number, dates: string[], user: string | null): Promise<ReportsResult> {
  const dailyMail = await execute<DailyReport[]>(
    uid,
    "x_sales_daily_report",
    "search_read",
    [
      [
        ["x_studio_report_date", "in", dates],
        ["x_studio_salesperson_name", "in", [user]],
      ],
    ],
    {
      fields: ["x_studio_report_date", "x_studio_email_sent_today"],
      order: "x_studio_report_date asc",
    },
  );

  const emailSentValues = getMailSent(dates, dailyMail);

  return {
    dailyMail,
    emailSentValues,
  };
}

export async function writeSpreadsheet(dates: string[], emailSentVal: number[], user: string) {
  try {
    append7DaysDynamic({
      spreadsheetId: "1-Yc3f7pHDobz2JwebwuRkpaGwfulW0jrtPnG3-EuB20",
      namedRange: `${user?.toLocaleLowerCase()}_3w_apr_data`,
      data: emailSentVal,
    });
  } catch (error) {}
}

/**
 * @param uid - uid odoo from API authentication
 * @param saleOderId - document id for sales order or quotation in Odoo
 * @returns The final discounted price rounded to the nearest cent.
 */
export async function getSaleOrderQuoteData(uid: number, saleOrderId: number): Promise<SaleOrderData> {
  const orders = await execute<OdooSaleOrder[]>(uid, "sale.order", "read", [[saleOrderId]], {
    fields: ["id", "name", "state", "date_order", "validity_date", "partner_id", "company_id", "currency_id", "user_id", "amount_untaxed", "amount_tax", "amount_total", "order_line", "note", "payment_term_id", "incoterm"],
  });

  //extract one to validate the existence of the record
  const order = orders[0];
  if (!order) {
    throw new Error(`Sales Order with ID ${saleOrderId} was not found`);
  }

  //extract many2one fields in the odoo (partner and company fields, e.g [42, "john doe"])
  const partnerId = Array.isArray(order.partner_id) ? order.partner_id[0] : null;
  const companyId = Array.isArray(order.company_id) ? order.company_id[0] : null;

  const partner = partnerId
    ? ((
        await execute<OdooPartner[]>(uid, "res.partner", "read", [[partnerId]], {
          fields: ["id", "name", "street", "street2", "city", "zip", "state_id", "country_id", "contact_address", "vat"],
        })
      )[0] ?? null)
    : null;

  const company = companyId
    ? ((
        await execute<OdooCompany[]>(uid, "res.company", "read", [[companyId]], {
          fields: ["id", "name", "street", "street2", "city", "zip", "country_id", "phone", "email", "website", "vat", "logo"],
        })
      )[0] ?? null)
    : null;

  const lines = await execute<OdooSaleOrderLine[]>(uid, "sale.order.line", "read", [order.order_line], {
    fields: ["id", "sequence", "display_type", "name", "product_id", "product_uom_qty", "product_uom_id", "price_unit", "discount", "price_subtotal", "price_total"],
  });

  const allTaxIds = Array.from(new Set(lines.flatMap((line) => line.tax_id || [])));
  let taxMap = new Map<number, string>();
  if (allTaxIds.length > 0) {
    const taxes = await execute<{ id: number; name: string }[]>(uid, "account.tax", "read", [allTaxIds], {
      fields: ["id", "name"],
    });
    taxes.forEach((t) => taxMap.set(t.id, t.name));
  }

  for (const line of lines) {
    if (line.tax_id && Array.isArray(line.tax_id)) {
      // For sale order, the field is named tax_id in standard Odoo but is a many2many
      line.tax_ids = line.tax_id as any;
      line.tax_names = (line.tax_ids?.map((id) => taxMap.get(id)).filter(Boolean) ?? []) as string[];
    } else {
      line.tax_names = [];
    }
  }

  //sort product order to be the same with the visual in Odoo
  lines.sort((a, b) => a.sequence - b.sequence || a.id - b.id);

  const groupedLines: DocumentLineGroup<OdooSaleOrderLine>[] = groupProductLinesWithNotes(lines);

  return {
    document: order,
    partner,
    company,
    lines,
    groupedLines,
  };
}

export async function getInvoiceData(uid: number, dataId: number): Promise<InvoiceData> {
  const invoices = await execute<OdooInvoice[]>(uid, "account.move", "read", [[dataId]], {
    fields: [
      "id",
      "name",
      "state",
      "move_type",
      "payment_state",
      "invoice_date",
      "invoice_date_due",
      "partner_id",
      "company_id",
      "currency_id",
      "invoice_user_id",
      "amount_untaxed",
      "amount_tax",
      "amount_total",
      "invoice_line_ids",
      "invoice_payment_term_id",
      "invoice_incoterm_id",
      "invoice_origin",
      "ref",
      "narration",
    ],
  });

  const invoice = invoices[0];

  if (!invoice) {
    throw new Error(`Invoice with ID ${dataId} was not found`);
  }

  const partnerId = Array.isArray(invoice.partner_id) ? invoice.partner_id[0] : null;
  const companyId = Array.isArray(invoice.company_id) ? invoice.company_id[0] : null;

  const partner = partnerId
    ? ((
        await execute<OdooPartner[]>(uid, "res.partner", "read", [[partnerId]], {
          fields: ["id", "name", "street", "street2", "city", "zip", "state_id", "country_id", "contact_address", "vat"],
        })
      )[0] ?? null)
    : null;

  const company = companyId
    ? ((
        await execute<OdooCompany[]>(uid, "res.company", "read", [[companyId]], {
          fields: ["id", "name", "street", "street2", "city", "zip", "country_id", "phone", "email", "website", "vat", "logo"],
        })
      )[0] ?? null)
    : null;

  const lines = await execute<OdooInvoiceLine[]>(uid, "account.move.line", "read", [invoice.invoice_line_ids], {
    fields: ["id", "sequence", "display_type", "name", "product_id", "quantity", "product_uom_id", "price_unit", "discount", "price_subtotal", "price_total", "tax_ids"],
  });

  const allTaxIdsInvoice = Array.from(new Set(lines.flatMap((line) => line.tax_ids || [])));
  let taxMapInvoice = new Map<number, string>();
  if (allTaxIdsInvoice.length > 0) {
    const taxes = await execute<{ id: number; name: string }[]>(uid, "account.tax", "read", [allTaxIdsInvoice], {
      fields: ["id", "name"],
    });
    taxes.forEach((t) => taxMapInvoice.set(t.id, t.name));
  }

  for (const line of lines) {
    if (line.tax_ids && Array.isArray(line.tax_ids)) {
      line.tax_names = line.tax_ids.map((id) => taxMapInvoice.get(id)).filter(Boolean) as string[];
    } else {
      line.tax_names = [];
    }
  }

  lines.sort((a, b) => a.sequence - b.sequence || a.id - b.id);

  const groupedLines: DocumentLineGroup<OdooInvoiceLine>[] = groupProductLinesWithNotes(lines);

  return {
    document: invoice,
    partner,
    company,
    lines,
    groupedLines,
  };
}

export async function getPurchaseOrder(uid: number, dataId: number): Promise<PurchaseOrderData> {
  const purchases = await execute<OdooPurchaseOrder[]>(uid, "purchase.order", "read", [[dataId]], {
    fields: [
      "id",
      "name",
      "state",
      "invoice_status",
      "date_order",
      "date_planned",
      "partner_id",
      "company_id",
      "currency_id",
      "user_id",
      "amount_untaxed",
      "amount_tax",
      "amount_total",
      "order_line",
      "payment_term_id",
      "incoterm_id",
      "origin",
    ],
  });

  const purchase = purchases[0];

  if (!purchase) {
    throw new Error(`Purchase Order with ID ${dataId} was not found`);
  }

  const partnerId = Array.isArray(purchase.partner_id) ? purchase.partner_id[0] : null;
  const companyId = Array.isArray(purchase.company_id) ? purchase.company_id[0] : null;

  const partner = partnerId
    ? ((
        await execute<OdooPartner[]>(uid, "res.partner", "read", [[partnerId]], {
          fields: ["id", "name", "street", "street2", "city", "zip", "state_id", "country_id", "contact_address", "vat"],
        })
      )[0] ?? null)
    : null;

  const company = companyId
    ? ((
        await execute<OdooCompany[]>(uid, "res.company", "read", [[companyId]], {
          fields: ["id", "name", "street", "street2", "city", "zip", "country_id", "phone", "email", "website", "vat", "logo"],
        })
      )[0] ?? null)
    : null;

  const lines = await execute<OdooPurchaseOrderLine[]>(uid, "purchase.order.line", "read", [purchase.order_line], {
    fields: ["id", "sequence", "display_type", "name", "product_id", "product_qty", "product_uom_id", "price_unit", "price_subtotal", "price_total", "tax_ids", "discount"],
    // 'discount' does not exist on purchase.order.line by default in standard Odoo unless a specific module is installed.
  });

  const allTaxIds = Array.from(new Set(lines.flatMap((line) => line.tax_ids || [])));
  let taxMap = new Map<number, string>();
  if (allTaxIds.length > 0) {
    const taxes = await execute<{ id: number; name: string }[]>(uid, "account.tax", "read", [allTaxIds], {
      fields: ["id", "name"],
    });
    taxes.forEach((t) => taxMap.set(t.id, t.name));
  }

  for (const line of lines) {
    if (line.tax_ids && Array.isArray(line.tax_ids)) {
      line.tax_names = line.tax_ids.map((id) => taxMap.get(id)).filter(Boolean) as string[];
    } else {
      line.tax_names = [];
    }
  }

  lines.sort((a, b) => a.sequence - b.sequence || a.id - b.id);

  const groupedLines: DocumentLineGroup<OdooPurchaseOrderLine>[] = groupProductLinesWithNotes(lines);

  return {
    document: purchase,
    partner,
    company,
    lines,
    groupedLines,
  };
}

function groupProductLinesWithNotes<T extends OdooDocumentLine>(lines: T[]): DocumentLineGroup<T>[] {
  const groupedLines: DocumentLineGroup<T>[] = [];

  for (const line of lines) {
    // ── 1. Section header ──────────────────────────────────────────────────
    if (line.display_type === "line_section") {
      groupedLines.push({
        type: "section",
        title: line.name,
      });
      continue;
    }

    // ── 2. Explicit Odoo note line ─────────────────────────────────────────
    if (line.display_type === "line_note") {
      const previousGroup = groupedLines[groupedLines.length - 1];

      if (previousGroup?.type === "product") {
        (previousGroup as Extract<DocumentLineGroup<T>, { type: "product" }>).notes.push(line);
      } else {
        groupedLines.push({
          type: "section",
          title: line.name,
        });
      }

      continue;
    }

    // ── 3. Description-only lines (display_type: false, no product, zero qty/price) ──
    //
    // Odoo sometimes stores italic sub-description lines (e.g. "Part Number: …")
    // as regular display_type: false lines instead of line_note when the user types
    // a description-only row directly into the invoice. These must NOT get their own
    // table row — they should render inside the preceding product row's description
    // cell (as .product-notes).
    //
    // Detection criteria (all must be true):
    //   • display_type is false  (plain line, not section/note)
    //   • no product_id attached  (pure text, not a real product)
    //   • quantity === 0 and price_unit === 0  (no monetary value)
    const asAny = line as any;
    const isDescriptionOnly =
      !asAny.product_id &&
      (asAny.quantity ?? 0) === 0 &&
      (asAny.price_unit ?? 0) === 0;

    if (isDescriptionOnly) {
      const previousGroup = groupedLines[groupedLines.length - 1];
      if (previousGroup?.type === "product") {
        (previousGroup as Extract<DocumentLineGroup<T>, { type: "product" }>).notes.push(line);
      }
      // If there is no preceding product group, silently skip — a description
      // line at the very top of the list has no parent to attach to.
      continue;
    }

    // ── 4. Normal product / service line ──────────────────────────────────
    groupedLines.push({
      type: "product",
      line,
      notes: [],
    });
  }

  return groupedLines;
}
