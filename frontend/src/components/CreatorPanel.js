import React from 'react';
import axios from 'axios';
import SurveyCreator from './SurveyCreator';
import EmployeeManager from './EmployeeManager';
import '../App.css';

const API = 'http://localhost:5000/api';

function CategoryList({ token, onSelect, refreshKey }) {
  const [items, setItems] = React.useState([]);
  const [name, setName] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setLoading(true);
    axios.get(`${API}/categories`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setItems(res.data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [token, refreshKey]);

  const add = async () => {
    if (!name.trim()) return;
    try {
      await axios.post(`${API}/categories`, { name }, { headers: { Authorization: `Bearer ${token}` } });
      setName('');
      onSelect(null, true);
    } catch (error) {
      console.error('Failed to add category:', error);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">📂 Categories</h3>
        <span style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
          {items.length} total
        </span>
      </div>
      
      {loading ? (
        <div className="loading" style={{ padding: 'var(--space-md)' }}>Loading...</div>
      ) : (
        <div style={{ marginBottom: 'var(--space-md)' }}>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-lg)', color: 'var(--on-surface-variant)' }}>
              No categories yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
              {items.map(c => (
                <button 
                  key={c.id}
                  className="btn btn-outline"
                  onClick={() => onSelect(c)}
                  style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                >
                  📁 {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      
      <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: 'var(--space-md)' }}>
        <div className="form-field">
          <input 
            placeholder="New category name" 
            value={name} 
            onChange={e => setName(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && add()}
          />
        </div>
        <button className="btn btn-primary btn-sm" onClick={add} disabled={!name.trim()}>
          ➕ Add Category
        </button>
      </div>
    </div>
  );
}

function QuestionList({ token, category, onSelectQuestion, onRefreshCategories, refreshKey }) {
  const [items, setItems] = React.useState([]);
  const [text, setText] = React.useState('');
  const [type, setType] = React.useState('mcq');
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!category) { setItems([]); return; }
    setLoading(true);
    axios.get(`${API}/questions?category_id=${category.id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setItems(res.data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [token, category, refreshKey]);

  const add = async () => {
    if (!category || !text.trim()) return;
    const payload = { category_id: category.id, text, type };
    if (type === 'mcq') {
      payload.options = [
        { text: 'Option 1', description: '' },
        { text: 'Option 2', description: '' },
        { text: 'Option 3', description: '' },
      ];
    }
    try {
      await axios.post(`${API}/questions`, payload, { headers: { Authorization: `Bearer ${token}` } });
      setText('');
      setType('mcq');
      // reload
      const res = await axios.get(`${API}/questions?category_id=${category.id}`, { headers: { Authorization: `Bearer ${token}` } });
      setItems(res.data);
      onRefreshCategories?.();
      // Select last created if valid
      const last = res.data && res.data[res.data.length - 1];
      if (last && typeof last.id === 'number') {
        try {
          const p = onSelectQuestion && onSelectQuestion({ id: last.id });
          if (p && typeof p.catch === 'function') { await p.catch(() => {}); }
        } catch { /* ignore */ }
      }
    } catch (error) {
      console.error('Failed to add question:', error);
    }
  };

  const getQuestionIcon = (type) => type === 'mcq' ? '☑️' : '📝';

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">
          ❓ Questions {category ? `for ${category.name}` : ''}
        </h3>
        {category && (
          <span style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
            {items.length} questions
          </span>
        )}
      </div>
      
      {!category ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-lg)', color: 'var(--on-surface-variant)' }}>
          👈 Select a category to view questions
        </div>
      ) : loading ? (
        <div className="loading" style={{ padding: 'var(--space-md)' }}>Loading questions...</div>
      ) : (
        <>
          <div style={{ marginBottom: 'var(--space-md)' }}>
            {items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-lg)', color: 'var(--on-surface-variant)' }}>
                No questions yet in this category
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                {items.map(q => (
                  <button 
                    key={q.id}
                    className="btn btn-outline"
                    onClick={() => { 
                      const p = onSelectQuestion(q); 
                      if (p && typeof p.catch === 'function') { p.catch(() => {}); } 
                    }}
                    style={{ 
                      justifyContent: 'flex-start', 
                      textAlign: 'left',
                      whiteSpace: 'normal',
                      height: 'auto',
                      padding: 'var(--space-sm)'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '500', marginBottom: '2px' }}>
                        {getQuestionIcon(q.type)} {q.text.substring(0,80)}{q.text.length>80?'...':''}
                      </div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                        Type: {q.type.toUpperCase()}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: 'var(--space-md)' }}>
            <div className="form-field">
              <textarea 
                placeholder="Enter question text..." 
                value={text} 
                onChange={e => setText(e.target.value)}
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>
            <div className="form-field">
              <select value={type} onChange={e => setType(e.target.value)}>
                <option value="mcq">☑️ Multiple Choice</option>
                <option value="text">📝 Free Text</option>
              </select>
            </div>
            <button className="btn btn-primary btn-sm" onClick={add} disabled={!text.trim()}>
              ➕ Add Question
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function OptionsEditor({ token, question, refresh }) {
  const [options, setOptions] = React.useState([]);
  const [newText, setNewText] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(() => {
    if (question?.type !== 'mcq') return;
    setLoading(true);
    axios.get(`${API}/questions/${question.id}/options`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setOptions(res.data))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [token, question]);

  React.useEffect(() => { load(); }, [load, question]);

  const add = async () => {
    if (!newText.trim()) return;
    try {
      await axios.post(`${API}/questions/${question.id}/options`, { text: newText }, { headers: { Authorization: `Bearer ${token}` } });
      setNewText('');
      load();
      refresh?.();
    } catch (error) {
      console.error('Failed to add option:', error);
    }
  };

  const save = async (opt) => {
    try {
      await axios.put(`${API}/options/${opt.id}`, { text: opt.text, description: opt.description, position: opt.position }, { headers: { Authorization: `Bearer ${token}` } });
      load();
    } catch (error) {
      console.error('Failed to save option:', error);
    }
  };

  const del = async (id) => {
    try {
      await axios.delete(`${API}/options/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      load();
      refresh?.();
    } catch (error) {
      console.error('Failed to delete option:', error);
    }
  };

  if (question?.type !== 'mcq') return null;

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">⚙️ Answer Options</h4>
        <span style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
          {options.length} options
        </span>
      </div>
      
      {loading ? (
        <div className="loading" style={{ padding: 'var(--space-md)' }}>Loading options...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {options.map(o => (
            <div key={o.id} className="card" style={{ margin: 0, background: 'var(--surface-variant)' }}>
              <div className="form-grid" style={{ gridTemplateColumns: '2fr 2fr 80px auto auto' }}>
                <div className="form-field">
                  <label className="form-label">Option Text</label>
                  <input 
                    value={o.text} 
                    onChange={e => setOptions(prev => prev.map(p => p.id===o.id?{...p, text:e.target.value}:p))} 
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">Description</label>
                  <input 
                    placeholder="Optional description" 
                    value={o.description||''} 
                    onChange={e => setOptions(prev => prev.map(p => p.id===o.id?{...p, description:e.target.value}:p))} 
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">Position</label>
                  <input 
                    type="number" 
                    value={o.position||0} 
                    onChange={e => setOptions(prev => prev.map(p => p.id===o.id?{...p, position: parseInt(e.target.value||'0',10)}:p))} 
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">&nbsp;</label>
                  <button className="btn btn-secondary btn-sm" onClick={() => save(o)}>
                    💾 Save
                  </button>
                </div>
                <div className="form-field">
                  <label className="form-label">&nbsp;</label>
                  <button className="btn btn-danger btn-sm" onClick={() => del(o.id)}>
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: 'var(--space-md)' }}>
            <div className="form-field">
              <input 
                placeholder="New option text" 
                value={newText} 
                onChange={e => setNewText(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && add()}
              />
            </div>
            <button className="btn btn-primary btn-sm" onClick={add} disabled={!newText.trim()}>
              ➕ Add Option
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionEditor({ token, question, onUpdate }) {
  const [q, setQ] = React.useState(question);
  const [copyText, setCopyText] = React.useState('');

  React.useEffect(() => setQ(question), [question]);

  if (!q) {
    return (
      <div className="card">
        <div style={{ textAlign: 'center', padding: 'var(--space-2xl)', color: 'var(--on-surface-variant)' }}>
          <h4>📝 Question Editor</h4>
          <p>Select a question from the list to edit it</p>
        </div>
      </div>
    );
  }

  const save = async () => {
    try {
      await axios.put(`${API}/questions/${q.id}`, { text: q.text, category_id: q.category_id, type: q.type }, { headers: { Authorization: `Bearer ${token}` } });
      onUpdate?.(q.id);
    } catch (error) {
      console.error('Failed to save question:', error);
    }
  };

  const copy = async () => {
    try {
      const res = await axios.post(`${API}/questions/${q.id}/copy`, { new_text: copyText || undefined }, { headers: { Authorization: `Bearer ${token}` } });
      setCopyText('');
      onUpdate?.(res.data.id);
    } catch (error) {
      console.error('Failed to copy question:', error);
    }
  };

  const del = async () => {
    if (!window.confirm('Are you sure you want to delete this question?')) return;
    try {
      await axios.delete(`${API}/questions/${q.id}`, { headers: { Authorization: `Bearer ${token}` } });
      // Immediately clear local editor state to avoid any race
      setQ(null);
      onUpdate?.(null);
    } catch (error) {
      console.error('Failed to delete question:', error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">✏️ Edit Question</h3>
          <span style={{ 
            background: q.type === 'mcq' ? 'var(--secondary-container)' : 'var(--primary-container)',
            color: q.type === 'mcq' ? 'var(--on-secondary-container)' : 'var(--on-primary-container)',
            padding: '4px 8px',
            borderRadius: 'var(--radius-xs)',
            fontSize: '0.75rem',
            fontWeight: '500'
          }}>
            {q.type === 'mcq' ? '☑️ MCQ' : '📝 TEXT'}
          </span>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div className="form-field">
            <label className="form-label">Question Text</label>
            <textarea 
              value={q.text} 
              onChange={e => setQ(prev => ({ ...prev, text: e.target.value }))} 
              rows={4}
              style={{ resize: 'vertical' }}
            />
          </div>
          
          <div className="form-field">
            <label className="form-label">Question Type</label>
            <select value={q.type} onChange={e => setQ(prev => ({ ...prev, type: e.target.value }))}>
              <option value="mcq">☑️ Multiple Choice</option>
              <option value="text">📝 Free Text</option>
            </select>
          </div>
          
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button className="btn btn-primary" onClick={save}>
              💾 Save Changes
            </button>
            <button className="btn btn-danger" onClick={del}>
              🗑️ Delete Question
            </button>
          </div>
        </div>
      </div>
      
      <div className="card">
        <div className="card-header">
          <h4 className="card-title">📋 Copy Question</h4>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div className="form-field">
            <label className="form-label">New Question Text (optional)</label>
            <input 
              placeholder="Leave empty to copy with same text" 
              value={copyText} 
              onChange={e => setCopyText(e.target.value)} 
            />
          </div>
          <button className="btn btn-secondary" onClick={copy}>
            📋 Create Copy
          </button>
        </div>
      </div>
      
      <OptionsEditor token={token} question={q} refresh={onUpdate} />
    </div>
  );
}

export default function CreatorPanel({ token }) {
  const [tab, setTab] = React.useState('surveys');
  const [cat, setCat] = React.useState(null);
  const [q, setQ] = React.useState(null);
  const [refreshCats, setRefreshCats] = React.useState(0);
  const [refreshQuestions, setRefreshQuestions] = React.useState(0);

  const reloadCats = () => setRefreshCats(x => x + 1);

  const handleSelectCategory = (c, triggerReload) => {
    if (triggerReload) reloadCats();
    setCat(c);
    setQ(null);
  };

  const handleSelectQuestion = async (questionOrId) => {
    if (!questionOrId) { setQ(null); return; }
    const id = typeof questionOrId === 'object' ? questionOrId.id : questionOrId;
    if (!id || isNaN(Number(id))) { setQ(null); return; }
    try {
      const res = await axios.get(`${API}/questions/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setQ(res.data);
    } catch (e) {
      // If question was deleted or not found, clear selection gracefully.
      setQ(null);
    }
  };

  const handleQuestionUpdated = (maybeId) => {
    // Bump list refresh and keep selection in sync.
    setRefreshQuestions(x => x + 1);
    if (typeof maybeId === 'number') {
      const p = handleSelectQuestion(maybeId);
      if (p && typeof p.catch === 'function') { p.catch(() => {}); }
    } else {
      // For delete or unknown, clear selection.
      setQ(null);
    }
  };

  return (
    <div className="app-container">
      <div className="page-header">
        <h1 className="page-title">📝 Creator Dashboard</h1>
        <p className="page-subtitle">Create surveys and manage question bank</p>
      </div>
      
      <div className="tab-container">
        <div className="tab-list">
          <button 
            className={`tab-button ${tab === 'surveys' ? 'active' : ''}`}
            onClick={() => setTab('surveys')}
          >
            📋 Survey Creator
          </button>
          <button 
            className={`tab-button ${tab === 'questions' ? 'active' : ''}`}
            onClick={() => setTab('questions')}
          >
            ❓ Question Bank
          </button>
          <button 
            className={`tab-button ${tab === 'participants' ? 'active' : ''}`}
            onClick={() => setTab('participants')}
          >
            👥 Participants
          </button>
        </div>

        {tab === 'surveys' && <SurveyCreator token={token} />}
        {tab === 'participants' && (
          <div>
            <div className="page-header">
              <h2 className="page-title">👥 Participants</h2>
              <p className="page-subtitle">Add and manage participants (employees) for surveys</p>
            </div>
            <EmployeeManager token={token} />
          </div>
        )}
        
        {tab === 'questions' && (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '300px 350px 1fr', 
            gap: 'var(--space-lg)',
            alignItems: 'start'
          }}>
            <CategoryList 
              token={token} 
              onSelect={handleSelectCategory} 
              refreshKey={refreshCats} 
            />
            <QuestionList 
              token={token} 
              category={cat} 
              onSelectQuestion={handleSelectQuestion} 
              onRefreshCategories={reloadCats} 
              refreshKey={refreshQuestions} 
            />
            <QuestionEditor 
              token={token} 
              question={q} 
              onUpdate={handleQuestionUpdated} 
            />
          </div>
        )}
      </div>
    </div>
  );
}
