const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

// Database bestand pad
const dbPath = path.join(__dirname, 'punten.db');

// Database connectie
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Fout bij database connectie:', err.message);
  } else {
    console.log('Database connectie succesvol!');
  }
});

// Tabel maken als die nog niet bestaat
db.serialize(() => {
  // Gebruikers tabel
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    points INTEGER DEFAULT 0
  )`);

  // Punten geschiedenis tabel (optioneel, voor later)
  db.run(`CREATE TABLE IF NOT EXISTS point_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    points_changed INTEGER,
    reason TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Standaard gebruikers toevoegen met wachtwoorden
  const defaultPassword = 'liefde123'; // Simpel standaard wachtwoord
  const hashedPassword = bcrypt.hashSync(defaultPassword, 10);
  
  db.run(`INSERT OR IGNORE INTO users (name, password, points) VALUES (?, ?, ?)`, ['Girlfriend', hashedPassword, 0]);
  db.run(`INSERT OR IGNORE INTO users (name, password, points) VALUES (?, ?, ?)`, ['Boyfriend', hashedPassword, 0]);
  
  console.log('🔐 Standaard wachtwoord voor beide gebruikers: liefde123');
});

module.exports = db;