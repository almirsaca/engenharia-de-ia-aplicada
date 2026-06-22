const tf = require('@tensorflow/tfjs');
const { pool } = require('../db');

function parseVector(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value !== 'string') return [];
  return value.replace(/^[\[]|[\]]$/g, '').split(',').map(Number);
}

function clampEmbedding(values) {
  return values.map((value) => Math.max(0, Math.min(1, value)));
}

function computeUserEmbedding(userEmbedding, movieEmbedding, action) {
  const alpha = 0.2;
  const userTensor = tf.tensor1d(userEmbedding);
  const movieTensor = tf.tensor1d(movieEmbedding);
  const delta = movieTensor.sub(userTensor);
  const updated = action === 'like'
    ? userTensor.add(delta.mul(alpha))
    : userTensor.sub(delta.mul(alpha));

  const clipped = updated.clipByValue(0, 1);
  const result = clipped.arraySync();
  userTensor.dispose();
  movieTensor.dispose();
  delta.dispose();
  updated.dispose();
  clipped.dispose();

  return clampEmbedding(result);
}

async function getUserProfile(userId) {
  const { rows } = await pool.query(
    'SELECT id, user_name, liked_movies, disliked_movies, user_embedding FROM user_profiles WHERE id = $1',
    [userId]
  );
  if (!rows.length) return null;
  const profile = rows[0];
  profile.user_embedding = parseVector(profile.user_embedding);
  return profile;
}

async function getRecommendedMovies(userEmbedding, limit = 10) {
  const embeddingText = `[${userEmbedding.join(',')}]`;
  const { rows } = await pool.query(
    `SELECT id, title, genres, GREATEST(0.0, 1 - (embedding <=> $1::vector(3))) AS affinity
     FROM movies
     ORDER BY embedding <=> $1::vector(3)
     LIMIT $2`,
    [embeddingText, limit]
  );
  return rows.map((row) => {
    // Cosseno é indefinido para vetor de usuário nulo ([0,0,0]) → NaN. Normaliza para 0.
    const rawAffinity = Number(row.affinity);
    const affinity = Number.isFinite(rawAffinity) ? parseFloat(rawAffinity.toFixed(6)) : 0;
    return {
      id: row.id,
      title: row.title,
      genres: row.genres,
      affinity,
    };
  });
}

async function getMovieEmbedding(movieId) {
  const { rows } = await pool.query(
    'SELECT embedding FROM movies WHERE id = $1',
    [movieId]
  );
  if (!rows.length) return null;
  return parseVector(rows[0].embedding);
}

async function updateUserProfile(userId, likedMovies, dislikedMovies, userEmbedding) {
  const embeddingText = `[${userEmbedding.join(',')}]`;
  await pool.query(
    `UPDATE user_profiles
     SET liked_movies = $1,
         disliked_movies = $2,
         user_embedding = $3::vector(3)
     WHERE id = $4`,
    [likedMovies, dislikedMovies, embeddingText, userId]
  );
}

module.exports = {
  computeUserEmbedding,
  getUserProfile,
  getRecommendedMovies,
  getMovieEmbedding,
  updateUserProfile,
};
