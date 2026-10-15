import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { responder, linhaDeContexto, MODELO, type Contexto } from "../src/brain";
import { consultarClima } from "../src/tools/clima";
import { cabeNoLimite } from "../src/conversas";
import { atenderChat, emailPermitido } from "../src/atender";

const ctx: Contexto = {
  agora: new Date("2026-10-14T11:00:00Z"),
  cidadePadrao: "São Paulo",
  fusoHorario: "America/Sao_Paulo",
};

function mensagem(
  stop_reason: Anthropic.Message["stop_reason"],
  content: unknown[],
): Anthropic.Message {
  return { stop_reason, content } as unknown as Anthropic.Message;
}

// Cliente falso: devolve as respostas na ordem e guarda cada pedido recebido.
function clienteFalso(respostas: Anthropic.Message[]) {
  const pedidos: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client = {
    messages: {
      create: async (params: Anthropic.MessageCreateParamsNonStreaming) => {
        pedidos.push(structuredClone(params));
        const r = respostas.shift();
        if (!r) throw new Error("sem mais respostas");
        return r;
      },
    },
  } as unknown as Pick<Anthropic, "messages">;
  return { client, pedidos };
}

test("executa a ferramenta de clima e devolve o texto final", async () => {
  const { client, pedidos } = clienteFalso([
    mensagem("tool_use", [
      { type: "tool_use", id: "t1", name: "consultar_clima", input: { cidade: "Campinas" } },
    ]),
    mensagem("end_turn", [{ type: "text", text: "Em Campinas faz 25 graus." }]),
  ]);
  const chamadas: unknown[] = [];
  const r = await responder(client, [], "Como está o tempo em Campinas?", ctx, async (nome, entrada) => {
    chamadas.push({ nome, entrada });
    return "Agora: céu limpo, 25°C";
  });

  assert.equal(r.resposta, "Em Campinas faz 25 graus.");
  assert.deepEqual(chamadas, [{ nome: "consultar_clima", entrada: { cidade: "Campinas" } }]);
  assert.equal(pedidos.length, 2);
  assert.equal(pedidos[0].model, MODELO);
  // usuário, assistente (pede ferramenta), resultado, assistente (texto)
  assert.deepEqual(r.historico.map((m) => m.role), ["user", "assistant", "user", "assistant"]);
  const resultado = (r.historico[2].content as Anthropic.ToolResultBlockParam[])[0];
  assert.equal(resultado.tool_use_id, "t1");
  assert.equal(resultado.content, "Agora: céu limpo, 25°C");
});

test("nunca altera o histórico anterior e mantém sistema e ferramentas iguais", async () => {
  const anterior: Anthropic.MessageParam[] = [
    { role: "user", content: "oi" },
    { role: "assistant", content: [{ type: "text", text: "Olá!" }] as Anthropic.ContentBlockParam[] },
  ];
  const copia = structuredClone(anterior);
  const { client, pedidos } = clienteFalso([
    mensagem("tool_use", [{ type: "tool_use", id: "t1", name: "consultar_clima", input: { cidade: "Rio" } }]),
    mensagem("end_turn", [{ type: "text", text: "ok" }]),
  ]);
  const r = await responder(client, anterior, "e o tempo?", ctx, async () => "sol");

  assert.deepEqual(anterior, copia);
  assert.deepEqual(r.historico.slice(0, 2), copia);
  assert.deepEqual(pedidos[0].system, pedidos[1].system);
  assert.deepEqual(pedidos[0].tools, pedidos[1].tools);
  // o segundo pedido começa exatamente com o primeiro (só acrescenta)
  assert.deepEqual(pedidos[1].messages.slice(0, pedidos[0].messages.length), pedidos[0].messages);
});

test("erro na ferramenta vira resultado com is_error, sem derrubar a resposta", async () => {
  const { client } = clienteFalso([
    mensagem("tool_use", [{ type: "tool_use", id: "t1", name: "consultar_clima", input: { cidade: "X" } }]),
    mensagem("end_turn", [{ type: "text", text: "Não consegui ver o clima." }]),
  ]);
  const r = await responder(client, [], "tempo?", ctx, async () => {
    throw new Error("rede fora");
  });
  const resultado = (r.historico[2].content as Anthropic.ToolResultBlockParam[])[0];
  assert.equal(resultado.is_error, true);
  assert.match(String(resultado.content), /rede fora/);
  assert.equal(r.resposta, "Não consegui ver o clima.");
});

test("pause_turn continua o mesmo turno", async () => {
  const { client, pedidos } = clienteFalso([
    mensagem("pause_turn", [{ type: "server_tool_use", id: "s1", name: "web_search", input: { query: "notícias" } }]),
    mensagem("end_turn", [{ type: "text", text: "As manchetes são..." }]),
  ]);
  const r = await responder(client, [], "notícias", ctx);
  assert.equal(pedidos.length, 2);
  assert.equal(r.resposta, "As manchetes são...");
});

test("recusa devolve mensagem educada", async () => {
  const { client } = clienteFalso([mensagem("refusal", [])]);
  const r = await responder(client, [], "algo proibido", ctx);
  assert.equal(r.resposta, "Desculpe, não posso ajudar com isso.");
});

test("contexto traz data em português e a cidade padrão", () => {
  const linha = linhaDeContexto(ctx);
  assert.match(linha, /14 de outubro de 2026/);
  assert.match(linha, /08:00/);
  assert.match(linha, /Cidade padrão: São Paulo/);
});

test("consultarClima monta o resumo a partir do Open-Meteo", async () => {
  const urls: string[] = [];
  const fetchFalso = (async (url: string) => {
    urls.push(url);
    const corpo = url.includes("geocoding")
      ? { results: [{ name: "Campinas", admin1: "São Paulo", latitude: -22.9, longitude: -47.06 }] }
      : {
          current: { temperature_2m: 24.6, apparent_temperature: 25.2, weather_code: 2, wind_speed_10m: 11.4 },
          daily: {
            temperature_2m_max: [29.1, 27],
            temperature_2m_min: [17.4, 16],
            precipitation_probability_max: [10, 60],
            weather_code: [1, 63],
          },
        };
    return { json: async () => corpo };
  }) as unknown as typeof fetch;

  const texto = await consultarClima("Campinas, SP", fetchFalso);
  assert.match(urls[0], /name=Campinas$/);
  assert.match(texto, /Local: Campinas, São Paulo\./);
  assert.match(texto, /Agora: parcialmente nublado, 25°C \(sensação de 25°C\)/);
  assert.match(texto, /Hoje: predominantemente limpo, mínima 17°C, máxima 29°C, chance de chuva 10%/);
  assert.match(texto, /Amanhã: chuva, mínima 16°C, máxima 27°C, chance de chuva 60%/);
});

test("cidade inexistente", async () => {
  const fetchFalso = (async () => ({ json: async () => ({}) })) as unknown as typeof fetch;
  assert.equal(await consultarClima("Xyzw", fetchFalso), 'Não encontrei a cidade "Xyzw".');
});

test("limite da conversa", () => {
  assert.equal(cabeNoLimite("x".repeat(10), 5), true);
  assert.equal(cabeNoLimite("x".repeat(600_000), 5), false);
  assert.equal(cabeNoLimite("x", 120), false);
});

test("atenderChat recusa método errado, falta de login e e-mail fora da lista", async () => {
  const dep = {
    verificarToken: async () => ({ uid: "u1", email: "outra@gmail.com" }),
    db: {} as never,
    client: clienteFalso([]).client,
    emailsPermitidos: "andre@gmail.com, outro@gmail.com",
    cidadePadrao: "São Paulo",
  };
  assert.equal((await atenderChat({ metodo: "GET", corpo: {} }, dep)).status, 405);
  assert.equal((await atenderChat({ metodo: "POST", corpo: {} }, dep)).status, 401);
  const r = await atenderChat({ metodo: "POST", autorizacao: "Bearer x", corpo: { texto: "oi" } }, dep);
  assert.equal(r.status, 403);
});

test("atenderChat valida o texto e aceita e-mail sem diferenciar maiúsculas", async () => {
  assert.equal(emailPermitido("Andre@Gmail.com", " andre@gmail.com ,x@y.com"), true);
  assert.equal(emailPermitido(undefined, "andre@gmail.com"), false);
  const dep = {
    verificarToken: async () => ({ uid: "u1", email: "andre@gmail.com" }),
    db: {} as never,
    client: clienteFalso([]).client,
    emailsPermitidos: "andre@gmail.com",
    cidadePadrao: "São Paulo",
  };
  const r = await atenderChat({ metodo: "POST", autorizacao: "Bearer x", corpo: { texto: "  " } }, dep);
  assert.equal(r.status, 400);
});
