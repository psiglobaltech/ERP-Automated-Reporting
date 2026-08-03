import { Request, Response, NextFunction } from "express";
import { getCachedUid } from "../services/authServices";
import { getSaleOrderQuoteData, getInvoiceData, getPurchaseOrder } from "../services/odooServices";
import { generateInvoicePdf, generatePurchasePdf, generateSaleOrderPdf } from "../services/quotePdfService";

type docTypes = "draft" | "invoice" | "sale" | "purchase-order";
export async function downloadSaleOrderQuotePdf(req: Request, res: Response, next: NextFunction) {
  try {
    const docId = Number(req.params.docId);
    const rawDocType = req.params.docChoice as string;

    if (rawDocType !== "draft" && rawDocType !== "invoice" && rawDocType !== "sale" && rawDocType !== "purchase-order") {
      return res.status(400).json({ error: "Invalid document type requested" });
    }

    const docType: docTypes = rawDocType;

    if (!Number.isInteger(docId) || docId <= 0) {
      res.status(400).json({
        error: "Invalid Sales Order ID",
      });
      return;
    }

    /**
     * Optional shared-secret security.
     * Better long-term option: protect this route with your own login/session.
     */
    const expectedSecret = process.env.ODOO_PDF_SECRET;

    if (expectedSecret) {
      const incomingSecret = req.query.secret;

      if (incomingSecret !== expectedSecret) {
        res.status(401).json({
          error: "Unauthorized",
        });
        return;
      }
    }

    const documentHandler: Record<docTypes, (uid: number, dataId: number) => Promise<{ pdf: Buffer; filename: string }>> = {
      draft: async (uid, dataId) => {
        const quoteData = await getSaleOrderQuoteData(uid, dataId);
        const isSale = false;
        const pdfData = {
          document: quoteData.document,
          partner: quoteData.partner,
          company: quoteData.company,
          lines: quoteData.lines,
          groupedLines: quoteData.groupedLines,
        };
        const pdf = await generateSaleOrderPdf(pdfData, isSale);
        const filename = `Quotation-${safeFilename(quoteData.document.name)}.pdf`;

        return { pdf, filename };
      },
      invoice: async (uid, dataId) => {
        const quoteData = await getInvoiceData(uid, dataId);
        const isSale = false;
        const pdfData = {
          document: quoteData.document,
          partner: quoteData.partner,
          company: quoteData.company,
          lines: quoteData.lines,
          groupedLines: quoteData.groupedLines,
        };
        const pdf = await generateInvoicePdf(pdfData);
        const filename = `Invoice-${safeFilename(quoteData.document.name)}.pdf`;
        return { pdf, filename };
      },
      sale: async (uid, dataId) => {
        const quoteData = await getSaleOrderQuoteData(uid, dataId);
        const isSale = true;
        const pdfData = {
          document: quoteData.document,
          partner: quoteData.partner,
          company: quoteData.company,
          lines: quoteData.lines,
          groupedLines: quoteData.groupedLines,
        };
        const pdf = await generateSaleOrderPdf(pdfData, isSale);
        const filename = `Sale Order-${safeFilename(quoteData.document.name)}.pdf`;
        return { pdf, filename };
      },
      "purchase-order": async (uid, dataId) => {
        const quoteData = await getPurchaseOrder(uid, dataId);
        const pdfData = {
          document: quoteData.document,
          partner: quoteData.partner,
          company: quoteData.company,
          lines: quoteData.lines,
          groupedLines: quoteData.groupedLines,
        };
        const pdf = await generatePurchasePdf(pdfData);
        const filename = `Purchase Order-${safeFilename(quoteData.document.name)}.pdf`;
        return { pdf, filename };
      },
    };

    res.setHeader("Content-Type", "application/pdf");
    const uid = await getCachedUid();
    const docData = await documentHandler[docType](uid, docId);
    /**
     * attachment = force download
     * inline = open in browser PDF viewer
     */
    res.setHeader("Content-Disposition", `attachment; filename="${docData.filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(docData.pdf);
  } catch (error) {
    next(error);
  }
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
