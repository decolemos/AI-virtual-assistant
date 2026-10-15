import type { IncomingMessage, ServerResponse } from "node:http";

// Configuração pública do app web do Firebase (a mesma que o console mostra em
// "Configurações do projeto > Seus apps"). Não é segredo: o navegador precisa dela.
export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(process.env.FIREBASE_WEB_CONFIG ?? "{}");
}
