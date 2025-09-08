const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 5000;

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors({
  origin: [
    'https://survey-project-three.vercel.app/', // Replace with your actual Vercel URL
    'http://localhost:3000',
    'http://localhost:3001'
  ],
  credentials: true
}));

app.use(express.json());

// Helper function for validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Basic routes for health checks
app.get('/', (req, res) => {
  res.json({
    message: 'Survey Management API is running!',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    database: 'connected',
    timestamp: new Date().toISOString()
  });
});

// Environment check endpoint (useful for debugging)
app.get('/api/health-check', (req, res) => {
  res.json({
    environment: process.env.NODE_ENV || 'development',
    hasDatabase: !!process.env.DATABASE_URL,
    hasJwtSecret: !!process.env.JWT_SECRET,
    timestamp: new Date().toISOString()
  });
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Role-based authorization middleware
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    
    next();
  };
};

// LOGIN ENDPOINT
app.post('/api/login', [
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], handleValidationErrors, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Query user from database
    const userQuery = 'SELECT * FROM users WHERE username = $1';
    const userResult = await pool.query(userQuery, [username]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const user = userResult.rows[0];
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// COMPANIES ENDPOINTS (Admin only)
app.get('/api/companies', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM companies ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ message: 'Error fetching companies' });
  }
});

app.post('/api/companies', [
  authenticateToken,
  requireRole(['admin']),
  body('name').notEmpty().withMessage('Company name is required'),
  body('industry').optional()
], handleValidationErrors, async (req, res) => {
  try {
    const { name, industry } = req.body;
    const result = await pool.query(
      'INSERT INTO companies (name, industry) VALUES ($1, $2) RETURNING *',
      [name, industry]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ message: 'Error creating company' });
  }
});

// EMPLOYEES ENDPOINTS (Admin only)
app.get('/api/employees', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.*, c.name as company_name 
      FROM employees e 
      LEFT JOIN companies c ON e.company_id = c.id 
      ORDER BY e.name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ message: 'Error fetching employees' });
  }
});

app.post('/api/employees', [
  authenticateToken,
  requireRole(['admin']),
  body('name').notEmpty().withMessage('Employee name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('company_id').isInt().withMessage('Valid company ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const { name, email, position, company_id } = req.body;
    const result = await pool.query(
      'INSERT INTO employees (name, email, position, company_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, position, company_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({ message: 'Error creating employee' });
  }
});

// CATEGORIES ENDPOINTS (Creator only)
app.get('/api/categories', authenticateToken, requireRole(['creator']), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Error fetching categories' });
  }
});

app.post('/api/categories', [
  authenticateToken,
  requireRole(['creator']),
  body('name').notEmpty().withMessage('Category name is required'),
  body('description').optional()
], handleValidationErrors, async (req, res) => {
  try {
    const { name, description } = req.body;
    const result = await pool.query(
      'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ message: 'Error creating category' });
  }
});

// QUESTIONS ENDPOINTS (Creator only)
app.get('/api/questions', authenticateToken, requireRole(['creator']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT q.*, c.name as category_name 
      FROM questions q 
      LEFT JOIN categories c ON q.category_id = c.id 
      ORDER BY q.question_text
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ message: 'Error fetching questions' });
  }
});

app.post('/api/questions', [
  authenticateToken,
  requireRole(['creator']),
  body('question_text').notEmpty().withMessage('Question text is required'),
  body('question_type').isIn(['text', 'mcq']).withMessage('Question type must be text or mcq'),
  body('category_id').isInt().withMessage('Valid category ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const { question_text, question_type, category_id } = req.body;
    const result = await pool.query(
      'INSERT INTO questions (question_text, question_type, category_id) VALUES ($1, $2, $3) RETURNING *',
      [question_text, question_type, category_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({ message: 'Error creating question' });
  }
});

// Test database connection
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      message: 'Database connection successful',
      timestamp: result.rows[0].now
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    message: 'Route not found',
    availableRoutes: [
      'GET /',
      'GET /health',
      'POST /api/login',
      'GET /api/companies',
      'GET /api/employees',
      'GET /api/categories',
      'GET /api/questions',
      'GET /api/test-db'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database URL configured: ${!!process.env.DATABASE_URL}`);
  console.log(`JWT Secret configured: ${!!process.env.JWT_SECRET}`);
});

module.exports = app;