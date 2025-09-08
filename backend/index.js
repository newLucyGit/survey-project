// Load environment variables first
require('dotenv').config();

// Configuration from environment variables
const SECRET = process.env.JWT_SECRET || (() => {
  console.error('CRITICAL SECURITY WARNING: JWT_SECRET not set in environment variables!');
  console.error('Using default secret - THIS IS UNSAFE FOR PRODUCTION!');
  return 'temporary-fallback-secret-CHANGE-IMMEDIATELY';
})();

const PORT = process.env.PORT || 5000;
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { body, param, query, validationResult } = require('express-validator');
// ---------- Postgres (Supabase) DB wrapper (replaces sqlite3) ----------

const dotenv = require("dotenv");
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(helmet());

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // On many hosts (Render, Heroku) you need SSL with rejectUnauthorized false
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

function convertPlaceholders(sql){
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

function translateSqlForPg(sql){
  let out = sql;
  // Convert SQLite 'INSERT OR IGNORE' into Postgres 'INSERT ... ON CONFLICT DO NOTHING'
  out = out.replace(/INSERT\s+OR\s+IGNORE\s+INTO/ig, 'INSERT INTO');
  if (/INSERT\s+INTO/i.test(out) && !/ON\s+CONFLICT/i.test(out)) {
    // append ON CONFLICT DO NOTHING before trailing semicolon if not present
    out = out.replace(/\)\s*;?\s*$/, ') ON CONFLICT DO NOTHING;');
  }
  // ALTER TABLE ADD COLUMN -> IF NOT EXISTS (Postgres supports IF NOT EXISTS)
  out = out.replace(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+/ig, (m) => m.replace(/ADD COLUMN/i, 'ADD COLUMN IF NOT EXISTS'));
  return out;
}

const db = {
  run: (sql, params = [], cb) => {
    if (typeof params === 'function') { cb = params; params = []; }
    const translated = translateSqlForPg(sql);
    const pgSql = convertPlaceholders(translated);
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
      .catch(err => {
        if (cb) cb(err);
        else console.error('DB run error', err);
      });
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

// Note: we intentionally keep the existing initDb() function (if present) as-is in the file.
// The db.run/get/all wrapper above will make the existing initialization + seed code work against Postgres.
// -----------------------------------------------------------------------------
function initDb() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT
    )`);
    // Question Bank tables
    db.run(`CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      text TEXT,
      type TEXT CHECK(type IN ('mcq','text')),
      FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE,
      UNIQUE(category_id, text)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER,
      text TEXT,
      description TEXT,
      position INTEGER,
      FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE,
      UNIQUE(question_id, position)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      address TEXT,
      contact_email TEXT,
      created_at TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER,
      name TEXT,
      email TEXT,
      role TEXT,
      manager_id INTEGER,
      auth_code TEXT UNIQUE,
      created_at TEXT,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY(manager_id) REFERENCES employees(id) ON DELETE SET NULL
    )`);
    
    // Add auth_code column if it doesn't exist (for existing databases)
    db.run(`ALTER TABLE employees ADD COLUMN auth_code TEXT`, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding auth_code column:', err.message);
      }
    });
    
    // Survey tables
    db.run(`CREATE TABLE IF NOT EXISTS surveys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      company_id INTEGER NOT NULL,
      survey_type TEXT CHECK(survey_type IN ('pre', 'post', 'both')) NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT CHECK(status IN ('draft', 'active', 'completed', 'archived')) DEFAULT 'draft',
      url_token TEXT, -- single public URL token for this survey
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT
    )`);
    // Ensure url_token column exists (for existing DBs)
    db.all("PRAGMA table_info(surveys)", [], (err, columns) => {
      if (err) {
        console.error('Error checking surveys table structure:', err);
        return;
      }
      const hasUrlToken = columns.some(col => col.name === 'url_token');
      if (!hasUrlToken) {
        console.log('Adding url_token column to surveys table...');
        db.run('ALTER TABLE surveys ADD COLUMN url_token TEXT', (err) => {
          if (err) console.error('Error adding url_token column:', err.message);
        });
      }
    });
    // Create a unique index on url_token so each survey has a unique public URL
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_surveys_url_token ON surveys(url_token)`);
    
    db.run(`CREATE TABLE IF NOT EXISTS survey_feedback_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_id INTEGER NOT NULL,
      feedback_type TEXT CHECK(feedback_type IN ('self', 'manager', 'reportee', 'peer')) NOT NULL,
      is_enabled BOOLEAN DEFAULT 1,
      title TEXT,
      description TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
      UNIQUE(survey_id, feedback_type)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS survey_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_id INTEGER NOT NULL,
      feedback_type TEXT CHECK(feedback_type IN ('self', 'manager', 'reportee', 'peer')) NOT NULL,
      question_text TEXT NOT NULL,
      question_type TEXT CHECK(question_type IN ('mcq','text')) NOT NULL,
      category_name TEXT,
      position INTEGER NOT NULL,
      is_required BOOLEAN DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY(survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
      UNIQUE(survey_id, feedback_type, position)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS survey_question_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_question_id INTEGER NOT NULL,
      option_text TEXT NOT NULL,
      option_description TEXT,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(survey_question_id) REFERENCES survey_questions(id) ON DELETE CASCADE,
      UNIQUE(survey_question_id, position)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS survey_urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_id INTEGER NOT NULL,
      feedback_type TEXT CHECK(feedback_type IN ('self', 'manager', 'reportee', 'peer')) NOT NULL,
      url_token TEXT NOT NULL UNIQUE,
      is_active BOOLEAN DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY(survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
      UNIQUE(survey_id, feedback_type)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS survey_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_id INTEGER NOT NULL,
      feedback_type TEXT CHECK(feedback_type IN ('self', 'manager', 'reportee', 'peer')) NOT NULL,
      question_id INTEGER NOT NULL,
      response_text TEXT,
      employee_email TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      FOREIGN KEY(survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
      FOREIGN KEY(question_id) REFERENCES survey_questions(id) ON DELETE CASCADE
    )`);

    // Survey allowed participants (assignment per feedback type)
    db.run(`CREATE TABLE IF NOT EXISTS survey_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_id INTEGER NOT NULL,
      feedback_type TEXT CHECK(feedback_type IN ('self','manager','reportee','peer')) NOT NULL,
      employee_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
      FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      UNIQUE(survey_id, feedback_type, employee_id)
    )`);
    
    // Subjects (employees being evaluated) per survey
    db.run(`CREATE TABLE IF NOT EXISTS survey_subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
      FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      UNIQUE(survey_id, employee_id)
    )`);
    
    // Rater assignments per subject per feedback type (manager/peer/reportee)
    db.run(`CREATE TABLE IF NOT EXISTS survey_rater_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_id INTEGER NOT NULL,
      subject_employee_id INTEGER NOT NULL,
      rater_employee_id INTEGER NOT NULL,
      feedback_type TEXT CHECK(feedback_type IN ('manager','reportee','peer')) NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
      FOREIGN KEY(subject_employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY(rater_employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      UNIQUE(survey_id, subject_employee_id, rater_employee_id, feedback_type)
    )`);
    
    // Migration: Add employee_email column to existing survey_responses table if it doesn't exist
    db.all("PRAGMA table_info(survey_responses)", [], (err, columns) => {
      if (err) {
        console.error('Error checking survey_responses table structure:', err);
        return;
      }
      
      const hasEmployeeEmail = columns.some(col => col.name === 'employee_email');
      if (!hasEmployeeEmail) {
        console.log('Adding employee_email column to survey_responses table...');
        db.run('ALTER TABLE survey_responses ADD COLUMN employee_email TEXT', (err) => {
          if (err) {
            console.error('Error adding employee_email column:', err);
          } else {
            console.log('Successfully added employee_email column to survey_responses table');
          }
        });
      }
      // Add subject_employee_id column for 360 mapping
      const hasSubjectEmployeeId = columns.some(col => col.name === 'subject_employee_id');
      if (!hasSubjectEmployeeId) {
        console.log('Adding subject_employee_id column to survey_responses table...');
        db.run('ALTER TABLE survey_responses ADD COLUMN subject_employee_id INTEGER', (err) => {
          if (err) {
            console.error('Error adding subject_employee_id column:', err);
          } else {
            console.log('Successfully added subject_employee_id column to survey_responses table');
          }
        });
      }
    });
    // Migration: Add manager_id column to existing employees table if it doesn't exist
    db.all("PRAGMA table_info(employees)", [], (err, columns) => {
      if (err) {
        console.error('Error checking employees table structure:', err);
        return;
      }
      
      const hasManagerId = columns.some(col => col.name === 'manager_id');
      if (!hasManagerId) {
        console.log('Adding manager_id column to employees table...');
        db.run('ALTER TABLE employees ADD COLUMN manager_id INTEGER REFERENCES employees(id) ON DELETE SET NULL', (err) => {
          if (err) {
            console.error('Error adding manager_id column:', err);
          } else {
            console.log('Successfully added manager_id column to employees table');
          }
        });
      }
    });
    // Sample users with configurable bcrypt salt rounds
  const hash = bcrypt.hashSync(process.env.DEFAULT_ADMIN_PASSWORD || 'admin123', BCRYPT_SALT_ROUNDS);
  const chash = bcrypt.hashSync(process.env.DEFAULT_CREATOR_PASSWORD || 'creator123', BCRYPT_SALT_ROUNDS);
  db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, 'admin')`, [process.env.DEFAULT_ADMIN_USERNAME || 'admin', hash]);
  db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, 'creator')`, [process.env.DEFAULT_CREATOR_USERNAME || 'creator', chash]);
    // Sample companies
    db.run(`INSERT OR IGNORE INTO companies (id, name, address, contact_email, created_at) VALUES (1, 'Acme Corp', '123 Main St', 'info@acme.com', ?)`, [new Date().toISOString()]);
    db.run(`INSERT OR IGNORE INTO companies (id, name, address, contact_email, created_at) VALUES (2, 'Globex Inc', '456 Market Ave', 'contact@globex.com', ?)`, [new Date().toISOString()]);
    // Sample employees (ensure at least 1 for each company)
    db.run(`INSERT OR IGNORE INTO employees (id, company_id, name, email, role, manager_id, created_at) VALUES (1, 1, 'Alice Smith', 'alice@acme.com', 'CEO', NULL, ?)`, [new Date().toISOString()]);
    db.run(`INSERT OR IGNORE INTO employees (id, company_id, name, email, role, manager_id, created_at) VALUES (2, 1, 'Bob Jones', 'bob@acme.com', 'Manager', 1, ?)`, [new Date().toISOString()]);
    db.run(`INSERT OR IGNORE INTO employees (id, company_id, name, email, role, manager_id, created_at) VALUES (3, 2, 'Carol Lee', 'carol@globex.com', 'CEO', NULL, ?)`, [new Date().toISOString()]);
    db.run(`INSERT OR IGNORE INTO employees (id, company_id, name, email, role, manager_id, created_at) VALUES (4, 2, 'David Kim', 'david@globex.com', 'Engineer', 3, ?)`, [new Date().toISOString()]);
    db.run(`INSERT OR IGNORE INTO employees (id, company_id, name, email, role, manager_id, created_at) VALUES (5, 1, 'Emma Wilson', 'emma@acme.com', 'Developer', 2, ?)`, [new Date().toISOString()]);

    // Additional hierarchy for Company 1 (Acme) to support self/manager/peer/reportee flows
    // Manager under CEO Alice
    db.run(`INSERT INTO employees (company_id, name, email, role, manager_id, created_at)
      SELECT 1, 'Frank Miller', 'frank@acme.com', 'Manager', e.id, ?
      FROM employees e WHERE e.email = 'alice@acme.com'
      AND NOT EXISTS (SELECT 1 FROM employees WHERE email = 'frank@acme.com')`, [new Date().toISOString()]);
    // Team under Bob
    db.run(`INSERT INTO employees (company_id, name, email, role, manager_id, created_at)
      SELECT 1, 'Grace Lee', 'grace@acme.com', 'Engineer', e.id, ?
      FROM employees e WHERE e.email = 'bob@acme.com'
      AND NOT EXISTS (SELECT 1 FROM employees WHERE email = 'grace@acme.com')`, [new Date().toISOString()]);
    db.run(`INSERT INTO employees (company_id, name, email, role, manager_id, created_at)
      SELECT 1, 'Hank Patel', 'hank@acme.com', 'Engineer', e.id, ?
      FROM employees e WHERE e.email = 'bob@acme.com'
      AND NOT EXISTS (SELECT 1 FROM employees WHERE email = 'hank@acme.com')`, [new Date().toISOString()]);
    // Team under Frank
    db.run(`INSERT INTO employees (company_id, name, email, role, manager_id, created_at)
      SELECT 1, 'Ivy Chen', 'ivy@acme.com', 'Analyst', e.id, ?
      FROM employees e WHERE e.email = 'frank@acme.com'
      AND NOT EXISTS (SELECT 1 FROM employees WHERE email = 'ivy@acme.com')`, [new Date().toISOString()]);
    db.run(`INSERT INTO employees (company_id, name, email, role, manager_id, created_at)
      SELECT 1, 'Jack Brown', 'jack@acme.com', 'Analyst', e.id, ?
      FROM employees e WHERE e.email = 'frank@acme.com'
      AND NOT EXISTS (SELECT 1 FROM employees WHERE email = 'jack@acme.com')`, [new Date().toISOString()]);

    // Additional hierarchy for Company 2 (Globex)
    // Manager under CEO Carol
    db.run(`INSERT INTO employees (company_id, name, email, role, manager_id, created_at)
      SELECT 2, 'Nina Torres', 'nina@globex.com', 'Manager', e.id, ?
      FROM employees e WHERE e.email = 'carol@globex.com'
      AND NOT EXISTS (SELECT 1 FROM employees WHERE email = 'nina@globex.com')`, [new Date().toISOString()]);
    // Engineers under Carol (peers for David)
    db.run(`INSERT INTO employees (company_id, name, email, role, manager_id, created_at)
      SELECT 2, 'Olivia Park', 'olivia@globex.com', 'Engineer', e.id, ?
      FROM employees e WHERE e.email = 'carol@globex.com'
      AND NOT EXISTS (SELECT 1 FROM employees WHERE email = 'olivia@globex.com')`, [new Date().toISOString()]);
    db.run(`INSERT INTO employees (company_id, name, email, role, manager_id, created_at)
      SELECT 2, 'Ryan Scott', 'ryan@globex.com', 'Engineer', e.id, ?
      FROM employees e WHERE e.email = 'carol@globex.com'
      AND NOT EXISTS (SELECT 1 FROM employees WHERE email = 'ryan@globex.com')`, [new Date().toISOString()]);
    // Reportees under Nina
    db.run(`INSERT INTO employees (company_id, name, email, role, manager_id, created_at)
      SELECT 2, 'Paul Green', 'paul@globex.com', 'Analyst', e.id, ?
      FROM employees e WHERE e.email = 'nina@globex.com'
      AND NOT EXISTS (SELECT 1 FROM employees WHERE email = 'paul@globex.com')`, [new Date().toISOString()]);
    db.run(`INSERT INTO employees (company_id, name, email, role, manager_id, created_at)
      SELECT 2, 'Quinn Adams', 'quinn@globex.com', 'Designer', e.id, ?
      FROM employees e WHERE e.email = 'nina@globex.com'
      AND NOT EXISTS (SELECT 1 FROM employees WHERE email = 'quinn@globex.com')`, [new Date().toISOString()]);
    // Seed categories
    const categories = ['Purpose','Personal Development','Presence','People Skills','Practicalities','Principles'];
    categories.forEach(name => {
      db.run(`INSERT OR IGNORE INTO categories (name) VALUES (?)`, [name]);
    });

    // Helper to get category id by name
    function getCatId(name, cb) {
      db.get(`SELECT id FROM categories WHERE name = ?`, [name], (e, row) => cb(row?.id));
    }

    // Seed sample questions and options
    const mcqOptions = [
      { text: 'Curious', description: 'A strong desire to learn, explore, and understand the world.' },
      { text: 'Creative', description: 'The ability to think outside the box and generate original ideas.' },
      { text: 'Confident', description: 'Belief in one’s abilities and the courage to take risks.' },
      { text: 'Compassionate', description: 'Empathy and concern for the well-being of others.' },
      { text: 'Citizens of the World', description: 'Embracing global awareness and responsibility.' }
    ];

    getCatId('Purpose', (purposeId) => {
      if (!purposeId) return;
      const purposeQs = [
        'How well does this leader align their actions with the Purpose and Vision?',
        'To what extent does this leader’s sense of purpose incorporate positive impacts on society and a sustainable legacy?'
      ];
      purposeQs.forEach(qtext => {
        db.run(`INSERT OR IGNORE INTO questions (category_id, text, type) VALUES (?, ?, 'mcq')`, [purposeId, qtext], function(err){
          const qid = this?.lastID;
          if (!qid) return;
          mcqOptions.forEach((opt, idx) => {
            db.run(`INSERT OR IGNORE INTO options (question_id, text, description, position) VALUES (?, ?, ?, ?)`, [qid, opt.text, opt.description, idx+1]);
          });
        });
      });
    });

    const ftQs = [
      { cat: 'Personal Development', text: 'What should be celebrated about this leader’s personal qualities and performance?' },
      { cat: 'Personal Development', text: 'What areas for development do you suggest for this leader?' },
      { cat: 'Purpose', text: 'What advice do you have for this leader?' }
    ];
    ftQs.forEach(item => {
      getCatId(item.cat, (cid) => {
        if (!cid) return;
        db.run(`INSERT OR IGNORE INTO questions (category_id, text, type) VALUES (?, ?, 'text')`, [cid, item.text]);
      });
    });

    // Ensure at least one question exists in all categories
    // Presence - MCQ example
    getCatId('Presence', (presenceId) => {
      if (!presenceId) return;
      const qText = 'How effectively does this leader demonstrate executive presence in high-stakes situations?';
      db.run(`INSERT OR IGNORE INTO questions (category_id, text, type) VALUES (?, ?, 'mcq')`, [presenceId, qText], function(err){
        const qid = this?.lastID;
        if (!qid) return; // Already exists
        mcqOptions.forEach((opt, idx) => {
          db.run(`INSERT OR IGNORE INTO options (question_id, text, description, position) VALUES (?, ?, ?, ?)`, [qid, opt.text, opt.description, idx+1]);
        });
      });
    });
    // People Skills - Text example
    getCatId('People Skills', (cid) => {
      if (!cid) return;
      const text = 'Describe how this leader builds trust and collaboration within the team.';
      db.run(`INSERT OR IGNORE INTO questions (category_id, text, type) VALUES (?, ?, 'text')`, [cid, text]);
    });
    // Practicalities - MCQ example
    getCatId('Practicalities', (cid) => {
      if (!cid) return;
      const qText = 'How consistently does this leader deliver on commitments and operational priorities?';
      db.run(`INSERT OR IGNORE INTO questions (category_id, text, type) VALUES (?, ?, 'mcq')`, [cid, qText], function(err){
        const qid = this?.lastID;
        if (!qid) return;
        mcqOptions.forEach((opt, idx) => {
          db.run(`INSERT OR IGNORE INTO options (question_id, text, description, position) VALUES (?, ?, ?, ?)`, [qid, opt.text, opt.description, idx+1]);
        });
      });
    });
    // Principles - Text example
    getCatId('Principles', (cid) => {
      if (!cid) return;
      const text = 'Share an example of how this leader upheld ethics or values under pressure.';
      db.run(`INSERT OR IGNORE INTO questions (category_id, text, type) VALUES (?, ?, 'text')`, [cid, text]);
    });

    // Additional diversity: ensure each category has both MCQ and Text examples
    // Personal Development - add MCQ
    getCatId('Personal Development', (cid) => {
      if (!cid) return;
      const qText = 'How effectively does this leader pursue personal growth and learning?';
      db.run(`INSERT OR IGNORE INTO questions (category_id, text, type) VALUES (?, ?, 'mcq')`, [cid, qText], function(){
        const qid = this?.lastID;
        if (!qid) return;
        mcqOptions.forEach((opt, idx) => {
          db.run(`INSERT OR IGNORE INTO options (question_id, text, description, position) VALUES (?, ?, ?, ?)`, [qid, opt.text, opt.description, idx+1]);
        });
      });
    });
    // People Skills - add MCQ
    getCatId('People Skills', (cid) => {
      if (!cid) return;
      const qText = 'How effectively does this leader communicate and listen to colleagues?';
      db.run(`INSERT OR IGNORE INTO questions (category_id, text, type) VALUES (?, ?, 'mcq')`, [cid, qText], function(){
        const qid = this?.lastID;
        if (!qid) return;
        mcqOptions.forEach((opt, idx) => {
          db.run(`INSERT OR IGNORE INTO options (question_id, text, description, position) VALUES (?, ?, ?, ?)`, [qid, opt.text, opt.description, idx+1]);
        });
      });
    });
    // Principles - add MCQ
    getCatId('Principles', (cid) => {
      if (!cid) return;
      const qText = 'How consistently does this leader adhere to the organization\'s core values?';
      db.run(`INSERT OR IGNORE INTO questions (category_id, text, type) VALUES (?, ?, 'mcq')`, [cid, qText], function(){
        const qid = this?.lastID;
        if (!qid) return;
        mcqOptions.forEach((opt, idx) => {
          db.run(`INSERT OR IGNORE INTO options (question_id, text, description, position) VALUES (?, ?, ?, ?)`, [qid, opt.text, opt.description, idx+1]);
        });
      });
    });
    // Presence - add Text
    getCatId('Presence', (cid) => {
      if (!cid) return;
      const text = 'Describe a situation where this leader demonstrated strong executive presence.';
      db.run(`INSERT OR IGNORE INTO questions (category_id, text, type) VALUES (?, ?, 'text')`, [cid, text]);
    });
    // Practicalities - add Text
    getCatId('Practicalities', (cid) => {
      if (!cid) return;
      const text = 'What practical improvements could enhance this leader\'s delivery and execution?';
      db.run(`INSERT OR IGNORE INTO questions (category_id, text, type) VALUES (?, ?, 'text')`, [cid, text]);
    });

    // --- Seed one demo survey with 3 feedback types and participants ---
    function dateToYMD(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    }
    const seedSurveyTitle = 'Demo 360 Survey (Self/Manager/Peer)';
    db.get('SELECT id FROM surveys WHERE title = ?', [seedSurveyTitle], (err, existing) => {
      if (err) { console.error('Seed survey lookup failed:', err.message); return; }
      if (existing) return; // already seeded
      // Get a creator user id
      db.get('SELECT id FROM users WHERE role = ? ORDER BY id LIMIT 1', ['creator'], (e1, user) => {
        if (e1 || !user) { console.warn('No creator user found; skipping demo survey seed'); return; }
        const start = dateToYMD(new Date());
        const endDate = new Date(); endDate.setDate(endDate.getDate() + 14);
        const end = dateToYMD(endDate);
        const nowIso = new Date().toISOString();
        const urlToken = generateUrlToken();
        db.run(
          `INSERT INTO surveys (title, description, company_id, survey_type, start_date, end_date, status, url_token, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
          [seedSurveyTitle, 'Pre-seeded demo survey with sample questions and participants', 1, 'both', start, end, urlToken, user.id, nowIso, nowIso],
          function (e2) {
            if (e2) { console.error('Failed to create demo survey:', e2.message); return; }
            const surveyId = this.lastID;
            const fts = ['self', 'manager', 'reportee', 'peer'];
            // Insert feedback types
            fts.forEach(ft => {
              db.run(`INSERT OR IGNORE INTO survey_feedback_types (survey_id, feedback_type, is_enabled, title, description, created_at) VALUES (?, ?, 1, ?, ?, ?)`,
                [surveyId, ft, ft, `${ft} feedback`, nowIso]);
            });

            // Load a small set of bank questions to copy into survey for each type (2 MCQ + 1 Text)
            db.all(`SELECT q.id, q.text, q.type, c.name as category_name FROM questions q LEFT JOIN categories c ON q.category_id = c.id ORDER BY q.id`, [], (e3, allQs) => {
              if (e3 || !allQs || allQs.length === 0) { console.warn('No question bank found; skipping survey questions seed'); return; }
              const mcqs = allQs.filter(q => q.type === 'mcq');
              const texts = allQs.filter(q => q.type === 'text');
              const pickMcqs = mcqs.slice(0, Math.min(2, mcqs.length));
              const pickText = texts.slice(0, Math.min(1, texts.length));
              const chosen = [...pickMcqs, ...pickText];

              function copyOptionsIfAny(bankQId, surveyQuestionId, cb) {
                db.get('SELECT type FROM questions WHERE id = ?', [bankQId], (et, row) => {
                  if (et || !row || row.type !== 'mcq') return cb && cb();
                  db.all('SELECT text, description, position FROM options WHERE question_id = ? ORDER BY position', [bankQId], (eo, opts) => {
                    if (eo || !opts || opts.length === 0) return cb && cb();
                    let done = 0;
                    opts.forEach(opt => {
                      db.run(`INSERT OR IGNORE INTO survey_question_options (survey_question_id, option_text, option_description, position, created_at) VALUES (?, ?, ?, ?, ?)`,
                        [surveyQuestionId, opt.text, opt.description, opt.position, nowIso], () => {
                          done++; if (done === opts.length && cb) cb();
                        });
                    });
                  });
                });
              }

              function addQuestionsForType(ft, onDone) {
                if (chosen.length === 0) { onDone && onDone(); return; }
                let idx = 0;
                function next() {
                  if (idx >= chosen.length) { onDone && onDone(); return; }
                  const q = chosen[idx];
                  const pos = idx + 1;
                  db.run(
                    'INSERT INTO survey_questions (survey_id, feedback_type, question_text, question_type, category_name, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [surveyId, ft, q.text, q.type, q.category_name, pos, nowIso], function (e4) {
                      if (e4) { console.error('Insert survey_question failed:', e4.message); idx++; return next(); }
                      const sqId = this.lastID;
                      copyOptionsIfAny(q.id, sqId, () => { idx++; next(); });
                    }
                  );
                }
                next();
              }

              // Add for each feedback type, then seed participants
              let typesDone = 0;
              fts.forEach(ft => addQuestionsForType(ft, () => { typesDone++; if (typesDone === fts.length) seedParticipants(); }));

              function seedParticipants() {
                // Resolve employee ids by email for company 1 (Acme)
                const wantEmails = ['alice@acme.com','bob@acme.com','emma@acme.com','frank@acme.com','grace@acme.com','hank@acme.com'];
                db.all(`SELECT id, email FROM employees WHERE email IN (${wantEmails.map(()=>'?').join(',')})`, wantEmails, (e5, rows) => {
                  if (e5 || !rows) { console.warn('Could not resolve employees for participants'); return; }
                  const byEmail = Object.fromEntries(rows.map(r => [r.email, r.id]));
                  const idToEmail = Object.fromEntries(rows.map(r => [r.id, r.email]));
                  const picks = {
                    self: [byEmail['alice@acme.com'], byEmail['emma@acme.com']].filter(Boolean),
                    manager: [byEmail['bob@acme.com'], byEmail['frank@acme.com']].filter(Boolean),
                    reportee: [byEmail['grace@acme.com'], byEmail['hank@acme.com']].filter(Boolean),
                    peer: [byEmail['grace@acme.com'], byEmail['emma@acme.com']].filter(Boolean)
                  };
                  // Ensure self includes anyone selected for other types
                  const others = new Set([...(picks.manager||[]), ...(picks.reportee||[]), ...(picks.peer||[])]);
                  const selfSet = new Set(picks.self || []);
                  others.forEach(id => selfSet.add(id));
                  picks.self = Array.from(selfSet);
                  Object.entries(picks).forEach(([ft, ids]) => {
                    ids.forEach(eid => {
                      db.run('INSERT OR IGNORE INTO survey_participants (survey_id, feedback_type, employee_id, created_at) VALUES (?, ?, ?, ?)', [surveyId, ft, eid, nowIso]);
                    });
                  });

                  // Seed responses only if none exist yet for this survey
                  db.get('SELECT COUNT(*) as cnt FROM survey_responses WHERE survey_id = ?', [surveyId], (eCnt, rowCnt) => {
                    if (eCnt) { console.warn('Skip response seeding due to count error:', eCnt.message); return; }
                    if (rowCnt && rowCnt.cnt > 0) return; // already seeded
                    db.all('SELECT id, feedback_type, question_type FROM survey_questions WHERE survey_id = ? ORDER BY position', [surveyId], (e6, sqs) => {
                      if (e6 || !sqs) return;
                      const byType = sqs.reduce((acc, q) => { (acc[q.feedback_type] = acc[q.feedback_type] || []).push(q); return acc; }, {});
                      const textFor = (email, ft, idx) => `Seeded (${ft}) response ${idx+1} by ${email}`;
                      const seedForType = (ft) => {
                        const qs = byType[ft] || [];
                        (picks[ft] || []).forEach(eid => {
                          const email = idToEmail[eid];
                          qs.forEach((q, idx) => {
                            if (q.question_type === 'mcq') {
                              db.get('SELECT option_text FROM survey_question_options WHERE survey_question_id = ? ORDER BY position LIMIT 1', [q.id], (eo, opt) => {
                                const val = opt ? opt.option_text : 'Curious';
                                db.run(`INSERT INTO survey_responses (survey_id, feedback_type, question_id, response_text, employee_email, submitted_at) VALUES (?, ?, ?, ?, ?, ?)`,
                                  [surveyId, ft, q.id, val, email, nowIso]);
                              });
                            } else {
                              db.run(`INSERT INTO survey_responses (survey_id, feedback_type, question_id, response_text, employee_email, submitted_at) VALUES (?, ?, ?, ?, ?, ?)`,
                                [surveyId, ft, q.id, textFor(email, ft, idx), email, nowIso]);
                            }
                          });
                        });
                      };
                      fts.forEach(seedForType);
                    });
                  });
                });
              }
            });
          }
        );
      });
    });
  });
}

// Helpers for safe date comparisons (treat stored dates as date-only)
function toLocalStartOfDay(dateStr) {
  // dateStr like 'YYYY-MM-DD' -> local start of day
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m - 1), d, 0, 0, 0, 0);
}
function toLocalEndOfDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m - 1), d, 23, 59, 59, 999);
}

// Authentication code generator function
function generateAuthCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Function to ensure auth codes for existing employees
function ensureAuthCodes() {
  db.all('SELECT id, auth_code FROM employees WHERE auth_code IS NULL', [], (err, employees) => {
    if (err) {
      console.error('Error checking auth codes:', err);
      return;
    }
    
    employees.forEach(employee => {
      const authCode = generateAuthCode();
      db.run('UPDATE employees SET auth_code = ? WHERE id = ?', [authCode, employee.id], (err) => {
        if (err) {
          console.error(`Error setting auth code for employee ${employee.id}:`, err);
        } else {
          console.log(`Generated auth code ${authCode} for employee ${employee.id}`);
        }
      });
    });
  });
}

// Validation schemas
const loginValidation = [
  body('username')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
  body('password')
    .isLength({ min: 6, max: 128 })
    .withMessage('Password must be between 6 and 128 characters')
];

const companyValidation = [
  body('name')
    .isLength({ min: 1, max: 100 })
    .withMessage('Company name must be between 1 and 100 characters')
    .trim()
    .escape(),
  body('address')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Address must not exceed 200 characters')
    .trim()
    .escape(),
  body('contact_email')
    .optional()
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail()
];

const employeeValidation = [
  body('name')
    .isLength({ min: 1, max: 100 })
    .withMessage('Employee name must be between 1 and 100 characters')
    .trim()
    .escape(),
  body('email')
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),
  body('role')
    .isLength({ min: 1, max: 50 })
    .withMessage('Role must be between 1 and 50 characters')
    .trim()
    .escape(),
  body('company_id')
    .isInt({ min: 1 })
    .withMessage('Company ID must be a positive integer'),
  body('manager_id')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage('Manager ID must be a positive integer if provided')
];

const categoryValidation = [
  body('name')
    .isLength({ min: 1, max: 100 })
    .withMessage('Category name must be between 1 and 100 characters')
    .trim()
    .escape()
];

const questionValidation = [
  body('category_id')
    .isInt({ min: 1 })
    .withMessage('Category ID must be a positive integer'),
  body('text')
    .isLength({ min: 1, max: 500 })
    .withMessage('Question text must be between 1 and 500 characters')
    .trim(),
  body('type')
    .isIn(['mcq', 'text'])
    .withMessage('Question type must be either "mcq" or "text"'),
  body('options')
    .optional()
    .isArray({ min: 3, max: 7 })
    .withMessage('MCQ questions must have between 3 and 7 options')
];

const optionValidation = [
  body('text')
    .isLength({ min: 1, max: 200 })
    .withMessage('Option text must be between 1 and 200 characters')
    .trim(),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Option description must not exceed 500 characters')
    .trim(),
  body('position')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Position must be between 1 and 10')
];

const idParamValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer')
];

const companyIdParamValidation = [
  param('companyId')
    .isInt({ min: 1 })
    .withMessage('Company ID must be a positive integer')
];

const surveyValidation = [
  body('title')
    .isLength({ min: 1, max: 200 })
    .withMessage('Survey title must be between 1 and 200 characters')
    .trim()
    .escape(),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Survey description must not exceed 1000 characters')
    .trim(),
  body('company_id')
    .isInt({ min: 1 })
    .withMessage('Company ID must be a positive integer'),
  body('survey_type')
    .isIn(['pre', 'post', 'both'])
    .withMessage('Survey type must be pre, post, or both'),
  body('start_date')
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),
  body('end_date')
    .isISO8601()
    .withMessage('End date must be a valid ISO date')
    .custom((endDate, { req }) => {
      if (new Date(endDate) <= new Date(req.body.start_date)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
  body('feedback_types')
    .isArray({ min: 1 })
    .withMessage('At least one feedback type must be selected')
    .custom((feedbackTypes) => {
      const validTypes = ['self', 'manager', 'reportee', 'peer'];
      const hasValidTypes = feedbackTypes.every(ft => 
        validTypes.includes(ft.type) && 
        Array.isArray(ft.questions) && 
        ft.questions.length > 0
      );
      if (!hasValidTypes) {
        throw new Error('Each feedback type must have valid type and at least one question');
      }
      return true;
    })
];

app.get('/api/companies', authenticateToken, (req, res) => {
  // Both admin and creator can view companies (creator needs this for survey creation)
  if (req.user.role !== 'admin' && req.user.role !== 'creator') return res.sendStatus(403);
  db.all('SELECT * FROM companies', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/companies', authenticateToken, companyValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const { name, address, contact_email } = req.body;
  db.run('INSERT INTO companies (name, address, contact_email, created_at) VALUES (?, ?, ?, ?)', [name, address, contact_email, new Date().toISOString()], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

app.get('/api/companies/:id', authenticateToken, idParamValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  db.get('SELECT * FROM companies WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Company not found' });
    res.json(row);
  });
});

app.put('/api/companies/:id', authenticateToken, idParamValidation, companyValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const { name, address, contact_email } = req.body;
  db.run('UPDATE companies SET name = ?, address = ?, contact_email = ? WHERE id = ?', [name, address, contact_email, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes });
  });
});

app.delete('/api/companies/:id', authenticateToken, idParamValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  db.run('DELETE FROM companies WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});


// --- Employees CRUD ---
// List all employees (needed for EmployeeManager)
app.get('/api/employees', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'creator') return res.sendStatus(403);
  const sql = `
    SELECT e.*, 
           m.name as manager_name,
           c.name as company_name
    FROM employees e 
    LEFT JOIN employees m ON e.manager_id = m.id
    LEFT JOIN companies c ON e.company_id = c.id
    ORDER BY e.id
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.get('/api/companies/:companyId/employees', authenticateToken, companyIdParamValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'creator') return res.sendStatus(403);
  const sql = `
    SELECT e.*, 
           m.name as manager_name
    FROM employees e 
    LEFT JOIN employees m ON e.manager_id = m.id
    WHERE e.company_id = ?
    ORDER BY e.id
  `;
  db.all(sql, [req.params.companyId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get potential managers for a company (all employees in the same company)
app.get('/api/companies/:companyId/potential-managers', authenticateToken, companyIdParamValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'creator') return res.sendStatus(403);
  const excludeEmployeeId = req.query.exclude; // Optional: exclude specific employee to prevent self-management
  
  let sql = 'SELECT id, name, role FROM employees WHERE company_id = ?';
  let params = [req.params.companyId];
  
  if (excludeEmployeeId) {
    sql += ' AND id != ?';
    params.push(excludeEmployeeId);
  }
  
  sql += ' ORDER BY name';
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Add POST /api/employees endpoint for frontend compatibility
app.post('/api/employees', authenticateToken, employeeValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'creator') return res.sendStatus(403);
  const { name, email, role, company_id, manager_id } = req.body;
  if (!name || !email || !role || !company_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const authCode = generateAuthCode();
  
  // Validate manager belongs to same company if provided
  if (manager_id) {
    db.get('SELECT company_id FROM employees WHERE id = ?', [manager_id], (err, managerRow) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!managerRow) return res.status(400).json({ error: 'Manager not found' });
      if (managerRow.company_id !== company_id) {
        return res.status(400).json({ error: 'Manager must be from the same company' });
      }
      
      // Create employee with manager
      db.run('INSERT INTO employees (company_id, name, email, role, manager_id, auth_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', 
        [company_id, name, email, role, manager_id, authCode, new Date().toISOString()], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, auth_code: authCode });
      });
    });
  } else {
    // Create employee without manager
    db.run('INSERT INTO employees (company_id, name, email, role, manager_id, auth_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', 
      [company_id, name, email, role, null, authCode, new Date().toISOString()], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, auth_code: authCode });
    });
  }
});

app.post('/api/companies/:companyId/employees', authenticateToken, companyIdParamValidation, employeeValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'creator') return res.sendStatus(403);
  const { name, email, role, manager_id } = req.body;
  const companyId = req.params.companyId;
  
  const authCode = generateAuthCode();
  
  // Validate manager belongs to same company if provided
  if (manager_id) {
    db.get('SELECT company_id FROM employees WHERE id = ?', [manager_id], (err, managerRow) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!managerRow) return res.status(400).json({ error: 'Manager not found' });
      if (managerRow.company_id.toString() !== companyId) {
        return res.status(400).json({ error: 'Manager must be from the same company' });
      }
      
      // Create employee with manager
      db.run('INSERT INTO employees (company_id, name, email, role, manager_id, auth_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', 
        [companyId, name, email, role, manager_id, authCode, new Date().toISOString()], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, auth_code: authCode });
      });
    });
  } else {
    // Create employee without manager
    db.run('INSERT INTO employees (company_id, name, email, role, manager_id, auth_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', 
      [companyId, name, email, role, null, authCode, new Date().toISOString()], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, auth_code: authCode });
    });
  }
});

app.get('/api/employees/:id', authenticateToken, idParamValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'creator') return res.sendStatus(403);
  const sql = `
    SELECT e.*, 
           m.name as manager_name,
           c.name as company_name
    FROM employees e 
    LEFT JOIN employees m ON e.manager_id = m.id
    LEFT JOIN companies c ON e.company_id = c.id
    WHERE e.id = ?
  `;
  db.get(sql, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Employee not found' });
    res.json(row);
  });
});

app.put('/api/employees/:id', authenticateToken, idParamValidation, employeeValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'creator') return res.sendStatus(403);
  const { name, email, role, company_id, manager_id } = req.body;
  const employeeId = req.params.id;
  
  // Prevent self-management
  if (manager_id && manager_id.toString() === employeeId) {
    return res.status(400).json({ error: 'Employee cannot be their own manager' });
  }
  
  // Validate manager belongs to same company if provided
  if (manager_id) {
    db.get('SELECT company_id FROM employees WHERE id = ?', [manager_id], (err, managerRow) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!managerRow) return res.status(400).json({ error: 'Manager not found' });
      if (managerRow.company_id !== company_id) {
        return res.status(400).json({ error: 'Manager must be from the same company' });
      }
      
      // Update employee with manager
      db.run('UPDATE employees SET name = ?, email = ?, role = ?, company_id = ?, manager_id = ? WHERE id = ?', 
        [name, email, role, company_id, manager_id, employeeId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ updated: this.changes });
      });
    });
  } else {
    // Update employee without manager (set to null)
    db.run('UPDATE employees SET name = ?, email = ?, role = ?, company_id = ?, manager_id = ? WHERE id = ?', 
      [name, email, role, company_id, null, employeeId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    });
  }
});

app.delete('/api/employees/:id', authenticateToken, idParamValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'creator') return res.sendStatus(403);
  db.run('DELETE FROM employees WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// ----- Categories CRUD -----
app.get('/api/categories', authenticateToken, (req, res) => {
  db.all('SELECT * FROM categories ORDER BY name', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/categories', authenticateToken, categoryValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator') return res.sendStatus(403);
  const { name } = req.body;
  db.run('INSERT INTO categories (name) VALUES (?)', [name], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

app.put('/api/categories/:id', authenticateToken, idParamValidation, categoryValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator') return res.sendStatus(403);
  const { name } = req.body;
  db.run('UPDATE categories SET name = ? WHERE id = ?', [name, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes });
  });
});

app.delete('/api/categories/:id', authenticateToken, idParamValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator') return res.sendStatus(403);
  db.run('DELETE FROM categories WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// ----- Questions CRUD -----
app.get('/api/questions', authenticateToken, (req, res) => {
  const category_id = req.query.category_id;
  const sql = category_id ? 
    'SELECT q.*, c.name as category_name FROM questions q LEFT JOIN categories c ON q.category_id = c.id WHERE category_id = ? ORDER BY q.id' : 
    'SELECT q.*, c.name as category_name FROM questions q LEFT JOIN categories c ON q.category_id = c.id ORDER BY q.id';
  const params = category_id ? [category_id] : [];
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/questions/:id', authenticateToken, idParamValidation, handleValidationErrors, (req, res) => {
  db.get('SELECT * FROM questions WHERE id = ?', [req.params.id], (err, q) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!q) return res.status(404).json({ error: 'Question not found' });
    
    if (q.type === 'mcq') {
      db.all('SELECT * FROM options WHERE question_id = ? ORDER BY position', [q.id], (err2, options) => {
        if (err2) return res.status(500).json({ error: err2.message });
        q.options = options;
        res.json(q);
      });
    } else {
      res.json(q);
    }
  });
});

app.post('/api/questions', authenticateToken, questionValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator') return res.sendStatus(403);
  const { category_id, text, type, options } = req.body;
  
  db.run('INSERT INTO questions (category_id, text, type) VALUES (?, ?, ?)', [category_id, text, type], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    
    const questionId = this.lastID;
    
    if (type === 'mcq' && options && options.length > 0) {
      let optionsInserted = 0;
      options.forEach((option, index) => {
        db.run('INSERT INTO options (question_id, text, position) VALUES (?, ?, ?)', 
          [questionId, option.text, option.position || index + 1], function(err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          optionsInserted++;
          if (optionsInserted === options.length) {
            res.json({ id: questionId });
          }
        });
      });
    } else {
      res.json({ id: questionId });
    }
  });
});

app.put('/api/questions/:id', authenticateToken, idParamValidation, questionValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator') return res.sendStatus(403);
  const { category_id, text, type } = req.body;
  db.run('UPDATE questions SET category_id = COALESCE(?, category_id), text = COALESCE(?, text), type = COALESCE(?, type) WHERE id = ?', 
    [category_id, text, type, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes });
  });
});

app.post('/api/questions/:id/copy', authenticateToken, idParamValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator') return res.sendStatus(403);
  
  db.get('SELECT * FROM questions WHERE id = ?', [req.params.id], (err, q) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!q) return res.status(404).json({ error: 'Question not found' });
    
    const { new_text } = req.body;
    const copyText = new_text || `${q.text} (Copy)`;
    
    db.run('INSERT INTO questions (category_id, text, type) VALUES (?, ?, ?)', [q.category_id, copyText, q.type], function(err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      
      const newQuestionId = this.lastID;
      
      // If it's an MCQ, copy the options too
      if (q.type === 'mcq') {
        db.all('SELECT * FROM options WHERE question_id = ? ORDER BY position', [q.id], (err3, options) => {
          if (err3) return res.status(500).json({ error: err3.message });
          
          if (options.length === 0) {
            return res.json({ id: newQuestionId });
          }
          
          let optionsCopied = 0;
          options.forEach(option => {
            db.run('INSERT INTO options (question_id, text, position) VALUES (?, ?, ?)', 
              [newQuestionId, option.text, option.position], function(err4) {
              if (err4) return res.status(500).json({ error: err4.message });
              optionsCopied++;
              if (optionsCopied === options.length) {
                res.json({ id: newQuestionId });
              }
            });
          });
        });
      } else {
        res.json({ id: newQuestionId });
      }
    });
  });
});

app.delete('/api/questions/:id', authenticateToken, idParamValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator') return res.sendStatus(403);
  db.run('DELETE FROM questions WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// ----- Options CRUD -----
app.get('/api/questions/:id/options', authenticateToken, idParamValidation, handleValidationErrors, (req, res) => {
  db.all('SELECT * FROM options WHERE question_id = ? ORDER BY position', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/questions/:id/options', authenticateToken, idParamValidation, optionValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator') return res.sendStatus(403);
  
  db.get('SELECT type FROM questions WHERE id = ?', [req.params.id], (err, q) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!q) return res.status(404).json({ error: 'Question not found' });
    if (q.type !== 'mcq') return res.status(400).json({ error: 'Options can only be added to MCQ questions' });
    
    const { text, position } = req.body;
    db.run('INSERT INTO options (question_id, text, position) VALUES (?, ?, ?)', [req.params.id, text, position], function(err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ id: this.lastID });
    });
  });
});

// ----- Surveys CRUD -----
// Get all surveys (creator can see all, admin can see all)
app.get('/api/surveys', authenticateToken, (req, res) => {
  if (req.user.role !== 'creator' && req.user.role !== 'admin') return res.sendStatus(403);
  
  const sql = `
    SELECT s.*, 
           c.name as company_name,
           u.username as created_by_username,
           COUNT(sq.id) as question_count
    FROM surveys s
    LEFT JOIN companies c ON s.company_id = c.id
    LEFT JOIN users u ON s.created_by = u.id
    LEFT JOIN survey_questions sq ON s.id = sq.survey_id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `;
  
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create a new survey with selected questions
app.post('/api/surveys', authenticateToken, surveyValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator') return res.sendStatus(403);
  
  const { title, description, company_id, survey_type, start_date, end_date, feedback_types } = req.body;
  const now = new Date().toISOString();
  
  // Start a transaction to ensure data consistency
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // Create the survey
    db.run(
      'INSERT INTO surveys (title, description, company_id, survey_type, start_date, end_date, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [title, description || '', company_id, survey_type, start_date, end_date, req.user.id, now, now],
      function(err) {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: err.message });
        }
        
        const surveyId = this.lastID;
        
        let feedbackTypesProcessed = 0;
        let totalQuestionsToProcess = 0;
        let questionsProcessed = 0;
        let hasError = false;
        
        // Count total questions to process
        feedback_types.forEach(feedbackType => {
          totalQuestionsToProcess += feedbackType.questions.length;
        });
        
        if (totalQuestionsToProcess === 0) {
          db.run('COMMIT');
          return res.json({ id: surveyId, message: 'Survey created successfully' });
        }
        
        // Process each feedback type
        feedback_types.forEach((feedbackType) => {
          const { type, title: feedbackTitle, description: feedbackDescription, questions } = feedbackType;
          
          // Insert feedback type record
          db.run(
            'INSERT INTO survey_feedback_types (survey_id, feedback_type, title, description, created_at) VALUES (?, ?, ?, ?, ?)',
            [surveyId, type, feedbackTitle || type, feedbackDescription || '', now],
            function(err) {
              if (err) {
                if (!hasError) {
                  hasError = true;
                  db.run('ROLLBACK');
                  return res.status(500).json({ error: err.message });
                }
                return;
              }
              
              // Process questions for this feedback type
              questions.forEach((selectedQ, index) => {
                // Get the original question details
                db.get(
                  'SELECT q.*, c.name as category_name FROM questions q LEFT JOIN categories c ON q.category_id = c.id WHERE q.id = ?',
                  [selectedQ.id],
                  (err, question) => {
                    if (err || !question) {
                      if (!hasError) {
                        hasError = true;
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Failed to find question: ' + selectedQ.id });
                      }
                      return;
                    }
                    
                    // Insert the question copy with feedback type
                    db.run(
                      'INSERT INTO survey_questions (survey_id, feedback_type, question_text, question_type, category_name, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                      [surveyId, type, question.text, question.type, question.category_name, selectedQ.position || index + 1, now],
                      function(err) {
                        if (err) {
                          if (!hasError) {
                            hasError = true;
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: err.message });
                          }
                          return;
                        }
                        
                        const surveyQuestionId = this.lastID;
                        
                        // If it's an MCQ, copy the options
                        if (question.type === 'mcq') {
                          db.all('SELECT * FROM options WHERE question_id = ? ORDER BY position', [question.id], (err, options) => {
                            if (err) {
                              if (!hasError) {
                                hasError = true;
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: err.message });
                              }
                              return;
                            }
                            
                            if (options.length > 0) {
                              let optionsProcessed = 0;
                              options.forEach(option => {
                                db.run(
                                  'INSERT INTO survey_question_options (survey_question_id, option_text, option_description, position, created_at) VALUES (?, ?, ?, ?, ?)',
                                  [surveyQuestionId, option.text, option.description, option.position, now],
                                  (err) => {
                                    if (err && !hasError) {
                                      hasError = true;
                                      db.run('ROLLBACK');
                                      return res.status(500).json({ error: err.message });
                                    }
                                    
                                    optionsProcessed++;
                                    if (optionsProcessed === options.length) {
                                      questionsProcessed++;
                                      if (questionsProcessed === totalQuestionsToProcess && !hasError) {
                                        db.run('COMMIT');
                                        res.json({ id: surveyId, message: 'Survey created successfully' });
                                      }
                                    }
                                  }
                                );
                              });
                            } else {
                              questionsProcessed++;
                              if (questionsProcessed === totalQuestionsToProcess && !hasError) {
                                db.run('COMMIT');
                                res.json({ id: surveyId, message: 'Survey created successfully' });
                              }
                            }
                          });
                        } else {
                          // Text question, no options to copy
                          questionsProcessed++;
                          if (questionsProcessed === totalQuestionsToProcess && !hasError) {
                            db.run('COMMIT');
                            res.json({ id: surveyId, message: 'Survey created successfully' });
                          }
                        }
                      }
                    );
                  }
                );
              });
              
              feedbackTypesProcessed++;
            }
          );
        });
      }
    );
  });
});

// Get a specific survey with its questions
app.get('/api/surveys/:id', authenticateToken, idParamValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator' && req.user.role !== 'admin') return res.sendStatus(403);
  
  // Get survey details
  const surveySQL = `
    SELECT s.*, 
           c.name as company_name,
           u.username as created_by_username
    FROM surveys s
    LEFT JOIN companies c ON s.company_id = c.id
    LEFT JOIN users u ON s.created_by = u.id
    WHERE s.id = ?
  `;
  
  db.get(surveySQL, [req.params.id], (err, survey) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    
    // Get survey feedback types
    const feedbackTypesSQL = `
      SELECT feedback_type, title, description
      FROM survey_feedback_types
      WHERE survey_id = ?
      ORDER BY feedback_type
    `;
    
    db.all(feedbackTypesSQL, [req.params.id], (err, feedbackTypes) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // Get survey questions grouped by feedback type
      const questionsSQL = `
        SELECT sq.*, 
               GROUP_CONCAT(
                 CASE WHEN sqo.id IS NOT NULL 
                 THEN json_object('id', sqo.id, 'text', sqo.option_text, 'description', sqo.option_description, 'position', sqo.position)
                 END
               ) as options_json
        FROM survey_questions sq
        LEFT JOIN survey_question_options sqo ON sq.id = sqo.survey_question_id
        WHERE sq.survey_id = ?
        GROUP BY sq.id
        ORDER BY sq.feedback_type, sq.position
      `;
      
      db.all(questionsSQL, [req.params.id], (err, questions) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Parse options JSON for MCQ questions
        questions.forEach(question => {
          if (question.question_type === 'mcq' && question.options_json) {
            try {
              const optionsStr = '[' + question.options_json + ']';
              question.options = JSON.parse(optionsStr);
            } catch (e) {
              question.options = [];
            }
          } else {
            question.options = [];
          }
          delete question.options_json;
        });
        
        // Group questions by feedback type
        const questionsByFeedbackType = {};
        questions.forEach(question => {
          const feedbackType = question.feedback_type;
          if (!questionsByFeedbackType[feedbackType]) {
            questionsByFeedbackType[feedbackType] = [];
          }
          questionsByFeedbackType[feedbackType].push(question);
        });
        
        // Structure response with feedback types and their questions
        survey.feedback_types = feedbackTypes.map(ft => ({
          type: ft.feedback_type,
          title: ft.title,
          description: ft.description,
          questions: questionsByFeedbackType[ft.feedback_type] || []
        }));
        
        // Keep backward compatibility
        survey.questions = questions;
        
        res.json(survey);
      });
    });
  });
});

// Update survey
app.put('/api/surveys/:id', authenticateToken, idParamValidation, [
  body('title').notEmpty().withMessage('Title is required'),
  body('description').optional(),
  body('company_id').isInt().withMessage('Company ID must be an integer'),
  body('survey_type').isIn(['pre', 'post', 'both']).withMessage('Invalid survey type'),
  body('start_date').isISO8601().withMessage('Invalid start date'),
  body('end_date').isISO8601().withMessage('Invalid end date'),
  body('feedback_types').isArray().withMessage('Feedback types must be an array')
], handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator' && req.user.role !== 'admin') return res.sendStatus(403);
  
  const { title, description, company_id, survey_type, start_date, end_date, feedback_types } = req.body;
  const now = new Date().toISOString();
  
  // First update the survey basic information
  db.run(`UPDATE surveys SET 
    title = ?, description = ?, company_id = ?, survey_type = ?, 
    start_date = ?, end_date = ?, updated_at = ? 
    WHERE id = ?`, 
    [title, description, company_id, survey_type, start_date, end_date, now, req.params.id], 
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Survey not found' });
      
      // Delete existing feedback types and questions for this survey
      db.run('DELETE FROM survey_feedback_types WHERE survey_id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.run('DELETE FROM survey_questions WHERE survey_id = ?', [req.params.id], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          
          // Insert updated feedback types and questions
          if (feedback_types && feedback_types.length > 0) {
            let feedbackTypesInserted = 0;
            
            feedback_types.forEach(ft => {
              db.run(`INSERT INTO survey_feedback_types 
                (survey_id, feedback_type, is_enabled, title, description, created_at) 
                VALUES (?, ?, ?, ?, ?, ?)`,
                [req.params.id, ft.type, 1, ft.title, ft.description, now], function(err) {
                  if (err) return res.status(500).json({ error: err.message });
                  
                  // Insert questions for this feedback type
                  if (ft.questions && ft.questions.length > 0) {
                    ft.questions.forEach(q => {
                      if (q.is_existing) {
                        // Update existing survey question (preserve decoupling)
                        db.run(`INSERT INTO survey_questions 
                          (survey_id, feedback_type, question_text, question_type, category_name, position, created_at) 
                          VALUES (?, ?, ?, ?, ?, ?, ?)`,
                          [req.params.id, ft.type, q.question_text, q.question_type, q.category_name, q.position, now], (err) => {
                            if (err) console.error('Error inserting existing survey question:', err.message);
                          });
                      } else {
                        // Insert new question from question bank
                        db.run(`INSERT INTO survey_questions 
                          (survey_id, feedback_type, question_text, question_type, category_name, position, created_at) 
                          SELECT ?, ?, questions.text, questions.type, categories.name, ?, ?
                          FROM questions 
                          LEFT JOIN categories ON questions.category_id = categories.id 
                          WHERE questions.id = ?`,
                          [req.params.id, ft.type, q.position, now, q.id], function(err) {
                            if (err) {
                              console.error('Error inserting new survey question:', err.message);
                              return;
                            }
                            const newSurveyQuestionId = this.lastID;
                            // Copy MCQ options from question bank into survey question options if applicable
                            db.get('SELECT type FROM questions WHERE id = ?', [q.id], (err2, row) => {
                              if (err2 || !row) return;
                              if (row.type === 'mcq') {
                                db.all('SELECT text, description, position FROM options WHERE question_id = ? ORDER BY position', [q.id], (err3, opts) => {
                                  if (err3 || !opts) return;
                                  opts.forEach(opt => {
                                    db.run(`INSERT INTO survey_question_options (survey_question_id, option_text, option_description, position, created_at) VALUES (?, ?, ?, ?, ?)`,
                                      [newSurveyQuestionId, opt.text, opt.description, opt.position, now]);
                                  });
                                });
                              }
                            });
                          });
                      }
                    });
                  }
                  
                  feedbackTypesInserted++;
                  if (feedbackTypesInserted === feedback_types.length) {
                    res.json({ id: req.params.id, updated: true });
                  }
                });
            });
          } else {
            res.json({ id: req.params.id, updated: true });
          }
        });
      });
    });
});

// Update survey status
app.put('/api/surveys/:id/status', authenticateToken, idParamValidation, [
  body('status').isIn(['draft', 'active', 'completed', 'archived']).withMessage('Invalid status')
], handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator') return res.sendStatus(403);
  
  const { status } = req.body;
  const now = new Date().toISOString();
  
  db.run('UPDATE surveys SET status = ?, updated_at = ? WHERE id = ?', [status, now, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes });
  });
});

// Start survey - Generate single URL token and set status to active
app.post('/api/surveys/:id/start', authenticateToken, idParamValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator') return res.sendStatus(403);
  
  const surveyId = req.params.id;
  const now = new Date().toISOString();
  
  // First check if survey exists and is in draft status
  db.get('SELECT id, status, title FROM surveys WHERE id = ?', [surveyId], (err, survey) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    if (survey.status !== 'draft') {
      return res.status(400).json({ error: 'Survey can only be started from draft status' });
    }
    // Ensure at least one feedback type is enabled
    db.get('SELECT COUNT(*) as cnt FROM survey_feedback_types WHERE survey_id = ? AND is_enabled = 1', [surveyId], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row || row.cnt === 0) return res.status(400).json({ error: 'No feedback types enabled for this survey' });

      const urlToken = generateUrlToken();
      db.run('UPDATE surveys SET status = ?, updated_at = ?, url_token = ? WHERE id = ?', ['active', now, urlToken, surveyId], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        // Clean up any legacy per-type URLs for this survey to avoid confusion
        db.run('DELETE FROM survey_urls WHERE survey_id = ?', [surveyId], () => {
          // ignore errors here
          res.json({
            message: 'Survey started successfully',
            survey_id: surveyId,
            survey_title: survey.title,
            status: 'active',
            url: `${FRONTEND_BASE_URL}/survey/${urlToken}`,
            url_token: urlToken
          });
        });
      });
    });
  });
});

// Function to generate unique URL tokens
function generateUrlToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Get survey URL for a survey (single URL)
app.get('/api/surveys/:id/urls', authenticateToken, idParamValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator') return res.sendStatus(403);
  const surveyId = req.params.id;
  db.get('SELECT url_token, status FROM surveys WHERE id = ?', [surveyId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row || !row.url_token) return res.status(404).json({ error: 'Survey has no public URL. Start the survey first.' });
    const result = [{
      feedback_type: 'all',
      url_token: row.url_token,
      is_active: row.status === 'active',
      created_at: null,
      url: `${FRONTEND_BASE_URL}/survey/${row.url_token}`
    }];
    res.json(result);
  });
});

// Delete survey
app.delete('/api/surveys/:id', authenticateToken, idParamValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator') return res.sendStatus(403);
  
  db.run('DELETE FROM surveys WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// List survey responses (admin/creator)
app.get('/api/surveys/:id/responses', authenticateToken, idParamValidation, [
  query('feedback_type').optional().isIn(['self','manager','reportee','peer']).withMessage('Invalid feedback_type')
], handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator' && req.user.role !== 'admin') return res.sendStatus(403);
  const surveyId = req.params.id;
  const feedbackType = req.query.feedback_type;
  const params = [surveyId];
  let sql = `
    SELECT r.id as response_id,
           r.employee_email,
           r.feedback_type,
           r.question_id,
           q.question_text,
           q.question_type,
           q.category_name,
           q.position,
           r.response_text,
           r.submitted_at
    FROM survey_responses r
    JOIN survey_questions q ON r.question_id = q.id
    WHERE r.survey_id = ?`;
  if (feedbackType) {
    sql += ' AND r.feedback_type = ?';
    params.push(feedbackType);
  }
  sql += ' ORDER BY r.employee_email, r.feedback_type, q.position';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Employee authentication endpoint using auth code
app.post('/api/employee-auth', [
  body('auth_code')
    .isLength({ min: 8, max: 8 })
    .withMessage('Auth code must be exactly 8 characters')
    .matches(/^[A-Z0-9]+$/)
    .withMessage('Auth code must contain only uppercase letters and numbers')
], handleValidationErrors, (req, res) => {
  const { auth_code } = req.body;
  
  db.get(`
    SELECT e.*, c.name as company_name 
    FROM employees e 
    LEFT JOIN companies c ON e.company_id = c.id 
    WHERE e.auth_code = ?
  `, [auth_code], (err, employee) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!employee) return res.status(401).json({ message: 'Invalid authentication code' });
    
    // Generate a JWT token for the employee (different from admin/creator tokens)
    const token = jwt.sign({ 
      id: employee.id, 
      name: employee.name, 
      email: employee.email,
      company_id: employee.company_id,
      role: 'employee' 
    }, SECRET, { expiresIn: '24h' }); // Longer expiry for survey participants
    
    res.json({ 
      token, 
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        company_name: employee.company_name,
        role: employee.role
      }
    });
  });
});

// Regenerate auth code for an employee (admin only)
app.put('/api/employees/:id/regenerate-auth-code', authenticateToken, idParamValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'creator') return res.sendStatus(403);
  
  const newAuthCode = generateAuthCode();
  
  db.run('UPDATE employees SET auth_code = ? WHERE id = ?', [newAuthCode, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Employee not found' });
    
    res.json({ auth_code: newAuthCode });
  });
});

// Get employee auth code (admin only)
app.get('/api/employees/:id/auth-code', authenticateToken, idParamValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'creator') return res.sendStatus(403);
  
  db.get('SELECT auth_code FROM employees WHERE id = ?', [req.params.id], (err, employee) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    
    res.json({ auth_code: employee.auth_code });
  });
});

initDb();
// Ensure auth codes are generated for existing employees
setTimeout(() => {
  ensureAuthCodes();
}, 1000);

// Auth middleware
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

// Routes
app.post('/api/login', loginValidation, handleValidationErrors, (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err || !user) return res.status(401).json({ message: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ token, role: user.role });
  });
});

app.get('/api/users', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  db.all('SELECT id, username, role FROM users', [], (err, users) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(users);
  });
});

// ============================================
// SURVEY TAKING ENDPOINTS (PUBLIC ACCESS)
// ============================================

// Validate survey token (lightweight check) - single URL per survey
app.get('/api/validate-survey-token/:token', [
  param('token').isLength({ min: 32, max: 32 }).withMessage('Invalid token format')
], handleValidationErrors, (req, res) => {
  const token = req.params.token;
  db.get(`SELECT id as survey_id, title, description, status, start_date, end_date
          FROM surveys
          WHERE url_token = ? AND status = 'active'`, [token], (err, surveyData) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!surveyData) return res.status(404).json({ error: 'Survey not found or no longer active' });

    const now = new Date();
    const startDate = toLocalStartOfDay(surveyData.start_date);
    const endDate = toLocalEndOfDay(surveyData.end_date);
    if (now < startDate) return res.status(400).json({ error: 'Survey has not started yet' });
    if (now > endDate) return res.status(400).json({ error: 'Survey has expired' });

    res.json({
      title: surveyData.title,
      description: surveyData.description
    });
  });
});

// Authenticate survey participant
app.post('/api/authenticate-survey-participant', [
  body('survey_token').isLength({ min: 32, max: 32 }).withMessage('Invalid survey token'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('auth_code').isLength({ min: 8, max: 8 }).withMessage('Auth code must be 8 characters'),
  body('selected_feedback_type').optional().isIn(['self','manager','reportee','peer']).withMessage('Invalid feedback type')
], handleValidationErrors, (req, res) => {
  const { survey_token, selected_feedback_type } = req.body;
  const email = req.body.email.toLowerCase().trim();
  const auth_code = req.body.auth_code.toUpperCase().trim();

  // Validate the survey token (single URL)
  db.get(`SELECT s.id as survey_id, s.title, s.description, s.status, s.start_date, s.end_date, s.company_id
          FROM surveys s
          WHERE s.url_token = ? AND s.status = 'active'`, 
         [survey_token], (err, surveyData) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!surveyData) return res.status(404).json({ error: 'Invalid survey token' });

    // Check if survey is within date range
    const now = new Date();
    const startDate = toLocalStartOfDay(surveyData.start_date);
    const endDate = toLocalEndOfDay(surveyData.end_date);
    if (now < startDate) return res.status(400).json({ error: 'Survey has not started yet' });
    if (now > endDate) return res.status(400).json({ error: 'Survey has expired' });

    // Authenticate employee for the company
    db.get(`SELECT id, name, email FROM employees
            WHERE email = ? AND auth_code = ? AND company_id = ?`,
            [email, auth_code, surveyData.company_id], (err, employee) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!employee) return res.status(401).json({ error: 'Invalid email or authorization code' });

      // Determine allowed feedback types from flat assignments
      db.all('SELECT feedback_type FROM survey_participants WHERE survey_id = ? AND employee_id = ?', [surveyData.survey_id, employee.id], (err2, rows) => {
        if (err2) return res.status(500).json({ error: err2.message });
        const allowedList = (rows || []).map(r => r.feedback_type);
        if (allowedList.length === 0) return res.status(403).json({ error: 'You are not assigned to this survey' });
        const chosenType = selected_feedback_type || (allowedList.length === 1 ? allowedList[0] : null);
        if (!chosenType) {
          return res.json({
            survey: {
              id: surveyData.survey_id,
              title: surveyData.title,
              description: surveyData.description,
              start_date: surveyData.start_date,
              end_date: surveyData.end_date
            },
            allowed_feedback_types: allowedList,
            participant: { name: employee.name, email: employee.email }
          });
        }
        // Prevent duplicate submission for this employee + chosen type (no subject scoping)
        db.get(`SELECT COUNT(*) as count FROM survey_responses 
                WHERE survey_id = ? AND feedback_type = ? AND employee_email = ?`,
              [surveyData.survey_id, chosenType, email], (err3, cnt) => {
          if (err3) return res.status(500).json({ error: err3.message });
          if (cnt.count > 0) return res.status(400).json({ error: 'You have already submitted responses for this survey' });
          // Load questions
          loadQuestionsAndRespondSimple(surveyData, chosenType, employee, allowedList, res);
        });
      });
    });
  });
});

// Helper to load questions and send response payload (flat assignments)
function loadQuestionsAndRespondSimple(surveyData, feedbackType, employee, allowedTypes, res) {
  db.all(`SELECT sq.id, sq.question_text, sq.question_type, sq.category_name,
                 sq.is_required, sq.position,
                 GROUP_CONCAT(
                   CASE WHEN sqo.id IS NOT NULL 
                   THEN json_object('id', sqo.id, 'option_text', sqo.option_text,
                                   'option_description', sqo.option_description, 'position', sqo.position)
                   END, '|||'
                 ) as options_json
          FROM survey_questions sq
          LEFT JOIN survey_question_options sqo ON sq.id = sqo.survey_question_id
          WHERE sq.survey_id = ? AND sq.feedback_type = ?
          GROUP BY sq.id
          ORDER BY sq.position`,
        [surveyData.survey_id, feedbackType], (err, questions) => {
    if (err) return res.status(500).json({ error: err.message });
    const formattedQuestions = questions.map(q => ({
      ...q,
      options: q.options_json ? q.options_json.split('|||').filter(opt => opt && opt !== 'null').map(opt => JSON.parse(opt)).sort((a,b) => a.position - b.position) : []
    }));
  res.json({
      survey: {
        id: surveyData.survey_id,
        title: surveyData.title,
        description: surveyData.description,
        feedback_type: feedbackType,
        start_date: surveyData.start_date,
    end_date: surveyData.end_date
      },
      allowed_feedback_types: allowedTypes,
      questions: formattedQuestions,
      participant: { name: employee.name, email: employee.email }
    });
  });
}

// Legacy endpoint removed for single-URL approach; kept for compatibility but now requires feedback_type via query and validates date/status.
app.get('/api/survey-by-token/:token', [
  param('token').isLength({ min: 32, max: 32 }).withMessage('Invalid token format')
], handleValidationErrors, (req, res) => {
  const token = req.params.token;
  const ft = req.query.feedback_type;
  if (!ft || !['self','manager','reportee','peer'].includes(ft)) {
    return res.status(400).json({ error: 'feedback_type query is required' });
  }
  db.get(`SELECT id as survey_id, title, description, status, start_date, end_date
          FROM surveys WHERE url_token = ? AND status = 'active'`, [token], (err, surveyData) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!surveyData) return res.status(404).json({ error: 'Survey not found or no longer active' });
    const now = new Date();
    const startDate = toLocalStartOfDay(surveyData.start_date);
    const endDate = toLocalEndOfDay(surveyData.end_date);
    if (now < startDate) return res.status(400).json({ error: 'Survey has not started yet' });
    if (now > endDate) return res.status(400).json({ error: 'Survey has expired' });
    db.all(`SELECT sq.id, sq.question_text, sq.question_type, sq.category_name, 
                   sq.is_required, sq.position,
                   GROUP_CONCAT(
                     CASE WHEN sqo.id IS NOT NULL 
                     THEN json_object('id', sqo.id, 'option_text', sqo.option_text, 
                                     'option_description', sqo.option_description, 'position', sqo.position)
                     END, '|||'
                   ) as options_json
            FROM survey_questions sq
            LEFT JOIN survey_question_options sqo ON sq.id = sqo.survey_question_id
            WHERE sq.survey_id = ? AND sq.feedback_type = ?
            GROUP BY sq.id
            ORDER BY sq.position`, [surveyData.survey_id, ft], (err, questions) => {
      if (err) return res.status(500).json({ error: err.message });
      const formattedQuestions = questions.map(q => ({
        ...q,
        options: q.options_json ? q.options_json.split('|||').filter(opt => opt && opt !== 'null').map(opt => JSON.parse(opt)).sort((a,b) => a.position - b.position) : []
      }));
      res.json({ survey: { ...surveyData, feedback_type: ft }, questions: formattedQuestions });
    });
  });
});

// Submit survey responses with employee authentication
app.post('/api/survey-responses', [
  body('survey_token').isLength({ min: 32, max: 32 }).withMessage('Invalid survey token'),
  body('responses').isArray().withMessage('Responses must be an array'),
  body('responses.*.question_id').isInt().withMessage('Question ID must be an integer'),
  body('responses.*.response_text').optional().isString().withMessage('Response text must be a string'),
  body('responses.*.question_type').isIn(['mcq', 'text']).withMessage('Invalid question type'),
  body('employee_email').isEmail().withMessage('Valid email address is required'),
  body('auth_code').isLength({ min: 1 }).withMessage('Auth code is required'),
  body('feedback_type').isIn(['self','manager','reportee','peer']).withMessage('feedback_type is required')
], handleValidationErrors, (req, res) => {
  const { survey_token, responses, feedback_type } = req.body;
  const employee_email = req.body.employee_email.toLowerCase().trim();
  const auth_code = req.body.auth_code.toUpperCase().trim();
  const submittedAt = new Date().toISOString();
  

  // Validate token and get survey info (single URL)
  db.get(`SELECT s.id as survey_id, s.status, s.start_date, s.end_date, s.company_id
          FROM surveys s
          WHERE s.url_token = ?`, 
         [survey_token], (err, surveyInfo) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!surveyInfo) return res.status(404).json({ error: 'Invalid survey token' });

    if (surveyInfo.status !== 'active') {
      return res.status(400).json({ error: 'Survey is not active' });
    }

    // Check if survey is within date window
    const now = new Date();
    const startDate = toLocalStartOfDay(surveyInfo.start_date);
    const endDate = toLocalEndOfDay(surveyInfo.end_date);
    if (now < startDate) return res.status(400).json({ error: 'Survey has not started yet' });
    if (now > endDate) return res.status(400).json({ error: 'Survey has expired' });

    // Authenticate the employee
    db.get(`SELECT e.* FROM employees e
            WHERE e.email = ? AND e.auth_code = ? AND e.company_id = ?`, 
           [employee_email, auth_code, surveyInfo.company_id], (err, employee) => {
      if (err) return res.status(500).json({ error: 'Database error during authentication' });
      if (!employee) return res.status(401).json({ error: 'Invalid email or auth code' });

      // Enforce flat participant assignment
      db.get('SELECT 1 FROM survey_participants WHERE survey_id = ? AND feedback_type = ? AND employee_id = ? LIMIT 1', [surveyInfo.survey_id, feedback_type, employee.id], (err2, allowed) => {
        if (err2) return res.status(500).json({ error: err2.message });
        if (!allowed) return res.status(403).json({ error: 'You are not assigned to this survey for this feedback type' });
        // Duplicate check without subject
        db.get(`SELECT COUNT(*) as count FROM survey_responses 
                WHERE survey_id = ? AND feedback_type = ? AND employee_email = ?`, 
               [surveyInfo.survey_id, feedback_type, employee_email], (err3, existingCount) => {
          if (err3) return res.status(500).json({ error: err3.message });
          if (existingCount.count > 0) return res.status(400).json({ error: 'You have already submitted responses for this survey' });
          // Insert responses
          const insertPromises = responses.map(response => new Promise((resolve, reject) => {
            db.run(`INSERT INTO survey_responses 
                    (survey_id, feedback_type, question_id, response_text, employee_email, submitted_at) 
                    VALUES (?, ?, ?, ?, ?, ?)`,
                  [surveyInfo.survey_id, feedback_type, response.question_id, response.response_text || '', employee_email, submittedAt], function(errx) {
              if (errx) reject(errx); else resolve(this.lastID);
            });
          }));
          Promise.all(insertPromises)
            .then(() => res.json({
              message: 'Survey responses submitted successfully',
              survey_id: surveyInfo.survey_id,
              feedback_type,
              employee_email,
              response_count: responses.length
            }))
            .catch(erry => res.status(500).json({ error: 'Failed to save responses: ' + erry.message }));
        });
      });
    });
  });
});

// Manage survey participants (assignment per feedback type)
app.get('/api/surveys/:id/participants', authenticateToken, idParamValidation, handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator' && req.user.role !== 'admin') return res.sendStatus(403);
  const surveyId = req.params.id;
  // Return combined view for backward compatibility
  const participantsSql = `
    SELECT sp.feedback_type, e.id as employee_id, e.name, e.email, e.role
    FROM survey_participants sp
    JOIN employees e ON e.id = sp.employee_id
    WHERE sp.survey_id = ?
  `;
  const subjectsSql = `
    SELECT ss.employee_id as subject_id, e.name as subject_name, e.email as subject_email
    FROM survey_subjects ss
    JOIN employees e ON e.id = ss.employee_id
    WHERE ss.survey_id = ?
    ORDER BY e.name
  `;
  const ratersSql = `
    SELECT sra.subject_employee_id as subject_id, sra.rater_employee_id as rater_id, sra.feedback_type,
           e.name as rater_name, e.email as rater_email
    FROM survey_rater_assignments sra
    JOIN employees e ON e.id = sra.rater_employee_id
    WHERE sra.survey_id = ?
  `;
  db.all(participantsSql, [surveyId], (err1, rows) => {
    if (err1) return res.status(500).json({ error: err1.message });
    const grouped = rows.reduce((acc, r) => {
      if (!acc[r.feedback_type]) acc[r.feedback_type] = [];
      acc[r.feedback_type].push({ employee_id: r.employee_id, name: r.name, email: r.email, role: r.role });
      return acc;
    }, {});
    db.all(subjectsSql, [surveyId], (err2, subjects) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.all(ratersSql, [surveyId], (err3, raters) => {
        if (err3) return res.status(500).json({ error: err3.message });
        // Shape subject-centric data
        const subjectMap = {};
        subjects.forEach(s => {
          subjectMap[s.subject_id] = {
            subject: { id: s.subject_id, name: s.subject_name, email: s.subject_email },
            self: [],
            manager: [],
            reportee: [],
            peer: []
          };
        });
        // Populate self from survey_participants for those who are subjects
        (grouped.self || []).forEach(sp => {
          if (subjectMap[sp.employee_id]) subjectMap[sp.employee_id].self.push({ id: sp.employee_id, name: sp.name, email: sp.email });
        });
        // Populate raters
        raters.forEach(r => {
          if (subjectMap[r.subject_id]) {
            subjectMap[r.subject_id][r.feedback_type].push({ id: r.rater_id, name: r.rater_name, email: r.rater_email });
          }
        });
        res.json({
          legacy: grouped,
          subjects: Object.values(subjectMap)
        });
      });
    });
  });
});

app.put('/api/surveys/:id/participants', authenticateToken, [
  ...idParamValidation,
  body('feedback_type').isIn(['self','manager','reportee','peer']).withMessage('Invalid feedback_type'),
  body('employee_ids').isArray().withMessage('employee_ids must be an array of IDs')
], handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator' && req.user.role !== 'admin') return res.sendStatus(403);
  const surveyId = parseInt(req.params.id, 10);
  const { feedback_type, employee_ids } = req.body;
  const now = new Date().toISOString();
  // Enforce: participants can be added/changed only while draft OR active before end date
  db.get('SELECT status, end_date FROM surveys WHERE id = ?', [surveyId], (err, survey) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    const nowDate = new Date();
    const endDate = toLocalEndOfDay(survey.end_date);
    const blocked = (survey.status === 'completed' || survey.status === 'archived' || (survey.status === 'active' && nowDate > endDate));
    if (blocked) {
      return res.status(400).json({ error: 'Cannot modify participants after end date or when survey is ended' });
    }
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      db.run('DELETE FROM survey_participants WHERE survey_id = ? AND feedback_type = ?', [surveyId, feedback_type], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: err.message });
        }
        if (!employee_ids || employee_ids.length === 0) {
          // If self was cleared, also clear other types to maintain rule
          if (feedback_type === 'self') {
            const otherTypes = ['manager','reportee','peer'];
            let cleared = 0;
            otherTypes.forEach(t => {
              db.run('DELETE FROM survey_participants WHERE survey_id = ? AND feedback_type = ?', [surveyId, t], () => {
                cleared++;
                if (cleared === otherTypes.length) {
                  db.run('COMMIT');
                  return res.json({ updated: true, count: 0 });
                }
              });
            });
          } else {
            db.run('COMMIT');
            return res.json({ updated: true, count: 0 });
          }
        }
        let done = 0;
        let hasError = false;
        employee_ids.forEach((eid) => {
          db.run('INSERT OR IGNORE INTO survey_participants (survey_id, feedback_type, employee_id, created_at) VALUES (?, ?, ?, ?)',
            [surveyId, feedback_type, eid, now], (err) => {
              if (err && !hasError) {
                hasError = true;
                db.run('ROLLBACK');
                return res.status(500).json({ error: err.message });
              }
              done++;
              if (done === employee_ids.length && !hasError) {
                // Enforce rule: if updating non-self types, ensure those employees are also in self
                if (feedback_type !== 'self') {
                  let ensured = 0;
                  employee_ids.forEach((eid2) => {
                    db.run('INSERT OR IGNORE INTO survey_participants (survey_id, feedback_type, employee_id, created_at) VALUES (?, ?, ?, ?)',
                      [surveyId, 'self', eid2, now], () => {
                        ensured++;
                        if (ensured === employee_ids.length) {
                          db.run('COMMIT');
                          res.json({ updated: true, count: employee_ids.length });
                        }
                      });
                  });
                } else {
                  // If updating self, prune any non-self assignments for employees not in self
                  const placeholders = employee_ids.map(() => '?').join(',');
                  const params = [surveyId, ...employee_ids];
                  const otherTypes = ['manager','reportee','peer'];
                  let pruned = 0;
                  if (employee_ids.length === 0) {
                    // Already handled above
                    db.run('COMMIT');
                    return res.json({ updated: true, count: 0 });
                  }
                  otherTypes.forEach(t => {
                    db.run(`DELETE FROM survey_participants WHERE survey_id = ? AND feedback_type = ? AND employee_id NOT IN (${placeholders})`, [surveyId, t, ...employee_ids], () => {
                      pruned++;
                      if (pruned === otherTypes.length) {
                        db.run('COMMIT');
                        res.json({ updated: true, count: employee_ids.length });
                      }
                    });
                  });
                }
              }
            });
        });
      });
    });
  });
});

// New: Set full subject list for a survey
app.put('/api/surveys/:id/subjects', authenticateToken, [
  ...idParamValidation,
  body('employee_ids').isArray().withMessage('employee_ids must be an array of employee IDs')
], handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator' && req.user.role !== 'admin') return res.sendStatus(403);
  const surveyId = parseInt(req.params.id, 10);
  const { employee_ids } = req.body;
  const now = new Date().toISOString();
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    db.run('DELETE FROM survey_subjects WHERE survey_id = ?', [surveyId], (err) => {
      if (err) { db.run('ROLLBACK'); return res.status(500).json({ error: err.message }); }
      if (!employee_ids || employee_ids.length === 0) { db.run('COMMIT'); return res.json({ updated: true, count: 0 }); }
      let done = 0; let hasError = false;
      employee_ids.forEach(eid => {
        db.run('INSERT OR IGNORE INTO survey_subjects (survey_id, employee_id, created_at) VALUES (?, ?, ?)', [surveyId, eid, now], (err) => {
          if (err && !hasError) { hasError = true; db.run('ROLLBACK'); return res.status(500).json({ error: err.message }); }
          // Also ensure self participant for subject
          db.run('INSERT OR IGNORE INTO survey_participants (survey_id, feedback_type, employee_id, created_at) VALUES (?, ?, ?, ?)', [surveyId, 'self', eid, now]);
          done++; if (done === employee_ids.length && !hasError) { db.run('COMMIT'); res.json({ updated: true, count: employee_ids.length }); }
        });
      });
    });
  });
});

// New: Set raters for a subject and feedback_type (manager/peer/reportee)
app.put('/api/surveys/:id/subjects/:subjectId/raters', authenticateToken, [
  ...idParamValidation,
  param('subjectId').isInt({ min: 1 }).withMessage('Invalid subject id'),
  body('feedback_type').isIn(['manager','peer','reportee']).withMessage('Invalid feedback_type'),
  body('rater_ids').isArray().withMessage('rater_ids must be an array of employee IDs')
], handleValidationErrors, (req, res) => {
  if (req.user.role !== 'creator' && req.user.role !== 'admin') return res.sendStatus(403);
  const surveyId = parseInt(req.params.id, 10);
  const subjectId = parseInt(req.params.subjectId, 10);
  const { feedback_type, rater_ids } = req.body;
  const now = new Date().toISOString();
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    db.run('DELETE FROM survey_rater_assignments WHERE survey_id = ? AND subject_employee_id = ? AND feedback_type = ?', [surveyId, subjectId, feedback_type], (err) => {
      if (err) { db.run('ROLLBACK'); return res.status(500).json({ error: err.message }); }
      if (!rater_ids || rater_ids.length === 0) { db.run('COMMIT'); return res.json({ updated: true, count: 0 }); }
      let done = 0; let hasError = false;
      rater_ids.forEach(rid => {
        db.run('INSERT OR IGNORE INTO survey_rater_assignments (survey_id, subject_employee_id, rater_employee_id, feedback_type, created_at) VALUES (?, ?, ?, ?, ?)', [surveyId, subjectId, rid, feedback_type, now], (err) => {
          if (err && !hasError) { hasError = true; db.run('ROLLBACK'); return res.status(500).json({ error: err.message }); }
          done++; if (done === rater_ids.length && !hasError) { db.run('COMMIT'); res.json({ updated: true, count: rater_ids.length }); }
        });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
