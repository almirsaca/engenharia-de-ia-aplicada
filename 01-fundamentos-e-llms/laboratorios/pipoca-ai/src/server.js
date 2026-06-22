require('dotenv').config();
const express = require('express');
const { testConnection } = require('./db');
const { runSeed } = require('./seed');
const apiRouter = require('./routes/api');

const app = express();
app.use(express.json());

app.get('/', (req, res) => res.json({ status: 'ok' }));
app.use('/api', apiRouter);

app.post('/api/seed', async (req, res) => {
  try {
    await runSeed();
    res.json({ success: true, message: 'Seed executed successfully.' });
  } catch (error) {
    console.error('Seed endpoint failed:', error);
    res.status(500).json({ success: false, message: 'Seed failed.', error: error.message });
  }
});

const PORT = process.env.PORT || 3000;

(async function start() {
  try {
    await testConnection();
    console.log('Database connection OK');
    app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
  } catch (err) {
    console.error('Failed to connect to database during startup:', err);
    process.exit(1);
  }
})();
