// frontend/App.js
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useParams } from 'react-router-dom';
import axios from 'axios';

// Use environment variable or fallback to localhost
const RAW_API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const API = `${RAW_API_BASE.replace(/\/$/, '')}/api`;

function Login({ setToken, setRole }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API}/login`, { username, password });
      setToken(res.data.token);
      setRole(res.data.role);
    } catch {
      setError('Invalid credentials');
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <h2>Login</h2>
      <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
      <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
      <button type="submit">Login</button>
      {error && <div style={{color:'red'}}>{error}</div>}
    </form>
  );
}

function SurveyList({ token }) {
  const [surveys, setSurveys] = useState([]);
  React.useEffect(() => {
    if (!token) return;
    axios.get(`${API}/surveys`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setSurveys(res.data));
  }, [token]);
  return (
    <div>
      <h2>Surveys</h2>
      <ul>
        {surveys.map(s => <li key={s.id}><Link to={`/survey/${s.id}`}>{s.title}</Link></li>)}
      </ul>
    </div>
  );
}

function SurveyDetail({ token, role }) {
  const { id } = useParams();
  const [survey, setSurvey] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [submitted, setSubmitted] = useState(false);

  React.useEffect(() => {
    if (!token || !id) return;
    axios.get(`${API}/surveys/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        setSurvey(res.data);
        setAnswers(res.data.questions.map(q => ({ question_id: q.id, answer: '' })));
      });
  }, [id, token]);

  if (!survey) return <div>Loading...</div>;

  const handleChange = (i, val) => {
    setAnswers(ans => ans.map((a, idx) => idx === i ? { ...a, answer: val } : a));
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    await axios.post(`${API}/surveys/${id}/response`, { answers }, { headers: { Authorization: `Bearer ${token}` } });
    setSubmitted(true);
  };

  return (
    <div>
      <h3>{survey.title}</h3>
      <p>{survey.description}</p>
      {role === 'respondent' && !submitted && (
        <form onSubmit={handleSubmit}>
          {survey.questions.map((q, i) => (
            <div key={q.id}>
              <label>{q.text}</label>
              {q.type === 'rating' ? (
                <input type="number" min="1" max="5" value={answers[i]?.answer} onChange={e => handleChange(i, e.target.value)} />
              ) : (
                <input value={answers[i]?.answer} onChange={e => handleChange(i, e.target.value)} />
              )}
            </div>
          ))}
          <button type="submit">Submit</button>
        </form>
      )}
      {submitted && <div>Thank you for your response!</div>}
    </div>
  );
}

function AdminPanel({ token }) {
  const [users, setUsers] = useState([]);
  React.useEffect(() => {
    if (!token) return;
    axios.get(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setUsers(res.data));
  }, [token]);
  return (
    <div>
      <h2>Admin Panel</h2>
      <ul>
        {users.map(u => <li key={u.id}>{u.username} ({u.role})</li>)}
      </ul>
    </div>
  );
}

function App() {
  const [token, setToken] = useState(null);
  const [role, setRole] = useState(null);
  return (
    <Router>
      <nav>
        <Link to="/">Home</Link>
        {token && <button onClick={() => { setToken(null); setRole(null); }}>Logout</button>}
      </nav>
      <Routes>
        <Route path="/" element={token ? <SurveyList token={token} /> : <Login setToken={setToken} setRole={setRole} />} />
        <Route path="/survey/:id" element={token ? <SurveyDetail token={token} role={role} /> : <Navigate to="/" />} />
        <Route path="/admin" element={token && role === 'admin' ? <AdminPanel token={token} /> : <Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
