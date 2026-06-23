const express = require('express');
const { getProfile, getRecommendedMovies, handleInteraction } = require('../controllers/movieController');

const router = express.Router();

router.get('/profile', getProfile);
router.get('/movies', getRecommendedMovies);
router.post('/interactions', handleInteraction);

module.exports = router;
