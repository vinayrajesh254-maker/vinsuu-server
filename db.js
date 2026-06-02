const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// test connection
pool.connect((err, client, release) => {

  if (err) {
    console.error("Database connection error:", err.stack);
  } else {
    console.log("Neon PostgreSQL Connected");
  }

  release();

});

module.exports = pool;