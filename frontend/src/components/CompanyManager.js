import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../App.css';

const API = 'http://localhost:5000/api';

export default function CompanyManager({ token }) {
  const [companies, setCompanies] = useState([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchCompanies = () => {
    setLoading(true);
    setError('');
    axios.get(`${API}/companies`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setCompanies(res.data))
      .catch(() => setError('Failed to load companies.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCompanies(); }, [token]);

  const handleAdd = e => {
    e.preventDefault();
    setError('');
    axios.post(`${API}/companies`, { name, address, contact_email: contactEmail }, { headers: { Authorization: `Bearer ${token}` } })
      .then(() => { setName(''); setAddress(''); setContactEmail(''); fetchCompanies(); })
      .catch(() => setError('Failed to add company.'));
  };

  const handleEdit = c => {
    setEditing(c);
    setName(c.name || '');
    setAddress(c.address || '');
    setContactEmail(c.contact_email || '');
  };

  const handleUpdate = e => {
    e.preventDefault();
    setError('');
    axios.put(`${API}/companies/${editing.id}`, { name, address, contact_email: contactEmail }, { headers: { Authorization: `Bearer ${token}` } })
      .then(() => { setEditing(null); setName(''); setAddress(''); setContactEmail(''); fetchCompanies(); })
      .catch(() => setError('Failed to update company.'));
  };

  const handleDelete = id => {
    if (!window.confirm('Delete this company?')) return;
    setError('');
    axios.delete(`${API}/companies/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(fetchCompanies)
      .catch(() => setError('Failed to delete company.'));
  };

  const clearForm = () => {
    setEditing(null);
    setName('');
    setAddress('');
    setContactEmail('');
  };

  if (loading) return <div className="loading">Loading companies...</div>;

  return (
    <div>
      <div className="form-container">
        <h3 className="form-title">
          {editing ? '✏️ Edit Company' : '➕ Add New Company'}
        </h3>
        <form onSubmit={editing ? handleUpdate : handleAdd}>
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">Company Name</label>
              <input 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="Enter company name" 
                required 
              />
            </div>
            <div className="form-field">
              <label className="form-label">Address</label>
              <input 
                value={address} 
                onChange={e => setAddress(e.target.value)} 
                placeholder="Enter company address" 
                required 
              />
            </div>
            <div className="form-field">
              <label className="form-label">Contact Email</label>
              <input 
                value={contactEmail} 
                onChange={e => setContactEmail(e.target.value)} 
                placeholder="Enter contact email" 
                required 
                type="email" 
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button type="submit" className="btn btn-primary">
              {editing ? '💾 Update Company' : '➕ Add Company'}
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
        <h3 className="page-title">Companies ({companies.length})</h3>
        <p className="page-subtitle">Manage your organization's companies</p>
      </div>

      {companies.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
          <h4 style={{ color: 'var(--on-surface-variant)', margin: '0 0 var(--space-sm) 0' }}>
            🏢 No companies found
          </h4>
          <p style={{ color: 'var(--on-surface-variant)', margin: 0 }}>
            Add your first company using the form above
          </p>
        </div>
      ) : (
        <div className="card-grid">
          {companies.map(c => (
            <div className="card" key={c.id}>
              <div className="card-header">
                <div>
                  <h3 className="card-title">🏢 {c.name}</h3>
                  <p className="card-subtitle">
                    Added {new Date(c.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="card-content">
                <div style={{ marginBottom: 'var(--space-sm)' }}>
                  <strong>📍 Address:</strong><br />
                  {c.address}
                </div>
                <div>
                  <strong>📧 Contact:</strong><br />
                  <a href={`mailto:${c.contact_email}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                    {c.contact_email}
                  </a>
                </div>
              </div>
              <div className="card-actions">
                <button className="btn btn-outline btn-sm" onClick={() => handleEdit(c)}>
                  ✏️ Edit
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>
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
