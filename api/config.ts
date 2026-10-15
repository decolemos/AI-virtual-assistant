import type { IncomingMessage, ServerResponse } from "node:http";

// Configuração pública do app web do Firebase (a mesma que o console mostra em
// "Configurações do projeto > Seus apps"). Não é segredo: o navegador precisa dela.
// Aceita JSON ou o trecho { apiKey: "...", ... } copiado direto do console.
export function lerConfigWeb(texto: string | undefined): Record<string, string> {
  if (!texto) return {};
  const json = texto
    .trim()
    .replace(/;\s*$/, "")
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/,\s*}/g, "}");
  return JSON.parse(json);
}

export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    res.end(JSON.stringify(lerConfigWeb(process.env.FIREBASE_WEB_CONFIG)));
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ erro: "FIREBASE_WEB_CONFIG inválida." }));
  }
}
