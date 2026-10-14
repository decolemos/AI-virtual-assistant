# Jarvis

Assistente pessoal de voz. Um "cérebro" na nuvem (Firebase + Claude Haiku 5.5) atende computador, celular e Alexa.

**Fase 1 (este código):** o cérebro e uma página web de teste. A página aceita texto ou voz, usando o microfone do Chrome ou do Edge, e lê as respostas em voz alta.

O que já funciona:
- **Perguntas e pesquisa:** dúvidas gerais, notícias, cotações e resultados, com busca na web.
- **Clima:** tempo agora, hoje e amanhã em qualquer cidade (Open-Meteo, gratuito).
- **Briefing do dia:** "Jarvis, bom dia" traz clima e manchetes. A agenda entra na fase 2.

## Estrutura

```
functions/            Cloud Functions (o cérebro)
  src/index.ts        endpoint /api/chat: login, conversa no Firestore, chama o cérebro
  src/brain.ts        conversa com o Claude e executa as ferramentas
  src/conversas.ts    guarda o histórico no Firestore
  src/tools/clima.ts  ferramenta de clima
  test/               testes automáticos (sem gastar API)
web/index.html        página de teste (Firebase Hosting)
firebase.json         configuração do Firebase
firestore.rules       banco fechado: só o servidor acessa
```

## Como colocar no ar (Windows)

1. Instale o [Node.js 22](https://nodejs.org) e, num terminal, rode `npm install -g firebase-tools`.
2. No [console do Firebase](https://console.firebase.google.com), crie um projeto e mude para o plano **Blaze**. Ele pede cartão, mas o uso pessoal fica dentro da cota gratuita. Crie também um alerta de orçamento, por exemplo de R$ 10.
3. Ainda no console, faça duas coisas:
   - Em **Authentication**, ative o provedor **Google**.
   - Em **Firestore Database**, crie o banco na região `southamerica-east1` (São Paulo).
4. No [Claude Console](https://console.anthropic.com), crie uma chave de API e defina um limite mensal de gastos.
5. Na pasta do projeto, rode:
   ```
   firebase login
   firebase use --add
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```
   O último comando pede a chave do passo 4. Ela fica guardada no Google Secret Manager e nunca no código.
6. Copie `functions/.env.example` para `functions/.env` e coloque o seu e-mail Google em `EMAILS_PERMITIDOS`. Só os e-mails dessa lista conseguem usar o Jarvis.
7. Instale as dependências e publique:
   ```
   cd functions
   npm install
   cd ..
   firebase deploy
   ```
8. Abra `https://SEU-PROJETO.web.app` no Chrome ou no Edge, entre com o Google e fale com o Jarvis.

## Custos

- **Claude Haiku 5.5:** US$ 0,10 por milhão de tokens de entrada e US$ 0,50 por milhão de saída. Com 50 comandos por dia, isso dá cerca de US$ 2 por mês.
- **Busca na web:** cobrada por busca, à parte. Confira o valor atual na página de preços da Anthropic. O Jarvis faz no máximo 3 buscas por pergunta.
- **Firebase e Open-Meteo:** gratuitos no uso pessoal.

## Testes

```
cd functions
npm test
```

Os testes usam um Claude falso e não gastam créditos da API.
