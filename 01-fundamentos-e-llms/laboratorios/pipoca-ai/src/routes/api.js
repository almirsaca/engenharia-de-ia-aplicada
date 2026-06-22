const express = require('express');
const { getRecommendedMovies, handleInteraction } = require('../controllers/movieController');

const router = express.Router();

router.get('/movies', getRecommendedMovies);
router.post('/interactions', handleInteraction);

module.exports = router;
