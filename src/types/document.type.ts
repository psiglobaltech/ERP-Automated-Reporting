export type OdooMany2One = [number, string] | false;

export type OdooPartner = {
  id: number;
  name: string;
  street?: string;
  street2?: string;
  city?: string;
  zip?: string;
  state_id?: OdooMany2One;
  country_id?: OdooMany2One;
  contact_address?: string;
  vat?: string;
};

export type OdooCompany = {
  id: number;
  name: string;
  street?: string;
  street2?: string;
  city?: string;
  zip?: string;
  country_id?: OdooMany2One;
  phone?: string;
  email?: string;
  website?: string;
  vat?: string;
  logo?: string;
};

export interface OdooDocument {
  id: number;
  name: string;

  partner_id: OdooMany2One;
  company_id: OdooMany2One;
  currency_id: OdooMany2One;

  amount_untaxed: number;
  amount_tax: number;
  amount_total: number;
}

export interface OdooDocumentLine {
  id: number;
  sequence: number;

  display_type: false | "line_section" | "line_note";

  name: string;
}

export type OdooSaleOrder = OdooDocument & {
  state: string;
  date_order: string;
  validity_date?: string;

  user_id: OdooMany2One;

  order_line: number[];
  incoterm?: OdooMany2One;

  note?: string;

  payment_term_id?: OdooMany2One;
};

export type OdooInvoice = OdooDocument & {
  state: string;

  move_type: string;

  payment_state: string;

  invoice_date?: string;

  invoice_date_due?: string;

  invoice_user_id: OdooMany2One;

  invoice_line_ids: number[];

  invoice_payment_term_id?: OdooMany2One;

  invoice_incoterm_id?: OdooMany2One;

  narration?: string;

  invoice_origin?: string;

  ref?: string;
};

export type OdooPurchaseOrder = OdooDocument & {
  state: string;

  date_order: string;

  partner_ref?: string;
  date_planned?: string;

  user_id: OdooMany2One;

  order_line: number[];

  notes?: string;
};

export type OdooInvoiceLine = OdooDocumentLine & {
  product_id: OdooMany2One;

  quantity: number;

  product_uom_id?: OdooMany2One;

  price_unit: number;

  discount: number;

  price_subtotal: number;

  price_total: number;

  tax_ids?: number[];

  tax_names?: string[];
};

export type OdooPurchaseOrderLine = OdooDocumentLine & {
  product_id: OdooMany2One;

  product_qty: number;

  product_uom?: OdooMany2One;

  price_unit: number;

  price_subtotal: number;

  tax_ids?: number[];

  tax_names?: string[];

  discount: number;
};

export type DocumentLineGroup<T extends OdooDocumentLine> =
  | {
      type: "section";
      title: string;
    }
  | {
      type: "product";
      line: T;
      notes: T[];
    };

export type DocumentData<TDocument, TLine extends OdooDocumentLine> = {
  document: TDocument;

  partner: OdooPartner | null;

  company: OdooCompany | null;

  lines: TLine[];

  groupedLines: DocumentLineGroup<TLine>[];
};

export type OdooSaleOrderLine = {
  id: number;
  sequence: number;
  display_type: false | "line_section" | "line_note";
  name: string;
  product_id: OdooMany2One;
  product_uom_qty: number;
  product_uom?: OdooMany2One;
  product_uom_id?: OdooMany2One;
  price_unit: number;
  discount: number;
  price_subtotal: number;
  price_total: number;
  tax_id?: number[];
  tax_ids?: number[];
  tax_names?: string[];
};

export type SaleOrderData = DocumentData<OdooSaleOrder, OdooSaleOrderLine>;
export type InvoiceData = DocumentData<OdooInvoice, OdooInvoiceLine>;
export type PurchaseOrderData = DocumentData<OdooPurchaseOrder, OdooPurchaseOrderLine>;
