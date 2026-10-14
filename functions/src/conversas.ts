import type Anthropic from "@anthropic-ai/sdk";
import type { DocumentReference, Firestore, FieldValue } from "firebase-admin/firestore";

// Um documento do Firestore aceita até 1 MB. Passando deste tamanho, ou de muitas
// mensagens, começamos uma conversa nova em vez de cortar a antiga: editar o
// histórico invalidaria o raciocínio que o modelo já guardou nele.
const LIMITE_CARACTERES = 600_000;
const LIMITE_MENSAGENS = 120;

export interface Conversa {
  ref: DocumentReference;
  historico: Anthropic.MessageParam[];
}

export function cabeNoLimite(historicoJson: string, totalMensagens: number): boolean {
  return historicoJson.length < LIMITE_CARACTERES && totalMensagens < LIMITE_MENSAGENS;
}

export async function carregarConversa(
  db: Firestore,
  uid: string,
  conversaId?: string,
): Promise<Conversa> {
  const colecao = db.collection("usuarios").doc(uid).collection("conversas");
  if (conversaId && /^[A-Za-z0-9]{1,40}$/.test(conversaId)) {
    const snap = await colecao.doc(conversaId).get();
    const json = snap.get("historico");
    if (typeof json === "string") {
      const historico = JSON.parse(json) as Anthropic.MessageParam[];
      if (cabeNoLimite(json, historico.length)) {
        return { ref: snap.ref, historico };
      }
    }
  }
  return { ref: colecao.doc(), historico: [] };
}

export async function salvarConversa(
  ref: DocumentReference,
  historico: Anthropic.MessageParam[],
  agora: FieldValue,
): Promise<void> {
  // Guardado como texto JSON: os blocos da API têm campos que o Firestore não
  // aceita direto (valores undefined, listas dentro de listas).
  await ref.set({ historico: JSON.stringify(historico), atualizadoEm: agora });
}
