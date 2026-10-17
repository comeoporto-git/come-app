import { analyzeInvoice } from "@/actions/invoice";
import { normalizeImage } from "@/lib/image";

export type ScannedInvoice = {
  date: string | null; // ISO yyyy-mm-dd, null when unreadable
  invoiceId: string;
  base6: number;
  base13: number;
  base23: number;
  taxFree: number;
  iva6: number;
  iva13: number;
  iva23: number;
  totalCost: number;
};

export type InvoiceScanResult = {
  /** File to upload: normalized JPEG/PNG for images, the original for PDFs */
  file: File;
  /** "pdf" for PDFs, otherwise a data URL for the image preview */
  preview: string;
  /** Extracted values, or null when the scan failed */
  data: ScannedInvoice | null;
  error: string;
};

const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

/** Prepares an attached sales invoice for upload and extracts its values with AI. */
export async function scanInvoiceFile(file: File): Promise<InvoiceScanResult> {
  let base64: string;
  let mediaType: Parameters<typeof analyzeInvoice>[1];
  let uploadFile = file;
  let preview: string;

  if (file.type === "application/pdf") {
    base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve((ev.target?.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    mediaType = "application/pdf";
    preview = "pdf";
  } else {
    try {
      const normalized = await normalizeImage(file);
      base64 = normalized.base64;
      mediaType = normalized.mediaType;
      uploadFile = normalized.normalizedFile;
      preview = normalized.dataUrl;
    } catch (err) {
      console.error("[scanInvoiceFile] image processing error:", err);
      return {
        file,
        preview: "",
        data: null,
        error: "Não foi possível processar a imagem. Preenche os valores manualmente.",
      };
    }
  }

  try {
    const result = await analyzeInvoice(base64, mediaType);
    const base6 = r2(result.base6), base13 = r2(result.base13), base23 = r2(result.base23);
    const iva6  = r2(result.iva6),  iva13  = r2(result.iva13),  iva23  = r2(result.iva23);
    const taxFree = r2(base6 + base13 + base23);
    return {
      file: uploadFile,
      preview,
      data: {
        date: /^\d{4}-\d{2}-\d{2}$/.test(result.date ?? "") ? result.date : null,
        invoiceId: result.invoiceId?.trim() ?? "",
        base6, base13, base23, taxFree,
        iva6, iva13, iva23,
        totalCost: r2(result.totalCost) || r2(taxFree + iva6 + iva13 + iva23),
      },
      error: "",
    };
  } catch (err) {
    console.error("[scanInvoiceFile] AI scan error:", err);
    return {
      file: uploadFile,
      preview,
      data: null,
      error: "Erro ao analisar a fatura. Preenche os valores manualmente.",
    };
  }
}
