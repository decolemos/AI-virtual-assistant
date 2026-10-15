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

## Duas formas de colocar no ar

- **Vercel (gratuita, sem cartão):** o cérebro roda na Vercel e o Firebase fica no plano grátis Spark (login e banco de dados). Veja "Como colocar no ar na Vercel".
- **Firebase Blaze:** tudo no Firebase. No Brasil, o Google pede um pré-pagamento de R$ 150 para ativar o Blaze, que vira crédito. Veja "Como colocar no ar no Firebase".

O cérebro é o mesmo nas duas (`functions/src`); só muda quem o executa.

## Como colocar no ar na Vercel (Windows)

1. No [console do Firebase](https://console.firebase.google.com), no projeto que você criou (plano Spark, sem upgrade):
   - Em **Authentication**, ative o provedor **Google**.
   - Em **Firestore Database**, crie o banco na região `southamerica-east1` (São Paulo).
   - Em **Configurações do projeto > Geral > Seus apps**, adicione um app **Web** e copie o objeto `firebaseConfig` (apiKey, authDomain, projectId, appId...).
   - Em **Configurações do projeto > Contas de serviço**, clique em **Gerar nova chave privada**. Isso baixa um arquivo JSON. Guarde-o com cuidado e nunca o coloque no GitHub.
2. No [Claude Console](https://console.anthropic.com), crie uma chave de API e defina um limite mensal de gastos.
3. Em [vercel.com](https://vercel.com), entre com o GitHub, clique em **Add New > Project** e importe o repositório `ai-virtual-assistant`. Não mude as opções de build.
4. Antes de clicar em **Deploy**, abra **Environment Variables** e cadastre:
   - `ANTHROPIC_API_KEY`: a chave do passo 2.
   - `EMAILS_PERMITIDOS`: o seu e-mail Google.
   - `CIDADE_PADRAO`: a sua cidade (opcional, o padrão é São Paulo).
   - `FIREBASE_SERVICE_ACCOUNT`: o conteúdo inteiro do arquivo JSON do passo 1.
   - `FIREBASE_WEB_CONFIG`: o `firebaseConfig` do passo 1 em formato JSON, por exemplo `{"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}`.
5. Clique em **Deploy**. A Vercel mostra o endereço do site, algo como `ai-virtual-assistant.vercel.app`.
6. No Firebase, em **Authentication > Configurações > Domínios autorizados**, adicione esse endereço (sem `https://`).
7. Abra o endereço no Chrome ou no Edge, entre com o Google e fale com o Jarvis.

## Como colocar no ar no Firebase (Windows)

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
- **Firebase, Vercel e Open-Meteo:** gratuitos no uso pessoal.

## Testes

```
cd functions
npm test
```

Os testes usam um Claude falso e não gastam créditos da API.
