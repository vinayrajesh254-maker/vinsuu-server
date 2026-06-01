const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "vinsuu",
  password: "Vs@9430855989",
  port: 5432,
});

// test connection
pool.connect((err, client, release) => {

  if (err) {
    console.error("Database connection error:", err.stack);
  } else {
    console.log("PostgreSQL Connected");
  }

  release();

});

module.exports = pool;