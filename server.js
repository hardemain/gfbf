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
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('🔑 Login attempt for:', username);
  
  try {
    const user = await db.getUser(username);
    
    if (!user) {
      console.log('❌ User not found:', username);
      return res.status(401).json({ error: 'Gebruiker niet gevonden' });
    }
    
    console.log('👤 User found, checking password...');
    
    // Wachtwoord controleren
    const result = await bcrypt.compare(password, user.password);
    
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
  } catch (error) {
    console.error('💥 Login error:', error);
    res.status(500).json({ error: 'Server fout' });
  }
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
app.get('/api/points', requireAuth, async (req, res) => {
  console.log('📊 API /points called by user:', req.userName);
  
  try {
    const users = await db.getAllUsers();
    
    const response = {
      users: users,
      currentUser: { id: req.userId, name: req.userName }
    };
    
    console.log('📦 Sending points response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('💥 Database error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Punten aanpassen (alleen voor ingelogde gebruikers)
app.post('/api/points/:userId', requireAuth, async (req, res) => {
  const targetUserId = parseInt(req.params.userId);
  const currentUserId = req.userId;
  const { change, reason } = req.body;
  
  console.log(`🎯 ${req.userName} wants to change ${targetUserId} points by ${change}`);
  
  // Check: Je mag niet je eigen punten aanpassen!
  if (targetUserId === currentUserId) {
    console.log('❌ User tried to change own points');
    return res.status(403).json({ error: 'Je mag je eigen punten niet aanpassen! 😏' });
  }
  
  try {
    // Update punten
    await db.updatePoints(targetUserId, change);
    
    // Geschiedenis opslaan
    await db.addHistory(targetUserId, change, reason || 'Geen reden gegeven');
    
    // Nieuwe punten ophalen
    const updatedUser = await db.getUserByIdPublic(targetUserId);
    
    console.log('✅ Points updated:', updatedUser);
    res.json(updatedUser);
  } catch (error) {
    console.error('💥 Database error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Wachtwoord veranderen
app.post('/api/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.userId;
  
  console.log('🔑 Password change request for user:', req.userName);
  
  try {
    // Haal huidige gebruiker op
    const user = await db.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Gebruiker niet gevonden' });
    }
    
    // Check huidige wachtwoord
    const currentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    
    if (!currentPasswordValid) {
      console.log('❌ Wrong current password');
      return res.status(401).json({ error: 'Huidig wachtwoord is incorrect' });
    }
    
    // Valideer nieuw wachtwoord
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: 'Nieuw wachtwoord moet minimaal 4 tekens zijn' });
    }
    
    // Hash nieuw wachtwoord
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    
    // Update in database
    await db.updatePassword(userId, hashedNewPassword);
    
    console.log('✅ Password changed successfully for user:', req.userName);
    
    res.json({ 
      success: true, 
      message: 'Wachtwoord succesvol gewijzigd!' 
    });
    
  } catch (error) {
    console.error('💥 Password change error:', error);
    res.status(500).json({ error: 'Server fout bij wijzigen wachtwoord' });
  }
});
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(port, () => {
  console.log(`🎯 GFBF Punten App draait op poort ${port}`);
});