# Especificação Técnica: Sistema de Recomendação de Filmes com IA (PipocaAI)

## 1. Visão Geral
Sistema de recomendação de filmes por afinidade. O sistema analisa o histórico de preferências do usuário através de uma rede neural (TensorFlow.js) e reordena a vitrine de filmes com base no cálculo de similaridade vetorial.

## 2. Restrições Arquiteturais
* **Frontend:** Interface web (HTML/JS) para interações do usuário.
* **Backend:** API REST desenvolvida em Node.js (JavaScript/TypeScript).
* **Inteligência Artificial:** TensorFlow.js rodando no ambiente Node.js.
* **Banco de Dados Vetorial:** PostgreSQL com a extensão `pgvector` via Docker.

## 3. Requisitos Funcionais
* O usuário interage com a vitrine (curtir/descurtir filmes).
* O backend em Node.js recebe o evento, atualiza o histórico e recalcula o vetor de preferência do usuário (User Embedding).
* O banco de dados realiza uma busca por similaridade de cosseno utilizando o `pgvector`.
* A API retorna a lista de 10 filmes ordenada por afinidade para o frontend.

## 4. Contratos de Dados (Estrutura do Banco)
> Nota: a implementação atual usa identificadores inteiros (`SERIAL`/`INT[]`), conforme o SQL da seção 2.1. Os tipos abaixo refletem o que está em produção.
* **Tabela `movies`:** `id` (SERIAL), `title` (VARCHAR), `genres` (TEXT[]), `embedding` (VECTOR(3))).
* **Tabela `user_profiles`:** `id` (SERIAL), `liked_movies` (INT[]), `disliked_movies` (INT[]), `user_embedding` (VECTOR(3)).

## 5. Próximos Passos (Plano de Execução)
1. Criar o arquivo `docker-compose.yml` para subir o PostgreSQL com `pgvector`.
2. Configurar o projeto Node.js com o driver do Postgres (`pg`) e TensorFlow.js.
3. Criar o script de migração para criar as tabelas e o índice vetorial (`ivfflat` ou `hnsw`).
4. Desenvolver o script de seed para popular os filmes e seus respectivos embeddings de teste.
5. Criar as rotas da API para recomendação e interações do usuário.

## 2. Design da Arquitetura e Contratos

### 2.1. Modelagem do Banco de Dados (PostgreSQL)

```sql
-- Ativar a extensão de vetores
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabela de Filmes
CREATE TABLE movies (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    genres TEXT[] NOT NULL,
    embedding vector(3) NOT NULL -- [Ação, Drama, Ficção_Científica]
);

-- Tabela de Perfis de Usuário
CREATE TABLE user_profiles (
    id SERIAL PRIMARY KEY,
    user_name VARCHAR(100) NOT NULL,
    liked_movies INT[] DEFAULT '{}',
    disliked_movies INT[] DEFAULT '{}',
    user_embedding vector(3) DEFAULT '[0,0,0]'
);

-- Índice para busca vetorial acelerada (Similaridade de Cosseno)
CREATE INDEX ON movies USING hnsw (embedding vector_cosine_ops);
```

### 2.2. Contratos da API (Endpoints REST)

#### 0. Perfil do Usuário Ativo
*   **Rota:** `GET /api/profile?userId={id}`
*   **Descrição:** Retorna o perfil do usuário (nome e `user_embedding` atual) para a interface exibir. Se `userId` não for informado, resolve o usuário padrão (o de menor id — o "Usuário Piloto" criado no seed), evitando id fixo no frontend.
*   **Resposta (200 OK):**
    ```json
    {
      "id": 1,
      "user_name": "Usuário Piloto",
      "user_embedding": [0.2, 0.0, 0.0],
      "liked_movies": [3],
      "disliked_movies": []
    }
    ```

#### 1. Listar Vitrine Recomendada
*   **Rota:** `GET /api/movies?userId={id}`
*   **Descrição:** Busca o `user_embedding` do usuário. Faz uma busca no banco usando `pgvector` calculando a similaridade de cosseno invertida (menor distância = maior afinidade) e retorna a lista ordenada.
*   **Resposta (200 OK):**
    ```json
    [
      { "id": 12, "title": "Inception", "genres": ["Sci-Fi", "Action"], "affinity": 0.94 },
      { "id": 5, "title": "The Matrix", "genres": ["Sci-Fi"], "affinity": 0.88 }
    ]
    ```

#### 2. Registrar Interação do Usuário
*   **Rota:** `POST /api/interactions`
*   **Payload:**
    ```json
    {
      "userId": 1,
      "movieId": 12,
      "action": "like" // ou "dislike"
    }
    ```
*   **Descrição:** Adiciona o filme à lista correspondente no perfil do usuário. Dispara a lógica do TensorFlow.js para recalcular o `user_embedding` e atualiza o banco de dados.
*   **Resposta (200 OK):**
    ```json
    {
      "success": true,
      "userId": 1,
      "movieId": 12,
      "action": "like",
      "user_embedding": [0.2, 0.0, 0.0]
    }
    ```

## 3. Plano de Execução (Tasking)

- [X] **Task 3.1: Infraestrutura e Banco de Dados**
  - Criar o arquivo `docker-compose.yml` para subir o PostgreSQL com a extensão `pgvector`.
  - Criar um script SQL (`init.sql`) para gerar as tabelas `movies` e `user_profiles` com as estruturas e índices definidos no Design.

- [X] **Task 3.2: Configuração do Backend**
  - Iniciar o projeto Node.js e instalar as dependências fundamentais (`express`, `pg` para conexão com o banco, e `@tensorflow/tfjs-node` para a inteligência artificial).
  - Criar o arquivo de conexão com o banco de dados e testar a comunicação.

- [X] **Task 3.3: Carga de Dados Inicial (Seed)**
  - Criar um script que popula a tabela `movies` com pelo menos 5 filmes fictícios e seus respectivos embeddings manuais de 3 dimensões (Ex: Filme de Ação puro: `[1.0, 0.0, 0.0]`).
  - Criar um usuário de teste inicial na tabela `user_profiles` com embedding zerado `[0.0, 0.0, 0.0]`.

- [X] **Task 3.4: Motor de Recomendação e Rotas**
  - Implementar o endpoint `GET /api/movies`. Ele deve buscar os filmes ordenados pela menor distância de cosseno em relação ao vetor do usuário atual.
  - Implementar o endpoint `POST /api/interactions`. Ele deve salvar o "like/dislike" e usar uma lógica matemática simples (ou modelo TensorFlow) para ajustar o vetor do usuário aproximando-o ou afastando-o do vetor do filme interagido.

## 4. Critérios de Validação (Etapa 5)
- [X] **Task 4.1: Teste de Fluxo de Recomendação**
  - Validar a recomendação inicial padrão para novos usuários (`[0.0, 0.0, 0.0]`).
  - Validar se o endpoint `POST /api/interactions` atualiza o array e altera o vetor do usuário usando o TensorFlow.js.
  - Validar se o novo cálculo do `GET /api/movies` reordena a vitrine priorizando os gêneros curtidos.

## 5. Interface do Usuário (Frontend)

### 5.1. Requisitos de Tela
*   **Visão Geral:** Uma página única (SPA) simples e limpa rodando diretamente no navegador (HTML, CSS vanilla e JavaScript).
*   **Seção Superior (Perfil):** Exibe o nome do usuário ativo e o estado atual do seu vetor de preferência `User Embedding: [x, y, z]` para fins de acompanhamento acadêmico.
*   **Seção Central (Vitrine de Filmes):** Uma grade de cartões (cards) exibindo os filmes. Cada card deve mostrar o título, os gêneros, a porcentagem de afinidade calculada pela API e dois botões: "👍 Curtir" e "👎 Descurtir".

### 5.2. Plano de Execução (Tasks Frontend)
- [X] **Task 5.1: Estrutura HTML e Estilização**
  - Criar um arquivo `public/index.html` com o layout básico, seções de perfil e o container da vitrine.
  - Adicionar uma estilização CSS minimalista e responsiva para os cards de filmes.
- [X] **Task 5.2: Integração e Lógica JS**
  - Criar o arquivo `public/app.js` para consumir o endpoint `GET /api/movies?userId=1` ao carregar a página e renderizar os cards dinamicamente.
  - Implementar os eventos de clique nos botões "👍" e "👎" para disparar o `POST /api/interactions`, recarregar a vitrine automaticamente e atualizar os dados do vetor na tela.
