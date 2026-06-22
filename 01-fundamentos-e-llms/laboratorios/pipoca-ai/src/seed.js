require('dotenv').config();
const { pool } = require('./db');

const movies = [
  {
    title: 'Fúria de Neon',
    genres: ['Action', 'Sci-Fi'],
    embedding: [0.8, 0.0, 0.8],
  },
  {
    title: 'Noites de Cinema',
    genres: ['Drama'],
    embedding: [0.0, 1.0, 0.0],
  },
  {
    title: 'Operação Horizonte',
    genres: ['Action'],
    embedding: [1.0, 0.0, 0.0],
  },
  {
    title: 'Mentes Sintéticas',
    genres: ['Sci-Fi', 'Drama'],
    embedding: [0.3, 0.4, 0.9],
  },
  {
    title: 'Estrada do Coração',
    genres: ['Drama', 'Action'],
    embedding: [0.6, 0.8, 0.1],
  },
];

const userProfiles = [
  {
    user_name: 'Usuário Piloto',
    liked_movies: [],
    disliked_movies: [],
    user_embedding: [0.0, 0.0, 0.0],
  },
];

async function runSeed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    await client.query(`
      CREATE TABLE IF NOT EXISTS movies (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        genres TEXT[] NOT NULL,
        embedding vector(3) NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id SERIAL PRIMARY KEY,
        user_name VARCHAR(100) NOT NULL,
        liked_movies INT[] DEFAULT '{}',
        disliked_movies INT[] DEFAULT '{}',
        user_embedding vector(3) DEFAULT '[0,0,0]'
      )
    `);

    await client.query('DELETE FROM user_profiles');
    await client.query('DELETE FROM movies');

    const movieInsertText = `INSERT INTO movies (title, genres, embedding) VALUES ($1, $2, $3::vector(3))`;
    for (const movie of movies) {
      const embeddingText = `[${movie.embedding.join(',')}]`;
      await client.query(movieInsertText, [movie.title, movie.genres, embeddingText]);
    }

    const userInsertText = `INSERT INTO user_profiles (user_name, liked_movies, disliked_movies, user_embedding) VALUES ($1, $2, $3, $4::vector(3))`;
    for (const user of userProfiles) {
      const embeddingText = `[${user.user_embedding.join(',')}]`;
      await client.query(userInsertText, [user.user_name, user.liked_movies, user.disliked_movies, embeddingText]);
    }

    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runSeed()
    .then(() => {
      console.log('Seed completed successfully.');
      return pool.end();
    })
    .catch((error) => {
      console.error('Seed failed:', error);
      pool.end();
      process.exit(1);
    });
}

module.exports = {
  runSeed,
};
