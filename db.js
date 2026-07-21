const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false
  },

  // Better settings for Neon Free
  max: 3,
  min: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: true
});

// Test database connection
(async () => {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Neon PostgreSQL Connected");
  } catch (err) {
    console.error("❌ Database connection error:", err.message);
  }
})();

module.exports = pool;