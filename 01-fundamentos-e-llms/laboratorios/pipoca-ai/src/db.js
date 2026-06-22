const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
  port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
  database: process.env.PGDATABASE || process.env.DB_NAME || 'pipoca_db',
  user: process.env.PGUSER || process.env.DB_USER || 'pipoca_user',
  password: process.env.PGPASSWORD || process.env.DB_PASS || 'pipoca_pass',
  max: 10,
  idleTimeoutMillis: 30000,
});

async function testConnection() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  testConnection,
};
