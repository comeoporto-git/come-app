/**
 * Ficheiro de transferências múltiplas para o Crédito Agrícola (CA Empresas →
 * Transferências → Ficheiro). Formato do template do banco: CSV separado por ";",
 * codificado em Windows-1252, linhas terminadas em CRLF, montante com vírgula decimal.
 */

export type BankTransferLine = {
  beneficiary: string;
  iban: string;
  type: "Transferência" | "Fornecedores";
  info: string;
  amount: number;
  email?: string;
};

const HEADER = [
  "Beneficiário*",
  "Conta/IBAN*",
  '"Tipo* (Nacionais: Transferência, Rendas, Ordenados, Fornecedores;   SEPA Internacionais: Fornecedores, Ordenados, Pensões Nacionais, Prestações da Segurança Social, Reembolsos, Reembolsos do Estado, Rendas, Transferência, Transferência Comercial Transnacional, Transferência de Emigrante Transnacional, Transferência de Pensões Transnacional)"',
  "Informação complementar",
  "Montante* (utilize (,) para separação das casas decimais)",
  "Email de Notificação",
].join(";");

/** Remove o separador, aspas e quebras de linha que partiriam o CSV. */
function cleanField(value: string, maxLength: number) {
  return value.replace(/[;"\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function normalizeIban(iban: string) {
  return iban.replace(/\s+/g, "").toUpperCase();
}

export function buildBankTransferCsv(lines: BankTransferLine[]) {
  const rows = lines.map((l) =>
    [
      cleanField(l.beneficiary, 70),
      normalizeIban(l.iban),
      l.type,
      // Referência SEPA: só caracteres seguros, curta
      cleanField(l.info.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 /\-?:().,'+]/g, ""), 35),
      l.amount.toFixed(2).replace(".", ","),
      cleanField(l.email ?? "", 100),
    ].join(";"),
  );
  return [HEADER, ...rows].join("\r\n") + "\r\n";
}

// Windows-1252: 0x80–0x9F têm caracteres próprios; o resto coincide com Latin-1.
const CP1252_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88,
  "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93,
  "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
  "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

export function encodeWindows1252(text: string) {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) bytes.push(code);
    else if (CP1252_EXTRA[ch] !== undefined) bytes.push(CP1252_EXTRA[ch]);
    else {
      // Fora do Windows-1252: tenta sem acentos, senão descarta
      for (const base of ch.normalize("NFD").replace(/[̀-ͯ]/g, "")) {
        const c = base.codePointAt(0)!;
        if (c < 0x80) bytes.push(c);
      }
    }
  }
  return new Uint8Array(bytes);
}
