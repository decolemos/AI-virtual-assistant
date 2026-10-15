import type { IncomingMessage, ServerResponse } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { atenderChat } from "../functions/src/atender";
import { iniciarFirebase } from "./_firebase";

// Versão gratuita do cérebro, na Vercel. Mesma lógica do Firebase (functions/src).
export const config = { maxDuration: 60 };

type Pedido = IncomingMessage & { body?: unknown };

export default async function handler(req: Pedido, res: ServerResponse): Promise<void> {
  iniciarFirebase();
  const { status, json } = await atenderChat(
    { metodo: req.method ?? "", autorizacao: req.headers.authorization, corpo: req.body },
    {
      verificarToken: (token) => getAuth().verifyIdToken(token),
      db: getFirestore(),
      client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
      emailsPermitidos: process.env.EMAILS_PERMITIDOS ?? "",
      cidadePadrao: process.env.CIDADE_PADRAO || "São Paulo",
      registrarErro: (msg, erro) => console.error(msg, erro),
    },
  );
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(json));
}
