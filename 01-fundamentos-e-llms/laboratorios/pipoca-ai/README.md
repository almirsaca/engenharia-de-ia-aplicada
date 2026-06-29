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

## 🗄️ Consultas SQL

As queries de runtime ficam em [`src/services/recommendationService.js`](./src/services/recommendationService.js). A peça central é a busca por **similaridade de cosseno** com o operador `<=>` do pgvector.

### Recomendação (coração do sistema)

```sql
SELECT id, title, genres,
       GREATEST(0.0, 1 - (embedding <=> $1::vector(3))) AS affinity
FROM movies
ORDER BY embedding <=> $1::vector(3)
LIMIT $2;
```

- **`<=>`** → operador de **distância de cosseno** do pgvector (`0` = idêntico, `2` = oposto). `$1` é o `user_embedding` atual.
- **`ORDER BY embedding <=> $1`** → ordena do mais próximo (mais afim) ao mais distante. É aqui que a vitrine é reordenada.
- **`affinity = 1 - distância`** → converte a distância em um score de afinidade `0–1` (exibido como % na tela). O `GREATEST(0.0, ...)` evita valores negativos.
- O índice **`hnsw (embedding vector_cosine_ops)`** (criado no `init.sql`) acelera essa ordenação vetorial.

> ⚠️ Para um usuário com vetor nulo `[0,0,0]` (Piloto recém-semeado), o cosseno é indefinido (`NaN`); o backend normaliza a afinidade para `0` nesse caso.

### Demais consultas

```sql
-- Perfil do usuário (nome + embedding atual)
SELECT id, user_name, liked_movies, disliked_movies, user_embedding
FROM user_profiles WHERE id = $1;

-- Usuário padrão (Piloto = menor id), quando userId não é informado
SELECT id FROM user_profiles ORDER BY id LIMIT 1;

-- Embedding de um filme (usado no recálculo do vetor)
SELECT embedding FROM movies WHERE id = $1;

-- Persiste o novo perfil após um like/dislike
UPDATE user_profiles
SET liked_movies = $1, disliked_movies = $2, user_embedding = $3::vector(3)
WHERE id = $4;
```

> Todas usam **parâmetros vinculados** (`$1`, `$2`, …) — nunca concatenação de strings — evitando SQL injection. Vetores são enviados como texto (`'[x,y,z]'`) e convertidos com `::vector(3)`.

A criação do schema (DDL) e o seed ficam em [`init.sql`](./init.sql) e [`src/seed.js`](./src/seed.js).

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
