const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('./database');
const app = express();
const port = process.env.PORT || 3000;

// Middleware om JSON data te kunnen ontvangen
app.use(express.json());
app.use(express.static('public')); // Voor HTML/CSS/JS bestanden

// Session middleware (we gebruiken dit niet meer, maar laten het staan voor compatibiliteit)
app.use(session({
  secret: 'gfbf-secret-key-2024',
  resave: true,
  saveUninitialized: true,
  cookie: { 
    secure: false, 
    maxAge: 24 * 60 * 60 * 1000 // 24 uur
  }
}));

// Simpele in-memory store voor actieve tokens
const activeTokens = new Map(); // token -> { userId, userName }

// Token genereren
function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Middleware om token te checken
function requireAuth(req, res, next) {
  // Probeer token uit header OF query parameter
  const tokenFromHeader = req.headers.authorization?.replace('Bearer ', '');
  const tokenFromQuery = req.query.token;
  const token = tokenFromHeader || tokenFromQuery;
  
  console.log('🔐 Checking auth...');
  console.log('🔐 Token from header:', tokenFromHeader);
  console.log('🔐 Token from query:', tokenFromQuery);
  console.log('🔐 Using token:', token);
  console.log('🔐 Active tokens:', Array.from(activeTokens.keys()));
  
  if (!token || !activeTokens.has(token)) {
    console.log('❌ Auth failed - no valid token');
    return res.status(401).json({ error: 'Niet ingelogd' });
  }
  
  const user = activeTokens.get(token);
  req.userId = user.userId;
  req.userName = user.userName;
  console.log('✅ Auth success for user:', user.userName);
  next();
}

// API: Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  console.log('🔑 Login attempt for:', username);
  
  db.get('SELECT * FROM users WHERE name = ?', [username], (err, user) => {
    if (err) {
      console.error('💥 Database error:', err);
      return res.status(500).json({ error: err.message });
    }
    
    if (!user) {
      console.log('❌ User not found:', username);
      return res.status(401).json({ error: 'Gebruiker niet gevonden' });
    }
    
    console.log('👤 User found, checking password...');
    
    // Wachtwoord controleren
    bcrypt.compare(password, user.password, (err, result) => {
      if (err) {
        console.error('💥 Bcrypt error:', err);
        return res.status(500).json({ error: 'Server fout' });
      }
      
      if (!result) {
        console.log('❌ Wrong password for user:', username);
        return res.status(401).json({ error: 'Verkeerd wachtwoord' });
      }
      
      // Token genereren en opslaan
      const token = generateToken();
      activeTokens.set(token, {
        userId: user.id,
        userName: user.name
      });
      
      console.log('✅ Login successful! Token generated:', token);
      console.log('🎯 Active tokens now:', Array.from(activeTokens.keys()));
      
      res.json({ 
        success: true, 
        token: token,
        user: { id: user.id, name: user.name } 
      });
    });
  });
});

// API: Logout
app.post('/api/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token && activeTokens.has(token)) {
    activeTokens.delete(token);
    console.log('🚪 Token removed:', token);
  }
  
  res.json({ success: true });
});

// API: Check of ingelogd
app.get('/api/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  console.log('🔍 Checking token:', token);
  console.log('🔍 Active tokens:', Array.from(activeTokens.keys()));
  
  if (token && activeTokens.has(token)) {
    const user = activeTokens.get(token);
    console.log('✅ Token valid for user:', user.userName);
    res.json({ 
      loggedIn: true, 
      user: { id: user.userId, name: user.userName } 
    });
  } else {
    console.log('❌ Token not valid');
    res.json({ loggedIn: false });
  }
});

// API: Punten ophalen (alleen voor ingelogde gebruikers)
app.get('/api/points', requireAuth, (req, res) => {
  console.log('📊 API /points called by user:', req.userName);
  
  // LET OP: Alleen id, name, points selecteren (GEEN password!)
  db.all('SELECT id, name, points FROM users ORDER BY name', (err, rows) => {
    if (err) {
      console.error('💥 Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    const response = {
      users: rows,
      currentUser: { id: req.userId, name: req.userName }
    };
    
    console.log('📦 Sending points response:', JSON.stringify(response, null, 2));
    res.json(response);
  });
});

// API: Punten aanpassen (alleen voor ingelogde gebruikers)
app.post('/api/points/:userId', requireAuth, (req, res) => {
  const targetUserId = parseInt(req.params.userId);
  const currentUserId = req.userId;
  const { change, reason } = req.body;
  
  console.log(`🎯 ${req.userName} wants to change ${targetUserId} points by ${change}`);
  
  // Check: Je mag niet je eigen punten aanpassen!
  if (targetUserId === currentUserId) {
    console.log('❌ User tried to change own points');
    return res.status(403).json({ error: 'Je mag je eigen punten niet aanpassen! 😏' });
  }
  
  // Update punten
  db.run('UPDATE users SET points = points + ? WHERE id = ?', [change, targetUserId], function(err) {
    if (err) {
      console.error('💥 Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    // Geschiedenis opslaan
    db.run('INSERT INTO point_history (user_id, points_changed, reason) VALUES (?, ?, ?)', 
           [targetUserId, change, reason || 'Geen reden gegeven']);
    
    // Nieuwe punten ophalen (alleen id, name, points)
    db.get('SELECT id, name, points FROM users WHERE id = ?', [targetUserId], (err, row) => {
      if (err) {
        console.error('💥 Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log('✅ Points updated:', row);
      res.json(row);
    });
  });
});

// Hoofdpagina
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(port, () => {
  console.log(`🎯 GFBF Punten App draait op http://localhost:${port}`);
});