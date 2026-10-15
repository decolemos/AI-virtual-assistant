import Anthropic from "@anthropic-ai/sdk";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { responder } from "./brain";
import { carregarConversa, salvarConversa } from "./conversas";

// Lógica do endpoint /api/chat, igual no Firebase e na Vercel. Cada plataforma
// só traduz o pedido HTTP para cá e devolve o status e o JSON.
export interface Pedido {
  metodo: string;
  autorizacao?: string;
  corpo: unknown;
}

export interface Dependencias {
  verificarToken: (token: string) => Promise<{ uid: string; email?: string }>;
  db: Firestore;
  client: Pick<Anthropic, "messages">;
  emailsPermitidos: string;
  cidadePadrao: string;
  registrarErro?: (mensagem: string, erro: unknown) => void;
}

export interface Resposta {
  status: number;
  json: Record<string, unknown>;
}

export function emailPermitido(email: string | undefined, lista: string): boolean {
  const permitidos = lista
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && permitidos.includes(email.toLowerCase());
}

export async function atenderChat(pedido: Pedido, dep: Dependencias): Promise<Resposta> {
  if (pedido.metodo !== "POST") return { status: 405, json: { erro: "Use POST." } };

  const token = pedido.autorizacao?.replace(/^Bearer /, "");
  if (!token) return { status: 401, json: { erro: "Faça login." } };

  let uid: string;
  try {
    const usuario = await dep.verificarToken(token);
    if (!emailPermitido(usuario.email, dep.emailsPermitidos)) {
      return { status: 403, json: { erro: "Este e-mail não tem acesso ao Jarvis." } };
    }
    uid = usuario.uid;
  } catch {
    return { status: 401, json: { erro: "Login inválido ou expirado." } };
  }

  const corpo = (pedido.corpo ?? {}) as { texto?: unknown; conversaId?: unknown };
  const texto = typeof corpo.texto === "string" ? corpo.texto.trim() : "";
  if (!texto || texto.length > 2000) {
    return { status: 400, json: { erro: "Envie um texto de 1 a 2000 caracteres." } };
  }
  const conversaId = typeof corpo.conversaId === "string" ? corpo.conversaId : undefined;

  try {
    const conversa = await carregarConversa(dep.db, uid, conversaId);
    const { resposta, historico } = await responder(dep.client, conversa.historico, texto, {
      agora: new Date(),
      cidadePadrao: dep.cidadePadrao,
      fusoHorario: "America/Sao_Paulo",
    });
    await salvarConversa(conversa.ref, historico, FieldValue.serverTimestamp());
    return { status: 200, json: { resposta, conversaId: conversa.ref.id } };
  } catch (erro) {
    dep.registrarErro?.("Falha ao responder", erro);
    if (erro instanceof Anthropic.RateLimitError) {
      return { status: 429, json: { erro: "Muitos pedidos seguidos. Tente de novo em instantes." } };
    }
    if (erro instanceof Anthropic.AuthenticationError) {
      return { status: 500, json: { erro: "A chave da API do Claude é inválida." } };
    }
    return { status: 500, json: { erro: "Não consegui responder agora." } };
  }
}
