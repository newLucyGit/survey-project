// frontend/App.js
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useParams } from 'react-router-dom';
import axios from 'axios';

// Environment variable handling with better debugging
const RAW_API_BASE = process.env.REACT_APP_API_URL || 'https://survey-project-ok7e.onrender.com';
const API = `${RAW_API_BASE.replace(/\/$/, '')}/api`;

// Debug logging - remove in production
console.log('Environment check:', {
  nodeEnv: process.env.NODE_ENV,
  apiUrl: process.env.REACT_APP_API_URL,
  rawApiBase: RAW_API_BASE,
  finalApi: API
});

function Login({ setToken, setRole }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('Attempting login to:', `${API}/login`);
      const res = await axios.post(`${API}/login`, { username, password });
      
      console.log('Login response:', res.data);
      
      // Extract token and role correctly based on your backend response
      const { token, user } = res.data;
      
      if (token && user) {
        setToken(token);
        setRole(user.role); // Changed from res.data.role to res.data.user.role
        localStorage.setItem('token', token);
        localStorage.setItem('role', user.role);
      } else {
        setError('Invalid response from server');
      }
    } catch (err) {
      console.error('Login error:', err);
      console.error('Error response:', err.response?.data);
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px' }}>
      <div style={{ 
        background: 'white', 
        padding: '30px', 
        borderRadius: '8px', 
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)' 
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '30px' }}>Welcome Back</h2>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>
          Sign in to your Survey Management account
        </p>
        
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Username
            </label>
            <input 
              placeholder="Username" 
              value={username} 
              onChange={e => setUsername(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '16px'
              }}
              required
            />
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Password
            </label>
            <input 
              type="password" 
              placeholder="Password" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '16px'
              }}
              required
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            style={{
              width: '100%',
              padding: '15px',
              background: loading ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
        
        {error && (
          <div style={{
            marginTop: '15px',
            padding: '10px',
            background: '#f8d7da',
            border: '1px solid #f5c6cb',
            borderRadius: '4px',
            color: '#721c24'
          }}>
            {error}
          </div>
        )}
        
        <div style={{
          marginTop: '20px',
          textAlign: 'center',
          fontSize: '14px',
          color: '#666'
        }}>
          Demo credentials: admin/admin123 or creator/creator123
        </div>
        
        {/* Debug info - remove in production */}
        <div style={{
          marginTop: '20px',
          padding: '10px',
          background: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#6c757d'
        }}>
          API URL: {API}
        </div>
      </div>
    </div>
  );
}

function SurveyList({ token }) {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (!token) return;
    
    axios.get(`${API}/surveys`, { 
      headers: { Authorization: `Bearer ${token}` } 
    })
    .then(res => {
      setSurveys(res.data);
      setLoading(false);
    })
    .catch(err => {
      console.error('Error fetching surveys:', err);
      setError('Failed to load surveys');
      setLoading(false);
    });
  }, [token]);

  if (loading) return <div>Loading surveys...</div>;
  if (error) return <div style={{color: 'red'}}>{error}</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h2>Surveys</h2>
      {surveys.length === 0 ? (
        <p>No surveys available.</p>
      ) : (
        <ul>
          {surveys.map(s => (
            <li key={s.id}>
              <Link to={`/survey/${s.id}`}>{s.title}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SurveyDetail({ token, role }) {
  const { id } = useParams();
  const [survey, setSurvey] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (!token || !id) return;
    
    axios.get(`${API}/surveys/${id}`, { 
      headers: { Authorization: `Bearer ${token}` } 
    })
    .then(res => {
      setSurvey(res.data);
      setAnswers(res.data.questions.map(q => ({ question_id: q.id, answer: '' })));
      setLoading(false);
    })
    .catch(err => {
      console.error('Error fetching survey:', err);
      setError('Failed to load survey');
      setLoading(false);
    });
  }, [id, token]);

  if (loading) return <div>Loading survey...</div>;
  if (error) return <div style={{color: 'red'}}>{error}</div>;
  if (!survey) return <div>Survey not found.</div>;

  const handleChange = (i, val) => {
    setAnswers(ans => ans.map((a, idx) => idx === i ? { ...a, answer: val } : a));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/surveys/${id}/response`, { answers }, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      setSubmitted(true);
    } catch (err) {
      console.error('Error submitting survey:', err);
      setError('Failed to submit survey');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h3>{survey.title}</h3>
      <p>{survey.description}</p>
      {role === 'respondent' && !submitted && (
        <form onSubmit={handleSubmit}>
          {survey.questions.map((q, i) => (
            <div key={q.id} style={{ marginBottom: '20px' }}>
              <label>{q.text}</label>
              {q.type === 'rating' ? (
                <input 
                  type="number" 
                  min="1" 
                  max="5" 
                  value={answers[i]?.answer} 
                  onChange={e => handleChange(i, e.target.value)} 
                />
              ) : (
                <input 
                  value={answers[i]?.answer} 
                  onChange={e => handleChange(i, e.target.value)} 
                />
              )}
            </div>
          ))}
          <button type="submit">Submit</button>
        </form>
      )}
      {submitted && <div style={{color: 'green'}}>Thank you for your response!</div>}
      {error && <div style={{color: 'red'}}>{error}</div>}
    </div>
  );
}

function AdminPanel({ token }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (!token) return;
    
    axios.get(`${API}/users`, { 
      headers: { Authorization: `Bearer ${token}` } 
    })
    .then(res => {
      setUsers(res.data);
      setLoading(false);
    })
    .catch(err => {
      console.error('Error fetching users:', err);
      setError('Failed to load users');
      setLoading(false);
    });
  }, [token]);

  if (loading) return <div>Loading users...</div>;
  if (error) return <div style={{color: 'red'}}>{error}</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h2>Admin Panel</h2>
      {users.length === 0 ? (
        <p>No users found.</p>
      ) : (
        <ul>
          {users.map(u => (
            <li key={u.id}>{u.username} ({u.role})</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [role, setRole] = useState(() => localStorage.getItem('role'));

  const handleLogout = () => {
    setToken(null);
    setRole(null);
    localStorage.removeItem('token');
    localStorage.removeItem('role');
  };

  return (
    <Router>
      <nav style={{ 
        padding: '10px 20px', 
        background: '#f8f9fa', 
        borderBottom: '1px solid #dee2e6',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Link to="/" style={{ textDecoration: 'none', fontWeight: 'bold' }}>
          Survey Management
        </Link>
        <div>
          {token && (
            <>
              <span style={{ marginRight: '15px' }}>Welcome, {role}!</span>
              <button 
                onClick={handleLogout}
                style={{
                  padding: '5px 15px',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Logout
              </button>
            </>
          )}
        </div>
      </nav>
      
      <Routes>
        <Route 
          path="/" 
          element={token ? <SurveyList token={token} /> : <Login setToken={setToken} setRole={setRole} />} 
        />
        <Route 
          path="/survey/:id" 
          element={token ? <SurveyDetail token={token} role={role} /> : <Navigate to="/" />} 
        />
        <Route 
          path="/admin" 
          element={token && role === 'admin' ? <AdminPanel token={token} /> : <Navigate to="/" />} 
        />
      </Routes>
    </Router>
  );
}

export default App;