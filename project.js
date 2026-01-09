const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database(':memory:');

function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT
      )
    `);

    db.run(`
      CREATE TABLE doctors (
        id TEXT PRIMARY KEY,
        name TEXT,
        specialty TEXT,
        info TEXT
      )
    `);

    db.run(`
      CREATE TABLE appointments (
        id TEXT PRIMARY KEY,
        userId TEXT,
        doctorId TEXT,
        type TEXT,
        date TEXT,
        timeSlot TEXT,
        createdAt TEXT
      )
    `);

    const insertDoctor = db.prepare('INSERT INTO doctors (id, name, specialty, info) VALUES (?, ?, ?, ?)');
    insertDoctor.run(uuidv4(), 'Dr. Alice Carter', 'General Practitioner', 'Available Mon-Fri');
    insertDoctor.run(uuidv4(), 'Dr. Bob Nguyen', 'Pediatrics', 'Available Tue-Thu');
    insertDoctor.run(uuidv4(), 'Dr. Carol Patel', 'Emergency', '24/7');
    insertDoctor.finalize();

    const insertUser = db.prepare('INSERT INTO users (id, username, password) VALUES (?, ?, ?)');
    insertUser.run(uuidv4(), 'test@example.com', 'password');
    insertUser.finalize();
  });
}

initDb();

// Simple token-based auth (not secure, for demo only)
const tokens = new Map();

app.post('/api/signin', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    const token = uuidv4();
    tokens.set(token, { userId: row.id, username: row.username });
    res.json({ token });
  });
});

function requireAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(401).json({ error: 'Missing token' });
  const token = auth.replace('Bearer ', '');
  const user = tokens.get(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  req.user = user;
  next();
}

app.get('/api/doctors', (req, res) => {
  db.all('SELECT * FROM doctors', (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(rows);
  });
});

app.get('/api/appointments', requireAuth, (req, res) => {
  db.all('SELECT a.*, d.name as doctorName, d.specialty FROM appointments a JOIN doctors d ON a.doctorId = d.id WHERE a.userId = ?', [req.user.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(rows);
  });
});

app.post('/api/book', requireAuth, (req, res) => {
  const { doctorId, type, date, timeSlot } = req.body;
  if (!doctorId || !type || !date || !timeSlot) return res.status(400).json({ error: 'Missing fields' });
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  db.run('INSERT INTO appointments (id, userId, doctorId, type, date, timeSlot, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, req.user.userId, doctorId, type, date, timeSlot, createdAt], function(err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ id, doctorId, type, date, timeSlot, createdAt });
  });
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
