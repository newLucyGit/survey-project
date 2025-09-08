import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../App.css';

const API = 'http://localhost:5000/api';

export default function EmployeeManager({ token }) {
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [potentialManagers, setPotentialManagers] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [authCodes, setAuthCodes] = useState({});
  const [loadingAuthCode, setLoadingAuthCode] = useState({});

  const fetchPotentialManagers = async (selectedCompanyId, excludeEmployeeId = null) => {
    if (!selectedCompanyId) {
      setPotentialManagers([]);
      return;
    }
    
    try {
      const params = excludeEmployeeId ? `?exclude=${excludeEmployeeId}` : '';
      const response = await axios.get(`${API}/companies/${selectedCompanyId}/potential-managers${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPotentialManagers(response.data);
    } catch (err) {
      console.error('Failed to load potential managers:', err);
      setPotentialManagers([]);
    }
  };

  const fetchAll = () => {
    setLoading(true);
    setError('');
    Promise.all([
      axios.get(`${API}/employees`, { headers: { Authorization: `Bearer ${token}` } }).catch(err => { throw new Error('Failed to load employees: ' + (err.response?.data?.error || err.message)); }),
      axios.get(`${API}/companies`, { headers: { Authorization: `Bearer ${token}` } }).catch(err => { throw new Error('Failed to load companies: ' + (err.response?.data?.error || err.message)); })
    ])
      .then(([empRes, compRes]) => {
        setEmployees(empRes.data);
        setCompanies(compRes.data);
      })
      .catch((err) => setError(err.message || 'Failed to load employees or companies.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, [token]);

  // Fetch potential managers when company changes
  useEffect(() => {
    fetchPotentialManagers(companyId, editing?.id);
  }, [companyId, editing, token]);

  const handleAdd = e => {
    e.preventDefault();
    setError('');
    const employeeData = { 
      name, 
      email, 
      role, 
      company_id: companyId,
      manager_id: managerId || null
    };
    axios.post(`${API}/employees`, employeeData, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => { 
        // Store the new auth code if returned
        if (response.data.auth_code) {
          setAuthCodes(prev => ({ ...prev, [response.data.id]: response.data.auth_code }));
        }
        setName(''); 
        setEmail(''); 
        setRole(''); 
        setCompanyId(''); 
        setManagerId(''); 
        fetchAll(); 
      })
      .catch(() => setError('Failed to add employee.'));
  };

  const handleEdit = emp => {
    setEditing(emp);
    setName(emp.name || '');
    setEmail(emp.email || '');
    setRole(emp.role || '');
    setCompanyId(emp.company_id || '');
    setManagerId(emp.manager_id || '');
  };

  const handleUpdate = e => {
    e.preventDefault();
    setError('');
    const employeeData = { 
      name, 
      email, 
      role, 
      company_id: companyId,
      manager_id: managerId || null
    };
    axios.put(`${API}/employees/${editing.id}`, employeeData, { headers: { Authorization: `Bearer ${token}` } })
      .then(() => { setEditing(null); setName(''); setEmail(''); setRole(''); setCompanyId(''); setManagerId(''); fetchAll(); })
      .catch(() => setError('Failed to update employee.'));
  };

  const handleDelete = id => {
    if (!window.confirm('Delete this employee?')) return;
    setError('');
    axios.delete(`${API}/employees/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(fetchAll)
      .catch(() => setError('Failed to delete employee.'));
  };

  const clearForm = () => {
    setEditing(null);
    setName('');
    setEmail('');
    setRole('');
    setCompanyId('');
    setManagerId('');
    setPotentialManagers([]);
  };

  const regenerateAuthCode = async (employeeId) => {
    setLoadingAuthCode(prev => ({ ...prev, [employeeId]: true }));
    try {
      const response = await axios.put(`${API}/employees/${employeeId}/regenerate-auth-code`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAuthCodes(prev => ({ ...prev, [employeeId]: response.data.auth_code }));
    } catch (err) {
      setError('Failed to regenerate auth code: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoadingAuthCode(prev => ({ ...prev, [employeeId]: false }));
    }
  };

  const copyAuthCode = (authCode) => {
    navigator.clipboard.writeText(authCode).then(() => {
      // Could add a toast notification here
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = authCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    });
  };

  // Load auth codes for employees
  useEffect(() => {
    if (employees.length > 0) {
      employees.forEach(emp => {
        if (emp.auth_code) {
          setAuthCodes(prev => ({ ...prev, [emp.id]: emp.auth_code }));
        }
      });
    }
  }, [employees]);

  const getCompanyName = (companyId) => {
    const company = companies.find(c => c.id === companyId);
    return company ? company.name : 'Unknown Company';
  };

  const getRoleIcon = (role) => {
    switch (role?.toLowerCase()) {
      case 'ceo': return '👑';
      case 'manager': return '👔';
      case 'engineer': return '⚙️';
      case 'developer': return '💻';
      case 'employee': return '👤';
      case 'analyst': return '📊';
      case 'senior-analyst': return '📈';
      default: return '👤';
    }
  };

  if (loading) return <div className="loading">Loading employees...</div>;

  return (
    <div>
      <div className="form-container">
        <h3 className="form-title">
          {editing ? '✏️ Edit Employee' : '👤 Add New Employee'}
        </h3>
        <form onSubmit={editing ? handleUpdate : handleAdd}>
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">Full Name</label>
              <input 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="Enter employee name" 
                required 
              />
            </div>
            <div className="form-field">
              <label className="form-label">Email Address</label>
              <input 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="Enter email address" 
                required 
                type="email" 
              />
            </div>
            <div className="form-field">
              <label className="form-label">Job Role</label>
              <input 
                value={role} 
                onChange={e => setRole(e.target.value)} 
                placeholder="Enter job role" 
                required 
              />
            </div>
            <div className="form-field">
              <label className="form-label">Company</label>
              <select 
                value={companyId} 
                onChange={e => {
                  setCompanyId(e.target.value);
                  setManagerId(''); // Reset manager when company changes
                }}
                required
              >
                <option value="">Select a company</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Manager</label>
              <select 
                value={managerId} 
                onChange={e => setManagerId(e.target.value)}
                disabled={!companyId}
              >
                <option value="">No Manager (CEO/Top Level)</option>
                {potentialManagers.map(manager => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name} ({manager.role})
                  </option>
                ))}
              </select>
              {!companyId && (
                <small style={{ color: 'var(--on-surface-variant)', fontSize: '0.75rem' }}>
                  Select a company first to see available managers
                </small>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button type="submit" className="btn btn-primary">
              {editing ? '💾 Update Employee' : '👤 Add Employee'}
            </button>
            {editing && (
              <button type="button" className="btn btn-outline" onClick={clearForm}>
                ❌ Cancel
              </button>
            )}
          </div>
        </form>
        {error && <div className="alert alert-error">{error}</div>}
      </div>

      <div className="page-header">
        <h3 className="page-title">Employees ({employees.length})</h3>
        <p className="page-subtitle">Manage your organization's employees</p>
      </div>

      {employees.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
          <h4 style={{ color: 'var(--on-surface-variant)', margin: '0 0 var(--space-sm) 0' }}>
            👥 No employees found
          </h4>
          <p style={{ color: 'var(--on-surface-variant)', margin: 0 }}>
            Add your first employee using the form above
          </p>
        </div>
      ) : (
        <div className="card-grid">
          {employees.map(emp => (
            <div className="card" key={emp.id}>
              <div className="card-header">
                <div>
                  <h3 className="card-title">
                    {getRoleIcon(emp.role)} {emp.name}
                  </h3>
                  <p className="card-subtitle">
                    Added {new Date(emp.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span style={{ 
                  background: 'var(--secondary-container)',
                  color: 'var(--on-secondary-container)',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  textTransform: 'capitalize'
                }}>
                  {emp.role}
                </span>
              </div>
              <div className="card-content">
                <div style={{ marginBottom: 'var(--space-sm)' }}>
                  <strong>📧 Email:</strong><br />
                  <a href={`mailto:${emp.email}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                    {emp.email}
                  </a>
                </div>
                <div style={{ marginBottom: 'var(--space-sm)' }}>
                  <strong>🏢 Company:</strong><br />
                  {emp.company_name || getCompanyName(emp.company_id)}
                </div>
                <div style={{ marginBottom: 'var(--space-sm)' }}>
                  <strong>👔 Manager:</strong><br />
                  {emp.manager_name ? (
                    <span style={{ color: 'var(--primary)' }}>
                      {emp.manager_name}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>
                      No Manager (Top Level)
                    </span>
                  )}
                </div>
                <div style={{ marginBottom: 'var(--space-sm)' }}>
                  <strong>🔑 Auth Code:</strong><br />
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 'var(--space-xs)',
                    marginTop: '4px'
                  }}>
                    <span style={{ 
                      fontFamily: 'monospace',
                      fontSize: '1rem',
                      fontWeight: 'bold',
                      background: 'var(--primary-container)',
                      color: 'var(--on-primary-container)',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-xs)',
                      letterSpacing: '1px'
                    }}>
                      {authCodes[emp.id] || emp.auth_code || 'Loading...'}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => copyAuthCode(authCodes[emp.id] || emp.auth_code)}
                      title="Copy auth code"
                      style={{ fontSize: '0.75rem' }}
                    >
                      📋
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => regenerateAuthCode(emp.id)}
                      disabled={loadingAuthCode[emp.id]}
                      title="Regenerate auth code"
                      style={{ fontSize: '0.75rem' }}
                    >
                      {loadingAuthCode[emp.id] ? '⏳' : '🔄'}
                    </button>
                  </div>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: 'var(--on-surface-variant)',
                    marginTop: '4px'
                  }}>
                    Share this code with the employee for survey access
                  </div>
                </div>
              </div>
              <div className="card-actions">
                <button className="btn btn-outline btn-sm" onClick={() => handleEdit(emp)}>
                  ✏️ Edit
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(emp.id)}>
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
