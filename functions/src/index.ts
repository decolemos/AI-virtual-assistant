import Anthropic from "@anthropic-ai/sdk";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { atenderChat } from "./atender";

// Versão para o Firebase Cloud Functions (precisa do plano Blaze).
// A versão gratuita na Vercel fica em /api/chat.ts, na raiz do repositório.
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
    const { status, json } = await atenderChat(
      { metodo: req.method, autorizacao: req.get("Authorization"), corpo: req.body },
      {
        verificarToken: (token) => getAuth().verifyIdToken(token),
        db: getFirestore(),
        client: new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() }),
        emailsPermitidos: EMAILS_PERMITIDOS.value(),
        cidadePadrao: CIDADE_PADRAO.value(),
        registrarErro: (msg, erro) => logger.error(msg, erro),
      },
    );
    res.status(status).json(json);
  },
);
