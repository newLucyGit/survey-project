
import React from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import CompanyManager from './components/CompanyManager';
import EmployeeManager from './components/EmployeeManager';
import CreatorPanel from './components/CreatorPanel';
import SurveyTaking from './components/SurveyTaking';
import './App.css';

const API = 'http://localhost:5000/api';

function Login({ setToken, setRole, setUsernameGlobal }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API}/login`, { username, password });
      setToken(res.data.token);
      setRole(res.data.role);
      setUsernameGlobal(username);
    } catch (err) {
      setError(err?.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="form-container" style={{ maxWidth: '400px', margin: '5rem auto' }}>
        <h1 className="form-title">Welcome Back</h1>
        <p className="page-subtitle">Sign in to your Survey Management account</p>
        <form onSubmit={handleLogin}>
          <div className="form-field">
            <label className="form-label">Username</label>
            <input 
              placeholder="Enter your username" 
              value={username} 
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              placeholder="Enter your password" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button 
            type="submit" 
            className="btn btn-primary btn-lg" 
            disabled={loading}
            style={{ width: '100%', marginTop: 'var(--space-md)' }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        {error && <div className="alert alert-error">{error}</div>}
        <div style={{ textAlign: 'center', marginTop: 'var(--space-lg)', fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
          Demo credentials: admin/admin123 or creator/creator123
        </div>
      </div>
    </div>
  );
}

function AdminPanel({ token }) {
  const [tab, setTab] = React.useState('companies');
  const [users, setUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (tab === 'users') {
      setLoading(true);
      setError('');
      axios.get(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => setUsers(res.data))
        .catch(() => setError('Failed to load users.'))
        .finally(() => setLoading(false));
    }
  }, [token, tab]);

  return (
    <div className="app-container">
      <div className="page-header">
        <h1 className="page-title">Admin Dashboard</h1>
        <p className="page-subtitle">Manage companies, employees, and system users</p>
      </div>
      
      <div className="tab-container">
        <div className="tab-list">
          <button 
            className={`tab-button ${tab === 'companies' ? 'active' : ''}`}
            onClick={() => setTab('companies')}
          >
            Companies
          </button>
          <button 
            className={`tab-button ${tab === 'employees' ? 'active' : ''}`}
            onClick={() => setTab('employees')}
          >
            Employees
          </button>
          <button 
            className={`tab-button ${tab === 'users' ? 'active' : ''}`}
            onClick={() => setTab('users')}
          >
            System Users
          </button>
        </div>
        
        {tab === 'users' && (
          <div>
            {loading ? (
              <div className="loading">Loading users...</div>
            ) : error ? (
              <div className="alert alert-error">{error}</div>
            ) : (
              <div className="card-grid">
                {users.map(u => (
                  <div className="card" key={u.id}>
                    <div className="card-header">
                      <h3 className="card-title">{u.username}</h3>
                    </div>
                    <div className="card-content">
                      <span style={{ 
                        background: u.role === 'admin' ? 'var(--error)' : 'var(--secondary)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: 'var(--radius-xs)',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        textTransform: 'uppercase'
                      }}>
                        {u.role}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {tab === 'companies' && <CompanyManager token={token} />}
        {tab === 'employees' && <EmployeeManager token={token} />}
      </div>
    </div>
  );
}

function App() {
  const [token, setToken] = React.useState(null);
  const [role, setRole] = React.useState(null);
  const [username, setUsernameGlobal] = React.useState('');

  return (
    <Router>
      {token && (
        <nav className="nav">
          <div className="nav-content">
            <div className="nav-links">
              <Link to="/" className="nav-link">🏠 Home</Link>
              {role === 'admin' && <Link to="/admin" className="nav-link">👔 Admin Panel</Link>}
              {role === 'creator' && <Link to="/creator" className="nav-link">📝 Creator Panel</Link>}
            </div>
            <div className="nav-user">
              <span>👤 {username} ({role})</span>
              <button 
                className="btn btn-outline btn-sm"
                onClick={() => { setToken(null); setRole(null); setUsernameGlobal(''); }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </nav>
      )}
      
      <Routes>
        <Route path="/survey/:token" element={<SurveyTaking />} />
        <Route path="/" element={
          token && role === 'admin'
            ? <Navigate to="/admin" />
            : token && role === 'creator'
              ? <Navigate to="/creator" />
              : <Login setToken={setToken} setRole={setRole} setUsernameGlobal={setUsernameGlobal} />
        } />
        <Route path="/admin" element={token && role === 'admin' ? <AdminPanel token={token} /> : <Navigate to="/" />} />
        <Route path="/creator" element={token && role === 'creator' ? <CreatorPanel token={token} /> : <Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
