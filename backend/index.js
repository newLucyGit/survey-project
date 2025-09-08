// Load environment variables first
require('dotenv').config();

// ------------------- Security & Config -------------------
const SECRET = process.env.JWT_SECRET || (() => {
  console.error('CRITICAL SECURITY WARNING: JWT_SECRET not set!');
  return 'temporary-fallback-secret-CHANGE-IMMEDIATELY';
})();

const PORT = process.env.PORT || 5000;
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

// ------------------- Imports -------------------
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { body, param, query, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

// ------------------- Express Setup -------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(helmet());

// ------------------- DB Connection (Supabase) -------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Helper to convert ? placeholders to $1, $2 ...
function convertPlaceholders(sql) {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

// Translate SQLite-specific SQL into Postgres-safe
function translateSqlForPg(sql) {
  let out = sql;
  out = out.replace(/INSERT\s+OR\s+IGNORE\s+INTO/ig, 'INSERT INTO');
  if (/INSERT\s+INTO/i.test(out) && !/ON\s+CONFLICT/i.test(out)) {
    out = out.replace(/\)\s*;?\s*$/, ') ON CONFLICT DO NOTHING;');
  }
  return out;
}

// DB wrapper mimicking sqlite3 API
const db = {
  run: (sql, params = [], cb) => {
    if (typeof params === 'function') { cb = params; params = []; }
    const pgSql = convertPlaceholders(translateSqlForPg(sql));
    const isInsert = /^\s*INSERT\b/i.test(pgSql);
    let finalSql = pgSql;
    if (isInsert && !/RETURNING\s+/i.test(pgSql)) {
      finalSql = pgSql.replace(/;?\s*$/, ' RETURNING id;');
    }
    pool.query(finalSql, params)
      .then(res => {
        const stmt = { lastID: res.rows && res.rows[0] ? res.rows[0].id : undefined, changes: res.rowCount };
        if (cb) cb.call(stmt, null);
      })
      .catch(err => { if (cb) cb(err); else console.error('DB run error', err); });
  },
  get: (sql, params = [], cb) => {
    if (typeof params === 'function') { cb = params; params = []; }
    const pgSql = convertPlaceholders(translateSqlForPg(sql));
    pool.query(pgSql, params)
      .then(res => { if (cb) cb(null, res.rows[0]); })
      .catch(err => { if (cb) cb(err); else console.error('DB get error', err); });
  },
  all: (sql, params = [], cb) => {
    if (typeof params === 'function') { cb = params; params = []; }
    const pgSql = convertPlaceholders(translateSqlForPg(sql));
    pool.query(pgSql, params)
      .then(res => { if (cb) cb(null, res.rows); })
      .catch(err => { if (cb) cb(err); else console.error('DB all error', err); });
  }
};

// ------------------- Middleware -------------------
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

// ------------------- Routes -------------------
// Example: Login
app.post('/api/login',
  body('username').isString().notEmpty(),
  body('password').isString().notEmpty(),
  handleValidationErrors,
  (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      if (!user) return res.status(400).json({ error: 'Invalid credentials' });
      bcrypt.compare(password, user.password, (err, match) => {
        if (err || !match) return res.status(400).json({ error: 'Invalid credentials' });
        const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: JWT_EXPIRES_IN });
        res.json({ token });
      });
    });
  }
);

// Example: Protected route
app.get('/api/companies', authenticateToken, (req, res) => {
  db.all('SELECT * FROM companies', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(rows);
  });
});

// ------------------- Start Server -------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
