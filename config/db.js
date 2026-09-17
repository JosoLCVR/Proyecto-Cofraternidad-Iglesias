const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 5432)
});

pool.on('error', error => {
  console.error('Error inesperado en el pool de PostgreSQL:', error);
});

module.exports = pool;