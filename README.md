# Survey Management Application

**Status: Production-Ready with Enterprise Security (v1.0.0-security-baseline)**

A comprehensive survey management platform with robust security controls, role-based access control, and full CRUD functionality for surveys, questions, and responses.

## 🔐 Security Features

- **JWT Authentication** with secure token validation
- **Role-Based Access Control (RBAC)** with strict boundaries
- **Input Validation** using express-validator
- **SQL Injection Protection** via parameterized queries  
- **Data Integrity** with foreign key constraints
- **Automated Security Testing** framework included

## 🚀 Key Features

### Admin Journey
- Admin login with JWT authentication
- Company and Employee management (CRUD)
- User administration and role assignment
- Secure admin-only endpoints

### Creator Journey  
- Survey category creation and management
- Question bank with multiple choice (MCQ) and text questions
- Question copying functionality with options cloning
- Creator-only content management endpoints

### Security Controls
- Proper role separation (admin cannot create content, creator cannot access admin functions)
- Comprehensive input validation on all endpoints
- Enterprise-grade authentication and authorization

## Tech Stack
- Frontend: React
- Backend: Node.js + Express
- Database: SQLite (for easy local setup)

## Getting Started

### Prerequisites
- Node.js (v18 or above recommended)
- npm (comes with Node.js)

### Run with Docker (recommended)

1. From the project root, build and start:
   - Backend: http://localhost:5000
   - Frontend: http://localhost:3000
2. Login with admin credentials: `admin` / `admin123`.

### Setup (without Docker)

1. **Install backend dependencies:**
   ```
   cd backend
   npm install
   ```
2. **Install frontend dependencies:**
   ```
   cd ../frontend
   npm install
   ```
3. **Run the backend server:**
   ```
   cd ../backend
   npm start
   ```
4. **Run the frontend app:**
   ```
   cd ../frontend
   npm start
   ```

The backend will run on http://localhost:5000 and the frontend on http://localhost:3000 by default.

### Admin Credentials
- Username: `admin`
- Password: `admin123`

### Creator Credentials  
- Username: `creator`
- Password: `creator123`

## 🧪 Security Testing

The application includes a comprehensive security testing framework:

```powershell
cd scripts
.\security-test.ps1                    # Run all security tests
.\security-test.ps1 -Verbose          # Detailed output
.\security-test.ps1 -ExportResults    # Export results to JSON
```

**Test Categories:**
- Authentication (4 tests)
- Authorization/RBAC (4 tests)  
- Input Validation (4 tests)
- SQL Injection Protection (1 test)
- Data Integrity (2 tests)

All 14+ security tests must pass before deployment.

## Sample Data
The application comes with:
- Preloaded admin and creator users for testing
- Sample companies and employees for demo purposes  
- Test categories and questions for development
- Secure seed data with proper password hashing

## 📁 Project Structure
- `backend/` - Express API with security middleware, SQLite DB, JWT authentication
- `frontend/` - React app with role-based UI components
- `scripts/` - Security testing framework and automation tools
- `docker-compose.yml` - Container orchestration for development and production

## 🔧 API Endpoints

### Authentication
- `POST /api/login` - User authentication with JWT token generation

### Admin-Only Endpoints
- `GET/POST/PUT/DELETE /api/companies` - Company management
- `GET/POST/PUT/DELETE /api/employees` - Employee management  

### Creator-Only Endpoints
- `GET/POST/PUT/DELETE /api/categories` - Survey category management
- `GET/POST/PUT/DELETE /api/questions` - Question bank management
- `POST /api/questions/:id/copy` - Copy questions with options

All endpoints include comprehensive validation and proper error handling.

## Customization
You can modify the sample data and configuration as needed for your use case.

---

For any issues, please refer to the requirements document or contact the project maintainer.
