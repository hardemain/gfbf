const { Pool } = require('pg');
const bcrypt = require('bcryptjs'); // was 'bcrypt'

// Database connectie
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Database setup
async function setupDatabase() {
  try {
    // Gebruikers tabel
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        points INTEGER DEFAULT 0
      )
    `);

    // Punten geschiedenis tabel
    await pool.query(`
      CREATE TABLE IF NOT EXISTS point_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        points_changed INTEGER,
        reason TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check of gebruikers al bestaan
    const result = await pool.query('SELECT COUNT(*) FROM users');
    const userCount = parseInt(result.rows[0].count);

    if (userCount === 0) {
      // Standaard gebruikers toevoegen
      const defaultPassword = 'liefde123';
      const hashedPassword = bcrypt.hashSync(defaultPassword, 10);
      
      await pool.query('INSERT INTO users (name, password, points) VALUES ($1, $2, $3)', ['Girlfriend', hashedPassword, 0]);
      await pool.query('INSERT INTO users (name, password, points) VALUES ($1, $2, $3)', ['Boyfriend', hashedPassword, 0]);
      
      console.log('🔐 Standaard wachtwoord voor beide gebruikers: liefde123');
    }

    console.log('✅ Database setup completed!');
  } catch (error) {
    console.error('💥 Database setup error:', error);
  }
}

// Database functies
const db = {
  // User ophalen
  async getUser(name) {
    const result = await pool.query('SELECT * FROM users WHERE name = $1', [name]);
    return result.rows[0];
  },

  // Alle users ophalen
  async getAllUsers() {
    const result = await pool.query('SELECT id, name, points FROM users ORDER BY name');
    return result.rows;
  },

  // User ophalen by ID
  async getUserById(id) {
    const result = await pool.query('SELECT id, name, points FROM users WHERE id = $1', [id]);
    return result.rows[0];
  },

  // Punten updaten
  async updatePoints(userId, change) {
    await pool.query('UPDATE users SET points = points + $1 WHERE id = $2', [change, userId]);
  },

  // Geschiedenis toevoegen
  async addHistory(userId, change, reason) {
    await pool.query('INSERT INTO point_history (user_id, points_changed, reason) VALUES ($1, $2, $3)', [userId, change, reason]);
  }
};

// Setup uitvoeren
setupDatabase();

module.exports = db;