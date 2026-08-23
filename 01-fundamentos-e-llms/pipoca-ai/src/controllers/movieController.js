const {
  computeUserEmbedding,
  getUserProfile,
  getDefaultUserId,
  getRecommendedMovies: findRecommendedMovies,
  getMovieEmbedding,
  updateUserProfile,
} = require('../services/recommendationService');

function normalizeMovieId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Retorna o perfil do usuário ativo (nome + embedding) para a interface exibir.
// Se userId não for informado, usa o usuário padrão (Piloto) — evita id fixo no frontend.
async function getProfile(req, res) {
  let userId = normalizeMovieId(req.query.userId);
  if (!userId) {
    userId = await getDefaultUserId();
  }
  if (!userId) {
    return res.status(404).json({ error: 'No user profile found. Run the seed first.' });
  }

  const user = await getUserProfile(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  return res.json({
    id: user.id,
    user_name: user.user_name,
    user_embedding: user.user_embedding,
    liked_movies: user.liked_movies,
    disliked_movies: user.disliked_movies,
  });
}

async function getRecommendedMovies(req, res) {
  const userId = normalizeMovieId(req.query.userId);
  if (!userId) {
    return res.status(400).json({ error: 'userId query parameter is required and must be an integer.' });
  }

  const user = await getUserProfile(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const movies = await findRecommendedMovies(user.user_embedding);
  return res.json(movies);
}

async function handleInteraction(req, res) {
  const { userId, movieId, action } = req.body;
  const parsedUserId = normalizeMovieId(userId);
  const parsedMovieId = normalizeMovieId(movieId);

  if (!parsedUserId || !parsedMovieId || !['like', 'dislike'].includes(action)) {
    return res.status(400).json({
      error: 'Request body must contain userId (integer), movieId (integer), and action (like or dislike).',
    });
  }

  const user = await getUserProfile(parsedUserId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const movieEmbedding = await getMovieEmbedding(parsedMovieId);
  if (!movieEmbedding) {
    return res.status(404).json({ error: 'Movie not found.' });
  }

  const likedMovies = Array.isArray(user.liked_movies) ? [...user.liked_movies] : [];
  const dislikedMovies = Array.isArray(user.disliked_movies) ? [...user.disliked_movies] : [];

  if (action === 'like') {
    if (!likedMovies.includes(parsedMovieId)) likedMovies.push(parsedMovieId);
    const index = dislikedMovies.indexOf(parsedMovieId);
    if (index >= 0) dislikedMovies.splice(index, 1);
  } else {
    if (!dislikedMovies.includes(parsedMovieId)) dislikedMovies.push(parsedMovieId);
    const index = likedMovies.indexOf(parsedMovieId);
    if (index >= 0) likedMovies.splice(index, 1);
  }

  const updatedEmbedding = computeUserEmbedding(user.user_embedding, movieEmbedding, action);

  await updateUserProfile(parsedUserId, likedMovies, dislikedMovies, updatedEmbedding);

  return res.json({
    success: true,
    userId: parsedUserId,
    movieId: parsedMovieId,
    action,
    user_embedding: updatedEmbedding,
  });
}

module.exports = {
  getProfile,
  getRecommendedMovies,
  handleInteraction,
};
