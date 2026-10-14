import Anthropic from "@anthropic-ai/sdk";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { responder } from "./brain";
import { carregarConversa, salvarConversa } from "./conversas";

initializeApp();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
// E-mails (separados por vírgula) que podem usar o Jarvis. Ninguém mais gasta sua chave.
const EMAILS_PERMITIDOS = defineString("EMAILS_PERMITIDOS");
const CIDADE_PADRAO = defineString("CIDADE_PADRAO", { default: "São Paulo" });

export const chat = onRequest(
  {
    region: "southamerica-east1",
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 120,
    maxInstances: 2,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ erro: "Use POST." });
      return;
    }

    const token = req.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) {
      res.status(401).json({ erro: "Faça login." });
      return;
    }
    let uid: string;
    try {
      const usuario = await getAuth().verifyIdToken(token);
      const permitidos = EMAILS_PERMITIDOS.value()
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      if (!usuario.email || !permitidos.includes(usuario.email.toLowerCase())) {
        res.status(403).json({ erro: "Este e-mail não tem acesso ao Jarvis." });
        return;
      }
      uid = usuario.uid;
    } catch {
      res.status(401).json({ erro: "Login inválido ou expirado." });
      return;
    }

    const texto = typeof req.body?.texto === "string" ? req.body.texto.trim() : "";
    if (!texto || texto.length > 2000) {
      res.status(400).json({ erro: "Envie um texto de 1 a 2000 caracteres." });
      return;
    }
    const conversaId = typeof req.body?.conversaId === "string" ? req.body.conversaId : undefined;

    const db = getFirestore();
    const conversa = await carregarConversa(db, uid, conversaId);
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

    try {
      const { resposta, historico } = await responder(client, conversa.historico, texto, {
        agora: new Date(),
        cidadePadrao: CIDADE_PADRAO.value(),
        fusoHorario: "America/Sao_Paulo",
      });
      await salvarConversa(conversa.ref, historico, FieldValue.serverTimestamp());
      res.json({ resposta, conversaId: conversa.ref.id });
    } catch (erro) {
      logger.error("Falha ao responder", erro);
      if (erro instanceof Anthropic.RateLimitError) {
        res.status(429).json({ erro: "Muitos pedidos seguidos. Tente de novo em instantes." });
      } else if (erro instanceof Anthropic.AuthenticationError) {
        res.status(500).json({ erro: "A chave da API do Claude é inválida." });
      } else {
        res.status(500).json({ erro: "Não consegui responder agora." });
      }
    }
  },
);
