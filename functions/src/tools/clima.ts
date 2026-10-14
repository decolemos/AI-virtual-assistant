import type Anthropic from "@anthropic-ai/sdk";

// Previsão do tempo via Open-Meteo: gratuito e sem chave de API.

export const climaTool: Anthropic.Tool = {
  name: "consultar_clima",
  description:
    "Consulta o clima atual e a previsão de hoje e amanhã para uma cidade. " +
    "Use para perguntas sobre tempo, temperatura, chuva e no briefing do dia.",
  input_schema: {
    type: "object",
    properties: {
      cidade: {
        type: "string",
        description: "Nome da cidade, por exemplo 'São Paulo' ou 'Campinas, SP'.",
      },
    },
    required: ["cidade"],
    additionalProperties: false,
  },
};

const CONDICOES: Record<number, string> = {
  0: "céu limpo",
  1: "predominantemente limpo",
  2: "parcialmente nublado",
  3: "nublado",
  45: "neblina",
  48: "neblina com geada",
  51: "garoa fraca",
  53: "garoa",
  55: "garoa forte",
  61: "chuva fraca",
  63: "chuva",
  65: "chuva forte",
  71: "neve fraca",
  73: "neve",
  75: "neve forte",
  80: "pancadas de chuva fracas",
  81: "pancadas de chuva",
  82: "pancadas de chuva fortes",
  95: "trovoadas",
  96: "trovoadas com granizo",
  99: "trovoadas fortes com granizo",
};

export function descreverCondicao(codigo: number): string {
  return CONDICOES[codigo] ?? "condição desconhecida";
}

type FetchFn = typeof fetch;

export async function consultarClima(
  cidade: string,
  fetchFn: FetchFn = fetch,
): Promise<string> {
  // O geocoding do Open-Meteo busca só pelo nome; "Campinas, SP" vira "Campinas".
  const nome = cidade.split(",")[0].trim();
  const geoUrl =
    "https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt&name=" +
    encodeURIComponent(nome);
  const geo = (await (await fetchFn(geoUrl)).json()) as {
    results?: { name: string; admin1?: string; latitude: number; longitude: number }[];
  };
  const lugar = geo.results?.[0];
  if (!lugar) {
    return `Não encontrei a cidade "${cidade}".`;
  }

  const prevUrl =
    "https://api.open-meteo.com/v1/forecast?timezone=auto&forecast_days=2" +
    `&latitude=${lugar.latitude}&longitude=${lugar.longitude}` +
    "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m" +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code";
  const prev = (await (await fetchFn(prevUrl)).json()) as {
    current: {
      temperature_2m: number;
      apparent_temperature: number;
      weather_code: number;
      wind_speed_10m: number;
    };
    daily: {
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: (number | null)[];
      weather_code: number[];
    };
  };

  const local = lugar.admin1 ? `${lugar.name}, ${lugar.admin1}` : lugar.name;
  const d = prev.daily;
  const dia = (i: number, rotulo: string) =>
    `${rotulo}: ${descreverCondicao(d.weather_code[i])}, mínima ${Math.round(d.temperature_2m_min[i])}°C, ` +
    `máxima ${Math.round(d.temperature_2m_max[i])}°C, chance de chuva ${d.precipitation_probability_max[i] ?? 0}%.`;

  return [
    `Local: ${local}.`,
    `Agora: ${descreverCondicao(prev.current.weather_code)}, ${Math.round(prev.current.temperature_2m)}°C ` +
      `(sensação de ${Math.round(prev.current.apparent_temperature)}°C), vento de ${Math.round(prev.current.wind_speed_10m)} km/h.`,
    dia(0, "Hoje"),
    dia(1, "Amanhã"),
  ].join("\n");
}
