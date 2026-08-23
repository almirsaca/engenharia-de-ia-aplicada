-- Ativar a extensão de vetores
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabela de Filmes
CREATE TABLE IF NOT EXISTS movies (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    genres TEXT[] NOT NULL,
    embedding vector(3) NOT NULL
);

-- Tabela de Perfis de Usuário
CREATE TABLE IF NOT EXISTS user_profiles (
    id SERIAL PRIMARY KEY,
    user_name VARCHAR(100) NOT NULL,
    liked_movies INT[] DEFAULT '{}',
    disliked_movies INT[] DEFAULT '{}',
    user_embedding vector(3) DEFAULT '[0,0,0]'
);

-- Índice para busca vetorial acelerada
CREATE INDEX IF NOT EXISTS movies_embedding_hnsw_idx ON movies USING hnsw (embedding vector_cosine_ops);
