# 🍿 PipocaAI — Backend

Sistema de **recomendação de filmes por afinidade**. O backend analisa as interações do usuário (curtir/descurtir) e, usando uma rede neural com **TensorFlow.js**, recalcula o **vetor de preferência** (*user embedding*). A vitrine é então reordenada por **similaridade de cosseno** usando **PostgreSQL + pgvector**.

> ℹ️ Laboratório do Módulo 1, construído com a metodologia **Spec-Driven Development (SDD)**. A especificação completa está em [SPEC.md](./SPEC.md) e o fluxo de prompts usado em [prts.md](./prts.md).

---

## 🧠 Como funciona

1. Cada filme tem um **embedding de 3 dimensões** representando seus gêneros: `[Ação, Drama, Ficção Científica]`.
2. O usuário começa com um vetor zerado `[0, 0, 0]`.
3. A cada **like/dislike**, o TensorFlow.js move o vetor do usuário na direção (ou contra) o vetor do filme.
4. O `pgvector` busca os filmes mais próximos do vetor do usuário (menor distância de cosseno = maior afinidade) e retorna a vitrine ordenada.

---

## 🧰 Stack

- **Backend:** Node.js + Express (API REST)
- **IA:** TensorFlow.js (`@tensorflow/tfjs`; `@tensorflow/tfjs-node` opcional em produção)
- **Banco vetorial:** PostgreSQL + extensão `pgvector` (via Docker)

---

## 🔌 Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/profile?userId={id}` | Retorna o perfil do usuário ativo (nome + embedding). Sem `userId`, resolve o usuário padrão (Piloto) |
| `GET` | `/api/movies?userId={id}` | Retorna a vitrine ordenada por afinidade |
| `POST` | `/api/interactions` | Registra um like/dislike e recalcula o embedding do usuário |
| `GET` | `/health` | Healthcheck (`{ "status": "ok" }`) |

Detalhes dos contratos (payloads e respostas) em [SPEC.md](./SPEC.md#22-contratos-da-api-endpoints-rest).

---

## 📁 Estrutura

```
pipoca-ai/
├── docker-compose.yml     # PostgreSQL + pgvector
├── init.sql               # criação das tabelas e índice vetorial
├── public/                # frontend (servido por express.static em "/")
│   ├── index.html         # estrutura + CSS (painel do vetor + grid de filmes)
│   └── app.js             # lógica vanilla JS (consome a API, like/dislike)
├── src/
│   ├── server.js          # bootstrap do Express + arquivos estáticos
│   ├── db.js              # pool de conexão com o Postgres
│   ├── seed.js            # carga inicial de filmes e usuário de teste
│   ├── controllers/       # movieController.js
│   ├── routes/            # api.js
│   └── services/          # recommendationService.js (lógica de IA)
└── test-recommendation.js # teste de fluxo ponta a ponta
```

---

## 🚀 Como executar

### Desenvolvimento (feedback rápido)

```bash
copy .env.example .env    # Windows (PowerShell). No Linux/Mac: cp .env.example .env
npm install
npm run dev               # nodemon
```

### Produção (reproduzível, com deps nativas como tfjs-node)

```bash
# build apenas da imagem do backend
npm run docker:build

# sobe o backend (conecta ao serviço de banco do docker-compose)
npm run docker:up

# ou sobe a stack completa
docker compose up -d
```

### Popular o banco e validar

```bash
npm run seed                  # carga inicial (5 filmes + usuário piloto)
```

O teste de fluxo faz requisições HTTP reais, então **a API precisa estar no ar**. Em um terminal suba o servidor e, em outro, rode o teste:

```bash
# terminal 1
npm start

# terminal 2 — lista → like → valida que a vitrine reordena (Ação ao topo)
npm run test:reco
```

> O teste reseta o estado via seed no início, então é determinístico e pode ser executado quantas vezes quiser.

### Abrir a interface no navegador

Com o servidor no ar (`npm start`), acesse:

```
http://localhost:3000
```

A cada 👍/👎 o **vetor do usuário** se move e a **vitrine reordena** na hora, priorizando os gêneros curtidos.

> ⚠️ Acesse pela URL `http://localhost:3000` — não abra o `index.html` como `file://`, pois as chamadas `/api/...` deixam de funcionar.

---

## 📝 Notas

- No desenvolvimento evitamos instalar módulos nativos pesados como `@tensorflow/tfjs-node` para manter o ciclo de iteração rápido. Em produção, a imagem Docker tenta instalá-lo em um ambiente Linux apropriado.
- Para suporte a GPU ou uma versão específica do `tfjs-node`, ajuste a imagem base no `Dockerfile` e fixe a versão do pacote.
- O arquivo `.env` (com credenciais) é **ignorado pelo Git** — use o `.env.example` como referência.
