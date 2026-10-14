import type Anthropic from "@anthropic-ai/sdk";
import { climaTool, consultarClima } from "./tools/clima";

export const MODELO = "claude-haiku-5-5";

// O prompt de sistema e a lista de ferramentas ficam fixos entre pedidos:
// mudar qualquer um deles invalida o cache e o raciocínio já guardado no histórico.
// O que muda a cada pedido (data, hora, cidade) vai na mensagem do usuário.
export const SISTEMA = `Você é o Jarvis, assistente pessoal de voz do André. Responda sempre em português do Brasil.

Suas respostas serão lidas em voz alta, então:
- Seja breve e natural, como numa conversa falada: de uma a três frases, salvo quando pedirem detalhes.
- Não use markdown, listas, emojis, links ou tabelas.
- Escreva números e horários do jeito que se fala ("15 horas", "28 graus").

Ferramentas:
- Use consultar_clima para tempo, temperatura e chuva. Sem cidade dita, use a cidade padrão do contexto.
- Use a busca na web para notícias, cotações, resultados e fatos recentes. Diga a resposta, não as fontes.

Briefing do dia: quando o André disser "bom dia" ou pedir o resumo do dia, consulte o clima da cidade padrão e busque as três principais notícias do Brasil de hoje. Responda com uma saudação curta, o clima de hoje e as manchetes em uma frase cada.

Agenda, lembretes, e-mail e música ainda não estão ligados. Se pedirem, diga que essas funções chegam na próxima fase.`;

export const FERRAMENTAS: Anthropic.Messages.ToolUnion[] = [
  climaTool,
  {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 3,
    user_location: { type: "approximate", country: "BR", timezone: "America/Sao_Paulo" },
  },
];

const MAX_VOLTAS = 8;

export interface Contexto {
  agora: Date;
  cidadePadrao: string;
  fusoHorario: string;
}

export type ExecutarFerramenta = (nome: string, entrada: unknown) => Promise<string>;

export const executarFerramentaPadrao: ExecutarFerramenta = async (nome, entrada) => {
  if (nome === "consultar_clima") {
    const { cidade } = entrada as { cidade?: unknown };
    if (typeof cidade !== "string" || cidade.trim() === "") {
      throw new Error("cidade ausente");
    }
    return consultarClima(cidade);
  }
  throw new Error(`ferramenta desconhecida: ${nome}`);
};

export function linhaDeContexto(ctx: Contexto): string {
  const quando = ctx.agora.toLocaleString("pt-BR", {
    timeZone: ctx.fusoHorario,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `[Contexto: agora é ${quando}. Cidade padrão: ${ctx.cidadePadrao}.]`;
}

export interface Resultado {
  resposta: string;
  historico: Anthropic.MessageParam[];
}

/**
 * Envia a fala do usuário ao Claude, executa as ferramentas que ele pedir e
 * devolve o texto final. O histórico só cresce: nada já enviado é alterado.
 */
export async function responder(
  client: Pick<Anthropic, "messages">,
  historico: Anthropic.MessageParam[],
  texto: string,
  ctx: Contexto,
  executar: ExecutarFerramenta = executarFerramentaPadrao,
): Promise<Resultado> {
  const mensagens: Anthropic.MessageParam[] = [
    ...historico,
    { role: "user", content: `${linhaDeContexto(ctx)}\n${texto}` },
  ];

  let ultima: Anthropic.Message | undefined;
  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    ultima = await client.messages.create({
      model: MODELO,
      max_tokens: 4096,
      system: SISTEMA,
      tools: FERRAMENTAS,
      output_config: { effort: "low" },
      cache_control: { type: "ephemeral" },
      messages: mensagens,
    });
    mensagens.push({ role: "assistant", content: ultima.content });

    if (ultima.stop_reason === "pause_turn") continue;
    if (ultima.stop_reason !== "tool_use") break;

    const pedidos = ultima.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const pedido of pedidos) {
      try {
        resultados.push({
          type: "tool_result",
          tool_use_id: pedido.id,
          content: await executar(pedido.name, pedido.input),
        });
      } catch (erro) {
        resultados.push({
          type: "tool_result",
          tool_use_id: pedido.id,
          is_error: true,
          content: `Falha ao executar: ${erro instanceof Error ? erro.message : String(erro)}`,
        });
      }
    }
    mensagens.push({ role: "user", content: resultados });
  }

  return { resposta: textoFinal(ultima), historico: mensagens };
}

function textoFinal(msg: Anthropic.Message | undefined): string {
  if (!msg) return "Desculpe, não consegui responder agora.";
  if (msg.stop_reason === "refusal") return "Desculpe, não posso ajudar com isso.";
  if (msg.stop_reason === "tool_use") {
    return "Desculpe, esse pedido ficou longo demais. Pode tentar de novo de outro jeito?";
  }
  const texto = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return texto || "Desculpe, não entendi. Pode repetir?";
}
