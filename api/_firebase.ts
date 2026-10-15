import { cert, getApps, initializeApp } from "firebase-admin/app";

// Na Vercel não há credencial automática do Google: usamos a chave da conta de
// serviço do Firebase, guardada na variável FIREBASE_SERVICE_ACCOUNT (o JSON inteiro).
export function iniciarFirebase(): void {
  if (getApps().length) return;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) throw new Error("Falta a variável FIREBASE_SERVICE_ACCOUNT.");
  initializeApp({ credential: cert(JSON.parse(json)) });
}
